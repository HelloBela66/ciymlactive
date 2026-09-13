import type { SQLiteDatabase } from 'expo-sqlite';
import { backfillNewestFinishedRunLink } from '@/data/db/legacyRunBackfill';

/**
 * Migration 021 — REREADING MODEL, Фаза 8 (POLYTSIA V1.6.1). `docs/READING_RUN.md` — повне
 * обґрунтування; тут стисло, що саме робить ця міграція і чому.
 *
 * ПРОБЛЕМА (`docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 23, п.5, CODE VERIFIED): `book_memory` має
 * `UNIQUE(user_book_id)` (`004_book_memory.ts`) — щонайбільше ОДИН спогад на книгу. Другий
 * `upsert` (наприклад, після перечитування) БЕЗПОВОРОТНО перезаписує перший — спогад про перше
 * прочитання втрачається без сліду.
 *
 * РІШЕННЯ — ЧАСТИНА 1 (schema, rebuild): `book_memory_id` лишається `UNIQUE`, а от
 * `user_book_id` перестає бути унікальним (кожен run книги може мати власний спогад), і
 * з'являється нова колонка `reading_run_id TEXT UNIQUE` — нове обмеження "щонайбільше один
 * спогад НА RUN" замість старого "щонайбільше один на книгу". SQLite не підтримує ALTER TABLE
 * для зміни/видалення UNIQUE-обмеження — потрібен rebuild (`_new` + `INSERT ... SELECT` +
 * `DROP` + `RENAME`), той самий ідіом, що й `002_book_source_isbndb.ts`/`003`/`007`:
 * `PRAGMA foreign_keys` вимикається ПЕРЕД транзакцією (SQLite ігнорує зміну pragma всередині
 * транзакції), rebuild — в одній ручній транзакції, `PRAGMA foreign_key_check` одразу після,
 * `foreign_keys` вмикається назад у `finally`. `reading_run_id` — СВІДОМО БЕЗ
 * `REFERENCES reading_run(id)` — той самий, уже задокументований у цьому проєкті урок
 * (`008_note_category.ts`, `020_reading_run_backfill.ts`): FK з rebuild-таблиці, на яку в
 * майбутньому теж могли б націлитись, ризикує мовчки обнулитись. `reading_run` ніколи не
 * видаляється жорстко (лише `discard()` — м'яко), тож посилання ніколи фізично не "звисає" в
 * порожнечу навіть без SQL FK. `user_book_id REFERENCES user_book(id) ON DELETE CASCADE`
 * лишається — той самий сенс, що й раніше.
 *
 * `reading_run_id` — NULLABLE: книга без жодного `reading_run` (Фаза 7 `addToLibrary`, свідомо
 * не підключена — `docs/READING_RUN.md`) і далі може мати "книжковий", а не "прив'язаний до
 * run" спогад, той самий фолбек, що `BookMemoryRepository.getCurrent`/`upsertCurrent`
 * використовують і для нових спогадів. `UNIQUE` на nullable-колонці в SQLite НЕ забороняє
 * кілька `NULL` (кожен `NULL` вважається відмінним від будь-якого іншого) — саме тому такий
 * фолбек безпечний навіть за наявності самого обмеження.
 *
 * РІШЕННЯ — ЧАСТИНА 2 (backfill наявних рядків, JS-цикл — той самий виняток із декларативного
 * SQL, що й `020_reading_run_backfill.ts`, з тієї самої причини: багаторівнева
 * пріоритетна логіка вибору "якого run" читалась би в чистому SQL CASE значно гірше): для
 * кожного наявного `book_memory` (до rebuild — щонайбільше ОДИН на `user_book_id`, завдяки
 * старому `UNIQUE(user_book_id)`, тож жодного ризику конфлікту з новим `UNIQUE(reading_run_id)`
 * при backfill) — найновіший `finished`/`did_not_finish` run цієї книги; якщо такого немає —
 * найновіший run узагалі (навіть `in_progress`); якщо книга взагалі не має жодного run —
 * `reading_run_id` лишається `NULL` (той самий принцип "не вигадувати історію", що й у Фазі 6b).
 */
export const version = 21;
export const manualTransaction = true;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE book_memory_new (
          id TEXT PRIMARY KEY,
          user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
          reading_run_id TEXT UNIQUE,
          reflection TEXT,
          entry_refs TEXT NOT NULL DEFAULT '[]',
          template_id TEXT NOT NULL DEFAULT 'classic',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO book_memory_new (
          id, user_book_id, reading_run_id, reflection, entry_refs, template_id, created_at, updated_at
        )
        SELECT id, user_book_id, NULL, reflection, entry_refs, template_id, created_at, updated_at
        FROM book_memory;

        DROP TABLE book_memory;

        ALTER TABLE book_memory_new RENAME TO book_memory;

        CREATE INDEX idx_book_memory_user_book ON book_memory(user_book_id);
      `);
    });

    const violations = await db.getAllAsync<Record<string, unknown>>('PRAGMA foreign_key_check');
    if (violations.length > 0) {
      throw new Error(`Migration 021: foreign_key_check знайшов порушення: ${JSON.stringify(violations)}`);
    }
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }

  // ЧАСТИНА 2 (backfill) винесена в `src/data/db/legacyRunBackfill.ts`
  // (`backfillNewestFinishedRunLink`, POLYTSIA V1.6.1, Фаза 27) — дослівно той самий алгоритм,
  // що й тут був раніше, лише перевикористовується ще й `BackupRepository`-відновленням старих
  // бекапів.
  await db.withTransactionAsync(async () => {
    await backfillNewestFinishedRunLink(db, 'book_memory');
  });
}
