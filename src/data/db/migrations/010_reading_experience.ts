import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 010 — «Як читалося?» (POLYTSIA V1.5, Фаза 9: SESSION REFLECTION).
 *
 * Нова nullable-колонка `reading_session.reading_experience` — легке, необов'язкове враження
 * від сеансу читання, ОДНЕ з 5 фіксованих значень (`ReadingExperienceId`,
 * `src/design/readingExperience.ts`): легко/захопливо/спокійно/напружено/важко. Простий
 * `ALTER TABLE ADD COLUMN`, БЕЗ SQLite CHECK на список значень — той самий свідомий вибір, що
 * й для `note.reaction`/`quote.reaction` (`003_journal_entry_extensions.ts`) і `shelf.theme`
 * (`009_shelf_theme.ts`): набір значень фіксується лише TypeScript-типом, і зміна CHECK завжди
 * вимагала б нової rebuild-міграції.
 *
 * НЕ плутати з уже наявними полями цієї ж таблиці/сусідніх: `reading_session.mood_note`
 * (довільний вільний текст форми завершення сесії) і "Настрій цього сеансу"
 * (`note.reaction`/`REACTION_META`, `src/design/reactions.ts`, Milestone 11 доповнення) — та
 * реакція про ЗАПИС щоденника (7 довільних емоційних міток: смішно/сумно/шок/...), обирається
 * ДО збереження сесії (та сама форма завершення) і одразу створює нотатку типу `'moment'`.
 * `reading_experience` — третє, окреме поле: структурований опис САМЕ reading experience (ТЗ
 * прямо застерігає — "НЕ mental-health tracking"), яке ставиться ПІСЛЯ того, як сесія вже
 * безпечно збережена (`app/session/[sessionId].tsx`, `SessionReflectionPanel`), окремою
 * мутацією — щоб не додавати зайвий blocking-крок до самого завершення/збереження прогресу.
 *
 * Без `DEFAULT` (на відміну від `shelf.theme`) — це справді необов'язкове поле, яке нормально
 * лишається `NULL` і для нових, і для вже існуючих сесій: "не вказано" тут не потребує
 * нейтрального fallback-значення для показу, на відміну від теми полиці, яку картка полиці
 * завжди мусить якось відмалювати.
 */
export const version = 10;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`ALTER TABLE reading_session ADD COLUMN reading_experience TEXT;`);
}
