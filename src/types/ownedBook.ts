import { z } from 'zod';

export const OwnedBookConditionSchema = z.enum(['new', 'good', 'worn', 'damaged']);
export type OwnedBookCondition = z.infer<typeof OwnedBookConditionSchema>;

export const OwnedBookSchema = z.object({
  id: z.string(),
  editionId: z.string(),
  condition: OwnedBookConditionSchema.nullable(),
  location: z.string().nullable(),
  purchaseDate: z.string().nullable(),
  purchasePrice: z.number().int().nullable(),
  purchaseCurrency: z.string().nullable(),
  purchasePlace: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type OwnedBook = z.infer<typeof OwnedBookSchema>;

/**
 * Мінімальна форма додавання "я маю цю книгу" на Book Details (Milestone 2). Повний
 * screen фізичної бібліотеки (список, фільтри за станом/місцем, Loans) — пізніший milestone;
 * зараз книга позначається власною без окремого списку-екрана (докладніше — CHANGELOG).
 */
export const CreateOwnedBookInputSchema = z.object({
  editionId: z.string(),
  condition: OwnedBookConditionSchema.nullable().optional(),
  location: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
});

export type CreateOwnedBookInput = z.infer<typeof CreateOwnedBookInputSchema>;
