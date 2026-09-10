// Полиця — cover-upload proxy (Supabase Edge Function, Deno)
//
// POLYTSIA V1.5, Фаза 1.2 (docs/SECURITY.md, знахідка 🟡 "Supabase Storage bucket `book-covers`
// приймає необмежену кількість анонімних завантажень"). Архітектура: Мобільний застосунок →
// ця функція → Supabase Storage (bucket `book-covers`, `supabase/schema.sql`).
//
// До цієї фази клієнт (`src/data/remote/coverStorageClient.ts`) писав У СХОВИЩЕ НАПРЯМУ через
// anon-ключ (`POST /storage/v1/object/book-covers/{path}`), а `{path}` (ім'я файлу в bucket)
// будував САМ КЛІЄНТ (`${editionId}-${Date.now()}.jpg`, `app/cover-photo/[editionId].tsx`) —
// рівно те, що явно заборонено в ТЗ цієї фази ("не довіряй клієнтському імені файлу як шляху
// сховища"), і, окремо, anon-ключ публічний за дизайном, тож будь-хто міг заливати файли в
// циклі без жодного ліміту, крім MIME/розміру самого bucket (`docs/SECURITY.md`).
//
// Тепер: клієнт шле сирі байти зображення (не JSON — сам файл як тіло запиту, `Content-Type`
// заголовок — заявлений тип, ПЕРЕВІРЯЄТЬСЯ нижче за реальними magic bytes, не лише довіряється)
// сюди; ця функція:
//   1. Перевіряє реальний тип файлу за перші байти (JPEG/PNG signature), а не за Content-Type
//      заголовком (його клієнт міг проставити неправильно чи зловмисно).
//   2. Обмежує розмір тіла запиту (той самий ліміт, що й bucket, 5 МБ) — реальний підрахунок
//      байтів під час стріму, не лише довіра `Content-Length`.
//   3. Генерує шлях об'єкта сама, `crypto.randomUUID()` + розширення за реальним типом — НІКОЛИ
//      з клієнтського рядка (ні editionId, ні timestamp, ні що-небудь ще від клієнта). Це разом
//      унеможливлює і "довільний шлях у bucket", і path traversal (шлях не будується з жодного
//      клієнтського рядка взагалі, нема що "traversal"-ити).
//   4. Сама завантажує байти в Storage через `service_role` ключ (Supabase проставляє його в
//      середовище автоматично) — обходить RLS `storage.objects` повністю, той самий принцип,
//      що й скрипт `sync-curated-books.js` для `curated_book`.
//   5. Rate limiting — той самий спільний механізм, що й `isbndb-proxy` (`../_shared/rateLimit.ts`,
//      `edge_rate_limit_check`, `supabase/schema.sql`) — за IP клієнта, окремий bucket-префікс
//      `cover-upload`, ЛИШЕ ліміти щедріші за ISBNdb (тут ризик — не пряма оплата за запит, а
//      вичерпання квоти сховища/трафіку Supabase, `docs/SECURITY.md`).
//
// Після цієї фази `supabase/schema.sql` більше НЕ дає anon/authenticated жодного прямого
// INSERT у `storage.objects` для bucket `book-covers` — цю policy прибрано повністю. Читання
// (`public: true` на самому bucket) лишається відкритим навмисно: обкладинки мають бути
// публічно доступні (у застосунку, у спільному каталозі) — небезпечним був саме запис, не
// читання.

import { CORS_HEADERS } from '../_shared/cors.ts';
import { checkRateLimitWindows, getClientIp } from '../_shared/rateLimit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BUCKET = 'book-covers';

const MAX_UPLOAD_BYTES = 5_242_880; // той самий ліміт, що й `file_size_limit` bucket'а (schema.sql)
const UPSTREAM_TIMEOUT_MS = 10_000;

const RATE_LIMIT_WINDOWS = {
  // Щедріше за isbndb-proxy: обкладинки — рідкісна дія (одна на книгу), і сам ризик тут —
  // вичерпання квоти сховища/трафіку, не пряма оплата за кожен запит.
  burst: { limit: 10, windowSeconds: 60 },
  sustained: { limit: 100, windowSeconds: 86_400 },
};

type ErrorCode =
  | 'method_not_allowed'
  | 'not_configured'
  | 'bad_request'
  | 'unsupported_media_type'
  | 'payload_too_large'
  | 'rate_limited'
  | 'timeout'
  | 'upstream_error';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, code: ErrorCode, message: string): Response {
  return jsonResponse(status, { error: message, code });
}

