'use strict';

/**
 * КАТАЛОГ-ІМПОРТ (POLYTSIA — OWN BOOK CATALOG IMPORT & COVER PIPELINE) — RFC 4180 CSV-парсер.
 *
 * НАВМИСНА ЧАСТКОВА ДУБЛІКАЦІЯ `src/lib/csv.ts`'s `parseCsv` (той самий алгоритм символ-у-
 * символ), не імпорт: цей файл виконується як звичайний Node CommonJS-скрипт (`node
 * scripts/sync-curated-books.js`), поза Metro/Jest/tsc — тут немає жодного TypeScript-раннера
 * (`ts-node`/`tsx` НЕ додані навмисно, докладніше — коментар нижче й `docs/OWN_CATALOG_IMPORT.md`
 * §"Чому без нових залежностей"), тож пряме `require('@/lib/csv')` тут неможливе (алiас `@/*`
 * резолвиться лише Metro/tsc/Jest, не голим Node). Той самий клас проблеми й те саме рішення,
 * що вже задокументовано для `supabase/functions/isbndb-proxy/isbn.ts` (Deno vs React Native) —
 * тут Node CLI-скрипт vs React Native застосунок, різні виконавчі середовища без спільного
 * бандлера. Якщо колись розійдеться з оригіналом — обидва мають реалізовувати той самий
 * RFC 4180 діалект, розходження було б помилкою копіювання, не навмисною відмінністю.
 *
 * Свідомо СВІЙ парсер, не нова npm-залежність (`csv-parse`/`papaparse` тощо) — той самий
 * принцип, що вже задокументований у самому `src/lib/csv.ts`: нова залежність — реальний
 * ризик у середовищі з обмеженим доступом до npm-реєстру для перевірки версій, а формат
 * простий (лапки/екранування подвоєнням/переноси рядків усередині поля) — власна реалізація
 * безпечніша за неперевірений пакет.
 */

/**
 * @param {string} text
 * @returns {string[][]}
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const normalized = withoutBom.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/**
 * Явний header (ТЗ §4: "Не покладатися на positional undocumented rows forever") — перший
 * рядок таблиці стає іменами колонок, решта — дані. Повертає `null` для порожнього файлу
 * (виклик сам вирішує, чи це помилка).
 *
 * @param {string} text
 * @returns {{ header: string[], rows: string[][] } | null}
 */
function parseCsvWithHeader(text) {
  const table = parseCsv(text);
  const header = table[0];
  if (!header) return null;
  return { header: header.map((h) => h.trim()), rows: table.slice(1) };
}

/**
 * Іменований доступ до клітинки рядка за назвою колонки (та сама зручність, що
 * `goodreadsImport.ts`'s `get(row, columnName)`) — відсутня колонка чи клітинка повертає
 * порожній рядок, ніколи не кидає (один неочікуваний/бракуючий стовпець не має валити весь
 * імпорт, ТЗ §6).
 *
 * @param {string[]} header
 * @returns {(row: string[], columnName: string) => string}
 */
function buildColumnGetter(header) {
  const columnIndex = new Map(header.map((name, index) => [name, index]));
  return (row, columnName) => {
    const index = columnIndex.get(columnName);
    if (index == null) return '';
    const value = row[index];
    return typeof value === 'string' ? value.trim() : '';
  };
}

module.exports = { parseCsv, parseCsvWithHeader, buildColumnGetter };
