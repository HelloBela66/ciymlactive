import type { NormalizedBookDraft } from '@/types/bookDraft';

/**
 * Провайдеро-незалежний "сирий" результат пошуку/лукапу (docs/BOOK_PROVIDERS.md). UI (Search,
 * ISBN scan) ніколи не бачить сирий JSON конкретного провайдера — лише цю форму.
 */
export interface RawProviderBook {
  externalId: string;
  title: string;
  authors: string[];
  isbn10?: string;
  isbn13?: string;
  publisher?: string;
  publicationDate?: string;
  pageCount?: number;
  language?: string;
  description?: string;
  coverUrl?: string;
  /** Скільки різних пристроїв уже додали цю книгу собі в бібліотеку (Milestone 8.2, спільний
   * каталог, `SharedCatalogProvider.ts`) — заповнено лише цим провайдером, у решти завжди
   * `undefined`. UI показує бейдж "Хтось уже читає (N)" лише коли поле присутнє й > 0. */
  addedCount?: number;
}

export interface BookMetadataProvider {
  id: 'google_books' | 'isbndb' | 'manual' | (string & {});
  displayName: string;
  /** `false` для провайдерів без офіційного/дозволеного API (docs/BOOK_PROVIDERS.md,
   * "заготовлені, вимкнені") — UI фільтрує за цим прапорцем, ніколи не викликає вимкнений
   * провайдер напряму. */
  isEnabled: boolean;
  /** `signal` — необов'язковий: React Query (`useProviderSearch`) передає його, щоб
   * скасувати застарілий запит, коли користувач ввів ще один символ до відповіді сервера
   * (інакше кожна пауза під час набору лишає "висячий" запит, який дарма з'їдає ліміт
   * безключового Google Books API — реальна знахідка з тестування на пристрої). */
  searchBooks(query: string, signal?: AbortSignal): Promise<RawProviderBook[]>;
  lookupByISBN(isbn: string): Promise<RawProviderBook | null>;
  getEdition(externalId: string): Promise<RawProviderBook | null>;
  /** -> Work+Edition draft; та сама модель, у яку розкладається й ручне введення
   * (докладніше — `src/data/repositories/bookDraftRepository.ts`). */
  normalizeBook(raw: RawProviderBook): NormalizedBookDraft;
}
