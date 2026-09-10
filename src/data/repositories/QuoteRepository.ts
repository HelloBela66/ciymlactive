import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { CreateQuoteInput, Quote } from '@/types/quote';

interface QuoteRow {
  id: string;
  user_book_id: string;
  edition_id: string;
  session_id: string | null;
  page: number | null;
  text: string;
  comment: string | null;
  progress_percent: number | null;
  tags: string;
  is_favorite: number;
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

function mapRow(row: QuoteRow): Quote {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    editionId: row.edition_id,
    sessionId: row.session_id,
    page: row.page,
    text: row.text,
    comment: row.comment,
    progressPercent: row.progress_percent,
    tags: parseTags(row.tags),
    isFavorite: row.is_favorite === 1,
    reaction: row.reaction,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Цитати (п.22 ТЗ) — текст із книги, опційно з власним коментарем і сторінкою. Milestone 11
 * (Мій щоденник) додав `progressPercent`/`tags`/`isFavorite`/`reaction` — ті самі поля, що й
 * у `note`, щоб `JournalRepository` могла об'єднати обидві таблиці в один `JournalEntry`.
 */
export const QuoteRepository = {
  async create(db: SQLiteDatabase, input: CreateQuoteInput): Promise<Quote> {
    const id = generateId();
    const now = nowIso();
    const tags = input.tags ?? [];
    const progressPercent = input.progressPercent ?? null;

    await db.runAsync(
      `INSERT INTO quote (
         id, user_book_id, edition_id, session_id, page, text, comment,
         progress_percent, tags, is_favorite, reaction, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
      [
        id,
        input.userBookId,
        input.editionId,
        input.sessionId ?? null,
        input.page ?? null,
        input.text,
        input.comment ?? null,
        progressPercent,
        JSON.stringify(tags),
        now,
        now,
      ],
    );

    return {
      id,
      userBookId: input.userBookId,
      editionId: input.editionId,
      sessionId: input.sessionId ?? null,
      page: input.page ?? null,
      text: input.text,
      comment: input.comment ?? null,
      progressPercent,
      tags,
      isFavorite: false,
      reaction: null,
      createdAt: now,
      updatedAt: now,
    };
  },

  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`UPDATE quote SET deleted_at = ? WHERE id = ?`, [nowIso(), id]);
  },

  async listByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<Quote[]> {
    const rows = await db.getAllAsync<QuoteRow>(
      `SELECT * FROM quote WHERE user_book_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [userBookId],
    );
    return rows.map(mapRow);
  },

  async setFavorite(db: SQLiteDatabase, id: string, isFavorite: boolean): Promise<void> {
    await db.runAsync(`UPDATE quote SET is_favorite = ?, updated_at = ? WHERE id = ?`, [
      isFavorite ? 1 : 0,
      nowIso(),
      id,
    ]);
  },

  async setReaction(db: SQLiteDatabase, id: string, reaction: string | null): Promise<void> {
    await db.runAsync(`UPDATE quote SET reaction = ?, updated_at = ? WHERE id = ?`, [reaction, nowIso(), id]);
  },
};
