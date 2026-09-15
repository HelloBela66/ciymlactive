import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { ReadingRunRepository } from '@/data/repositories/ReadingRunRepository';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { RatingRepository } from '@/data/repositories/RatingRepository';
import { GenreRepository } from '@/data/repositories/GenreRepository';
import { queryKeys } from '@/lib/queryKeys';
import { computeStreaks } from '@/lib/streaks';
import { computeBusiestMonth, computeTopGenreAmong } from '@/lib/readingAggregates';
import { yearRangeOf } from '@/lib/readingCalendar';
import { computeReadingPeriodSummary, type ReadingPeriodSummary } from '@/lib/readingPeriodSummary';
import type { UserBookWithDetails } from '@/types/userBook';

export interface WrappedYearData {
  year: number;
  /**
   * УНІКАЛЬНІ книги, прочитання яких завершилось цього року, у порядку завершення.
   * Перечитування ТІЄЇ САМОЇ книги не дублює її тут (ТЗ §25: не називати перечитування "новою
   * книгою") — скільки саме було прочитань і скільки з них перечитування, каже `summary`.
   */
  booksFinished: UserBookWithDetails[];
  totalPages: number;
  totalMinutes: number;
  longestStreak: number;
  topAuthor: { name: string; count: number } | null;
  topRatedBook: { title: string; value: number } | null;
  busiestMonth: { month: number; sessionsCount: number } | null;
  topGenre: { name: string; count: number } | null;
  /** Повний canonical-підсумок року — те саме джерело, що й Weekly/Monthly Recap. */
  summary: ReadingPeriodSummary;
}

/**
 * Річний Wrapped (розділ 30 ТЗ, Milestone 6) — підсумок року з уже наявних даних, без нового
 * стану.
 *
 * ── POLYTSIA V1.7: ДВА ВИПРАВЛЕННЯ CANONICAL-СЕМАНТИКИ ───────────────────────────────────────
 * (`docs/V1_7_TEMPORAL_SEMANTICS.md`, `docs/V1_7_READING_LIFE.md`)
 *
 * 1. **Рік тепер ЛОКАЛЬНИЙ, не UTC.** Раніше межі будувались літералом
 *    `` `${year}-01-01T00:00:00.000Z` ``. У Києві (UTC+2/+3) це означало, що читання в
 *    новорічну ніч о 00:30 потрапляло у Wrapped ПОПЕРЕДНЬОГО року, а читання 31 грудня о 23:50
 *    — у наступний. Тепер `yearRangeOf` (`src/lib/readingCalendar.ts`) проводить межу там, де
 *    її проводить людина.
 *
 * 2. **"Книги року" тепер визначаються завершенням ReadingRun, а не поточним статусом книги.**
 *    Раніше було `UserBookRepository.listByStatus(db, 'finished')` + фільтр за
 *    `UserBook.finishedAt`. Це давало три реальні дефекти:
 *    - книга, завершена у 2026 й перечитана у 2028, має ЗАРАЗ статус `'rereading'` — і
 *      повністю зникала з Wrapped 2026 (`listByStatus('finished')` її не бачив);
 *    - повторне завершення тієї самої книги в межах того самого року було невидимим
 *      (`user_book` — один рядок на книгу, не на прохід);
 *    - soft-deleted книга зникала з минулих років, тобто видалення з Бібліотеки СЬОГОДНІ
 *      переписувало історію.
 *    Reading Seasons цей самий клас дефекту вже виправили переходом на
 *    `ReadingRunRepository.listFinishedBetween` — Wrapped тепер користується тим самим методом
 *    і тим самим canonical-двигуном (`computeReadingPeriodSummary`), а не власною формулою.
 *    `listWithDetailsByIdsIncludingDeleted` — History Preservation, той самий фікс, що вже
 *    діє для Календаря й Сезонів.
 *
 * НЕ ДВІ СИСТЕМИ: Year Recap (Phase 6) розвиває САМЕ цей хук, а не створює `getYearRecapStats()`
 * поруч із `getWrappedStats()`. Базові цифри (хвилини/сторінки/сесії/активні дні/завершені
 * прочитання/перечитування/унікальні твори/темп) приходять із `readingPeriodSummary.ts` —
 * спільного джерела з Weekly/Monthly Recap. Тут лишається лише те, що справді специфічне для
 * РОКУ: топ-автор, топ-жанр, найкраще оцінена книга, найактивніший місяць, найдовша серія.
 */
