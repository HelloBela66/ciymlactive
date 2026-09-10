import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { OwnedBookRepository } from '@/data/repositories/OwnedBookRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import type { OwnedBook, CreateOwnedBookInput } from '@/types/ownedBook';

const log = createLogger('features/owned-library');

/** "Позначити, що книга є в мене фізично" (Book Details, Milestone 2 — мінімальна форма). */
export function useMarkOwned() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, "Не вдалося позначити книгу як «є фізично».");
  return useMutation<OwnedBook, Error, CreateOwnedBookInput>({
    mutationFn: async (input) => {
      const db = await getDatabase();
      return OwnedBookRepository.create(db, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.works.all });
    },
    onError,
  });
}

export function useUnmarkOwned() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося прибрати позначку.');
  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const db = await getDatabase();
      await OwnedBookRepository.remove(db, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.works.all });
    },
    onError,
  });
}
