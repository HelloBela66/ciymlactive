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
 *   node scripts/sync-curated-books.js <file.csv> [--apply] [--refresh-covers]
 *                                       [--concurrency=6] [--report-dir=data/import-reports]
 *                                       [--env-file=.env.admin]
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
const { processCover, runWithConcurrency } = require('./catalog-import/cover');
const { toUpsertBody, upsertCuratedBooks, fetchExistingCoverUrls } = require('./catalog-import/supabaseAdmin');
const { buildReport, formatReportText, writeReportFiles } = require('./catalog-import/report');
const { messageOf } = require('./catalog-import/errorCodes');

function parseArgs(argv) {
  const args = { file: null, apply: false, refreshCovers: false, concurrency: 6, reportDir: 'data/import-reports', envFile: '.env.admin' };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--dry-run') args.apply = false;
    else if (arg === '--refresh-covers') args.refreshCovers = true;
    else if (arg.startsWith('--concurrency=')) args.concurrency = Number(arg.slice('--concurrency='.length)) || 6;
    else if (arg.startsWith('--report-dir=')) args.reportDir = arg.slice('--report-dir='.length);
    else if (arg.startsWith('--env-file=')) args.envFile = arg.slice('--env-file='.length);
    else if (!arg.startsWith('--')) args.file = arg;
  }
  return args;
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

  if (!args.apply) {
    console.log(`DRY RUN — жодного запису в Supabase, жодного завантаження обкладинок не виконано.`);
    if (config) {
      console.log(`(Ціль наступного --apply була б: ${supabaseHost} — перевір, що це правильний проєкт, ПЕРЕД тим як запускати --apply.)`);
      const existing = await fetchExistingCoverUrls(
        toImport.map((e) => e.normalized.id),
        config,
        fetch,
      );
      created = toImport.filter((e) => !existing.has(e.normalized.id)).length;
      updated = toImport.filter((e) => existing.has(e.normalized.id)).length;
    } else {
      console.log('(Supabase-конфігурацію не знайдено — dry run обмежений парсингом/валідацією/нормалізацією/дедублікацією, без оцінки "нові/оновлені".)');
    }
  } else {
    if (!config) {
      console.error(`✖ Немає SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (перевір ${args.envFile}) — --apply без креденшлів неможливий.`);
      process.exitCode = 1;
      return;
    }
    console.log(`APPLY — ціль: ${supabaseHost}. Записую ${toImport.length} рядків...`);

    const existingCovers = await fetchExistingCoverUrls(
      toImport.map((e) => e.normalized.id),
      config,
      fetch,
    );
    created = toImport.filter((e) => !existingCovers.has(e.normalized.id)).length;
    updated = toImport.filter((e) => existingCovers.has(e.normalized.id)).length;

    // --- COVER PIPELINE (ТЗ §16-22, керована паралельність §53) ---
    const coverUrlById = new Map();
    const coverTasks = toImport
      .filter((e) => !!e.normalized.coverSourceUrl)
      .map((e) => async () => {
        const existingOwnUrl = existingCovers.get(e.normalized.id) ?? null;
        const alreadyOwnStorage = existingOwnUrl && existingOwnUrl.startsWith(config.supabaseUrl);
        if (alreadyOwnStorage && !args.refreshCovers) {
          coverUrlById.set(e.normalized.id, existingOwnUrl);
          coverReused++;
          return;
        }
        const result = await processCover(e.normalized.coverSourceUrl, config, fetch);
        if (result.ok) {
          coverUrlById.set(e.normalized.id, result.url);
          coverDownloaded++;
        } else {
          // Ніколи не хотлінкаємо джерело як фінальний cover_url (ТЗ §16-17) — при відмові
          // лишаємо попередній власний URL (якщо був) або null, НІКОЛИ retailer URL.
          coverUrlById.set(e.normalized.id, alreadyOwnStorage ? existingOwnUrl : null);
          coverFailed++;
          rowIssues.push({ rowNumber: e.rowNumber, id: e.normalized.id, title: e.normalized.title, code: result.code });
        }
      });
    await runWithConcurrency(coverTasks, args.concurrency);

    // --- UPSERT CATALOG ---
    const upsertItems = toImport.map((e) => ({
      rowNumber: e.rowNumber,
      id: e.normalized.id,
      body: toUpsertBody(e.normalized, coverUrlById.has(e.normalized.id) ? coverUrlById.get(e.normalized.id) : existingCovers.get(e.normalized.id) ?? null),
    }));
    const upsertResults = await upsertCuratedBooks(upsertItems, config, fetch);
    for (const r of upsertResults) {
      if (!r.ok) rowIssues.push({ rowNumber: r.rowNumber, id: r.id, code: r.code || 'DB_UPSERT_FAILED' });
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

module.exports = { parseArgs, readEnvFile, loadSupabaseConfig, readCsvFile };
