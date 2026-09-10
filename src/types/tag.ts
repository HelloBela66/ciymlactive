import { z } from 'zod';

export const TagSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  color: z.string().nullable(),
  createdAt: z.string(),
});

export type Tag = z.infer<typeof TagSchema>;
