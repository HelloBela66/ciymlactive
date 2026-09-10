export interface TbrBookInput {
  id: string;
  title: string;
  pageCount: number | null;
}

const MINUTES_PER_DAY_OPTIONS = [15, 30, 60] as const;
export type TbrMinutesPerDay = (typeof MINUTES_PER_DAY_OPTIONS)[number];

export interface TbrEstimate {
  totalPages: number;
  /** Книги без відомої кількості сторінок — виключені з `totalPages`, повертаються окремо,
   * щоб UI міг чесно показати "і ще N книг без відомого обсягу" замість тихо їх ігнорувати. */
  booksWithoutPageCount: TbrBookInput[];
  estimatedDaysByMinutesPerDay: Record<TbrMinutesPerDay, number>;
}

/**
 * TBR reality check (розділ 30 ТЗ, `docs/TESTING.md`: "оцінка часу на TBR за 15/30/60 хв на
 * день, книги без pageCount виключені з precise-суми й повертаються окремим списком").
 * `pagesPerMinute` — темп читання користувача (з `readingPace.ts` чи розумне значення за
 * замовчуванням, коли історії ще немає — обирає виклик, не ця чиста функція).
 */
export function estimateTbr(books: TbrBookInput[], pagesPerMinute: number): TbrEstimate {
  const withPageCount = books.filter((b): b is TbrBookInput & { pageCount: number } => (b.pageCount ?? 0) > 0);
  const booksWithoutPageCount = books.filter((b) => !((b.pageCount ?? 0) > 0));
  const totalPages = withPageCount.reduce((sum, b) => sum + b.pageCount, 0);
  const totalMinutes = pagesPerMinute > 0 ? totalPages / pagesPerMinute : 0;

  const estimatedDaysByMinutesPerDay = Object.fromEntries(
    MINUTES_PER_DAY_OPTIONS.map((minutes) => [minutes, totalMinutes > 0 ? Math.ceil(totalMinutes / minutes) : 0]),
  ) as Record<TbrMinutesPerDay, number>;

  return { totalPages, booksWithoutPageCount, estimatedDaysByMinutesPerDay };
}
