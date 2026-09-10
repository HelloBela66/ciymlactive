import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 002 — додає `'isbndb'` до CHECK-обмеження `book_source.source_type`.
 *
 * Причина: `src/types/bookDraft.ts` (`BookSourceTypeSchema`) отримав значення `'isbndb'`
 * ще в Milestone 7 (коли з'явився ISBNdbProvider), але сама таблиця `book_source` у
 * `001_base_schema.ts` лишилась зі старим списком — Zod-валідація на екрані підтвердження
 * імпорту проходила, а сам INSERT у SQLite падав з `CHECK constraint failed` (реальний
 * краш користувача при спробі зберегти книгу, знайдену через ISBNdb). Ця міграція
 * виправляє розбіжність.
 *
 * SQLite не підтримує `ALTER TABLE ... ALTER COLUMN`/зміну CHECK-обмежень напряму — єдиний
 * спосіб (офіційно задокументований патерн, sqlite.org/lang_altertable.html, "Making Other
 * Kinds Of Table Schema Changes") — створити нову таблицю з потрібним обмеженням, скопіювати
 * дані, видалити стару, перейменувати нову.
 *
 * ВАЖЛИВО, чому ця міграція керує транзакцією сама (`manualTransaction`, див.
 * `migrationRunner.ts`), а не йде через автоматичну обгортку `withTransactionAsync`, як усі
 * інші: `edition.source_id` і `field_provenance.source_id` мають `REFERENCES book_source(id)
 * ON DELETE SET NULL`. Емпірично перевірено (перед тим, як писати цю міграцію): якщо
 * `DROP TABLE book_source` виконується при `PRAGMA foreign_keys = ON`, SQLite трактує це як
 * видалення всіх рядків book_source і СПРАЦЬОВУЄ `ON DELETE SET NULL` для кожного
 * посилання — тобто без вимкнення foreign_keys ця міграція тихо обнулила б
 * `source_id` у ВСІХ існуючих edition/field_provenance (втрата даних про походження книг,
 * без жодної помилки). А `PRAGMA foreign_keys` не можна перемикати всередині транзакції
 * (SQLite ігнорує зміну) — тому вимикаємо його ДО початку транзакції, а не всередині.
 */
export const version = 2;
export const manualTransaction = true;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE book_source_new (
          id TEXT PRIMARY KEY,
          source_type TEXT NOT NULL CHECK (source_type IN ('manual','google_books','open_library','isbndb','isbn_scan','future_ua_catalog')),
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

    // Явна перевірка цілісності зовнішніх ключів одразу після — якщо тут щось не так,
    // краще впасти з чіткою помилкою міграції зараз, ніж мовчки лишити биту БД.
    const violations = await db.getAllAsync<Record<string, unknown>>('PRAGMA foreign_key_check');
    if (violations.length > 0) {
      throw new Error(`Migration 002: foreign_key_check знайшов порушення: ${JSON.stringify(violations)}`);
    }
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}
