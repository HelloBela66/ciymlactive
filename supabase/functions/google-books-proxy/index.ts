// Полиця — Google Books proxy (Supabase Edge Function, Deno)
//
// POLYTSIA V1.6.1, Фаза 4 (docs/V1_6_FULL_AUDIT_REPORT.md, розділ 26 і 32 — "Google Books ключ
// незахищений у клієнті"; docs/SECURITY.md, знахідка 🟡). Архітектура: Мобільний застосунок →
// ця функція → www.googleapis.com/books/v1.
//
// НА ВІДМІНУ від `isbndb-proxy` поруч (ISBNdb — платний сервіс, без ключа не працює взагалі),
// Google Books API безкоштовний і публічно доступний навіть БЕЗ ключа (з нижчою анонімною
// квотою) — `GOOGLE_BOOKS_API_KEY` тут лише піднімає квоту, не є умовою роботи. Тому ця функція
// НЕ має "not_configured" відмови: працює і без секрету (проксує анонімно), і з секретом
// (проксує з ключем, вища квота) — той самий "безключовий → з ключем" градієнт, що раніше жив
// прямо в мобільному клієнті (`GoogleBooksProvider.ts` до цієї фази), просто тепер сам ключ (коли
// власник продукту його додасть) живе лише тут, а не в клієнтському бандлі.
//
// Реальний ризик, який ця функція закриває — НЕ пряма оплата за запит (Google Books безкоштовний),
// а вичерпання ДЕННОЇ КВОТИ власника продукту: будь-хто, хто розпакує зібраний застосунок і
// дістане звідти `EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY`, міг скриптом вичерпати підвищену квоту
// власника — реальні користувачі застосунку тоді впали б назад на низьку анонімну квоту (DoS
// власної аудиторії, не фінансові збитки). Той самий шлюз-патерн, що й `isbndb-proxy`/
// `cover-upload`, закриває це структурно: ключ більше ніколи не потрапляє в клієнтський бандл.
//
// Три операції — рівно ті, що реально потрібні `GoogleBooksProvider.ts` (`searchBooks`/
// `lookupByISBN`/`getEdition`): `search` (запит + опційний `langRestrict`), `lookup` (за ISBN,
// той самий `q=isbn:...` трюк, що вже був у клієнті), `get_edition` (пряме `GET /volumes/{id}`
// для вже обраного результату пошуку).
//
// Ключ доступу до самої функції: стандартна Supabase JWT-перевірка (`verify_jwt` лишається
// увімкненим — не додавай `--no-verify-jwt` при деплої) — той самий перший, безкоштовний рубіж,
// що й `isbndb-proxy`.
//
// Rate limiting — той самий спільний механізм (`../_shared/rateLimit.ts`, `edge_rate_limit_check`,
// `supabase/schema.sql`), окремий bucket-префікс `google-books-proxy`, ЩЕДРІШІ ліміти за
// `isbndb-proxy`: Google Books — безкоштовне ПЕРШЕ джерело пошуку (викликається на кожен
// дебаунсений символ пошуку, `useProviderSearch`), а не другорядне платне джерело, тож типовий
// легітимний трафік на порядок вищий. Той самий задокументований залишковий ризик IP-based
// rate limiting, що й в `isbndb-proxy`/`docs/SECURITY.md`.

import { CORS_HEADERS } from '../_shared/cors.ts';
import { checkRateLimitWindows, getClientIp } from '../_shared/rateLimit.ts';

const API_BASE = 'https://www.googleapis.com/books/v1/volumes';
const API_KEY = Deno.env.get('GOOGLE_BOOKS_API_KEY') ?? '';

const UPSTREAM_TIMEOUT_MS = 8_000;
/** Той самий "response size bomb" захист, що й `isbndb-proxy/index.ts` — Google Books-відповіді
 * теоретично можуть бути великими (до 40 результатів з повним `description` кожен). */
const MAX_UPSTREAM_BODY_BYTES = 2_000_000;
const MAX_QUERY_LENGTH = 200;
const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 20; // той самий `maxResults`, що вже був у клієнтському `fetchVolumes`.

