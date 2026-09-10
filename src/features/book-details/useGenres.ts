import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { GenreRepository } from '@/data/repositories/GenreRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import type { Genre } from '@/types/genre';

const log = createLogger('features/book-details/genres');

/** Увесь куратований+користувацький список жанрів (Milestone 9) — для чипів вибору на Book
 * Details. Короткий і майже не змінюється, тож без пагінації. */
export function useAllGenres() {
  return useQuery<Genre[]>({
    queryKey: queryKeys.genres.all,
    queryFn: async () => {
      const db = await getDatabase();
      return GenreRepository.listAll(db);
    },
  });
}

export function useGenresForWork(workId: string | undefined) {
  return useQuery<Genre[]>({
    queryKey: queryKeys.genres.byWork(workId ?? ''),
    queryFn: async () => {
      if (!workId) return [];
      const db = await getDatabase();
      return GenreRepository.listByWorkId(db, workId);
    },
    enabled: !!workId,
  });
}

/** Перемикає жанр для книги (додає, якщо немає, прибирає, якщо вже є) — той самий підхід,
 * що й `useToggleShelfBook`. */
export function useToggleWorkGenre() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося оновити жанр.');
  return useMutation<void, Error, { workId: string; genreId: string; isLinked: boolean }>({
    mutationFn: async ({ workId, genreId, isLinked }) => {
      const db = await getDatabase();
      await GenreRepository.toggle(db, workId, genreId, isLinked);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.genres.byWork(variables.workId) });
      // Wrapped рахує "топ жанр року" з тих самих зв'язків work_genre.
      queryClient.invalidateQueries({ queryKey: ['wrapped'] });
    },
    onError,
  });
}

/** Додає (за назвою — знайде наявний за той самий `slug` чи створить новий) і одразу
 * прив'язує до книги за одну дію — для інпута "додати свій жанр" на Book Details. */
export function useAddCustomGenre() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося додати жанр.');
  return useMutation<Genre, Error, { workId: string; name: string }>({
    mutationFn: async ({ workId, name }) => {
      const db = await getDatabase();
      const genre = await GenreRepository.findOrCreateByName(db, name);
      await GenreRepository.toggle(db, workId, genre.id, false);
      return genre;
    },
    onSuccess: (_genre, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.genres.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.genres.byWork(variables.workId) });
      queryClient.invalidateQueries({ queryKey: ['wrapped'] });
    },
    onError,
  });
}
