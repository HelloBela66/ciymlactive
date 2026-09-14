'use strict';

const { normalizeIsbn, isbnEquivalents } = require('./isbn');
const { splitList } = require('./validate');

/**
 * КАТАЛОГ-ІМПОРТ — нормалізація ОДНОГО рядка, що вже пройшов `validateRecord` без ERROR-рівня
 * проблем (виклик відповідає за це — `normalizeRecord` довіряє формату, лише чистить/приводить
 * типи, не перевіряє заново). Результат — форма, готова напряму стати аргументами
 * `curated_book` upsert (`supabaseAdmin.js`).
 *
 * @param {ReturnType<typeof import('./catalogSchema').rawRecordFromRow>} record
 */
function normalizeRecord(record) {
  const authors = splitList(record.authors);

  // ТЗ §7: "ISBN-13 primary edition deduplication key where available" — заповнюємо ОБИДВА
  // поля еквівалентом, коли CSV дав лише одне (той самий підхід, що вже застосований для
  // спільного каталогу, `src/data/remote/catalogSync.ts`'s `resolveIsbnPair`) — без цього два
  // рядки CSV, що описують ту саму книгу одним ISBN13, іншим — еквівалентним ISBN10, не
  // впіймались би дедублікацією (`dedupe.js`) як конфлікт.
  const isbn13Raw = record.isbn13 ? normalizeIsbn(record.isbn13) : '';
  const isbn10Raw = record.isbn10 ? normalizeIsbn(record.isbn10) : '';
  const equivalents = isbnEquivalents(isbn13Raw || isbn10Raw || '');
  const isbn13 = isbn13Raw || equivalents.isbn13 || null;
  const isbn10 = isbn10Raw || equivalents.isbn10 || null;

  const pageCount = record.page_count ? Number(record.page_count) : null;
  const coverSourceUrl = record.cover_url ? record.cover_url.trim() : null;
  const description = record.description ? record.description.trim() : null;
  const genres = splitList(record.genres);
  const purposes = splitList(record.purposes);
  const language = record.language ? record.language.trim() : 'uk';
  const isActive = record.is_active !== 'false';

  return {
    id: record.id,
    title: record.title.trim(),
    authors,
    isbn13,
    isbn10,
    pageCount,
    // Джерело обкладинки з CSV — ЛИШЕ провенанс (ТЗ §16-17, §23): ніколи не пишеться напряму
    // в `curated_book.cover_url` (та колонка — власна, Polytsia-контрольована URL, заповнюється
    // пізніше `coverPipeline.js` після успішного завантаження+валідації+аплоаду). Провенанс іде
    // лише в import-звіт (ТЗ §36), не в жодну колонку Supabase — `curated_book` навмисно не має
    // `cover_source_url`/`book_source`/`field_provenance` (докладніше —
    // `docs/OWN_CATALOG_IMPORT.md` §"Provenance").
    coverSourceUrl,
    description,
    genres,
    purposes,
    language,
    isActive,
  };
}

module.exports = { normalizeRecord };
