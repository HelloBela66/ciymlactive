import type { NormalizedBookDraft } from '@/types/bookDraft';
import type { BookMetadataProvider, RawProviderBook } from './BookMetadataProvider';
import { IsbndbProxyClient, isIsbndbProxyConfigured, type IsbndbProxyBook } from '@/data/remote/isbndbProxyClient';

/**
 * ПЛАТНИЙ сервіс (docs/BOOK_PROVIDERS.md — свідоме рішення користувача після того, як
 * з'ясувалось, що жодне БЕЗКОШТОВНЕ офіційне джерело не покриває більшість українських
 * видань). З POLYTSIA V1.5 Фаза 1.1 (`docs/SECURITY.md`, знахідка 🔴) цей провайдер БІЛЬШЕ
 * НЕ звертається до `api2.isbndb.com` напряму й більше не тримає жодного секрету — увесь
 * мережевий виклик і сам платний ключ ISBNdb перенесено на сервер
 * (`supabase/functions/isbndb-proxy/`, README.md поруч). Цей файл лише викликає
 * `IsbndbProxyClient` і перекладає його відповідь у `RawProviderBook` — той самий контракт
 * `BookMetadataProvider`, що й раніше, тож решта застосунку (`ALL_PROVIDERS`,
 * `src/data/providers/index.ts`) не потребує жодних змін.
 *
 * `isEnabled` тепер обчислюється з `isIsbndbProxyConfigured()` (Supabase налаштовано +
 * власник продукту свідомо увімкнув прапорець `EXPO_PUBLIC_ISBNDB_PROXY_ENABLED`, докладніше
 * — коментар у `isbndbProxyClient.ts`), а не з наявності самого платного ключа (якого в
 * клієнтському коді більше немає взагалі). Без цього — той самий "тихо вимкнений провайдер"
 * (не в UI, ніколи не викликається), що й раніше без `EXPO_PUBLIC_ISBNDB_API_KEY`.
 */

function toRawBook(book: IsbndbProxyBook): RawProviderBook {
  return {
    externalId: book.externalId,
    title: book.title,
    authors: book.authors,
    isbn10: book.isbn10,
    isbn13: book.isbn13,
    publisher: book.publisher,
    publicationDate: book.publicationDate,
    pageCount: book.pageCount,
    language: book.language,
    description: book.description,
    coverUrl: book.coverUrl,
  };
}

export const ISBNdbProvider: BookMetadataProvider = {
  id: 'isbndb',
  displayName: 'ISBNdb',
  isEnabled: isIsbndbProxyConfigured(),

  async searchBooks(query, signal) {
    const books = await IsbndbProxyClient.search(query, signal);
    return books.map(toRawBook);
  },

  async lookupByISBN(isbn) {
    const book = await IsbndbProxyClient.lookupByIsbn(isbn);
    return book ? toRawBook(book) : null;
  },

  async getEdition(externalId) {
    // ISBNdb не має окремого "id видання" — той самий ISBN, яким ми й шукали, тож просто
    // повторюємо лукап (той самий підхід, що дав би getEdition тут в іншому провайдері).
    return ISBNdbProvider.lookupByISBN(externalId);
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
        sourceType: 'isbndb',
        sourceName: 'ISBNdb',
        externalId: raw.externalId,
      },
    };
  },
};
