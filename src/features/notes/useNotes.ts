import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { NoteRepository } from '@/data/repositories/NoteRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import { invalidateJournal } from '@/lib/journalInvalidation';
import { triggerLightHapticFeedback } from '@/lib/haptics';
import type { CreateNoteInput, Note } from '@/types/note';

const log = createLogger('features/notes');

export function useNotes(userBookId: string | undefined) {
  return useQuery<Note[]>({
    queryKey: queryKeys.notes.byUserBook(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return [];
      const db = await getDatabase();
      return NoteRepository.listByUserBookId(db, userBookId);
    },
    enabled: !!userBookId,
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося зберегти нотатку. Спробуй ще раз.');
  return useMutation<Note, Error, CreateNoteInput>({
    mutationFn: async (input) => {
      const db = await getDatabase();
      return NoteRepository.create(db, input);
    },
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.byUserBook(note.userBookId) });
      // Milestone 11 (Мій щоденник) — note лишається окремим репозиторієм/хуком, але
      // читається і через union-шар `JournalRepository`; без цього глобальна стрічка/бейдж
      // (і, коли є `sessionId`, список "записи цієї сесії" на екрані читання) лишались би
      // застарілими до спливання власного staleTime.
      invalidateJournal(queryClient, note.userBookId, note.sessionId);
      // ТЗ Фази 19 (DESIGN SYSTEM EXTENSION, §HAPTICS) — "save journal".
      triggerLightHapticFeedback();
    },
    onError,
  });
}

export function useRemoveNote() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося видалити нотатку.');
  return useMutation<void, Error, { id: string; userBookId: string; sessionId?: string | null }>({
    mutationFn: async ({ id }) => {
      const db = await getDatabase();
      await NoteRepository.remove(db, id);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.byUserBook(variables.userBookId) });
      invalidateJournal(queryClient, variables.userBookId, variables.sessionId);
    },
    onError,
  });
}
