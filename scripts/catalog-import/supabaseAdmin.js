'use strict';

/**
 * КАТАЛОГ-ІМПОРТ — тонкий PostgREST-клієнт до `curated_book`, лише `service_role` (ТЗ §51:
 * привілейовані креденшли ЛИШЕ в довіреному локальному/CI середовищі, ніколи в застосунку).
 * `service_role` обходить RLS повністю (`supabase/schema.sql`, коментар над `curated_book`:
 * "service_role і так обходить RLS повністю... окремих RPC для запису не потрібно") — тож
 * звичайний прямий PostgREST upsert (`POST /rest/v1/curated_book`, `Prefer: resolution=
 * merge-duplicates`), не окрема SECURITY DEFINER RPC (ті існують лише заради anon-ключа,
 * якому потрібен вузький, контрольований шлях запису — тут його нема, `service_role` і так
 * бачить усе).
 */

const UPSERT_TIMEOUT_MS = 20_000;

/** @param {string} supabaseUrl @param {string} serviceRoleKey */
function authHeaders(serviceRoleKey) {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
}

/** Формат body для `POST /rest/v1/curated_book` — той самий набір колонок, що
 * `normalize.js`'s вихід, лише `coverUrl` (не `coverSourceUrl` — джерело НІКОЛИ не йде в цю
 * колонку, ТЗ §16-17) і в snake_case, як сама таблиця (`supabase/schema.sql`).
 * @param {ReturnType<typeof import('./normalize').normalizeRecord>} normalized
 * @param {string | null} coverUrl власний Storage URL (чи `null`, якщо ще не завантажено)
 */
function toUpsertBody(normalized, coverUrl) {
  return {
    id: normalized.id,
    title: normalized.title,
    authors: normalized.authors,
    isbn13: normalized.isbn13,
    isbn10: normalized.isbn10,
    page_count: normalized.pageCount,
    cover_url: coverUrl,
    description: normalized.description,
    genres: normalized.genres,
    purposes: normalized.purposes,
    language: normalized.language,
    is_active: normalized.isActive,
  };
}

/**
 * Один HTTP-виклик пакетного upsert (`Prefer: resolution=merge-duplicates` — той самий ефект,
 * що `ON CONFLICT (id) DO UPDATE`, ідемпотентно за конструкцією: повторний виклик з тим самим
 * `id` оновлює, не дублює, ТЗ §40).
 *
 * @param {Array<object>} bodyRows
 * @param {{ supabaseUrl: string, serviceRoleKey: string }} config
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{ ok: true } | { ok: false, status: number, detail: string }>}
 */
