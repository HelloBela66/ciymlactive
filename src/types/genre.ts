import { z } from 'zod';

export const GenreSchema = z.object({
  id: z.string(),
  nameUk: z.string().min(1),
  slug: z.string().min(1),
});

export type Genre = z.infer<typeof GenreSchema>;
