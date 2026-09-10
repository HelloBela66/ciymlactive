import { z } from 'zod';

export const NoteTypeSchema = z.enum(['thought', 'question', 'theory', 'general', 'moment']);
export type NoteType = z.infer<typeof NoteTypeSchema>;

export const NoteSchema = z.object({
  id: z.string(),
  userBookId: z.string(),
  sessionId: z.string().nullable(),
  page: z.number().int().nullable(),
  progressPercent: z.number().nullable(),
  type: NoteTypeSchema,
  // Milestone 11 (доповнення) — власна категорія користувача (`src/types/noteCategory.ts`),
  // коли задана. `type` лишається як є навіть тоді (`'general'` за замовчуванням) — не
  // сентинел; UI резолвить назву через `resolveEntryTypeLabel`.
  categoryId: z.string().nullable(),
  text: z.string().min(1),
  tags: z.array(z.string()),
  // Milestone 11 (Мій щоденник) — той самий патерн, що й `user_book.is_favorite`.
  isFavorite: z.boolean(),
  // POLYTSIA V1.5, Фаза 11 («ПОВЕРНУТИСЯ ПІЗНІШЕ») — той самий boolean-прапорець-патерн, що й
  // `isFavorite` вище (`011_revisit_later.ts`).
  revisitLater: z.boolean(),
  // Навмисно вільний рядок, не enum — список реакцій ще узгоджується з UI (Фаза 3+);
  // докладніше — коментар у `003_journal_entry_extensions.ts`.
  reaction: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Note = z.infer<typeof NoteSchema>;

export const CreateNoteInputSchema = z.object({
  userBookId: z.string(),
  sessionId: z.string().nullable().optional(),
  page: z.number().int().nullable().optional(),
  progressPercent: z.number().nullable().optional(),
  type: NoteTypeSchema.default('general'),
  categoryId: z.string().nullable().optional(),
  text: z.string().trim().min(1, 'Текст нотатки обов’язковий'),
  tags: z.array(z.string()).optional(),
});

export type CreateNoteInput = z.infer<typeof CreateNoteInputSchema>;
