#!/usr/bin/env node
'use strict';

/**
 * КАТАЛОГ-ІМПОРТ — прибирання осиротілих обкладинок каталогу з bucket `book-covers`.
 *
 * ── НАВІЩО ОКРЕМИЙ СКРИПТ, А НЕ ОДИН `delete` У SQL ─────────────────────────────────────────
 * `delete from storage.objects` прибирає лише РЯДОК у базі, а самі байти лишаються в сховищі й
 * далі займають квоту — назавжди й без жодного способу їх потім знайти. Видаляти об'єкти
 * Storage можна тільки через Storage API, і саме це робить цей скрипт.
 *
 * ── ЧОМУ ЦЕ ВЗАГАЛІ ПОТРІБНО ────────────────────────────────────────────────────────────────
 * До вересня 2026 пайплайн клав обкладинки в КОРІНЬ bucket під випадковим іменем
 * (`crypto.randomUUID()`), не пов'язаним з `id` книги. Тому кожен повторний імпорт лишав
 * попередній файл сиротою, а відрізнити ці сироти від обкладинок, які фотографували самі
 * користувачі (`supabase/functions/cover-upload/`, той самий bucket, той самий корінь, те саме
 * випадкове ім'я), за іменем файлу було неможливо в принципі.
 *
 * Тепер увесь імпорт живе під префіксом `curated/` (`cover.js`, `CURATED_COVER_PREFIX`), тож
 * корінь bucket більше не поповнюється — усе, що там лишилось, належить минулим поколінням.
 *
 * ── ПРАВИЛО БЕЗПЕКИ: ДОЗВІЛЬНИЙ СПИСОК ДАТ, А НЕ ЗАБОРОННИЙ ─────────────────────────────────
 * Скрипт видаляє об'єкт, лише якщо виконано ОБИДВІ умови:
 *   1. ім'я НЕ починається з `curated/` (новий каталог не чіпаємо взагалі), і
 *   2. дата створення входить у явний список `--days` (дні відомих імпортів).
 *
 * Саме дозвільний список, а не «видалити все, крім відомого хорошого». Різниця принципова:
 * при забороненому списку будь-який об'єкт, про який ми забули, тихо потрапляє під видалення;
 * при дозвільному — тихо виживає. Для незворотної операції помилятися треба в цей бік.
 *
 * Конкретний привід: на 2026-09-16 у корені bucket було 2683 об'єкти — 2038 від імпорту
 * 14 вересня, 644 від тестового імпорту 16 вересня і РІВНО ОДИН від 10 вересня. Цей один до
 * жодного імпорту не належить (імпорти йдуть пачками по тисячах, а не поодинці) — майже
 * напевно це те саме фото обкладинки від користувача. Дозвільний список дат лишає його живим,
 * не вимагаючи від нас доводити, що це саме він.
 *
 * ── ЗА ЗАМОВЧУВАННЯМ — DRY RUN ──────────────────────────────────────────────────────────────
 * Без `--apply` скрипт нічого не видаляє: лише рахує, показує розподіл за датами й пише повний
 * перелік кандидатів у файл. Той самий принцип, що й `sync-curated-books.js` (ТЗ §34-35).
 *
 * ── ДРУГИЙ РЕЖИМ: СИРОТИ ПІД `curated/` (--orphans) ─────────────────────────────────────────
 * Префікс `curated/` захищає від плутанини з чужими файлами, але не від власних сиріт. Cover
 * pipeline завантажує обкладинку ДО апсерту рядка (`sync-curated-books.js`), тож якщо апсерт
 * потім відхилено — наприклад, unique-індекс по `isbn13`, коли та сама книга вже є в каталозі
 * під іншим слагом, — обкладинка лишається в сховищі, а книги в базі немає.
 *
 * Реальний випадок: імпорт `books-011.csv` 16 вересня дав 411 таких відмов (той самий ISBN під
 * іншим id через іншу транслітерацію: `iakshcho` проти `yakshcho`) — і рівно 411 об'єктів під
 * `curated/`, яким не відповідає жоден рядок.
 *
 * Правило тут — «id об'єкта немає серед id каталогу», а НЕ «у книги порожній cover_url»: книга
 * може існувати з `cover_url = null` (обкладинка не завантажилась), і її файл видаляти не можна,
 * бо його там і немає. Захист від найгіршого сценарію — якщо список id каталогу не вдалося
 * прочитати повністю, скрипт падає: порожній список зробив би сиротами ВСІ обкладинки.
 *
 * Використання:
 *   node scripts/cleanup-curated-covers.js --days=2026-09-14,2026-09-16
 *   node scripts/cleanup-curated-covers.js --days=2026-09-14,2026-09-16 --apply
 *   node scripts/cleanup-curated-covers.js --orphans
 *   node scripts/cleanup-curated-covers.js --orphans --apply
 */

const fs = require('fs');
const path = require('path');

