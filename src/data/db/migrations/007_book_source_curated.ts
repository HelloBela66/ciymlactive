import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 007 — додає `'curated'` до CHECK-обмеження `book_source.source_type`.
 *
 * Той самий клас проблеми, що й `002_book_source_isbndb.ts`: `src/types/bookDraft.ts`
 * (`BookSourceTypeSchema`) отримав нове значення `'curated'` (Milestone 11, доповнення —
 * `CuratedCatalogProvider.ts`, власна кураторська добірка для «Що почитати завтра?»), а
 * `book_source` у 001/002 лишився зі старим списком — без цієї міграції збереження книги,
 * знайденої через кураторський каталог, падало б з `CHECK constraint failed` замість
 * успішного додавання в бібліотеку.
 *
 * Той самий rebuild-патерн (SQLite не підтримує зміну CHECK напряму,
 * sqlite.org/lang_altertable.html): нова таблиця з потрібним обмеженням → копія даних →
 * видалення старої → перейменування нової. `manualTransaction` — з тієї самої причини, що й
 * у 002: `edition.source_id`/`field_provenance.source_id` мають `ON DELETE SET NULL`, і
 * `PRAGMA foreign_keys` не можна перемикати всередині транзакції.
 */
export const version = 7;
export const manualTransaction = true;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE book_source_new (
          id TEXT PRIMARY KEY,
          source_type TEXT NOT NULL CHECK (source_type IN ('manual','google_books','open_library','isbndb','isbn_scan','future_ua_catalog','curated')),
          source_name TEXT NOT NULL,
          source_url TEXT,
          external_id TEXT,
          retrieved_at TEXT NOT NULL
        );

        INSERT INTO book_source_new (id, source_type, source_name, source_url, external_id, retrieved_at)
          SELECT id, source_type, source_name, source_url, external_id, retrieved_at FROM book_source;

        DROP TABLE book_source;

        ALTER TABLE book_source_new RENAME TO book_source;
      `);
    });

    const violations = await db.getAllAsync<Record<string, unknown>>('PRAGMA foreign_key_check');
    if (violations.length > 0) {
      throw new Error(`Migration 007: foreign_key_check знайшов порушення: ${JSON.stringify(violations)}`);
    }
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}
