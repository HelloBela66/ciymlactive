import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { BookSourceType } from '@/types/bookDraft';

/** Provenance-запис для імпортованих/введених метаданих (docs/DATABASE.md, п.19 ТЗ). */
export const BookSourceRepository = {
  async create(
    db: SQLiteDatabase,
    params: { sourceType: BookSourceType; sourceName: string; sourceUrl?: string; externalId?: string },
  ): Promise<string> {
    const id = generateId();
    await db.runAsync(
      `INSERT INTO book_source (id, source_type, source_name, source_url, external_id, retrieved_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, params.sourceType, params.sourceName, params.sourceUrl ?? null, params.externalId ?? null, nowIso()],
    );
    return id;
  },
};
