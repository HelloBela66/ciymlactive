'use strict';

const fs = require('fs');
const path = require('path');
const { severityOf, messageOf } = require('./errorCodes');

/**
 * КАТАЛОГ-ІМПОРТ — звіт імпорту (ТЗ §37-38). `curated_book` — плоска таблиця (жоден локальний
 * Work/Edition тут не створюється, докладніше — `docs/OWN_CATALOG_IMPORT.md`
 * §"Work vs Edition"), тож поля звіту з ілюстрації ТЗ ("Created works"/"Created editions")
 * адаптовано до реальної форми результату: "Upserted (нові)"/"Upserted (оновлені)" — той самий
 * дух ("скільки СТВОРЕНО, скільки ОНОВЛЕНО"), інша термінологія під реальну схему.
 *
 * @param {{
 *   batchId: string,
 *   file: string,
 *   mode: 'dry-run' | 'apply',
 *   supabaseHost: string | null,
 *   startedAt: string,
 *   finishedAt: string,
 *   totalRows: number,
 *   rowIssues: Array<{ rowNumber: number, id?: string, title?: string, isbn?: string, code: string, message?: string }>,
 *   created: number,
 *   updated: number,
 *   coverDownloaded: number,
 *   coverReused: number,
 *   coverFailed: number,
 * }} params
 */
function buildReport(params) {
  const rowIssues = params.rowIssues.map((issue) => ({
    rowNumber: issue.rowNumber,
    id: issue.id ?? null,
    title: issue.title ?? null,
    isbn: issue.isbn ?? null,
    code: issue.code,
    severity: severityOf(issue.code),
    message: issue.message ?? messageOf(issue.code),
  }));

  const errorRows = rowIssues.filter((r) => r.severity === 'error');
  const warningRows = rowIssues.filter((r) => r.severity === 'warning');
  const invalidIsbnCount = rowIssues.filter((r) => r.code === 'INVALID_ISBN').length;
  const duplicateCount = rowIssues.filter((r) => r.code === 'DUPLICATE_ISBN' || r.code === 'DUPLICATE_ID_IN_FILE').length;

  return {
    batchId: params.batchId,
    file: params.file,
    mode: params.mode,
    supabaseHost: params.supabaseHost,
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    totals: {
      totalRows: params.totalRows,
      parsed: params.totalRows,
      valid: params.totalRows - errorRows.length,
      invalidRows: errorRows.length,
      created: params.created,
      updated: params.updated,
      invalidIsbn: invalidIsbnCount,
      duplicateRows: duplicateCount,
      coverDownloaded: params.coverDownloaded,
      coverReused: params.coverReused,
      coverFailed: params.coverFailed,
      warnings: warningRows.length,
      errors: errorRows.length,
    },
    rowIssues,
  };
}

/** Людський текстовий звіт (той самий список полів, що ТЗ §37, для друку в термінал одразу
 * після прогону) — окремо від JSON-файлу (`writeReportFiles`), щоб власник бачив підсумок без
 * відкриття файлу. */
function formatReportText(report) {
  const t = report.totals;
  const lines = [
    `Каталог-імпорт — партія ${report.batchId} (${report.mode === 'apply' ? 'APPLY' : 'DRY-RUN'})`,
    `Файл: ${report.file}`,
    report.supabaseHost ? `Ціль: ${report.supabaseHost}` : 'Ціль: (Supabase не налаштовано — лише парсинг/валідація)',
    `Початок: ${report.startedAt}  Кінець: ${report.finishedAt}`,
    '',
    `Усього рядків:        ${t.totalRows}`,
    `Розпарсено:            ${t.parsed}`,
    `Валідних:              ${t.valid}`,
    `Невалідних (пропущено): ${t.invalidRows}`,
    `Створено (нові):        ${t.created}`,
    `Оновлено (існували):    ${t.updated}`,
    `Невалідний ISBN:        ${t.invalidIsbn}`,
    `Дублікати (рядки):      ${t.duplicateRows}`,
    `Обкладинок завантажено: ${t.coverDownloaded}`,
    `Обкладинок повторно:    ${t.coverReused} (уже мали власний storage URL)`,
    `Обкладинок не вдалося:  ${t.coverFailed}`,
    `Попереджень:            ${t.warnings}`,
    `Помилок:                ${t.errors}`,
  ];

  if (report.rowIssues.length > 0) {
    lines.push('', 'Рядки з попередженнями/помилками:');
    for (const issue of report.rowIssues) {
      const label = issue.severity === 'error' ? 'ПОМИЛКА' : 'попередження';
      lines.push(
        `  рядок ${issue.rowNumber} [${label}] ${issue.code} — id="${issue.id ?? '—'}" title="${issue.title ?? '—'}": ${issue.message}`,
      );
    }
  }

  return lines.join('\n');
}

/** Пише і JSON (машинно-читаний, для наступного review/діагностики), і `.txt` (людський) —
 * обидва в одну директорію, іменовані `batchId`, щоб кілька прогонів не перезаписували один
 * одного (ТЗ §36: "Every import run should have generated batch id"). Побічний ефект (fs) —
 * навмисно тонкий, уся логіка збирання звіту вище лишається чистою й тестованою без диска. */
function writeReportFiles(outDir, report) {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${report.batchId}.json`);
  const textPath = path.join(outDir, `${report.batchId}.txt`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(textPath, formatReportText(report), 'utf8');
  return { jsonPath, textPath };
}

module.exports = { buildReport, formatReportText, writeReportFiles };
