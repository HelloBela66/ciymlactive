import type { SQLiteDatabase } from 'expo-sqlite';
import { backfillLegacyReadingRuns } from '@/data/db/legacyRunBackfill';

/**
 * Migration 020 — REREADING MODEL, Фаза 6b (POLYTSIA V1.6.1). Продовження `019_reading_run.ts`
 * (Фаза 6 — сама сутність, БЕЗ жодного підключення). Повне обґрунтування — `docs/READING_RUN.md`
 * §Backfill; тут — стисло, що саме робить ця міграція і чому.
 *
 * ЧАСТИНА 1 — схема: `reading_session.reading_run_id`, nullable (для legacy-сесій, які backfill
 * нижче з якоїсь причини не зміг прив'язати — див. п. "Коли run НЕ створюється").
 *
 * СВІДОМО БЕЗ `REFERENCES reading_run(id)`/`ON DELETE` на цій колонці — пряме застосування вже
 * задокументованого в цьому проєкті уроку (`008_note_category.ts`, `002_book_source_isbndb.ts`):
 * FK з `ON DELETE SET NULL`, доданий через `ALTER TABLE ADD COLUMN`, спрацьовує, коли ПАРНА
 * (референсована) таблиця пізніше проходить rebuild-міграцію (`DROP TABLE`+`CREATE`+копіювання
 * під `PRAGMA foreign_keys = ON`) — сам `DROP TABLE reading_run` тоді трактується як видалення
 * всіх його рядків і мовчки обнулив би `reading_run_id` у ВСІХ сесіях застосунку. `reading_run`
 * (019) поки не має CHECK-списку, що напевно ніколи не розшириться, тож ризик майбутнього
 * rebuild цілком реальний — той самий клас ризику, що вже змусив `008` прибрати FK з
 * `note.category_id`. Цілісність лишається на рівні застосунку
 * (`ReadingRunRepository`/`ReadingSessionRepository`); `reading_run` ніколи не видаляється
 * жорстко (лише `discard()` — м'яко), тож `reading_run_id` в сесії ніколи фізично не "звисає" в
 * порожнечу навіть без SQL FK.
 *
 * ЧАСТИНА 2 — backfill: для КОЖНОГО наявного `user_book` (незалежно від `deleted_at` — навіть
 * "видалена" з бібліотеки книга зберігає свою реальну історію читання) — щонайбільше ОДИН
 * legacy `reading_run` (`run_number = 1`, `is_legacy_backfill = 1`), best-effort з уже наявних
 * `started_at`/`finished_at`/сесій/статусу. ПРЯМА вимога ТЗ Фази 6b: без вигадування кількох
 * старих перечитувань — дані просто не дозволяють надійно розрізнити "це було перше читання чи
 * третє" для книги, що вже зараз має статус `rereading`. Уся попередня історія такої книги
 * (усі її сесії, незалежно від того, скільки разів вона реально перечитувалась) навмисно
 * збирається під ОДИН run.
 *
 * Правило визначення полів (по кожному `user_book`):
 * - `started_at` run = `user_book.started_at`, якщо є; інакше — найраніший
 *   `reading_session.started_at` цієї книги (захисний fallback — на практиці
 *   `started_at`/сесії завжди узгоджені, `UserBookRepository.updateStatus`); інакше — **run
 *   НЕ створюється взагалі** (книга ніколи не була розпочата, придумувати дату означало б
 *   вигадувати історію, якої не було — той самий принцип "без вигадування", що й для кількох
 *   run вище). Тоді `reading_session.reading_run_id` для (неіснуючих) сесій цієї книги
 *   лишається `NULL` — на практиці це саме книги без жодної сесії (`want_to_read`).
 * - `status`/`finished_at` run залежать від ПОТОЧНОГО `user_book.status`:
 *   - `'reading' | 'rereading' | 'paused'` → `in_progress`, `finished_at = NULL`. Це стосується
 *     і `rereading` — навіть якщо `user_book.finished_at` вже містить дату ПЕРШОГО завершення
 *     (`docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 23, п.1: це поле більше ніколи не оновлюється),
 *     той старий `finished_at` СВІДОМО не переноситься в legacy run — інакше єдиний run
 *     одночасно позначався б "завершеним" і "активним", що суперечливо. Це і є та сама втрата
 *     інформації, задокументована прямим текстом у `docs/READING_RUN.md` §Backfill: точна дата
 *     завершення ПЕРШОГО прочитання книги, яку зараз перечитують, у моделі backfill не
 *     відновлювана без вигадування — весь проміжок до поточного моменту стає одним
 *     "in_progress" run.
 *   - `'finished'` → `finished`, `finished_at = user_book.finished_at`, якщо є; інакше —
 *     найпізніший `reading_session.ended_at` цієї книги; інакше — `user_book.updated_at`
 *     (останній захисний fallback для рідкісної розбіжності даних, а не очікуваний шлях).
 *   - `'did_not_finish'` → `did_not_finish`, `finished_at` = `dnf_reflection.created_at` цієї
 *     книги (найточніший наявний сигнал моменту переходу — `017_dnf_reflection.ts`), якщо
 *     рядок є; інакше — `user_book.updated_at`.
 *   - `'want_to_read'` (лише якщо, попри це, `started_at` усе ж визначився вище — аномалія
 *     даних, не очікуваний шлях) → трактується консервативно як `in_progress`: "хочу прочитати"
 *     саме по собі ніколи не є завершенням.
 * - `reading_session.reading_run_id` для КОЖНОЇ сесії цієї книги (незалежно від `deleted_at` —
 *   навіть скасована сесія фізично належала якомусь run) проставляється на щойно створений
 *   legacy run.
 *
 * Такий самий "JS-цикл поверх `db.getAllAsync`/`runAsync`" підхід, а не чистий декларативний
 * SQL (на відміну від УСІХ попередніх 19 міграцій) — свідомий виняток: (1) кожному новому
 * рядку `reading_run` потрібен РЕАЛЬНИЙ `generateId()` (`react-native-uuid`, той самий формат,
 * що й усі інші рядки застосунку) — SQLite не має вбудованої UUID-функції, а
 * `lower(hex(randomblob(16)))` дав би рядки, що не виглядають як решта UUID бази; (2) логіка
 * вибору `status`/`finished_at` вище — багаторівневе розгалуження за станом кожного рядка
 * (`CASE` на 5+ гілок з кількома fallback-рівнями кожна) читалось і перевірялось би в чистому
 * SQL значно гірше, ніж у TypeScript. Уся ця фаза виконується як ОДНА міграція (без
 * `manualTransaction` — жодного `PRAGMA foreign_keys` перемикання тут не потрібно, на відміну
 * від `002`/`003`), тож `migrationRunner.ts` як завжди огортає її в одну спільну транзакцію:
 * або весь backfill застосовується, або жоден рядок.
 */
export const version = 20;

/**
 * ЧАСТИНА 2 (backfill) винесена в `src/data/db/legacyRunBackfill.ts`
 * (`backfillLegacyReadingRuns`, POLYTSIA V1.6.1, Фаза 27) — дослівно той самий алгоритм, що й
 * тут був раніше, лише перевикористовується ще й `BackupRepository`-відновленням старих
 * бекапів (докладне обґрунтування — коментар над самою функцією).
 */
export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE reading_session ADD COLUMN reading_run_id TEXT;
    CREATE INDEX idx_reading_session_reading_run ON reading_session(reading_run_id);
  `);

  await backfillLegacyReadingRuns(db);
}
