'use strict';

/**
 * КАТАЛОГ-ІМПОРТ — коди помилок/попереджень (ТЗ §39, доповнено кодами, потрібними для
 * реальних крайових випадків, знайдених дослідженням `data/curated-books.csv`: наприклад,
 * 30 із 2094 реальних рядків мають `id` довший за 100 символів — CHECK-обмеження
 * `curated_book.id`, `supabase/schema.sql`, — і мовчки впало б при апсерті без цієї перевірки
 * заздалегідь).
 *
 * `severity: 'error'` — рядок НЕ йде в апсерт (`ROW_LEVEL_REPORT`, ТЗ §38), решта валідних
 * рядків імпортуються далі. `severity: 'warning'` — рядок усе одно імпортується, попередження
 * лише в звіті для огляду власником (ТЗ §48 "Data cleanup report", "Do not auto-correct
 * uncertain facts. Report for review").
 */
const ERROR_CODES = Object.freeze({
  INVALID_CSV: { severity: 'error', message: 'Файл не вдалося розпарсити як CSV (порожній файл або відсутній header).' },
  MISSING_HEADER_COLUMN: { severity: 'error', message: 'У header відсутня обов’язкова колонка.' },

  MISSING_ID: { severity: 'error', message: 'Порожній id (слаг) — обов’язковий первинний ключ upsert.' },
  INVALID_ID: {
    severity: 'error',
    message: 'id не відповідає формату: малі латинські літери, цифри, дефіс, довжина 1-100 символів (curated_book.id CHECK).',
  },
  MISSING_TITLE: { severity: 'error', message: 'Порожня назва книги.' },
  TITLE_TOO_LONG: { severity: 'error', message: 'Назва довша за 500 символів (curated_book.title CHECK).' },
  INVALID_ISBN: { severity: 'error', message: 'ISBN не проходить перевірку контрольної цифри.' },
  INVALID_PAGE_COUNT: { severity: 'error', message: 'Кількість сторінок — не додатне ціле число.' },
  INVALID_COVER_URL: { severity: 'error', message: 'cover_url не є коректним http(s) посиланням або довший за 2000 символів.' },
  DESCRIPTION_TOO_LONG: { severity: 'error', message: 'Опис довший за 5000 символів (curated_book.description CHECK).' },
  INVALID_LANGUAGE: { severity: 'error', message: 'Код мови порожній або довший за 30 символів.' },
  INVALID_BOOLEAN: { severity: 'error', message: 'is_active має бути "true" або "false" (чи порожнє — типово true).' },
  INVALID_UTF8: { severity: 'error', message: 'Рядок містить некоректні UTF-8 байти/replacement-символи.' },

  DUPLICATE_ISBN: {
    severity: 'error',
    message:
      'Цей ISBN уже належить іншому id в цьому ж файлі — apply впав би на unique-обмеженні curated_book (isbn13/isbn10). Рядок пропущено, виправ CSV вручну.',
  },
  AMBIGUOUS_WORK_MATCH: {
    severity: 'error',
    message:
      'Немає надійного ключа дедублікації (ні ISBN, ні існуючого id) — title+contributor fallback навмисно НЕ застосовується автоматично (ТЗ §8), рядок пропущено.',
  },

  /** Конфлікт ISBN не всередині файлу (це `DUPLICATE_ISBN`), а з тим, що ВЖЕ Є В КАТАЛОЗІ під
   * іншим слагом. Виявляється до мережі — саме тому error, а не наслідок невдалого апсерту:
   * рядок не має шансу пройти, тож качати для нього обкладинку немає сенсу. */
  ISBN_TAKEN_IN_CATALOG: {
    severity: 'error',
    message:
      'Цей ISBN уже належить іншій книзі каталогу (інший id) — apply впав би на unique-обмеженні. ' +
      'Рядок пропущено ДО завантаження обкладинки. Найчастіша причина — та сама книга під двома різними слагами.',
  },
  /** `--only-new`: книга з таким id уже є, і власник просив нічого не оновлювати. Не помилка:
   * рядок свідомо пропущено, дані в каталозі лишились недоторканими. */
  SKIPPED_EXISTING_ID: {
    severity: 'warning',
    message: '--only-new: книга з таким id уже є в каталозі, рядок пропущено без змін.',
  },

  COVER_DOWNLOAD_FAILED: { severity: 'warning', message: 'Не вдалося завантажити обкладинку з cover_url (мережа/timeout).' },
  COVER_HTTP_ERROR: { severity: 'warning', message: 'cover_url повернув не-OK HTTP статус.' },
  COVER_INVALID_IMAGE: {
    severity: 'warning',
    message: 'Вміст за cover_url — не JPEG/PNG за реальною сигнатурою байтів (можливо, HTML-сторінка помилки під виглядом картинки).',
  },
  COVER_TOO_LARGE: { severity: 'warning', message: 'Файл обкладинки перевищує ліміт розміру (5 МБ, той самий, що й bucket book-covers).' },
  COVER_UPLOAD_FAILED: { severity: 'warning', message: 'Не вдалося завантажити обкладинку у власне сховище (Supabase Storage).' },
  DB_UPSERT_FAILED: { severity: 'error', message: 'Supabase відхилив upsert цього рядка (деталі — у повідомленні).' },

  DUPLICATE_ID_IN_FILE: {
    severity: 'warning',
    message: 'Цей id зустрічається в файлі більше одного разу — переможе останній рядок файлу (звичайний upsert-порядок), почисти CSV.',
  },
  NO_GENRES: { severity: 'warning', message: 'Жодного жанру не вказано — книга не з’явиться в «Що почитати завтра?» (жанр обов’язковий там), але лишається пошуковною.' },
  UNKNOWN_GENRE: {
    severity: 'warning',
    message: 'Жанр не входить у GenreRepository.SEED_GENRES символ-у-символ — книга не підпаде під фільтр за цим жанром.',
  },
  UNKNOWN_PURPOSE: {
    severity: 'warning',
    message: 'Значення purposes поза множиною light/cry/laugh/absorbed (RecommendationPurpose) — ігнорується сортуванням «Що почитати завтра?».',
  },
  POTENTIAL_SERIES_METADATA: {
    severity: 'warning',
    message: 'Назва містить «Книга N»/подібне без явних series_name/series_position полів (яких формат ще не підтримує) — перевір вручну.',
  },
  SUSPICIOUS_SHORT_DESCRIPTION: { severity: 'warning', message: 'Опис підозріло короткий (< 20 символів).' },
});

/** @param {string} code @returns {'error' | 'warning'} */
function severityOf(code) {
  return ERROR_CODES[code] ? ERROR_CODES[code].severity : 'error';
}

/** @param {string} code @returns {string} */
function messageOf(code) {
  return ERROR_CODES[code] ? ERROR_CODES[code].message : code;
}

module.exports = { ERROR_CODES, severityOf, messageOf };
