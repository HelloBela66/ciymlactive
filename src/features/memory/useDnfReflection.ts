import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { DnfReflectionRepository } from '@/data/repositories/DnfReflectionRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import { normalizeDnfNote } from '@/lib/dnfReflection';
import type { DnfReflection } from '@/types/dnfReflection';

const log = createLogger('features/memory/dnfReflection');

/** DNF IMPROVEMENT (POLYTSIA V1.6, Фаза 12) — знімок "Не дочитав" ЦІЄЇ книги, якщо він уже
 * зафіксований (`DnfReflectionRepository.captureIfMissing`, викликається з
 * `useUpdateUserBookStatus` автоматично при переході статусу). */
export function useDnfReflection(userBookId: string | undefined) {
  return useQuery<DnfReflection | null>({
    queryKey: queryKeys.dnfReflection.byUserBook(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return null;
      const db = await getDatabase();
      return DnfReflectionRepository.getByUserBookId(db, userBookId);
    },
    enabled: !!userBookId,
  });
}

export interface SaveDnfReflectionDetailsInput {
  userBookId: string;
  reason: string | null;
  note: string | null;
}

/** Редагування причини/нотатки вже зафіксованого знімка (сторінка/дата не змінюються тут —
 * `DnfReflectionRepository.updateDetails`). Порожнє поле — ок (ТЗ: "optional reason"/"Optional
 * free text"), навмисно жодної валідації "хоча б одне заповнено" (на відміну від
 * `useSavePreReadingReflection`) — DNF-нотатка й так уже існує (з зафіксованою сторінкою), тому
 * "порожнє збереження" не створює порожній рядок, лише очищає причину/нотатку, якщо користувач
 * сам це попросив. */
export function useSaveDnfReflectionDetails() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося зберегти нотатку про DNF.');
  return useMutation<DnfReflection | null, Error, SaveDnfReflectionDetailsInput>({
    mutationFn: async (input) => {
      const db = await getDatabase();
      return DnfReflectionRepository.updateDetails(db, input.userBookId, {
        reason: input.reason,
        note: normalizeDnfNote(input.note),
      });
    },
    onSuccess: (reflection, variables) => {
      if (reflection) {
        queryClient.setQueryData(queryKeys.dnfReflection.byUserBook(variables.userBookId), reflection);
      }
    },
    onError,
  });
}
