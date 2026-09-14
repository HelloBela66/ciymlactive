'use strict';

/**
 * КАТАЛОГ-ІМПОРТ — cover pipeline (ТЗ §16-22, §43-44, §52-54): fetch → перевір HTTP → перевір
 * РЕАЛЬНУ сигнатуру байтів (не Content-Type заголовок, який сервер джерела міг вказати
 * неправильно чи це взагалі HTML-сторінка помилки під виглядом `.jpg`) → ліміт розміру →
 * upload у ВЛАСНЕ (Polytsia-контрольоване) Supabase Storage, bucket `book-covers`
 * (`supabase/schema.sql`) → повертає ВЛАСНИЙ public URL, ніколи URL джерела (ТЗ §17).
 *
 * Сигнатура JPEG/PNG (`sniffImageType`) — НАВМИСНА ЧАСТКОВА ДУБЛІКАЦІЯ
 * `supabase/functions/cover-upload/index.ts`'s `sniffImageType`: та функція виконується в
 * Deno (Supabase Edge Function), цей файл — у Node (CLI-скрипт), різні рантайми без спільного
 * бандлера (той самий клас причини, що вже задокументований для `csv.js`/`isbn.js` у цій теці).
 * `book-covers` bucket дозволяє ЛИШЕ `image/jpeg`/`image/png` (`allowed_mime_types`,
 * `supabase/schema.sql`) — WebP тут НЕ підтримується самим сховищем, тож пайплайн навмисно НЕ
 * конвертує у WebP (ілюстрація в ТЗ §18/20 — лише приклад, не вимога; реальна bucket-політика
 * важливіша за ілюстративний приклад, ТЗ §3 "Adapt цього prompt до реальної architecture").
 *
 * Пайплайн НЕ виконує ресемплінг/перестиск зображення (ТЗ §20 "reasonable mobile-display
 * dimensions") — у проєкті немає жодної бібліотеки обробки зображень (перевірено
 * `package.json`), а сам `cover-upload` Edge Function теж не робить ресайз, лише валідує й
 * пересилає байти як є — "reuse existing... do not build a competing implementation" (ТЗ §20)
 * тут означає: немає що перевикористати понад сигнатуру/ліміт розміру, тож пайплайн
 * зупиняється на тому самому рівні обробки, що й уже наявна інфраструктура (докладніше —
 * `docs/OWN_CATALOG_IMPORT.md` §"Відомі обмеження").
 */

const MAX_COVER_BYTES = 5_242_880; // той самий ліміт, що й bucket book-covers/cover-upload Edge Function
const DOWNLOAD_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2; // до 3 спроб разом узятих (1 початкова + 2 ретраї)
const RETRY_BASE_DELAY_MS = 500;

/** JPEG: `FF D8 FF`. PNG: 8-байтова сигнатура. Той самий алгоритм, що
 * `cover-upload/index.ts`'s `sniffImageType` (WebP тут НЕМАЄ навмисно — bucket його не приймає).
 * @param {Buffer} bytes @returns {{ mime: string, extension: string } | null} */
function sniffImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= pngSignature.length && pngSignature.every((byte, i) => bytes[i] === byte)) {
    return { mime: 'image/png', extension: 'png' };
  }
  return null;
}

/** `true` для транзієнтних причин ретраю (ТЗ §54: 429/5xx/мережевий timeout) — НІКОЛИ для 404
 * чи інших постійних 4xx (ретраїти зламане посилання марно, лише сповільнює батч). */
function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Просте кероване паралельне виконання (ТЗ §53 "controlled worker pool", 4-8 одночасно) — без
 * нової залежності (`p-limit` тощо): черга задач, `concurrency` "воркерів" тягнуть з неї по
 * одній, кожен доки черга не спорожніє. Досить для пакетного завантаження обкладинок, не варте
 * npm-пакета заради ~15 рядків.
 *
 * @template T
 * @param {Array<() => Promise<T>>} tasks
 * @param {number} concurrency
 * @returns {Promise<T[]>}
 */
async function runWithConcurrency(tasks, concurrency) {
  const results = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex++;
      if (index >= tasks.length) return;
      results[index] = await tasks[index]();
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, tasks.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * Завантажує URL з жорсткою межею байтів (та сама дисципліна, що `cover-upload/index.ts`'s
 * `readRequestBodyWithLimit` — реальний підрахунок під час стріму, не лише довіра
 * `Content-Length`) і з ретраями на транзієнтні помилки (ТЗ §54).
 *
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{ ok: true, bytes: Buffer } | { ok: false, code: string, detail?: string }>}
 */
