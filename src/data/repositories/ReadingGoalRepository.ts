import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type {
  CreateReadingGoalInput,
  ReadingGoal,
  ReadingGoalProgress,
  ReadingGoalStatus,
} from '@/types/readingGoal';
import { ReadingSessionRepository } from './ReadingSessionRepository';
import { UserBookRepository } from './UserBookRepository';

interface ReadingGoalRow {
  id: string;
  type: ReadingGoal['type'];
  target: number;
  period_start: string;
  period_end: string;
  related_work_id: string | null;
  related_series_id: string | null;
  status: ReadingGoalStatus;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ReadingGoalRow): ReadingGoal {
  return {
    id: row.id,
    type: row.type,
    target: row.target,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    relatedWorkId: row.related_work_id,
    relatedSeriesId: row.related_series_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Цілі читання (розділ 30 ТЗ). На відміну від `user_book`/`note`/etc., у схемі немає
 * `deleted_at` для `reading_goal` — видалення тут завжди фізичне (`remove`), а "закрити ціль
 * без виконання" — окремий статус `abandoned` через `updateStatus`, не видалення.
 */
export const ReadingGoalRepository = {
  async create(db: SQLiteDatabase, input: CreateReadingGoalInput): Promise<ReadingGoal> {
    const id = generateId();
    const now = nowIso();

    await db.runAsync(
      `INSERT INTO reading_goal (
         id, type, target, period_start, period_end, related_work_id, related_series_id,
         status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [
        id,
        input.type,
        input.target,
        input.periodStart,
        input.periodEnd,
        input.relatedWorkId,
        input.relatedSeriesId,
        now,
        now,
      ],
    );

    return {
      id,
      type: input.type,
      target: input.target,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      relatedWorkId: input.relatedWorkId,
      relatedSeriesId: input.relatedSeriesId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
  },

  /** Усі цілі, найновіші зверху — активні й закриті разом (екран сам групує за статусом). */
  async listAll(db: SQLiteDatabase): Promise<ReadingGoal[]> {
    const rows = await db.getAllAsync<ReadingGoalRow>(`SELECT * FROM reading_goal ORDER BY created_at DESC`);
    return rows.map(mapRow);
  },

  async updateStatus(db: SQLiteDatabase, id: string, status: ReadingGoalStatus): Promise<void> {
    await db.runAsync(`UPDATE reading_goal SET status = ?, updated_at = ? WHERE id = ?`, [status, nowIso(), id]);
  },

  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`DELETE FROM reading_goal WHERE id = ?`, [id]);
  },

  /**
   * Прогрес цілі "на льоту" — не зберігається окремо, рахується з уже наявних джерел правди
   * (`reading_session`/`user_book`), щоб не дублювати дані й не тримати їх синхронізованими.
   * `finish_book`/`finish_series` поки не мають UI для створення (`relatedWorkId`/
   * `relatedSeriesId` завжди null у формі цього milestone), але прогрес порахований і для них
   * — на майбутнє, коли з'явиться picker книги/серії.
   */
  async getProgress(db: SQLiteDatabase, goal: ReadingGoal): Promise<ReadingGoalProgress> {
    if (goal.type === 'finish_book') {
      if (!goal.relatedWorkId) return { current: 0, target: 1, isComplete: false };
      // Немає прямого "user_book за work_id" запиту (user_book посилається на edition, не
      // work) — а прямого UI-шляху створити цю ціль ще немає, тож просте лінійне сканування
      // тут не варте окремого repository-методу (докладніше — примітка вище). Але для самого
      // сканування досить ЛИШЕ завершених книг (`listByStatus('finished')`), а не всієї
      // бібліотеки незалежно від статусу (`listAll`) — ціль вважається виконаною тільки коли
      // книга вже "прочитана", тож книги в інших статусах для відповіді байдужі й лише
      // роздували непотрібний запит на великих бібліотеках (Milestone 10 fix6,
      // `docs/STATUS_V1.md` п. 3.8).
      const finishedUserBooks = await UserBookRepository.listByStatus(db, 'finished');
      const isComplete = finishedUserBooks.some((ub) => ub.work.id === goal.relatedWorkId);
      return { current: isComplete ? 1 : 0, target: 1, isComplete };
    }

    if (goal.type === 'finish_series') {
      // Немає UI-шляху створити цю ціль ще (потрібен picker серії) — прогрес лишається 0,
      // готовий до підключення разом з UI пізніше.
      return { current: 0, target: goal.target, isComplete: false };
    }

    const sessions = (await ReadingSessionRepository.listAllCompleted(db)).filter(
      (s) => s.startedAt >= goal.periodStart && s.startedAt < goal.periodEnd,
    );

    if (goal.type === 'minutes') {
      const totalMinutes = sessions.reduce((sum, s) => sum + Math.round((s.durationSeconds ?? 0) / 60), 0);
      return { current: totalMinutes, target: goal.target, isComplete: totalMinutes >= goal.target };
    }

    if (goal.type === 'pages') {
      const totalPages = sessions.reduce((sum, s) => {
        const delta = s.endPage != null ? s.endPage - s.startPage : 0;
        return sum + Math.max(0, delta);
      }, 0);
      return { current: totalPages, target: goal.target, isComplete: totalPages >= goal.target };
    }

    if (goal.type === 'reading_days') {
      const dayKeys = new Set(sessions.map((s) => s.startedAt.slice(0, 10)));
      return {
        current: dayKeys.size,
        target: goal.target,
        isComplete: dayKeys.size >= goal.target,
      };
    }

    // books_per_year: книги, що завершені (`finished_at`) у межах періоду цілі — потрібні
    // лише status/finishedAt, тому `listStatusOnly` (Milestone 10 fix6, `docs/STATUS_V1.md`
    // п. 3.8), а не `listByStatus`, який довантажує повні деталі видання/твору/автора кожної
    // книги (`attachDetailsBatch`) даремно — тут вони взагалі не читаються.
    const finished = await UserBookRepository.listStatusOnly(db, 'finished');
    const count = finished.filter(
      (ub) => ub.finishedAt != null && ub.finishedAt >= goal.periodStart && ub.finishedAt < goal.periodEnd,
    ).length;
    return { current: count, target: goal.target, isComplete: count >= goal.target };
  },
};
