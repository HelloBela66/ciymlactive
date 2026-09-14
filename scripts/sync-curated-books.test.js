'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const { parseArgs, readEnvFile, loadSupabaseConfig, readCsvFile } = require('./sync-curated-books');

describe('parseArgs', () => {
  it('без прапорців — dry-run за замовчуванням (ТЗ §34: "avoid accidentally modifying production")', () => {
    const args = parseArgs(['data/curated-books.csv']);
    expect(args.file).toBe('data/curated-books.csv');
    expect(args.apply).toBe(false);
    expect(args.refreshCovers).toBe(false);
    expect(args.concurrency).toBe(6);
    expect(args.reportDir).toBe('data/import-reports');
    expect(args.envFile).toBe('.env.admin');
  });

  it('--apply вмикає режим запису', () => {
    expect(parseArgs(['f.csv', '--apply']).apply).toBe(true);
  });

  it('--dry-run явно вимикає apply (навіть якщо вказано після --apply)', () => {
    expect(parseArgs(['f.csv', '--apply', '--dry-run']).apply).toBe(false);
  });

  it('--refresh-covers/--concurrency=N/--report-dir=X/--env-file=Y парсяться коректно', () => {
    const args = parseArgs(['f.csv', '--refresh-covers', '--concurrency=8', '--report-dir=out', '--env-file=.env.custom']);
    expect(args.refreshCovers).toBe(true);
    expect(args.concurrency).toBe(8);
    expect(args.reportDir).toBe('out');
    expect(args.envFile).toBe('.env.custom');
  });

  it('некоректне значення --concurrency= — відкат до дефолту 6, не NaN', () => {
    expect(parseArgs(['f.csv', '--concurrency=abc']).concurrency).toBe(6);
  });

  it('відсутній файл (лише прапорці) — file: null', () => {
    expect(parseArgs(['--apply']).file).toBeNull();
  });
});

describe('readEnvFile', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-env-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('парсить KEY=value рядки, ігнорує # коментарі й порожні рядки', () => {
    const filePath = path.join(tmpDir, '.env.test');
    fs.writeFileSync(filePath, '# коментар\nSUPABASE_URL=https://project.supabase.co\n\nSUPABASE_SERVICE_ROLE_KEY=secret-key\n', 'utf8');
    expect(readEnvFile(filePath)).toEqual({
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'secret-key',
    });
  });

  it('неіснуючий файл — порожній об’єкт, не виняток', () => {
    expect(readEnvFile(path.join(tmpDir, 'does-not-exist'))).toEqual({});
  });

  it('обрізає пробіли навколо ключа й значення', () => {
    const filePath = path.join(tmpDir, '.env.test');
    fs.writeFileSync(filePath, '  SUPABASE_URL = https://project.supabase.co  \n', 'utf8');
    expect(readEnvFile(filePath).SUPABASE_URL).toBe('https://project.supabase.co');
  });
});

describe('loadSupabaseConfig', () => {
  let tmpDir;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-config-'));
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it('немає ні файлу, ні process.env — null (apply без креденшлів неможливий)', () => {
    expect(loadSupabaseConfig(path.join(tmpDir, 'missing.env'))).toBeNull();
  });

  it('обидва значення з .env-файлу — повертає config, обрізає завершальні "/" з URL', () => {
    const filePath = path.join(tmpDir, '.env.admin');
    fs.writeFileSync(filePath, 'SUPABASE_URL=https://project.supabase.co/\nSUPABASE_SERVICE_ROLE_KEY=key123\n', 'utf8');
    expect(loadSupabaseConfig(filePath)).toEqual({ supabaseUrl: 'https://project.supabase.co', serviceRoleKey: 'key123' });
  });

  it('process.env має пріоритет над .env-файлом', () => {
    const filePath = path.join(tmpDir, '.env.admin');
    fs.writeFileSync(filePath, 'SUPABASE_URL=https://file.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=file-key\n', 'utf8');
    process.env.SUPABASE_URL = 'https://env.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'env-key';
    expect(loadSupabaseConfig(filePath)).toEqual({ supabaseUrl: 'https://env.supabase.co', serviceRoleKey: 'env-key' });
  });

  it('лише один з двох ключів наявний — null (обидва обов’язкові)', () => {
    const filePath = path.join(tmpDir, '.env.admin');
    fs.writeFileSync(filePath, 'SUPABASE_URL=https://project.supabase.co\n', 'utf8');
    expect(loadSupabaseConfig(filePath)).toBeNull();
  });
});