/** JPEG: перші 3 байти `FF D8 FF`. PNG: 8-байтовий сигнатурний заголовок. Перевірка за
 * РЕАЛЬНИМ вмістом файлу — клієнтський `Content-Type` заголовок є нижче лише підказкою, не
 * джерелом істини (тривіально підмінити). `allowed_mime_types` bucket'а (schema.sql) — той
 * самий список (jpeg/png), тепер підтверджений і тут, до того, як байти взагалі підуть у
 * Storage. */
function sniffImageType(bytes: Uint8Array): { mime: string; extension: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= pngSignature.length && pngSignature.every((byte, i) => bytes[i] === byte)) {
    return { mime: 'image/png', extension: 'png' };
  }
  return null;
}

/** Читає тіло запиту з жорсткою межею байтів (не лише `Content-Length`) — той самий підхід, що
 * `isbndb-proxy/index.ts` `readBodyWithLimit`, тут — для вхідного запиту, а не відповіді
 * ISBNdb (симетричний ризик: клієнт міг би спробувати надіслати величезне тіло навмисно). */
async function readRequestBodyWithLimit(req: Request, maxBytes: number): Promise<Uint8Array | 'too_large'> {
  const reader = req.body?.getReader();
  if (!reader) {
    const buffer = new Uint8Array(await req.arrayBuffer());
    return buffer.byteLength > maxBytes ? 'too_large' : buffer;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return 'too_large';
      }
      chunks.push(value);
    }
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Лише POST.');
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    // Нетипово — Supabase зазвичай проставляє обидва автоматично для будь-якої Edge Function
    // проєкту — але без них немає способу безпечно записати в Storage, тож саме тут це
    // помилка сервера (не graceful "тихо вимкнено", на відміну від ISBNdb-ключа: без цього
    // функція структурно не може виконати свою єдину роботу).
    return errorResponse(503, 'not_configured', 'Сховище обкладинок ще не налаштовано на сервері.');
  }

  const clientIp = getClientIp(req);
  const rateLimitOk = await checkRateLimitWindows(SUPABASE_URL, SERVICE_ROLE_KEY, `cover-upload:${clientIp}`, RATE_LIMIT_WINDOWS);
  if (!rateLimitOk) {
    return errorResponse(429, 'rate_limited', 'Забагато завантажень. Спробуй трохи пізніше.');
  }

  const declaredContentType = req.headers.get('content-type') ?? '';
  if (!declaredContentType.startsWith('image/')) {
    return errorResponse(415, 'unsupported_media_type', 'Content-Type має бути image/jpeg або image/png.');
  }

  const body = await readRequestBodyWithLimit(req, MAX_UPLOAD_BYTES);
  if (body === 'too_large') {
    return errorResponse(413, 'payload_too_large', `Файл завеликий (максимум ${MAX_UPLOAD_BYTES} байт).`);
  }
  if (body.byteLength === 0) {
    return errorResponse(400, 'bad_request', 'Порожнє тіло запиту.');
  }

  const detected = sniffImageType(body);
  if (!detected) {
    return errorResponse(415, 'unsupported_media_type', 'Файл не схожий на JPEG чи PNG (перевірено за вмістом, не лише заголовком).');
  }

  // Шлях об'єкта — ЛИШЕ з даних, які згенерувала сама функція: жодного клієнтського рядка тут
  // немає взагалі (ні editionId, ні ім'я файлу, ні timestamp від клієнта) — унеможливлює і
  // "довільний шлях у bucket", і path traversal за конструкцією, не перевіркою.
  const objectPath = `${crypto.randomUUID()}.${detected.extension}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const uploadResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': detected.mime,
        // Новий випадковий UUID-шлях — колізія практично неможлива, тож перезапис тут завжди
        // означав би щось піти не так, а не легітимний повторний аплоад; `x-upsert: false`
        // (замість `true`, як було в старому прямому клієнтському виклику) — зайвий, дешевий
        // запобіжник.
        'x-upsert': 'false',
      },
      body,
      signal: controller.signal,
    });

    if (!uploadResponse.ok) {
      const bodyText = await uploadResponse.text().catch(() => '');
      return errorResponse(502, 'upstream_error', `Storage HTTP ${uploadResponse.status}: ${bodyText.slice(0, 200)}`);
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
    return jsonResponse(200, { url: publicUrl, path: objectPath });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return errorResponse(504, 'timeout', 'Сховище не відповіло вчасно.');
    }
    return errorResponse(502, 'upstream_error', error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeoutId);
  }
});
