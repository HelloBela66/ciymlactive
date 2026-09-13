import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';

/**
 * REREADING MODEL — спільна backfill-логіка (POLYTSIA V1.6.1, Фаза 27, `docs/READING_RUN.md`
 * §Backfill/§Restore). Кожна з чотирьох функцій нижче — той самий JS-цикл, що й "ЧАСТИНА 2" у
 * відповідній із шести схемних міграцій ланцюга (`020_reading_run_backfill.ts`/
 * `021_book_memory_run.ts`/`022_pre_reading_reflection_run.ts`/`023_book_capsule_run.ts`/
 * `024_dnf_reflection_run.ts`/`025_rating_run.ts` — три з них, 021/022/025, ділять ОДНУ спільну
 * функцію, {@link backfillNewestFinishedRunLink}, бо мали буквально ідентичний алгоритм),
 * ВИНЕСЕНИЙ сюди дослівно (без жодної зміни запитів чи пріоритету вибору run) — самі міграції
 * тепер лише викликають ці функції (рефакторинг, не зміна поведінки:
 * `migrationRunner.test.ts` для 020-025 підтверджує це побайтово — той самий результат).
 *
 * НАВІЩО СПІЛЬНИЙ МОДУЛЬ, А НЕ ЛИШЕ МІГРАЦІЇ: `BackupRepository.restoreAll` (Фаза 4) —
 * "replace all", і до Фази 27 `reading_run` взагалі НЕ входила в `BACKUP_TABLE_ORDER` (реальна
 * прогалина — бекап тихо губив усю історію перечитувань). Відновлення СТАРОГО файлу бекапу
 * (зробленого до Фази 6, коли `reading_run` ще не існувала) відтворює РІВНО ТУ САМУ ситуацію, що
 * й одноразова міграція 019→020→...→025 розв'язувала при оновленні застосунку: сесії/спогади/
 * капсули/рейтинги/нотатки "До"/DNF-знімки є, а `reading_run`/`reading_run_id` — ні. Але схемні
 * міграції виконуються РІВНО ОДИН РАЗ у житті БД — вони НЕ перезапускаються при кожному
 * `restoreAll` (сама БД уже на `LATEST_SCHEMA_VERSION` задовго до restore). Тож `restoreAll`
 * (точніше — виклик одразу після неї, `useRestoreBackup`, той самий "post-restore крок, що не
 * валить весь restore при збої" патерн, що й `rebuildCapsuleRemindersAsync`,
 * `src/features/memory/useBookCapsule.ts`) окремо викликає {@link backfillAllLegacyReadingRunLinks}
 * — інакше користувач, що відновлює старий бекап, одразу побачив би в «Перевірці даних»
 * (`dataIntegrityDoctor.ts`, Фаза 26) `session_without_run` для КОЖНОЇ книги — штучну, самою
 * процедурою відновлення створену "проблему", якої в реальності немає.
 *
 * ЧОМУ ЦЕ БЕЗПЕЧНО ВИКЛИКАТИ ПОВТОРНО (на відміну від міграцій, що виконуються раз): кожна
 * функція фільтрує рівно ті рядки, які ще НЕ мають зв'язку (`reading_run` — книги без жодного
 * `reading_run`; решта — `WHERE reading_run_id IS NULL`), тож виклик на вже узгодженій БД (напр.
 * після відновлення СВІЖОГО бекапу, зробленого вже після Фази 6 — з уже заповненою
 * `reading_run`/`reading_run_id`) — чистий no-op, нічого не дублює й не перезаписує.
 *
 * ЧОМУ ЦЕ НЕ ВСЕРЕДИНІ `BackupRepository.restoreAll` (свідомо): `restoreAll`
 * (`BackupRepository.test.ts`, "export → restore у чисту БД → повторний export дають семантично
 * ідентичні дані") — навмисно ЧИСТА дзеркальна вставка: "жодне поле не перегенерується/не
 * позначається часом виконання restore". Backfill СТВОРЮЄ нові рядки (`reading_run`) і МІНЯЄ
 * існуючі (`reading_run_id`) — це порушило б саме цей інваріант і сам round-trip тест (два
 * послідовні export після restore ідентичного бекапу вже не збігалися б). Тому backfill — окремий
 * крок над `restoreAll`, той самий рівень, що й `rebuildCapsuleRemindersAsync`, а не частина
 * самого repository-методу.
 */

