import { z } from 'zod';
import type { JournalEntryKind } from './journalEntry';

/**
 * Чернетка незбереженого запису щоденника (авто-збереження — п.4 ТЗ Milestone 11).
 * Один активний слот на книгу (`journal_draft.user_book_id` — PRIMARY KEY), зберігається в
 * SQLite (а не в пам'яті/Zustand), щоб пережити закриття застосунку чи бекграунд —
 * докладніше `003_journal_entry_extensions.ts`. НЕ входить у бекап (`BackupRepository.ts`,
 * `BACKUP_TABLE_ORDER`) — це лише локальний незбережений стан пристрою.
 */
export const SaveJournalDraftInputSchema = z.object({
  userBookId: z.string(),
  sessionId: z.string().nullable().optional(),
  kind: z.enum(['note', 'quote']),
  type: z.string().nullable().optional(),
  text: z.string(),
  comment: z.string().nullable().optional(),
  page: z.number().int().nullable().optional(),
});

export type SaveJournalDraftInput = z.infer<typeof SaveJournalDraftInputSchema>;

export interface JournalDraft {
  userBookId: string;
  sessionId: string | null;
  kind: JournalEntryKind;
  type: string | null;
  text: string;
  comment: string | null;
  page: number | null;
  updatedAt: string;
}
