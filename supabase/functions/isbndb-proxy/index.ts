// Полиця — ISBNdb proxy (Supabase Edge Function, Deno)
//
// POLYTSIA V1.5, Фаза 1.1 (docs/SECURITY.md, знахідка 🔴 "Платний ключ ISBNdb іде прямо в
// клієнтський білд"). Архітектура: Мобільний застосунок → ця функція → ISBNdb.
//
// Платний ключ ISBNdb (`ISBNDB_API_KEY`) живе ЛИШЕ тут, як Supabase secret (`supabase secrets
// set ISBNDB_API_KEY=...`, докладніше — README.md поруч) — НІКОЛИ не `EXPO_PUBLIC_*`, НІКОЛИ в
// клієнтському бандлі, НІКОЛИ в git. Мобільний застосунок отримує лише нормалізовану форму
// книги (той самий набір полів, що й `RawProviderBook`, `src/data/providers/BookMetadataProvider.ts`,
// мінус `addedCount`, яке ISBNdb не дає) — жодних службових полів ISBNdb (binding, dewey_decimal,
// subjects, msrp тощо) назовні не йде.
//
// Ключ доступу до самої функції: Supabase залишає стандартну JWT-перевірку платформи увімкненою
// (`verify_jwt` НЕ вимкнено в конфігурації деплою) — клієнт передає `apikey`/`Authorization:
// Bearer <anon-ключ>`, той самий заголовок, що й для решти RPC-клієнтів застосунку
// (`curatedCatalogClient.ts`). Це не "авторизація" в сенсі користувача (anon-ключ навмисно
// публічний), але це відсікає найпростіше сканування інтернету ботами без жодного Supabase-
// ключа ще ДО того, як код цієї функції взагалі почне виконуватись — дешевий перший рубіж,
// поверх якого стоїть ще й rate limit нижче.
//
// Rate limiting (до появи Auth немає стабільного "хто саме" — п. Фаза 1.1 ТЗ: "якщо повний
// per-user rate limiting неможливий до Auth — найкращий безпечний pre-auth варіант і
// задокументований залишковий ризик"): лічильник за IP-адресою (заголовок `x-forwarded-for` від
// платформи Supabase), збережений у Postgres (`edge_rate_limit_check` RPC, `supabase/schema.sql`)
// — переживає холодний старт і працює однаково для будь-якої кількості інстансів функції (на
// відміну від лічильника в пам'яті процесу). Два вікна одразу: короткий "burst" (за замовчуванням
// 20 запитів/60с) проти скрипта в циклі, і довший "sustained" (300 запитів/добу) проти повільного
// вичерпання платної квоти. ЗАЛИШКОВИЙ РИЗИК (задокументовано тут і в docs/SECURITY.md): IP —
// недосконалий ідентифікатор (спільний NAT/мобільний оператор може об'єднувати багатьох реальних
// користувачів під одним IP; VPN/проксі дають зловмиснику новий IP на вимогу) — це "найкращий
// безпечний pre-auth варіант", не гарантія від цілеспрямованого зловживання. Справжній per-
// користувач ліміт вимагає Supabase Auth (свідомо поза межами цього milestone).

import { isValidIsbn } from './isbn.ts';
import { CORS_HEADERS } from '../_shared/cors.ts';
import { checkRateLimitWindows, getClientIp } from '../_shared/rateLimit.ts';

const ISBNDB_API_BASE = 'https://api2.isbndb.com';
const ISBNDB_API_KEY = Deno.env.get('ISBNDB_API_KEY') ?? '';

const UPSTREAM_TIMEOUT_MS = 8_000;
/** Захист від "response size bomb" — і зі сторони ISBNdb (малоймовірно, але дешево перевірити),
 * і зі сторони будь-кого, хто підмінить `ISBNDB_API_KEY`/URL помилково на щось інше. */
const MAX_UPSTREAM_BODY_BYTES = 2_000_000;
const MAX_QUERY_LENGTH = 200;
const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 40;

const RATE_LIMIT_WINDOWS = {
  burst: { limit: 20, windowSeconds: 60 },
  sustained: { limit: 300, windowSeconds: 86_400 },
};

type ErrorCode =
  | 'method_not_allowed'
  | 'not_configured'
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

/** М'яка перевірка — та сама причина, що й у мобільному `ISBNdbProvider.ts` раніше: офіційна
 * документація ISBNdb v2 і реальні відповіді розходяться (наприклад, опис іноді `synopsis`,
 * іноді `synopsys` — друкарська помилка в самому API). Довіряємо лише `title`, решта — best
 * effort; жодне поле, крім title, не є обов'язковим для того, щоб рядок вважався книгою. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toProxyBook(raw: unknown): ProxyBook | null {
  if (!isRecord(raw)) return null;
  const title = typeof raw.title === 'string' ? raw.title : null;
  if (!title) return null;

  const isbn = typeof raw.isbn === 'string' ? raw.isbn : undefined;
  const isbn13 = typeof raw.isbn13 === 'string' ? raw.isbn13 : undefined;
  const authors = Array.isArray(raw.authors) ? raw.authors.filter((a): a is string => typeof a === 'string') : [];
  const description =
    (typeof raw.synopsis === 'string' && raw.synopsis) ||
    (typeof raw.synopsys === 'string' && raw.synopsys) ||
    (typeof raw.overview === 'string' && raw.overview) ||
    undefined;

  return {
    externalId: isbn13 ?? isbn ?? title,
    title,
    authors,
    isbn10: isbn && isbn.length === 10 ? isbn : undefined,
    isbn13,
    publisher: typeof raw.publisher === 'string' ? raw.publisher : undefined,
    publicationDate: typeof raw.date_published === 'string' ? raw.date_published : undefined,
    pageCount: typeof raw.pages === 'number' && raw.pages > 0 ? raw.pages : undefined,
    language: typeof raw.language === 'string' ? raw.language : undefined,
    description,
    coverUrl: typeof raw.image === 'string' ? raw.image : undefined,
  };
}

/** Читає тіло відповіді з жорсткою межею байтів — не покладається лише на `Content-Length`
 * (заголовок можна не надіслати чи надіслати хибним), реально рахує байти під час стріму й
 * перериває з'єднання, щойно перевищено межу, замість того, щоб спершу вичерпати пам'ять
 * інстансу функції на величезну/шкідливу відповідь. */
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

