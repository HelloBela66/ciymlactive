'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const { parseArgs, readEnvFile, loadSupabaseConfig, readCsvFile, filterAgainstCatalog } = require('./sync-curated-books');

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

  it('--only-new вимкнений за замовчуванням (оновлення — теж легітимний сценарій)', () => {
    expect(parseArgs(['f.csv']).onlyNew).toBe(false);
    expect(parseArgs(['f.csv', '--only-new']).onlyNew).toBe(true);
  });
});

describe('filterAgainstCatalog — звірка з РЕАЛЬНИМ станом каталогу, а не з вмістом файлу', () => {
  function entry(rowNumber, id, isbn13, isbn10) {
    return { rowNumber, normalized: { id, isbn13: isbn13 ?? null, isbn10: isbn10 ?? null, title: 'Назва' } };
  }
  const empty = { existingIds: new Set(), isbn13Owners: new Map(), isbn10Owners: new Map(), onlyNew: false };

  it('нічого не заважає — усі рядки лишаються', () => {
    const r = filterAgainstCatalog([entry(2, 'a', '9780306406157')], empty);
    expect(r.kept).toHaveLength(1);
    expect(r.skipped).toHaveLength(0);
  });

  // Саме цей випадок дав 411 відмов 16.09.2026: та сама книга під двома транслітераціями слага.
  it('ISBN належить ІНШОМУ id — рядок відсіяно з ISBN_TAKEN_IN_CATALOG', () => {
    const r = filterAgainstCatalog([entry(2, 'huver-pokyn-iakshcho', '9789669425140')], {
      ...empty,
      isbn13Owners: new Map([['9789669425140', 'huver-pokyn-yakshcho']]),
    });
    expect(r.kept).toHaveLength(0);
    expect(r.skipped[0].code).toBe('ISBN_TAKEN_IN_CATALOG');
    expect(r.skipped[0].message).toContain('huver-pokyn-yakshcho');
  });

  it('ISBN належить ТОМУ САМОМУ id — не конфлікт, це звичайне оновлення книги', () => {
    const r = filterAgainstCatalog([entry(2, 'kobzar', '9780306406157')], {
      ...empty,
      isbn13Owners: new Map([['9780306406157', 'kobzar']]),
    });
    expect(r.kept).toHaveLength(1);
    expect(r.skipped).toHaveLength(0);
  });

  it('конфлікт по isbn10 ловиться так само, як по isbn13', () => {
    const r = filterAgainstCatalog([entry(2, 'a', null, '0306406152')], {
      ...empty,
      isbn10Owners: new Map([['0306406152', 'b']]),
    });
    expect(r.skipped[0].code).toBe('ISBN_TAKEN_IN_CATALOG');
  });

  it('без --only-new наявний id проходить далі — це оновлення', () => {
    const r = filterAgainstCatalog([entry(2, 'kobzar')], { ...empty, existingIds: new Set(['kobzar']) });
    expect(r.kept).toHaveLength(1);
  });

  it('з --only-new наявний id пропускається (SKIPPED_EXISTING_ID) — каталог не чіпаємо', () => {
    const r = filterAgainstCatalog([entry(2, 'kobzar'), entry(3, 'nova')], {
      ...empty,
      existingIds: new Set(['kobzar']),
      onlyNew: true,
    });
    expect(r.kept.map((e) => e.normalized.id)).toEqual(['nova']);
    expect(r.skipped[0].code).toBe('SKIPPED_EXISTING_ID');
  });

  it('--only-new має пріоритет над перевіркою ISBN — рядок і так не заливається', () => {
    const r = filterAgainstCatalog([entry(2, 'kobzar', '9780306406157')], {
      existingIds: new Set(['kobzar']),
      isbn13Owners: new Map([['9780306406157', 'hto-inshyi']]),
      isbn10Owners: new Map(),
      onlyNew: true,
    });
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].code).toBe('SKIPPED_EXISTING_ID');
  });
});

