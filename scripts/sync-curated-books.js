#!/usr/bin/env node
'use strict';

/**
 * КАТАЛОГ-ІМПОРТ (POLYTSIA — OWN BOOK CATALOG IMPORT & COVER PIPELINE) — CLI-точка входу.
 *
 * Той самий скрипт, що вже документує `data/README.md` (`node scripts/sync-curated-books.js`)
 * — до цієї фази лишався лише документацією без реального файлу (дослідження підтвердило:
 * `scripts/` не існував у репозиторії взагалі), тепер реалізований. Повний опис пайплайну,
 * формату CSV, архітектурних рішень — `docs/OWN_CATALOG_IMPORT.md`.
 *
 * Пайплайн (ТЗ): RAW CSV → PARSE → VALIDATE → NORMALIZE → DEDUPLICATE → DOWNLOAD COVER →
 * VALIDATE IMAGE → UPLOAD TO OWN STORAGE → UPSERT CATALOG → CREATE IMPORT REPORT.
 *
 * Використання:
 *   node scripts/sync-curated-books.js <file.csv> [--apply] [--only-new] [--refresh-covers]
 *                                       [--concurrency=6] [--report-dir=data/import-reports]
 *                                       [--env-file=.env.admin]
 *
 * `--only-new` — заливати ЛИШЕ книги, яких у каталозі ще немає; наявні рядки не чіпати взагалі.
 * Саме той режим, який потрібен при доливанні нових дампів: без нього апсерт мовчки перезапише
 * наявні книги даними з нового файлу.
 *   npm run catalog:import -- <file.csv> [...ті самі прапорці]
 *
 * За замовчуванням — DRY RUN (жодного запису в Supabase, жодного завантаження обкладинок):
 * лише parse → validate → normalize → deduplicate → звіт про НАМІРИ. Потрібен явний `--apply`,
 * щоб щось справді записати (ТЗ §34-35: "Avoid accidentally modifying production catalog just
 * by inspecting file", "Never silently import into production Supabase"). Dry run навмисно НЕ
 * вимагає жодних Supabase-креденшлів узагалі — працює лише з CSV-файлом локально.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { parseCsvWithHeader, buildColumnGetter } = require('./catalog-import/csv');
const { CSV_COLUMNS, rawRecordFromRow } = require('./catalog-import/catalogSchema');
const { validateRecord } = require('./catalog-import/validate');
const { normalizeRecord } = require('./catalog-import/normalize');
const { detectDuplicates } = require('./catalog-import/dedupe');
const { processCover, runWithConcurrency, deleteCoverObject } = require('./catalog-import/cover');
const { toUpsertBody, upsertCuratedBooks, fetchExistingCoverUrls, fetchIsbnOwners } = require('./catalog-import/supabaseAdmin');
const { buildReport, formatReportText, writeReportFiles } = require('./catalog-import/report');
const { messageOf } = require('./catalog-import/errorCodes');

function parseArgs(argv) {
  const args = { file: null, apply: false, onlyNew: false, refreshCovers: false, concurrency: 6, reportDir: 'data/import-reports', envFile: '.env.admin' };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--dry-run') args.apply = false;
    else if (arg === '--only-new') args.onlyNew = true;
    else if (arg === '--refresh-covers') args.refreshCovers = true;
    else if (arg.startsWith('--concurrency=')) args.concurrency = Number(arg.slice('--concurrency='.length)) || 6;
    else if (arg.startsWith('--report-dir=')) args.reportDir = arg.slice('--report-dir='.length);
    else if (arg.startsWith('--env-file=')) args.envFile = arg.slice('--env-file='.length);
    else if (!arg.startsWith('--')) args.file = arg;
  }
  return args;
}

/**
 * Відсіює рядки, які не мають шансу потрапити в каталог або не повинні його змінювати —
 * ДО того, як cover pipeline піде в мережу.
 *
 * Два фільтри, обидва звіряються з РЕАЛЬНИМ станом каталогу, а не з вмістом файлу:
 *
 * 1. **ISBN уже зайнятий іншим id** (`ISBN_TAKEN_IN_CATALOG`). `dedupe.js` бачить лише
 *    конфлікти всередині файлу; unique-індекс діє на всю таблицю. Рядок усе одно впав би на
 *    апсерті — різниця в тому, що тепер він падає БЕЗ завантаження обкладинки й без сироти в
 *    сховищі.
 *
 * 2. **`--only-new`: id уже існує** (`SKIPPED_EXISTING_ID`). Типовий сценарій — «долити свіжі
 *    книги з нового дампа, нічого не чіпаючи». Без прапорця апсерт мовчки ПЕРЕЗАПИСУЄ наявний
 *    рядок даними з нового файлу, і якщо новий парс гірший за той, з якого будувався каталог,
 *    це тихий відкат якості. Саме так 16.09.2026 1372 книги отримали описи зі старішого
 *    набору, і довелось окремим прогоном повертати їх назад.
 *
 * `--only-new` НЕ вмикається за замовчуванням навмисно: оновлення — теж легітимний сценарій
 * (виправлення описів, зміна `is_active`, повернення канонічних даних). Прапорець декларує
 * намір, а не вгадує його.
 *
 * @returns {{ kept: Array<object>, skipped: Array<{ rowNumber: number, id: string, title?: string, code: string, message?: string }> }}
 */
