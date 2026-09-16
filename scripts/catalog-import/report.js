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

/**
 * Скільки рядків з ПОМИЛКАМИ показувати поіменно в текстовому звіті.
 *
 * Причина межі — масштаб. На партії в 3000 рядків код `POTENTIAL_SERIES_METADATA` дає близько
 * 350 попереджень, на повному каталозі з 29 986 книг — близько 3462. Построковий звіт тоді
 * перетворював термінал на стрічку, у якій підсумок («Обкладинок не вдалося», «Помилок»)
 * прокручувався геть — а саме заради нього звіт і друкується одразу після прогону. Тобто
 * детальність не додавала інформації, а ховала ту, що вже була.
 *
 * Тому текстовий звіт відповідає на два різні питання: «яких проблем і скільки» (зведення за
 * кодами) і «які саме рядки треба виправити руками» (перелік — але лише для
 * `severity: 'error'`, бо тільки вони НЕ потрапили в базу, ТЗ §38). Попередження показуються
 * лише числом: рядок з попередженням імпортувався, і читати 3462 однакові повідомлення підряд
 * нема сенсу.
 *
 * Нічого не втрачається: `rowIssues` у JSON-звіті лишається ПОВНИМ, до останнього рядка, і
 * текст явно каже, скільки саме там ще лишилось.
 */
const TEXT_REPORT_ERROR_ROW_LIMIT = 50;

/** Зведення «код — кількість»: найчастіші згори, помилки перед попередженнями — саме помилки
 * означають «рядок у базу не потрапив», тож вони мають читатись першими. */
function summarizeIssuesByCode(rowIssues) {
  const byCode = new Map();
  for (const issue of rowIssues) {
    const entry = byCode.get(issue.code) ?? { code: issue.code, severity: issue.severity, count: 0 };
    entry.count++;
    byCode.set(issue.code, entry);
  }
  return [...byCode.values()].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return a.code.localeCompare(b.code);
  });
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
    const summary = summarizeIssuesByCode(report.rowIssues);
    const codeWidth = Math.max(...summary.map((entry) => entry.code.length));

    lines.push('', 'Проблеми за кодами:');
    for (const entry of summary) {
      const label = entry.severity === 'error' ? 'ПОМИЛКА     ' : 'попередження';
      lines.push(`  [${label}] ${entry.code.padEnd(codeWidth)}  ${entry.count}`);
    }

    const errorRows = report.rowIssues.filter((issue) => issue.severity === 'error');
    if (errorRows.length > 0) {
      const shown = errorRows.slice(0, TEXT_REPORT_ERROR_ROW_LIMIT);
      lines.push(
        '',
        errorRows.length > shown.length
          ? `Рядки з помилками (перші ${shown.length} із ${errorRows.length}) — ці рядки в базу НЕ потрапили:`
          : `Рядки з помилками (${errorRows.length}) — ці рядки в базу НЕ потрапили:`,
      );
      for (const issue of shown) {
        lines.push(
          `  рядок ${issue.rowNumber} [ПОМИЛКА] ${issue.code} — id="${issue.id ?? '—'}" title="${issue.title ?? '—'}": ${issue.message}`,
        );
      }
      if (errorRows.length > shown.length) {
        lines.push(`  … ще ${errorRows.length - shown.length} — повний перелік у JSON-звіті (rowIssues).`);
      }
    }

    const warningCount = report.rowIssues.length - errorRows.length;
    if (warningCount > 0) {
      lines.push(
        '',
        `Попередження (${warningCount}) показані лише зведенням вище — ці рядки імпортувались. ` +
          'Повний построковий перелік — у JSON-звіті (rowIssues).',
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

module.exports = {
  TEXT_REPORT_ERROR_ROW_LIMIT,
  buildReport,
  summarizeIssuesByCode,
  formatReportText,
  writeReportFiles,
};
