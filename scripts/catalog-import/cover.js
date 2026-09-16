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

// `ID_PATTERN`/`LIMITS` беруться з `catalogSchema.js`, а не дублюються тут третім екземпляром:
// обидва файли — Node, у тій самій теці, без жодного рантайм-бар'єру між ними (на відміну від
// `sniffImageType`, чия дублікація з Deno-функції справді вимушена). Шлях об'єкта в Storage
// мусить перевірятись РІВНО тим самим патерном, що й CHECK на `curated_book.id`, — розійтися
// цим двом не можна навіть на один символ.
const { ID_PATTERN, LIMITS } = require('./catalogSchema');

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
 * Префікс усіх об'єктів, які кладе в bucket САМЕ цей імпорт каталогу.
 *
 * Bucket `book-covers` СПІЛЬНИЙ: туди ж пише Edge Function `cover-upload` — обкладинки, які
 * фотографують самі користувачі для `catalog_book` (Milestone 10, «Додати обкладинку»). Доки
 * обидва боки клали файли в КОРІНЬ bucket під іменем `crypto.randomUUID()`, відрізнити «це
 * імпорт каталогу» від «це фото користувача» за іменем файлу було неможливо в принципі.
 * Наслідок: bucket не можна було чистити масово (будь-яке масове видалення зачепило б і чужі
 * файли), а кожен повторний прогін імпорту плодив нових сиріт.
 *
 * Тому всі об'єкти імпорту живуть під `curated/`. Це одна конвенція замість звірки списку
 * `cover_url` перед кожним прибиранням: «усе під `curated/` належить каталогу» перевіряється
 * префіксом, без жодного запиту до бази.
 */
const CURATED_COVER_PREFIX = 'curated/';

/**
 * Завантажує вже перевірені байти обкладинки у ВЛАСНЕ Supabase Storage — напряму через
 * `service_role` (цей скрипт — довірене локальне/CI середовище, ТЗ §51, а не анонімний клієнт,
 * тож rate-limited Edge Function шлях, розрахований на одне фото від одного користувача, тут не
 * підходить: 100 запитів/добу зробили б пакетний імпорт тисяч обкладинок неможливим).
 *
 * ── ЧОМУ ШЛЯХ ДЕТЕРМІНОВАНИЙ І `x-upsert: true` ─────────────────────────────────────────────
 * Раніше шлях був `{crypto.randomUUID()}.{ext}` з `x-upsert: false` — свідомо скопійовано з
 * `cover-upload/index.ts`. Для ТІЄЇ функції це правильно й лишається незмінним: вона приймає
 * байти від анонімного клієнта, і шлях там не будується з жодного клієнтського рядка взагалі —
 * саме це й унеможливлює path traversal «за конструкцією, не перевіркою» (її власний
 * коментар). Скопіювати цей вибір сюди було помилкою міркування: тут шлях будується на СЕРВЕРІ
 * з уже провалідованого `id` (`^[a-z0-9-]+$`, 1–100 символів — `catalogSchema.ID_PATTERN`, той
 * самий CHECK, що й на колонці `curated_book.id`), а не з чогось, що надіслав користувач. У
 * слаг, який пройшов цей патерн, неможливо покласти ні `/`, ні `.`, ні `%2e` — «traversal»-ити
 * нема чим.
 *
 * Що дає детермінований шлях: повторний прогін імпорту ПЕРЕЗАПИСУЄ обкладинку тієї самої книги
 * (`x-upsert: true`) замість створення ще одного файлу з новим uuid. До цієї зміни кожен
 * повторний прогін на 30 тисячах книг лишав 30 тисяч старих об'єктів, не пов'язаних з `id`
 * жодним полем, — прибрати їх можна було лише звіркою з усіма `cover_url` з бази.
 *
 * ЩО ЛИШАЄТЬСЯ: якщо джерело колись поверне для тієї самої книги інший формат (був JPEG, став
 * PNG), з'явиться другий об'єкт — `curated/{id}.png` поруч із `curated/{id}.jpg`. Це вже інша
 * величина проблеми: сирота один на книгу й прямо співвідноситься з її `id` за іменем, тож
 * знаходиться й прибирається без звірки з базою. Зводити й це нанівець (шукати та видаляти інше
 * розширення перед кожним аплоадом) — зайвий круг запитів заради рідкісного випадку; фіксую як
 * відоме обмеження, а не роблю.
 *
 * @param {Buffer} bytes
 * @param {{ mime: string, extension: string }} imageType
 * @param {string} id слаг книги (`curated_book.id`) — основа детермінованого шляху
 * @param {{ supabaseUrl: string, serviceRoleKey: string }} config
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{ ok: true, url: string } | { ok: false, code: string, detail?: string }>}
 */
