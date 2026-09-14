'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildReport, formatReportText, writeReportFiles } = require('./report');

function baseParams(overrides) {
  return {
    batchId: '2026-09-14T12-00-00-000Z',
    file: 'data/curated-books.csv',
    mode: 'dry-run',
    supabaseHost: null,
    startedAt: '2026-09-14T12:00:00.000Z',
    finishedAt: '2026-09-14T12:00:05.000Z',
    totalRows: 3,
    rowIssues: [],
    created: 0,
    updated: 0,
    coverDownloaded: 0,
    coverReused: 0,
    coverFailed: 0,
    ...overrides,
  };
}

describe('buildReport', () => {
  it('без жодної проблеми — усі рядки валідні, totals узгоджені', () => {
    const report = buildReport(baseParams({ totalRows: 5, created: 5 }));
    expect(report.totals).toEqual({
      totalRows: 5,
      parsed: 5,
      valid: 5,
      invalidRows: 0,
      created: 5,
      updated: 0,
      invalidIsbn: 0,
      duplicateRows: 0,
      coverDownloaded: 0,
      coverReused: 0,
      coverFailed: 0,
      warnings: 0,
      errors: 0,
    });
  });

  it('рядок з error-кодом (MISSING_ID) зменшує valid і збільшує invalidRows/errors, severity/message резолвяться автоматично', () => {
    const report = buildReport(
      baseParams({
        totalRows: 3,
        rowIssues: [{ rowNumber: 2, id: null, title: null, isbn: null, code: 'MISSING_ID' }],
      }),
    );
    expect(report.totals.valid).toBe(2);
    expect(report.totals.invalidRows).toBe(1);
    expect(report.totals.errors).toBe(1);
    expect(report.totals.warnings).toBe(0);
    expect(report.rowIssues[0]).toMatchObject({ rowNumber: 2, code: 'MISSING_ID', severity: 'error' });
    expect(report.rowIssues[0].message).toContain('Порожній id');
  });

  it('рядок з warning-кодом (NO_GENRES) НЕ зменшує valid, лише збільшує warnings', () => {
    const report = buildReport(
      baseParams({
        totalRows: 3,
        rowIssues: [{ rowNumber: 1, code: 'NO_GENRES' }],
      }),
    );
    expect(report.totals.valid).toBe(3);
    expect(report.totals.invalidRows).toBe(0);
    expect(report.totals.warnings).toBe(1);
    expect(report.totals.errors).toBe(0);
  });

  it('INVALID_ISBN рахується окремо в totals.invalidIsbn (додатково до загального errors)', () => {
    const report = buildReport(baseParams({ rowIssues: [{ rowNumber: 1, code: 'INVALID_ISBN' }] }));
    expect(report.totals.invalidIsbn).toBe(1);
    expect(report.totals.errors).toBe(1);
  });

  it('DUPLICATE_ISBN і DUPLICATE_ID_IN_FILE обидва рахуються в totals.duplicateRows', () => {
    const report = buildReport(
      baseParams({
        rowIssues: [
          { rowNumber: 1, code: 'DUPLICATE_ISBN' },
          { rowNumber: 2, code: 'DUPLICATE_ID_IN_FILE' },
        ],
      }),
    );
    expect(report.totals.duplicateRows).toBe(2);
  });

  it('явно передане message перекриває дефолтне з errorCodes.js', () => {
    const report = buildReport(baseParams({ rowIssues: [{ rowNumber: 1, code: 'INVALID_ISBN', message: 'Кастомне повідомлення' }] }));
    expect(report.rowIssues[0].message).toBe('Кастомне повідомлення');
  });

  it('cover-лічильники передаються без змін у totals', () => {
    const report = buildReport(baseParams({ coverDownloaded: 10, coverReused: 4, coverFailed: 2 }));
    expect(report.totals.coverDownloaded).toBe(10);
    expect(report.totals.coverReused).toBe(4);
    expect(report.totals.coverFailed).toBe(2);
  });
});

describe('formatReportText', () => {
  it('містить batchId, режим (DRY-RUN/APPLY) і файл', () => {
    const dryRun = formatReportText(buildReport(baseParams({ mode: 'dry-run' })));
    expect(dryRun).toContain('2026-09-14T12-00-00-000Z');
    expect(dryRun).toContain('DRY-RUN');
    expect(dryRun).toContain('data/curated-books.csv');

    const apply = formatReportText(buildReport(baseParams({ mode: 'apply', supabaseHost: 'project.supabase.co' })));
    expect(apply).toContain('APPLY');
    expect(apply).toContain('project.supabase.co');
  });

  it('без Supabase-конфігурації позначає це явно в тексті', () => {
    const text = formatReportText(buildReport(baseParams({ supabaseHost: null })));
    expect(text).toContain('Supabase не налаштовано');
  });

  it('при наявності rowIssues — перелічує кожен рядок з позначкою ПОМИЛКА/попередження', () => {
    const report = buildReport(
      baseParams({
        rowIssues: [
          { rowNumber: 5, id: 'book-x', title: 'Назва X', code: 'MISSING_TITLE' },
          { rowNumber: 8, id: 'book-y', title: 'Назва Y', code: 'NO_GENRES' },
        ],
      }),
    );
    const text = formatReportText(report);
    expect(text).toContain('рядок 5 [ПОМИЛКА] MISSING_TITLE');
    expect(text).toContain('рядок 8 [попередження] NO_GENRES');
  });

  it('без жодного rowIssue — не додає секцію "Рядки з попередженнями/помилками"', () => {
    const text = formatReportText(buildReport(baseParams({ rowIssues: [] })));
    expect(text).not.toContain('Рядки з попередженнями/помилками');
  });
});

describe('writeReportFiles', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-report-test-'));
  });

  afterEach(() => {
    // maxRetries/retryDelay — Windows інколи тримає щойно записаний файл коротко залоченим
    // (антивірус/індексатор), rmSync тоді падає з EBUSY навіть при force:true; Node сама
    // документує ці два параметри як штатний спосіб пережити саме такий транзієнтний лок.
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('пише і .json, і .txt файли, іменовані batchId, директорія створюється, якщо не існує', () => {
    const outDir = path.join(tmpDir, 'nested', 'reports');
    const report = buildReport(baseParams({ batchId: 'batch-abc' }));
    const { jsonPath, textPath } = writeReportFiles(outDir, report);

    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(textPath)).toBe(true);
    expect(path.basename(jsonPath)).toBe('batch-abc.json');
    expect(path.basename(textPath)).toBe('batch-abc.txt');
  });

  it('записаний JSON коректно парситься назад і рівний вхідному звіту', () => {
    const report = buildReport(baseParams({ batchId: 'batch-roundtrip', totalRows: 7, created: 3, updated: 2 }));
    const { jsonPath } = writeReportFiles(tmpDir, report);
    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    expect(parsed).toEqual(report);
  });

  it('записаний .txt відповідає formatReportText(report)', () => {
    const report = buildReport(baseParams({ batchId: 'batch-text' }));
    const { textPath } = writeReportFiles(tmpDir, report);
    expect(fs.readFileSync(textPath, 'utf8')).toBe(formatReportText(report));
  });
});
