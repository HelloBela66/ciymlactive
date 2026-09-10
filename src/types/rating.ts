import { z } from 'zod';

/** Значення від 0.5 до 5 з кроком 0.5 (півзірки) — те саме обмеження, що й CHECK у SQLite. */
export const RatingValueSchema = z
  .number()
  .min(0.5)
  .max(5)
  .refine((value) => Number.isInteger(value * 2), 'Оцінка — з кроком 0.5');

export const RatingSchema = z.object({
  id: z.string(),
  userBookId: z.string(),
  value: RatingValueSchema,
  review: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Rating = z.infer<typeof RatingSchema>;