function filterAgainstCatalog(entries, { existingIds, isbn13Owners, isbn10Owners, onlyNew }) {
  const kept = [];
  const skipped = [];

  for (const entry of entries) {
    const n = entry.normalized;

    if (onlyNew && existingIds.has(n.id)) {
      skipped.push({ rowNumber: entry.rowNumber, id: n.id, title: n.title, code: 'SKIPPED_EXISTING_ID' });
      continue;
    }

    // Власник того самого id — це та сама книга, не конфлікт: апсерт просто оновить її ISBN.
    const owner13 = n.isbn13 ? isbn13Owners.get(n.isbn13) : undefined;
    const owner10 = n.isbn10 ? isbn10Owners.get(n.isbn10) : undefined;
    const conflict =
      (owner13 && owner13 !== n.id && { field: 'isbn13', value: n.isbn13, owner: owner13 }) ||
      (owner10 && owner10 !== n.id && { field: 'isbn10', value: n.isbn10, owner: owner10 }) ||
      null;

    if (conflict) {
      skipped.push({
        rowNumber: entry.rowNumber,
        id: n.id,
        title: n.title,
        code: 'ISBN_TAKEN_IN_CATALOG',
        message: `${conflict.field}=${conflict.value} уже належить книзі "${conflict.owner}" — рядок пропущено до завантаження обкладинки.`,
      });
      continue;
    }

    kept.push(entry);
  }

  return { kept, skipped };
}

/** Мінімальний `.env`-парсер (`KEY=value` на рядок, `#`-коментарі, без вкладеності) — той самий
 * "без нової залежності, коли формат простий" принцип, що й `csv.js`. Читає лише
 * `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (`.env.admin.example`), нічого не пише в
 * `process.env` глобально (повертає окремий об'єкт), щоб не змішувати з рештою середовища. */
function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, 'utf8');
  const result = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return result;
}

