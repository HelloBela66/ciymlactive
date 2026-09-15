import { createLogger } from '@/lib/logger';
import { classifyHttpStatus, type ProviderSearchOutcome } from '@/lib/providerSearchError';

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

/** Результат одного HTTP-виклику проксі — `null`, коли проксі взагалі не налаштовано (виклик
 * навіть не стався, це не помилка — `GoogleBooksProvider` сам вирішує, чи падати на прямий
 * анонімний шлях); `{ ok: true, data }` на 2xx з валідним JSON; `{ ok: false, kind }` на будь-
 * яку іншу — саме ЦЕ розрізнення (FOUNDATION FINAL POLISH) раніше повністю губилось: усі три
 * випадки колись зводились до `T | null`, і "не налаштовано"/"провайдер упав"/"нічого не
 * знайдено" були невідрізненні одне від одного на рівні викликача. */
type ProxyCallResult<T> = { ok: true; data: T } | { ok: false; kind: import('@/lib/providerSearchError').ProviderSearchErrorKind };

async function callProxy<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<ProxyCallResult<T> | null> {
  if (!isGoogleBooksProxyConfigured()) return null;

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort);
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CLIENT_TIMEOUT_MS);

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
      return { ok: false, kind: classifyHttpStatus(response.status) };
    }
    try {
      const data = (await response.json()) as T;
      return { ok: true, data };
    } catch (parseError) {
      log.warn('Google Books proxy: не вдалось розпарсити відповідь', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return { ok: false, kind: 'invalid_response' };
    }
  } catch (error) {
    // Той самий "лише зовнішній signal пробиває далі" контракт, що й `isbndbProxyClient.ts`
    // (докладне пояснення — коментар там-таки, включно з iOS/Expo Go `FetchRequestCanceledException`
    // нюансом). `timedOut` розрізняє внутрішній client-side timeout від справжнього мережевого
    // збою — обидва йдуть через той самий `controller.abort()`, тож інакше нерозрізнювані.
    if (signal?.aborted) throw error;
    log.warn('Google Books proxy: помилка запиту', {
      error: error instanceof Error ? error.message : String(error),
      timedOut,
    });
    return { ok: false, kind: timedOut ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

export const GoogleBooksProxyClient = {
  /** FOUNDATION FINAL POLISH — повертає `ProviderSearchOutcome`, а не голий масив:
   * "не налаштовано" (`callProxy` → `null`) трактується як `success: []` (виклик узагалі не
   * стався — не помилка джерела, `GoogleBooksProvider` викликає це лише коли проксі
   * налаштовано, тож це чисто захисний фолбек), справжня HTTP/мережева помилка — як `error`. */
  async search(
    query: string,
    langRestrict: string | undefined,
    signal?: AbortSignal,
  ): Promise<ProviderSearchOutcome<GoogleBooksProxyBook>> {
    const result = await callProxy<{ books: GoogleBooksProxyBook[] }>({ op: 'search', query, langRestrict }, signal);
    if (result === null) return { status: 'success', items: [] };
    if (!result.ok) return { status: 'error', error: { kind: result.kind } };
    return { status: 'success', items: result.data.books ?? [] };
  },

  /** `lookupByIsbn`/`getEdition` — НЕ зачеплені цим фіксом (поза межами ТЗ FOUNDATION FINAL
   * POLISH, який стосується лише вільнотекстового пошуку на екрані Search): той самий
   * "success ⇄ null" контракт, що й до цієї фази. */
  async lookupByIsbn(isbn: string, signal?: AbortSignal): Promise<GoogleBooksProxyBook | null> {
    const result = await callProxy<{ book: GoogleBooksProxyBook | null }>({ op: 'lookup', isbn }, signal);
    return result?.ok ? (result.data.book ?? null) : null;
  },

  async getEdition(externalId: string, signal?: AbortSignal): Promise<GoogleBooksProxyBook | null> {
    const result = await callProxy<{ book: GoogleBooksProxyBook | null }>({ op: 'get_edition', externalId }, signal);
    return result?.ok ? (result.data.book ?? null) : null;
  },
};
