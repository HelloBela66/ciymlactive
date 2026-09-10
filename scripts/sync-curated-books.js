#!/usr/bin/env node
'use strict';

/**
 * Завантажує `data/curated-books.csv` у таблицю `curated_book` у Supabase (Milestone 11,
 * доповнення) — єдиний спосіб писати в цю таблицю: RLS увімкнено, доступ анонімному/
 * автентифікованому клієнту відкликаний повністю (`revoke all ... from anon, authenticated`,
 * `supabase/schema.sql`), і жодної write-RPC для неї немає (на відміну від `catalog_book`).
 * Пише напряму через PostgREST REST-ендпоінт таблиці (не RPC) із `service_role` ключем, який
 * обходить RLS — цей ключ НІКОЛИ не потрапляє в клієнтський застосунок (`EXPO_PUBLIC_*`
 * інлайняться в бандл Expo, звичайні змінні — ні; `.env.admin` — окремий, у .gitignore файл,
 * читаний лише цим Node-скриптом).
 *
 * Звичайний CommonJS Node-скрипт, без нових npm-залежностей: Node 22 має вбудований `fetch`,
 * а формат CSV тут достатньо простий для невеликого власноруч написаного парсера (лапки для
 * значень, що самі містять кому) — підключати папку заради цього не варто.
 *
 * Використання: `node scripts/sync-curated-books.js` з кореня репозиторію (докладніше —
 * `data/README.md`).
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CSV_PATH = path.join(ROOT_DIR, 'data', 'curated-books.csv');
const ENV_ADMIN_PATH = path.join(ROOT_DIR, '.env.admin');

/** Ті самі назви жанрів, символ-у-символ, що й `GenreRepository.SEED_GENRES` — окрема копія
 * тут навмисно (не імпорт з TypeScript-джерела: цей скрипт запускається чистим Node, без
 * transpile-кроку), тримати в синхроні вручну при зміні списку жанрів у застосунку. */
const KNOWN_GENRES = new Set([
  'Фентезі',
  'Наукова фантастика',
  'Детектив',
  'Трилер',
  'Романтика',
  'Історичний роман',
  'Пригоди',
  'Жахи',
  'Драма',
  'Класична література',
  'Сучасна проза',
  'Поезія',
  'Нон-фікшн',
  'Біографія та мемуари',
  'Історія',
  'Психологія',
  'Саморозвиток',
  'Бізнес',
  'Наука',
  'Філософія',
  'Публіцистика',
  'Дитяча література',
  'Підліткова література',
  'Комікси та графічні романи',
  'Гумор',
]);

const KNOWN_PURPOSES = new Set(['light', 'cry', 'laugh', 'absorbed']);

/** Windows-редактори (Notepad, Excel "CSV UTF-8") звично зберігають текстові файли з BOM
 * (`﻿`) на самому початку — невидимий у більшості переглядачів, але якщо не прибрати
 * його тут, він приклеївся б до першого символу першого поля/рядка (напр. заголовок CSV `id`
 * став би `﻿id`) і зламав би зіставлення саме цього поля мовчки й незрозуміло. */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Мінімальний парсер `KEY=VALUE` рядків — без обробки лапок/екранування: значення тут лише
 * URL і секретний ключ, обидва без пробілів/спецсимволів, повноцінний dotenv-парсер був би
 * зайвим. Порожні рядки й `# коментар` ігноруються. */
function parseEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const content = stripBom(fs.readFileSync(filePath, 'utf8'));
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    result[key] = value;
  }
  return result;
}

/** Розбирає один рядок CSV із підтримкою лапок (значення, що саме містить кому чи лапку) —
 * той самий алгоритм, що й у будь-якому мінімальному CSV-парсері: символ за символом, стан
 * "усередині лапок" перемикається на `""`, кома поза лапками — межа поля. */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0]).map((cell) => cell.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    header.forEach((key, index) => {
      row[key] = (cells[index] ?? '').trim();
    });
    return row;
  });
  return { header, rows };
}

