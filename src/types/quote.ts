import { z } from 'zod';

export const QuoteSchema = z.object({
  id: z.string(),
  userBookId: z.string(),
  editionId: z.string(),
  sessionId: z.string().nullable(),
  page: z.number().int().nullable(),
  text: z.string().min(1),
  comment: z.string().nullable(),
  // Milestone 11 (Мій щоденник) — додано для симетрії з `note`, щоб цитата й нотатка
  // об'єднувались в один `JournalEntry` без втрати полів (докладніше —
  // `003_journal_entry_extensions.ts`, `src/types/journalEntry.ts`).
  progressPercent: z.number().nullable(),
  tags: z.array(z.string()),
  isFavorite: z.boolean(),
  reaction: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Quote = z.infer<typeof QuoteSchema>;

export const CreateQuoteInputSchema = z.object({
  userBookId: z.string(),
  editionId: z.string(),
  sessionId: z.string().nullable().optional(),
  page: z.number().int().nullable().optional(),
  text: z.string().trim().min(1, 'Текст цитати обов’язковий'),
  comment: z.string().trim().min(1).optional(),
  progressPercent: z.number().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

export type CreateQuoteInput = z.infer<typeof CreateQuoteInputSchema>;
