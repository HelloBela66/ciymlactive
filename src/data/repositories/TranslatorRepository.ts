import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { Translator } from '@/types/translator';

interface TranslatorRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: TranslatorRow): Translator {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

export const TranslatorRepository = {
  async findByName(db: SQLiteDatabase, name: string): Promise<Translator | null> {
    const row = await db.getFirstAsync<TranslatorRow>(
      `SELECT * FROM translator WHERE name = ? LIMIT 1`,
      [name.trim()],
    );
    return row ? mapRow(row) : null;
  },

  async findOrCreateByName(db: SQLiteDatabase, name: string): Promise<Translator> {
    const trimmed = name.trim();
    const existing = await TranslatorRepository.findByName(db, trimmed);
    if (existing) return existing;

    const id = generateId();
    const now = nowIso();
    await db.runAsync(`INSERT INTO translator (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`, [
      id,
      trimmed,
      now,
      now,
    ]);
    return { id, name: trimmed, createdAt: now, updatedAt: now };
  },

  async listByEditionId(db: SQLiteDatabase, editionId: string): Promise<Translator[]> {
    const rows = await db.getAllAsync<TranslatorRow>(
      `SELECT t.* FROM translator t
       JOIN edition_translator et ON et.translator_id = t.id
       WHERE et.edition_id = ?
       ORDER BY t.name ASC`,
      [editionId],
    );
    return rows.map(mapRow);
  },

  /** Пакетний варіант `listByEditionId` для списків (Milestone 8, продуктивність) — один
   * запит замість одного на кожне видання, викликається з `UserBookRepository.attachDetailsBatch`. */
  async listByEditionIds(db: SQLiteDatabase, editionIds: string[]): Promise<Map<string, Translator[]>> {
    const result = new Map<string, Translator[]>();
    if (editionIds.length === 0) return result;
    const placeholders = editionIds.map(() => '?').join(',');
    const rows = await db.getAllAsync<TranslatorRow & { edition_id: string }>(
      `SELECT t.*, et.edition_id as edition_id FROM translator t
       JOIN edition_translator et ON et.translator_id = t.id
       WHERE et.edition_id IN (${placeholders})
       ORDER BY t.name ASC`,
      editionIds,
    );
    for (const row of rows) {
      const list = result.get(row.edition_id) ?? [];
      list.push(mapRow(row));
      result.set(row.edition_id, list);
    }
    return result;
  },

  async linkToEdition(db: SQLiteDatabase, editionId: string, translatorId: string): Promise<void> {
    await db.runAsync(
      `INSERT OR IGNORE INTO edition_translator (edition_id, translator_id) VALUES (?, ?)`,
      [editionId, translatorId],
    );
  },
};