function splitList(value) {
  return value
    .split(';')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeIsbn(value) {
  const digits = value.replace(/[^0-9Xx]/g, '');
  return digits.length > 0 ? digits.toUpperCase() : null;
}

/** Перевіряє й перетворює один "сирий" рядок CSV на payload для `curated_book` — повертає
 * або `{ ok: true, row }`, або `{ ok: false, errors }`, ніколи не кидає: один невалідний
 * рядок не має зупиняти обробку решти файлу. */
function validateRow(raw, rowNumber) {
  const errors = [];

  const id = raw.id ?? '';
  if (!/^[a-z0-9-]{1,100}$/.test(id)) {
    errors.push(`id "${id}" — лише малі латинські літери, цифри й дефіс, до 100 символів`);
  }

  const title = raw.title ?? '';
  if (title.length === 0 || title.length > 500) {
    errors.push('title — обов\'язкове, до 500 символів');
  }

  const authors = splitList(raw.authors ?? '');
  if (authors.length === 0) {
    errors.push('authors — обов\'язкове, хоча б один автор (розділювач — ";")');
  }

  const genres = splitList(raw.genres ?? '');
  if (genres.length === 0) {
    errors.push('genres — обов\'язкове, хоча б один жанр');
  }
  const unknownGenres = genres.filter((genre) => !KNOWN_GENRES.has(genre));
  if (unknownGenres.length > 0) {
    errors.push(`genres містить невідому назву жанру: ${unknownGenres.join(', ')} (звір з data/README.md)`);
  }

  const purposes = splitList(raw.purposes ?? '');
  const unknownPurposes = purposes.filter((purpose) => !KNOWN_PURPOSES.has(purpose));
  if (unknownPurposes.length > 0) {
    errors.push(`purposes містить невідоме значення: ${unknownPurposes.join(', ')} (дозволено: light, cry, laugh, absorbed)`);
  }

  const pageCountRaw = (raw.page_count ?? '').trim();
  let pageCount = null;
  if (pageCountRaw.length > 0) {
    pageCount = Number.parseInt(pageCountRaw, 10);
    if (!Number.isFinite(pageCount) || pageCount <= 0) {
      errors.push(`page_count "${pageCountRaw}" — має бути додатним цілим числом`);
      pageCount = null;
    }
  }

  const isActiveRaw = (raw.is_active ?? '').trim().toLowerCase();
  const isActive = isActiveRaw.length === 0 ? true : isActiveRaw === 'true';
  if (isActiveRaw.length > 0 && isActiveRaw !== 'true' && isActiveRaw !== 'false') {
    errors.push(`is_active "${raw.is_active}" — очікується "true" чи "false" (або порожньо)`);
  }

  if (errors.length > 0) {
    return { ok: false, errors: errors.map((message) => `рядок ${rowNumber}: ${message}`) };
  }

  return {
    ok: true,
    row: {
      id,
      title,
      authors,
      isbn13: normalizeIsbn(raw.isbn13 ?? ''),
      isbn10: normalizeIsbn(raw.isbn10 ?? ''),
      page_count: pageCount,
      cover_url: (raw.cover_url ?? '').trim() || null,
      description: (raw.description ?? '').trim() || null,
      language: (raw.language ?? '').trim() || 'uk',
      genres,
      purposes,
      is_active: isActive,
      // `curated_book.updated_at` має `default now()` (`supabase/schema.sql`), але дефолт
      // спрацьовує лише на INSERT — upsert нижче (`Prefer: resolution=merge-duplicates`)
      // виконує ON CONFLICT DO UPDATE, який дефолт НЕ зачіпає. Без явного значення тут
      // повторний запуск скрипта з відредагованим рядком (виправлена помилка, змінені жанри)
      // мовчки лишав би `updated_at` замороженим на моменті першого додавання — а саме на
      // нього спирається сортування "найновіше спершу" в `curated_book_search`.
      updated_at: new Date().toISOString(),
    },
  };
}

async function main() {
  const env = parseEnvFile(ENV_ADMIN_PATH);
  const supabaseUrl = (env.SUPABASE_URL ?? '').replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      'Немає SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY у .env.admin — скопіюй .env.admin.example у .env.admin і заповни (докладніше — data/README.md).',
    );
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`Не знайдено ${path.relative(ROOT_DIR, CSV_PATH)}`);
    process.exitCode = 1;
    return;
  }

  const { rows: rawRows } = parseCsv(stripBom(fs.readFileSync(CSV_PATH, 'utf8')));
  if (rawRows.length === 0) {
    console.log('CSV порожній (лише заголовок) — немає що синхронізувати.');
    return;
  }

  const validRows = [];
  const allErrors = [];
  const seenIds = new Map();
  // `curated_book` має власний UNIQUE-індекс на `isbn13` (і на `isbn10`, `supabase/schema.sql`)
  // — ОКРЕМИЙ від первинного ключа `id`. Два рядки CSV з РІЗНИМИ `id`, але однаковим ISBN
  // (типова причина — та сама книга випадково додана двічі під різними id-слагами) раніше
  // проходили цю перевірку (вона звіряла лише `id`), а потім валили ВЕСЬ пакетний upsert одним
  // незрозумілим `HTTP 409`/`23505 duplicate key` — перевірено тут-таки, локально, без мережі,
  // ще ДО спроби запису, з чіткою вказівкою на конкретні рядки CSV.
  const seenIsbn13 = new Map(); // isbn13 -> { rowNumber, id } першого рядка з цим ISBN
  const seenIsbn10 = new Map();
  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2; // +1 за заголовок, +1 за 1-індексацію для людини
    const result = validateRow(raw, rowNumber);
    if (!result.ok) {
      allErrors.push(...result.errors);
      return;
    }
    const { row } = result;
    const duplicateId = seenIds.get(row.id);
    if (duplicateId) {
      allErrors.push(`рядок ${rowNumber}: id "${row.id}" уже використаний у рядку ${duplicateId} цього ж файлу`);
      return;
    }
    const dupIsbn13 = row.isbn13 ? seenIsbn13.get(row.isbn13) : undefined;
    if (dupIsbn13) {
      allErrors.push(
        `рядок ${rowNumber} (id "${row.id}"): isbn13 "${row.isbn13}" уже використаний у рядку ${dupIsbn13.rowNumber} (id "${dupIsbn13.id}") цього ж файлу — та сама книга додана двічі під різними id?`,
      );
      return;
    }
    const dupIsbn10 = row.isbn10 ? seenIsbn10.get(row.isbn10) : undefined;
    if (dupIsbn10) {
      allErrors.push(
        `рядок ${rowNumber} (id "${row.id}"): isbn10 "${row.isbn10}" уже використаний у рядку ${dupIsbn10.rowNumber} (id "${dupIsbn10.id}") цього ж файлу — та сама книга додана двічі під різними id?`,
      );
      return;
    }
    seenIds.set(row.id, rowNumber);
    if (row.isbn13) seenIsbn13.set(row.isbn13, { rowNumber, id: row.id });
    if (row.isbn10) seenIsbn10.set(row.isbn10, { rowNumber, id: row.id });
    validRows.push(row);
  });

  if (validRows.length === 0) {
    console.log('Жодного валідного рядка для синхронізації.');
    if (allErrors.length > 0) {
      console.log('\nПомилки:');
      for (const error of allErrors) console.log(`  - ${error}`);
      process.exitCode = 1;
    }
    return;
  }

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };

  // Розбиває масив на шматки по `size` елементів — і для перевірки наявних id (GET,
  // обмеження — довжина URL), і для самого upsert (POST, обмеження — розмір тіла запиту й
  // PostgREST/Supabase gateway timeout на дуже великих пакетних запитах).
  function chunk(items, size) {
    const result = [];
    for (let i = 0; i < items.length; i += size) {
      result.push(items.slice(i, i + size));
    }
    return result;
  }

  // Довжина URL росте лінійно з кількістю рядків CSV, і на достатньо великій кураторській
  // добірці (саме такий сценарій і планується для V2 — насправді розширений каталог) вона
  // перевищує ліміт довжини URL на боці Supabase/PostgREST-шлюзу (типово ~8KB, конкретне
  // значення не документоване й може бути нижчим), сервер відповідає `414 URI Too Long` ще ДО
  // того, як взагалі гляне на сам запит (виправлення після реального `414` у власника
  // продукту) — тому кожна GET-перевірка нижче йде пакетами по `CHECK_BATCH_SIZE` значень, а
  // не одним запитом з усіма значеннями одразу.
  const CHECK_BATCH_SIZE = 150;

  /** Пакетно запитує наявні в `curated_book` рядки за значеннями однієї колонки
   * (`id=in.(...)`/`isbn13=in.(...)`/`isbn10=in.(...)`) — спільна для перевірки id (нижче) і
   * перевірки ISBN-конфліктів (нижче), щоб не дублювати той самий пакетний GET двічі. */
  async function fetchExistingByColumn(column, selectColumns, values) {
    const rows = [];
    for (const batch of chunk(values, CHECK_BATCH_SIZE)) {
      if (batch.length === 0) continue;
      const valuesParam = batch.map((value) => `"${String(value).replace(/"/g, '\\"')}"`).join(',');
      const response = await fetch(
        `${supabaseUrl}/rest/v1/curated_book?select=${selectColumns}&${column}=in.(${valuesParam})`,
        { headers },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} — ${await response.text()}`);
      }
      for (const row of await response.json()) rows.push(row);
    }
    return rows;
  }

  // Спершу дізнаємось, які id вже є в базі — щоб чесно розділити підсумок на "додано" й
  // "оновлено" (сам upsert-запит нижче цього не розрізняє) — і, окремо, які isbn13/isbn10 вже
  // зайняті ІНШИМ id.
  //
  // ВАЖЛИВО (виправлення після реального `HTTP 409`/`23505 duplicate key value violates
  // unique constraint "curated_book_isbn13_key"` у власника продукту): `curated_book` має
  // власний UNIQUE-індекс на `isbn13`/`isbn10` — ОКРЕМИЙ від `id`, який ловить лише upsert
  // нижче (`on_conflict=id`). Рядок CSV, чий ISBN уже належить ІНШОМУ `id` в базі (типово —
  // книгу колись додали під одним `id`, а тепер намагаються додати ще раз під іншим), раніше
  // проходив аж до самого запису й валив увесь пакет (до 150 рядків, ліг UPSERT_BATCH_SIZE)
  // одним незрозумілим `HTTP 409` — жоден із ІНШИХ, коректних рядків того самого пакета теж не
  // записувався, хоча з ними все було гаразд. Тепер такі рядки виявляються тут, ЗАЗДАЛЕГІДЬ,
  // виключаються з самого upsert-payload і потрапляють у звичайний список помилок нижче з
  // конкретною вказівкою на id-конфлікту в базі — решта файлу записується нормально.
  let existingIdRows;
  let existingIsbn13Rows;
  let existingIsbn10Rows;
  try {
    existingIdRows = await fetchExistingByColumn('id', 'id', validRows.map((row) => row.id));
    existingIsbn13Rows = await fetchExistingByColumn(
      'isbn13',
      'id,isbn13',
      [...new Set(validRows.map((row) => row.isbn13).filter(Boolean))],
    );
    existingIsbn10Rows = await fetchExistingByColumn(
      'isbn10',
      'id,isbn10',
      [...new Set(validRows.map((row) => row.isbn10).filter(Boolean))],
    );
  } catch (error) {
    console.error(`Не вдалося перевірити наявні записи: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const existingIds = new Set(existingIdRows.map((row) => row.id));
  const idByIsbn13 = new Map(existingIsbn13Rows.map((row) => [row.isbn13, row.id]));
  const idByIsbn10 = new Map(existingIsbn10Rows.map((row) => [row.isbn10, row.id]));

  const upsertRows = [];
  for (const row of validRows) {
    const conflictId13 = row.isbn13 ? idByIsbn13.get(row.isbn13) : undefined;
    const conflictId10 = row.isbn10 ? idByIsbn10.get(row.isbn10) : undefined;
    // `undefined` — колонка не queried/не збіглась; сам збіг з id ЦЬОГО Ж рядка — не конфлікт,
    // а звичайне оновлення вже наявного запису (той самий рядок, той самий ISBN). Перевіряємо
    // isbn13 і isbn10 незалежно (а не лише перший знайдений) — щоб повідомлення про помилку
    // завжди називало САМЕ той ISBN, який реально конфліктує, а не сусідній непроблемний.
    const isbn13Conflict = conflictId13 && conflictId13 !== row.id;
    const isbn10Conflict = conflictId10 && conflictId10 !== row.id;
    if (isbn13Conflict || isbn10Conflict) {
      const conflictId = isbn13Conflict ? conflictId13 : conflictId10;
      const conflictField = isbn13Conflict ? `isbn13 ${row.isbn13}` : `isbn10 ${row.isbn10}`;
      allErrors.push(
        `id "${row.id}": ${conflictField} уже використаний записом з id "${conflictId}" у базі — щоб ОНОВИТИ той запис, зміни id цього рядка CSV на "${conflictId}"; якщо це справді інша книга з тим самим ISBN — виправ помилковий ISBN`,
      );
      continue;
    }
    upsertRows.push(row);
  }

  if (upsertRows.length === 0) {
    console.log('Жодного рядка без конфлікту ISBN для синхронізації.');
    if (allErrors.length > 0) {
      console.log('\nПомилки:');
      for (const error of allErrors) console.log(`  - ${error}`);
      process.exitCode = 1;
    }
    return;
  }

  // Сам upsert іде в тілі POST-запиту, тому довжина URL тут ні до чого — але великий JSON-масив
  // за раз усе одно ризикує впертись у ліміт розміру тіла запиту чи timeout шлюзу на дуже
  // великій добірці, тому й пишемо тим самим розміром пакету, що й перевірки вище (заразом і
  // єдине число для налаштування, якщо на практиці знадобиться інший розмір).
  const UPSERT_BATCH_SIZE = CHECK_BATCH_SIZE;
  for (const batch of chunk(upsertRows, UPSERT_BATCH_SIZE)) {
    const upsertResponse = await fetch(`${supabaseUrl}/rest/v1/curated_book?on_conflict=id`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    });

    if (!upsertResponse.ok) {
      console.error(`Не вдалося записати книги: HTTP ${upsertResponse.status} — ${await upsertResponse.text()}`);
      process.exitCode = 1;
      return;
    }
  }

  const added = upsertRows.filter((row) => !existingIds.has(row.id)).length;
  const updated = upsertRows.length - added;

  console.log(`Готово: додано ${added}, оновлено ${updated}.`);
  if (allErrors.length > 0) {
    console.log(`\nПропущено з помилкою (${allErrors.length}):`);
    for (const error of allErrors) console.log(`  - ${error}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Неочікувана помилка:', error);
  process.exitCode = 1;
});
