import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { RatingRepository } from '@/data/repositories/RatingRepository';
import { GenreRepository } from '@/data/repositories/GenreRepository';
import { JournalRepository } from '@/data/repositories/JournalRepository';
import { queryKeys } from '@/lib/queryKeys';
import { seasonDateRange, formatSeasonKey } from '@/lib/season';
import type { SeasonId } from '@/design/season';
import type { UserBookWithDetails } from '@/types/userBook';
import type { JournalFeedEntry } from '@/types/journalEntry';

export interface SeasonFavoriteBook {
  userBook: UserBookWithDetails;
  ratingValue: number | null;
  isFavorite: boolean;
}

export interface ReadingSeasonData {
  seasonId: SeasonId;
  year: number;
  booksFinished: UserBookWithDetails[];
  totalPages: number;
  totalMinutes: number;
  sessionsCount: number;
  favoriteBook: SeasonFavoriteBook | null;
  topGenre: { name: string; count: number } | null;
  busiestMonth: { month: number; sessionsCount: number } | null;
  journalHighlight: JournalFeedEntry | null;
}

/**
 * Сезонний підсумок (ТЗ Фази 13, READING SEASONS, `docs/READING_SEASONS.md`) — той самий
 * "derived, без нового стану" принцип, що й `useWrappedYear` (`src/features/wrapped/
 * useWrappedYear.ts`), лише масштаб не календарний рік, а один із чотирьох метеорологічних
 * сезонів (`src/lib/season.ts#seasonDateRange`). Свідомо БЕЗ `topAuthor` — переліку статистик
 * Фази 13 автора року немає ("finished books; pages; hours; sessions; favorite/highest rated
 * book; genre; active month"), на відміну від Wrapped. Два поля, яких у Wrapped нема:
 * `sessionsCount` (прямо в ТЗ) і `journalHighlight` (ТЗ: "journal highlight optional").
 */
export function useReadingSeason(seasonId: SeasonId, year: number) {
  return useQuery<ReadingSeasonData>({
    queryKey: queryKeys.seasons.bySeasonKey(formatSeasonKey({ seasonId, year })),
    queryFn: async () => {
      const db = await getDatabase();
      const range = seasonDateRange(seasonId, year);

      const [allFinished, sessions] = await Promise.all([
        UserBookRepository.listByStatus(db, 'finished'),
        ReadingSessionRepository.listStartedBetween(db, range.start, range.end),
      ]);

      const booksFinished = allFinished.filter(
        (ub) => ub.finishedAt != null && ub.finishedAt >= range.start && ub.finishedAt < range.end,
      );

      const totalMinutes = sessions.reduce((sum, s) => sum + Math.round((s.durationSeconds ?? 0) / 60), 0);
      const totalPages = sessions.reduce((sum, s) => {
        const delta = s.endPage != null ? s.endPage - s.startPage : 0;
        return sum + Math.max(0, delta);
      }, 0);

      // Пакетні запити (той самий Milestone 8-style підхід, що й `useWrappedYear`) замість
      // одного на кожну завершену книгу сезону.
      const ratingByUserBookId = await RatingRepository.listByUserBookIds(db, booksFinished.map((ub) => ub.id));

      // "favorite/highest rated book" (ТЗ) — обране пріоритетне над найвищою оцінкою: серед
      // позначених `isFavorite` книг сезону (якщо є хоч одна) бере найвище оцінену (чи просто
      // першу, якщо жодна не оцінена); інакше — той самий fallback на найвищу оцінку сезону,
      // що й `topRatedBook` у Wrapped.
      const favoritesFinished = booksFinished.filter((ub) => ub.isFavorite);
      const favoritePool = favoritesFinished.length > 0 ? favoritesFinished : booksFinished;
      let favoriteBook: ReadingSeasonData['favoriteBook'] = null;
      for (const ub of favoritePool) {
        const ratingValue = ratingByUserBookId.get(ub.id)?.value ?? null;
        if (!favoriteBook || (ratingValue ?? -1) > (favoriteBook.ratingValue ?? -1)) {
          favoriteBook = { userBook: ub, ratingValue, isFavorite: ub.isFavorite };
        }
      }

      const genresByWorkId = await GenreRepository.listByWorkIds(db, booksFinished.map((ub) => ub.work.id));
      const genreCounts = new Map<string, number>();
      for (const ub of booksFinished) {
        for (const genre of genresByWorkId.get(ub.work.id) ?? []) {
          genreCounts.set(genre.nameUk, (genreCounts.get(genre.nameUk) ?? 0) + 1);
        }
      }
      let topGenre: ReadingSeasonData['topGenre'] = null;
      for (const [name, count] of genreCounts) {
        if (!topGenre || count > topGenre.count) topGenre = { name, count };
      }

      const monthCounts = new Map<number, number>();
      for (const session of sessions) {
        const month = new Date(session.startedAt).getUTCMonth() + 1;
        monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
      }
      let busiestMonth: ReadingSeasonData['busiestMonth'] = null;
      for (const [month, count] of monthCounts) {
        if (!busiestMonth || count > busiestMonth.sessionsCount) busiestMonth = { month, sessionsCount: count };
      }

      // "Journal highlight optional" (ТЗ) — останній ЗА ДАТОЮ позначений "обраним" запис
      // щоденника в межах дат сезону (глобальна стрічка, не одна книга — той самий
      // `listFeedPage`, що й "Мій щоденник"). `dateTo` тут — включно (`<=`, на відміну від
      // `SeasonRange.end`, що виключно), тож віднімаємо 1мс від межі, щоб не зачепити запис
      // рівно з півночі початку наступного сезону.
      const dateToInclusive = new Date(new Date(range.end).getTime() - 1).toISOString();
      const { items: highlightItems } = await JournalRepository.listFeedPage(db, {
        dateFrom: range.start,
        dateTo: dateToInclusive,
        favoriteOnly: true,
        limit: 1,
      });

      return {
        seasonId,
        year,
        booksFinished,
        totalPages,
        totalMinutes,
        sessionsCount: sessions.length,
        favoriteBook,
        topGenre,
        busiestMonth,
        journalHighlight: highlightItems[0] ?? null,
      };
    },
  });
}
