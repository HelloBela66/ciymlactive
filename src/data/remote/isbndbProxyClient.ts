import { createLogger } from '@/lib/logger';

const log = createLogger('remote/isbndbProxy');

/**
 * Клієнт до `supabase/functions/isbndb-proxy/` (POLYTSIA V1.5, Фаза 1.1, `docs/SECURITY.md`,
 * знахідка 🔴 "Платний ключ ISBNdb іде прямо в клієнтський білд") — той самий низькорівневий
 * `fetch`-підхід і graceful-degradation філософія, що й `curatedCatalogClient.ts`
 * (try/catch → `null`, ніколи не кидає в UI), лише ціль — `/functions/v1/<name>` (Edge
 * Function) замість `/rest/v1/rpc/<fn>` (PostgREST RPC): та сама причина, що й у
 * `curatedCatalogClient.ts` — окремий файл, а не розширення того самого клієнта, бо різна
 * ціль і різна форма запиту/відповіді.
 *
 * Той самий `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`, що й решта Supabase-
 * клієнтів застосунку — ISBNdb-ключ сюди НІКОЛИ не потрапляє (він живе лише на сервері,
 * `supabase/functions/isbndb-proxy/index.ts`, README.md поруч).
 *
 * `EXPO_PUBLIC_ISBNDB_PROXY_ENABLED` — окремий, явний, НЕ секретний прапорець (просто "0"/"1",
 * безпечний у клієнтському бандлі): власник продукту вмикає ISBNdb лише після того, як сам
 * задеплоїв проксі-функцію й поставив реальний ключ як Supabase secret (README.md поруч) —
 * зберігає той самий свідомий "платне джерело, вмикається окремо" принцип, що діяв і раніше
 * з `EXPO_PUBLIC_ISBNDB_API_KEY`, замість "автоматично увімкнено, щойно Supabase налаштовано"
 * (що почало б витрачати платну квоту власника продукту для будь-кого з готовим `.env`).
 */
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '')
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/i, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const PROXY_ENABLED = process.env.EXPO_PUBLIC_ISBNDB_PROXY_ENABLED === '1';

export function isIsbndbProxyConfigured(): boolean {
  return PROXY_ENABLED && SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

export interface IsbndbProxyBook {
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

/** Трохи більше за серверний таймаут ISBNdb-запиту всередині проксі (8с, `index.ts`) — щоб
 * клієнт не скасовував запит РІВНО тоді, коли сервер сам ось-ось поверне нормалізовану
 * "timeout"-відповідь замість того, щоб дати їй дійти. */
const CLIENT_TIMEOUT_MS = 10_000;

async function callProxy<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T | null> {
  if (!isIsbndbProxyConfigured()) return null;

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort);
  const timeoutId = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/isbndb-proxy`, {
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
      log.warn('ISBNdb proxy: не-OK відповідь', { status: response.status, body: bodyText.slice(0, 300) });
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    // Скасування зовнішнім `signal` (React Query — новий символ під час набору тексту,
    // `BookMetadataProvider.searchBooks`) має пробитись до виклику, той самий контракт, що й
    // в інших провайдерів. Внутрішній таймаут-abort — звичайна graceful-деградація до `null`.
    if (error instanceof Error && error.name === 'AbortError' && signal?.aborted) throw error;
    log.warn('ISBNdb proxy: помилка запиту', { error: error instanceof Error ? error.message : String(error) });
    return null;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

export const IsbndbProxyClient = {
  async search(query: string, signal?: AbortSignal): Promise<IsbndbProxyBook[]> {
    const result = await callProxy<{ books: IsbndbProxyBook[] }>({ op: 'search', query }, signal);
    return result?.books ?? [];
  },

  async lookupByIsbn(isbn: string, signal?: AbortSignal): Promise<IsbndbProxyBook | null> {
    const result = await callProxy<{ book: IsbndbProxyBook | null }>({ op: 'lookup', isbn }, signal);
    return result?.book ?? null;
  },
};
