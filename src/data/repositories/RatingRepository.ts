import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { Rating } from '@/types/rating';

interface RatingRow {
  id: string;
  user_book_id: string;
  value: number;
  review: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: RatingRow): Rating {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    value: row.value,
    review: row.review,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Оцінка (п.23 ТЗ) — щонайбільше одна на книгу (`UNIQUE(user_book_id)`), тому upsert. */
export const RatingRepository = {
  async getByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<Rating | null> {
    const row = await db.getFirstAsync<RatingRow>(`SELECT * FROM rating WHERE user_book_id = ?`, [userBookId]);
    return row ? mapRow(row) : null;
  },

  /** Пакетний варіант `getByUserBookId` для списків (Milestone 8, продуктивність) — один
   * запит замість одного на кожну книгу (`useWrappedYear`, пошук найкраще оціненої книги
   * року). */
  async listByUserBookIds(db: SQLiteDatabase, userBookIds: string[]): Promise<Map<string, Rating>> {
    const result = new Map<string, Rating>();
    if (userBookIds.length === 0) return result;
    const placeholders = userBookIds.map(() => '?').join(',');
    const rows = await db.getAllAsync<RatingRow>(
      `SELECT * FROM rating WHERE user_book_id IN (${placeholders})`,
      userBookIds,
    );
    for (const row of rows) result.set(row.user_book_id, mapRow(row));
    return result;
  },

  async upsert(db: SQLiteDatabase, params: { userBookId: string; value: number; review?: string | null }): Promise<Rating> {
    const now = nowIso();
    const existing = await RatingRepository.getByUserBookId(db, params.userBookId);

    if (existing) {
      await db.runAsync(`UPDATE rating SET value = ?, review = ?, updated_at = ? WHERE id = ?`, [
        params.value,
        params.review ?? null,
        now,
        existing.id,
      ]);
      return { ...existing, value: params.value, review: params.review ?? null, updatedAt: now };
    }

    const id = generateId();
    await db.runAsync(
      `INSERT INTO rating (id, user_book_id, value, review, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, params.userBookId, params.value, params.review ?? null, now, now],
    );
    return { id, userBookId: params.userBookId, value: params.value, review: params.review ?? null, createdAt: now, updatedAt: now };
  },

  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`DELETE FROM rating WHERE id = ?`, [id]);
  },
};
