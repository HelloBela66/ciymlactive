import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { CapsuleRecall, CreateCapsuleRecallInput } from '@/types/capsuleRecall';

interface CapsuleRecallRow {
  id: string;
  book_capsule_id: string;
  current_memory_text: string | null;
  recalled_at: string;
  created_at: string;
}

function mapRow(row: CapsuleRecallRow): CapsuleRecall {
  return {
    id: row.id,
    bookCapsuleId: row.book_capsule_id,
    currentMemoryText: row.current_memory_text,
    recalledAt: row.recalled_at,
    createdAt: row.created_at,
  };
}

/**
 * Історія "спроб згадати" капсулу (POLYTSIA V1.6, Фаза 5, `docs/RECALL.md`) — на відміну від
 * `BookCapsuleRepository`, тут немає `update`/`remove`: кожна спроба лишається назавжди, не
 * редагується (той самий "append-only історія" підхід, що й `reading_session`).
 */
export const CapsuleRecallRepository = {
  async create(db: SQLiteDatabase, params: CreateCapsuleRecallInput): Promise<CapsuleRecall> {
    const id = generateId();
    const now = nowIso();

    await db.runAsync(
      `INSERT INTO capsule_recall (id, book_capsule_id, current_memory_text, recalled_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, params.bookCapsuleId, params.currentMemoryText, now, now],
    );

    return {
      id,
      bookCapsuleId: params.bookCapsuleId,
      currentMemoryText: params.currentMemoryText,
      recalledAt: now,
      createdAt: now,
    };
  },

  /** Найновіша спроба перша — поки що не використовується UI цієї фази (єдиний екран Recall
   * лише СТВОРЮЄ новий запис, не показує минулі), але потрібен вже зараз для
   * repository-тестів і майбутнього UI історії recall-спроб. */
  async listByBookCapsuleId(db: SQLiteDatabase, bookCapsuleId: string): Promise<CapsuleRecall[]> {
    const rows = await db.getAllAsync<CapsuleRecallRow>(
      `SELECT * FROM capsule_recall WHERE book_capsule_id = ? ORDER BY created_at DESC`,
      [bookCapsuleId],
    );
    return rows.map(mapRow);
  },
};
