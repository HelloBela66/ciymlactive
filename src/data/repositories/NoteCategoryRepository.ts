import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { NoteCategory } from '@/types/noteCategory';

interface NoteCategoryRow {
  id: string;
  user_book_id: string;
  label: string;
  sort_order: number;
  created_at: string;
  deleted_at: string | null;
}

function mapRow(row: NoteCategoryRow): NoteCategory {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    label: row.label,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * Власні категорії нотаток користувача, під конкретну книгу (Milestone 11, доповнення —
 * докладніше `src/types/noteCategory.ts`, `008_note_category.ts`). `sortOrder` — той самий
 * `MAX(sort_order)+1`-патерн, що й `ShelfRepository.create`, але порядок рахується ЛИШЕ серед
 * категорій ТІЄЇ Ж книги (`WHERE user_book_id = ?`), а не глобально.
 */
export const NoteCategoryRepository = {
  async create(db: SQLiteDatabase, userBookId: string, label: string): Promise<NoteCategory> {
    const id = generateId();
    const now = nowIso();
    const trimmed = label.trim();

    const row = await db.getFirstAsync<{ maxOrder: number | null }>(
      `SELECT MAX(sort_order) as maxOrder FROM note_category WHERE user_book_id = ?`,
      [userBookId],
    );
    const sortOrder = (row?.maxOrder ?? -1) + 1;

    await db.runAsync(
      `INSERT INTO note_category (id, user_book_id, label, sort_order, created_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [id, userBookId, trimmed, sortOrder, now],
    );

    return { id, userBookId, label: trimmed, sortOrder, createdAt: now, deletedAt: null };
  },

  async rename(db: SQLiteDatabase, id: string, label: string): Promise<void> {
    await db.runAsync(`UPDATE note_category SET label = ? WHERE id = ?`, [label.trim(), id]);
  },

  /** М'яке видалення — докладніше про причину коментар у `008_note_category.ts`: старі
   * нотатки із цією категорією й далі показують її назву (`listAllByUserBookId`), лише сама
   * категорія зникає з чипів для нових нотаток (`listActiveByUserBookId`). */
  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`UPDATE note_category SET deleted_at = ? WHERE id = ?`, [nowIso(), id]);
  },

  /** Для чипів вибору категорії при створенні нової нотатки — лише активні, за порядком
   * додавання. */
  async listActiveByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<NoteCategory[]> {
    const rows = await db.getAllAsync<NoteCategoryRow>(
      `SELECT * FROM note_category WHERE user_book_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC`,
      [userBookId],
    );
    return rows.map(mapRow);
  },

  /** Для резолву назви категорії на вже існуючих нотатках (`resolveEntryTypeLabel`) —
   * включно з м'яко видаленими, щоб стара нотатка й далі показувала правильну назву. */
  async listAllByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<NoteCategory[]> {
    const rows = await db.getAllAsync<NoteCategoryRow>(
      `SELECT * FROM note_category WHERE user_book_id = ? ORDER BY sort_order ASC`,
      [userBookId],
    );
    return rows.map(mapRow);
  },
};
