import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { CapsuleRecallRepository } from '@/data/repositories/CapsuleRecallRepository';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import { normalizeRecallText } from '@/lib/recall';
import { queryKeys } from '@/lib/queryKeys';
import type { CapsuleRecall } from '@/types/capsuleRecall';

const log = createLogger('features/memory/capsuleRecall');

/**
 * «Книга через час» — POLYTSIA V1.6, Фаза 5 ТЗ: записує одну "спробу згадати" (п.4-5 ТЗ)
 * перед тим, як екран Recall (`app/recall/[workId].tsx`) відкриває старі відповіді.
 *
 * Фаза 13 (Book Memory ungating + consolidation) додала ПЕРШИЙ читач історії recall-спроб
 * (`useCapsuleRecallHistory` нижче — розділ "Пригадування" на Book Memory), тож ця мутація
 * тепер інвалідовує саме той ключ — до Фази 13 жоден екран не читав `capsule_recall` окремим
 * запитом, тож інвалідації тут не було.
 */
export function useCreateCapsuleRecall() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося зберегти спробу згадати книгу.');
  return useMutation<CapsuleRecall, Error, { bookCapsuleId: string; currentMemoryText: string | null }>({
    mutationFn: async ({ bookCapsuleId, currentMemoryText }) => {
      const db = await getDatabase();
      return CapsuleRecallRepository.create(db, {
        bookCapsuleId,
        currentMemoryText: normalizeRecallText(currentMemoryText),
      });
    },
    onSuccess: (recall) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.capsuleRecall.byBookCapsule(recall.bookCapsuleId) });
    },
    onError,
  });
}

/** Історія "спроб згадати" конкретну капсулу, найновіша перша — Фаза 13, розділ "Пригадування"
 * на Book Memory (`app/memory/[workId].tsx`). `bookCapsuleId` (НЕ `userBookId`) — recall-спроба
 * прив'язана до КОНКРЕТНОЇ капсули (кожен `reading_run` МОЖЕ мати власну капсулу, Фаза 10),
 * тож історія природно теж по капсулі, а не по книзі взагалі. */
export function useCapsuleRecallHistory(bookCapsuleId: string | undefined) {
  return useQuery<CapsuleRecall[]>({
    queryKey: queryKeys.capsuleRecall.byBookCapsule(bookCapsuleId ?? ''),
    queryFn: async () => {
      if (!bookCapsuleId) return [];
      const db = await getDatabase();
      return CapsuleRecallRepository.listByBookCapsuleId(db, bookCapsuleId);
    },
    enabled: !!bookCapsuleId,
  });
}
