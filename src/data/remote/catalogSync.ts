import { SharedCatalogClient } from './sharedCatalogClient';
import { getDeviceId } from '@/lib/deviceId';
import { isbnEquivalents } from '@/lib/isbn';
import type { NormalizedBookDraft } from '@/types/bookDraft';

/**
 * Доповнює пару ISBN-13/ISBN-10 відсутнім еквівалентом ПЕРЕД будь-яким записом у спільний
 * каталог (Milestone 10 fix6, `docs/STATUS_V1.md` п. 3.5) — усі RPC каталогу (`upsertBook`,
 * `markAdded`/`markRemoved`, `setCoverIfMissing`) звіряють рядок за "ISBN13 = ... АБО ISBN10 =
 * ..." без перерахунку одного в інший на боці Supabase; якщо просто передавати каталогу лише
 * той ISBN, що дав конкретний провайдер (наприклад, лише ISBN13 від Google Books), дві людини,
 * що зберегли ту саму книгу через джерела з різним видом ISBN, роздвоювали б запис каталогу.
 * Заповнюючи ОБИДВА поля тут, на клієнті, ще до виклику — усі майбутні записи цієї книги
 * завжди міститимуть однакову пару, і наявний OR-збіг на боці Supabase починає працювати
 * коректно без жодної зміни SQL (не треба повторно накатувати `schema.sql` на живий проєкт).
 * Якщо переданий ISBN некоректний (не проходить перевірку контрольної цифри) — `isbnEquivalents`
 * тихо повертає `null` для обчисленого поля, і в каталог іде лише те, що прийшло від джерела,
 * як і раніше.
 */
function resolveIsbnPair(isbn13?: string | null, isbn10?: string | null): { isbn13: string | null; isbn10: string | null } {
  if (isbn13 && isbn10) return { isbn13, isbn10 };
  const source = isbn13 ?? isbn10 ?? null;
  if (!source) return { isbn13: isbn13 ?? null, isbn10: isbn10 ?? null };
  const equivalents = isbnEquivalents(source);
  return {
    isbn13: isbn13 ?? equivalents.isbn13,
    isbn10: isbn10 ?? equivalents.isbn10,
  };
}

/**
 * Фонові (fire-and-forget) записи в спільний каталог (Milestone 8.2) — викликаються з
 * мутацій, які й так самі мають власний `onError`-тост (`useMutationErrorHandler`) для
 * ЛОКАЛЬНОЇ дії; виклики цих функцій на місці виклику лишаються `void fn(...)` — вони НІКОЛИ
 * не кидають, тож успіх чи невдача публікації/позначки в каталозі не повинні впливати на те,
 * що бачить користувач: локальне збереження книги/додавання до бібліотеки — єдина дія, за яку
 * відповідає UI. Усі мережеві й конфігураційні помилки вже осідають усередині
 * `SharedCatalogClient`/`sharedCatalogClient.ts` (лог, не виняток) — цей файл лише вирішує,
 * КОЛИ й З ЧИМ їх викликати.
 *
 * Проте (Milestone 8.3, реальне тестування) функції все ж повертають `Promise<void>`, а не
 * просто `void`: викликачу (`useCreateBookDraft`/`useAddToLibrary`/`useRemoveFromLibrary`)
 * потрібно знати, коли фонова дія ЗАВЕРШИЛАСЬ — щоб аж тоді (не раніше) скинути кеш React
 * Query для результатів пошуку по спільному каталогу (`queryKeys.providerSearch.sharedCatalogAll`,
 * `staleTime` 5 хв у `useProviderSearch` інакше показував би той самий, уже застарілий
 * порожній результат при повторному пошуку тим самим текстом одразу після додавання книги).
 * Виклик і далі лишається `void publishToSharedCatalog(draft)` на місці виклику — просто сам
 * проміс тепер ланцюжком веде до інвалідації, а не губиться.
 */

/** Джерела, чиї дані вже перевірені реальним зовнішнім API (не ручне введення) — варті
 * публікації в спільний каталог. `manual` навмисно виключено: жоден інший користувач не
 * підтвердив ці дані, одрук чи помилка в ручному вводі забруднила б каталог для всіх.
 * `future_ua_catalog` також виключено — ця книга й так уже прийшла З каталогу, повторний
 * upsert був би безглуздим зайвим запитом (сам upsert ідемпотентний і не зламався б, просто
 * немає сенсу). */
const PUBLISHABLE_SOURCES: ReadonlySet<string> = new Set(['google_books', 'open_library', 'isbndb']);

/** Викликати ПІСЛЯ того, як користувач сам підтвердив і зберіг книгу (`useCreateBookDraft`,
 * `onSuccess`) — ніколи заздалегідь, той самий принцип "перегляд перед збереженням", що й
 * локально (docs/BOOK_PROVIDERS.md). ISBN — єдиний ключ каталогу (`supabase/schema.sql`), без
 * нього публікувати нічого. */
