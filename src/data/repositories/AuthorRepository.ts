import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { Author } from '@/types/author';

interface AuthorRow {
  id: string;
  name: string;
  original_name: string | null;
  bio: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: AuthorRow): Author {
  return {
    id: row.id,
    name: row.name,
    originalName: row.original_name,
    bio: row.bio,
    photoUrl: row.photo_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Автори — довідникова сутність без власного екрана редагування в Milestone 1. Єдина
 * операція, яка реально потрібна зараз: "знайти автора за іменем, а якщо немає — створити".
 * Порівняння за іменем робимо через TRIM+точний збіг (без урахування регістру для ASCII;
 * кирилиця в SQLite LIKE/NOCASE не фолдиться без ICU-розширення — прийнятне обмеження для
 * одного користувача, детально не вирішуємо в Milestone 1).
 */
export const AuthorRepository = {
  async findByName(db: SQLiteDatabase, name: string): Promise<Author | null> {
    const row = await db.getFirstAsync<AuthorRow>(
      `SELECT * FROM author WHERE name = ? LIMIT 1`,
      [name.trim()],
    );
    return row ? mapRow(row) : null;
  },

  async findOrCreateByName(db: SQLiteDatabase, name: string): Promise<Author> {
    const trimmed = name.trim();
    const existing = await AuthorRepository.findByName(db, trimmed);
    if (existing) return existing;

    const id = generateId();
    const now = nowIso();
    await db.runAsync(
      `INSERT INTO author (id, name, original_name, bio, photo_url, created_at, updated_at)
       VALUES (?, ?, NULL, NULL, NULL, ?, ?)`,
      [id, trimmed, now, now],
    );
    return { id, name: trimmed, originalName: null, bio: null, photoUrl: null, createdAt: now, updatedAt: now };
  },

  async listByWorkId(db: SQLiteDatabase, workId: string): Promise<Author[]> {
    const rows = await db.getAllAsync<AuthorRow>(
      `SELECT a.* FROM author a
       JOIN work_author wa ON wa.author_id = a.id
       WHERE wa.work_id = ?
       ORDER BY a.name ASC`,
      [workId],
    );
    return rows.map(mapRow);
  },

  async listByWorkIds(db: SQLiteDatabase, workIds: string[]): Promise<Map<string, Author[]>> {
    const result = new Map<string, Author[]>();
    if (workIds.length === 0) return result;

    const placeholders = workIds.map(() => '?').join(',');
    const rows = await db.getAllAsync<AuthorRow & { work_id: string }>(
      `SELECT a.*, wa.work_id as work_id FROM author a
       JOIN work_author wa ON wa.author_id = a.id
       WHERE wa.work_id IN (${placeholders})
       ORDER BY a.name ASC`,
      workIds,
    );
    for (const row of rows) {
      const list = result.get(row.work_id) ?? [];
      list.push(mapRow(row));
      result.set(row.work_id, list);
    }
    return result;
  },

  async linkToWork(db: SQLiteDatabase, workId: string, authorId: string): Promise<void> {
    await db.runAsync(
      `INSERT OR IGNORE INTO work_author (work_id, author_id, role) VALUES (?, ?, 'author')`,
      [workId, authorId],
    );
  },
};