const RATE_LIMIT_WINDOWS = {
  burst: { limit: 30, windowSeconds: 60 },
  sustained: { limit: 2_000, windowSeconds: 86_400 },
};

type ErrorCode =
  | 'method_not_allowed'
  | 'bad_request'
  | 'rate_limited'
  | 'timeout'
  | 'upstream_error'
  | 'response_too_large';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, code: ErrorCode, message: string): Response {
  return jsonResponse(status, { error: message, code });
}

/** Той самий склад полів, що й `ProxyBook` у `isbndb-proxy/index.ts` і клієнтський
 * `RawProviderBook` (`src/data/providers/BookMetadataProvider.ts`) — обидва проксі свідомо
 * повертають ОДНАКОВУ нормалізовану форму, тож `GoogleBooksProxyClient`/`ISBNdbProxyClient` на
 * клієнті лишаються дзеркальними одне одного. */
interface ProxyBook {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** М'яка перевірка (той самий принцип, що й `isbndb-proxy`'s `toProxyBook`) — лише `title`
 * обов'язковий (той самий "не всі поля завжди присутні" нюанс, що вже документував клієнтський
 * `VolumeInfoSchema` коментар до цієї фази: Google Books у бойових відповідях не завжди дає
 * навіть `authors`/`publisher`). */
function toProxyBook(volume: unknown): ProxyBook | null {
  if (!isRecord(volume)) return null;
  const id = typeof volume.id === 'string' ? volume.id : null;
  const info = isRecord(volume.volumeInfo) ? volume.volumeInfo : null;
  const title = info && typeof info.title === 'string' ? info.title : null;
  if (!id || !title) return null;

  const authors = Array.isArray(info?.authors) ? info.authors.filter((a): a is string => typeof a === 'string') : [];
  const identifiers = Array.isArray(info?.industryIdentifiers) ? info.industryIdentifiers : [];
  const isbn10 = identifiers.find(
    (i): i is { type: string; identifier: string } =>
      isRecord(i) && i.type === 'ISBN_10' && typeof i.identifier === 'string',
  )?.identifier;
  const isbn13 = identifiers.find(
    (i): i is { type: string; identifier: string } =>
      isRecord(i) && i.type === 'ISBN_13' && typeof i.identifier === 'string',
  )?.identifier;
  const imageLinks = isRecord(info?.imageLinks) ? info.imageLinks : null;
  const rawCoverUrl =
    (typeof imageLinks?.thumbnail === 'string' && imageLinks.thumbnail) ||
    (typeof imageLinks?.smallThumbnail === 'string' && imageLinks.smallThumbnail) ||
    undefined;

  return {
    externalId: id,
    title,
    authors,
    isbn10,
    isbn13,
    publisher: typeof info?.publisher === 'string' ? info.publisher : undefined,
    publicationDate: typeof info?.publishedDate === 'string' ? info.publishedDate : undefined,
    pageCount:
      typeof info?.pageCount === 'number' && Number.isInteger(info.pageCount) && info.pageCount > 0
        ? info.pageCount
        : undefined,
    language: typeof info?.language === 'string' ? info.language : undefined,
    description: typeof info?.description === 'string' ? info.description : undefined,
    // https:// заміна — той самий нюанс, що й клієнтський `toRawBook` до цієї фази: Google
    // Books інколи повертає http:// у thumbnail, а картинки в застосунку йдуть через https.
    coverUrl: rawCoverUrl?.replace(/^http:\/\//, 'https://'),
  };
}

/** Той самий "реально рахуй байти під час стріму" підхід, що й `isbndb-proxy/index.ts`. */
async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return response.text();

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('response_too_large');
      }
      chunks.push(value);
    }
  }
  return new TextDecoder().decode(concatChunks(chunks, total));
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function withApiKey(url: string): string {
  if (!API_KEY) return url;
  return `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(API_KEY)}`;
}

