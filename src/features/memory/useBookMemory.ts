import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { BookMemoryRepository } from '@/data/repositories/BookMemoryRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import type { BookMemory, BookMemoryEntryRef, MemoryCardTemplateId } from '@/types/bookMemory';

const log = createLogger('features/memory');

/** «Спогад про книгу» цієї книги, якщо він уже створений — екран підсумку читання
 * (Milestone 11, Фаза 7, `app/completion/[workId].tsx`). */
export function useBookMemory(userBookId: string | undefined) {
  return useQuery<BookMemory | null>({
    queryKey: queryKeys.bookMemory.byUserBook(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return null;
      const db = await getDatabase();
      return BookMemoryRepository.getByUserBookId(db, userBookId);
    },
    enabled: !!userBookId,
  });
}

// `setQueryData` напряму, а не `invalidateQueries` (як у сусідньому `useRating.ts`) — той
// самий вибір, що й у `useSaveJournalDraft`: `upsert`/`remove` тут повертають повний
// канонічний об'єкт (або відомо, що результат — `null`), і жодного іншого запиту (на кшталт
// `wrapped`, який `rating` мусить змивати) спогад поки не живить, тож зайва інвалідизація
// нічого не додала б, лише зайвий запит до SQLite одразу після щойно отриманих даних.
export function useSetBookMemory() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося зберегти спогад.');
  return useMutation<
    BookMemory,
    Error,
    { userBookId: string; reflection: string | null; entryRefs: BookMemoryEntryRef[]; templateId: MemoryCardTemplateId }
  >({
    mutationFn: async (params) => {
      const db = await getDatabase();
      return BookMemoryRepository.upsert(db, params);
    },
    onSuccess: (memory) => {
      queryClient.setQueryData(queryKeys.bookMemory.byUserBook(memory.userBookId), memory);
    },
    onError,
  });
}

/** Повністю прибрати спогад (не лише очистити текст) — окрема дія в редакторі спогаду. */
export function useRemoveBookMemory() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося видалити спогад.');
  return useMutation<void, Error, { id: string; userBookId: string }>({
    mutationFn: async ({ id }) => {
      const db = await getDatabase();
      await BookMemoryRepository.remove(db, id);
    },
    onSuccess: (_data, variables) => {
      queryClient.setQueryData(queryKeys.bookMemory.byUserBook(variables.userBookId), null);
    },
    onError,
  });
}
