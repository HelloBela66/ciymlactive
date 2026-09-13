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
};