async function fetchGoogleBooks(path: string): Promise<{ ok: true; json: unknown } | { ok: false; code: ErrorCode; detail: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(withApiKey(path), { signal: controller.signal });
    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      console.error(`google-books-proxy: upstream ${response.status} for ${path}: ${bodyText.slice(0, 300)}`);
      return { ok: false, code: 'upstream_error', detail: `Google Books HTTP ${response.status}` };
    }
    let bodyText: string;
    try {
      bodyText = await readBodyWithLimit(response, MAX_UPSTREAM_BODY_BYTES);
    } catch {
      return { ok: false, code: 'response_too_large', detail: 'Відповідь Google Books завелика' };
    }
    try {
      return { ok: true, json: JSON.parse(bodyText) };
    } catch {
      return { ok: false, code: 'upstream_error', detail: 'Google Books повернув не-JSON' };
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, code: 'timeout', detail: 'Google Books не відповів вчасно' };
    }
    return { ok: false, code: 'upstream_error', detail: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Лише POST.');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'bad_request', 'Тіло запиту має бути JSON.');
  }
  if (!isRecord(body) || (body.op !== 'search' && body.op !== 'lookup' && body.op !== 'get_edition')) {
    return errorResponse(400, 'bad_request', 'Очікується { op: "search" | "lookup" | "get_edition", ... }.');
  }

  const clientIp = getClientIp(req);
  const rateLimitOk = await checkRateLimitWindows(
    supabaseUrl,
    serviceRoleKey,
    `google-books-proxy:${clientIp}`,
    RATE_LIMIT_WINDOWS,
  );
  if (!rateLimitOk) {
    return errorResponse(429, 'rate_limited', 'Забагато запитів. Спробуй трохи пізніше.');
  }

  if (body.op === 'search') {
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
      return errorResponse(
        400,
        'bad_request',
        `Пошуковий запит має бути від ${MIN_QUERY_LENGTH} до ${MAX_QUERY_LENGTH} символів.`,
      );
    }
    const langRestrict = typeof body.langRestrict === 'string' ? body.langRestrict.trim() : '';
    const langParam = langRestrict ? `&langRestrict=${encodeURIComponent(langRestrict)}` : '';

    const result = await fetchGoogleBooks(`${API_BASE}?q=${encodeURIComponent(query)}&maxResults=${MAX_RESULTS}${langParam}`);
    if (!result.ok) {
      const status = result.code === 'timeout' ? 504 : 502;
      return errorResponse(status, result.code, result.detail);
    }
    const json = result.json;
    const rawItems: unknown[] = isRecord(json) && Array.isArray(json.items) ? json.items : [];
    const books = rawItems.map(toProxyBook).filter((b): b is ProxyBook => b !== null);
    return jsonResponse(200, { books });
  }

  if (body.op === 'lookup') {
    const isbn = typeof body.isbn === 'string' ? body.isbn.replace(/[\s-]/g, '') : '';
    if (isbn.length < 10 || isbn.length > 13) {
      return errorResponse(400, 'bad_request', 'Некоректний ISBN.');
    }
    const result = await fetchGoogleBooks(`${API_BASE}?q=isbn:${encodeURIComponent(isbn)}`);
    if (!result.ok) {
      const status = result.code === 'timeout' ? 504 : 502;
      return errorResponse(status, result.code, result.detail);
    }
    const json = result.json;
    const rawItems: unknown[] = isRecord(json) && Array.isArray(json.items) ? json.items : [];
    const book = rawItems.map(toProxyBook).find((b): b is ProxyBook => b !== null) ?? null;
    return jsonResponse(200, { book });
  }

  // op === 'get_edition'
  const externalId = typeof body.externalId === 'string' ? body.externalId.trim() : '';
  if (!externalId) {
    return errorResponse(400, 'bad_request', 'Очікується непорожній externalId.');
  }
  const result = await fetchGoogleBooks(`${API_BASE}/${encodeURIComponent(externalId)}`);
  if (!result.ok) {
    const status = result.code === 'timeout' ? 504 : 502;
    return errorResponse(status, result.code, result.detail);
  }
  const book = toProxyBook(result.json);
  return jsonResponse(200, { book });
});
