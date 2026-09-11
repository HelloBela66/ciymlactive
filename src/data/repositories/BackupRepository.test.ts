import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded, LATEST_SCHEMA_VERSION } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import {
  checkSchemaCompatibility,
  MIN_COMPATIBLE_BACKUP_SCHEMA_VERSION,
  type BackupData,
  type BackupTableRow,
} from '@/lib/backupSerializer';
import { BackupRepository } from './BackupRepository';

/**
 * Backup round-trip integration test (POLYTSIA V1.5, Фаза 4 — "Backup Reliability").
 * `docs/BACKUP_FORMAT.md`: `create representative DB → export → clean test DB → restore →
 * compare semantic data`.
 *
 * Дані користувача — незамінні (немає сервера, `docs/LOCAL_FIRST.md`), тож backup/restore —
 * найкритичніша функція застосунку: якщо вона тихо губить чи спотворює хоча б одну таблицю,
 * користувач дізнається про це лише в момент, коли вже пізно. `BackupRepository.exportAll`/
 * `restoreAll` навмисно "сирі" (SELECT-усе/INSERT з динамічним списком колонок, а не по
 * типізованому repository на таблицю — сам `BackupRepository.ts`), тож саме на цьому рівні
 * (не JS-об'єктів, а РЕАЛЬНИХ SQLite-рядків через `better-sqlite3`-тестову БД, Фаза 3) і треба
 * перевіряти round-trip.
 *
 * "Не порівнюй volatile technical fields" (ТЗ Фази 4) тут навмисно НЕ застосовується
 * винятками: `exportAll` — чистий `SELECT * FROM table`, `restoreAll` — чисте `INSERT` тих
 * самих значень назад (жодне поле не перегенеровується/не позначається часом виконання
 * restore) — тож увесь рядок цілком Є semantic state, порівнюється як є, без винятків.
 * (На відміну від `backupSerializer.test.ts`, який перевіряє лише JSON-конверт (серіалізація/
 * schemaVersion guard) без SQL — тут навпаки, без жодного мокування SQL.)
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

/**
 * Заповнює щойно-мігровану `:memory:` БД "репрезентативними" даними — по кілька рядків для
 * ключових сутностей (книги/видання/полиці/сесії/щоденник), по одному — для довідкових і
 * допоміжних таблиць, з навмисно різноманітними значеннями (NULL там, де поле nullable,
 * JSON-масиви в `tags`/`paused_intervals`/`entry_refs`, заповнені `reaction`/`is_favorite`,
 * половинний рейтинг) — не мінімальний smoke-набір з одного рядка на таблицю, а дані, які
 * справді вправляють семантику кожної групи з переліку Фази 4 (книги, видання, статуси
 * бібліотеки, полиці, серії, сесії, прогрес, щоденник, цитати, реакції, цілі, рейтинги,
 * позики, налаштування). Пряме SQL, а не доменні репозиторії — той самий рівень абстракції,
 * що й сам `BackupRepository` (рядки "як є в SQLite", не доменні типи).
 */
