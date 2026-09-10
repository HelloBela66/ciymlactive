import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 009 — тематичне оформлення полиці (Milestone 11, доповнення8).
 *
 * Пряме прохання власника продукту: полиці можна оформити під сезон/жанр (набір конкретних тем —
 * `ShelfThemeId`, `src/types/shelf.ts` — з часом змінювався, доповнення13 замінив його повністю
 * на 10 ілюстрованих зображень; сюди, у сам стовпець БД, це не впливає), а не лише в одному
 * нейтральному вигляді, як досі.
 *
 * Простий `ALTER TABLE ADD COLUMN` з `DEFAULT 'classic'`, БЕЗ SQLite CHECK на список значень —
 * той самий свідомий вибір, що вже обґрунтований для `book_memory.template_id`
 * (`005_book_memory_template.ts`) і `note.reaction`/`quote.reaction`
 * (`003_journal_entry_extensions.ts`): список тем реалістично поповнюватиметься, а зміна CHECK
 * завжди вимагає нової rebuild-міграції; набір значень фіксується лише TypeScript-типом
 * `ShelfThemeId`. Існуючі полиці (створені до цієї міграції) отримують `'classic'` заднім
 * числом — той самий нейтральний вигляд, який у них і так уже був, а не порожнє значення, яке
 * довелось би окремо обробляти в `ShelfCard`/пікері.
 */
export const version = 9;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`ALTER TABLE shelf ADD COLUMN theme TEXT NOT NULL DEFAULT 'classic';`);
}
