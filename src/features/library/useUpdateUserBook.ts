import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { EditionRepository } from '@/data/repositories/EditionRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import { markRemovedInSharedCatalog } from '@/data/remote/catalogSync';
import type { UserBookStatus } from '@/types/userBook';

const log = createLogger('features/library/userBook');

/**
 * Мутації зміни книги користувача (статус/улюблене/поточна сторінка). Кожна — окремий хук
 * замість одного "універсального update", щоб виклик у UI був явним про те, що саме
 * змінюється (докладніше — принцип "доменна логіка не протікає в компоненти").
 */
function useInvalidateUserBooks() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.userBooks.all });
    // Book Details тримає власний UserBook-снепшот у своєму query — інвалідуємо і його.
    queryClient.invalidateQueries({ queryKey: queryKeys.works.all });
  };
}

export function useUpdateUserBookStatus() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateUserBooks();
  const onError = useMutationErrorHandler(log, 'Не вдалося оновити статус читання.');
  return useMutation<void, Error, { id: string; status: UserBookStatus }>({
    mutationFn: async ({ id, status }) => {
      const db = await getDatabase();
      await UserBookRepository.updateStatus(db, id, status);
    },
    onSuccess: () => {
      invalidate();
      // Пряма зміна статусу (Milestone 10 fix6, `docs/STATUS_V1.md` п. 3.4) — на відміну від
      // завершення сесії читання (`useFinishSession`, `useSessionMutations.ts`), тут немає
      // окремого запису reading_session, за яким статистика/цілі/Wrapped рахувались би
      // автоматично, але сам статус УЖЕ змінився (найчастіший приклад — додавання вже
      // прочитаної раніше книги одразу зі статусом "прочитано"), а статистика/цілі/Wrapped
      // рахуються саме зі статусів user_book, тож без інвалідації тут вони показували б
      // застарілі дані, доки власний `staleTime` не спливе сам. Інвалідуємо для будь-якої
      // зміни статусу, не лише "прочитано" — дешевша й надійніша умова, ніж перелічувати
      // статуси, що НЕ впливають на ці розрахунки.
      queryClient.invalidateQueries({ queryKey: queryKeys.statistics.overall });
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.all });
      queryClient.invalidateQueries({ queryKey: ['wrapped'] });
    },
    onError,
  });
}

export function useToggleFavorite() {
  const invalidate = useInvalidateUserBooks();
  const onError = useMutationErrorHandler(log, "Не вдалося оновити позначку «улюблене».");
  return useMutation<void, Error, { id: string; isFavorite: boolean }>({
    mutationFn: async ({ id, isFavorite }) => {
      const db = await getDatabase();
      await UserBookRepository.setFavorite(db, id, isFavorite);
    },
    onSuccess: invalidate,
    onError,
  });
}

/** Milestone 11 (Фаза 3) — тепер реально викликається: композер швидкого запису на екрані
 * активної сесії (`app/session/[sessionId].tsx`) оновлює поточну сторінку заодно зі
 * збереженням запису щоденника (якщо введена сторінка більша за вже відому). */
export function useUpdateCurrentPage() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateUserBooks();
  const onError = useMutationErrorHandler(log, 'Не вдалося зберегти поточну сторінку.');
  return useMutation<void, Error, { id: string; currentPage: number }>({
    mutationFn: async ({ id, currentPage }) => {
      const db = await getDatabase();
      await UserBookRepository.updateCurrentPage(db, id, currentPage);
    },
    onSuccess: () => {
      invalidate();
      // Екран активної сесії (`useSessionWithBook`) тримає власний снепшот userBook —
      // без цього "зараз на сторінці N" лишалось би застарілим до виходу з екрана.
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError,
  });
}

/** Заодно (фонове, fire-and-forget) знімає позначку "додано" в спільному каталозі
 * (Milestone 8.2, `src/data/remote/catalogSync.ts`) — edition/isbn читається ДО видалення
 * (`UserBookRepository.remove` — м'яке видалення, `getByIdWithDetails` після нього вже
 * нічого не знайде, бо фільтрує `deleted_at IS NULL`). */
export function useRemoveFromLibrary() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateUserBooks();
  const onError = useMutationErrorHandler(log, 'Не вдалося прибрати книгу з бібліотеки.');
  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const db = await getDatabase();
      const userBook = await UserBookRepository.getById(db, id);
      const edition = userBook ? await EditionRepository.getById(db, userBook.editionId) : null;

      await UserBookRepository.remove(db, id);

      if (edition) {
        // Fire-and-forget з ланцюжком інвалідації ПІСЛЯ завершення (Milestone 8.3) — той
        // самий підхід, що й у `useCreateBookDraft.ts`/`useAddToLibrary.ts`. Разом з нею —
        // `trends.top` (аудит M11, п.6.7, той самий фікс що й у `useAddToLibrary.ts`): ця сама
        // позначка й формує рахунок «Трендів».
        void markRemovedInSharedCatalog({ isbn13: edition.isbn13, isbn10: edition.isbn10 })
          .then(() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.providerSearch.sharedCatalogAll });
            queryClient.invalidateQueries({ queryKey: queryKeys.trends.top });
          })
          .catch(() => {});
      }
    },
    onSuccess: invalidate,
    onError,
  });
}
