'use strict';

/**
 * КАТАЛОГ-ІМПОРТ — дедублікація В МЕЖАХ ОДНОГО ФАЙЛУ (ТЗ §8, §40). `curated_book.id` — сам
 * первинний ключ upsert (`supabase/schema.sql`), тож "той самий id двічі" технічно НЕ падає
 * (звичайний upsert, останній рядок файлу переможе) — застереження тут лише попередження
 * (`DUPLICATE_ID_IN_FILE`), не блокування.
 *
 * РЕАЛЬНА небезпека — інша: `curated_book_isbn13_key`/`curated_book_isbn10_key`
 * (`unique index ... where isbn13/isbn10 is not null`) — якщо ДВА РІЗНІ `id` в одному файлі
 * заявляють той самий ISBN, другий апсерт впаде на `23505 unique_violation` (ISBN уже належить
 * іншому рядку каталогу). Дослідження `data/curated-books.csv` підтвердило: це не гіпотетичний
 * випадок — реальний файл (2094 рядки) має точно один такий конфлікт
 * (`kuznietsova-drabyna`/`kuznietsova-e-book-drabyna`, обидва `9789664480977`). Виявляємо це тут,
 * ДО мережевого виклику — конфліктний рядок іде в `excluded` (`DUPLICATE_ISBN`, ТЗ §39), решта
 * файлу апсертиться нормально (ТЗ §6, invalid row не валить увесь імпорт).
 *
 * "title+contributor fallback" (ТЗ §8, рівень 4) тут НЕ реалізовано: `curated_book` апсертиться
 * за явним `id`, а не резолвиться "яка це книга" за назвою — той самий "ніколи не зливай лише
 * за назвою, коли є неоднозначність" принцип, застосований радикальніше: тут ЗАВЖДИ є явний
 * ключ (сам `id`), тож title-фолбек просто нема коли викликати. `AMBIGUOUS_WORK_MATCH`
 * лишається задокументованим кодом (`errorCodes.js`) про запас, на випадок майбутнього
 * title-based дедуп-режиму — наразі недосяжний цим кодом шлях.
 *
 * @param {Array<{ rowNumber: number, normalized: ReturnType<typeof import('./normalize').normalizeRecord> }>} entries
 * @returns {{
 *   toImport: Array<{ rowNumber: number, normalized: object }>,
 *   excluded: Array<{ rowNumber: number, id: string, code: string, field?: string }>,
 *   warnings: Array<{ rowNumber: number, id: string, code: string }>,
 * }}
 */
function detectDuplicates(entries) {
  const byId = new Map();
  const isbn13Owner = new Map();
  const isbn10Owner = new Map();
  const idOrder = [];
  const warnings = [];
  const excluded = [];

  for (const entry of entries) {
    const { rowNumber, normalized } = entry;
    const { id, isbn13, isbn10 } = normalized;

    if (byId.has(id)) {
      warnings.push({ rowNumber, id, code: 'DUPLICATE_ID_IN_FILE' });
    } else {
      idOrder.push(id);
    }

    let conflictField = null;
    if (isbn13) {
      const owner = isbn13Owner.get(isbn13);
      if (owner && owner !== id) conflictField = 'isbn13';
    }
    if (!conflictField && isbn10) {
      const owner = isbn10Owner.get(isbn10);
      if (owner && owner !== id) conflictField = 'isbn10';
    }

    if (conflictField) {
      excluded.push({ rowNumber, id, code: 'DUPLICATE_ISBN', field: conflictField });
      continue;
    }

    if (isbn13) isbn13Owner.set(isbn13, id);
    if (isbn10) isbn10Owner.set(isbn10, id);
    byId.set(id, entry);
  }

  const toImport = idOrder.map((id) => byId.get(id)).filter((entry) => entry !== undefined);
  return { toImport, excluded, warnings };
}

module.exports = { detectDuplicates };
