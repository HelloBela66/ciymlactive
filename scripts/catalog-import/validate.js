'use strict';

const { isValidIsbn, normalizeIsbn } = require('./isbn');
const { SEED_GENRES, RECOMMENDATION_PURPOSES, LIMITS, ID_PATTERN } = require('./catalogSchema');

/**
 * КАТАЛОГ-ІМПОРТ — валідація ОДНОГО сирого рядка (ТЗ §6). Чиста функція: рядок → список
 * помилок/попереджень, жодного мережевого виклику. Помилка (`severity: 'error'`) означає, що
 * рядок НЕ можна безпечно нормалізувати/записати — виклик (`runImport.js`) пропускає такий
 * рядок і йде далі, решта файлу не постраждає (ТЗ §6: "Invalid row: НЕ падіння всього
 * імпорту"). Попередження не блокують рядок.
 *
 * @param {ReturnType<typeof import('./catalogSchema').rawRecordFromRow>} record
 * @returns {{ errors: Array<{code: string, field?: string}>, warnings: Array<{code: string, field?: string}> }}
 */
function validateRecord(record) {
  const errors = [];
  const warnings = [];
  const addError = (code, field) => errors.push(field ? { code, field } : { code });
  const addWarning = (code, field) => warnings.push(field ? { code, field } : { code });

  // Невалідний UTF-8 у вихідному файлі осідає в рядку replacement-символом (U+FFFD) при
  // декодуванні `fs.readFileSync(path, 'utf8')` — сам символ ловимо тут, у БУДЬ-якому текстовому
  // полі, а не намагаємось перевіряти сирі байти (Node уже зробив декодування до того, як текст
  // сюди дійшов).
  const REPLACEMENT_CHAR = '�';
  for (const [field, value] of Object.entries(record)) {
    if (typeof value === 'string' && value.includes(REPLACEMENT_CHAR)) {
      addError('INVALID_UTF8', field);
    }
  }

  // --- id ---
  if (!record.id) {
    addError('MISSING_ID', 'id');
  } else if (record.id.length > LIMITS.ID_MAX || !ID_PATTERN.test(record.id)) {
    addError('INVALID_ID', 'id');
  }

  // --- title ---
  if (!record.title) {
    addError('MISSING_TITLE', 'title');
  } else if (record.title.length > LIMITS.TITLE_MAX) {
    addError('TITLE_TOO_LONG', 'title');
  } else if (/книга\s*\d+|том\s*\d+/i.test(record.title)) {
    addWarning('POTENTIAL_SERIES_METADATA', 'title');
  }

  // --- isbn13 / isbn10 (ТЗ §7: прибрати пробіли/дефіси, перевірити контрольну цифру) ---
  if (record.isbn13) {
    const normalized = normalizeIsbn(record.isbn13);
    if (normalized.length !== 13 || !isValidIsbn(normalized)) addError('INVALID_ISBN', 'isbn13');
  }
  if (record.isbn10) {
    const normalized = normalizeIsbn(record.isbn10);
    if (normalized.length !== 10 || !isValidIsbn(normalized)) addError('INVALID_ISBN', 'isbn10');
  }

  // --- page_count ---
  if (record.page_count) {
    if (!/^\d+$/.test(record.page_count) || Number(record.page_count) <= 0) {
      addError('INVALID_PAGE_COUNT', 'page_count');
    }
  }

  // --- cover_url ---
  if (record.cover_url) {
    const looksLikeUrl = /^https?:\/\/\S+$/i.test(record.cover_url);
    if (!looksLikeUrl || record.cover_url.length > LIMITS.COVER_URL_MAX) {
      addError('INVALID_COVER_URL', 'cover_url');
    }
  }

  // --- description ---
  if (record.description) {
    if (record.description.length > LIMITS.DESCRIPTION_MAX) {
      addError('DESCRIPTION_TOO_LONG', 'description');
    } else if (record.description.trim().length < 20) {
      addWarning('SUSPICIOUS_SHORT_DESCRIPTION', 'description');
    }
  }

  // --- genres ---
  const genreList = splitList(record.genres);
  if (genreList.length === 0) {
    addWarning('NO_GENRES', 'genres');
  }
  for (const genre of genreList) {
    if (!SEED_GENRES.includes(genre)) addWarning('UNKNOWN_GENRE', 'genres');
  }

  // --- purposes ---
  const purposeList = splitList(record.purposes);
  for (const purpose of purposeList) {
    if (!RECOMMENDATION_PURPOSES.includes(purpose)) addWarning('UNKNOWN_PURPOSE', 'purposes');
  }

  // --- language ---
  if (record.language && record.language.length > LIMITS.LANGUAGE_MAX) {
    addError('INVALID_LANGUAGE', 'language');
  }

  // --- is_active ---
  if (record.is_active && record.is_active !== 'true' && record.is_active !== 'false') {
    addError('INVALID_BOOLEAN', 'is_active');
  }

  return { errors, warnings };
}

/** `"Фентезі;Романтика"` → `['Фентезі', 'Романтика']` — trim/dedupe/drop-empty, той самий
 * розбір, що `normalize.js` теж використовує (винесено сюди як єдина мала утиліта, щоб
 * валідація й нормалізація парсили semicolon-список ІДЕНТИЧНО). */
function splitList(raw) {
  if (!raw) return [];
  const seen = new Set();
  const result = [];
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

module.exports = { validateRecord, splitList };
