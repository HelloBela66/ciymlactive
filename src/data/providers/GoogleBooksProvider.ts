import { z } from 'zod';
import { createLogger } from '@/lib/logger';
import { isFetchAborted } from '@/lib/isFetchAborted';
import { GoogleBooksProxyClient, isGoogleBooksProxyConfigured, type GoogleBooksProxyBook } from '@/data/remote/googleBooksProxyClient';
import { classifyHttpStatus, type ProviderSearchOutcome } from '@/lib/providerSearchError';
import type { NormalizedBookDraft } from '@/types/bookDraft';
import type { BookMetadataProvider, RawProviderBook } from './BookMetadataProvider';

const log = createLogger('providers/googleBooks');

const API_BASE = 'https://www.googleapis.com/books/v1/volumes';

/**
 * POLYTSIA V1.6.1, Фаза 4 (`docs/SECURITY.md`, знахідка 🟡 "Ключ Google Books іде прямо в
 * клієнтський білд", `docs/V1_6_FULL_AUDIT_REPORT.md` розділ 26/32) — цей провайдер БІЛЬШЕ НЕ
 * читає `EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY` і ніколи не додає жодного ключа до прямого
 * клієнтського запиту. Замість цього — ДВА шляхи, обидва без секрету в клієнті:
 *
 * 1. **Проксі задеплоєно й увімкнено** (`isGoogleBooksProxyConfigured()`) — усі три методи
 *    (`searchBooks`/`lookupByISBN`/`getEdition`) ідуть через
 *    `supabase/functions/google-books-proxy/` (`GoogleBooksProxyClient`), де сервер сам додає
 *    ключ (якщо власник продукту його поставив як Supabase secret) — той самий "вищий рівень
 *    сервісу, ключ ніколи не в бандлі" підхід, що й `ISBNdbProvider.ts`.
 * 2. **Проксі ще НЕ налаштовано** (типовий стан одразу після цієї фази, доки власник продукту не
 *    виконав кроки з `supabase/functions/google-books-proxy/README.md`) — прямий анонімний
 *    виклик до Google Books (нижче), БЕЗ жодного ключа. Це свідомо НЕ "провайдер вимкнено" (на
 *    відміну від `ISBNdbProvider.isEnabled = isIsbndbProxyConfigured()`): Google Books —
 *    core-джерело пошуку (`docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 19, "core loop"), і застосунок
 *    не повинен ламати пошук книг для власника продукту, який ще не встиг задеплоїти цю функцію
 *    (`docs/V1_6_1_FINAL_REPORT.md`, принцип "DO NOT SILENTLY CHANGE PRODUCT BEHAVIOR" — жодна
 *    заміна архітектури тут не повинна робити гірше, ніж було до фікса). Анонімна квота нижча за
 *    квоту з ключем, але це ТОЙ САМИЙ компроміс, що застосунок уже документував і приймав ще ДО
 *    появи `EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY` — просто тепер це єдиний шлях без проксі, а не
 *    "деградація без ключа" поруч із "нормальний режим із ключем у бандлі".
 *
 * `isEnabled` лишається завжди `true` (обидва шляхи вище завжди дають робочий результат,
 * щонайменше анонімний) — на відміну від ISBNdb, де без проксі провайдер структурно не може
 * працювати взагалі (платний сервіс).
 */

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

