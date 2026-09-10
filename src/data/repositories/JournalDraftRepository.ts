import type { SQLiteDatabase } from 'expo-sqlite';
import { nowIso } from '@/lib/dateUtils';
import type { JournalDraft, SaveJournalDraftInput } from '@/types/journalDraft';

interface JournalDraftRow {
  user_book_id: string;
  session_id: string | null;
  kind: 'note' | 'quote';
  type: string | null;
  text: string;
  comment: string | null;
  page: number | null;
  updated_at: string;
}

function mapRow(row: JournalDraftRow): JournalDraft {
  return {
    userBookId: row.user_book_id,
    sessionId: row.session_id,
    kind: row.kind,
    type: row.type,
    text: row.text,
    comment: row.comment,
    page: row.page,
    updatedAt: row.updated_at,
  };
}

/**
 * Чернетка композера "швидкого додавання" (п.4 ТЗ Milestone 11) — один слот на книгу.
 * `upsert` викликається з дебаунсом на кожну зміну тексту в UI (Фаза 3), `clear` — одразу
 * після успішного `NoteRepository.create`/`QuoteRepository.create` або явної відмови від
 * запису, щоб порожня чернетка не "воскресала" наступного разу.
 */
export const JournalDraftRepository = {
  async get(db: SQLiteDatabase, userBookId: string): Promise<JournalDraft | null> {
    const row = await db.getFirstAsync<JournalDraftRow>(`SELECT * FROM journal_draft WHERE user_book_id = ?`, [
      userBookId,
    ]);
    return row ? mapRow(row) : null;
  },

  async upsert(db: SQLiteDatabase, input: SaveJournalDraftInput): Promise<JournalDraft> {
    const now = nowIso();
    await db.runAsync(
      `INSERT INTO journal_draft (user_book_id, session_id, kind, type, text, comment, page, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_book_id) DO UPDATE SET
         session_id = excluded.session_id,
         kind = excluded.kind,
         type = excluded.type,
         text = excluded.text,
         comment = excluded.comment,
         page = excluded.page,
         updated_at = excluded.updated_at`,
      [
        input.userBookId,
        input.sessionId ?? null,
        input.kind,
        input.type ?? null,
        input.text,
        input.comment ?? null,
        input.page ?? null,
        now,
      ],
    );

    return {
      userBookId: input.userBookId,
      sessionId: input.sessionId ?? null,
      kind: input.kind,
      type: input.type ?? null,
      text: input.text,
      comment: input.comment ?? null,
      page: input.page ?? null,
      updatedAt: now,
    };
  },

  async clear(db: SQLiteDatabase, userBookId: string): Promise<void> {
    await db.runAsync(`DELETE FROM journal_draft WHERE user_book_id = ?`, [userBookId]);
  },
};
