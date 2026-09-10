import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { TagRepository } from '@/data/repositories/TagRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import type { Tag } from '@/types/tag';

const log = createLogger('features/book-details/tags');

export function useTagsForWork(workId: string | undefined) {
  return useQuery<Tag[]>({
    queryKey: queryKeys.tags.byWork(workId ?? ''),
    queryFn: async () => {
      if (!workId) return [];
      const db = await getDatabase();
      return TagRepository.listByWorkId(db, workId);
    },
    enabled: !!workId,
  });
}

/** Створює тег за назвою (знаходить наявний з такою ж назвою, якщо є) і одразу прив'язує до
 * книги — для форми "+ Додати тег" на Book Details. */
export function useAddTagToWork() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося додати тег.');
  return useMutation<Tag, Error, { workId: string; name: string }>({
    mutationFn: async ({ workId, name }) => {
      const db = await getDatabase();
      const tag = await TagRepository.findOrCreateByName(db, name);
      await TagRepository.addToWork(db, workId, tag.id);
      return tag;
    },
    onSuccess: (_tag, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.byWork(variables.workId) });
    },
    onError,
  });
}

export function useRemoveTagFromWork() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося прибрати тег.');
  return useMutation<void, Error, { workId: string; tagId: string }>({
    mutationFn: async ({ workId, tagId }) => {
      const db = await getDatabase();
      await TagRepository.removeFromWork(db, workId, tagId);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.byWork(variables.workId) });
    },
    onError,
  });
}
