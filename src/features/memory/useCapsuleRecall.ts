import { useMutation } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { CapsuleRecallRepository } from '@/data/repositories/CapsuleRecallRepository';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import { normalizeRecallText } from '@/lib/recall';
import type { CapsuleRecall } from '@/types/capsuleRecall';

const log = createLogger('features/memory/capsuleRecall');

/**
 * «Книга через час» — POLYTSIA V1.6, Фаза 5 ТЗ: записує одну "спробу згадати" (п.4-5 ТЗ)
 * перед тим, як екран Recall (`app/recall/[workId].tsx`) відкриває старі відповіді. Без
 * `queryClient.setQueryData`/інвалідації — на відміну від `useBookCapsule.ts`, жоден екран
 * поки не читає історію recall-спроб окремим запитом (`CapsuleRecallRepository.listByBookCapsuleId`
 * готовий для майбутнього UI й тестів, але не використовується жодним хуком читання цієї фази).
 */
export function useCreateCapsuleRecall() {
  const onError = useMutationErrorHandler(log, 'Не вдалося зберегти спробу згадати книгу.');
  return useMutation<CapsuleRecall, Error, { bookCapsuleId: string; currentMemoryText: string | null }>({
    mutationFn: async ({ bookCapsuleId, currentMemoryText }) => {
      const db = await getDatabase();
      return CapsuleRecallRepository.create(db, {
        bookCapsuleId,
        currentMemoryText: normalizeRecallText(currentMemoryText),
      });
    },
    onError,
  });
}
