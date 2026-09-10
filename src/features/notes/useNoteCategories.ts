import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { NoteCategoryRepository } from '@/data/repositories/NoteCategoryRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import { invalidateJournal } from '@/lib/journalInvalidation';
import type { NoteCategory } from '@/types/noteCategory';

const log = createLogger('features/notes/categories');

function invalidate(queryClient: ReturnType<typeof useQueryClient>, userBookId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.noteCategories.active(userBookId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.noteCategories.all(userBookId) });
}

/** Активні категорії — для чипів вибору при створенні нової нотатки (`NoteCategoryPicker`). */
export function useActiveNoteCategories(userBookId: string | undefined) {
  return useQuery<NoteCategory[]>({
    queryKey: queryKeys.noteCategories.active(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return [];
      const db = await getDatabase();
      return NoteCategoryRepository.listActiveByUserBookId(db, userBookId);
    },
    enabled: !!userBookId,
  });
}

/** Усі категорії, включно з м'яко видаленими — для резолву назви на вже існуючих нотатках
 * (`resolveEntryTypeLabel`), щоб стара нотатка не показувала порожню/помилкову мітку після
 * того, як користувач прибрав категорію з активного списку. */
export function useAllNoteCategories(userBookId: string | undefined) {
  return useQuery<NoteCategory[]>({
    queryKey: queryKeys.noteCategories.all(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return [];
      const db = await getDatabase();
      return NoteCategoryRepository.listAllByUserBookId(db, userBookId);
    },
    enabled: !!userBookId,
  });
}

export function useCreateNoteCategory() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося створити категорію.');
  return useMutation<NoteCategory, Error, { userBookId: string; label: string }>({
    mutationFn: async ({ userBookId, label }) => {
      const db = await getDatabase();
      return NoteCategoryRepository.create(db, userBookId, label);
    },
    onSuccess: (category) => invalidate(queryClient, category.userBookId),
    onError,
  });
}

export function useRenameNoteCategory() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося перейменувати категорію.');
  return useMutation<void, Error, { id: string; userBookId: string; label: string }>({
    mutationFn: async ({ id, label }) => {
      const db = await getDatabase();
      await NoteCategoryRepository.rename(db, id, label);
    },
    // `invalidateJournal` тут теж потрібен (на відміну від create/delete): глобальна стрічка
    // "Мій щоденник" (`app/journal/index.tsx`) резолвить мітку категорії НЕ клієнтським
    // `resolveEntryTypeLabel`, а вже готовим `categoryLabel` з SQL-джойну на момент запиту
    // (`JournalRepository.listFeedPage`) — тож стара назва лишилась би в кеші стрічки до
    // природного spliceу staleTime без явної інвалідації саме тут.
    onSuccess: (_data, variables) => {
      invalidate(queryClient, variables.userBookId);
      invalidateJournal(queryClient, variables.userBookId);
    },
    onError,
  });
}

export function useDeleteNoteCategory() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося видалити категорію.');
  return useMutation<void, Error, { id: string; userBookId: string }>({
    mutationFn: async ({ id }) => {
      const db = await getDatabase();
      await NoteCategoryRepository.remove(db, id);
    },
    onSuccess: (_data, variables) => invalidate(queryClient, variables.userBookId),
    onError,
  });
}