export function useWrappedYear(year: number) {
  return useQuery<WrappedYearData>({
    queryKey: queryKeys.wrapped.year(year),
    queryFn: async () => {
      const db = await getDatabase();
      const { startIso, endIso } = yearRangeOf(year);

      const [runsInRange, sessions] = await Promise.all([
        ReadingRunRepository.listFinishedBetween(db, startIso, endIso),
        ReadingSessionRepository.listStartedBetween(db, startIso, endIso),
      ]);

      // Один пакетний запит на всі книги року (не по одному на run) — той самий принцип, що вже
      // діє в Сезонах/Календарі. `...IncludingDeleted`: історичний рік не має "порожніти" лише
      // тому, що книгу згодом прибрали з Бібліотеки.
      const uniqueUserBookIds = [...new Set(runsInRange.map((run) => run.userBookId))];
      const userBooks = await UserBookRepository.listWithDetailsByIdsIncludingDeleted(db, uniqueUserBookIds);
      const userBookById = new Map(userBooks.map((ub) => [ub.id, ub]));

      const summary = computeReadingPeriodSummary({
        sessions,
        finishedRuns: runsInRange.map((run) => ({
          id: run.id,
          userBookId: run.userBookId,
          workId: userBookById.get(run.userBookId)?.work.id ?? null,
          runNumber: run.runNumber,
          status: run.status,
          finishedAt: run.finishedAt,
        })),
      });

      // Унікальні книги в порядку завершення: `listFinishedBetween` уже віддає runs за
      // `finished_at ASC`, тож перше входження книги — її перше завершення цього року.
      // Книга, чиї edition/work фізично відсутні, тихо пропускається (той самий підхід, що й
      // `attachDetailsBatch`), а не ламає весь підсумок.
      const booksFinished: UserBookWithDetails[] = [];
      const seenUserBookIds = new Set<string>();
      for (const run of runsInRange) {
        if (run.status !== 'finished') continue;
        if (seenUserBookIds.has(run.userBookId)) continue;
        const userBook = userBookById.get(run.userBookId);
        if (!userBook) continue;
        seenUserBookIds.add(run.userBookId);
        booksFinished.push(userBook);
      }

      const { longest: longestStreak } = computeStreaks(summary.activeDayKeys, `${year}-12-31`);

      const authorCounts = new Map<string, number>();
      for (const ub of booksFinished) {
        for (const author of ub.work.authors) {
          authorCounts.set(author.name, (authorCounts.get(author.name) ?? 0) + 1);
        }
      }
      let topAuthor: WrappedYearData['topAuthor'] = null;
      for (const [name, count] of authorCounts) {
        if (!topAuthor || count > topAuthor.count) topAuthor = { name, count };
      }

      // Пакетний запит замість одного на кожну завершену книгу року (Milestone 8, продуктивність).
      const ratingByUserBookId = await RatingRepository.listByUserBookIds(db, booksFinished.map((ub) => ub.id));
      let topRatedBook: WrappedYearData['topRatedBook'] = null;
      for (const ub of booksFinished) {
        const rating = ratingByUserBookId.get(ub.id);
        if (rating && (!topRatedBook || rating.value > topRatedBook.value)) {
          topRatedBook = { title: ub.work.title, value: rating.value };
        }
      }

      const busiestMonth = computeBusiestMonth(sessions);

      const genresByWorkId = await GenreRepository.listByWorkIds(db, booksFinished.map((ub) => ub.work.id));
      const topGenre = computeTopGenreAmong(
        booksFinished.map((ub) => (genresByWorkId.get(ub.work.id) ?? []).map((g) => g.nameUk)),
      );

      return {
        year,
        booksFinished,
        totalPages: summary.pagesRead,
        totalMinutes: summary.readingMinutes,
        longestStreak,
        topAuthor,
        topRatedBook,
        busiestMonth,
        topGenre,
        summary,
      };
    },
  });
}
