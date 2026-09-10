import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import type { NormalizedBookDraft } from '@/types/bookDraft';
import type { BookMetadataProvider, RawProviderBook } from './BookMetadataProvider';

const log = createLogger('providers/googleBooks');

const API_BASE = 'https://www.googleapis.com/books/v1/volumes';

/** Необов'язковий безключовий → з ключем перехід (докладніше — `.env.example`,
 * `docs/BOOK_PROVIDERS.md`). Реальне тестування на пристрої показало: анонімні запити без
 * ключа мають дуже маленьку квоту й ловлять HTTP 429 навіть за акуратного використання —
 * ключ (безкоштовний у Google Cloud Console) знімає це майже повністю. Без ключа все одно
 * працює як і раніше — ключ лише додається до URL, якщо він є. */
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;

function withApiKey(url: string): string {
  if (!API_KEY) return url;
  return `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(API_KEY)}`;
}

/** Навмисно "м'яка" схема (усе, крім title, опційне) — зовнішній JSON (п.19/ARCHITECTURE.md
 * "Ніколи не довіряємо `any` з мережі"), але Google Books у бойових відповідях реально не
 * завжди повертає навіть authors/publisher, тож жорсткіша схема відкидала б валідні книги. */
const VolumeInfoSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  authors: z.array(z.string()).optional(),
  publisher: z.string().optional(),
  publishedDate: z.string().optional(),
  description: z.string().optional(),
  industryIdentifiers: z
    .array(z.object({ type: z.string(), identifier: z.string() }))
    .optional(),
  pageCount: z.number().int().positive().optional(),
  language: z.string().optional(),
  imageLinks: z.object({ thumbnail: z.string().optional(), smallThumbnail: z.string().optional() }).optional(),
});

const VolumeSchema = z.object({ id: z.string(), volumeInfo: VolumeInfoSchema });
const VolumesResponseSchema = z.object({ items: z.array(VolumeSchema).optional() });

function toRawBook(volume: z.infer<typeof VolumeSchema>): RawProviderBook {
  const info = volume.volumeInfo;
  const isbn10 = info.industryIdentifiers?.find((i) => i.type === 'ISBN_10')?.identifier;
  const isbn13 = info.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier;

  return {
    externalId: volume.id,
    title: info.title,
    authors: info.authors ?? [],
    isbn10,
    isbn13,
    publisher: info.publisher,
    publicationDate: info.publishedDate,
    pageCount: info.pageCount,
    language: info.language,
    description: info.description,
    // https:// заміна: Google Books інколи повертає http:// у thumbnail — картинки в
    // застосунку завантажуються через https, http:// у деяких мережах тихо блокується.
    coverUrl: (info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail)?.replace(/^http:\/\//, 'https://'),
  };
}

/** Один HTTP-запит з м'яким degradation: будь-яка помилка мережі/парсингу — порожній
 * результат ([] чи null), НІКОЛИ не кидає далі в UI (docs/BOOK_PROVIDERS.md, "Технічні
 * ризики": rate limit чи зміна контракту не повинні ламати пошук — лишається manual entry).
 * Виняток — скасування через `signal` (React Query перервало застарілий запит під час
 * набору тексту): це навмисне скасування, а не помилка, тож прокидаємо його далі, щоб
 * React Query позначив запит "cancelled", а не "error" (і не залогувало його як помилку). */
async function fetchVolumes(
  query: string,
  signal?: AbortSignal,
  langRestrict?: string,
): Promise<z.infer<typeof VolumeSchema>[]> {
  try {
    const langParam = langRestrict ? `&langRestrict=${encodeURIComponent(langRestrict)}` : '';
    const response = await fetch(
      withApiKey(`${API_BASE}?q=${encodeURIComponent(query)}&maxResults=20${langParam}`),
      { signal },
    );
    if (!response.ok) {
      log.warn('Google Books відповів не-OK статусом', { status: response.status });
      return [];
    }
    const json: unknown = await response.json();
    const parsed = VolumesResponseSchema.safeParse(json);
    if (!parsed.success) {
      log.warn('Google Books: неочікувана форма відповіді');
      return [];
    }
    return parsed.data.items ?? [];
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    log.warn('Google Books: помилка запиту', { error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}

export const GoogleBooksProvider: BookMetadataProvider = {
  id: 'google_books',
  displayName: 'Google Books',
  isEnabled: true,

  async searchBooks(query, signal) {
    // `langRestrict=uk` — звужуємо на рівні самого Google Books API (докладніше —
    // docs/BOOK_PROVIDERS.md, "Українська пошукова політика"): користувач явно попросив,
    // щоб застосунок знаходив лише українськомовні видання. Це лише перший, "м'якший"
    // фільтр (Google сам вирішує, що вважати мовою видання) — додатковий клієнтський фільтр
    // (`filterUkrainianBooks` у `useProviderSearch`) лишається як страхувальний другий шар,
    // бо мовна мітка від самого джерела подекуди буває недостовірною (реальний приклад з
    // ISBNdb, який спричинив цю зміну).
    const volumes = await fetchVolumes(query, signal, 'uk');
    return volumes.map(toRawBook);
  },

  async lookupByISBN(isbn) {
    const volumes = await fetchVolumes(`isbn:${isbn}`);
    const first = volumes[0];
    return first ? toRawBook(first) : null;
  },

  async getEdition(externalId) {
    try {
      const response = await fetch(withApiKey(`${API_BASE}/${encodeURIComponent(externalId)}`));
      if (!response.ok) return null;
      const json: unknown = await response.json();
      const parsed = VolumeSchema.safeParse(json);
      return parsed.success ? toRawBook(parsed.data) : null;
    } catch (error) {
      log.warn('Google Books: помилка отримання видання', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
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
        sourceType: 'google_books',
        sourceName: 'Google Books',
        sourceUrl: `https://books.google.com/books?id=${raw.externalId}`,
        externalId: raw.externalId,
      },
    };
  },
};