async function uploadCoverBytes(bytes, imageType, id, config, fetchImpl) {
  assertCuratedId(id);
  const objectPath = `${CURATED_COVER_PREFIX}${id}.${imageType.extension}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${config.supabaseUrl}/storage/v1/object/book-covers/${objectPath}`, {
      method: 'POST',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': imageType.mime,
        // `true`, на відміну від `cover-upload/index.ts`: там шлях — новий випадковий uuid, тож
        // перезапис завжди означав би, що щось пішло не так. Тут шлях навмисно ОДНАКОВИЙ для
        // тієї самої книги, і перезапис — це і є очікувана поведінка повторного прогону.
        'x-upsert': 'true',
      },
      body: bytes,
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, code: 'COVER_UPLOAD_FAILED', detail: `HTTP ${response.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, url: `${config.supabaseUrl}/storage/v1/object/public/book-covers/${objectPath}`, objectPath };
  } catch (error) {
    return { ok: false, code: 'COVER_UPLOAD_FAILED', detail: String(error && error.message ? error.message : error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Видаляє щойно завантажений об'єкт обкладинки — прибирання за собою, коли апсерт рядка не
 * вдався.
 *
 * Cover pipeline працює ДО апсерту (інакше нічого було б класти в `cover_url`), тож будь-яка
 * відмова бази лишає в сховищі файл книги, якої в каталозі немає. `ISBN_TAKEN_IN_CATALOG`
 * відсікає найчастішу причину заздалегідь, але не єдину: лишаються CHECK-порушення, збої мережі
 * на самому апсерті, вичерпані квоти. Тому сироти прибираються одразу, у тому ж прогоні, що їх
 * створив — а не колись потім окремим скриптом по всьому bucket.
 *
 * Помилка видалення НЕ валить імпорт: книга все одно не потрапила в каталог, а зайвий файл —
 * менша біда, ніж перерваний прогін. Тому повертається булеве, а не виняток.
 *
 * @param {string} objectPath шлях, який повернув `uploadCoverBytes` (`curated/{id}.{ext}`)
 * @returns {Promise<boolean>} чи вдалося видалити
 */
async function deleteCoverObject(objectPath, config, fetchImpl) {
  try {
    const response = await fetchImpl(`${config.supabaseUrl}/storage/v1/object/book-covers`, {
      method: 'DELETE',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes: [objectPath] }),
    });
    return !!response.ok;
  } catch {
    return false;
  }
}

/**
 * Жорстка перевірка `id` ПЕРЕД побудовою шляху — кидає, а не повертає `{ ok: false }`.
 *
 * Тут навмисно інша дисципліна, ніж у решті файлу: усі мережеві відмови повертають
 * `{ ok: false, code }`, бо це очікувані, поодинокі, звітовані події (книга без обкладинки — не
 * привід валити імпорт трьох тисяч рядків). Порожній чи кривий `id` — не подія даних, а помилка
 * ВИКЛИКУ: хтось не прокинув `id` у `processCover`. Повернути `{ ok: false }` тут означало б
 * тихо списати це на «не вдалося завантажити обкладинку» й показати у звіті COVER_UPLOAD_FAILED
 * замість справжньої причини. А `id === undefined` без перевірки дав би шлях
 * `curated/undefined.jpg` — один файл на весь каталог, перезаписаний 30 тисяч разів.
 *
 * Саме тому `id` стоїть у сигнатурі ПЕРЕД `config`, а не доданий останнім параметром: будь-який
 * неоновлений виклик передасть сюди об'єкт конфігурації замість слага й одразу впаде з
 * осмисленим текстом, замість мовчки писати кудись не туди.
 *
 * @param {unknown} id
 */
function assertCuratedId(id) {
  if (typeof id !== 'string' || id.length > LIMITS.ID_MAX || !ID_PATTERN.test(id)) {
    throw new Error(
      `uploadCoverBytes: очікувався слаг книги (${ID_PATTERN}, до ${LIMITS.ID_MAX} символів), ` +
        `отримано ${JSON.stringify(id)}. Схоже, виклик не прокинув normalized.id — шлях об'єкта ` +
        'у Storage будується саме з нього.',
    );
  }
}

/**
 * Повний конвеєр ОДНОГО cover_source_url → власний storage URL (ТЗ §16, повний список кроків
 * 1-9). Повертає `{ ok: false, code }` (не кидає) на будь-якій ВІДМОВІ МЕРЕЖІ/ВМІСТУ — виклик
 * (`sync-curated-books.js`) вирішує, що робити зі статусом (звіт + ретраюваність, ТЗ §21-22),
 * сам імпорт книги без обкладинки НЕ зупиняє. Виняток кидається лише на кривому `id`
 * (`assertCuratedId` вище) — це помилка виклику, а не даних.
 *
 * @param {string} sourceUrl
 * @param {string} id слаг книги (`curated_book.id`)
 * @param {{ supabaseUrl: string, serviceRoleKey: string }} config
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{ ok: true, url: string, objectPath: string } | { ok: false, code: string, detail?: string }>}
 */
async function processCover(sourceUrl, id, config, fetchImpl) {
  const downloaded = await downloadCoverBytes(sourceUrl, fetchImpl);
  if (!downloaded.ok) return downloaded;

  const imageType = sniffImageType(downloaded.bytes);
  if (!imageType) return { ok: false, code: 'COVER_INVALID_IMAGE' };

  return uploadCoverBytes(downloaded.bytes, imageType, id, config, fetchImpl);
}

module.exports = {
  MAX_COVER_BYTES,
  CURATED_COVER_PREFIX,
  deleteCoverObject,
  sniffImageType,
  isRetryableStatus,
  runWithConcurrency,
  downloadCoverBytes,
  uploadCoverBytes,
  processCover,
};
