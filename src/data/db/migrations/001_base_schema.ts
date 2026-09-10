import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 001 — базова схема. Повний опис і обґрунтування рішень — docs/DATABASE.md.
 *
 * Порядок CREATE TABLE навмисно йде від таблиць без залежностей до таблиць, що на них
 * посилаються (author → work → edition → user_book → reading_session → ...), щоб схему
 * можна було застосувати з увімкненим PRAGMA foreign_keys одним проходом без forward refs.
 */
export const version = 1;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    -- ============ ДОВІДКОВІ / КАТАЛОГ ============

    CREATE TABLE author (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      original_name TEXT,
      bio TEXT,
      photo_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE publisher (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      country TEXT,
      website TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE translator (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE genre (
      id TEXT PRIMARY KEY,
      name_uk TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE
    );

    CREATE TABLE tag (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE book_source (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL CHECK (source_type IN ('manual','google_books','open_library','isbn_scan','future_ua_catalog')),
      source_name TEXT NOT NULL,
      source_url TEXT,
      external_id TEXT,
      retrieved_at TEXT NOT NULL
    );

    CREATE TABLE work (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      original_title TEXT,
      description TEXT,
      original_language TEXT,
      first_published_year INTEGER,
      cover_fallback_color TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE work_author (
      work_id TEXT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES author(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'author' CHECK (role IN ('author','co_author','illustrator','editor')),
      PRIMARY KEY (work_id, author_id, role)
    );

    CREATE TABLE work_genre (
      work_id TEXT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
      genre_id TEXT NOT NULL REFERENCES genre(id) ON DELETE CASCADE,
      PRIMARY KEY (work_id, genre_id)
    );

    CREATE TABLE edition (
      id TEXT PRIMARY KEY,
      work_id TEXT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      subtitle TEXT,
      isbn10 TEXT,
      isbn13 TEXT,
      language TEXT NOT NULL DEFAULT 'uk',
      publisher_id TEXT REFERENCES publisher(id) ON DELETE SET NULL,
      publication_date TEXT,
      publication_year INTEGER,
      page_count INTEGER,
      format TEXT NOT NULL DEFAULT 'paperback'
        CHECK (format IN ('hardcover','paperback','ebook','audiobook','other')),
      cover_url TEXT,
      description_override TEXT,
      source_id TEXT REFERENCES book_source(id) ON DELETE SET NULL,
      source_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX idx_edition_work ON edition(work_id);
    CREATE INDEX idx_edition_isbn13 ON edition(isbn13);

    CREATE TABLE edition_translator (
      edition_id TEXT NOT NULL REFERENCES edition(id) ON DELETE CASCADE,
      translator_id TEXT NOT NULL REFERENCES translator(id) ON DELETE CASCADE,
      PRIMARY KEY (edition_id, translator_id)
    );

    CREATE TABLE field_provenance (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('work','edition')),
      entity_id TEXT NOT NULL,
      field_name TEXT NOT NULL,
      source_id TEXT REFERENCES book_source(id) ON DELETE SET NULL,
      is_user_edited INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX idx_field_provenance_entity ON field_provenance(entity_type, entity_id);

    CREATE TABLE tagged_item (
      tag_id TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('work','edition','user_book')),
      entity_id TEXT NOT NULL,
      PRIMARY KEY (tag_id, entity_type, entity_id)
    );

    -- ============ СЕРІЇ ============

    CREATE TABLE series (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'ongoing' CHECK (status IN ('ongoing','completed','hiatus','unknown')),
      total_known_works INTEGER,
      cover_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE series_entry (
      id TEXT PRIMARY KEY,
      series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
      work_id TEXT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
      position REAL,
      publication_order INTEGER,
      chronological_order INTEGER,
      recommended_order INTEGER,
      entry_type TEXT NOT NULL DEFAULT 'main'
        CHECK (entry_type IN ('main','prequel','sequel','novella','spin_off','companion','anthology','other')),
      UNIQUE (series_id, work_id)
    );

    CREATE INDEX idx_series_entry_series ON series_entry(series_id);

    -- ============ БІБЛІОТЕКА КОРИСТУВАЧА ============

    CREATE TABLE user_book (
      id TEXT PRIMARY KEY,
      edition_id TEXT NOT NULL REFERENCES edition(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'want_to_read'
        CHECK (status IN ('want_to_read','reading','finished','paused','did_not_finish','rereading')),
      started_at TEXT,
      finished_at TEXT,
      current_page INTEGER NOT NULL DEFAULT 0,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      added_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX idx_user_book_status ON user_book(status);
    CREATE INDEX idx_user_book_edition ON user_book(edition_id);

    CREATE TABLE shelf (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE shelf_book (
      shelf_id TEXT NOT NULL REFERENCES shelf(id) ON DELETE CASCADE,
      user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
      added_at TEXT NOT NULL,
      PRIMARY KEY (shelf_id, user_book_id)
    );

    -- ============ ЧИТАННЯ ============

    CREATE TABLE reading_session (
      id TEXT PRIMARY KEY,
      user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      goal_minutes INTEGER,
      paused_intervals TEXT NOT NULL DEFAULT '[]',
      start_page INTEGER NOT NULL,
      end_page INTEGER,
      duration_seconds INTEGER,
      mood_note TEXT,
      is_edited INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX idx_session_user_book ON reading_session(user_book_id);
    CREATE INDEX idx_session_started_at ON reading_session(started_at);

    CREATE TABLE reading_progress (
      id TEXT PRIMARY KEY,
      user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES reading_session(id) ON DELETE SET NULL,
      page INTEGER NOT NULL,
      recorded_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'session' CHECK (source IN ('session','manual')),
      created_at TEXT NOT NULL
    );

    CREATE INDEX idx_progress_user_book ON reading_progress(user_book_id, recorded_at);

    CREATE TABLE note (
      id TEXT PRIMARY KEY,
      user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES reading_session(id) ON DELETE SET NULL,
      page INTEGER,
      progress_percent REAL,
      type TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('thought','question','theory','general')),
      text TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX idx_note_user_book ON note(user_book_id);

    CREATE TABLE quote (
      id TEXT PRIMARY KEY,
      user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
      edition_id TEXT NOT NULL REFERENCES edition(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES reading_session(id) ON DELETE SET NULL,
      page INTEGER,
      text TEXT NOT NULL,
      comment TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX idx_quote_user_book ON quote(user_book_id);

    CREATE TABLE rating (
      id TEXT PRIMARY KEY,
      user_book_id TEXT NOT NULL UNIQUE REFERENCES user_book(id) ON DELETE CASCADE,
      value REAL NOT NULL CHECK (value >= 0.5 AND value <= 5 AND (value * 2) = CAST(value * 2 AS INTEGER)),
      review TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- ============ ФІЗИЧНА БІБЛІОТЕКА ============

    CREATE TABLE owned_book (
      id TEXT PRIMARY KEY,
      edition_id TEXT NOT NULL REFERENCES edition(id) ON DELETE CASCADE,
      condition TEXT CHECK (condition IN ('new','good','worn','damaged') OR condition IS NULL),
      location TEXT,
      purchase_date TEXT,
      purchase_price INTEGER,
      purchase_currency TEXT DEFAULT 'UAH',
      purchase_place TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE loan (
      id TEXT PRIMARY KEY,
      owned_book_id TEXT NOT NULL REFERENCES owned_book(id) ON DELETE CASCADE,
      borrower_name TEXT NOT NULL,
      loan_date TEXT NOT NULL,
      expected_return_date TEXT,
      returned_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX idx_loan_active ON loan(returned_at);

    -- ============ ЦІЛІ / НАГАДУВАННЯ ============

    CREATE TABLE reading_goal (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('books_per_year','pages','minutes','reading_days','finish_book','finish_series')),
      target INTEGER NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      related_work_id TEXT REFERENCES work(id) ON DELETE CASCADE,
      related_series_id TEXT REFERENCES series(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE reminder (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('daily','weekday','loan_return','custom')),
      time_of_day TEXT,
      weekdays TEXT,
      message TEXT NOT NULL,
      related_loan_id TEXT REFERENCES loan(id) ON DELETE CASCADE,
      fire_at TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      notification_identifier TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- ============ НАЛАШТУВАННЯ (singleton) ============

    CREATE TABLE app_settings (
      id TEXT PRIMARY KEY DEFAULT 'local',
      theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system','light','dark')),
      week_start TEXT NOT NULL DEFAULT 'monday' CHECK (week_start IN ('monday','sunday')),
      reading_units TEXT NOT NULL DEFAULT 'pages' CHECK (reading_units IN ('pages','minutes')),
      default_goal_minutes INTEGER DEFAULT 30,
      notifications_enabled INTEGER NOT NULL DEFAULT 1,
      last_backup_at TEXT,
      schema_version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO app_settings (id, schema_version, updated_at) VALUES ('local', ?, ?)`,
    [version, now],
  );
}
