import { z } from 'zod';
import { EditionFormatSchema } from './edition';

/**
 * Провайдеро-незалежна проміжна модель книги (docs/BOOK_PROVIDERS.md). І ручне введення,
 * і зовнішні провайдери (Milestone 7 — GoogleBooksProvider/ISBNdbProvider) виробляють один і
 * той самий NormalizedBookDraft — тому персистенція (createWorkAndEditionFromDraft) написана
 * рівно один раз і не зміниться, коли з'являться нові джерела.
 */
export const BookSourceTypeSchema = z.enum([
  'manual',
  'google_books',
  // 'open_library' — джерело прибране з активного пошуку в Milestone 10 fix6
  // (`docs/STATUS_V1.md`), але лишається дійсним значенням тут навмисно: книги, вже
  // збережені раніше з цим джерелом (локально чи в спільному каталозі), мають лишатись
  // валідними записами назавжди — прибрати значення зі схеми означало б, що ці старі записи
  // більше не проходять валідацію.
  'open_library',
  'isbndb',
  'isbn_scan',
  'future_ua_catalog',
  // Milestone 11 (доповнення) — власна кураторська добірка книг («Що почитати завтра?»,
  // `CuratedCatalogProvider.ts`, `supabase/schema.sql` таблиця `curated_book`).
  'curated',
]);
export type BookSourceType = z.infer<typeof BookSourceTypeSchema>;

export const NormalizedBookDraftSchema = z.object({
  title: z.string().min(1, 'Назва обов’язкова'),
  originalTitle: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  originalLanguage: z.string().trim().min(1).optional(),
  firstPublishedYear: z.number().int().min(0).max(3000).optional(),
  authors: z.array(z.string().trim().min(1)).default([]),
  isbn10: z.string().trim().min(1).optional(),
  isbn13: z.string().trim().min(1).optional(),
  publisher: z.string().trim().min(1).optional(),
  translators: z.array(z.string().trim().min(1)).default([]),
  publicationYear: z.number().int().min(0).max(3000).optional(),
  pageCount: z.number().int().positive().optional(),
  language: z.string().trim().min(1).default('uk'),
  format: EditionFormatSchema.default('paperback'),
  coverUrl: z.string().trim().min(1).optional(),
  seriesName: z.string().trim().min(1).optional(),
  seriesPosition: z.number().optional(),
  source: z.object({
    sourceType: BookSourceTypeSchema,
    sourceName: z.string(),
    sourceUrl: z.string().optional(),
    externalId: z.string().optional(),
  }),
});

export type NormalizedBookDraft = z.infer<typeof NormalizedBookDraftSchema>;
