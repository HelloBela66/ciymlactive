import { createLogger } from '@/lib/logger';

const log = createLogger('remote/curatedCatalog');

/**
 * Кураторський каталог рекомендацій (Milestone 11, доповнення, `supabase/schema.sql` таблиця
 * `curated_book`) — той самий низькорівневий `fetch`-до-PostgREST-RPC підхід, що й
 * `sharedCatalogClient.ts` (навмисно окремий файл, не розширення того самого клієнта: різні
 * таблиці, різні RPC, і `curated_book`, на відміну від `catalog_book`, НІКОЛИ не приймає
 * записів з anon-ключа — лише читання, докладніше — коментар над `curated_book` у
 * `supabase/schema.sql`). Той самий anon-ключ/URL, що й спільний каталог — окрема функція
 * "чи налаштовано" лишається окремою для симетрії з рештою клієнтів (кожен провайдер сам
 * перевіряє свою конфігурацію), а не через залежність від `sharedCatalogClient.ts`.
 */
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '')
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/i, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function isCuratedCatalogConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

export interface CuratedBookRow {
  id: string;
  title: string;
  authors: string[];
  isbn13: string | null;
  isbn10: string | null;
  page_count: number | null;
  cover_url: string | null;
  description: string | null;
  language: string;
  genres: string[];
  purposes: string[];
}

async function callRpc<T>(fn: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<T | null> {
  if (!isCuratedCatalogConfigured()) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
      signal,
    });
    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      log.warn('Кураторський каталог: не-OK відповідь', { fn, status: response.status, body: bodyText.slice(0, 300) });
      return null;
    }
    if (response.status === 204) return null;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    log.warn('Кураторський каталог: помилка запиту', { fn, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export const CuratedCatalogClient = {
  async search(query: string, limit = 20, signal?: AbortSignal): Promise<CuratedBookRow[]> {
    const rows = await callRpc<CuratedBookRow[]>('curated_book_search', { p_query: query, p_limit: limit }, signal);
    return rows ?? [];
  },

  /** «Що почитати завтра?» (`useTomorrowRecommendation.ts`) — жанр обов'язковий, мета лише
   * впливає на порядок (перший рівень пріоритету — `useTomorrowRecommendation.ts` усе одно
   * далі ранжує весь пул за бюджетом часу, `pickCandidate`). */
  async recommend(genreNameUk: string, purpose: string, limit = 30, signal?: AbortSignal): Promise<CuratedBookRow[]> {
    const rows = await callRpc<CuratedBookRow[]>(
      'curated_book_recommend',
      { p_genre: genreNameUk, p_purpose: purpose, p_limit: limit },
      signal,
    );
    return rows ?? [];
  },

  async findByIsbn(isbn: string): Promise<CuratedBookRow | null> {
    const rows = await callRpc<CuratedBookRow[]>('curated_book_find_by_isbn', { p_isbn: isbn });
    return rows?.[0] ?? null;
  },

  async getById(id: string): Promise<CuratedBookRow | null> {
    const rows = await callRpc<CuratedBookRow[]>('curated_book_get', { p_id: id });
    return rows?.[0] ?? null;
  },
};
