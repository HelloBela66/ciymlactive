import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { ReadingRun, ReadingRunStatus } from '@/types/readingRun';

interface ReadingRunRow {
  id: string;
  user_book_id: string;
  run_number: number;
  status: ReadingRunStatus;
  started_at: string;
  finished_at: string | null;
  is_legacy_backfill: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function mapRow(row: ReadingRunRow): ReadingRun {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    runNumber: row.run_number,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    isLegacyBackfill: row.is_legacy_backfill === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // SOFT-DELETE READINESS (Фаза 26) — усі публічні read-методи нижче фільтрують
    // `deleted_at IS NULL`, тож для будь-якого рядка, що доходить сюди, це завжди `null`; поле
    // проноситься все одно, щоб домен-тип чесно відповідав ТЗ (id+createdAt+updatedAt+deletedAt
    // обов'язково), а не тому, що тут колись може прийти не-NULL значення.
    deletedAt: row.deleted_at,
  };
}

/**
 * REREADING MODEL, Фаза 6 (`docs/READING_RUN.md`, `019_reading_run.ts`). Ця фаза — лише сама
 * сутність (schema/domain/repository), навмисно БЕЗ жодного виклику звідси з
 * `UserBookRepository`/`ReadingSessionRepository`/UI — те, яка саме дія користувача створює чи
 * завершує run, підключається пізніше (Фаза 7 і далі), щоб не змінювати продуктову поведінку
 * мовчки в тій самій фазі, де щойно з'явилась сама сутність.
 */
