import { z } from 'zod';

export const ReadingGoalTypeSchema = z.enum([
  'books_per_year',
  'pages',
  'minutes',
  'reading_days',
  'finish_book',
  'finish_series',
]);
export type ReadingGoalType = z.infer<typeof ReadingGoalTypeSchema>;

export const ReadingGoalStatusSchema = z.enum(['active', 'completed', 'abandoned']);
export type ReadingGoalStatus = z.infer<typeof ReadingGoalStatusSchema>;

export const ReadingGoalSchema = z.object({
  id: z.string(),
  type: ReadingGoalTypeSchema,
  target: z.number().int().positive(),
  periodStart: z.string(),
  periodEnd: z.string(),
  relatedWorkId: z.string().nullable(),
  relatedSeriesId: z.string().nullable(),
  status: ReadingGoalStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ReadingGoal = z.infer<typeof ReadingGoalSchema>;

/** Вхід форми створення цілі (Milestone 5). `relatedWorkId`/`relatedSeriesId` — лише для
 * finish_book/finish_series; для інших типів завжди null. */
export const CreateReadingGoalInputSchema = z.object({
  type: ReadingGoalTypeSchema,
  target: z.number().int().positive(),
  periodStart: z.string(),
  periodEnd: z.string(),
  relatedWorkId: z.string().nullable().default(null),
  relatedSeriesId: z.string().nullable().default(null),
});

export type CreateReadingGoalInput = z.infer<typeof CreateReadingGoalInputSchema>;

/** Обчислений прогрес цілі (не зберігається — рахується "на льоту" з сесій/бібліотеки). */
export interface ReadingGoalProgress {
  current: number;
  target: number;
  isComplete: boolean;
}
