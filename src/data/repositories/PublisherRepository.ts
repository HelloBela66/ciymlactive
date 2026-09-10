import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { Publisher } from '@/types/publisher';

interface PublisherRow {
  id: string;
  name: string;
  country: string | null;
  website: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: PublisherRow): Publisher {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    website: row.website,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const PublisherRepository = {
  async findByName(db: SQLiteDatabase, name: string): Promise<Publisher | null> {
    const row = await db.getFirstAsync<PublisherRow>(
      `SELECT * FROM publisher WHERE name = ? LIMIT 1`,
      [name.trim()],
    );
    return row ? mapRow(row) : null;
  },

  async findOrCreateByName(db: SQLiteDatabase, name: string): Promise<Publisher> {
    const trimmed = name.trim();
    const existing = await PublisherRepository.findByName(db, trimmed);
    if (existing) return existing;

    const id = generateId();
    const now = nowIso();
    await db.runAsync(
      `INSERT INTO publisher (id, name, country, website, created_at, updated_at) VALUES (?, ?, NULL, NULL, ?, ?)`,
      [id, trimmed, now, now],
    );
    return { id, name: trimmed, country: null, website: null, createdAt: now, updatedAt: now };
  },

  async getById(db: SQLiteDatabase, id: string): Promise<Publisher | null> {
    const row = await db.getFirstAsync<PublisherRow>(`SELECT * FROM publisher WHERE id = ?`, [id]);
    return row ? mapRow(row) : null;
  },

  /** Пакетний варіант `getById` для списків (Milestone 8, продуктивність) — один запит
   * замість одного на кожну книгу, викликається з `UserBookRepository.attachDetailsBatch`. */
  async listByIds(db: SQLiteDatabase, ids: string[]): Promise<Map<string, Publisher>> {
    const result = new Map<string, Publisher>();
    if (ids.length === 0) return result;
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.getAllAsync<PublisherRow>(`SELECT * FROM publisher WHERE id IN (${placeholders})`, ids);
    for (const row of rows) result.set(row.id, mapRow(row));
    return result;
  },
};