async function fetchIsbndb(path: string): Promise<{ ok: true; json: unknown } | { ok: false; code: ErrorCode; detail: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(`${ISBNDB_API_BASE}${path}`, {
      headers: { Authorization: ISBNDB_API_KEY },
      signal: controller.signal,
    });
    if (!response.ok) {
      // ISBNdb: 404 на /book/{isbn} — "немає такого ISBN у їхній базі" (нормальний результат,
      // не помилка) — той самий нюанс, що був у коментарі мобільного ISBNdbProvider.ts раніше.
      if (response.status === 404) return { ok: true, json: null };
      return { ok: false, code: 'upstream_error', detail: `ISBNdb HTTP ${response.status}` };
    }
    let bodyText: string;
    try {
      bodyText = await readBodyWithLimit(response, MAX_UPSTREAM_BODY_BYTES);
    } catch {
      return { ok: false, code: 'response_too_large', detail: 'Відповідь ISBNdb завелика' };
    }
    try {
      return { ok: true, json: JSON.parse(bodyText) };
    } catch {
      return { ok: false, code: 'upstream_error', detail: 'ISBNdb повернув не-JSON' };
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, code: 'timeout', detail: 'ISBNdb не відповів вчасно' };
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

  if (!ISBNDB_API_KEY) {
    // Власник продукту ще не задеплоїв секрет (`supabase secrets set ISBNDB_API_KEY=...`,
    // README.md поруч) — те саме "тихе вимкнено", що раніше давало відсутність клієнтського
    // ключа: не помилка сервера, а очікуваний стан "ISBNdb ще не підключено".
    return errorResponse(503, 'not_configured', 'ISBNdb ще не налаштовано на сервері.');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'bad_request', 'Тіло запиту має бути JSON.');
  }
  if (!isRecord(body) || (body.op !== 'search' && body.op !== 'lookup')) {
    return errorResponse(400, 'bad_request', 'Очікується { op: "search" | "lookup", ... }.');
  }

  const clientIp = getClientIp(req);
  const rateLimitOk = await checkRateLimitWindows(supabaseUrl, serviceRoleKey, `isbndb-proxy:${clientIp}`, RATE_LIMIT_WINDOWS);
  if (!rateLimitOk) {
    return errorResponse(429, 'rate_limited', 'Забагато запитів. Спробуй трохи пізніше.');
  }
  // Якщо SUPABASE_URL/SERVICE_ROLE_KEY не задано (нетипово — Supabase зазвичай проставляє їх
  // автоматично для будь-якої Edge Function проєкту) — той самий «fail open» компроміс, що й
  // усередині `checkRateLimitWindows`: краще працювати без rate limit, ніж повністю відмовити
  // в сервісі.

  if (body.op === 'search') {
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
      return errorResponse(
        400,
        'bad_request',
        `Пошуковий запит має бути від ${MIN_QUERY_LENGTH} до ${MAX_QUERY_LENGTH} символів.`,
      );
    }

    const result = await fetchIsbndb(`/books/${encodeURIComponent(query)}`);
    if (!result.ok) {
      const status = result.code === 'timeout' ? 504 : result.code === 'response_too_large' ? 502 : 502;
      return errorResponse(status, result.code, result.detail);
    }
    const json = result.json;
    const rawBooks: unknown[] = isRecord(json)
      ? (Array.isArray(json.books) ? json.books : Array.isArray(json.data) ? json.data : [])
      : [];
    const books = rawBooks
      .map(toProxyBook)
      .filter((b): b is ProxyBook => b !== null)
      .slice(0, MAX_RESULTS);
    return jsonResponse(200, { books });
  }

  // op === 'lookup'
  const isbn = typeof body.isbn === 'string' ? body.isbn.replace(/[\s-]/g, '').toUpperCase() : '';
  if (!isValidIsbn(isbn)) {
    return errorResponse(400, 'bad_request', 'Некоректний ISBN (перевір контрольну цифру).');
  }

  const result = await fetchIsbndb(`/book/${encodeURIComponent(isbn)}`);
  if (!result.ok) {
    const status = result.code === 'timeout' ? 504 : 502;
    return errorResponse(status, result.code, result.detail);
  }
  if (result.json === null) {
    return jsonResponse(200, { book: null });
  }
  const bookJson = isRecord(result.json) ? result.json.book : null;
  const book = toProxyBook(bookJson);
  return jsonResponse(200, { book });
});
