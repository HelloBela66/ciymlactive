import { useQuery } from '@tanstack/react-query';
import { startOfDay, startOfMonth, endOfMonth, addDays, format } from 'date-fns';
import { getDatabase } from '@/data/db';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { ActivityHistoryRepository } from '@/data/repositories/ActivityHistoryRepository';
import { ReadingRunRepository } from '@/data/repositories/ReadingRunRepository';
import { sumSessionMinutes, sumSessionPages } from '@/lib/readingAggregates';
import { sumMinutesForDay, selectPrimaryBookForDay, computeDayIntensity, type DayIntensityLevel } from '@/lib/calendarIntensity';
import { queryKeys } from '@/lib/queryKeys';
import type { CalendarDay } from '@/lib/calendarGrid';
import type { ReadingSession } from '@/types/readingSession';
import type { UserBookWithDetails } from '@/types/userBook';
import type { ActivityEvent } from '@/types/activityEvent';

const DAY_KEY_FORMAT = 'yyyy-MM-dd';

export interface SessionWithBookSummary {
  session: ReadingSession;
  userBook: UserBookWithDetails;
}

/**
 * КАЛЕНДАР 2.0 (POLYTSIA V1.6.1, Фаза 19, `docs/CALENDAR_2_0.md`) — статистика ОДНОГО дня для
 * клітинки місяця-сітки: `primaryUserBook` — обкладинка, яку показати (`null`, якщо того дня
 * не було сесій, або якщо єдина книга того дня вже м'яко видалена — той самий "не можу знайти
 * → не показую", а не помилка), `intensity`/`totalMinutes` — для індикатора насиченості.
 */
export interface DayCalendarStats {
  dayKey: string;
  intensity: DayIntensityLevel;
  totalMinutes: number;
  primaryUserBook: UserBookWithDetails | null;
}

/**
 * Дані для ВСІХ клітинок видимої сітки календаря (Фаза 19, замінює колишню `useMonthActivity`,
 * яка повертала лише `Set<string>` дат "була якась активність") — один запит сесій на весь
 * діапазон сітки (`ReadingSessionRepository.listStartedBetween`, як і раніше) плюс ОДИН пакетний
 * запит книжкових деталей на ВСІ унікальні "головні" книги місяця відразу
 * (`UserBookRepository.listWithDetailsByIds`) — без N+1, незалежно від того, скільки днів мали
 * активність.
 */
export function useMonthCalendarData(days: CalendarDay[]) {
  const firstDay = days[0]?.date;
  const lastDay = days[days.length - 1]?.date;
  const monthKey = firstDay && lastDay ? `${firstDay.toISOString()}_${lastDay.toISOString()}` : '';

  return useQuery<Map<string, DayCalendarStats>>({
    queryKey: queryKeys.calendar.month(monthKey),
    queryFn: async () => {
      if (!firstDay || !lastDay) return new Map();
      const db = await getDatabase();
      const startIso = startOfDay(firstDay).toISOString();
      const endIso = addDays(startOfDay(lastDay), 1).toISOString();
      const sessions = await ReadingSessionRepository.listStartedBetween(db, startIso, endIso);

      const sessionsByDay = new Map<string, ReadingSession[]>();
      for (const session of sessions) {
        const dayKey = format(new Date(session.startedAt), DAY_KEY_FORMAT);
        const list = sessionsByDay.get(dayKey);
        if (list) list.push(session);
        else sessionsByDay.set(dayKey, [session]);
      }

      const primaryUserBookIdByDay = new Map<string, string | null>();
      const primaryBookIds = new Set<string>();
      for (const [dayKey, daySessions] of sessionsByDay) {
        const primaryUserBookId = selectPrimaryBookForDay(daySessions);
        primaryUserBookIdByDay.set(dayKey, primaryUserBookId);
        if (primaryUserBookId) primaryBookIds.add(primaryUserBookId);
      }

      // Milestone 8-style пакетне довантаження — ФІКСОВАНА кількість запитів (усередині
      // `listWithDetailsByIds`), незалежно від кількості днів з активністю в місяці.
      const primaryBooks = await UserBookRepository.listWithDetailsByIds(db, [...primaryBookIds]);
      const primaryBookById = new Map(primaryBooks.map((ub) => [ub.id, ub]));

      const result = new Map<string, DayCalendarStats>();
      for (const [dayKey, daySessions] of sessionsByDay) {
        const totalMinutes = sumMinutesForDay(daySessions);
        const primaryUserBookId = primaryUserBookIdByDay.get(dayKey) ?? null;
        result.set(dayKey, {
          dayKey,
          totalMinutes,
          intensity: computeDayIntensity(totalMinutes),
          primaryUserBook: primaryUserBookId ? primaryBookById.get(primaryUserBookId) ?? null : null,
        });
      }
      return result;
    },
    enabled: !!firstDay && !!lastDay,
  });
}

export interface MonthSummary {
  totalMinutes: number;
  totalPages: number;
  activeDaysCount: number;
  distinctBooksCount: number;
  booksStartedCount: number;
  booksFinishedCount: number;
}

