import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { PreReadingReflectionRepository } from '@/data/repositories/PreReadingReflectionRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import { normalizeReflectionText, validatePreReadingReflectionContent } from '@/lib/beforeAfter';
import type { PreReadingReflection } from '@/types/preReadingReflection';

const log = createLogger('features/memory/preReadingReflection');

/** «До/Після» (POLYTSIA V1.6, Фаза 6) — нотатка "До читання" ЦІЄЇ книги, якщо вона вже
 * збережена. Доступна з Book Details (`app/work/[workId].tsx`, поки книга "Читаю") і з
 * Book Memory (`app/memory/[workId].tsx`, для порівняння До/Після). */
export function usePreReadingReflection(userBookId: string | undefined) {
  return useQuery<PreReadingReflection | null>({
    queryKey: queryKeys.preReadingReflection.byUserBook(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return null;
      const db = await getDatabase();
      return PreReadingReflectionRepository.getByUserBookId(db, userBookId);
    },
    enabled: !!userBookId,
  });
}

export interface SavePreReadingReflectionInput {
  userBookId: string;
  reasonText: string | null;
  expectationText: string | null;
  expectedRating: number | null;
}

/** Створення/редагування (upsert, `PreReadingReflectionRepository` — щонайбільше один рядок на
 * книгу): нормалізує текст, валідує (потрібне хоча б одне змістовне поле). */
export function useSavePreReadingReflection() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося зберегти нотатку «До читання».');
  return useMutation<PreReadingReflection, Error, SavePreReadingReflectionInput>({
    mutationFn: async (input) => {
      const reasonText = normalizeReflectionText(input.reasonText);
      const expectationText = normalizeReflectionText(input.expectationText);
      if (
        !validatePreReadingReflectionContent({
          reasonText,
          expectationText,
          expectedRating: input.expectedRating,
        })
      ) {
        throw new Error('Додай хоча б одну деталь — причину, очікування або орієнтовну оцінку.');
      }

      const db = await getDatabase();
      return PreReadingReflectionRepository.upsert(db, {
        userBookId: input.userBookId,
        reasonText,
        expectationText,
        expectedRating: input.expectedRating,
      });
    },
    onSuccess: (reflection) => {
      queryClient.setQueryData(queryKeys.preReadingReflection.byUserBook(reflection.userBookId), reflection);
    },
    onError,
  });
}

/** Видалення (той самий "прибрати повністю" вибір, що й `useRemoveRating`) — книга лишається
 * "Читаю", лише сама нотатка зникає, форма запрошення з'являється знову. */
export function useRemovePreReadingReflection() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося видалити нотатку «До читання».');
  return useMutation<void, Error, { id: string; userBookId: string }>({
    mutationFn: async ({ id }) => {
      const db = await getDatabase();
      await PreReadingReflectionRepository.remove(db, id);
    },
    onSuccess: (_data, variables) => {
      queryClient.setQueryData(queryKeys.preReadingReflection.byUserBook(variables.userBookId), null);
    },
    onError,
  });
}
