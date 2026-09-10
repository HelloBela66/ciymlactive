import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { RatingRepository } from '@/data/repositories/RatingRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import type { Rating } from '@/types/rating';

const log = createLogger('features/book-details/rating');

export function useRating(userBookId: string | undefined) {
  return useQuery<Rating | null>({
    queryKey: queryKeys.ratings.byUserBook(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return null;
      const db = await getDatabase();
      return RatingRepository.getByUserBookId(db, userBookId);
    },
    enabled: !!userBookId,
  });
}

export function useSetRating() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося зберегти оцінку.');
  return useMutation<Rating, Error, { userBookId: string; value: number; review?: string | null }>({
    mutationFn: async (params) => {
      const db = await getDatabase();
      return RatingRepository.upsert(db, params);
    },
    onSuccess: (rating) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ratings.byUserBook(rating.userBookId) });
      // Wrapped (Milestone 10 fix6, `docs/STATUS_V1.md` п. 3.4) — "найкраще оцінена книга
      // року" рахується саме з оцінок, тож без цього рядка щойно поставлена/змінена оцінка не
      // з'являлась би там одразу.
      queryClient.invalidateQueries({ queryKey: ['wrapped'] });
    },
    onError,
  });
}

/** Прибрати оцінку повністю (Milestone 8.4) — `RatingRepository.remove` існував з самого
 * початку (п.23 ТЗ), але до цього не мав хука: `StarRating` дає мінімум 0.5 зірки, тож
 * "поставити 0" ніколи не було способом повністю зняти оцінку — лише окрема дія видалення. */
export function useRemoveRating() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося прибрати оцінку.');
  return useMutation<void, Error, { id: string; userBookId: string }>({
    mutationFn: async ({ id }) => {
      const db = await getDatabase();
      await RatingRepository.remove(db, id);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ratings.byUserBook(variables.userBookId) });
      queryClient.invalidateQueries({ queryKey: ['wrapped'] });
    },
    onError,
  });
}
