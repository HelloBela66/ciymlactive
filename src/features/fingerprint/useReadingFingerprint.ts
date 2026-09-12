import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { GenreRepository } from '@/data/repositories/GenreRepository';
import { SeriesRepository } from '@/data/repositories/SeriesRepository';
import { NoteRepository } from '@/data/repositories/NoteRepository';
import { QuoteRepository } from '@/data/repositories/QuoteRepository';
import { queryKeys } from '@/lib/queryKeys';
import { computeTimeOfDayInsight, computeAverageSessionMinutes, computeAveragePages } from '@/lib/readingProfile';
import { computeGlobalPace, computeFingerprintBadges, selectShareCardBadges } from '@/lib/readingFingerprint';
import type { BadgeId } from '@/lib/readingFingerprint';

export interface ReadingFingerprintData {
  badges: BadgeId[];
  shareCardBadges: BadgeId[];
}

/**
 * «Мій читацький відбиток» (ТЗ Фази 15, READING FINGERPRINT, `docs/READING_FINGERPRINT.md`) —
 * той самий "власний запит, власний reduce" підхід, що й Wrapped/Seasons/Statistics/Profile
 * (жодної композиції поверх `useReadingProfile()` як хука). ТЗ каже "На основі Reading Profile"
 * — виконано на рівні ЧИСТИХ ФУНКЦІЙ (`computeTimeOfDayInsight`/`computeAverageSessionMinutes`/
 * `computeAveragePages` з `@/lib/readingProfile` перевикористані напряму, той самий поріг, той
 * самий результат, що й на екрані профілю), а не на рівні хука — так само, як `useReadingProfile`
 * сама не композиціюється поверх `useStatistics`. Уся логіка бейджів/порогів — у
 * `src/lib/readingFingerprint.ts` (чисті, тестовані функції); тут лише збір сирих даних і
 * виклик цих функцій. PRIVATE, повністю офлайн — той самий принцип, що й Reading Profile.
 */
export function useReadingFingerprint() {
  return useQuery<ReadingFingerprintData>({
    queryKey: queryKeys.fingerprint.overall,
    queryFn: async () => {
      const db = await getDatabase();

      const [sessions, booksFinished] = await Promise.all([
        ReadingSessionRepository.listAllCompleted(db),
        UserBookRepository.listByStatus(db, 'finished'),
      ]);

      // Час доби/середня сесія — той самий збір (усі завершені сесії) і ті самі чисті функції,
      // що й `useReadingProfile.ts`.
      const localHours = sessions.map((s) => new Date(s.startedAt).getHours());
      const timeOfDay = computeTimeOfDayInsight(localHours);

      const durations = sessions.map((s) => s.durationSeconds).filter((d): d is number => d != null && d > 0);
      const averageSessionMinutes = computeAverageSessionMinutes(durations);

      const pageCounts = booksFinished
        .map((ub) => ub.edition.pageCount)
        .filter((p): p is number => p != null && p > 0);
      const averagePages = computeAveragePages(pageCounts);

      // Глобальний темп (сторінок/годину) — НОВА агрегація Фази 15, якої нема у Reading Profile:
      // той самий "endPage - startPage за сесію, від'ємне не рахується" підхід, що й
      // `pagesTurned` у `computeBookStats` (`src/lib/bookStats.ts`), лише сумарно за ВСІМА
      // сесіями одразу (усі книги, усі цикли читання), а не по одній книзі.
      let pagesTurnedTotal = 0;
      let totalSeconds = 0;
      for (const session of sessions) {
        if (session.endPage != null) {
          const delta = session.endPage - session.startPage;
          if (delta > 0) pagesTurnedTotal += delta;
        }
        totalSeconds += session.durationSeconds ?? 0;
      }
      const globalPace = computeGlobalPace(pagesTurnedTotal, totalSeconds);

      // Серії/жанри — пакетні запити (той самий Milestone 8-style підхід, що й Wrapped/Seasons/
      // Profile) по WORK id завершених книг, замість запиту в циклі на кожну книгу.
      const workIds = booksFinished.map((ub) => ub.work.id);
      const [genresByWorkId, workIdsInSeries] = await Promise.all([
        GenreRepository.listByWorkIds(db, workIds),
        SeriesRepository.listWorkIdsInSeries(db, workIds),
      ]);

      const distinctGenres = new Set<string>();
      for (const workId of workIds) {
        for (const genre of genresByWorkId.get(workId) ?? []) {
          distinctGenres.add(genre.nameUk);
        }
      }

      const finishedBooksInSeriesCount = workIds.filter((workId) => workIdsInSeries.has(workId)).length;

      // Нотатки/цитати — лише кількість (`COUNT(*)`, не повний `SELECT *`), бейджу не потрібен
      // жоден рядок цілком.
      const [notesCount, quotesCount] = await Promise.all([NoteRepository.countAll(db), QuoteRepository.countAll(db)]);

      const badges = computeFingerprintBadges({
        timeOfDay,
        averageSessionMinutes,
        averagePages,
        globalPace,
        finishedBooksInSeriesCount,
        finishedBooksTotalCount: booksFinished.length,
        distinctGenresCount: distinctGenres.size,
        notesCount,
        quotesCount,
      });

      return { badges, shareCardBadges: selectShareCardBadges(badges) };
    },
  });
}
