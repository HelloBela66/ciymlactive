import { z } from 'zod';
import { AuthorSchema } from './author';

export const WorkSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  originalTitle: z.string().nullable(),
  description: z.string().nullable(),
  originalLanguage: z.string().nullable(),
  firstPublishedYear: z.number().int().nullable(),
  coverFallbackColor: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Work = z.infer<typeof WorkSchema>;

/** Work разом з авторами — те, що реально показуємо в UI (пошук, book details). */
export const WorkWithAuthorsSchema = WorkSchema.extend({
  authors: z.array(AuthorSchema),
});

export type WorkWithAuthors = z.infer<typeof WorkWithAuthorsSchema>;
