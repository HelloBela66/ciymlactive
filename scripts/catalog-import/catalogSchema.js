'use strict';

/**
 * КАТАЛОГ-ІМПОРТ — формат CSV і контрольовані словники.
 *
 * `CSV_COLUMNS` — той самий header, що вже реально використовує `data/curated-books.csv` і
 * документує `data/README.md` (2094 рядки живих даних на момент написання) — ТЗ §4 явно велить
 * "Adapt exact names if existing import format already exists", тож жодних нових назв колонок
 * (`slug`/`contributors`/`moods`/`cover_source_url`/`source_name`/`source_url` з ілюстрації в
 * ТЗ) тут немає: `id` — уже слаг, `authors` — уже єдине структуроване поле (ТЗ §11 явно
 * забороняє вигадувати ролі contributor, коли формат їх не подає), `purposes` — уже саме те,
 * що ТЗ §13 називає "moods" (той самий концепт, що вже є в застосунку як
 * `RecommendationPurpose`, `src/lib/tomorrowRecommendation.ts` — не новий, не вигаданий).
 *
 * `SEED_GENRES`/`RECOMMENDATION_PURPOSES` — НАВМИСНА ДУБЛІКАЦІЯ `GenreRepository.SEED_GENRES`/
 * `RecommendationPurpose` (той самий cross-runtime принцип, що й `csv.js`/`isbn.js` у цій
 * теці) — використовуються лише для М'ЯКОЇ валідації (попередження `UNKNOWN_GENRE`/
 * `UNKNOWN_PURPOSE`, НЕ блокування рядка: `curated_book.genres`/`purposes` — прості `text[]`
 * без FK/CHECK на вміст масиву, тож технічно будь-яке значення пройде запис, лише не потрапить
 * під фільтр застосунку). Якщо колись розійдеться з оригіналом — синхронізувати вручну
 * (обидва списки змінюються вкрай рідко, окремого механізму синхронізації не варте).
 */
const CSV_COLUMNS = Object.freeze([
  'id',
  'title',
  'authors',
  'isbn13',
  'isbn10',
  'page_count',
  'cover_url',
  'description',
  'genres',
  'purposes',
  'language',
  'is_active',
]);

const SEED_GENRES = Object.freeze([
  'Фентезі',
  'Наукова фантастика',
  'Детектив',
  'Трилер',
  'Романтика',
  // Додано разом із каталогом на 29 986 книг. Зіставлення жанру ТОЧНЕ
  // (`curated_book_recommend`: `genres @> array[p_genre]`), ієрархії немає: книга,
  // позначена лише «Темна романтика», НЕ потрапить у видачу за «Романтика». Потрібні
  // обидві — пишемо в CSV обидві: «Романтика;Темна романтика».
  'Темна романтика',
  'Історичний роман',
  'Пригоди',
  'Жахи',
  'Драма',
  'Класична література',
  'Сучасна проза',
  'Поезія',
  'Нон-фікшн',
  'Біографія та мемуари',
  'Історія',
  'Психологія',
  'Саморозвиток',
  'Бізнес',
  'Наука',
  'Філософія',
  'Публіцистика',
  'Дитяча література',
  'Підліткова література',
  'Комікси та графічні романи',
  'Гумор',
]);

const RECOMMENDATION_PURPOSES = Object.freeze(['light', 'cry', 'laugh', 'absorbed']);

/** curated_book CHECK-обмеження (`supabase/schema.sql`) — дзеркалимо тут, щоб валідація ловила
 * порушення ДО мережевого upsert, а не отримувала незрозумілий `23514 check_violation` від
 * PostgREST. */
const LIMITS = Object.freeze({
  ID_MIN: 1,
  ID_MAX: 100,
  TITLE_MIN: 1,
  TITLE_MAX: 500,
  DESCRIPTION_MAX: 5000,
  COVER_URL_MAX: 2000,
  LANGUAGE_MAX: 30,
});

/** `id` — "малі літери, цифри, дефіс" (`data/README.md`, той самий формат, що вже фактично
 * використовує весь наявний `curated-books.csv`, підтверджено дослідженням). */
const ID_PATTERN = /^[a-z0-9-]+$/;

/**
 * Мапить один розпарсений CSV-рядок у сирий (ще НЕ нормалізований, самі рядки як є) запис за
 * `CSV_COLUMNS` — єдине місце, що знає порядок/назви колонок нашого формату; решта пайплайну
 * (`validate.js`/`normalize.js`) працює з іменованими полями, не з позиційним масивом.
 *
 * @param {(row: string[], columnName: string) => string} get
 * @param {string[]} row
 */
function rawRecordFromRow(get, row) {
  return {
    id: get(row, 'id'),
    title: get(row, 'title'),
    authors: get(row, 'authors'),
    isbn13: get(row, 'isbn13'),
    isbn10: get(row, 'isbn10'),
    page_count: get(row, 'page_count'),
    cover_url: get(row, 'cover_url'),
    description: get(row, 'description'),
    genres: get(row, 'genres'),
    purposes: get(row, 'purposes'),
    language: get(row, 'language'),
    is_active: get(row, 'is_active'),
  };
}

module.exports = { CSV_COLUMNS, SEED_GENRES, RECOMMENDATION_PURPOSES, LIMITS, ID_PATTERN, rawRecordFromRow };