async function seedRepresentativeDatabase(db: SQLiteDatabase): Promise<void> {
  const t0 = '2026-08-01T09:00:00.000Z';
  const t1 = '2026-09-10T21:15:00.000Z';

  // ---- довідкові/каталог ----
  await db.runAsync(
    `INSERT INTO author (id, name, original_name, bio, photo_url, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    ['author-1', 'Ліна Костенко', null, null, null, t0, t0],
  );
  await db.runAsync(
    `INSERT INTO author (id, name, original_name, bio, photo_url, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    ['author-2', 'J. R. R. Tolkien', 'John Ronald Reuel Tolkien', 'Письменник і філолог.', 'https://example.com/a2.jpg', t0, t0],
  );

  await db.runAsync(
    `INSERT INTO publisher (id, name, country, website, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
    ['publisher-1', 'Видавництво Старого Лева', 'UA', 'https://vsl.com.ua', t0, t0],
  );

  await db.runAsync(`INSERT INTO translator (id, name, created_at, updated_at) VALUES (?,?,?,?)`, [
    'translator-1',
    'Олена Фешовець',
    t0,
    t0,
  ]);

  await db.runAsync(`INSERT INTO genre (id, name_uk, slug) VALUES (?,?,?)`, ['genre-1', 'Фентезі', 'fantasy']);
  await db.runAsync(`INSERT INTO genre (id, name_uk, slug) VALUES (?,?,?)`, ['genre-2', 'Поезія', 'poetry']);

  await db.runAsync(`INSERT INTO tag (id, name, color, created_at) VALUES (?,?,?,?)`, [
    'tag-1',
    'перечитати',
    '#7a5cff',
    t0,
  ]);

  await db.runAsync(
    `INSERT INTO book_source (id, source_type, source_name, source_url, external_id, retrieved_at) VALUES (?,?,?,?,?,?)`,
    ['source-1', 'manual', 'Введено вручну', null, null, t0],
  );
  await db.runAsync(
    `INSERT INTO book_source (id, source_type, source_name, source_url, external_id, retrieved_at) VALUES (?,?,?,?,?,?)`,
    ['source-2', 'google_books', 'Google Books', 'https://books.google.com/x', 'gb-123', t0],
  );

  // ---- твори/видання (2 книги: одна в процесі, одна прочитана+серія) ----
  await db.runAsync(
    `INSERT INTO work (id, title, original_title, description, original_language, first_published_year, cover_fallback_color, created_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ['work-1', 'Записки українського самашедшего', null, 'Роман.', 'uk', 2010, '#345678', t0, t0, null],
  );
  await db.runAsync(
    `INSERT INTO work (id, title, original_title, description, original_language, first_published_year, cover_fallback_color, created_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ['work-2', 'Володар перснів', 'The Lord of the Rings', null, 'en', 1954, null, t0, t0, null],
  );

  await db.runAsync(`INSERT INTO work_author (work_id, author_id, role) VALUES (?,?,?)`, [
    'work-1',
    'author-1',
    'author',
  ]);
  await db.runAsync(`INSERT INTO work_author (work_id, author_id, role) VALUES (?,?,?)`, [
    'work-2',
    'author-2',
    'author',
  ]);
  await db.runAsync(`INSERT INTO work_genre (work_id, genre_id) VALUES (?,?)`, ['work-1', 'genre-2']);
  await db.runAsync(`INSERT INTO work_genre (work_id, genre_id) VALUES (?,?)`, ['work-2', 'genre-1']);

  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, subtitle, isbn10, isbn13, language, publisher_id, publication_date,
       publication_year, page_count, format, cover_url, description_override, source_id, source_url, created_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      'edition-1', 'work-1', 'Записки українського самашедшего', null, null, '9789660395008', 'uk',
      'publisher-1', '2010-05-01', 2010, 340, 'paperback', 'https://example.com/e1.jpg', null,
      'source-1', null, t0, t0, null,
    ],
  );
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, subtitle, isbn10, isbn13, language, publisher_id, publication_date,
       publication_year, page_count, format, cover_url, description_override, source_id, source_url, created_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      'edition-2', 'work-2', 'The Lord of the Rings', 'Boxed set', null, '9780618640157', 'en',
      null, '2005-07-01', 2005, 1216, 'hardcover', null, null,
      'source-2', 'https://books.google.com/x', t0, t0, null,
    ],
  );

  await db.runAsync(`INSERT INTO edition_translator (edition_id, translator_id) VALUES (?,?)`, [
    'edition-2',
    'translator-1',
  ]);

  await db.runAsync(
    `INSERT INTO field_provenance (id, entity_type, entity_id, field_name, source_id, is_user_edited) VALUES (?,?,?,?,?,?)`,
    ['provenance-1', 'edition', 'edition-2', 'cover_url', 'source-2', 0],
  );

  await db.runAsync(`INSERT INTO tagged_item (tag_id, entity_type, entity_id) VALUES (?,?,?)`, [
    'tag-1',
    'work',
    'work-2',
  ]);

  // ---- серії ----
  await db.runAsync(
    `INSERT INTO series (id, name, description, status, total_known_works, cover_url, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    ['series-1', 'Володар перснів (трилогія)', null, 'completed', 3, null, t0, t0],
  );
  await db.runAsync(
    `INSERT INTO series_entry (id, series_id, work_id, position, publication_order, chronological_order, recommended_order, entry_type)
     VALUES (?,?,?,?,?,?,?,?)`,
    ['series-entry-1', 'series-1', 'work-2', 1, 1, 1, 1, 'main'],
  );

  // ---- бібліотека користувача: user_book-1 "reading", user_book-2 "finished" ----
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, started_at, finished_at, current_page, is_favorite, added_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ['user_book-1', 'edition-1', 'reading', '2026-08-10T08:00:00.000Z', null, 120, 0, t0, t1, null],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, started_at, finished_at, current_page, is_favorite, added_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ['user_book-2', 'edition-2', 'finished', '2026-06-01T08:00:00.000Z', '2026-07-15T20:00:00.000Z', 1216, 1, t0, t1, null],
  );

  await db.runAsync(
    `INSERT INTO shelf (id, name, description, is_system, sort_order, created_at, updated_at, theme) VALUES (?,?,?,?,?,?,?,?)`,
    ['shelf-1', 'Улюблене', 'Книги, які варто перечитати', 0, 0, t0, t0, 'autumn'],
  );
  await db.runAsync(`INSERT INTO shelf_book (shelf_id, user_book_id, added_at) VALUES (?,?,?)`, [
    'shelf-1',
    'user_book-2',
    t1,
  ]);

  // ---- сесії читання + прогрес (2 сесії на user_book-1: одна з паузою, одна без) ----
  await db.runAsync(
    `INSERT INTO reading_session (id, user_book_id, started_at, ended_at, goal_minutes, paused_intervals,
       start_page, end_page, duration_seconds, mood_note, is_edited, created_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      'session-1', 'user_book-1', '2026-08-15T19:00:00.000Z', '2026-08-15T19:42:00.000Z', 30,
      JSON.stringify([{ start: '2026-08-15T19:20:00.000Z', end: '2026-08-15T19:25:00.000Z' }]),
      60, 90, 2220, 'Тихий вечір', 0, t0, t0, null,
    ],
  );
  await db.runAsync(
    `INSERT INTO reading_session (id, user_book_id, started_at, ended_at, goal_minutes, paused_intervals,
       start_page, end_page, duration_seconds, mood_note, is_edited, created_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['session-2', 'user_book-1', '2026-09-09T21:00:00.000Z', '2026-09-09T21:30:00.000Z', null, '[]', 90, 120, 1800, null, 1, t1, t1, null],
  );

  await db.runAsync(
    `INSERT INTO reading_progress (id, user_book_id, session_id, page, recorded_at, source, created_at) VALUES (?,?,?,?,?,?,?)`,
    ['progress-1', 'user_book-1', 'session-1', 90, '2026-08-15T19:42:00.000Z', 'session', t0],
  );
  await db.runAsync(
    `INSERT INTO reading_progress (id, user_book_id, session_id, page, recorded_at, source, created_at) VALUES (?,?,?,?,?,?,?)`,
    ['progress-2', 'user_book-1', null, 100, '2026-09-01T12:00:00.000Z', 'manual', t1],
  );

  // ---- щоденник: власна категорія, note (з реакцією/улюблене/категорією), quote ----
  await db.runAsync(
    `INSERT INTO note_category (id, user_book_id, label, sort_order, created_at, deleted_at) VALUES (?,?,?,?,?,?)`,
    ['category-1', 'user_book-1', 'Сильна напруга', 0, t0, null],
  );

  await db.runAsync(
    `INSERT INTO note (id, user_book_id, session_id, page, progress_percent, type, text, tags, is_favorite,
       reaction, created_at, updated_at, deleted_at, category_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      'note-1', 'user_book-1', 'session-1', 88, 25.9, 'moment', 'Несподіваний поворот сюжету.',
      JSON.stringify(['напруга', 'улюблене']), 1, '😮', t0, t0, null, 'category-1',
    ],
  );
  await db.runAsync(
    `INSERT INTO note (id, user_book_id, session_id, page, progress_percent, type, text, tags, is_favorite,
       reaction, created_at, updated_at, deleted_at, category_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['note-2', 'user_book-2', null, null, null, 'general', 'Загальне враження після прочитання.', '[]', 0, null, t1, t1, null, null],
  );

  await db.runAsync(
    `INSERT INTO quote (id, user_book_id, edition_id, session_id, page, text, comment, created_at, updated_at,
       deleted_at, progress_percent, tags, is_favorite, reaction)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      'quote-1', 'user_book-2', 'edition-2', null, 512, 'Не всі, хто блукає, — заблукали.', 'Улюблена цитата.',
      t0, t0, null, 42.1, JSON.stringify(['мудрість']), 1, '❤️',
    ],
  );

  // ---- рейтинг (половинний бал — навмисно, перевіряє CHECK і round-trip REAL) ----
  await db.runAsync(
    `INSERT INTO rating (id, user_book_id, value, review, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
    ['rating-1', 'user_book-2', 4.5, 'Перечитував не раз.', t1, t1],
  );

  // ---- нотатка "До читання" (POLYTSIA V1.6, Фаза 6) ----
  await db.runAsync(
    `INSERT INTO pre_reading_reflection (id, user_book_id, reason_text, expectation_text, expected_rating, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?)`,
    ['pre-reading-1', 'user_book-2', 'Порадили друзі.', 'Чекаю щось атмосферне й неспішне.', 4, t0, t0],
  );

  // ---- знімок DNF (POLYTSIA V1.6, Фаза 12) — прив'язаний до user_book-2 лише для перевірки
  // round-trip самої таблиці; реальний статус user_book-2 тут значення не має. ----
  await db.runAsync(
    `INSERT INTO dnf_reflection (id, user_book_id, page, reason, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    ['dnf-1', 'user_book-2', 340, 'too_complex', 'Загубив нитку сюжету після третьої частини.', t0, t0],
  );

  // ---- спогад про книгу ----
  await db.runAsync(
    `INSERT INTO book_memory (id, user_book_id, reflection, entry_refs, created_at, updated_at, template_id) VALUES (?,?,?,?,?,?,?)`,
    [
      'memory-1', 'user_book-2', 'Книга, яку хочеться передати друзям.',
      JSON.stringify([{ id: 'note-2', kind: 'note' }, { id: 'quote-1', kind: 'quote' }]),
      t1, t1, 'classic',
    ],
  );

  // ---- капсула книги (POLYTSIA V1.6, Фаза 4) ----
  await db.runAsync(
    `INSERT INTO book_capsule (
       id, user_book_id, lasting_thought, one_sentence_memory, favorite_character_text,
       favorite_lore_entity_id, journal_entry_kind, journal_entry_id, reopen_option, reopen_at,
       opened_at, notification_identifier, completed_at, created_at, updated_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      'capsule-1', 'user_book-2', 'Ця книга навчила мене чекати.', 'Про дорослішання.', 'Пол Атрідес',
      null, 'quote', 'quote-1', '6_months', '2027-01-01T00:00:00.000Z',
      null, 'notif-capsule-1', t1, t1, t1,
    ],
  );

  // ---- спроба згадати книгу (POLYTSIA V1.6, Фаза 5) ----
  await db.runAsync(
    `INSERT INTO capsule_recall (id, book_capsule_id, current_memory_text, recalled_at, created_at)
     VALUES (?,?,?,?,?)`,
    ['recall-1', 'capsule-1', 'Пам\'ятаю дощ на початку.', t1, t1],
  );

  // ---- персонажі / PERSONAL LORE (POLYTSIA V1.6, Фаза 9-10) ----
  await db.runAsync(
    `INSERT INTO lore_entity (
       id, work_id, type, name, description, first_seen_page, first_seen_progress, reaction,
       is_favorite, created_at, updated_at, deleted_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['lore-1', 'work-2', 'character', 'Фродо Беггінс', 'Носій персня.', 12, 1, 'like', 1, t0, t0, null],
  );
  await db.runAsync(
    `INSERT INTO journal_lore_link (id, lore_entity_id, entry_kind, entry_id, created_at) VALUES (?,?,?,?,?)`,
    ['journal-lore-link-1', 'lore-1', 'quote', 'quote-1', t1],
  );

  // ---- фізична бібліотека (позики) ----
  await db.runAsync(
    `INSERT INTO owned_book (id, edition_id, condition, location, purchase_date, purchase_price, purchase_currency,
       purchase_place, notes, created_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['owned-1', 'edition-1', 'good', 'Полиця у вітальні', '2020-05-01', 25000, 'UAH', 'Книгарня "Є"', null, t0, t0, null],
  );
  await db.runAsync(
    `INSERT INTO loan (id, owned_book_id, borrower_name, loan_date, expected_return_date, returned_at, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    ['loan-1', 'owned-1', 'Оксана', '2026-08-01', '2026-09-01', null, 'Просила саме це видання.', t0, t0],
  );

  // ---- цілі / нагадування ----
  await db.runAsync(
    `INSERT INTO reading_goal (id, type, target, period_start, period_end, related_work_id, related_series_id, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ['goal-1', 'books_per_year', 24, '2026-01-01', '2026-12-31', null, null, 'active', t0, t0],
  );
  await db.runAsync(
    `INSERT INTO reminder (id, kind, time_of_day, weekdays, message, related_loan_id, fire_at, is_enabled, notification_identifier, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ['reminder-1', 'loan_return', null, null, 'Час повернути книгу Оксані', 'loan-1', '2026-09-01T09:00:00.000Z', 1, null, t0, t0],
  );

  // ---- рекомендації, вже показані (не бібліотека — окрема історія показів) ----
  await db.runAsync(
    `INSERT INTO book_recommendation_shown (id, genre_id, purpose, book_key, title, shown_at) VALUES (?,?,?,?,?,?)`,
    ['shown-1', 'genre-1', 'evening_30', '9780618640157', 'The Lord of the Rings', t1],
  );

  // ---- налаштування (singleton) ----
  await db.runAsync(
    `UPDATE app_settings SET theme = ?, week_start = ?, reading_units = ?, default_goal_minutes = ?,
       notifications_enabled = ?, last_backup_at = ?, updated_at = ? WHERE id = 'local'`,
    ['dark', 'monday', 'pages', 45, 1, t1, t1],
  );
}

/** Стабільне сортування рядків таблиці перед порівнянням — `exportAll` робить `SELECT *`
 * без `ORDER BY`, тож порядок рядків формально не гарантований. Таблиці з `id TEXT PRIMARY
 * KEY` сортуються за ним; junction-таблиці без власного `id` (`work_author`, `shelf_book`
 * тощо) — за канонічним JSON усього рядка (детерміновано, бо порядок ключів об'єкта той
 * самий для обох боків — обидва прийшли з того самого `SELECT *`). */
function sortRowsForComparison(rows: BackupTableRow[]): BackupTableRow[] {
  return [...rows].sort((a, b) => {
    const keyA = typeof a.id === 'string' ? a.id : JSON.stringify(a);
    const keyB = typeof b.id === 'string' ? b.id : JSON.stringify(b);
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });
}

/** Порівнює дві `BackupData` таблиця-за-таблицею (а не одним `toEqual` на весь об'єкт) — коли
 * щось розходиться, повідомлення jest одразу називає конкретну таблицю, а не дає загальний
 * diff на 31 таблицю одразу. */
function expectSameBackupData(actual: BackupData, expected: BackupData): void {
  const tables = Object.keys(expected);
  expect(Object.keys(actual).sort()).toEqual(tables.sort());
  for (const table of tables) {
    expect({ table, rows: sortRowsForComparison(actual[table] ?? []) }).toEqual({
      table,
      rows: sortRowsForComparison(expected[table] ?? []),
    });
  }
}

describe('BackupRepository — round-trip (Фаза 4, п.44/Backup Reliability)', () => {
  it('export → restore у чисту БД → повторний export дають семантично ідентичні дані по всіх таблицях', async () => {
    const sourceDb = await openMigratedTestDb();
    await seedRepresentativeDatabase(sourceDb);

    const exported = await BackupRepository.exportAll(sourceDb);

    // Побіжна перевірка, що seed справді вправив усі групи сутностей із переліку Фази 4,
    // а не лише "дещо" — якщо якась група порожня, це майже напевно забутий рядок у seed,
    // а не порожня БД (яку окремо перевіряє наступний it).
    expect(exported.work).toHaveLength(2); // книги
    expect(exported.edition).toHaveLength(2); // видання
    expect(new Set(exported.user_book?.map((r) => r.status))).toEqual(new Set(['reading', 'finished'])); // статуси бібліотеки
    expect(exported.shelf).toHaveLength(1); // полиці
    expect(exported.series_entry).toHaveLength(1); // серії
    expect(exported.reading_session).toHaveLength(2); // сесії
    expect(exported.reading_progress).toHaveLength(2); // прогрес
    expect(exported.note).toHaveLength(2); // щоденник (note)
    expect(exported.quote).toHaveLength(1); // щоденник (quote)
    expect(exported.note?.some((r) => r.reaction != null)).toBe(true); // реакції (note)
    expect(exported.quote?.some((r) => r.reaction != null)).toBe(true); // реакції (quote)
    expect(exported.reading_goal).toHaveLength(1); // цілі
    expect(exported.rating).toHaveLength(1); // рейтинги
    expect(exported.pre_reading_reflection).toHaveLength(1); // нотатка "До читання" (Фаза 6)
    expect(exported.dnf_reflection).toHaveLength(1); // знімок DNF (Фаза 12)
    expect(exported.book_capsule).toHaveLength(1); // капсула книги (Фаза 4)
    expect(exported.capsule_recall).toHaveLength(1); // спроба згадати книгу (Фаза 5)
    expect(exported.lore_entity).toHaveLength(1); // персонажі (Фаза 9-10)
    expect(exported.journal_lore_link).toHaveLength(1); // зв'язок персонажа із записом щоденника
    expect(exported.loan).toHaveLength(1); // позики
    expect(exported.app_settings).toHaveLength(1); // налаштування
    expect(exported.app_settings?.[0]?.theme).toBe('dark');

    const targetDb = await openMigratedTestDb();
    await BackupRepository.restoreAll(targetDb, exported);
    const reExported = await BackupRepository.exportAll(targetDb);

    expectSameBackupData(reExported, exported);
  });

  it('restore у БД, що вже мала власні дані ("replace all") — старі дані targetDb не проступають після відновлення', async () => {
    const sourceDb = await openMigratedTestDb();
    await seedRepresentativeDatabase(sourceDb);
    const exported = await BackupRepository.exportAll(sourceDb);

    const targetDb = await openMigratedTestDb();
    // targetDb має власний, ІНШИЙ рядок у тій самій таблиці до restore — "replace all"
    // (docs/BACKUP_FORMAT.md §Restore, крок 5) означає, що після restore його не повинно
    // лишитись, а не злитися з даними джерела.
    await targetDb.runAsync(`INSERT INTO author (id, name, created_at, updated_at) VALUES (?,?,?,?)`, [
      'author-stale',
      'Хтось інший',
      '2020-01-01T00:00:00.000Z',
      '2020-01-01T00:00:00.000Z',
    ]);

    await BackupRepository.restoreAll(targetDb, exported);
    const reExported = await BackupRepository.exportAll(targetDb);

    expect(reExported.author?.some((r) => r.id === 'author-stale')).toBe(false);
    expectSameBackupData(reExported, exported);
  });

  it('restore у транзакції: помилка посеред вставки не лишає БД у частково перезаписаному стані', async () => {
    const sourceDb = await openMigratedTestDb();
    await seedRepresentativeDatabase(sourceDb);
    const exported = await BackupRepository.exportAll(sourceDb);

    const targetDb = await openMigratedTestDb();
    const before = await BackupRepository.exportAll(targetDb); // порожня, щойно-мігрована БД + дефолтний app_settings

    // Навмисно ламаємо один рядок одної з таблиць (FK на неіснуючого автора) — `restoreAll`
    // видаляє старі дані ПЕРЕД вставкою нових (docs/BACKUP_FORMAT.md), тож без транзакційного
    // rollback ця перевірка впіймала б реальну втрату даних: чиста БД лишилась би без жодного
    // рядка, а не "як була до restore".
    const broken: BackupData = {
      ...exported,
      work_author: [{ work_id: 'work-1', author_id: 'does-not-exist', role: 'author' }],
    };

    await expect(BackupRepository.restoreAll(targetDb, broken)).rejects.toThrow();

    const after = await BackupRepository.exportAll(targetDb);
    expectSameBackupData(after, before);
  });
});

describe('backup schemaVersion відповідає реальній схемі БД (Фаза 4 — "Підтримуй schemaVersion")', () => {
  it('MIN_COMPATIBLE_BACKUP_SCHEMA_VERSION ніколи не перевищує LATEST_SCHEMA_VERSION', () => {
    // Захист від майбутньої помилки: якби хтось підняв MIN_COMPATIBLE вище за LATEST, це
    // мовчки зробило б НЕВІДНОВЛЮВАНИМИ навіть щойно створені бекапи поточної версії
    // застосунку — `checkSchemaCompatibility` нижче це підтверджує окремо.
    expect(MIN_COMPATIBLE_BACKUP_SCHEMA_VERSION).toBeLessThanOrEqual(LATEST_SCHEMA_VERSION);
  });

  it('щойно експортований бекап (schemaVersion = LATEST_SCHEMA_VERSION) визнається сумісним із поточним застосунком', () => {
    expect(checkSchemaCompatibility(LATEST_SCHEMA_VERSION, LATEST_SCHEMA_VERSION)).toBe('ok');
  });
});

describe('BackupRepository.approximateCounts (ТЗ Фази 13 — BACKUP HEALTH UX)', () => {
  it('на щойно-мігрованій порожній БД повертає всі нулі', async () => {
    const db = await openMigratedTestDb();
    const counts = await BackupRepository.approximateCounts(db);
    expect(counts).toEqual({ works: 0, userBooks: 0, sessions: 0, notes: 0 });
  });

  it('на заповненій БД збігається з summarize(exportAll(...)) — те саме число, два різні способи його дістати', async () => {
    const db = await openMigratedTestDb();
    await seedRepresentativeDatabase(db);

    const counts = await BackupRepository.approximateCounts(db);
    const viaExport = BackupRepository.summarize(await BackupRepository.exportAll(db));

    expect(counts).toEqual(viaExport);
    // Побіжна перевірка на конкретні числа з seedRepresentativeDatabase — щоб тест не
    // пройшов випадково, якщо обидва методи однаково (та неправильно) порахують нуль.
    expect(counts).toEqual({ works: 2, userBooks: 2, sessions: 2, notes: 2 });
  });

  it('рахує м\'яко видалені рядки так само, як summarize/exportAll (жоден фільтр по deleted_at)', async () => {
    const db = await openMigratedTestDb();
    await seedRepresentativeDatabase(db);
    await db.runAsync(`UPDATE work SET deleted_at = ? WHERE id = ?`, ['2026-09-10T21:15:00.000Z', 'work-1']);

    const counts = await BackupRepository.approximateCounts(db);
    const viaExport = BackupRepository.summarize(await BackupRepository.exportAll(db));

    // `work-1` лишається у лічильнику (той самий "рахує усе" підхід, що й summarize/exportAll) —
    // якби approximateCounts фільтрував по deleted_at, а summarize/exportAll — ні, ці два
    // числа розійшлись би, і саме це мала б впіймати ця перевірка.
    expect(counts.works).toBe(2);
    expect(counts).toEqual(viaExport);
  });
});