function loadSupabaseConfig(envFilePath) {
  const fromFile = readEnvFile(envFilePath);
  const supabaseUrl = (process.env.SUPABASE_URL || fromFile.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || fromFile.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

function readCsvFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = parseCsvWithHeader(text);
  if (!parsed) return { error: 'INVALID_CSV' };

  const missingColumns = CSV_COLUMNS.filter((name) => !parsed.header.includes(name));
  if (missingColumns.length > 0) {
    return { error: 'MISSING_HEADER_COLUMN', missingColumns };
  }

  const get = buildColumnGetter(parsed.header);
  const records = parsed.rows.map((row, index) => ({
    // +2: рядок 1 — header, дані з 1 (людський рахунок, для звіту й для власника, що звірятиме з Excel/Google Sheets)
    rowNumber: index + 2,
    record: rawRecordFromRow(get, row),
  }));
  return { records };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('Використання: node scripts/sync-curated-books.js <file.csv> [--apply] [--refresh-covers] [--concurrency=6]');
    process.exitCode = 1;
    return;
  }

  const startedAt = new Date().toISOString();
  const batchId = `${startedAt.slice(0, 19).replace(/[:T]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;

  const csvResult = readCsvFile(args.file);
  if (csvResult.error) {
    console.error(`✖ ${csvResult.error}: ${messageOf(csvResult.error)}`);
    if (csvResult.missingColumns) console.error(`  Відсутні колонки: ${csvResult.missingColumns.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  // --- VALIDATE + NORMALIZE ---
  /** @type {Array<{ rowNumber: number, id?: string, title?: string, isbn?: string, code: string }>} */
  const rowIssues = [];
  const normalizedEntries = [];

  for (const { rowNumber, record } of csvResult.records) {
    const { errors, warnings } = validateRecord(record);
    for (const w of warnings) rowIssues.push({ rowNumber, id: record.id, title: record.title, code: w.code });
    if (errors.length > 0) {
      for (const e of errors) rowIssues.push({ rowNumber, id: record.id, title: record.title, code: e.code });
      continue; // рядок з ERROR-рівня проблемою не нормалізується й не йде далі (ТЗ §6)
    }
    normalizedEntries.push({ rowNumber, normalized: normalizeRecord(record) });
  }

  // --- DEDUPLICATE (в межах файлу, ТЗ §8/§40) ---
  const { toImport, excluded, warnings: dedupeWarnings } = detectDuplicates(normalizedEntries);
  for (const item of excluded) {
    rowIssues.push({ rowNumber: item.rowNumber, id: item.id, code: item.code });
  }
  for (const item of dedupeWarnings) {
    rowIssues.push({ rowNumber: item.rowNumber, id: item.id, code: item.code });
  }

  const outDir = path.resolve(args.reportDir);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${batchId}-normalized.json`),
    JSON.stringify(toImport.map((e) => ({ rowNumber: e.rowNumber, ...e.normalized })), null, 2),
    'utf8',
  );

  const config = loadSupabaseConfig(path.resolve(args.envFile));
  const supabaseHost = config ? new URL(config.supabaseUrl).host : null;

  let created = 0;
  let updated = 0;
  let coverDownloaded = 0;
  let coverReused = 0;
  let coverFailed = 0;
  let skippedExisting = 0;
  let isbnTaken = 0;

  /**
   * Звірка з каталогом — одна на обидва режими.
   *
   * У dry run вона робить прогноз чесним: без неї звіт обіцяв би «створено N», а реальний
   * apply відсіяв би частину рядків. У apply вона ще й економить мережу — відсіяні рядки не
   * йдуть у cover pipeline.
   */
  let toApply = toImport;
  let existingCovers = new Map();
  if (config) {
    existingCovers = await fetchExistingCoverUrls(
      toImport.map((e) => e.normalized.id),
      config,
      fetch,
    );
    const [isbn13Owners, isbn10Owners] = await Promise.all([
      fetchIsbnOwners(toImport.map((e) => e.normalized.isbn13).filter(Boolean), 'isbn13', config, fetch),
      fetchIsbnOwners(toImport.map((e) => e.normalized.isbn10).filter(Boolean), 'isbn10', config, fetch),
    ]);

    const filtered = filterAgainstCatalog(toImport, {
      existingIds: new Set(existingCovers.keys()),
      isbn13Owners,
      isbn10Owners,
      onlyNew: args.onlyNew,
    });
    toApply = filtered.kept;
    for (const item of filtered.skipped) {
      rowIssues.push(item);
      if (item.code === 'SKIPPED_EXISTING_ID') skippedExisting++;
      else isbnTaken++;
    }

    created = toApply.filter((e) => !existingCovers.has(e.normalized.id)).length;
    updated = toApply.filter((e) => existingCovers.has(e.normalized.id)).length;

    if (isbnTaken > 0) {
      console.log(`Відсіяно до мережі: ${isbnTaken} рядків, чий ISBN уже належить іншій книзі каталогу.`);
    }
    if (skippedExisting > 0) {
      console.log(`--only-new: пропущено ${skippedExisting} рядків, бо такі id вже є в каталозі.`);
    }
  }

  if (!args.apply) {
    console.log(`DRY RUN — жодного запису в Supabase, жодного завантаження обкладинок не виконано.`);
    if (config) {
      console.log(`(Ціль наступного --apply була б: ${supabaseHost} — перевір, що це правильний проєкт, ПЕРЕД тим як запускати --apply.)`);
      // created/updated уже пораховані вище, ПІСЛЯ звірки з каталогом — тож dry run обіцяє
      // рівно те, що зробить apply, а не те, що було б без фільтрів.
    } else {
      console.log('(Supabase-конфігурацію не знайдено — dry run обмежений парсингом/валідацією/нормалізацією/дедублікацією, без оцінки "нові/оновлені".)');
    }
  } else {
    if (!config) {
      console.error(`✖ Немає SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (перевір ${args.envFile}) — --apply без креденшлів неможливий.`);
      process.exitCode = 1;
      return;
    }
    console.log(`APPLY — ціль: ${supabaseHost}. Записую ${toApply.length} рядків...`);

    // --- COVER PIPELINE (ТЗ §16-22, керована паралельність §53) ---
    // Шлях кожного завантаженого об'єкта тримаємо окремо: якщо апсерт цього рядка потім
    // впаде, обкладинку треба прибрати, інакше вона лишиться сиротою в сховищі.
    const coverUrlById = new Map();
    const coverObjectPathById = new Map();
    const coverTasks = toApply
      .filter((e) => !!e.normalized.coverSourceUrl)
      .map((e) => async () => {
        const existingOwnUrl = existingCovers.get(e.normalized.id) ?? null;
        const alreadyOwnStorage = existingOwnUrl && existingOwnUrl.startsWith(config.supabaseUrl);
        if (alreadyOwnStorage && !args.refreshCovers) {
          coverUrlById.set(e.normalized.id, existingOwnUrl);
          coverReused++;
          return;
        }
        // `normalized.id` прокидається в пайплайн обкладинок навмисно: саме з нього будується
        // детермінований шлях `curated/{id}.{ext}` у Storage (`cover.js`), який робить повторний
        // прогін перезаписом тієї самої обкладинки, а не виробництвом нових сиріт у bucket.
        const result = await processCover(e.normalized.coverSourceUrl, e.normalized.id, config, fetch);
        if (result.ok) {
          coverUrlById.set(e.normalized.id, result.url);
          coverObjectPathById.set(e.normalized.id, result.objectPath);
          coverDownloaded++;
        } else {
          // Ніколи не хотлінкаємо джерело як фінальний cover_url (ТЗ §16-17) — при відмові
          // лишаємо попередній власний URL (якщо був) або null, НІКОЛИ retailer URL.
          coverUrlById.set(e.normalized.id, alreadyOwnStorage ? existingOwnUrl : null);
          coverFailed++;
          rowIssues.push({
            rowNumber: e.rowNumber,
            id: e.normalized.id,
            title: e.normalized.title,
            code: result.code,
            // Реальна причина відмови, а не лише код. Раніше `COVER_UPLOAD_FAILED` у звіті не
            // ніс ані HTTP-статусу, ані тіла відповіді — діагностувати такий рядок було нічим.
            message: result.detail ? `${messageOf(result.code)} Деталі: ${result.detail}` : undefined,
          });
        }
      });
    await runWithConcurrency(coverTasks, args.concurrency);

    // --- UPSERT CATALOG ---
    const upsertItems = toApply.map((e) => ({
      rowNumber: e.rowNumber,
      id: e.normalized.id,
      body: toUpsertBody(e.normalized, coverUrlById.has(e.normalized.id) ? coverUrlById.get(e.normalized.id) : existingCovers.get(e.normalized.id) ?? null),
    }));
    const upsertResults = await upsertCuratedBooks(upsertItems, config, fetch);
    // Рядки, чий upsert реально відхилено — потрібні окремо від "мало б бути новим/оновленим"
    // (порахованого вище ДО спроби запису), щоб created/updated нижче відображали РЕАЛЬНИЙ
    // результат, а не намір. Знахідка з реального прогону власника продукту: коли Supabase
    // відхиляє КОЖЕН рядок (напр. не той ключ у .env.admin), totals.created раніше однаково
    // показував повну кількість рядків файлу — виглядало як "усе імпортувалось", хоча в базу
    // не потрапило жодного рядка.
    const failedIds = new Set();
    for (const r of upsertResults) {
      if (!r.ok) {
        failedIds.add(r.id);
        rowIssues.push({
          rowNumber: r.rowNumber,
          id: r.id,
          code: r.code || 'DB_UPSERT_FAILED',
          // Реальна причина відмови Supabase (HTTP-статус + тіло відповіді, `supabaseAdmin.js`)
          // — без цього поле message у звіті раніше показувало лише загальний текст-заглушку
          // "деталі — у повідомленні", який жодних деталей насправді не містив.
          message: r.detail
            ? `Supabase відхилив upsert цього рядка (HTTP ${r.status ?? '?'}): ${r.detail}`
            : undefined,
        });
      }
    }
    created = toApply.filter((e) => !existingCovers.has(e.normalized.id) && !failedIds.has(e.normalized.id)).length;
    updated = toApply.filter((e) => existingCovers.has(e.normalized.id) && !failedIds.has(e.normalized.id)).length;

    // --- ПРИБИРАННЯ ЗА СОБОЮ ---
    // Обкладинка завантажується ДО апсерту, тож кожен відхилений рядок лишає в сховищі файл
    // книги, якої в каталозі немає. `ISBN_TAKEN_IN_CATALOG` відсікає найчастішу причину
    // заздалегідь, але не всі: лишаються CHECK-порушення, збої мережі, вичерпані квоти.
    // Прибираємо одразу — сироту, створену цим прогоном, дешевше видалити тут, ніж шукати
    // потім по всьому bucket (саме так 16.09.2026 довелось окремо чистити 411 файлів).
    const orphanPaths = [...failedIds].map((id) => coverObjectPathById.get(id)).filter(Boolean);
    if (orphanPaths.length > 0) {
      let removed = 0;
      for (const objectPath of orphanPaths) {
        if (await deleteCoverObject(objectPath, config, fetch)) removed++;
      }
      console.log(`Прибрано обкладинок відхилених рядків: ${removed} із ${orphanPaths.length}.`);
    }
  }

  const finishedAt = new Date().toISOString();
  const report = buildReport({
    batchId,
    file: args.file,
    mode: args.apply ? 'apply' : 'dry-run',
    supabaseHost,
    startedAt,
    finishedAt,
    totalRows: csvResult.records.length,
    rowIssues,
    created,
    updated,
    coverDownloaded,
    coverReused,
    coverFailed,
  });

  const { jsonPath, textPath } = writeReportFiles(outDir, report);
  console.log('');
  console.log(formatReportText(report));
  console.log('');
  console.log(`Повний звіт: ${jsonPath}`);
  console.log(`Текстовий звіт: ${textPath}`);
  console.log(`Нормалізовані дані (те, що імпортується/імпортувалось): ${path.join(outDir, `${batchId}-normalized.json`)}`);

  if (!args.apply) {
    console.log('');
    console.log('Це був DRY RUN. Щоб справді записати в Supabase, повтори з --apply:');
    console.log(`  node scripts/sync-curated-books.js ${args.file} --apply`);
  }

  if (report.totals.errors > 0 && args.apply) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error('✖ Неочікувана помилка:', error);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, readEnvFile, loadSupabaseConfig, readCsvFile, filterAgainstCatalog };