const BUCKET = 'book-covers';
const CURATED_PREFIX = 'curated/';
const LIST_PAGE_SIZE = 1000;
/** Storage API приймає масив шляхів на видалення; 100 за раз — консервативно, щоб не впертись
 * у ліміт довжини тіла запиту й щоб збій зачепив малу порцію, а не все одразу. */
const DELETE_CHUNK = 100;

function parseArgs(argv) {
  const args = { apply: false, orphans: false, days: [], envFile: '.env.admin', outDir: 'data/import-reports' };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--orphans') args.orphans = true;
    else if (arg.startsWith('--days=')) args.days = arg.slice('--days='.length).split(',').map((d) => d.trim()).filter(Boolean);
    else if (arg.startsWith('--env-file=')) args.envFile = arg.slice('--env-file='.length);
    else if (arg.startsWith('--out-dir=')) args.outDir = arg.slice('--out-dir='.length);
  }
  return args;
}

/** Той самий мінімальний `.env`-парсер, що й у `sync-curated-books.js` — навмисна дублікація
 * кількох рядків замість спільного модуля заради одного споживача. */
function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const result = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return result;
}

function loadConfig(envFilePath) {
  const fromFile = readEnvFile(envFilePath);
  const supabaseUrl = (process.env.SUPABASE_URL || fromFile.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || fromFile.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function authHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

/**
 * Повний перелік об'єктів у КОРЕНІ bucket (не рекурсивно — саме це нам і треба: усе під
 * `curated/` API поверне окремим псевдо-записом теки, а не файлами).
 *
 * Записи тек відрізняються від файлів тим, що в них `id === null` — їх пропускаємо, інакше
 * теку `curated` можна було б випадково передати у видалення як «файл».
 */
async function listRootObjects(config) {
  const all = [];
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const response = await fetch(`${config.supabaseUrl}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: authHeaders(config.serviceRoleKey),
      body: JSON.stringify({
        prefix: '',
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Не вдалося прочитати список об'єктів (HTTP ${response.status}): ${text.slice(0, 300)}`);
    }
    const page = await response.json();
    if (!Array.isArray(page) || page.length === 0) break;
    for (const item of page) {
      if (!item || item.id == null) continue; // тека, не файл
      all.push({ name: item.name, createdAt: item.created_at });
    }
    if (page.length < LIST_PAGE_SIZE) break;
  }
  return all;
}

/**
 * Усі об'єкти під префіксом `curated/`. Storage API не рекурсивний, але тут це й не потрібно:
 * імпорт кладе файли рівно на один рівень (`curated/{id}.{ext}`), вкладених тек не створює.
 */
async function listCuratedObjects(config) {
  const all = [];
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const response = await fetch(`${config.supabaseUrl}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: authHeaders(config.serviceRoleKey),
      body: JSON.stringify({
        prefix: CURATED_PREFIX,
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Не вдалося прочитати список під ${CURATED_PREFIX} (HTTP ${response.status}): ${text.slice(0, 300)}`);
    }
    const page = await response.json();
    if (!Array.isArray(page) || page.length === 0) break;
    for (const item of page) {
      if (!item || item.id == null) continue;
      // `prefix` не входить у поле `name` відповіді — API повертає імена ВІДНОСНО префікса.
      all.push({ name: `${CURATED_PREFIX}${item.name}`, createdAt: item.created_at });
    }
    if (page.length < LIST_PAGE_SIZE) break;
  }
  return all;
}

/**
 * Усі `id` з `curated_book` (посторінково через PostgREST).
 *
 * Не-OK відповідь КИДАЄ виняток, а не пропускається — той самий урок, що й у
 * `supabaseAdmin.fetchExistingCoverUrls`: неповний список тут не «трохи гірший результат», а
 * протилежний за змістом. Кожен id, якого ми не прочитали, виглядав би як сирота й пішов би на
 * видалення разом зі своєю обкладинкою.
 */
