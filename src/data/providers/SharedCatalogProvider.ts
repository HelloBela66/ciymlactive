import { SharedCatalogClient, isSharedCatalogConfigured, type CatalogBookRow } from '@/data/remote/sharedCatalogClient';
import { isbnEquivalents } from '@/lib/isbn';
import type { NormalizedBookDraft } from '@/types/bookDraft';
import type { BookMetadataProvider, RawProviderBook } from './BookMetadataProvider';

/** Експортовано (а не лишено `function`-приватною цього модуля) заради «Трендів»
 * (`useTrendingBooks.ts`, Milestone 11, доповнення) — `catalog_top_books` повертає той самий
 * `CatalogBookRow`, що й `catalog_search`, тож перевикористовуємо те саме перетворення в
 * `RawProviderBook`, замість дублювати його вдруге під новий екран. */
export function toRawBook(row: CatalogBookRow): RawProviderBook {
  return {
    // ISBN, не внутрішній uuid каталогу (`row.id`): жодна з RPC-функцій не дає лукап "за
    // id каталогу" (`supabase/schema.sql` навмисно мінімальний), лише за ISBN — тож саме
    // ISBN мусить бути тим, що `getEdition` нижче зможе повторно використати.
    externalId: row.isbn13 ?? row.isbn10 ?? row.id,
    title: row.title,
    authors: row.authors,
    isbn10: row.isbn10 ?? undefined,
    isbn13: row.isbn13 ?? undefined,
    publisher: row.publisher ?? undefined,
    publicationDate: row.publication_year != null ? String(row.publication_year) : undefined,
    pageCount: row.page_count ?? undefined,
    language: row.language,
    description: row.description ?? undefined,
    coverUrl: row.cover_url ?? undefined,
    addedCount: row.added_count,
  };
}

/**
 * "Провайдер" для спільного каталогу (Milestone 8.2, `supabase/schema.sql`) — не зовнішнє
 * джерело метаданих як такого, а кеш РАНІШЕ ПІДТВЕРДЖЕНИХ результатів усіх інших провайдерів
 * (записує їх туди `src/data/remote/catalogSync.ts` після того, як БУДЬ-ЯКИЙ користувач сам
 * зберіг книгу). Реалізує той самий `BookMetadataProvider` — щоб безкоштовно перевикористати
 * `useProviderSearch`/`ProviderResultsSection` на екрані пошуку й `activeProviders()` на
 * екрані сканування ISBN, замість окремого паралельного UI-шляху.
 *
 * Навмисно ПЕРШИЙ у порядку показу й перевірки (на відміну від Open Library/Google
 * Books/ISBNdb): знахідка тут — це запит до власного Supabase, на порядок дешевший і
 * швидший за будь-який зовнішній API, і головне — саме він дає змогу не витрачати платний
 * ISBNdb-запит повторно на книгу, яку вже шукав інший користувач (пряме прохання користувача,
 * Milestone 8.2). `isEnabled` — динамічний, як і в ISBNdb: без налаштованого Supabase-проєкту
 * (`EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`) поводиться як звичайний
 * вимкнений провайдер — решта пошуку працює так само, як до цієї фічі.
 */
export const SharedCatalogProvider: BookMetadataProvider = {
  id: 'shared_catalog',
  displayName: 'Спільна бібліотека',
  get isEnabled() {
    return isSharedCatalogConfigured();
  },

  async searchBooks(query, signal) {
    const rows = await SharedCatalogClient.search(query, 20, signal);
    return rows.map(toRawBook);
  },

  async lookupByISBN(isbn) {
    // Пробує обидва еквіваленти ISBN-13/ISBN-10 (Milestone 10 fix6, `docs/STATUS_V1.md`
    // п. 3.5) — вхідний `isbn` тут майже завжди ISBN-13 (штрихкоди книг — EAN-13,
    // `app/isbn-scan.tsx`), а запис каталогу тієї самої книги міг потрапити з ISBN-10-джерела.
    const { isbn13, isbn10 } = isbnEquivalents(isbn);
    const row = await SharedCatalogClient.findByIsbnEither(isbn13 ?? isbn, isbn10);
    return row ? toRawBook(row) : null;
  },

  async getEdition(externalId) {
    // Каталог не має окремого пошуку "за id" (RPC цілеспрямовано мінімальні, `supabase/schema.sql`)
    // — externalId тут завжди сам ISBN (search/lookupByISBN уже повертають рядок з ним),
    // тож просто ISBN-лукап, той самий підхід, що й у ISBNdbProvider.getEdition.
    return SharedCatalogProvider.lookupByISBN(externalId);
  },

  normalizeBook(raw): NormalizedBookDraft {
    return {
      title: raw.title,
      authors: raw.authors,
      isbn10: raw.isbn10,
      isbn13: raw.isbn13,
      publisher: raw.publisher,
      publicationYear: raw.publicationDate ? Number.parseInt(raw.publicationDate.slice(0, 4), 10) || undefined : undefined,
      pageCount: raw.pageCount,
      language: raw.language ?? 'uk',
      format: 'paperback',
      coverUrl: raw.coverUrl,
      description: raw.description,
      translators: [],
      source: {
        // Зарезервоване саме під це значення ще з Milestone 0 (`BookSourceTypeSchema`,
        // `src/types/bookDraft.ts`) — книга прийшла НЕ напряму від Google Books/ISBNdb тощо
        // (той факт лишається у власних полях каталогу на боці Supabase), а через спільний
        // кеш застосунку.
        sourceType: 'future_ua_catalog',
        sourceName: 'Спільна бібліотека Полиця',
        externalId: raw.externalId,
      },
    };
  },
};