async function upsertChunk(bodyRows, config, fetchImpl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSERT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/curated_book?on_conflict=id`, {
      method: 'POST',
      headers: {
        ...authHeaders(config.serviceRoleKey),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(bodyRows),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, status: response.status, detail: text.slice(0, 500) };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, status: 0, detail: String(error && error.message ? error.message : error) };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Пакетний upsert з fallback-ізоляцією помилок (ТЗ §38 "row-level report", §62-63
 * продуктивність на масштабі): рядки йдуть чанками (`chunkSize`, продуктивність — один HTTP
 * запит на N рядків замість N запитів); якщо ЦІЛИЙ чанк відхилено (наприклад, один рядок
 * порушує unique/CHECK, якого `dedupe.js`/`validate.js` не впіймали заздалегідь — наприклад,
 * конфлікт із рядком з ПОПЕРЕДНЬОГО запуску скрипта, не з цього ж файлу) — той самий чанк
 * повторюється ПО ОДНОМУ рядку, щоб точно вказати, ЯКИЙ саме рядок і чому (замість "чанк 37-86
 * впав, невідомо через кого") — решта чанку все одно записується.
 *
 * @param {Array<{ rowNumber: number, id: string, body: object }>} items
 * @param {{ supabaseUrl: string, serviceRoleKey: string }} config
 * @param {typeof fetch} fetchImpl
 * @param {number} chunkSize
 * @returns {Promise<Array<{ rowNumber: number, id: string, ok: boolean, code?: string, status?: number, detail?: string }>>}
 */
async function upsertCuratedBooks(items, config, fetchImpl, chunkSize = 50) {
  const results = [];

  for (let start = 0; start < items.length; start += chunkSize) {
    const chunk = items.slice(start, start + chunkSize);
    const chunkResult = await upsertChunk(
      chunk.map((item) => item.body),
      config,
      fetchImpl,
    );

    if (chunkResult.ok) {
      for (const item of chunk) results.push({ rowNumber: item.rowNumber, id: item.id, ok: true });
      continue;
    }

    // Fallback: по одному, щоб ізолювати саме проблемний рядок.
    for (const item of chunk) {
      const single = await upsertChunk([item.body], config, fetchImpl);
      results.push(
        single.ok
          ? { rowNumber: item.rowNumber, id: item.id, ok: true }
          : {
              rowNumber: item.rowNumber,
              id: item.id,
              ok: false,
              code: 'DB_UPSERT_FAILED',
              // HTTP-статус окремо від тіла відповіді (`detail`) — власник продукту, побачивши
              // 401/403 для КОЖНОГО рядка одразу знає "не той ключ у .env.admin", а не мусить
              // здогадуватись із самого лише тексту тіла відповіді.
              status: single.status,
              detail: single.detail,
            },
      );
    }
  }

  return results;
}

/**
 * Розмір чанка для `fetchExistingCoverUrls`: 80, а не 200 — знахідка з реального каталогу на
 * 29 986 книг.
 *
 * `id` тут — людський слаг (`^[a-z0-9-]+$`, до 100 символів, `catalogSchema.ID_PATTERN`), а не
 * 36-символьний uuid. На реальних даних середня довжина слага близько 45 символів, а максимум
 * упирається в самé CHECK-обмеження (100). При 200 id у чанку рядок `?id=in.(...)` виходив на
 * 8–11,5 КБ, тоді як практична межа довжини URL у HTTP-стеку (сервер, проксі, PostgREST
 * попереду) — близько 8 КБ. Тобто 145 зі 150 чанків на повному каталозі не мали шансу
 * виконатись узагалі. При 80 id це ~3,7 КБ на типових даних — із запасом.
 *
 * ЩО ЦЕ НЕ ЗАКРИВАЄ: теоретичний найгірший випадок (усі 80 слагів по 100 символів) — усе одно
 * ~8,1 КБ. Розмір чанка його не усуває. Його усуває те, що з цієї фази не-OK відповідь ПАДАЄ,
 * а не пропускається мовчки: навіть якщо колись трапиться такий набір слагів, наслідком буде
 * зупинка прогону з явною причиною, а не тихе подвоєння файлів у Storage.
 */
const EXISTING_COVERS_CHUNK_SIZE = 80;

/**
 * Обкладинки, що вже мають ВЛАСНИЙ (не сторонній) `cover_url` — ідемпотентність cover pipeline
 * (ТЗ §22, §43): "не перезавантажуй, якщо вже є валідна власна обкладинка". Чанковано за `id
 * in.(...)` (URL довжина PostgREST-запиту має практичну межу) — той самий підхід, що
 * `listByIds`-стиль пакетних методів локальних репозиторіїв (`docs/CALENDAR_2_0.md`, той самий
 * "один запит на N id, не N запитів" принцип, перевикористаний тут для REST, не SQLite).
 *
 * ── ЧОМУ ТУТ ВИНЯТОК, А НЕ `continue` ───────────────────────────────────────────────────────
 * Раніше тут стояло `if (!response.ok) continue;` з поясненням «best-effort: безпечніше
 * перезавантажити зайвий раз, ніж пропустити нову». Це міркування хибне, і саме на масштабі
 * повного каталогу воно стає руйнівним.
 *
 * Ця Map — не оптимізація. Вона відповідає на питання «яка обкладинка в цієї книги вже є?»,
 * і порожня Map означає для виклику (`sync-curated-books.js`) рівно «жодної з цих книг у базі
 * ще немає»: КОЖЕН рядок вважається новим, КОЖНА обкладинка качається з джерела заново й
 * заливається в Storage заново.
 *
 * Тобто тихий пропуск тут не втрачає дані — він їх ПОДВОЮЄ. І подвоював незворотно: доки ім'я
 * об'єкта в bucket було `crypto.randomUUID()`, воно не було пов'язане з `id` книги ніяк, тож
 * попередній файл не перезаписувався, а лишався в сховищі назавжди — сиротою, якого не
 * співвіднести ні з книгою, ні з прогоном. На 30 тисячах рядків один мовчазний `continue`
 * означав 30 тисяч зайвих завантажень із джерела й 30 тисяч осиротілих файлів.
 *
 * Тому не-OK відповідь зупиняє прогін. Впасти тут дешево: власник бачить причину, виправляє й
 * перезапускає скрипт, ідемпотентний за конструкцією (`merge-duplicates`, ТЗ §40). Продовжити
 * дорого: наслідки доводиться розгрібати руками в Storage.
 *
 * У винятку — URL, HTTP-статус і тіло відповіді, бо кожне з трьох вказує на різну причину:
 * 414 — довжина URL (див. `EXISTING_COVERS_CHUNK_SIZE`), 401/403 — не той ключ у `.env.admin`,
 * 5xx — бік Supabase. Без них «щось пішло не так» довелося б діагностувати наосліп.
 *
 * @param {string[]} ids
 * @param {{ supabaseUrl: string, serviceRoleKey: string }} config
 * @param {typeof fetch} fetchImpl
 * @param {number} [chunkSize]
 * @returns {Promise<Map<string, string | null>>}
 */
async function fetchExistingCoverUrls(ids, config, fetchImpl, chunkSize = EXISTING_COVERS_CHUNK_SIZE) {
  const result = new Map();
  for (let start = 0; start < ids.length; start += chunkSize) {
    const chunk = ids.slice(start, start + chunkSize);
    if (chunk.length === 0) continue;
    const idsParam = chunk.map((id) => encodeURIComponent(id)).join(',');
    const url = `${config.supabaseUrl}/rest/v1/curated_book?select=id,cover_url&id=in.(${idsParam})`;
    const response = await fetchImpl(url, { headers: authHeaders(config.serviceRoleKey) });
    if (!response.ok) {
      const body = response.text ? await response.text().catch(() => '') : '';
      throw new Error(
        `Не вдалося прочитати наявні cover_url із curated_book (HTTP ${response.status}). ` +
          'Прогін зупинено навмисно: порожня мапа наявних обкладинок змусила б скрипт вважати ВСІ рядки новими, ' +
          'перезалити всі обкладинки в Storage й лишити попередні файли сиротами.\n' +
          `  Чанк: ${chunk.length} id (${start + 1}–${start + chunk.length} із ${ids.length}), довжина URL ${url.length} байт.\n` +
          `  URL: ${url}\n` +
          `  Тіло відповіді: ${String(body).slice(0, 500)}`,
      );
    }
    const rows = await response.json().catch(() => []);
    for (const row of rows) result.set(row.id, row.cover_url ?? null);
  }
  return result;
}

/**
 * Розмір чанка для пошуку власників ISBN. Значення ISBN — 10 або 13 символів проти ~45 у слага,
 * тож у ту саму безпечну довжину URL їх влазить більше.
 */
const ISBN_OWNERS_CHUNK_SIZE = 150;

/**
 * Хто в каталозі вже володіє цими ISBN: `Map<isbn, id>`.
 *
 * ── НАВІЩО ЦЕ ІСНУЄ ─────────────────────────────────────────────────────────────────────────
 * `dedupe.js` ловить конфлікт ISBN лише В МЕЖАХ ОДНОГО ФАЙЛУ — це прямо записано в його
 * коментарі. Але `curated_book_isbn13_key`/`curated_book_isbn10_key` — обмеження на ВСЮ
 * таблицю, тож рядок може мати унікальний ISBN усередині свого файлу й усе одно впасти на
 * апсерті: та сама книга вже є в каталозі під ІНШИМ слагом.
 *
 * Це не теорія. Імпорт `books-011.csv` 16.09.2026 дав рівно такий випадок 411 разів — один і
 * той самий ISBN під двома транслітераціями слага (`huver-pokyn-iakshcho-…` проти
 * `huver-pokyn-yakshcho-…`). Наслідки були подвійні: 411 помилок у звіті І 411 осиротілих
 * обкладинок у сховищі, бо cover pipeline відпрацьовує ДО апсерту й встиг їх залити.
 *
 * Тому перевірка робиться ЗАЗДАЛЕГІДЬ: рядок з чужим ISBN відсіюється ще до того, як хоч одна
 * обкладинка піде в мережу. Пара дешевих запитів замість сотень марних завантажень і ручного
 * прибирання сховища потім.
 *
 * Не-OK відповідь КИДАЄ — з тієї ж причини, що й у `fetchExistingCoverUrls`: порожня мапа тут
 * означає «конфліктів немає», тобто рівно те, чого ми боїмось, тільки мовчки.
 *
 * @param {string[]} isbns
 * @param {'isbn13' | 'isbn10'} column
 * @param {{ supabaseUrl: string, serviceRoleKey: string }} config
 * @param {typeof fetch} fetchImpl
 * @param {number} [chunkSize]
 * @returns {Promise<Map<string, string>>}
 */
async function fetchIsbnOwners(isbns, column, config, fetchImpl, chunkSize = ISBN_OWNERS_CHUNK_SIZE) {
  const result = new Map();
  const unique = [...new Set(isbns.filter(Boolean))];
  for (let start = 0; start < unique.length; start += chunkSize) {
    const chunk = unique.slice(start, start + chunkSize);
    if (chunk.length === 0) continue;
    const values = chunk.map((v) => encodeURIComponent(v)).join(',');
    const url = `${config.supabaseUrl}/rest/v1/curated_book?select=id,${column}&${column}=in.(${values})`;
    const response = await fetchImpl(url, { headers: authHeaders(config.serviceRoleKey) });
    if (!response.ok) {
      const body = response.text ? await response.text().catch(() => '') : '';
      throw new Error(
        `Не вдалося перевірити, чи вільні ISBN у каталозі (${column}, HTTP ${response.status}). ` +
          'Прогін зупинено навмисно: порожня відповідь виглядала б як «конфліктів немає», і рядки пішли б ' +
          'качати обкладинки, щоб потім впасти на unique-обмеженні й лишити ті обкладинки сиротами.\n' +
          `  Чанк: ${chunk.length} значень (${start + 1}–${start + chunk.length} із ${unique.length}), довжина URL ${url.length} байт.\n` +
          `  Тіло відповіді: ${String(body).slice(0, 500)}`,
      );
    }
    const rows = await response.json().catch(() => []);
    for (const row of rows) {
      if (row && row[column]) result.set(row[column], row.id);
    }
  }
  return result;
}

module.exports = {
  EXISTING_COVERS_CHUNK_SIZE,
  ISBN_OWNERS_CHUNK_SIZE,
  toUpsertBody,
  upsertChunk,
  upsertCuratedBooks,
  fetchExistingCoverUrls,
  fetchIsbnOwners,
};
