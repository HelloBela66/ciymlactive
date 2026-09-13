import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { RatingRepository } from '@/data/repositories/RatingRepository';
import { GenreRepository } from '@/data/repositories/GenreRepository';
import { queryKeys } from '@/lib/queryKeys';
import { computeStreaks } from '@/lib/streaks';
import {
  sumSessionMinutes,
  sumSessionPages,
  computeBusiestMonth,
  filterFinishedInRange,
  computeTopGenreAmong,
} from '@/lib/readingAggregates';
import type { UserBookWithDetails } from '@/types/userBook';

export interface WrappedYearData {
  year: number;
  booksFinished: UserBookWithDetails[];
  totalPages: number;
  totalMinutes: number;
  longestStreak: number;
  topAuthor: { name: string; count: number } | null;
  topRatedBook: { title: string; value: number } | null;
  busiestMonth: { month: number; sessionsCount: number } | null;
  topGenre: { name: string; count: number } | null;
}

function yearRange(year: number): { start: string; end: string } {
  return { start: `${year}-01-01T00:00:00.000Z`, end: `${year + 1}-01-01T00:00:00.000Z` };
}

/**
 * Річний Wrapped (розділ 30 ТЗ, Milestone 6) — підсумок року з уже наявних даних, без нового
 * стану: книги, завершені в межах року, сесії, що почались у межах року (для сторінок/
 * хвилин/streak/найактивнішого місяця), найкраще оцінена книга року і (Milestone 9, тепер що
 * `work_genre` нарешті заповнюється — `GenreRepository`/Book Details) топ жанр року. Книга з
 * кількома жанрами рахується в кожен з них — той самий підхід, що й `topAuthor` для
 * співавторів.
 *
 * Фаза 15 (ANALYTICS HIERARCHY, `docs/MY_READING.md`) — суми хвилин/сторінок, найактивніший
 * місяць, фільтр "завершено в межах діапазону" й підрахунок топ-жанру підняті в
 * `src/lib/readingAggregates.ts`: цей код був буквально ідентичний у `useReadingSeason.ts`
 * (аудит §"Пара 4"). `topAuthor`/`topRatedBook` лишаються тут — унікальні для Wrapped, немає
 * що ділити.
 */
export function useWrappedYear(year: number) {
  return useQuery<WrappedYearData>({
    queryKey: queryKeys.wrapped.year(year),
    queryFn: async () => {
      const db = await getDatabase();
      const { start, end } = yearRange(year);

      const [allFinished, sessions] = await Promise.all([
        UserBookRepository.listByStatus(db, 'finished'),
        ReadingSessionRepository.listStartedBetween(db, start, end),
      ]);

      const booksFinished = filterFinishedInRange(allFinished, { start, end });

      const totalMinutes = sumSessionMinutes(sessions);
      const totalPages = sumSessionPages(sessions);

      const dayKeys = sessions.map((s) => s.startedAt.slice(0, 10));
      const { longest: longestStreak } = computeStreaks(dayKeys, `${year}-12-31`);

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

      // Пакетний запит замість одного на кожну завершену книгу року (Milestone 8,
      // продуктивність — реальна знахідка з аудиту).
      const ratingByUserBookId = await RatingRepository.listByUserBookIds(db, booksFinished.map((ub) => ub.id));
      let topRatedBook: WrappedYearData['topRatedBook'] = null;
      for (const ub of booksFinished) {
        const rating = ratingByUserBookId.get(ub.id);
        if (rating && (!topRatedBook || rating.value > topRatedBook.value)) {
          topRatedBook = { title: ub.work.title, value: rating.value };
        }
      }

      const busiestMonth = computeBusiestMonth(sessions);

      // Пакетний запит (Milestone 8-style продуктивність), той самий принцип, що й
      // `ratingByUserBookId` вище.
      const genresByWorkId = await GenreRepository.listByWorkIds(db, booksFinished.map((ub) => ub.work.id));
      const topGenre = computeTopGenreAmong(
        booksFinished.map((ub) => (genresByWorkId.get(ub.work.id) ?? []).map((g) => g.nameUk)),
      );

      return {
        year,
        booksFinished,
        totalPages,
        totalMinutes,
        longestStreak,
        topAuthor,
        topRatedBook,
        busiestMonth,
        topGenre,
      };
    },
  });
}
