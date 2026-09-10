import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 005 — «Спогад про книгу»: шаблон картки (Milestone 11, Фаза 8).
 *
 * Додає до `book_memory` єдину нову колонку `template_id` — який із заготовлених шаблонів
 * (`src/design/i18n-labels.ts`, `memoryCardTemplateLabels`) обрав користувач для візуального
 * вигляду картки-спогаду (`src/components/memory/MemoryCardPreview.tsx`). Саме зображення
 * картки (Фаза 9 — захоплення в PNG для шерингу/збереження) тут ще НЕ з'являється: ця
 * міграція лише "яким шаблоном показати", попередні дані (`reflection`/`entry_refs`,
 * `004_book_memory.ts`) — "що показати".
 *
 * Простий `ALTER TABLE ADD COLUMN` з `DEFAULT 'classic'`, БЕЗ SQLite CHECK на список значень
 * — той самий свідомий вибір, що вже обґрунтований для `note.reaction`/`quote.reaction` у
 * `003_journal_entry_extensions.ts`: список шаблонів реалістично поповнюватиметься (Фаза 9+),
 * а зміна CHECK завжди вимагає нової rebuild-міграції; допоки набір значень фіксується лише
 * TypeScript-типом `MemoryCardTemplateId` (`src/types/bookMemory.ts`). Існуючі рядки
 * `book_memory` (Фаза 7, до цієї міграції) отримують `'classic'` заднім числом — розумний
 * дефолт, а не порожнє значення, яке довелось би окремо обробляти в UI.
 */
export const version = 5;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`ALTER TABLE book_memory ADD COLUMN template_id TEXT NOT NULL DEFAULT 'classic';`);
}
