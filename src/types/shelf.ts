import { z } from 'zod';

/**
 * Тематичне оформлення полиці (Milestone 11, доповнення8 — пряме прохання власника продукту:
 * "полички під сезон осені, зими, дарк роман, фентезі..."; доповнення13 — власник продукту
 * надіслав референс із 10 повністю ілюстрованими зображеннями полиць і попросив ЗАМІНИТИ ними
 * попередню векторну/кольорову систему повністю — рівно ці 10, не більше й не менше). Простий
 * рядковий union, той самий стиль, що й `MemoryCardTemplateId` (`src/types/bookMemory.ts`) —
 * сам вигляд кожної теми (картинка) окремо в `src/design/shelfThemes.ts`, підписи для UI —
 * окремо в `src/design/i18n-labels.ts` (`shelfThemeLabels`). `'classic'` — нейтральний вигляд і
 * default для вже існуючих полиць (`009_shelf_theme.ts`) та нових, якщо користувач не обрав тему
 * при створенні.
 *
 * Доповнення13 ЗАМІНИЛО попередній набір (`mystery`, `historical`, `drama`, `comedy` — усі
 * прибрані, власник продукту явно сказав "Історія, Драма і Комедія не потрібні") новими
 * значеннями `summer`, `spring`, `thriller_horror`, `detective` (перейменований і трохи
 * розширений колишній `mystery`). Оскільки `Shelf.theme` у БД — вільний `TEXT` без CHECK (див.
 * коментар біля `ShelfSchema.theme` нижче), полиці, створені ДО цієї зміни зі старим значенням,
 * не потребують міграції — `normalizeShelfThemeId` (`src/design/shelfThemes.ts`) розпізнає й
 * старі, і нові, і будь-що нерозпізнане, тож жодна вже збережена полиця користувача не "зламається".
 */
export type ShelfThemeId =
  | 'classic'
  | 'dark_romance'
  | 'romance'
  | 'autumn'
  | 'winter'
  | 'summer'
  | 'spring'
  | 'thriller_horror'
  | 'fantasy'
  | 'detective';

export const ShelfSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().nullable(),
  // `z.string()`, НЕ `z.enum(...)` — той самий свідомий вибір, що й `note.reaction`/
  // `quote.reaction` (`src/types/note.ts`, `src/types/quote.ts`): список тем реалістично
  // поповнюватиметься, а звужувати тип тут до `ShelfThemeId` довелось би або costly
  // перетином (`Omit<..., 'theme'> & { theme: ShelfThemeId }`), або дублюванням усієї схеми.
  // Список валідних значень фіксує лише TypeScript-тип `ShelfThemeId` вище — читачі цього
  // поля (`ShelfCard`, `src/design/shelfThemes.ts`) трактують будь-яке нерозпізнане значення
  // як `'classic'`, а не падають, тож БД з майбутньою темою, ще не відомою поточній версії
  // застосунку, теж лишається безпечною.
  theme: z.string(),
  isSystem: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Shelf = z.infer<typeof ShelfSchema>;

export const ShelfBookSchema = z.object({
  shelfId: z.string(),
  userBookId: z.string(),
  addedAt: z.string(),
});

export type ShelfBook = z.infer<typeof ShelfBookSchema>;

/** Полиця разом з кількістю книг на ній — для списку полиць у Бібліотеці. */
export interface ShelfWithCount extends Shelf {
  bookCount: number;
}
