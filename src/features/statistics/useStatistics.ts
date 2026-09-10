import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getDatabase } from '@/data/db';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { queryKeys } from '@/lib/queryKeys';
import { computeStreaks } from '@/lib/streaks';
import type { ReadingSession } from '@/types/readingSession';

const DAY_KEY_FORMAT = 'yyyy-MM-dd';

export interface OverallStatistics {
  totalMinutes: number;
  totalPages: number;
  totalSessions: number;
  booksFinishedAllTime: number;
  booksFinishedThisYear: number;
  activeDaysCount: number;
  currentStreak: number;
  longestStreak: number;
  /** Сьогоднішні цифри (той самий запит — уникає повторного витягування усіх сесій). */
  today: { minutes: number; pages: number };
}

function sessionPages(session: ReadingSession): number {
  const delta = session.endPage != null ? session.endPage - session.startPage : 0;
  return Math.max(0, delta);
}

/**
 * Загальна статистика (розділ 30 ТЗ): один запит, що тягне всі завершені сесії та всі
 * прочитані книги користувача й рахує з них усе інше в JS — `streaks.ts` (чиста функція,
 * окремо перевірена й протестована) для поточного/найдовшого streak, прості
 * reduce/filter для решти. Дані одного локального користувача, тож повна вибірка лишається
 * дешевою (докладніше — коментар у `ReadingSessionRepository.listAllCompleted`).
 */
export function useOverallStatistics() {
  return useQuery<OverallStatistics>({
    queryKey: queryKeys.statistics.overall,
    queryFn: async () => {
      const db = await getDatabase();
      // `listStatusOnly` замість `listByStatus` (Milestone 8, продуктивність) — тут
      // потрібні лише `finishedAt`/кількість, а `listByStatus` тягнув би повний
      // edition/work/authors/publisher/translators на кожну завершену книгу даремно.
      const [sessions, finishedBooks] = await Promise.all([
        ReadingSessionRepository.listAllCompleted(db),
        UserBookRepository.listStatusOnly(db, 'finished'),
      ]);

      const todayKey = format(new Date(), DAY_KEY_FORMAT);
      const dayKeys = sessions.map((s) => s.startedAt.slice(0, 10));
      const activeDaySet = new Set(dayKeys);
      const { current, longest } = computeStreaks(dayKeys, todayKey);

      const totalMinutes = sessions.reduce((sum, s) => sum + Math.round((s.durationSeconds ?? 0) / 60), 0);
      const totalPages = sessions.reduce((sum, s) => sum + sessionPages(s), 0);

      const todaySessions = sessions.filter((s) => s.startedAt.slice(0, 10) === todayKey);
      const todayMinutes = todaySessions.reduce((sum, s) => sum + Math.round((s.durationSeconds ?? 0) / 60), 0);
      const todayPages = todaySessions.reduce((sum, s) => sum + sessionPages(s), 0);

      const currentYear = new Date().getFullYear();
      const booksFinishedThisYear = finishedBooks.filter(
        (ub) => ub.finishedAt != null && new Date(ub.finishedAt).getFullYear() === currentYear,
      ).length;

      return {
        totalMinutes,
        totalPages,
        totalSessions: sessions.length,
        booksFinishedAllTime: finishedBooks.length,
        booksFinishedThisYear,
        activeDaysCount: activeDaySet.size,
        currentStreak: current,
        longestStreak: longest,
        today: { minutes: todayMinutes, pages: todayPages },
      };
    },
  });
}
