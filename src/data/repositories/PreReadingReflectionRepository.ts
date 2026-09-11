import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { PreReadingReflection } from '@/types/preReadingReflection';

interface PreReadingReflectionRow {
  id: string;
  user_book_id: string;
  reason_text: string | null;
  expectation_text: string | null;
  expected_rating: number | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: PreReadingReflectionRow): PreReadingReflection {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    reasonText: row.reason_text,
    expectationText: row.expectation_text,
    expectedRating: row.expected_rating,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface UpsertPreReadingReflectionInput {
  userBookId: string;
  reasonText: string | null;
  expectationText: string | null;
  expectedRating: number | null;
}

/**
 * «До/Після» (POLYTSIA V1.6, Фаза 6) — щонайбільше одна на книгу (`UNIQUE(user_book_id)`,
 * той самий сенс, що й `RatingRepository`), тому `upsert` — єдиний спосіб запису.
 * `created_at` НЕ оновлюється при повторному upsert (докладніше — коментар у
 * `014_pre_reading_reflection.ts`) — лишається "миттю ДО читання".
 */
export const PreReadingReflectionRepository = {
  async getByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<PreReadingReflection | null> {
    const row = await db.getFirstAsync<PreReadingReflectionRow>(
      `SELECT * FROM pre_reading_reflection WHERE user_book_id = ?`,
      [userBookId],
    );
    return row ? mapRow(row) : null;
  },

  async upsert(db: SQLiteDatabase, params: UpsertPreReadingReflectionInput): Promise<PreReadingReflection> {
    const now = nowIso();
    const existing = await PreReadingReflectionRepository.getByUserBookId(db, params.userBookId);

    if (existing) {
      await db.runAsync(
        `UPDATE pre_reading_reflection SET reason_text = ?, expectation_text = ?, expected_rating = ?, updated_at = ? WHERE id = ?`,
        [params.reasonText, params.expectationText, params.expectedRating, now, existing.id],
      );
      return {
        ...existing,
        reasonText: params.reasonText,
        expectationText: params.expectationText,
        expectedRating: params.expectedRating,
        updatedAt: now,
      };
    }

    const id = generateId();
    await db.runAsync(
      `INSERT INTO pre_reading_reflection (id, user_book_id, reason_text, expectation_text, expected_rating, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, params.userBookId, params.reasonText, params.expectationText, params.expectedRating, now, now],
    );
    return {
      id,
      userBookId: params.userBookId,
      reasonText: params.reasonText,
      expectationText: params.expectationText,
      expectedRating: params.expectedRating,
      createdAt: now,
      updatedAt: now,
    };
  },

  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`DELETE FROM pre_reading_reflection WHERE id = ?`, [id]);
  },
};