/**
 * Підсумок КАЛЕНДАРНОГО місяця (Фаза 19) — на відміну від `useMonthCalendarData` вище, діапазон
 * тут — рівно межі місяця (`startOfMonth`/`endOfMonth`), а НЕ сітка з паддінгом сусідніх місяців
 * (інакше "підсумок вересня" рахував би й кілька днів серпня/жовтня, що потрапили в сітку заради
 * повних тижнів). `sumSessionMinutes`/`sumSessionPages` — ті самі перевикористані обчислювачі,
 * що й аналітичні екрани Фази 15 (`readingAggregates.ts`), а не нова окрема реалізація.
 * `booksStartedCount`/`booksFinishedCount` — з ОДНОГО додаткового запиту
 * `ActivityHistoryRepository.listBetween` (замість нового спеціалізованого repository-методу),
 * той самий запит, який `app/day/[date].tsx` викликає для деталей дня — тут просто інший
 * діапазон і інша агрегація результату.
 */
export function useMonthSummary(monthAnchor: Date) {
  const monthKey = format(monthAnchor, 'yyyy-MM');

  return useQuery<MonthSummary>({
    queryKey: queryKeys.calendar.monthSummary(monthKey),
    queryFn: async () => {
      const db = await getDatabase();
      const startIso = startOfMonth(monthAnchor).toISOString();
      const endIso = addDays(startOfDay(endOfMonth(monthAnchor)), 1).toISOString();

      const [sessions, events] = await Promise.all([
        ReadingSessionRepository.listStartedBetween(db, startIso, endIso),
        ActivityHistoryRepository.listBetween(db, startIso, endIso),
      ]);

      const activeDaysCount = new Set(sessions.map((s) => format(new Date(s.startedAt), DAY_KEY_FORMAT))).size;
      const distinctBooksCount = new Set(sessions.map((s) => s.userBookId)).size;

      return {
        totalMinutes: sumSessionMinutes(sessions),
        totalPages: sumSessionPages(sessions),
        activeDaysCount,
        distinctBooksCount,
        booksStartedCount: events.filter((e) => e.type === 'book_started').length,
        booksFinishedCount: events.filter((e) => e.type === 'book_finished').length,
      };
    },
  });
}

export interface DayDetailsData {
  sessions: SessionWithBookSummary[];
  /** Решта семи типів подій ТЗ, що сталися цього дня (`session_completed` виключено — він уже
   * представлений `sessions` вище, з повними книжковими деталями через `UserBookWithDetails`,
   * не лише `ActivityEvent`'s `BOOK_COLUMNS`). Спойлер-safe для `journal_entry`/`quote` уже
   * застосований усередині `ActivityHistoryRepository.listBetween`. */
  otherEvents: ActivityEvent[];
  /** RUN-AWARE (Фаза 19) — `session.id → runNumber`, лише коли `runNumber > 1` (перечитування).
   * Свідомо НЕ поширюється на note/quote у `otherEvents` — зв'язок запису з конкретним run
   * можливий лише непрямо через nullable `session_id`, якого `ActivityEvent` навіть не несе
   * (докладніше — `docs/CALENDAR_2_0.md` §"Run-aware day details"); ті записи показуються без
   * позначки прочитання, а не помилково приписуються першому/останньому run. */
  runNumberBySessionId: Map<string, number>;
}

/** Деталі дня (Фаза 19, замінює попередню версію `useDaySessions`) — для `app/day/[date].tsx`.
 * Той самий діапазон-запит, що й раніше (`listStartedBetween` на межі одного дня), але книжкові
 * деталі сесій тепер довантажуються ОДНИМ пакетним запитом (`listWithDetailsByIds`) замість
 * `Promise.all(sessions.map(getByIdWithDetails))` — аудит НЕ фіксував цей N+1 названо (на
 * відміну від Home due-capsule N+1, Фаза 16), але ТЗ Фази 19 прямо вимагає "без N+1" для
 * Календаря, і це єдине місце фічі, де він фактично був. */
export function useDaySessions(date: Date | undefined) {
  const dayKey = date ? format(date, DAY_KEY_FORMAT) : '';

  return useQuery<DayDetailsData>({
    queryKey: queryKeys.calendar.day(dayKey),
    queryFn: async () => {
      if (!date) return { sessions: [], otherEvents: [], runNumberBySessionId: new Map() };
      const db = await getDatabase();
      const startIso = startOfDay(date).toISOString();
      const endIso = addDays(startOfDay(date), 1).toISOString();

      const [sessions, events] = await Promise.all([
        ReadingSessionRepository.listStartedBetween(db, startIso, endIso),
        ActivityHistoryRepository.listBetween(db, startIso, endIso),
      ]);

      const userBookIds = [...new Set(sessions.map((s) => s.userBookId))];
      const userBooks = await UserBookRepository.listWithDetailsByIds(db, userBookIds);
      const userBookById = new Map(userBooks.map((ub) => [ub.id, ub]));

      const sessionSummaries: SessionWithBookSummary[] = sessions
        .map((session) => {
          const userBook = userBookById.get(session.userBookId);
          return userBook ? { session, userBook } : null;
        })
        .filter((item): item is SessionWithBookSummary => item !== null);

      const runIds = [...new Set(sessions.map((s) => s.readingRunId).filter((id): id is string => id != null))];
      const runById = await ReadingRunRepository.listByIds(db, runIds);
      const runNumberBySessionId = new Map<string, number>();
      for (const session of sessions) {
        const run = session.readingRunId ? runById.get(session.readingRunId) : undefined;
        if (run && run.runNumber > 1) runNumberBySessionId.set(session.id, run.runNumber);
      }

      const otherEvents = events.filter((e) => e.type !== 'session_completed');

      return { sessions: sessionSummaries, otherEvents, runNumberBySessionId };
    },
    enabled: !!date,
  });
}
