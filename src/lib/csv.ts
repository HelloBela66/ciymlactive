/**
 * Мінімальний RFC 4180 CSV — навмисно свій, а не нова npm-залежність (у цьому середовищі
 * немає доступу до npm-реєстру для перевірки версій, `docs/BUILD_AND_RELEASE.md`, тож нова
 * залежність — реальний ризик, а не зручність). Формат простий (екранування ком/лапок/
 * переносів рядків подвоєнням лапок) — власна реалізація тут безпечніша за неперевірений
 * пакет.
 */
export function csvEscapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvEscapeCell).join(','));
  // BOM на початку — без нього Excel (навіть сучасний) часто відкриває кириличний UTF-8 CSV
  // як мойбаке, доки користувач вручну не вкаже кодування при імпорті.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Проста таблична модель для розбору CSV, що читаємо (Goodreads-імпорт, Milestone 9) —
 * підтримує лапки з екранованими комами/переносами рядків усередині поля, як і `buildCsv`
 * вище пише. Повертає масив рядків, кожен — масив клітинок (без окремого виділення шапки —
 * виклик сам вирішує, чи перший рядок це шапка). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  // Знімаємо BOM, якщо він є (наш власний `buildCsv` завжди його додає, і чужі файли —
  // наприклад, Goodreads-експорт, збережений через Excel — часто теж) — інакше він
  // приклеюється до першої клітинки першого рядка (шапки).
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  // Нормалізуємо переноси рядків заздалегідь — простіше, ніж розрізняти \r\n/\n/\r
  // усередині основного циклу нижче.
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

  // Останнє поле/рядок без завершального переносу рядка в кінці файлу.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}