describe('readEnvFile', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-env-'));
  });
  afterEach(() => {
    // maxRetries/retryDelay — той самий захист від транзієнтного Windows EBUSY, що й
    // scripts/catalog-import/report.test.js (докладніше — коментар там).
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
    // maxRetries/retryDelay — той самий захист від транзієнтного Windows EBUSY, що й
    // scripts/catalog-import/report.test.js (докладніше — коментар там).
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
    // maxRetries/retryDelay — той самий захист від транзієнтного Windows EBUSY, що й
    // scripts/catalog-import/report.test.js (докладніше — коментар там).
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
        // Пошук власників ISBN (`fetchIsbnOwners`) — окрема гілка від пошуку за id.
        for (const column of ['isbn13', 'isbn10']) {
          const param = url.searchParams.get(column);
          const m = param && param.match(/^in\.\((.*)\)$/);
          if (!m) continue;
          const wanted = new Set(m[1].split(','));
          const found = [...store.values()]
            .filter((row) => row[column] && wanted.has(row[column]))
            .map((row) => ({ id: row.id, [column]: row[column] }));
          const payloadIsbn = JSON.stringify(found);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payloadIsbn) });
          res.end(payloadIsbn);
          return;
        }
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
    // maxRetries/retryDelay — той самий захист від транзієнтного Windows EBUSY, що й
    // scripts/catalog-import/report.test.js (докладніше — коментар там).
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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

  /**
   * @param {string[]} extraFlags додаткові прапорці CLI
   * @param {boolean} allowFailure очікуваний ненульовий exit code (прогін зі знайденими
   *   помилками завершується 1 — для частини сценаріїв це і є правильна поведінка, а не збій)
   */
  async function runApply(csvPath, envPath, reportDir, extraFlags = [], allowFailure = false) {
    const scriptPath = path.join(__dirname, 'sync-curated-books.js');
    const env = { ...process.env };
    delete env.SUPABASE_URL;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    const run = execFileAsync(
      'node',
      [scriptPath, csvPath, '--apply', `--env-file=${envPath}`, `--report-dir=${reportDir}`, '--concurrency=2', ...extraFlags],
      { env, timeout: 15000 },
    );
    if (allowFailure) await run.catch(() => {});
    else await run;
    const reportFile = fs.readdirSync(reportDir).find((f) => f.endsWith('.json') && !f.endsWith('-normalized.json'));
    return JSON.parse(fs.readFileSync(path.join(reportDir, reportFile), 'utf8'));
  }

  /**
   * Реальний випадок 16.09.2026: та сама книга вже в каталозі під іншим слагом (інша
   * транслітерація), ISBN збігається. До цієї правки такий рядок встигав СКАЧАТИ й ЗАЛИТИ
   * обкладинку, і лише потім падав на unique-обмеженні — 411 помилок і 411 сиріт у сховищі.
   */
  it('ISBN уже належить іншій книзі каталогу — рядок відсіяно ДО завантаження обкладинки', async () => {
    const base = baseUrl();
    // У каталозі вже є книга з цим ISBN, під ІНШИМ слагом.
    store.set('kniga-yakshcho', { id: 'kniga-yakshcho', isbn13: '9780306406157', cover_url: `${base}/storage/v1/object/public/book-covers/curated/kniga-yakshcho.jpg` });

    const csvPath = path.join(tmpDir, 'clash.csv');
    const envPath = path.join(tmpDir, '.env.test');
    fs.writeFileSync(
      csvPath,
      [
        'id,title,authors,isbn13,isbn10,page_count,cover_url,description,genres,purposes,language,is_active',
        `kniga-iakshcho,Та сама книга іншим слагом,Автор,9780306406157,,200,${base}/cover.jpg,Опис книги достатньої довжини для перевірки.,Фентезі,light,uk,true`,
        `zovsim-nova,Справді нова книга,Автор,,,150,${base}/cover.jpg,Опис другої книги достатньої довжини.,Детектив,cry,uk,true`,
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(envPath, `SUPABASE_URL=${base}\nSUPABASE_SERVICE_ROLE_KEY=test-service-role-key\n`, 'utf8');

    const report = await runApply(csvPath, envPath, path.join(tmpDir, 'reports-clash'), [], true);

    // Конфліктний рядок у базу не потрапив...
    expect(store.has('kniga-iakshcho')).toBe(false);
    // ...і, головне, його обкладинка НЕ качалась: вивантаження рівно одне, для нової книги.
    expect(storageUploads).toBe(1);
    expect(store.has('zovsim-nova')).toBe(true);
    expect(report.totals.created).toBe(1);

    const clash = report.rowIssues.find((i) => i.code === 'ISBN_TAKEN_IN_CATALOG');
    expect(clash).toBeTruthy();
    expect(clash.id).toBe('kniga-iakshcho');
    expect(clash.message).toContain('kniga-yakshcho');
    // Жодного DB_UPSERT_FAILED — рядок навіть не дійшов до апсерту.
    expect(report.rowIssues.some((i) => i.code === 'DB_UPSERT_FAILED')).toBe(false);
  }, 20000);

  /**
   * Сценарій «долити нові книги з дампа, нічого не чіпаючи». Без прапорця апсерт мовчки
   * перезаписав би наявні рядки — саме так 1372 книги отримали описи зі старішого набору.
   */
  it('--only-new: наявні книги не оновлюються, нові додаються', async () => {
    const { csvPath, envPath } = writeFixture();
    await runApply(csvPath, envPath, path.join(tmpDir, 'reports-1'));
    const uploadsAfterFirst = storageUploads;
    store.get('idem-book-1').title = 'Назва, яку не можна перезаписати';

    const second = await runApply(csvPath, envPath, path.join(tmpDir, 'reports-2'), ['--only-new']);

    expect(second.totals.created).toBe(0);
    expect(second.totals.updated).toBe(0);
    expect(store.get('idem-book-1').title).toBe('Назва, яку не можна перезаписати');
    expect(storageUploads).toBe(uploadsAfterFirst);
    expect(second.rowIssues.filter((i) => i.code === 'SKIPPED_EXISTING_ID')).toHaveLength(2);
  }, 20000);

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
  /**
   * Обкладинка завантажується ДО апсерту — інакше нічого було б класти в `cover_url`. Значить
   * будь-яка відмова бази лишає в сховищі файл книги, якої в каталозі немає. 16.09.2026 таких
   * сиріт назбиралось 411, і прибирати їх довелось окремим скриптом по всьому bucket.
   */
  it('апсерт відхилено — щойно завантажена обкладинка прибирається в тому ж прогоні', async () => {
    const deletedPaths = [];
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/cover.jpg') {
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': JPEG_BYTES.length });
        res.end(JPEG_BYTES);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/rest/v1/curated_book') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('[]');
        return;
      }
      if (req.method === 'POST' && url.pathname === '/rest/v1/curated_book') {
        req.on('data', () => {});
        req.on('end', () => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'disk full', code: 'XX000' }));
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
      if (req.method === 'DELETE' && url.pathname === '/storage/v1/object/book-covers') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          deletedPaths.push(...JSON.parse(body).prefixes);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('[]');
        });
        return;
      }
      res.writeHead(404, { 'Content-Length': 0 });
      res.end();
    });

    const { csvPath, envPath } = writeFixture();
    await runApply(csvPath, envPath, path.join(tmpDir, 'reports-orphan'), [], true);

    // Обкладинка встигла залитись (пайплайн іде до апсерту)...
    expect(storageUploads).toBe(1);
    // ...і була прибрана, бо рядок у каталог не потрапив.
    expect(deletedPaths).toEqual(['curated/idem-book-1.jpg']);
  }, 20000);

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
