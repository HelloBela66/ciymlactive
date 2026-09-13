import { createLogger } from '@/lib/logger';

const log = createLogger('remote/googleBooksProxy');

/**
 * Клієнт до `supabase/functions/google-books-proxy/` (POLYTSIA V1.6.1, Фаза 4,
 * `docs/SECURITY.md`, знахідка 🟡 "Ключ Google Books іде прямо в клієнтський білд") — той самий
 * низькорівневий `fetch`-підхід і graceful-degradation філософія, що й
 * `isbndbProxyClient.ts` поруч (try/catch → `null`, ніколи не кидає в UI).
 *
 * `EXPO_PUBLIC_GOOGLE_BOOKS_PROXY_ENABLED` — той самий "0"/"1" power-switch патерн, що й
 * `EXPO_PUBLIC_ISBNDB_PROXY_ENABLED`, АЛЕ семантика вимкненого стану принципово інша: коли
 * proxy не налаштовано, `GoogleBooksProvider.ts` НЕ вимикає джерело (на відміну від ISBNdb) —
 * падає назад на прямий анонімний клієнтський виклик (докладніше — коментар у
 * `GoogleBooksProvider.ts`). Google Books — безкоштовний і працює без ключа взагалі, тож
 * "проксі не налаштовано" тут означає лише "без підвищеної квоти", не "джерело недоступне".
 */
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '')
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/i, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const PROXY_ENABLED = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_PROXY_ENABLED === '1';

export function isGoogleBooksProxyConfigured(): boolean {
  return PROXY_ENABLED && SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/** Той самий склад полів, що й `ProxyBook` на сервері (`index.ts`) і клієнтський
 * `RawProviderBook` — усі три навмисно дзеркальні. */
export interface GoogleBooksProxyBook {
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
}

/** Трохи більше за серверний таймаут (8с, `index.ts`) — той самий запас, що й
 * `isbndbProxyClient.ts`. */
const CLIENT_TIMEOUT_MS = 10_000;

async function callProxy<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T | null> {
  if (!isGoogleBooksProxyConfigured()) return null;

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort);
  const timeoutId = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/google-books-proxy`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      log.warn('Google Books proxy: не-OK відповідь', { status: response.status, body: bodyText.slice(0, 300) });
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    // Той самий "лише зовнішній signal пробиває далі" контракт, що й `isbndbProxyClient.ts`
    // (докладне пояснення — коментар там-таки, включно з iOS/Expo Go `FetchRequestCanceledException`
    // нюансом).
    if (signal?.aborted) throw error;
    log.warn('Google Books proxy: помилка запиту', { error: error instanceof Error ? error.message : String(error) });
    return null;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

export const GoogleBooksProxyClient = {
  async search(query: string, langRestrict: string | undefined, signal?: AbortSignal): Promise<GoogleBooksProxyBook[]> {
    const result = await callProxy<{ books: GoogleBooksProxyBook[] }>({ op: 'search', query, langRestrict }, signal);
    return result?.books ?? [];
  },

  async lookupByIsbn(isbn: string, signal?: AbortSignal): Promise<GoogleBooksProxyBook | null> {
    const result = await callProxy<{ book: GoogleBooksProxyBook | null }>({ op: 'lookup', isbn }, signal);
    return result?.book ?? null;
  },

  async getEdition(externalId: string, signal?: AbortSignal): Promise<GoogleBooksProxyBook | null> {
    const result = await callProxy<{ book: GoogleBooksProxyBook | null }>({ op: 'get_edition', externalId }, signal);
    return result?.book ?? null;
  },
};