interface LegacyUserBookRow {
  id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

interface SessionAggregateRow {
  user_book_id: string;
  min_started_at: string | null;
  max_ended_at: string | null;
}

interface DnfRow {
  user_book_id: string;
  created_at: string;
}

/**
 * Мірор "ЧАСТИНИ 2" `020_reading_run_backfill.ts` — для кожного `user_book`, що ще не має
 * ЖОДНОГО `reading_run` (оригінальна міграція перевіряла це неявно: вона виконувалась одразу
 * після 019, тож `reading_run` була порожньою таблицею для всіх книг узагалі; тут перевірка
 * явна — `NOT EXISTS`, — щоб виклик після restore СВІЖОГО бекапу (де книги вже МАЮТЬ власні
 * run) був безпечним no-op, а не спробою створити дублікат `run_number = 1`), створює ОДИН
 * legacy run і прив'язує до нього всі сесії книги (докладний вибір `status`/`finished_at` —
 * коментар над оригінальною міграцією).
 */
export async function backfillLegacyReadingRuns(db: SQLiteDatabase): Promise<void> {
  const userBooks = await db.getAllAsync<LegacyUserBookRow>(
    `SELECT ub.id, ub.status, ub.started_at, ub.finished_at, ub.updated_at
     FROM user_book ub
     WHERE NOT EXISTS (SELECT 1 FROM reading_run rr WHERE rr.user_book_id = ub.id)`,
  );
  if (userBooks.length === 0) return;

  const sessionAggregateRows = await db.getAllAsync<SessionAggregateRow>(
    `SELECT
       user_book_id,
       MIN(started_at) AS min_started_at,
       MAX(CASE WHEN ended_at IS NOT NULL THEN ended_at END) AS max_ended_at
     FROM reading_session
     GROUP BY user_book_id`,
  );
  const sessionAggregateByUserBookId = new Map(sessionAggregateRows.map((row) => [row.user_book_id, row]));

  const dnfRows = await db.getAllAsync<DnfRow>(`SELECT user_book_id, created_at FROM dnf_reflection`);
  const dnfCreatedAtByUserBookId = new Map(dnfRows.map((row) => [row.user_book_id, row.created_at]));

  const now = nowIso();

  for (const userBook of userBooks) {
    const sessionAggregate = sessionAggregateByUserBookId.get(userBook.id);
    const startedAt = userBook.started_at ?? sessionAggregate?.min_started_at ?? null;
    if (!startedAt) continue; // Книга ніколи не була розпочата — legacy run не створюється.

    let status: 'in_progress' | 'finished' | 'did_not_finish';
    let finishedAt: string | null;

    if (userBook.status === 'finished') {
      status = 'finished';
      finishedAt = userBook.finished_at ?? sessionAggregate?.max_ended_at ?? userBook.updated_at;
    } else if (userBook.status === 'did_not_finish') {
      status = 'did_not_finish';
      finishedAt = dnfCreatedAtByUserBookId.get(userBook.id) ?? userBook.updated_at;
    } else {
      status = 'in_progress';
      finishedAt = null;
    }

    const runId = generateId();
    await db.runAsync(
      `INSERT INTO reading_run (
         id, user_book_id, run_number, status, started_at, finished_at,
         is_legacy_backfill, created_at, updated_at
       ) VALUES (?, ?, 1, ?, ?, ?, 1, ?, ?)`,
      [runId, userBook.id, status, startedAt, finishedAt, now, now],
    );

    await db.runAsync(`UPDATE reading_session SET reading_run_id = ? WHERE user_book_id = ?`, [
      runId,
      userBook.id,
    ]);
  }
}

interface LegacyLinkRow {
  id: string;
  user_book_id: string;
}

interface CandidateRunRow {
  id: string;
  status: 'in_progress' | 'finished' | 'did_not_finish';
  run_number: number;
}

/** Таблиці, дозволені для {@link backfillNewestFinishedRunLink} — фіксований список (не рядок з
 * файлу бекапу чи іншого зовнішнього джерела), лише щоб інтерполяція назви таблиці в SQL нижче
 * була явно обмежена типом, а не довільним рядком. */
type NewestFinishedRunLinkTable = 'book_memory' | 'pre_reading_reflection' | 'rating';

/**
 * Мірор "ЧАСТИНИ 2" `021_book_memory_run.ts`/`022_pre_reading_reflection_run.ts`/
 * `025_rating_run.ts` — усі три мали БУКВАЛЬНО ідентичний пріоритет вибору run (найновіший
 * `finished`/`did_not_finish`, інакше найновіший run узагалі, інакше `NULL`), тож тут одна
 * generic-функція замість трьох копій. `table` — лише з фіксованого union вище.
 */
export async function backfillNewestFinishedRunLink(
  db: SQLiteDatabase,
  table: NewestFinishedRunLinkTable,
): Promise<void> {
  const legacyRows = await db.getAllAsync<LegacyLinkRow>(
    `SELECT id, user_book_id FROM ${table} WHERE reading_run_id IS NULL`,
  );
  if (legacyRows.length === 0) return;

  for (const row of legacyRows) {
    const candidates = await db.getAllAsync<CandidateRunRow>(
      `SELECT id, status, run_number FROM reading_run
       WHERE user_book_id = ? AND deleted_at IS NULL
       ORDER BY run_number DESC`,
      [row.user_book_id],
    );
    if (candidates.length === 0) continue;

    const finishedCandidate = candidates.find((run) => run.status === 'finished' || run.status === 'did_not_finish');
    const chosenRun = finishedCandidate ?? candidates[0];
    if (!chosenRun) continue;

    await db.runAsync(`UPDATE ${table} SET reading_run_id = ? WHERE id = ?`, [chosenRun.id, row.id]);
  }
}

interface LegacyCapsuleRow {
  id: string;
  user_book_id: string;
  created_at: string;
}

/**
 * Мірор "ЧАСТИНИ 2" `023_book_capsule_run.ts` — на відміну від {@link backfillNewestFinishedRunLink},
 * книга могла мати КІЛЬКА капсул уже до появи `reading_run_id`, тож кожна лінкується окремо на
 * НАЙБЛИЖЧИЙ у часі завершений run (`finished_at <= created_at` капсули), а не всі на один
 * "найновіший" — докладне обґрунтування в коментарі над оригінальною міграцією.
 */
export async function backfillCapsuleRunLinks(db: SQLiteDatabase): Promise<void> {
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

interface LegacyDnfReflectionRow {
  id: string;
  user_book_id: string;
  created_at: string;
}

interface DnfCandidateRunRow {
  id: string;
  finished_at: string | null;
  run_number: number;
}

/**
 * Мірор "ЧАСТИНИ 2" `024_dnf_reflection_run.ts` — на відміну від решти, кандидатом рахується
 * ЛИШЕ `did_not_finish`-run (DNF-знімок концептуально не може належати `finished`-run'у), і
 * фолбек, коли жодного run із `finished_at <= created_at` немає — НАЙНОВІШИЙ `did_not_finish`-run
 * книги (а не `NULL`) — докладне обґрунтування в коментарі над оригінальною міграцією.
 */
export async function backfillDnfReflectionRunLinks(db: SQLiteDatabase): Promise<void> {
  const legacyReflections = await db.getAllAsync<LegacyDnfReflectionRow>(
    `SELECT id, user_book_id, created_at FROM dnf_reflection WHERE reading_run_id IS NULL`,
  );
  if (legacyReflections.length === 0) return;

  for (const reflection of legacyReflections) {
    const candidates = await db.getAllAsync<DnfCandidateRunRow>(
      `SELECT id, finished_at, run_number FROM reading_run
       WHERE user_book_id = ? AND deleted_at IS NULL AND status = 'did_not_finish'
       ORDER BY run_number DESC`,
      [reflection.user_book_id],
    );
    if (candidates.length === 0) continue;

    const nearestBelow = candidates
      .filter((run) => run.finished_at != null && run.finished_at <= reflection.created_at)
      .sort((a, b) => (a.finished_at! < b.finished_at! ? 1 : -1))[0];
    const chosenRun = nearestBelow ?? candidates[0];
    if (!chosenRun) continue;

    await db.runAsync(`UPDATE dnf_reflection SET reading_run_id = ? WHERE id = ?`, [chosenRun.id, reflection.id]);
  }
}

/**
 * Оркеструє всі чотири backfill-функції вище В ПРАВИЛЬНОМУ ПОРЯДКУ ЗАЛЕЖНОСТЕЙ (`reading_run` —
 * родитель для решти: спершу мають з'явитись самі run, лише потім є до чого лінкувати книжкові
 * спогади/нотатки "До"/рейтинги/капсули/DNF-знімки; {@link backfillNewestFinishedRunLink}
 * викликається тричі — по разу на `book_memory`/`pre_reading_reflection`/`rating`) — саме цю
 * функцію викликає `useRestoreBackup` (`src/features/backup/useBackup.ts`) одразу після
 * `BackupRepository.restoreAll` (докладніше — коментар над файлом вище й `docs/BACKUP_FORMAT.md`
 * §Restore, п.11).
 */
export async function backfillAllLegacyReadingRunLinks(db: SQLiteDatabase): Promise<void> {
  await backfillLegacyReadingRuns(db);
  await backfillNewestFinishedRunLink(db, 'book_memory');
  await backfillNewestFinishedRunLink(db, 'pre_reading_reflection');
  await backfillNewestFinishedRunLink(db, 'rating');
  await backfillCapsuleRunLinks(db);
  await backfillDnfReflectionRunLinks(db);
}
