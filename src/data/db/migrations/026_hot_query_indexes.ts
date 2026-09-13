import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 026 — PERFORMANCE / INDEX AUDIT (POLYTSIA V1.6.1, Фаза 24). Повне обґрунтування,
 * фікстура й точні цифри бенчмарку — `docs/PERFORMANCE_AUDIT.md`.
 *
 * Ця фаза — пряме продовження `018_shelf_book_index.ts` (той самий за духом "аудит, не нова
 * функціональність" крок, там — Фаза 20 ТЗ V1.6). Три з чотирьох кандидатів нижче — НЕ нові
 * знахідки цієї фази: вони вже точно названі в `docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 30.3,
 * п.1-3, з позначкою "NOT BENCHMARKED" (аудит лише вказав на розбіжність зі схемою, застосованою
 * для `reading_progress`/`shelf_book`, свідомо не стверджуючи, що це реальна проблема
 * продуктивності). Ця міграція — той самий бенчмарк, якого аудиту тоді бракувало: реальні 25
 * міграцій виконані проти справжнього SQLite (`node:sqlite`), на детермінованій фікстурі
 * реалістичного обсягу (1000 книг/5000 сесій/10000 записів щоденника/1000 lore/500
 * капсул-прочитань — `docs/PERFORMANCE_AUDIT.md` §Фікстура), з `EXPLAIN QUERY PLAN` до і після
 * кожного індексу. Четвертий кандидат (`reading_session(user_book_id, started_at)`) — нова
 * знахідка САМЕ цієї фази, виявлена тим самим методом (grep реальних repository-запитів), якої
 * не було в списку аудиту.
 *
 * Усі чотири — підтверджені емпірично, не лише за схемою (докладні числа й точні
 * `EXPLAIN QUERY PLAN` виводи — `docs/PERFORMANCE_AUDIT.md`):
 *
 * 1. **`edition.isbn10`** (аудит, розділ 30.3, п.1) — `EditionRepository.getByIsbn`:
 *    `WHERE (isbn10 = ? OR isbn13 = ?) AND deleted_at IS NULL`. SQLite використовує
 *    `MULTI-INDEX OR`-оптимізацію лише тоді, коли ОБИДВІ гілки `OR` мають власний індекс — без
 *    індексу на `isbn10` ввесь запит (навіть коли `isbn13` індексований) падає до повного
 *    `SCAN edition`. Підтверджено на фікстурі: `SCAN edition` до індексу → `MULTI-INDEX OR`
 *    (`SEARCH ... USING INDEX idx_edition_isbn10` + `SEARCH ... USING INDEX idx_edition_isbn13`)
 *    після, ~6x швидше на 1000 видань — і, на відміну від решти трьох кандидатів, це якісна
 *    відмінність (SCAN проти SEARCH), що лише погіршується лінійно з ростом бібліотеки, а не
 *    просто прибирає крок сортування.
 * 2. **`user_book(status, updated_at)`** (аудит, розділ 30.3, п.3 — "найгарячіший запит усього
 *    застосунку") — `UserBookRepository.listByStatus`/`listStatusOnly`:
 *    `WHERE status = ? AND deleted_at IS NULL ORDER BY updated_at DESC`. Одноколонковий
 *    `idx_user_book_status` покриває лише рівність; сортування виконувалось окремим кроком
 *    (`USE TEMP B-TREE FOR ORDER BY`). Композитний індекс прибирає цей крок повністю.
 * 3. **`note`/`quote(user_book_id, created_at)`** (аудит, розділ 30.3, п.2) — той самий шаблон
 *    прогалини, що вже виправлений для `reading_progress` (`idx_progress_user_book`, 001) і
 *    `shelf_book` (`idx_shelf_book_user_book`, 018), але не застосований тут:
 *    `NoteRepository.listByUserBook`/`QuoteRepository.listByUserBook` —
 *    `WHERE user_book_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`. Той самий
 *    `USE TEMP B-TREE FOR ORDER BY` до індексу, прибраний композитним індексом.
 * 4. **`reading_session(user_book_id, started_at)`** (НОВА знахідка цієї фази, не з аудиту) —
 *    `ReadingSessionRepository.listByUserBookId` (Book Details — історія сесій конкретної
 *    книги): точнісінько той самий шаблон "фільтр за FK + ORDER BY по даті", що й п.3, лише
 *    інша таблиця й дата (`started_at`, не `created_at`). Виявлено тим самим прямим читанням
 *    репозиторію (не з аудиту, де розділ 30.3 п.4 обговорював лише окремий, гіпотетичний індекс
 *    на `ended_at`, не цю композитну пару).
 *
 * СВІДОМО НЕ додано (перевірено бенчмарком, а не припущенням):
 * - **`reading_session.ended_at` окремо** (аудит, розділ 30.3, п.4) — `getActiveSession`
 *   (щонайбільше 1 активна сесія, висока вибірковість і без індексу) і `listAllCompleted`
 *   (свідомо БЕЗ `LIMIT`, розділ 29.1 аудиту — сканує все незалежно від індексів) — жоден
 *   реальний виграш.
 * - **`deleted_at` (soft-delete) на жодній таблиці** (аудит, розділ 30.3, п.5) — низька
 *   вибірковість (видалених рядків завжди мало відносно живих), overhead на запис не
 *   виправданий для одного користувача.
 * - **Глобальна стрічка щоденника** (`JournalRepository`'s `UNION ALL ... ORDER BY created_at
 *   DESC, id DESC LIMIT ?`) — перевірено `EXPLAIN QUERY PLAN`: уже `MERGE (UNION ALL)` з
 *   `SCAN ... USING INDEX idx_note_created_at`/`idx_quote_created_at` по обидва боки, без
 *   TEMP B-TREE — наявні одноколонкові індекси на `created_at` (003) уже покривають цей
 *   конкретний запит повністю; композитні індекси нижче тут ні до чого.
 * - **`edition.isbn10`/OR-кандидати на `book_capsule`/`lore_entity`/тощо** — жодного реального
 *   query use case не знайдено при перевірці репозиторіїв цих таблиць (`BookCapsuleRepository`,
 *   `LoreEntityRepository`) — фільтрація там завжди лише за вже індексованим `user_book_id`/
 *   `work_id`, без додаткового `ORDER BY` по датованій колонці.
 *
 * ВИДАЛЕННЯ старих одноколонкових індексів (`idx_user_book_status`, `idx_note_user_book`,
 * `idx_quote_user_book`, `idx_session_user_book`) — не лише додавання нових: SQLite composite
 * index покриває будь-який запит на самій лише провідній колонці так само добре, як окремий
 * одноколонковий індекс на ній (leftmost-prefix rule) — перевірено `EXPLAIN QUERY PLAN` окремо
 * для запитів БЕЗ `ORDER BY` (`UserBookRepository.getByEditionId`-подібні, `COUNT(*) WHERE
 * user_book_id = ?`) після видалення старих індексів: усі й далі використовують новий
 * композитний індекс (в одному випадку — навіть `COVERING INDEX`, ще краще). Тримати обидва
 * (старий одноколонковий + новий композитний) означало б подвійний overhead на запис
 * (INSERT/UPDATE підтримує обидва індекси) без жодної користі на читання — той самий принцип, що
 * й "не додавай індекс без query use case", але у зворотному напрямку: не тримай той, що
 * замінений. `idx_edition_isbn13` НЕ видаляється — на відміну від решти, для `MULTI-INDEX OR`
 * потрібні ОБИДВА окремі одноколонкові індекси (`isbn10`/`isbn13`), композит тут не застосовний
 * (два різні стовпці в диз'юнкції, не фільтр+сортування однієї таблиці).
 */
export const version = 26;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE INDEX idx_edition_isbn10 ON edition(isbn10);

    DROP INDEX idx_user_book_status;
    CREATE INDEX idx_user_book_status_updated_at ON user_book(status, updated_at);

    DROP INDEX idx_note_user_book;
    CREATE INDEX idx_note_user_book_created_at ON note(user_book_id, created_at);

    DROP INDEX idx_quote_user_book;
    CREATE INDEX idx_quote_user_book_created_at ON quote(user_book_id, created_at);

    DROP INDEX idx_session_user_book;
    CREATE INDEX idx_session_user_book_started_at ON reading_session(user_book_id, started_at);
  `);
}
