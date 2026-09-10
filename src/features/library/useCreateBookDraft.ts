import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { createWorkAndEditionFromDraft, type CreateWorkAndEditionResult } from '@/data/repositories/bookDraftRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import { publishToSharedCatalog } from '@/data/remote/catalogSync';
import type { NormalizedBookDraft } from '@/types/bookDraft';

const log = createLogger('features/library/createBookDraft');

/**
 * Мутація ручного додавання книги (Milestone 1, п.20 ТЗ). Персистенція — через
 * createWorkAndEditionFromDraft, той самий шлях, яким пізніше (Milestone 7) підуть і зовнішні
 * провайдери. Після успіху інвалідуємо пошук/останні книги, щоб нова книга одразу зʼявилась.
 *
 * `onError` тут — на додачу до вже наявного `isError`-рендеру на екранах-викликах
 * (`app/import/review.tsx`, `app/work/new.tsx`) — не заміна: локальне повідомлення поруч із
 * формою лишається, тост лише гарантує, що збій буде помітно, навіть якщо конкретний екран
 * колись забуде перевірити `isError` (Milestone 8, той самий підхід, що й в інших ~28
 * мутаціях).
 *
 * `onSuccess` також фонове (fire-and-forget) публікує підтверджені дані в спільний каталог
 * (Milestone 8.2, `src/data/remote/catalogSync.ts`) — лише ПІСЛЯ того, як книга вже успішно
 * збережена локально, і лише для джерел, вартих довіри (не ручне введення, докладніше —
 * коментар у `catalogSync.ts`). Наступний користувач, що шукатиме той самий ISBN, знайде цей
 * запис у спільному каталозі й не спричинить ще один платний запит до ISBNdb.
 *
 * Інвалідація кешу пошуку по спільному каталогу (Milestone 8.3) підвішена на `.then()` ПІСЛЯ
 * публікації, а не викликана одразу поруч із нею: `publishToSharedCatalog` — фонова дія, і
 * якщо скинути кеш до того, як запит до Supabase справді дійшов, повторний пошук тим самим
 * текстом одразу після збереження ризикує знову піти в мережу ДО того, як книга з'явиться в
 * каталозі, і так само не знайти її.
 */
export function useCreateBookDraft() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося зберегти книгу. Спробуй ще раз.');

  return useMutation<CreateWorkAndEditionResult, Error, NormalizedBookDraft>({
    mutationFn: async (draft) => {
      const db = await getDatabase();
      return createWorkAndEditionFromDraft(db, draft);
    },
    onSuccess: (_result, draft) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.works.all });
      void publishToSharedCatalog(draft)
        .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.providerSearch.sharedCatalogAll }))
        .catch(() => {
          // publishToSharedCatalog сама не мала б кидати (усі мережеві помилки осідають
          // усередині SharedCatalogClient) — цей catch лише запобіжник від unhandled
          // rejection у консолі, без наслідків для UI.
        });
    },
    onError,
  });
}
