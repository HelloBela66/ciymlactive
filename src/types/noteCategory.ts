import { z } from 'zod';

/**
 * Власні категорії нотаток користувача (Milestone 11, доповнення — панель читання). На
 * відміну від п'яти вбудованих `NoteType` (`src/types/note.ts`) — жорстко зашитих у код і
 * спільних для всього застосунку — категорія тут: (1) вільний текст, який вводить сам
 * користувач ("сильна напруга", "страшний момент", "дуже мила дія"...), (2) прив'язана до
 * КОНКРЕТНОЇ книги (`userBookId`), не глобальна — той самий набір під "Гаррі Поттера" нічого
 * не каже про "Дюну". `sortOrder` — порядок появи чипів (нові додаються в кінець).
 *
 * М'яке видалення (`deletedAt`), той самий патерн, що й `note`/`quote`/`reading_session`, а
 * НЕ жорстке (на відміну від `Shelf.remove`) — навмисно: нотатки, вже позначені категорією,
 * що користувач вирішив прибрати, не повинні "осиротіти" чи мовчки зникнути. Видалена
 * категорія просто перестає пропонуватись у чипах для НОВИХ нотаток (`listActiveByUserBookId`),
 * але старі нотатки й далі показують її назву (`listAllByUserBookId`, для резолву назви).
 */
export const NoteCategorySchema = z.object({
  id: z.string(),
  userBookId: z.string(),
  label: z.string().min(1),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
});

export type NoteCategory = z.infer<typeof NoteCategorySchema>;

export const CreateNoteCategoryInputSchema = z.object({
  userBookId: z.string(),
  label: z.string().trim().min(1, 'Назва категорії обов’язкова').max(40, 'Задовга назва'),
});

export type CreateNoteCategoryInput = z.infer<typeof CreateNoteCategoryInputSchema>;

export const RenameNoteCategoryInputSchema = z.object({
  id: z.string(),
  userBookId: z.string(),
  label: z.string().trim().min(1, 'Назва категорії обов’язкова').max(40, 'Задовга назва'),
});

export type RenameNoteCategoryInput = z.infer<typeof RenameNoteCategoryInputSchema>;
