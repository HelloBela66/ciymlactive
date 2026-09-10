import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 008 — власні категорії нотаток (Milestone 11, доповнення — панель читання).
 *
 * Пряме прохання власника продукту: окрім чотирьох вбудованих категорій нотатки (думка/
 * питання/теорія/момент, `note.type`, `001_base_schema.ts`) користувач хоче додавати СВОЇ,
 * довільні, під конкретну книгу ("сильна напруга", "страшний момент", "дуже мила дія"...).
 *
 * Нова таблиця `note_category`, а НЕ розширення CHECK-обмеження `note.type` — той самий
 * свідомий вибір, що вже обґрунтований для `note.reaction`/`book_memory.template_id`
 * (`003_journal_entry_extensions.ts`, `005_book_memory_template.ts`): список тут не просто
 * "ще не узгоджений", а принципово відкритий і персональний (кожен користувач додає свої,
 * під кожну книгу окремо) — CHECK на фіксований список значень тут взагалі неможливий за
 * визначенням задачі, лише окрема таблиця.
 *
 * `note.category_id` — нова nullable-колонка, просто `ALTER TABLE ADD COLUMN` (той самий
 * патерн, що й `005_book_memory_template.ts`): коли задана — нотатка належить до власної
 * категорії користувача (сама категорія несе назву), а `note.type` лишається як є
 * (`'general'` за замовчуванням) — не сентинел, який довелось би окремо відрізняти від
 * "користувач справді обрав 'Загальне'". Обидва поля можуть співіснувати без суперечності:
 * UI (`resolveEntryTypeLabel`, `src/lib/journalEntryLabel.ts`) показує назву категорії, коли
 * вона є, інакше — мітку вбудованого типу.
 *
 * Навмисно БЕЗ `REFERENCES`/`ON DELETE` на цій колонці (на відміну від `note_category`
 * вище) — `002_book_source_isbndb.ts` детально документує реальну знахідку: FK з `ON DELETE
 * SET NULL`, доданий через `ALTER TABLE`, може несподівано спрацювати при наступному
 * rebuild-міграції таблиці (`DROP TABLE`+`CREATE`+копіювання) під `PRAGMA foreign_keys = ON`
 * і мовчки обнулити значення в усіх рядках. Тут цей ризик не потрібен: зв'язок і так
 * підтримується на рівні застосунку (`NoteCategoryRepository`/`NoteRepository`), а м'яке
 * видалення категорії (не `DROP`) означає, що `category_id` в старих нотатках і так ніколи
 * не "звисає" в порожнечу — сам рядок `note_category` продовжує існувати.
 *
 * М'яке видалення категорії (`deleted_at`), той самий патерн, що й `note`/`quote`/
 * `reading_session` (а не жорстке, як `shelf.remove`) — див. докладніше коментар у
 * `src/types/noteCategory.ts`: стара нотатка не повинна "осиротіти", коли користувач прибирає
 * категорію з активного списку.
 */
export const version = 8;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE note_category (
      id TEXT PRIMARY KEY,
      user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX idx_note_category_user_book ON note_category(user_book_id);

    ALTER TABLE note ADD COLUMN category_id TEXT;
  `);
}