function proxyBookToRaw(book: GoogleBooksProxyBook): RawProviderBook {
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

/** Один HTTP-запит з м'яким degradation: будь-яка помилка мережі/парсингу класифікується
 * (FOUNDATION FINAL POLISH, `src/lib/providerSearchError.ts`), АЛЕ ніколи не кидає далі в UI
 * (docs/BOOK_PROVIDERS.md, "Технічні ризики": rate limit чи зміна контракту не повинні ламати
 * пошук — лишається manual entry) — розрізняється лише те, ЩО саме сталось ("нічого не
 * знайдено" проти "джерело не відповіло"), а не сам факт "показати щось користувачу замість
 * падіння застосунку". Виняток — скасування через `signal` (React Query перервало застарілий
 * запит під час набору тексту): це навмисне скасування, а не помилка, тож прокидаємо його далі,
 * щоб React Query позначив запит "cancelled", а не "error" (і не залогувало його як помилку).
 * Детектор скасування — `isFetchAborted` (`src/lib/isFetchAborted.ts`), НЕ голий
 * `error.name === 'AbortError'`: на iOS/Expo Go нативний fetch кидає власний
 * `FetchRequestCanceledException` без цього імені — реальна знахідка з логів пристрою.
 *
 * ФАЗА 4 V1.6.1 — БЕЗ жодного ключа (докладніше — коментар над файлом): цей прямий шлях тепер
 * лише fallback, коли проксі не налаштовано, завжди анонімний. Цей шлях НЕ має власного
 * client-side timeout (на відміну від `googleBooksProxyClient.ts`/`isbndbProxyClient.ts`) — той
 * самий обсяг, що й до цієї фази, тож `kind: 'timeout'` тут просто ніколи не з'являється, лише
 * `network`/`rate_limited`/`server`/`invalid_response`/`unknown`.
 */
async function fetchVolumesDirect(
  query: string,
  signal?: AbortSignal,
  langRestrict?: string,
): Promise<ProviderSearchOutcome<z.infer<typeof VolumeSchema>>> {
  try {
    const langParam = langRestrict ? `&langRestrict=${encodeURIComponent(langRestrict)}` : '';
    const response = await fetch(`${API_BASE}?q=${encodeURIComponent(query)}&maxResults=20${langParam}`, { signal });
    if (!response.ok) {
      log.warn('Google Books відповів не-OK статусом', { status: response.status });
      return { status: 'error', error: { kind: classifyHttpStatus(response.status) } };
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch (parseError) {
      log.warn('Google Books: не вдалось розпарсити відповідь', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return { status: 'error', error: { kind: 'invalid_response' } };
    }
    const parsed = VolumesResponseSchema.safeParse(json);
    if (!parsed.success) {
      log.warn('Google Books: неочікувана форма відповіді');
      return { status: 'error', error: { kind: 'invalid_response' } };
    }
    return { status: 'success', items: parsed.data.items ?? [] };
  } catch (error) {
    if (isFetchAborted(error, signal)) throw error;
    log.warn('Google Books: помилка запиту', { error: error instanceof Error ? error.message : String(error) });
    return { status: 'error', error: { kind: 'network' } };
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
    //
    // FOUNDATION FINAL POLISH — обидва шляхи (проксі й прямий) тепер повертають той самий
    // `ProviderSearchOutcome`: помилка одного конкретного виклику (429/5xx/timeout/мережа/
    // malformed) прокидається як `status: 'error'`, а не тихо стає `status: 'success', items: []`.
    if (isGoogleBooksProxyConfigured()) {
      const result = await GoogleBooksProxyClient.search(query, 'uk', signal);
      if (result.status === 'error') return result;
      return { status: 'success', items: result.items.map(proxyBookToRaw) };
    }
    const result = await fetchVolumesDirect(query, signal, 'uk');
    if (result.status === 'error') return result;
    return { status: 'success', items: result.items.map(toRawBook) };
  },

  async lookupByISBN(isbn) {
    if (isGoogleBooksProxyConfigured()) {
      const book = await GoogleBooksProxyClient.lookupByIsbn(isbn);
      return book ? proxyBookToRaw(book) : null;
    }
    // POLYTSIA FOUNDATION FINAL POLISH FIX — `fetchVolumesDirect` тепер повертає
    // `ProviderSearchOutcome<...>` (`{status, items|error}`), а НЕ голий масив: до цього рядка
    // тут лишався старий `volumes[0]` (індексація об'єкта-outcome замість масиву), тож ISBN-
    // лукап без налаштованого проксі мовчки завжди повертав `null`, незалежно від того, чи
    // Google Books реально знайшов видання — виявлено й виправлено в межах цього ж пасу
    // (регресія, внесена самим фіксом Search Provider Error Transparency, а не поза його межами).
    const result = await fetchVolumesDirect(`isbn:${isbn}`);
    if (result.status === 'error') return null;
    const first = result.items[0];
    return first ? toRawBook(first) : null;
  },

  async getEdition(externalId) {
    if (isGoogleBooksProxyConfigured()) {
      const book = await GoogleBooksProxyClient.getEdition(externalId);
      return book ? proxyBookToRaw(book) : null;
    }
    try {
      const response = await fetch(`${API_BASE}/${encodeURIComponent(externalId)}`);
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
