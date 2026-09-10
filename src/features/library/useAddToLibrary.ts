import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { EditionRepository } from '@/data/repositories/EditionRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import { markAddedInSharedCatalog } from '@/data/remote/catalogSync';
import type { UserBook, UserBookStatus } from '@/types/userBook';

const log = createLogger('features/library/addToLibrary');

interface AddToLibraryInput {
  editionId: string;
  status: UserBookStatus;
}

/**
 * Додає видання до бібліотеки користувача (Book Details → "Додати до бібліотеки").
 *
 * Заодно (фонове, fire-and-forget) позначає книгу як "додану" в спільному каталозі
 * (Milestone 8.2, `src/data/remote/catalogSync.ts`) — саме ця анонімна позначка визначає, які
 * книги показуються першими в результатах пошуку інших користувачів. `EditionRepository.getById`
 * тут — за вже відкритим `db`, а не через окремий React Query запит: це побічна дія одного
 * мутатора, не потребує власного loading/error стану в UI.
 */
export function useAddToLibrary() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося додати книгу до бібліотеки.');

  return useMutation<UserBook, Error, AddToLibraryInput>({
    mutationFn: async ({ editionId, status }) => {
      const db = await getDatabase();
      const userBook = await UserBookRepository.addToLibrary(db, editionId, status);

      const edition = await EditionRepository.getById(db, editionId);
      if (edition) {
        // Fire-and-forget, але з ланцюжком інвалідації кеша пошуку ПІСЛЯ завершення
        // (Milestone 8.3) — той самий підхід, що й у `useCreateBookDraft.ts`: скидати кеш
        // до того, як позначка справді дійшла до Supabase, немає сенсу. Разом з нею —
        // `trends.top` (аудит M11, п.6.7): ця сама позначка (`catalog_book_device`) і є тим,
        // що рахує `catalog_top_books`, тож без цієї інвалідації «Тренди» показували застарілий
        // рахунок до природного `staleTime`, навіть коли користувач щойно сам додав книгу
        // з топ-10.
        void markAddedInSharedCatalog({ isbn13: edition.isbn13, isbn10: edition.isbn10 })
          .then(() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.providerSearch.sharedCatalogAll });
            queryClient.invalidateQueries({ queryKey: queryKeys.trends.top });
          })
          .catch(() => {});
      }

      return userBook;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.userBooks.all });
      // Book Details тримає власний UserBook-снепшот у своєму query — інвалідуємо і його.
      queryClient.invalidateQueries({ queryKey: queryKeys.works.all });
    },
    onError,
  });
}
