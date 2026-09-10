import { z } from 'zod';

export const PublisherSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  country: z.string().nullable(),
  website: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Publisher = z.infer<typeof PublisherSchema>;
