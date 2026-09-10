import { z } from 'zod';
import { PublisherSchema } from './publisher';
import { TranslatorSchema } from './translator';

export const EditionFormatSchema = z.enum(['hardcover', 'paperback', 'ebook', 'audiobook', 'other']);
export type EditionFormatValue = z.infer<typeof EditionFormatSchema>;

export const EditionSchema = z.object({
  id: z.string(),
  workId: z.string(),
  title: z.string().min(1),
  subtitle: z.string().nullable(),
  isbn10: z.string().nullable(),
  isbn13: z.string().nullable(),
  language: z.string(),
  publisherId: z.string().nullable(),
  publicationDate: z.string().nullable(),
  publicationYear: z.number().int().nullable(),
  pageCount: z.number().int().nullable(),
  format: EditionFormatSchema,
  coverUrl: z.string().nullable(),
  descriptionOverride: z.string().nullable(),
  sourceId: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Edition = z.infer<typeof EditionSchema>;

/** Edition разом з видавництвом і перекладачами — для екрана книги. */
export const EditionWithRelationsSchema = EditionSchema.extend({
  publisher: PublisherSchema.nullable(),
  translators: z.array(TranslatorSchema),
});

export type EditionWithRelations = z.infer<typeof EditionWithRelationsSchema>;
