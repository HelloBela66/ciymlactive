import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { CreateNoteInput, Note, NoteType } from '@/types/note';

interface NoteRow {
  id: string;
  user_book_id: string;
  session_id: string | null;
  page: number | null;
  progress_percent: number | null;
  type: NoteType;
  category_id: string | null;
  text: string;
  tags: string;
  is_favorite: number;
  revisit_later: number;
  reaction: string | null;
  created_at: string;
  updated_at: string;
}

function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function mapRow(row: NoteRow): Note {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    sessionId: row.session_id,
    page: row.page,
    progressPercent: row.progress_percent,
    type: row.type,
    categoryId: row.category_id,
    text: row.text,
    tags: parseTags(row.tags),
    isFavorite: row.is_favorite === 1,
    revisitLater: row.revisit_later === 1,
    reaction: row.reaction,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Нотатки (п.21 ТЗ) — думки/питання/теорії/моменти, прив'язані до книги й опційно до
 * сторінки/сесії. Milestone 11 (Мій щоденник) додав `isFavorite`/`reaction` (той самий
 * патерн, що й `user_book.is_favorite`) і `progressPercent`/`tags` як реальні creatable
 * поля (раніше завжди вставлялись як NULL/'[]' незалежно від input).
 */
export const NoteRepository = {
  async create(db: SQLiteDatabase, input: CreateNoteInput): Promise<Note> {
    const id = generateId();
    const now = nowIso();
    const tags = input.tags ?? [];
    const progressPercent = input.progressPercent ?? null;

    const categoryId = input.categoryId ?? null;

    await db.runAsync(
      `INSERT INTO note (
         id, user_book_id, session_id, page, progress_percent, type, category_id, text, tags,
         is_favorite, revisit_later, reaction, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?)`,
      [
        id,
        input.userBookId,
        input.sessionId ?? null,
        input.page ?? null,
        progressPercent,
        input.type,
        categoryId,
        input.text,
        JSON.stringify(tags),
        now,
        now,
      ],
    );

    return {
      id,
      userBookId: input.userBookId,
      sessionId: input.sessionId ?? null,
      page: input.page ?? null,
      progressPercent,
      type: input.type,
      categoryId,
      text: input.text,
      tags,
      isFavorite: false,
      revisitLater: false,
      reaction: null,
      createdAt: now,
      updatedAt: now,
    };
  },

  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`UPDATE note SET deleted_at = ? WHERE id = ?`, [nowIso(), id]);
  },

  async listByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<Note[]> {
    const rows = await db.getAllAsync<NoteRow>(
      `SELECT * FROM note WHERE user_book_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [userBookId],
    );
    return rows.map(mapRow);
  },

  /** Той самий патерн, що й `UserBookRepository.setFavorite` — одна колонка, одне UPDATE. */
  async setFavorite(db: SQLiteDatabase, id: string, isFavorite: boolean): Promise<void> {
    await db.runAsync(`UPDATE note SET is_favorite = ?, updated_at = ? WHERE id = ?`, [
      isFavorite ? 1 : 0,
      nowIso(),
      id,
    ]);
  },

  /** `reaction` — `null` знімає реакцію. Список допустимих значень навмисно не CHECK у БД —
   * див. коментар у `003_journal_entry_extensions.ts`. */
  async setReaction(db: SQLiteDatabase, id: string, reaction: string | null): Promise<void> {
    await db.runAsync(`UPDATE note SET reaction = ?, updated_at = ? WHERE id = ?`, [reaction, nowIso(), id]);
  },

  /** ТЗ Фази 11 («ПОВЕРНУТИСЯ ПІЗНІШЕ») — той самий патерн, що й `setFavorite` вище. */
  async setRevisitLater(db: SQLiteDatabase, id: string, revisitLater: boolean): Promise<void> {
    await db.runAsync(`UPDATE note SET revisit_later = ?, updated_at = ? WHERE id = ?`, [
      revisitLater ? 1 : 0,
      nowIso(),
      id,
    ]);
  },

  /** Лише кількість (ТЗ Фази 15, READING FINGERPRINT — бейдж «Любить робити нотатки»,
   * `src/lib/readingFingerprint.ts`) — `COUNT(*)`, не повний `SELECT *`/`.length`, бо бейджу
   * не потрібен жоден рядок цілком. На відміну від `BackupRepository.approximateCounts`
   * (рахує УСІ рядки, включно з м'яко видаленими — навмисно, для "Стан копіювання"), тут
   * `deleted_at IS NULL`: бейдж описує РЕАЛЬНУ активну поведінку користувача, а не розмір
   * файлу бекапу. */
  async countAll(db: SQLiteDatabase): Promise<number> {
    const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM note WHERE deleted_at IS NULL`);
    return row?.count ?? 0;
  },
};