async function downloadCoverBytes(url, fetchImpl) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
          lastError = { ok: false, code: 'COVER_HTTP_ERROR', detail: `HTTP ${response.status}` };
          await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        return { ok: false, code: 'COVER_HTTP_ERROR', detail: `HTTP ${response.status}` };
      }

      const reader = response.body?.getReader ? response.body.getReader() : null;
      if (!reader) {
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_COVER_BYTES) return { ok: false, code: 'COVER_TOO_LARGE' };
        return { ok: true, bytes: Buffer.from(arrayBuffer) };
      }

      const chunks = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > MAX_COVER_BYTES) {
            await reader.cancel().catch(() => {});
            return { ok: false, code: 'COVER_TOO_LARGE' };
          }
          chunks.push(value);
        }
      }
      return { ok: true, bytes: Buffer.concat(chunks.map((c) => Buffer.from(c))) };
    } catch (error) {
      clearTimeout(timeoutId);
      const isAbort = error instanceof Error && error.name === 'AbortError';
      if (attempt < MAX_RETRIES) {
        lastError = { ok: false, code: 'COVER_DOWNLOAD_FAILED', detail: isAbort ? 'timeout' : String(error && error.message ? error.message : error) };
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      return { ok: false, code: 'COVER_DOWNLOAD_FAILED', detail: isAbort ? 'timeout' : String(error && error.message ? error.message : error) };
    }
  }

  return lastError ?? { ok: false, code: 'COVER_DOWNLOAD_FAILED' };
}

/**
 * Завантажує вже перевірені байти обкладинки у ВЛАСНЕ Supabase Storage — та сама адреса/
 * заголовки/шлях-конвенція, що `cover-upload/index.ts` вже використовує для запису
 * (`{SUPABASE_URL}/storage/v1/object/book-covers/{uuid}.{ext}`, `x-upsert: false`), лише
 * напряму через `service_role` (цей скрипт — довірене локальне/CI середовище, ТЗ §51, а не
 * анонімний клієнт, тож той-таки rate-limited Edge Function шлях, розрахований на одне фото від
 * одного користувача, тут не підходить — 100 запитів/добу зробили б пакетний імпорт тисяч
 * обкладинок практично неможливим).
 *
 * @param {Buffer} bytes
 * @param {{ mime: string, extension: string }} imageType
 * @param {{ supabaseUrl: string, serviceRoleKey: string }} config
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{ ok: true, url: string } | { ok: false, code: string, detail?: string }>}
 */
async function uploadCoverBytes(bytes, imageType, config, fetchImpl) {
  const objectPath = `${cryptoRandomUUID()}.${imageType.extension}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${config.supabaseUrl}/storage/v1/object/book-covers/${objectPath}`, {
      method: 'POST',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': imageType.mime,
        'x-upsert': 'false',
      },
      body: bytes,
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, code: 'COVER_UPLOAD_FAILED', detail: `HTTP ${response.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, url: `${config.supabaseUrl}/storage/v1/object/public/book-covers/${objectPath}` };
  } catch (error) {
    return { ok: false, code: 'COVER_UPLOAD_FAILED', detail: String(error && error.message ? error.message : error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

function cryptoRandomUUID() {
  // Node >=22 (package.json engines) завжди має глобальний `crypto.randomUUID` — той самий
  // виклик, що й `cover-upload/index.ts` (Deno теж має глобальний `crypto`).
  return globalThis.crypto.randomUUID();
}

/**
 * Повний конвеєр ОДНОГО cover_source_url → власний storage URL (ТЗ §16, повний список кроків
 * 1-9). Повертає `null` (не кидає) на будь-якій відмові — виклик (`runImport.js`) вирішує, що
 * робити зі статусом (звіт + ретраюваність, ТЗ §21-22), сам імпорт книги без обкладинки НЕ
 * зупиняє.
 *
 * @param {string} sourceUrl
 * @param {{ supabaseUrl: string, serviceRoleKey: string }} config
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{ ok: true, url: string } | { ok: false, code: string, detail?: string }>}
 */
async function processCover(sourceUrl, config, fetchImpl) {
  const downloaded = await downloadCoverBytes(sourceUrl, fetchImpl);
  if (!downloaded.ok) return downloaded;

  const imageType = sniffImageType(downloaded.bytes);
  if (!imageType) return { ok: false, code: 'COVER_INVALID_IMAGE' };

  return uploadCoverBytes(downloaded.bytes, imageType, config, fetchImpl);
}

module.exports = {
  MAX_COVER_BYTES,
  sniffImageType,
  isRetryableStatus,
  runWithConcurrency,
  downloadCoverBytes,
  uploadCoverBytes,
  processCover,
};