async function fetchAllBookIds(config) {
  const ids = new Set();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const url = `${config.supabaseUrl}/rest/v1/curated_book?select=id&limit=${PAGE}&offset=${offset}&order=id.asc`;
    const response = await fetch(url, { headers: authHeaders(config.serviceRoleKey) });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Не вдалося прочитати id каталогу (HTTP ${response.status}): ${text.slice(0, 300)}\n` +
          '  Прогін зупинено: неповний список id перетворив би живі обкладинки на «сиріт».',
      );
    }
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows) ids.add(row.id);
    if (rows.length < PAGE) break;
  }
  if (ids.size === 0) throw new Error('Каталог повернув 0 id — це або порожня таблиця, або збій. Нічого не видаляю.');
  return ids;
}

/** `curated/kobzar-1840.jpg` → `kobzar-1840`. Слаг не містить крапок (`^[a-z0-9-]+$`), тож
 * остання крапка завжди відділяє саме розширення. */
function idFromObjectName(name) {
  const base = name.slice(CURATED_PREFIX.length);
  const dot = base.lastIndexOf('.');
  return dot === -1 ? base : base.slice(0, dot);
}

async function deleteChunk(names, config) {
  const response = await fetch(`${config.supabaseUrl}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: authHeaders(config.serviceRoleKey),
    body: JSON.stringify({ prefixes: names }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Видалення партії з ${names.length} об'єктів не вдалося (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }
  return names.length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.days.length === 0 && !args.orphans) {
    console.error('✖ Потрібен --days=РРРР-ММ-ДД[,...] (прибирання кореня bucket) або --orphans (сироти під curated/).');
    console.error('  Дозвільний список дат навмисно обов\'язковий: без нього скрипт не знає, що саме вважати сміттям,');
    console.error('  а вгадувати в незворотній операції не можна.');
    process.exitCode = 1;
    return;
  }
  if (args.days.length > 0 && args.orphans) {
    console.error('✖ --days і --orphans — два різні режими з різними правилами безпеки. Запусти їх окремо.');
    process.exitCode = 1;
    return;
  }

  const config = loadConfig(path.resolve(args.envFile));
  if (!config) {
    console.error(`✖ Немає SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (перевір ${args.envFile}).`);
    process.exitCode = 1;
    return;
  }

  const host = new URL(config.supabaseUrl).host;
  console.log(`Ціль: ${host}, bucket ${BUCKET}`);
  console.log(args.orphans ? 'Режим: сироти під curated/' : `Режим: корінь bucket, дні ${args.days.join(', ')}`);
  console.log('');

  let doomed;
  let kept;
  let recount;

  if (args.orphans) {
    const bookIds = await fetchAllBookIds(config);
    const curated = await listCuratedObjects(config);
    doomed = curated.filter((o) => !bookIds.has(idFromObjectName(o.name)));
    kept = curated.length - doomed.length;

    console.log(`Книг у каталозі:        ${bookIds.size}`);
    console.log(`Об'єктів під curated/:  ${curated.length}`);
    console.log(`Сиріт (немає книги):    ${doomed.length}`);

    // Запобіжник проти «читання id зламалось, але не помітили»: якщо сиротами раптом виглядає
    // більш ніж кожен десятий об'єкт — це майже напевно збій читання каталогу, а не реальність.
    if (curated.length > 0 && doomed.length / curated.length > 0.1) {
      console.error('');
      console.error(`✖ Сиротами виглядає ${Math.round((doomed.length / curated.length) * 100)}% обкладинок — це підозріло багато.`);
      console.error('  Найімовірніша причина — неповний список id каталогу, а не стільки сміття. Нічого не видаляю.');
      process.exitCode = 1;
      return;
    }
    recount = async () => (await listCuratedObjects(config)).length;
  } else {
    const root = (await listRootObjects(config)).filter((o) => !o.name.startsWith(CURATED_PREFIX));
    const byDay = new Map();
    for (const o of root) {
      const day = String(o.createdAt || '').slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + 1);
    }
    console.log(`Об'єктів у корені bucket: ${root.length}`);
    console.log('Розподіл за датами:');
    for (const [day, count] of [...byDay.entries()].sort()) {
      const mark = args.days.includes(day) ? 'ВИДАЛИТИ' : 'лишити  ';
      console.log(`  ${day}  ${String(count).padStart(6)}   ${mark}`);
    }
    doomed = root.filter((o) => args.days.includes(String(o.createdAt || '').slice(0, 10)));
    kept = root.length - doomed.length;
    console.log('');
    console.log(`До видалення: ${doomed.length}`);
    console.log(`Лишається в корені: ${kept}`);
    recount = async () => (await listRootObjects(config)).filter((o) => !o.name.startsWith(CURATED_PREFIX)).length;
  }

  // Повний перелік — на диск ДО будь-якого видалення. Після видалення відновити його нізвідки.
  fs.mkdirSync(path.resolve(args.outDir), { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const suffix = args.orphans ? 'curated-orphans' : 'covers-to-delete';
  const listPath = path.join(path.resolve(args.outDir), `${stamp}-${suffix}.txt`);
  fs.writeFileSync(listPath, doomed.map((o) => `${o.createdAt}\t${o.name}`).join('\n') + '\n', 'utf8');
  console.log(`Перелік кандидатів: ${listPath}`);

  if (!args.apply) {
    console.log('');
    console.log('DRY RUN — нічого не видалено. Щоб справді видалити, повтори з --apply.');
    return;
  }

  console.log('');
  let deleted = 0;
  for (let i = 0; i < doomed.length; i += DELETE_CHUNK) {
    const chunk = doomed.slice(i, i + DELETE_CHUNK).map((o) => o.name);
    deleted += await deleteChunk(chunk, config);
    console.log(`  видалено ${deleted} із ${doomed.length}`);
  }

  const after = await recount();
  console.log('');
  console.log(`Готово. Видалено: ${deleted}. Лишилось: ${after} (очікувалось ${kept}).`);
  if (after !== kept) {
    console.error('✖ Кількість після видалення не збіглася з очікуваною — перевір bucket вручну.');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('✖', error && error.message ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, listRootObjects };
