import type { NormalizedBookDraft } from '@/types/bookDraft';
import type { BookMetadataProvider, RawProviderBook } from './BookMetadataProvider';

/**
 * Не мережевий "провайдер" (docs/BOOK_PROVIDERS.md) — представляє шлях, яким користувач сам
 * вводить усі поля (`app/work/new.tsx`, Milestone 1). Той екран будує `NormalizedBookDraft`
 * напряму, не через цей об'єкт — він існує заради архітектурної повноти (реєстр провайдерів,
 * `id: 'manual'` як провенанс у `book_source`), а не тому, що UI викликає його методи. Єдиний
 * провайдер, завжди `isEnabled: true` — гарантований fallback, коли жодне зовнішнє джерело
 * не дало результату.
 */
export const ManualBookProvider: BookMetadataProvider = {
  id: 'manual',
  displayName: 'Вручну',
  isEnabled: true,

  async searchBooks(): Promise<RawProviderBook[]> {
    return [];
  },

  async lookupByISBN(): Promise<RawProviderBook | null> {
    return null;
  },

  async getEdition(): Promise<RawProviderBook | null> {
    return null;
  },

  normalizeBook(raw): NormalizedBookDraft {
    return {
      title: raw.title,
      authors: raw.authors,
      isbn10: raw.isbn10,
      isbn13: raw.isbn13,
      publisher: raw.publisher,
      pageCount: raw.pageCount,
      language: raw.language ?? 'uk',
      format: 'paperback',
      coverUrl: raw.coverUrl,
      description: raw.description,
      translators: [],
      source: { sourceType: 'manual', sourceName: 'Вручну' },
    };
  },
};