export const ReadingRunRepository = {
  async getById(db: SQLiteDatabase, id: string): Promise<ReadingRun | null> {
    const row = await db.getFirstAsync<ReadingRunRow>(
      `SELECT * FROM reading_run WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    return row ? mapRow(row) : null;
  },

  /** Усі run'и книги, найстаріший перший (природний порядок "прочитання №1, №2, ..."). */
  async listByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<ReadingRun[]> {
    const rows = await db.getAllAsync<ReadingRunRow>(
      `SELECT * FROM reading_run WHERE user_book_id = ? AND deleted_at IS NULL ORDER BY run_number ASC`,
      [userBookId],
    );
    return rows.map(mapRow);
  },

  /**
   * "Активний" run книги — той самий принцип, що й `ReadingSessionRepository.getActiveSession`
   * (Фаза 5, підтверджено тестами): найновіший за `run_number` серед `in_progress`, а не
   * жорсткий UNIQUE-констрейнт у схемі (докладніше — коментар у `019_reading_run.ts`, п.4).
   */
  async getActiveByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<ReadingRun | null> {
    const row = await db.getFirstAsync<ReadingRunRow>(
      `SELECT * FROM reading_run
       WHERE user_book_id = ? AND status = 'in_progress' AND deleted_at IS NULL
       ORDER BY run_number DESC LIMIT 1`,
      [userBookId],
    );
    return row ? mapRow(row) : null;
  },

  /**
   * Найновіший run книги НЕЗАЛЕЖНО від статусу (на відміну від `getActiveByUserBookId` вище,
   * яка бачить лише `in_progress`) — REREADING MODEL, Фаза 8 (`docs/READING_RUN.md`):
   * `BookMemoryRepository` потребує "останній прохід цієї книги", а не лише "активний",
   * оскільки спогад пишеться ПІСЛЯ переходу в `finished`/`did_not_finish` (той момент, коли
   * `updateStatus`, Фаза 7, уже завершив run — він більше не `in_progress`).
   */
  async getLatestByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<ReadingRun | null> {
    const row = await db.getFirstAsync<ReadingRunRow>(
      `SELECT * FROM reading_run
       WHERE user_book_id = ? AND deleted_at IS NULL
       ORDER BY run_number DESC LIMIT 1`,
      [userBookId],
    );
    return row ? mapRow(row) : null;
  },

  /**
   * Створює наступний run для книги: `run_number` = (максимальний наявний, включно з
   * `deleted_at`, щоб номери ніколи не перевикористовувались) + 1. Не перевіряє, чи вже є
   * `in_progress` run для цієї книги — той самий свідомий вибір "без жорсткого гейту в
   * репозиторії", що й п.4 у `019_reading_run.ts`; коли з'явиться реальний викликач (Фаза 7),
   * саме він вирішує, чи можна стартувати новий run.
   */
  async start(
    db: SQLiteDatabase,
    params: { userBookId: string; startedAt?: string },
  ): Promise<ReadingRun> {
    const maxRow = await db.getFirstAsync<{ maxRunNumber: number | null }>(
      `SELECT MAX(run_number) AS maxRunNumber FROM reading_run WHERE user_book_id = ?`,
      [params.userBookId],
    );
    const runNumber = (maxRow?.maxRunNumber ?? 0) + 1;

    const id = generateId();
    const now = nowIso();
    const startedAt = params.startedAt ?? now;

    await db.runAsync(
      `INSERT INTO reading_run (
         id, user_book_id, run_number, status, started_at, finished_at,
         is_legacy_backfill, created_at, updated_at
       ) VALUES (?, ?, ?, 'in_progress', ?, NULL, 0, ?, ?)`,
      [id, params.userBookId, runNumber, startedAt, now, now],
    );

    return {
      id,
      userBookId: params.userBookId,
      runNumber,
      status: 'in_progress',
      startedAt,
      finishedAt: null,
      isLegacyBackfill: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  },

  /**
   * Завершує run — ідемпотентно, той самий "вже завершений → нічого не робити" підхід, що й
   * `ReadingSessionRepository.finish` (Фаза 5): повторний виклик не перезаписує вже зафіксований
   * `finished_at`/`status`.
   */
  async finish(
    db: SQLiteDatabase,
    id: string,
    params: { status: 'finished' | 'did_not_finish'; finishedAt?: string },
  ): Promise<ReadingRun | null> {
    const existing = await ReadingRunRepository.getById(db, id);
    if (!existing || existing.finishedAt) return existing;

    const now = nowIso();
    const finishedAt = params.finishedAt ?? now;

    await db.runAsync(
      `UPDATE reading_run SET status = ?, finished_at = ?, updated_at = ? WHERE id = ?`,
      [params.status, finishedAt, now, id],
    );

    return { ...existing, status: params.status, finishedAt, updatedAt: now };
  },

  /** М'яке видалення — помилково розпочатий run (наприклад, одразу скасований перехід у
   * "Перечитую"). `run_number` НЕ перевикористовується (`start()` рахує з урахуванням
   * видалених рядків). */
  async discard(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`UPDATE reading_run SET deleted_at = ? WHERE id = ?`, [nowIso(), id]);
  },

  /**
   * Пакетний вибір за списком id (Календар 2.0, Фаза 19, `docs/CALENDAR_2_0.md`) — "run-aware
   * day details": `app/day/[date].tsx` показує позначку "Перечитування, прохід №N" на сесіях
   * дня, коли `session.readingRunId` вказує на run із `runNumber > 1`. Той самий "один IN-запит
   * замість N окремих" підхід, що й `UserBookRepository.listByIds` — днів із сесіями кількох
   * різних `reading_run_id` мало, але навіть це лишається одним запитом, не N.
   */
  async listByIds(db: SQLiteDatabase, ids: string[]): Promise<Map<string, ReadingRun>> {
    const result = new Map<string, ReadingRun>();
    if (ids.length === 0) return result;

    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.getAllAsync<ReadingRunRow>(
      `SELECT * FROM reading_run WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      ids,
    );
    for (const row of rows) result.set(row.id, mapRow(row));
    return result;
  },

  /**
   * Run'и, чий `startedAt` АБО `finishedAt` потрапляє в `[startIso, endIso)` — КАЛЕНДАР,
   * ВІЗУАЛЬНА КОМПОЗИЦІЯ (пост-Фаза 19, `docs/CALENDAR_2_0.md` §"Visual Day Composition"):
   * "почав читати"/"завершив" позначки дня-клітинки й timeline-пункти Day Details мають брати
   * дати САМЕ з ReadingRun (кожен прохід має власні `startedAt`/`finishedAt`), а НЕ з
   * `user_book.started_at`/`finished_at` (`ActivityHistoryRepository`'s `book_started`/
   * `book_finished` гілки) — те поле "заморожене" на ПЕРШИЙ старт і ПЕРШИЙ незмінений фініш
   * книги (`UserBookRepository.updateStatus`, докладніше коментар там-таки), тож для
   * перечитаної книги НЕ відображає дату старту/фінішу кожного окремого проходу — рівно та
   * проблема, якої це нове поле уникає.
   *
   * `JOIN user_book` з `deleted_at IS NULL` — на відміну від решти методів цього репозиторію
   * (які самі по собі м'якого видалення книги не знають, бо `reading_run` не несе власного
   * поняття "жива книга"), тут це свідомо додано: ЦЕ нова функціональність цієї фази, не
   * редагування наявної агрегації, тож пишеться одразу коректно щодо soft-delete, а не
   * повторює відомий (окремо задокументований, НЕ виправлений цією фазою — поза її обсягом)
   * розрив між сіткою місяця й деталями дня для хвилин-підрахунку на основі
   * `ReadingSessionRepository` (докладніше — `docs/CALENDAR_VISUAL_REDESIGN_REPORT.md`
   * §"Відомі обмеження").
   *
   * Один запит на весь запитаний діапазон (сітка місяця чи один день) — той самий "діапазон
   * замість по одному" підхід, що й `ActivityHistoryRepository.listBetween`.
   */
  async listStartedOrFinishedBetween(db: SQLiteDatabase, startIso: string, endIso: string): Promise<ReadingRun[]> {
    const rows = await db.getAllAsync<ReadingRunRow>(
      `SELECT rr.* FROM reading_run rr
       JOIN user_book ub ON ub.id = rr.user_book_id
       WHERE rr.deleted_at IS NULL AND ub.deleted_at IS NULL
         AND (
           (rr.started_at >= ? AND rr.started_at < ?)
           OR (rr.finished_at >= ? AND rr.finished_at < ?)
         )
       ORDER BY rr.started_at ASC`,
      [startIso, endIso, startIso, endIso],
    );
    return rows.map(mapRow);
  },

  /**
   * `userBookId` усіх книг, що мають ≥2 ЗАВЕРШЕНИХ (`status = 'finished'`) run — тобто книг, які
   * реально можна порівняти на `app/reread-comparison/[workId].tsx` (`selectComparableRuns`,
   * `useReadingRunsDetail.ts`, той самий поріг ≥2 `finished`). Фаза 16 (MEMORY HUB HIERARCHY,
   * `docs/MEMORY_HUB.md`) додала цей метод для розділу "Перечитання" на
   * `app/memory/index.tsx` — до цієї фази "чи є що порівняти" перевірялось лише ПОЧИНАЮЧИ з
   * конкретної книги (Book Details/Book Memory), не як глобальний перелік. `GROUP BY ... HAVING`
   * замість тягнути всі `reading_run` рядки й рахувати в JS — книг завжди набагато менше за
   * рядків прочитань, але фільтрація в SQL однаково дешевша й точніша.
   */
  async listUserBookIdsWithMultipleFinishedRuns(db: SQLiteDatabase): Promise<string[]> {
    const rows = await db.getAllAsync<{ user_book_id: string }>(
      `SELECT user_book_id FROM reading_run
       WHERE status = 'finished' AND deleted_at IS NULL
       GROUP BY user_book_id
       HAVING COUNT(*) >= 2`,
    );
    return rows.map((row) => row.user_book_id);
  },

  /**
   * Run'и, що ЗАВЕРШИЛИСЬ (`status IN ('finished', 'did_not_finish')`) у діапазоні
   * `[startIso, endIso)` — POLYTSIA V1.6.2, #167 (READING SEASONS — PRODUCT REDEFINITION, ТЗ
   * §39: "Use ReadingRun finish date. Не current UserBook `finished_at`, якщо ReadingRun
   * available"). До цієї фази сезон визначав "прочитані книги" через
   * `UserBookRepository.listByStatus(db, 'finished')` — поточний СТАТУС книги, а не факт
   * завершення run у вікні сезону: книга, що завершилась улітку, а потім перечитувалась і зараз
   * має статус `'rereading'`, випадала б із літнього сезону повністю (`listByStatus('finished')`
   * бачить лише книги, чий ПОТОЧНИЙ статус — `'finished'`), і повторне завершення в межах ТОГО
   * САМОГО сезону було б взагалі непомітним (`user_book` — один рядок на книгу, не на прохід).
   * `run_number > 1` на кожному рядку результату — вже готовий сигнал "це перечитування" (ТЗ
   * §39: "small indicator: «Перечитано»"), без окремого запиту.
   *
   * Той самий `JOIN user_book ... deleted_at IS NULL` soft-delete guard, що й
   * `listStartedOrFinishedBetween` вище (та сама причина — див. коментар там).
   */
  async listFinishedBetween(db: SQLiteDatabase, startIso: string, endIso: string): Promise<ReadingRun[]> {
    const rows = await db.getAllAsync<ReadingRunRow>(
      `SELECT rr.* FROM reading_run rr
       JOIN user_book ub ON ub.id = rr.user_book_id
       WHERE rr.deleted_at IS NULL AND ub.deleted_at IS NULL
         AND rr.status IN ('finished', 'did_not_finish')
         AND rr.finished_at >= ? AND rr.finished_at < ?
       ORDER BY rr.finished_at ASC`,
      [startIso, endIso],
    );
    return rows.map(mapRow);
  },
};
