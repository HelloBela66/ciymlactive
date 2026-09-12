import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { RatingRepository } from '@/data/repositories/RatingRepository';
import { GenreRepository } from '@/data/repositories/GenreRepository';
import { queryKeys } from '@/lib/queryKeys';
import {
  computeTimeOfDayInsight,
  computeAverageSessionMinutes,
  computeTopGenre,
  computeTopRatedGenre,
  computeFormatInsight,
  computeAveragePages,
  formatGroup,
} from '@/lib/readingProfile';
import type { TimeOfDayInsight, GenreCount, GenreRating, FormatInsight } from '@/lib/readingProfile';

export interface ReadingProfileData {
  timeOfDay: TimeOfDayInsight | null;
  averageSessionMinutes: number | null;
  topGenre: GenreCount | null;
  topRatedGenre: GenreRating | null;
  format: FormatInsight | null;
  averagePages: number | null;
}

/**
 * «Мій читацький профіль» (ТЗ Фази 14, READING PROFILE, `docs/READING_PROFILE.md`) — той
 * самий "власний запит, власний reduce" підхід, що й Wrapped/Seasons/Statistics (жодної
 * композиції поверх інших хуків), лише за ввесь час, без параметра року/сезону. Уся логіка
 * порогів/вибору — у `src/lib/readingProfile.ts` (чисті, тестовані функції); тут лише збір
 * сирих даних і виклик цих функцій. PRIVATE analytics (ТЗ) — дані нікуди не виходять за межі
 * цього запиту, той самий офлайн-принцип, що й решта застосунку.
 */
export function useReadingProfile() {
  return useQuery<ReadingProfileData>({
    queryKey: queryKeys.readingProfile.overall,
    queryFn: async () => {
      const db = await getDatabase();

      const [sessions, allUserBooks, booksFinished] = await Promise.all([
        ReadingSessionRepository.listAllCompleted(db),
        UserBookRepository.listAll(db),
        UserBookRepository.listByStatus(db, 'finished'),
      ]);

      // Час доби/середня сесія — за ВСІМА завершеними сесіями, незалежно від статусу книги
      // (перечитування/паузи — так само реальні сесії читання, як і сесії завершеної книги).
      const localHours = sessions.map((s) => new Date(s.startedAt).getHours());
      const timeOfDay = computeTimeOfDayInsight(localHours);

      const durations = sessions.map((s) => s.durationSeconds).filter((d): d is number => d != null && d > 0);
      const averageSessionMinutes = computeAverageSessionMinutes(durations);

      // Жанр/оцінка/сторінки — лише завершені книги (той самий "завершена книга = дані про
      // неї остаточні" принцип, що й у Wrapped/Seasons).
      const genresByWorkId = await GenreRepository.listByWorkIds(db, booksFinished.map((ub) => ub.work.id));
      const genreCounts = new Map<string, number>();
      for (const ub of booksFinished) {
        for (const genre of genresByWorkId.get(ub.work.id) ?? []) {
          genreCounts.set(genre.nameUk, (genreCounts.get(genre.nameUk) ?? 0) + 1);
        }
      }
      const topGenre = computeTopGenre(genreCounts, booksFinished.length);

      // Пакетний запит (той самий Milestone 8-style підхід, що й Wrapped/Seasons) замість
      // одного на кожну завершену книгу.
      const ratingByUserBookId = await RatingRepository.listByUserBookIds(db, booksFinished.map((ub) => ub.id));
      const genreRatingSums = new Map<string, { sum: number; count: number }>();
      for (const ub of booksFinished) {
        const rating = ratingByUserBookId.get(ub.id);
        if (!rating) continue;
        for (const genre of genresByWorkId.get(ub.work.id) ?? []) {
          const entry = genreRatingSums.get(genre.nameUk) ?? { sum: 0, count: 0 };
          entry.sum += rating.value;
          entry.count += 1;
          genreRatingSums.set(genre.nameUk, entry);
        }
      }
      const topRatedGenre = computeTopRatedGenre(genreRatingSums);

      // Формат — за СЕСІЯМИ (не за книгами бібліотеки): скільки часу читання пройшло у
      // фізичних/цифрових виданнях, а не скільки книг кожного формату в бібліотеці — той
      // самий "сесії, не книги" масштаб, що й час доби/середня сесія вище. Формат книги на
      // момент сесії береться з ПОТОЧНОГО видання (`user_book.editionId`) — видання книги
      // заднім числом у застосунку не змінюється, тож розбіжності з форматом на момент самої
      // сесії тут немає. Поріг і причина консервативного порогу — `computeFormatInsight`
      // (`src/lib/readingProfile.ts`), докладніше — `docs/READING_PROFILE.md`.
      const formatByUserBookId = new Map(allUserBooks.map((ub) => [ub.id, ub.edition.format]));
      let physicalCount = 0;
      let digitalCount = 0;
      for (const session of sessions) {
        const format = formatByUserBookId.get(session.userBookId);
        if (!format) continue;
        if (formatGroup(format) === 'digital') digitalCount += 1;
        else physicalCount += 1;
      }
      const format = computeFormatInsight(physicalCount, digitalCount);

      const pageCounts = booksFinished
        .map((ub) => ub.edition.pageCount)
        .filter((p): p is number => p != null && p > 0);
      const averagePages = computeAveragePages(pageCounts);

      return { timeOfDay, averageSessionMinutes, topGenre, topRatedGenre, format, averagePages };
    },
  });
}