describe('readCsvFile', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-csvfile-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('валідний CSV з правильним header — rowNumber рахується від 2 (рядок 1 — header)', () => {
    const filePath = path.join(tmpDir, 'valid.csv');
    fs.writeFileSync(
      filePath,
      'id,title,authors,isbn13,isbn10,page_count,cover_url,description,genres,purposes,language,is_active\n' +
        'book-a,Назва A,Автор,,,,,,,,,\n' +
        'book-b,Назва B,Автор,,,,,,,,,\n',
      'utf8',
    );
    const result = readCsvFile(filePath);
    expect(result.error).toBeUndefined();
    expect(result.records).toHaveLength(2);
    expect(result.records[0].rowNumber).toBe(2);
    expect(result.records[0].record.id).toBe('book-a');
    expect(result.records[1].rowNumber).toBe(3);
    expect(result.records[1].record.id).toBe('book-b');
  });

  it('порожній файл — error: INVALID_CSV', () => {
    const filePath = path.join(tmpDir, 'empty.csv');
    fs.writeFileSync(filePath, '', 'utf8');
    expect(readCsvFile(filePath)).toEqual({ error: 'INVALID_CSV' });
  });

  it('відсутня обов’язкова колонка в header — error: MISSING_HEADER_COLUMN з переліком відсутніх колонок', () => {
    const filePath = path.join(tmpDir, 'bad-header.csv');
    fs.writeFileSync(filePath, 'id,title\nbook-a,Назва A\n', 'utf8');
    const result = readCsvFile(filePath);
    expect(result.error).toBe('MISSING_HEADER_COLUMN');
    expect(result.missingColumns).toEqual(
      expect.arrayContaining(['authors', 'isbn13', 'isbn10', 'page_count', 'cover_url', 'description', 'genres', 'purposes', 'language', 'is_active']),
    );
  });

  it('колонки в іншому порядку, ніж CSV_COLUMNS, — усе одно розпізнаються (buildColumnGetter за назвою, не позицією)', () => {
    const filePath = path.join(tmpDir, 'reordered.csv');
    fs.writeFileSync(
      filePath,
      'title,id,authors,isbn13,isbn10,page_count,cover_url,description,genres,purposes,language,is_active\n' + 'Назва A,book-a,Автор,,,,,,,,,\n',
      'utf8',
    );
    const result = readCsvFile(filePath);
    expect(result.error).toBeUndefined();
    expect(result.records[0].record.id).toBe('book-a');
    expect(result.records[0].record.title).toBe('Назва A');
  });
});

/**
 * ІНТЕГРАЦІЙНИЙ тест ідемпотентності (ТЗ: "same CSV imported twice must create zero unintended
 * duplicates", "skip re-downloading existing valid covers by default") — запускає РЕАЛЬНИЙ CLI
 * (`node scripts/sync-curated-books.js ... --apply`) як дочірній процес ДВІЧІ проти локального
 * mock-сервера, що імітує Supabase PostgREST (`/rest/v1/curated_book`) і Storage
 * (`/storage/v1/object/book-covers/...`), і звіряє реальний результат — не лише читання коду.
 *
 * ВАЖЛИВО: `execFile` (асинхронний), НЕ `execFileSync` — синхронний виклик блокував би event loop
 * ЦЬОГО процесу, а тому й `http.Server` mock-сервера (що працює в цьому самому процесі) не міг би
 * прийняти жоден запит від дочірнього процесу → дедлок (підтверджено емпірично під час розробки
 * цього тесту: `execFileSync` тут зависає назавжди, `execFile`/`await` — ні, бо event loop
 * лишається вільним обслуговувати вхідні з'єднання, поки дочірній процес виконується).
 */
