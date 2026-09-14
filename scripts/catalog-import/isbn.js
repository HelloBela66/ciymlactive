'use strict';

/**
 * КАТАЛОГ-ІМПОРТ — валідація/еквіваленти ISBN-10/ISBN-13.
 *
 * НАВМИСНА ЧАСТКОВА ДУБЛІКАЦІЯ `src/lib/isbn.ts` (той самий алгоритм ISO 2108), не імпорт —
 * той самий клас причини, що й `csv.js` у цій же теці (Node CLI-скрипт без TypeScript-раннера
 * не може `require('@/lib/isbn')`), той самий прецедент, що вже задокументований для
 * `supabase/functions/isbndb-proxy/isbn.ts`. Скопійовано все, що потрібне імпорту (включно з
 * `isbnEquivalents`, на відміну від isbndb-proxy, якому конвертація не потрібна — тут вона
 * потрібна для дедублікації §8 ТЗ). Якщо колись розійдеться з оригіналом — обидва мають
 * реалізовувати той самий алгоритм, розходження було б помилкою копіювання, не навмисною
 * відмінністю.
 */

/** @param {string} raw @returns {string} */
function normalizeIsbn(raw) {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

/** @param {string} digits @returns {boolean} */
function isValidIsbn10(digits) {
  if (!/^\d{9}[\dX]$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const char = digits[i];
    const value = char === 'X' ? 10 : Number(char);
    sum += (10 - i) * value;
  }
  return sum % 11 === 0;
}

/** @param {string} digits @returns {boolean} */
function isValidIsbn13(digits) {
  if (!/^\d{13}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const value = Number(digits[i]);
    sum += i % 2 === 0 ? value : value * 3;
  }
  return sum % 10 === 0;
}

/** @param {string} raw @returns {boolean} */
function isValidIsbn(raw) {
  const normalized = normalizeIsbn(raw);
  if (normalized.length === 10) return isValidIsbn10(normalized);
  if (normalized.length === 13) return isValidIsbn13(normalized);
  return false;
}

/** @param {string} raw @returns {string | null} */
function isbn10To13(raw) {
  const normalized = normalizeIsbn(raw);
  if (!isValidIsbn10(normalized)) return null;
  const core = `978${normalized.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += i % 2 === 0 ? Number(core[i]) : Number(core[i]) * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return `${core}${check}`;
}

/** @param {string} raw @returns {string | null} */
function isbn13To10(raw) {
  const normalized = normalizeIsbn(raw);
  if (!isValidIsbn13(normalized)) return null;
  if (!normalized.startsWith('978')) return null;
  const core = normalized.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * Number(core[i]);
  }
  const remainder = (11 - (sum % 11)) % 11;
  const check = remainder === 10 ? 'X' : String(remainder);
  return `${core}${check}`;
}

/** @param {string} raw @returns {{ isbn10: string | null, isbn13: string | null }} */
function isbnEquivalents(raw) {
  const normalized = normalizeIsbn(raw);
  if (isValidIsbn10(normalized)) {
    return { isbn10: normalized, isbn13: isbn10To13(normalized) };
  }
  if (isValidIsbn13(normalized)) {
    return { isbn10: isbn13To10(normalized), isbn13: normalized };
  }
  return { isbn10: null, isbn13: null };
}

module.exports = {
  normalizeIsbn,
  isValidIsbn,
  isbn10To13,
  isbn13To10,
  isbnEquivalents,
};
