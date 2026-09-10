import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 003 — фундамент для «Мій щоденник» / «Спогад про книгу» (Milestone 11).
 *
 * Рішення Фази 1 (узгоджено з користувачем): `note` і `quote` лишаються фізично окремими
 * таблицями (варіант A — мінімальний ризик, без переносу даних, без зміни семантики
 * `quote.edition_id`). Концепція "JournalEntry" зі списку 40 пунктів ТЗ реалізується як
 * union НА РІВНІ ЧИТАННЯ (`JournalRepository`), а не як нова фізична таблиця — обидві
 * старі таблиці лишаються сумісними зі старими бекапами (Milestone 6, `docs/BACKUP_FORMAT.md`
 * — `BackupRepository` генеричний за колонками, тож нові поля не ламають export/import).
 *
 * Що робить ця міграція:
 *  1. `note` — розширює CHECK `type`, додаючи `'moment'` (шостий тип запису щоденника поряд
 *     з уже наявними `thought/question/theory/general`; `general` лишається як є й надалі
 *     відображається як загальна нотатка — перейменування ключа enum ламало б старі рядки
 *     без жодної практичної користі). SQLite не підтримує зміну CHECK напряму
 *     (sqlite.org/lang_altertable.html, "Making Other Kinds Of Table Schema Changes") —
 *     тому та сама техніка "rebuild table", що й у `002_book_source_isbndb.ts`.
 *  2. `note` — додає `is_favorite`/`reaction` (той самий патерн, що вже є в `user_book.is_favorite`
 *     — просто INTEGER-прапорець і нуловний TEXT). Значення `reaction` НАВМИСНО без CHECK —
 *     список реакцій ще узгоджується з користувачем на етапі UI (Фаза 3+), а зміна CHECK
 *     завжди вимагає нової rebuild-міграції; допоки список фіксується лише Zod-схемою в
 *     TypeScript (`src/types/note.ts`, `src/types/quote.ts`), яку можна поправити без міграції.
 *  3. `quote` — додає ті самі поля, що вже є в `note` й потрібні для симетричного
 *     JournalEntry-читання: `progress_percent`, `tags`, `is_favorite`, `reaction`. Тут CHECK
 *     не чіпається (у `quote` немає CHECK на "тип") — досить простих `ALTER TABLE ADD COLUMN`.
 *  4. Індекси під нові запити глобального щоденника (сортування/фільтр за датою, типом,
 *     обраним) — `docs/DATABASE.md` вимагає SQLite-side фільтрації вже для 10к+ записів,
 *     а не сканування в JS.
 *  5. `journal_draft` — нова таблиця для чернетки незбереженого запису (авто-збереження,
 *     переживає закриття застосунку/бекграунд). Один активний чернетковий слот на книгу
 *     (`user_book_id` — PRIMARY KEY, тобто природний upsert); навмисно НЕ входить у
 *     `BACKUP_TABLE_ORDER` (`BackupRepository.ts`) — чернетка є лише локальним незбереженим
 *     станом пристрою, а не даними, які користувач свідомо зберіг і очікує в бекапі.
 *
 * Rebuild `note` — той самий, вже перевірений патерн `manualTransaction` + `PRAGMA
 * foreign_keys = OFF` навколо транзакції, з `PRAGMA foreign_key_check` одразу після
 * (докладне обґрунтування — коментар у `002_book_source_isbndb.ts`). Жодна інша таблиця не
 * посилається на `note(id)` (перевірено по всій схемі `001_base_schema.ts`), тож ризик
 * "тихого" ON DELETE SET NULL, який був у міграції 002, тут не застосовний — але той самий
 * запобіжник лишається заради єдиного перевіреного способу рестрою таблиці в проєкті.
 */
export const version = 3;
export const manualTransaction = true;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        -- ============ note: rebuild під ширший CHECK type + нові поля ============

        CREATE TABLE note_new (
          id TEXT PRIMARY KEY,
          user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
          session_id TEXT REFERENCES reading_session(id) ON DELETE SET NULL,
          page INTEGER,
          progress_percent REAL,
          type TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('thought','question','theory','general','moment')),
          text TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          is_favorite INTEGER NOT NULL DEFAULT 0,
          reaction TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        );

        INSERT INTO note_new (
          id, user_book_id, session_id, page, progress_percent, type, text, tags,
          is_favorite, reaction, created_at, updated_at, deleted_at
        )
        SELECT
          id, user_book_id, session_id, page, progress_percent, type, text, tags,
          0, NULL, created_at, updated_at, deleted_at
        FROM note;

        DROP TABLE note;
        ALTER TABLE note_new RENAME TO note;

        CREATE INDEX idx_note_user_book ON note(user_book_id);
        CREATE INDEX idx_note_type ON note(type);
        CREATE INDEX idx_note_favorite ON note(is_favorite);
        CREATE INDEX idx_note_created_at ON note(created_at);

        -- ============ quote: адитивні колонки (без зміни CHECK — rebuild не потрібен) ============

        ALTER TABLE quote ADD COLUMN progress_percent REAL;
        ALTER TABLE quote ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
        ALTER TABLE quote ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE quote ADD COLUMN reaction TEXT;

        CREATE INDEX idx_quote_favorite ON quote(is_favorite);
        CREATE INDEX idx_quote_created_at ON quote(created_at);

        -- ============ journal_draft: чернетка незбереженого запису (survives backgrounding) ============

        CREATE TABLE journal_draft (
          user_book_id TEXT PRIMARY KEY REFERENCES user_book(id) ON DELETE CASCADE,
          session_id TEXT REFERENCES reading_session(id) ON DELETE SET NULL,
          kind TEXT NOT NULL CHECK (kind IN ('note','quote')),
          type TEXT,
          text TEXT NOT NULL DEFAULT '',
          comment TEXT,
          page INTEGER,
          updated_at TEXT NOT NULL
        );
      `);
    });

    const violations = await db.getAllAsync<Record<string, unknown>>('PRAGMA foreign_key_check');
    if (violations.length > 0) {
      throw new Error(`Migration 003: foreign_key_check знайшов порушення: ${JSON.stringify(violations)}`);
    }
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}