describe('CLI end-to-end — ідемпотентність (mock Supabase, реальний дочірній процес)', () => {
  let server;
  let store;
  let storageUploads;
  let tmpDir;
  const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

  beforeEach(async () => {
    store = new Map();
    storageUploads = 0;

    server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/cover.jpg') {
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': JPEG_BYTES.length });
        res.end(JPEG_BYTES);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/rest/v1/curated_book') {
        const idsParam = url.searchParams.get('id');
        const match = idsParam && idsParam.match(/^in\.\((.*)\)$/);
        const ids = match ? match[1].split(',') : [];
        const rows = ids
          .map((id) => store.get(id))
          .filter(Boolean)
          .map((row) => ({ id: row.id, cover_url: row.cover_url }));
        const payload = JSON.stringify(rows);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
        res.end(payload);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/rest/v1/curated_book') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          const rows = JSON.parse(body);
          for (const row of rows) store.set(row.id, { ...(store.get(row.id) || {}), ...row });
          res.writeHead(201, { 'Content-Length': 0 });
          res.end();
        });
        return;
      }
      if (req.method === 'POST' && url.pathname.startsWith('/storage/v1/object/book-covers/')) {
        storageUploads++;
        req.on('data', () => {});
        req.on('end', () => {
          res.writeHead(200, { 'Content-Length': 0 });
          res.end();
        });
        return;
      }
      res.writeHead(404, { 'Content-Length': 0 });
      res.end();
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-cli-e2e-'));
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await new Promise((resolve) => server.close(resolve));
  });

  function baseUrl() {
    return `http://127.0.0.1:${server.address().port}`;
  }

  function writeFixture() {
    const base = baseUrl();
    const csvPath = path.join(tmpDir, 'fixture.csv');
    const envPath = path.join(tmpDir, '.env.test');
    const csv = [
      'id,title,authors,isbn13,isbn10,page_count,cover_url,description,genres,purposes,language,is_active',
      `idem-book-1,Проста назва один,Автор Один,9780306406157,,240,${base}/cover.jpg,Опис першої книги для перевірки ідемпотентності.,Фентезі,light,uk,true`,
      'idem-book-2,Проста назва два,Автор Два,,,180,,Опис другої книги без обкладинки.,Детектив,cry,uk,true',
      '',
    ].join('\n');
    fs.writeFileSync(csvPath, csv, 'utf8');
    fs.writeFileSync(envPath, `SUPABASE_URL=${base}\nSUPABASE_SERVICE_ROLE_KEY=test-service-role-key\n`, 'utf8');
    return { csvPath, envPath };
  }

  async function runApply(csvPath, envPath, reportDir) {
    const scriptPath = path.join(__dirname, 'sync-curated-books.js');
    const env = { ...process.env };
    delete env.SUPABASE_URL;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    await execFileAsync('node', [scriptPath, csvPath, '--apply', `--env-file=${envPath}`, `--report-dir=${reportDir}`, '--concurrency=2'], {
      env,
      timeout: 15000,
    });
    const reportFile = fs.readdirSync(reportDir).find((f) => f.endsWith('.json') && !f.endsWith('-normalized.json'));
    return JSON.parse(fs.readFileSync(path.join(reportDir, reportFile), 'utf8'));
  }

  it('перший --apply: обидва рядки створено, одна обкладинка завантажена й вивантажена у власне сховище', async () => {
    const { csvPath, envPath } = writeFixture();
    const report = await runApply(csvPath, envPath, path.join(tmpDir, 'reports-1'));

    expect(report.totals.created).toBe(2);
    expect(report.totals.updated).toBe(0);
    expect(report.totals.coverDownloaded).toBe(1);
    expect(report.totals.coverReused).toBe(0);
    expect(report.totals.errors).toBe(0);
    expect(store.size).toBe(2);
    expect(storageUploads).toBe(1);
    // Власний Storage URL, НІКОЛИ URL джерела (ТЗ §16-17)
    expect(store.get('idem-book-1').cover_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/storage\/v1\/object\/public\/book-covers\//);
  }, 20000);

  it('той самий CSV, --apply вдруге: нуль нових рядків (лише оновлення), обкладинка НЕ перезавантажується (skip-by-default), жодного дубліката в сховищі (ТЗ: строга ідемпотентність)', async () => {
    const { csvPath, envPath } = writeFixture();
    await runApply(csvPath, envPath, path.join(tmpDir, 'reports-1'));
    const secondReport = await runApply(csvPath, envPath, path.join(tmpDir, 'reports-2'));

    expect(secondReport.totals.created).toBe(0);
    expect(secondReport.totals.updated).toBe(2);
    expect(secondReport.totals.coverDownloaded).toBe(0);
    expect(secondReport.totals.coverReused).toBe(1);
    expect(secondReport.totals.errors).toBe(0);

    // Нуль незапланованих дублікатів: той самий розмір store, той самий один storage-аплоад разом узятих.
    expect(store.size).toBe(2);
    expect(storageUploads).toBe(1);
  }, 30000);

  it('cover_url лишається ТИМ САМИМ власним URL після повторного --apply (не переписується новим випадковим UUID)', async () => {
    const { csvPath, envPath } = writeFixture();
    await runApply(csvPath, envPath, path.join(tmpDir, 'reports-1'));
    const coverUrlAfterFirst = store.get('idem-book-1').cover_url;

    await runApply(csvPath, envPath, path.join(tmpDir, 'reports-2'));
    const coverUrlAfterSecond = store.get('idem-book-1').cover_url;

    expect(coverUrlAfterSecond).toBe(coverUrlAfterFirst);
  }, 30000);

  /**
   * Регресія на реальний випадок власника продукту (2026-09-14): `--apply` проти проєкту,
   * куди Supabase відхилив УСІ рядки (тут — симуляція "не той ключ у .env.admin", 401 на
   * кожен POST). До фіксу `totals.created`/`totals.updated` рахувались ДО спроби запису й
   * лишались рівними кількості файлу навіть коли жоден рядок не потрапив у базу — звіт
   * виглядав як "усе імпортувалось", хоча насправді нуль. Так само `message` для
   * `DB_UPSERT_FAILED` був самою лише заглушкою "деталі — у повідомленні" без жодних деталей.
   */
  it('Supabase відхиляє КОЖЕН upsert (напр. недійсний ключ) — created/updated=0 (не кількість файлу), помилка на кожному рядку, message містить реальну причину Supabase, не заглушку', async () => {
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/rest/v1/curated_book') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('[]');
        return;
      }
      if (req.method === 'POST' && url.pathname === '/rest/v1/curated_book') {
        req.on('data', () => {});
        req.on('end', () => {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'JWT expired', code: 'PGRST301' }));
        });
        return;
      }
      res.writeHead(404, { 'Content-Length': 0 });
      res.end();
    });

    const { csvPath, envPath } = writeFixture();
    const reportDir = path.join(tmpDir, 'reports-fail');
    const scriptPath = path.join(__dirname, 'sync-curated-books.js');
    const env = { ...process.env };
    delete env.SUPABASE_URL;
    delete env.SUPABASE_SERVICE_ROLE_KEY;

    // На відміну від `runApply` вище: тут CLI ОЧІКУВАНО завершується exit code 1
    // (`report.totals.errors > 0 && args.apply` у sync-curated-books.js) — виняток від
    // execFile тут не збій тесту, а частина сценарію, що перевіряється.
    await expect(
      execFileAsync('node', [scriptPath, csvPath, '--apply', `--env-file=${envPath}`, `--report-dir=${reportDir}`, '--concurrency=2'], {
        env,
        timeout: 15000,
      }),
    ).rejects.toThrow();

    const reportFile = fs.readdirSync(reportDir).find((f) => f.endsWith('.json') && !f.endsWith('-normalized.json'));
    const report = JSON.parse(fs.readFileSync(path.join(reportDir, reportFile), 'utf8'));

    expect(report.totals.created).toBe(0);
    expect(report.totals.updated).toBe(0);
    expect(report.totals.errors).toBe(2);
    expect(store.size).toBe(0); // жодного рядка справді не записано

    const dbIssues = report.rowIssues.filter((i) => i.code === 'DB_UPSERT_FAILED');
    expect(dbIssues).toHaveLength(2);
    for (const issue of dbIssues) {
      expect(issue.message).toContain('401');
      expect(issue.message).toContain('JWT expired');
      expect(issue.message).not.toBe('Supabase відхилив upsert цього рядка (деталі — у повідомленні).');
    }
  }, 20000);
});
