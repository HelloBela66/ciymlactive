import { createLogger } from '@/lib/logger';

const log = createLogger('remote/sharedCatalog');

/**
 * Спільний каталог книг (Milestone 8.2, `supabase/schema.sql`) — низькорівневий клієнт до
 * Supabase PostgREST RPC (`{url}/rest/v1/rpc/{function}`), тим самим `fetch`-підходом, що й
 * усі провайдери книг (`ISBNdbProvider.ts` тощо), а не через `@supabase/supabase-js` SDK —
 * тут потрібні лише прості RPC-виклики (без auth-сесій, без realtime), і уникнення нової
 * залежності важливіше за зручність SDK.
 *
 * Ключі — `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` (та сама змінна, що вже
 * була заготовкою в `.env.example` з Milestone 0). anon-ключ навмисно публічний за дизайном
 * Supabase (вбудовується в клієнтський застосунок) — весь реальний захист на боці бекенду:
 * RLS без жодної policy + прямий доступ до таблиць відкликаний, єдиний дозволений шлях —
 * SECURITY DEFINER RPC-функції зі свого схеми (докладніше — коментар на початку
 * `supabase/schema.sql`).
 */
/** Supabase у Settings → API поруч із "Project URL" (бажаний, без шляху) також показує
 * "REST API"-поле, значення якого — той самий URL, але вже З `/rest/v1` в кінці. Легко
 * скопіювати не те поле — тоді нижче `${SUPABASE_URL}/rest/v1/rpc/${fn}` збирає невалідний,
 * подвоєний шлях `/rest/v1/rest/v1/rpc/...` (усі запити 404, мовчки — `callRpc` ковтає
 * не-OK відповідь як і будь-яку іншу мережеву помилку). Тому обрізаємо трейлінг-слеші, а
 * ПОТІМ — трейлінг `/rest/v1` (у будь-якому регістрі), якщо він є, щоб обидва варіанти
 * значення в `.env` давали однаковий, правильний результат. */
const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '')
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/i, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function isSharedCatalogConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

export interface CatalogBookRow {
  id: string;
  isbn13: string | null;
  isbn10: string | null;
  title: string;
  authors: string[];
  publisher: string | null;
  publication_year: number | null;
  page_count: number | null;
  language: string;
  description: string | null;
  cover_url: string | null;
  source_type: string;
  source_name: string;
  source_external_id: string | null;
  added_count: number;
}

export interface CatalogUpsertInput {
  isbn13?: string | null;
  isbn10?: string | null;
  title: string;
  authors: string[];
  publisher?: string | null;
  publicationYear?: number | null;
  pageCount?: number | null;
  language: string;
  description?: string | null;
  coverUrl?: string | null;
  sourceType: string;
  sourceName: string;
  sourceExternalId?: string | null;
}

/** Той самий degradation-safe підхід, що й `ISBNdbProvider.safeFetchJson`: без конфігурації
 * чи за будь-якої мережевої/HTTP помилки — `null`, ніколи не кидає в UI (спільний каталог —
 * оптимізація, а не критичний шлях, docs/LOCAL_FIRST.md — core loop лишається офлайн-first). */
