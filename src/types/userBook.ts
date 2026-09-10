import { z } from 'zod';
import { EditionWithRelationsSchema } from './edition';
import { WorkWithAuthorsSchema } from './work';

export const UserBookStatusSchema = z.enum([
  'want_to_read',
  'reading',
  'finished',
  'paused',
  'did_not_finish',
  'rereading',
]);
export type UserBookStatus = z.infer<typeof UserBookStatusSchema>;

export const UserBookSchema = z.object({
  id: z.string(),
  editionId: z.string(),
  status: UserBookStatusSchema,
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  currentPage: z.number().int(),
  isFavorite: z.boolean(),
  addedAt: z.string(),
  updatedAt: z.string(),
});

export type UserBook = z.infer<typeof UserBookSchema>;

/**
 * UserBook разом з Edition (+ Publisher/Translators) і Work (+ Authors) — те, що реально
 * показуємо в Бібліотеці/Book Details. reading_session/reading_progress/note/quote/rating
 * навмисно НЕ тут — вони з'являються в Milestone 3+ і читаються окремо, коли потрібні
 * (докладніше — docs/DATABASE.md, "чому current_page на user_book — лише кеш").
 */
export const UserBookWithDetailsSchema = UserBookSchema.extend({
  edition: EditionWithRelationsSchema,
  work: WorkWithAuthorsSchema,
});

export type UserBookWithDetails = z.infer<typeof UserBookWithDetailsSchema>;
