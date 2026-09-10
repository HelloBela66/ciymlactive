import { useQuery } from '@tanstack/react-query';
import { startOfDay, addDays, format } from 'date-fns';
import { getDatabase } from '@/data/db';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { queryKeys } from '@/lib/queryKeys';
import type { CalendarDay } from '@/lib/calendarGrid';
import type { ReadingSession } from '@/types/readingSession';
import type { UserBookWithDetails } from '@/types/userBook';

const DAY_KEY_FORMAT = 'yyyy-MM-dd';

export interface SessionWithBookSummary {
  session: ReadingSession;
  userBook: UserBookWithDetails;
}

/**
 * Дні з завершеними сесіями читання у видимій сітці календаря (Milestone 4) — множина
 * ключів `yyyy-MM-dd` для позначок-крапок. Діапазон запиту — рівно межі сітки (`days[0]` до
 * `days[days.length-1]`), а не календарний місяць, щоб дні сусідніх місяців у сітці теж
 * коректно позначались.
 */
export function useMonthActivity(days: CalendarDay[]) {
  const firstDay = days[0]?.date;
  const lastDay = days[days.length - 1]?.date;
  const monthKey = firstDay && lastDay ? `${firstDay.toISOString()}_${lastDay.toISOString()}` : '';

  return useQuery<Set<string>>({
    queryKey: queryKeys.calendar.month(monthKey),
    queryFn: async () => {
      if (!firstDay || !lastDay) return new Set<string>();
      const db = await getDatabase();
      const startIso = startOfDay(firstDay).toISOString();
      const endIso = addDays(startOfDay(lastDay), 1).toISOString();
      const sessions = await ReadingSessionRepository.listStartedBetween(db, startIso, endIso);
      return new Set(sessions.map((session) => format(new Date(session.startedAt), DAY_KEY_FORMAT)));
    },
    enabled: !!firstDay && !!lastDay,
  });
}

/** Завершені сесії конкретного дня разом з книгою — для Day Details (`app/day/[date].tsx`). */
export function useDaySessions(date: Date | undefined) {
  const dayKey = date ? format(date, DAY_KEY_FORMAT) : '';

  return useQuery<SessionWithBookSummary[]>({
    queryKey: queryKeys.calendar.day(dayKey),
    queryFn: async () => {
      if (!date) return [];
      const db = await getDatabase();
      const startIso = startOfDay(date).toISOString();
      const endIso = addDays(startOfDay(date), 1).toISOString();
      const sessions = await ReadingSessionRepository.listStartedBetween(db, startIso, endIso);

      const results = await Promise.all(
        sessions.map(async (session) => {
          const userBook = await UserBookRepository.getByIdWithDetails(db, session.userBookId);
          return userBook ? { session, userBook } : null;
        }),
      );
      return results.filter((item): item is SessionWithBookSummary => item !== null);
    },
    enabled: !!date,
  });
}