async function callRpc<T>(fn: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<T | null> {
  if (!isSharedCatalogConfigured()) return null;
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
      log.warn('Спільний каталог: не-OK відповідь', { fn, status: response.status, body: bodyText.slice(0, 300) });
      return null;
    }
    if (response.status === 204) return null;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    log.warn('Спільний каталог: помилка запиту', { fn, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export const SharedCatalogClient = {
  async search(query: string, limit = 20, signal?: AbortSignal): Promise<CatalogBookRow[]> {
    const rows = await callRpc<CatalogBookRow[]>('catalog_search', { p_query: query, p_limit: limit }, signal);
    return rows ?? [];
  },

  /** «Тренди» (Milestone 11, доповнення) — топ-N книг за кількістю пристроїв, що зберегли їх
   * собі (`catalog_top_books`, `supabase/schema.sql`) — та сама анонімна агрегація, що вже
   * рахує `added_count` у `catalog_search`/`catalog_find_by_isbn`, лише як окремий
   * відсортований список замість побічного поля результату пошуку. */
  async topBooks(limit = 10, signal?: AbortSignal): Promise<CatalogBookRow[]> {
    const rows = await callRpc<CatalogBookRow[]>('catalog_top_books', { p_limit: limit }, signal);
    return rows ?? [];
  },

  async findByIsbn(isbn: string): Promise<CatalogBookRow | null> {
    const rows = await callRpc<CatalogBookRow[]>('catalog_find_by_isbn', { p_isbn: isbn });
    return rows?.[0] ?? null;
  },

  /**
   * Той самий лукап, але пробує ОБИДВА еквіваленти ISBN-13/ISBN-10 по черзі (Milestone 10
   * fix6, `docs/STATUS_V1.md` п. 3.5) — `catalog_find_by_isbn` звіряє лише ОДИН переданий
   * рядок проти обох стовпців рядка каталогу (`isbn13 = p_isbn or isbn10 = p_isbn`), тож якщо
   * викликач має, наприклад, лише ISBN-13, а конкретний запис каталогу колись був створений
   * (чи ще не мігрований) з заповненим лише ISBN-10 тієї самої книги, один запит із самим
   * ISBN-13 його не знайде. Не потребує змін на боці Supabase — `catalog_upsert_book` і так
   * приймає обидва поля, просто цей метод пробує з обох боків, замість покладатись, що
   * викликач завжди вгадає, яке поле заповнене в базі.
   */
  async findByIsbnEither(isbn13: string | null, isbn10: string | null): Promise<CatalogBookRow | null> {
    if (isbn13) {
      const row = await SharedCatalogClient.findByIsbn(isbn13);
      if (row) return row;
    }
    if (isbn10) {
      return SharedCatalogClient.findByIsbn(isbn10);
    }
    return null;
  },

  /** Пише підтверджені метадані в каталог — викликається лише ПІСЛЯ того, як користувач сам
   * зберіг книгу через зовнішній провайдер (докладніше — `src/data/remote/catalogSync.ts`).
   * Повертає `null` замість кидання помилки за будь-якого збою — це best-effort фонова дія,
   * ніколи не має заблокувати чи зіпсувати локальне збереження книги користувачу. */
  async upsertBook(input: CatalogUpsertInput): Promise<string | null> {
    if (!input.isbn13 && !input.isbn10) return null;
    const rows = await callRpc<Array<{ id: string }>>('catalog_upsert_book', {
      p_isbn13: input.isbn13 ?? null,
      p_isbn10: input.isbn10 ?? null,
      p_title: input.title,
      p_authors: input.authors,
      p_publisher: input.publisher ?? null,
      p_publication_year: input.publicationYear ?? null,
      p_page_count: input.pageCount ?? null,
      p_language: input.language,
      p_description: input.description ?? null,
      p_cover_url: input.coverUrl ?? null,
      p_source_type: input.sourceType,
      p_source_name: input.sourceName,
      p_source_external_id: input.sourceExternalId ?? null,
    });
    return rows?.[0]?.id ?? null;
  },

  /** `isbn13`/`isbn10` — не uuid каталогу: клієнт на момент "додати/прибрати з бібліотеки"
   * знає лише ISBN локального видання. Якщо книги з таким ISBN у каталозі ще немає (наприклад,
   * додана вручну без ISBN) — сервер тихо ігнорує виклик (`supabase/schema.sql`), не помилка. */
  async markAdded(isbn: { isbn13?: string | null; isbn10?: string | null }, deviceId: string): Promise<void> {
    if (!isbn.isbn13 && !isbn.isbn10) return;
    await callRpc('catalog_mark_added', { p_isbn13: isbn.isbn13 ?? null, p_isbn10: isbn.isbn10 ?? null, p_device_id: deviceId });
  },

  async markRemoved(isbn: { isbn13?: string | null; isbn10?: string | null }, deviceId: string): Promise<void> {
    if (!isbn.isbn13 && !isbn.isbn10) return;
    await callRpc('catalog_mark_removed', { p_isbn13: isbn.isbn13 ?? null, p_isbn10: isbn.isbn10 ?? null, p_device_id: deviceId });
  },

  /** "Додати обкладинку" (Milestone 10) — заповнює `cover_url` в каталозі, ЛИШЕ якщо книга
   * там уже є й обкладинки в неї ще немає (`supabase/schema.sql`, `catalog_set_cover_if_missing`
   * ніколи не перезаписує наявну). Якщо книги з таким ISBN у каталозі взагалі немає — виклик
   * тихо нічого не робить, той самий випадок вирішує `upsertBook` (`catalogSync.ts`). */
  async setCoverIfMissing(isbn: { isbn13?: string | null; isbn10?: string | null }, coverUrl: string): Promise<void> {
    if (!isbn.isbn13 && !isbn.isbn10) return;
    await callRpc('catalog_set_cover_if_missing', {
      p_isbn13: isbn.isbn13 ?? null,
      p_isbn10: isbn.isbn10 ?? null,
      p_cover_url: coverUrl,
    });
  },
};
