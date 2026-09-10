import { z } from 'zod';

export const TranslatorSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Translator = z.infer<typeof TranslatorSchema>;
