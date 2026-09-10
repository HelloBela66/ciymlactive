import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { ShelfRepository } from '@/data/repositories/ShelfRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import type { Shelf, ShelfThemeId, ShelfWithCount } from '@/types/shelf';
import type { UserBookWithDetails } from '@/types/userBook';

const log = createLogger('features/library/shelves');

export function useShelves() {
  return useQuery<ShelfWithCount[]>({
    queryKey: queryKeys.shelves.all,
    queryFn: async () => {
      const db = await getDatabase();
      return ShelfRepository.listAll(db);
    },
  });
}

export function useShelfBooks(shelfId: string | undefined) {
  return useQuery<UserBookWithDetails[]>({
    queryKey: queryKeys.shelves.detail(shelfId ?? ''),
    queryFn: async () => {
      if (!shelfId) return [];
      const db = await getDatabase();
      return ShelfRepository.listBooksByShelf(db, shelfId);
    },
    enabled: !!shelfId,
  });
}

/** Полиці, на яких уже лежить конкретна книга — для чекбоксів у Book Details. */
export function useShelfIdsForUserBook(userBookId: string | undefined) {
  return useQuery<string[]>({
    queryKey: queryKeys.shelves.forUserBook(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return [];
      const db = await getDatabase();
      return ShelfRepository.listShelfIdsForUserBook(db, userBookId);
    },
    enabled: !!userBookId,
  });
}

export function useCreateShelf() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося створити полицю.');
  // `theme?` (Milestone 11, доповнення8) — опційний: коли не передано, `ShelfRepository.create`
  // сам підставляє нейтральний дефолт (`DEFAULT_SHELF_THEME`), тож виклики з інших фіч (Goodreads
  // імпорт, `findOrCreateByName`) і надалі не мусять знати про теми взагалі.
  return useMutation<Shelf, Error, { name: string; description?: string | null; theme?: ShelfThemeId }>({
    mutationFn: async ({ name, description, theme }) => {
      const db = await getDatabase();
      return ShelfRepository.create(db, name, description, theme);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shelves.all });
    },
    onError,
  });
}

/** Видаляє полицю повністю (Milestone 8.4). Книги, які на ній були, лишаються в бібліотеці
 * без змін — видаляється лише сама полиця й зв'язки "книга-полиця" (`ShelfRepository.remove`,
 * каскадно на рівні схеми). */
export function useDeleteShelf() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося видалити полицю.');
  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const db = await getDatabase();
      await ShelfRepository.remove(db, id);
    },
    onSuccess: (_data, variables) => {
      // `shelves.all` — префікс: інвалідовує заразом і `shelves.forUserBook(...)` для всіх
      // книг, що були на цій полиці (той самий принцип часткового збігу ключів, що й у
      // Milestone 8.3, `queryKeys.providerSearch.sharedCatalogAll`), тож окремо гнатись за
      // кожним userBookId не потрібно.
      queryClient.invalidateQueries({ queryKey: queryKeys.shelves.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.shelves.detail(variables.id) });
    },
    onError,
  });
}

/** Перемикає книгу на полиці (додає, якщо немає, прибирає, якщо вже там). */
export function useToggleShelfBook() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося оновити полицю.');
  return useMutation<void, Error, { shelfId: string; userBookId: string; isOnShelf: boolean }>({
    mutationFn: async ({ shelfId, userBookId, isOnShelf }) => {
      const db = await getDatabase();
      if (isOnShelf) {
        await ShelfRepository.removeBook(db, shelfId, userBookId);
      } else {
        await ShelfRepository.addBook(db, shelfId, userBookId);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shelves.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.shelves.detail(variables.shelfId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.shelves.forUserBook(variables.userBookId) });
    },
    onError,
  });
}
