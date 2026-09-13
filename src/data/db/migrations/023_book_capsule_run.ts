import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 023 — REREADING MODEL, Фаза 10 (POLYTSIA V1.6.1). `docs/READING_RUN.md` — повне
 * обґрунтування; тут стисло, що саме робить ця міграція і чому.
 *
 * ПРОБЛЕМА (`docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 23, п.7, CODE VERIFIED): `book_capsule`
 * НАВМИСНО БЕЗ `UNIQUE(user_book_id)` (`012_book_capsule.ts`) — саме тому, що застосунок не мав
 * способу прив'язати капсулу до конкретного прочитання; "поточна" капсула визначається лише
 * найновішою за `created_at` (`BookCapsuleRepository.getByUserBookId`). Наслідок: після
 * перечитування й повторного завершення книги стара капсула (з першого прочитання) і далі
 * "перекриває" — UI (`BookCapsuleSection` на `app/completion/[workId].tsx`/
 * `app/memory/[workId].tsx`) бачить, що капсула ВЖЕ Є, і НІКОЛИ не пропонує залишити нову для
 * щойно завершеного повторного прочитання.
 *
 * РІШЕННЯ, ЯКЕ ВІДРІЗНЯЄТЬСЯ ВІД ФАЗ 8/9 — НЕ rebuild, ПРОСТА `ADD COLUMN`: на відміну від
 * `book_memory`/`pre_reading_reflection` (де UNIQUE-обмеження МІНЯЛОСЬ з "на книгу" на "на
 * run"), `book_capsule` ніколи не мала `UNIQUE(user_book_id)` — множинність капсул на книгу вже
 * була свідомо дозволена (п.1 `012_book_capsule.ts`). Тут просто додається нова nullable
 * колонка `reading_run_id TEXT` — БЕЗ `UNIQUE` (кілька капсул на один run технічно можливі, той
 * самий "не забороняй того, що вже було дозволено" принцип) і БЕЗ SQL `REFERENCES
 * reading_run(id)` (той самий, уже задокументований у цьому проєкті урок —
 * `008_note_category.ts`/`020_reading_run_backfill.ts`/`021`/`022`: FK з `ON DELETE SET NULL`
 * на `ALTER TABLE`-колонці мовчки обнулився б, якби `reading_run` колись пройшов
 * rebuild-міграцію). Оскільки жодне існуюче `UNIQUE`-обмеження не знімається, не потрібен ані
 * `_new`+`DROP`+`RENAME` ідіом, ані `manualTransaction`/`PRAGMA foreign_keys` — уся міграція
 * (`ADD COLUMN` + backfill) в одній звичайній транзакції, той самий підхід, що й
 * `020_reading_run_backfill.ts`.
 *
 * КАПСУЛА ФІКСУЄ RUN РАЗ І НАЗАВЖДИ, А НЕ "НАЙНОВІШИЙ = ПОТОЧНИЙ" (відмінність від Фаз 8/9):
 * `BookMemoryRepository`/`PreReadingReflectionRepository` — `upsert`-репозиторії: `getCurrent`
 * РЕЗОЛЬВИТЬ run наново при КОЖНОМУ читанні через `getLatestByUserBookId`, бо той самий рядок
 * можна редагувати повторно, і "поточний" run цілком міг змінитися між викликами.
 * `BookCapsuleRepository` — НЕ upsert: `create` викликається РІВНО ОДИН РАЗ на капсулу, і саме
 * тоді (і тільки тоді) `reading_run_id` резолвиться через `ReadingRunRepository
 * .getLatestByUserBookId` і записується назавжди в рядок — жодного повторного резолвінгу при
 * подальших читаннях немає й не повинно бути: капсула — це знімок ОДНОГО конкретного моменту
 * завершення, а не "живий", постійно синхронізований з поточним станом запис. Саме тому
 * читання (`getByUserBookId` — найновіша ЗАГАЛОМ; новий `getCurrent` нижче — капсула САМЕ
 * поточного run) НІКОЛИ не викликають `ReadingRunRepository` для якогось "перепризначення" —
 * лише фільтрують уже застосований `reading_run_id`.
 *
 * BACKFILL наявних рядків — за НАЙБЛИЖЧИМ у часі завершеним run, А НЕ "найновіший
 * finished/did_not_finish" (як у Фазах 8/9): на відміну від Book Memory/Before-After (де книга
 * технічно мала щонайбільше ОДИН legacy-рядок, і питання було лише "який run обрати"),
 * `book_capsule` могла накопичити КІЛЬКА рядків на книгу вже й ДО цієї міграції (множинність
 * була дозволена завжди). Пряме "найновіший finished run на все й для всіх капсул книги" зламало
 * б множинність — кілька різних капсул тієї самої книги отримали б ОДИН і той самий
 * `reading_run_id`, хоча кожна могла бути створена після РІЗНОГО завершення. Натомість для
 * КОЖНОЇ капсули окремо: найновіший `finished`/`did_not_finish` run, чий `finished_at` НЕ
 * ПІЗНІШЕ за `created_at` цієї конкретної капсули (капсула завжди створюється ПІСЛЯ, а не до,
 * моменту завершення — `canCreateCapsule` вимагає `status === 'finished'` вже НА МОМЕНТ
 * створення). Це саме той запит, який `create()` нижче робив би "заднім числом", якби capsule
 * знала свій `reading_run_id` із самого початку. Якщо жодного такого run немає (книга без
 * `reading_run` узагалі — Фаза 7 `addToLibrary`, свідомо не підключена — або й дивна легасі-
 * аномалія) — `reading_run_id` лишається `NULL`, той самий принцип "не вигадувати історію", що
 * й у Фазах 6b/8/9.
 */
export const version = 23;

interface LegacyCapsuleRow {
  id: string;
  user_book_id: string;
  created_at: string;
}

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE book_capsule ADD COLUMN reading_run_id TEXT;
    CREATE INDEX idx_book_capsule_reading_run ON book_capsule(reading_run_id);
  `);

  const legacyCapsules = await db.getAllAsync<LegacyCapsuleRow>(
    `SELECT id, user_book_id, created_at FROM book_capsule WHERE reading_run_id IS NULL`,
  );
  if (legacyCapsules.length === 0) return;

  for (const capsule of legacyCapsules) {
    const run = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM reading_run
       WHERE user_book_id = ? AND deleted_at IS NULL
         AND status IN ('finished', 'did_not_finish')
         AND finished_at IS NOT NULL AND finished_at <= ?
       ORDER BY finished_at DESC LIMIT 1`,
      [capsule.user_book_id, capsule.created_at],
    );
    if (!run) continue;

    await db.runAsync(`UPDATE book_capsule SET reading_run_id = ? WHERE id = ?`, [run.id, capsule.id]);
  }
}
