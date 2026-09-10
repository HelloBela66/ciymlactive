import { CuratedCatalogClient, isCuratedCatalogConfigured, type CuratedBookRow } from '@/data/remote/curatedCatalogClient';
import type { NormalizedBookDraft } from '@/types/bookDraft';
import type { BookMetadataProvider, RawProviderBook } from './BookMetadataProvider';

function toRawBook(row: CuratedBookRow): RawProviderBook {
  return {
    // Слаг з `curated_book.id` (обраний власником продукту в CSV), не ISBN — на відміну від
    // `SharedCatalogProvider`, цей каталог МАЄ власний id-лукап (`curated_book_get`), тож
    // немає потреби покладатись на ISBN, якого в куратора не завжди є.
    externalId: row.id,
    title: row.title,
    authors: row.authors,
    isbn10: row.isbn10 ?? undefined,
    isbn13: row.isbn13 ?? undefined,
    pageCount: row.page_count ?? undefined,
    language: row.language,
    description: row.description ?? undefined,
    coverUrl: row.cover_url ?? undefined,
  };
}

/**
 * Власна кураторська добірка книг (Milestone 11, доповнення) — власник продукту сам додає
 * книги (назва, автор, сторінки, обкладинка, жанр, мета читання) через
 * `scripts/sync-curated-books.js`/`data/curated-books.csv`, ніколи напряму з застосунку
 * (докладніше — `supabase/schema.sql`, коментар над `curated_book`). Реалізує той самий
 * `BookMetadataProvider`, що й решта джерел (`docs/BOOK_PROVIDERS.md`) — тож ці книги одразу
 * з'являються і в звичайному пошуку (`app/(tabs)/search.tsx`), і як перший, найточніший
 * (жанр+мета проставлені вручну, не вгадані) кандидат для «Що почитати завтра?»
 * (`recommendCuratedBooks` нижче — окрема функція, не частина стандартного інтерфейсу
 * провайдера, оскільки жоден інший провайдер не має структурованого пошуку за жанром+метою).
 *
 * `isEnabled` — той самий Supabase-проєкт/ключі, що й `SharedCatalogProvider`; без них
 * поводиться як звичайний вимкнений провайдер, решта застосунку працює як і раніше.
 */
export const CuratedCatalogProvider: BookMetadataProvider = {
  id: 'curated',
  displayName: 'Добірка «Полиці»',
  get isEnabled() {
    return isCuratedCatalogConfigured();
  },

  async searchBooks(query, signal) {
    const rows = await CuratedCatalogClient.search(query, 20, signal);
    return rows.map(toRawBook);
  },

  async lookupByISBN(isbn) {
    const row = await CuratedCatalogClient.findByIsbn(isbn);
    return row ? toRawBook(row) : null;
  },

  async getEdition(externalId) {
    const row = await CuratedCatalogClient.getById(externalId);
    return row ? toRawBook(row) : null;
  },

  normalizeBook(raw): NormalizedBookDraft {
    return {
      title: raw.title,
      authors: raw.authors,
      isbn10: raw.isbn10,
      isbn13: raw.isbn13,
      pageCount: raw.pageCount,
      language: raw.language ?? 'uk',
      format: 'paperback',
      coverUrl: raw.coverUrl,
      description: raw.description,
      translators: [],
      source: {
        sourceType: 'curated',
        sourceName: 'Добірка «Полиці»',
        externalId: raw.externalId,
      },
    };
  },
};

/**
 * «Що почитати завтра?» (`useTomorrowRecommendation.ts`) — рекомендація за жанром+метою з
 * кураторської добірки. Не частина стандартного `BookMetadataProvider` (жоден інший провайдер
 * не має структурованого жанр+мета пошуку, лише вільнотекстовий `searchBooks`), тож окрема
 * функція, а не метод об'єкта `CuratedCatalogProvider` — інакше довелось би розширювати сам
 * інтерфейс `BookMetadataProvider` заради єдиного джерела, якому це потрібно.
 */
export async function recommendCuratedBooks(genreNameUk: string, purpose: string, limit = 30): Promise<RawProviderBook[]> {
  const rows = await CuratedCatalogClient.recommend(genreNameUk, purpose, limit);
  return rows.map(toRawBook);
}
