import { z } from 'zod';

/**
 * ТЗ Фази 12 (READING ACTIVITY HISTORY) — «unified read-only timeline». Список подій навмисно
 * фіксований і буквально повторює ТЗ ("reading session completed; book started; book finished;
 * book added; rating added; journal entry; quote; shelf addition, якщо це можна отримати
 * надійно") — усі вісім тут надійно виводяться з уже наявних timestamped-колонок
 * (reading_session.ended_at, user_book.started_at/finished_at/added_at, rating.created_at,
 * note.created_at, quote.created_at, shelf_book.added_at), тож жодна не випущена.
 */
export const ActivityEventTypeSchema = z.enum([
  'session_completed',
  'book_started',
  'book_finished',
  'book_added',
  'rating_added',
  'journal_entry',
  'quote',
  'shelf_addition',
]);
export type ActivityEventType = z.infer<typeof ActivityEventTypeSchema>;

/**
 * Похідна (derived) модель — НЕ окрема event-sourcing таблиця (пряма вимога ТЗ: «не створюй
 * нову event-sourcing architecture тільки заради цього»). Кожна подія читається "на льоту" з
 * уже наявної timestamped-таблиці (`ActivityHistoryRepository.listRecent`, один UNION ALL SQL
 * запит через усі джерела одразу — той самий підхід, що й `JournalRepository.listFeedPage` для
 * note+quote, лише розширений на більше джерел) — тут немає жодного власного стану, який
 * потрібно писати чи синхронізувати.
 */
export const ActivityEventSchema = z.object({
  /** Унікальний у межах усієї стрічки: справжній id рядка-джерела (session/rating/note/quote)
   * або синтетичний `${userBookId}:started`/`:finished`/`:added`/`${shelfId}:${userBookId}` для
   * подій, чиє джерело (user_book/shelf_book) не має власного рядка-на-подію. */
  id: z.string(),
  type: ActivityEventTypeSchema,
  occurredAt: z.string(),
  userBookId: z.string(),
  workId: z.string(),
  workTitle: z.string(),
  coverUrl: z.string().nullable(),
  coverFallbackColor: z.string().nullable(),
  /** Лише для `session_completed`. */
  durationSeconds: z.number().nullable(),
  /** Лише для `rating_added`. */
  ratingValue: z.number().nullable(),
  /** Лише для `journal_entry`/`quote` — повний текст запису, UI сам обрізає до кількох рядків. */
  entryText: z.string().nullable(),
  /** Лише для `shelf_addition`. */
  shelfName: z.string().nullable(),
});
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;
