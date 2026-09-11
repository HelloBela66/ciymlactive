import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 013 — «Книга через час» (POLYTSIA V1.6, Фаза 5: RECALL). Нова таблиця
 * `capsule_recall` — детально описано в `docs/RECALL.md`.
 *
 * Ключові архітектурні рішення (повне обґрунтування — `docs/RECALL.md` §Архітектура):
 *
 * 1. `book_capsule_id` — РЕАЛЬНИЙ SQL FK (на відміну від `book_capsule.journal_entry_id`,
 *    який м'який): `capsule_recall` — це не крос-таблична посилання на один із двох незалежних
 *    типів запису (note/quote), а звичайний "дочірній" рядок однієї конкретної капсули, той
 *    самий патерн, що й `reading_progress` → `reading_session` (`001_base_schema.ts`).
 *    `ON DELETE CASCADE` — видалення капсули (`BookCapsuleRepository.remove`, п.18 ТЗ Фази 4)
 *    видаляє й усю історію її recall-спроб, нічого "осиротілого" не лишається, тож окремої
 *    `dataIntegrityDoctor.ts`-перевірки на цю пару не потрібно (на відміну від `book_capsule`
 *    проти `user_book` — там CASCADE фактично не спрацьовує, бо `user_book` лише м'яко
 *    видаляється).
 * 2. Один запис = одна "спроба згадати" (п.5 ТЗ Фази 5: "Користувач може відкрити його
 *    вручну у будь-який момент") — капсулу можна проходити повторно, кожна спроба лишається
 *    окремим рядком (той самий вибір, що й `book_capsule.user_book_id` без `UNIQUE` для
 *    перечитування) — це навмисно ІСТОРІЯ, а не одне поле, що перезаписується.
 * 3. `current_memory_text` — те, що користувач написав у відповідь на «Що ти пам'ятаєш
 *    зараз?» (п.4 Фази 5 ТЗ, optional) — `NULL`, коли поле лишили порожнім; сам факт наявності
 *    рядка `capsule_recall` — це вже "спроба відбулась", незалежно від того, чи щось написано.
 */
export const version = 13;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE capsule_recall (
      id TEXT PRIMARY KEY,
      book_capsule_id TEXT NOT NULL REFERENCES book_capsule(id) ON DELETE CASCADE,
      current_memory_text TEXT,
      recalled_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX idx_capsule_recall_book_capsule ON capsule_recall(book_capsule_id);
  `);
}
