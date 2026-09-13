/**
 * «До/Після» (POLYTSIA V1.6, Фаза 6) — структурована pre-reading-нотатка, ТЗ: "Зберігай як
 * structured preReadingReflection". ДО Фази 9 (REREADING MODEL) — щонайбільше один рядок на
 * книгу (`UNIQUE(user_book_id)`); з Фази 9 (`022_pre_reading_reflection_run.ts`) — щонайбільше
 * один рядок НА RUN (`UNIQUE(reading_run_id)`), тож перечитування книги отримує власну нотатку
 * "До", докладніше — `docs/BEFORE_AFTER.md`, `docs/READING_RUN.md`.
 */
export interface PreReadingReflection {
  id: string;
  userBookId: string;
  /** REREADING MODEL, Фаза 9 (`docs/READING_RUN.md`) — до якого `reading_run` (конкретного
   * прочитання) належить ця нотатка "До". `null` — книга взагалі не має жодного `reading_run`
   * (Фаза 7 `addToLibrary`, свідомо не підключена) — той самий "книжковий" фолбек, що діяв ДО
   * цієї фази. */
  readingRunId: string | null;
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
