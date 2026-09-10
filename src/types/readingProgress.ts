import { z } from 'zod';

export const ReadingProgressSourceSchema = z.enum(['session', 'manual']);
export type ReadingProgressSource = z.infer<typeof ReadingProgressSourceSchema>;

export const ReadingProgressSchema = z.object({
  id: z.string(),
  userBookId: z.string(),
  sessionId: z.string().nullable(),
  page: z.number().int(),
  recordedAt: z.string(),
  source: ReadingProgressSourceSchema,
  createdAt: z.string(),
});

export type ReadingProgress = z.infer<typeof ReadingProgressSchema>;
