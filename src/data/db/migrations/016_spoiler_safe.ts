import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 016 — SPOILER-SAFE MODE (POLYTSIA V1.6, Фаза 11). Одна нова колонка
 * `user_book.spoiler_safe_enabled` — детально описано в `docs/SPOILER_SAFE.md`.
 *
 * `INTEGER NOT NULL DEFAULT 1` — той самий "прапорцевий" патерн, що й `revisit_later`
 * (`011_revisit_later.ts`): `DEFAULT 1`, а не nullable, бо ТЗ прямо каже "Default: ON для
 * active books" — це "так/ні"-налаштування з визначеним типовим станом, а не справді
 * необов'язкове поле на кшталт `reading_experience`. Існуючі книги (уже в бібліотеці до цієї
 * міграції) отримують `1` заднім числом — це не проблема: прапорець сам по собі нічого не
 * приховує без активного читання (`isSpoilerSafeActive`, `src/lib/spoilerSafe.ts`, вимагає
 * status `reading`/`rereading`), тож заднім числом увімкнене налаштування не змінює поведінку
 * жодної вже прочитаної чи не розпочатої книги.
 *
 * Рівень — `user_book` (не `work`, не окрема таблиця): ТЗ прямо каже "Book-level setting", а
 * саме поняття "поточний прогрес" (`current_page`), з яким порівнюється позиція запису, і так
 * уже живе в `user_book` — той самий рівень, що й сам прогрес.
 */
export const version = 16;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE user_book ADD COLUMN spoiler_safe_enabled INTEGER NOT NULL DEFAULT 1;
  `);
}
