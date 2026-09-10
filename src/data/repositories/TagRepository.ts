import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { Tag } from '@/types/tag';

interface TagRow {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

function mapRow(row: TagRow): Tag {
  return { id: row.id, name: row.name, color: row.color, createdAt: row.created_at };
}

/**
 * Теги (Milestone 9) — вільна, користувацька альтернатива жанрам: без куратованого списку,
 * без кольору в UI (`color` — поле в схемі з Milestone 0, навмисно не використовується:
 * `docs/ARCHITECTURE.md` розділ 6 — спокійна, нейтральна палітра, рій кольорових плашок
 * конфліктував би з цим принципом; лишено `null` як заготовку на майбутнє). Прив'язка через
 * `tagged_item` — полiморфна (work/edition/user_book у схемі), але тут використовується
 * лише для `work` (той самий рівень, що й жанр, `docs/DATABASE.md`: "Work/Edition *---* Tag").
 */
export const TagRepository = {
  async findOrCreateByName(db: SQLiteDatabase, name: string): Promise<Tag> {
    const trimmed = name.trim();
    const existing = await db.getFirstAsync<TagRow>(`SELECT * FROM tag WHERE name = ?`, [trimmed]);
    if (existing) return mapRow(existing);

    const id = generateId();
    const now = nowIso();
    await db.runAsync(`INSERT INTO tag (id, name, color, created_at) VALUES (?, ?, NULL, ?)`, [id, trimmed, now]);
    return { id, name: trimmed, color: null, createdAt: now };
  },

  async listByWorkId(db: SQLiteDatabase, workId: string): Promise<Tag[]> {
    const rows = await db.getAllAsync<TagRow>(
      `SELECT t.* FROM tag t
       JOIN tagged_item ti ON ti.tag_id = t.id
       WHERE ti.entity_type = 'work' AND ti.entity_id = ?
       ORDER BY t.name ASC`,
      [workId],
    );
    return rows.map(mapRow);
  },

  async addToWork(db: SQLiteDatabase, workId: string, tagId: string): Promise<void> {
    await db.runAsync(
      `INSERT OR IGNORE INTO tagged_item (tag_id, entity_type, entity_id) VALUES (?, 'work', ?)`,
      [tagId, workId],
    );
  },

  async removeFromWork(db: SQLiteDatabase, workId: string, tagId: string): Promise<void> {
    await db.runAsync(`DELETE FROM tagged_item WHERE tag_id = ? AND entity_type = 'work' AND entity_id = ?`, [
      tagId,
      workId,
    ]);
  },
};
