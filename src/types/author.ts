import { z } from 'zod';

export const AuthorSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  originalName: z.string().nullable(),
  bio: z.string().nullable(),
  photoUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Author = z.infer<typeof AuthorSchema>;
