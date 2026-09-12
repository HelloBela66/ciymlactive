import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 018 — DATABASE / MIGRATIONS (POLYTSIA V1.6, Фаза 20). Один рядок: індекс на
 * `shelf_book(user_book_id)`.
 *
 * Ця фаза ТЗ — аудит, не нова функціональність: "Перевір indexes для: workId; userBookId;
 * createdAt; progress; lore work; capsule work; journal links. Не додавай index без query use
 * case." Повний аудит усіх 17 попередніх міграцій показав, що майже всі кандидати з цього
 * списку вже покриті існуючими індексами (`idx_progress_user_book`, `idx_note_user_book`,
 * `idx_lore_entity_work`, `idx_journal_lore_link_entity` тощо) або взагалі не мають реального
 * запиту, що потребував би індексу (наприклад, `book_capsule` ніколи не фільтрується за
 * `work`/`edition` — індекс без query use case).
 *
 * Єдиний реальний пропуск: `shelf_book` має композитний `PRIMARY KEY (shelf_id, user_book_id)`
 * (`001_base_schema.ts`), а `ShelfRepository.listShelfIdsForUserBook`
 * (`WHERE user_book_id = ?`) і `ShelfRepository.listNamesByUserBookIds`
 * (`WHERE user_book_id IN (...)`) фільтрують саме за ДРУГИМ стовпцем цього PK — SQLite не може
 * використати композитний індекс для предиката, що не починається з його першого стовпця
 * (leftmost-prefix rule), тож обидва запити фактично сканують усю таблицю. Обидва виклики — не
 * гіпотетичні: перший викликається з Book Details (позначки полиць на конкретній книзі), другий
 * — з CSV-експорту бібліотеки (Milestone 9).
 */
export const version = 18;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE INDEX idx_shelf_book_user_book ON shelf_book(user_book_id);
  `);
}
