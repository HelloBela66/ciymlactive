import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { ReadingProgress } from '@/types/readingProgress';

interface ReadingProgressRow {
  id: string;
  user_book_id: string;
  session_id: string | null;
  page: number;
  recorded_at: string;
  source: 'session' | 'manual';
  created_at: string;
}

function mapRow(row: ReadingProgressRow): ReadingProgress {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    sessionId: row.session_id,
    page: row.page,
    recordedAt: row.recorded_at,
    source: row.source,
    createdAt: row.created_at,
  };
}

/**
 * Незмінний журнал прогресу (docs/DATABASE.md: "статистика/графіки читають лише
 * reading_progress + reading_session, ніколи не єдиний user_book.current_page"). Кожен запис
 * лишається назавжди — навіть якщо пізніше сторінка "відкочується" (перечитування розділу),
 * це новий запис, а не редагування старого.
 */
export const ReadingProgressRepository = {
  async recordForSession(
    db: SQLiteDatabase,
    params: { userBookId: string; sessionId: string; page: number },
  ): Promise<void> {
    await db.runAsync(
      `INSERT INTO reading_progress (id, user_book_id, session_id, page, recorded_at, source, created_at)
       VALUES (?, ?, ?, ?, ?, 'session', ?)`,
      [generateId(), params.userBookId, params.sessionId, params.page, nowIso(), nowIso()],
    );
  },

  async recordManual(db: SQLiteDatabase, params: { userBookId: string; page: number }): Promise<void> {
    await db.runAsync(
      `INSERT INTO reading_progress (id, user_book_id, session_id, page, recorded_at, source, created_at)
       VALUES (?, ?, NULL, ?, ?, 'manual', ?)`,
      [generateId(), params.userBookId, params.page, nowIso(), nowIso()],
    );
  },

  async listByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<ReadingProgress[]> {
    const rows = await db.getAllAsync<ReadingProgressRow>(
      `SELECT * FROM reading_progress WHERE user_book_id = ? ORDER BY recorded_at ASC`,
      [userBookId],
    );
    return rows.map(mapRow);
  },
};
