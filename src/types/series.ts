import { z } from 'zod';

export const SeriesStatusSchema = z.enum(['ongoing', 'completed', 'hiatus', 'unknown']);
export type SeriesStatus = z.infer<typeof SeriesStatusSchema>;

export const SeriesSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().nullable(),
  status: SeriesStatusSchema,
  totalKnownWorks: z.number().int().nullable(),
  coverUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Series = z.infer<typeof SeriesSchema>;

export const SeriesEntryTypeSchema = z.enum([
  'main',
  'prequel',
  'sequel',
  'novella',
  'spin_off',
  'companion',
  'anthology',
  'other',
]);
export type SeriesEntryType = z.infer<typeof SeriesEntryTypeSchema>;

export const SeriesEntrySchema = z.object({
  id: z.string(),
  seriesId: z.string(),
  workId: z.string(),
  position: z.number().nullable(),
  publicationOrder: z.number().int().nullable(),
  chronologicalOrder: z.number().int().nullable(),
  recommendedOrder: z.number().int().nullable(),
  entryType: SeriesEntryTypeSchema,
});

export type SeriesEntry = z.infer<typeof SeriesEntrySchema>;

/** Мінімальний контекст серії для показу на Book Details у Milestone 1 (без повного Series Screen — той у Milestone 2). */
export interface SeriesContext {
  series: Series;
  position: number | null;
}
