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
 * Обкладинки, що вже мають ВЛАСНИЙ (не сторонній) `cover_url` — ідемпотентність cover pipeline
 * (ТЗ §22, §43): "не перезавантажуй, якщо вже є валідна власна обкладинка". Чанковано за `id
 * in.(...)` (URL довжина PostgREST-запиту має практичну межу) — той самий підхід, що
 * `listByIds`-стиль пакетних методів локальних репозиторіїв (`docs/CALENDAR_2_0.md`, той самий
 * "один запит на N id, не N запитів" принцип, перевикористаний тут для REST, не SQLite).
 *
 * @param {string[]} ids
 * @param {{ supabaseUrl: string, serviceRoleKey: string }} config
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<Map<string, string | null>>}
 */
async function fetchExistingCoverUrls(ids, config, fetchImpl, chunkSize = 200) {
  const result = new Map();
  for (let start = 0; start < ids.length; start += chunkSize) {
    const chunk = ids.slice(start, start + chunkSize);
    if (chunk.length === 0) continue;
    const idsParam = chunk.map((id) => encodeURIComponent(id)).join(',');
    const response = await fetchImpl(
      `${config.supabaseUrl}/rest/v1/curated_book?select=id,cover_url&id=in.(${idsParam})`,
      { headers: authHeaders(config.serviceRoleKey) },
    );
    if (!response.ok) continue; // best-effort: якщо запит не вдався, просто НЕ пропускаємо жодну обкладинку (безпечніше перезавантажити зайвий раз, ніж пропустити нову)
    const rows = await response.json().catch(() => []);
    for (const row of rows) result.set(row.id, row.cover_url ?? null);
  }
  return result;
}

module.exports = { toUpsertBody, upsertChunk, upsertCuratedBooks, fetchExistingCoverUrls };