export async function publishToSharedCatalog(draft: NormalizedBookDraft): Promise<void> {
  if (!PUBLISHABLE_SOURCES.has(draft.source.sourceType)) return;
  if (!draft.isbn13 && !draft.isbn10) return;

  const isbn = resolveIsbnPair(draft.isbn13, draft.isbn10);
  await SharedCatalogClient.upsertBook({
    isbn13: isbn.isbn13,
    isbn10: isbn.isbn10,
    title: draft.title,
    authors: draft.authors,
    publisher: draft.publisher ?? null,
    publicationYear: draft.publicationYear ?? null,
    pageCount: draft.pageCount ?? null,
    language: draft.language,
    description: draft.description ?? null,
    coverUrl: draft.coverUrl ?? null,
    sourceType: draft.source.sourceType,
    sourceName: draft.source.sourceName,
    sourceExternalId: draft.source.externalId ?? null,
  });
}

type IsbnPair = { isbn13?: string | null; isbn10?: string | null };

/** Викликати з `useAddToLibrary`, ПІСЛЯ успішного локального додавання. */
export async function markAddedInSharedCatalog(isbn: IsbnPair): Promise<void> {
  if (!isbn.isbn13 && !isbn.isbn10) return;
  const deviceId = await getDeviceId();
  await SharedCatalogClient.markAdded(resolveIsbnPair(isbn.isbn13, isbn.isbn10), deviceId);
}

/** Викликати з `useRemoveFromLibrary`, ПІСЛЯ успішного локального видалення. */
export async function markRemovedInSharedCatalog(isbn: IsbnPair): Promise<void> {
  if (!isbn.isbn13 && !isbn.isbn10) return;
  const deviceId = await getDeviceId();
  await SharedCatalogClient.markRemoved(resolveIsbnPair(isbn.isbn13, isbn.isbn10), deviceId);
}

export interface CoverSyncInput {
  isbn13?: string | null;
  isbn10?: string | null;
  coverUrl: string;
  title: string;
  authors: string[];
  publisher?: string | null;
  publicationYear?: number | null;
  pageCount?: number | null;
  language: string;
  description?: string | null;
}

/**
 * Викликати ПІСЛЯ того, як користувач сфотографував і локально зберіг власну обкладинку
 * (Milestone 10, "Додати обкладинку" — `app/cover-photo/[editionId].tsx`), і лише якщо фото
 * вже завантажено в Supabase Storage (`coverStorageClient.ts` — `coverUrl` тут завжди
 * публічний `https://`, ніколи локальний `file://`, бо іншим користувачам потрібне справжнє
 * посилання). Той самий fire-and-forget принцип, що й решта файлу.
 *
 * Два випадки:
 * 1. Книга вже є в каталозі (найчастіше — опублікована при збереженні, `publishToSharedCatalog`
 *    вище; провайдер просто не мав картинки) — заповнює лише `cover_url`, і ЛИШЕ якщо він там
 *    ще порожній (`catalog_set_cover_if_missing`, `supabase/schema.sql` — ніколи не
 *    перезаписує вже наявну обкладинку).
 * 2. Книги в каталозі ще немає — типовий випадок для ручного додавання:
 *    `publishToSharedCatalog` навмисно пропускає джерело `manual` (не довіряє неперевіреним
 *    текстовим полям, докладніше — коментар вище). Фото ж — інший рід даних: людина свідомо
 *    фотографує реальну паперову книгу саме для того, щоб допомогти іншим користувачам її
 *    впізнати (пряме прохання користувача) — тому тут створюємо мінімальний запис каталогу з
 *    `sourceType: 'manual'`, а не пропускаємо цей випадок мовчки.
 */
export async function publishCoverToSharedCatalog(input: CoverSyncInput): Promise<void> {
  if (!input.isbn13 && !input.isbn10) return;

  const isbn = resolveIsbnPair(input.isbn13, input.isbn10);
  const existing = await SharedCatalogClient.findByIsbnEither(isbn.isbn13, isbn.isbn10);
  if (existing) {
    if (!existing.cover_url) {
      await SharedCatalogClient.setCoverIfMissing(isbn, input.coverUrl);
    }
    return;
  }

  await SharedCatalogClient.upsertBook({
    isbn13: isbn.isbn13,
    isbn10: isbn.isbn10,
    title: input.title,
    authors: input.authors,
    publisher: input.publisher ?? null,
    publicationYear: input.publicationYear ?? null,
    pageCount: input.pageCount ?? null,
    language: input.language,
    description: input.description ?? null,
    coverUrl: input.coverUrl,
    sourceType: 'manual',
    sourceName: 'Фото користувача (Полиця)',
    sourceExternalId: null,
  });
}
