/**
 * «До/Після» (POLYTSIA V1.6, Фаза 6) — структурована pre-reading-нотатка, ТЗ: "Зберігай як
 * structured preReadingReflection". Щонайбільше один рядок на книгу (`014_pre_reading_reflection.ts`,
 * `UNIQUE(user_book_id)`), докладніше — `docs/BEFORE_AFTER.md`.
 */
export interface PreReadingReflection {
  id: string;
  userBookId: string;
  /** «Чому хочеш прочитати цю книгу?» — `null`, коли не заповнено (той самий підхід, що й
   * `BookCapsule.lastingThought`). */
  reasonText: string | null;
  /** «Чого очікуєш? Який настрій/очікування?» — `null`, коли не заповнено. */
  expectationText: string | null;
  /** Очікувана оцінка (крок 0.5, 0.5-5, той самий CHECK, що й `Rating.value`) — необов'язкова,
   * на відміну від фактичної оцінки. */
  expectedRating: number | null;
  createdAt: string;
  updatedAt: string;
}
