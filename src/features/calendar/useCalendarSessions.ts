import { useQuery } from '@tanstack/react-query';
import { startOfDay, startOfMonth, endOfMonth, addDays, format } from 'date-fns';
import { getDatabase } from '@/data/db';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { ActivityHistoryRepository } from '@/data/repositories/ActivityHistoryRepository';
import { ReadingRunRepository } from '@/data/repositories/ReadingRunRepository';
import { JournalRepository } from '@/data/repositories/JournalRepository';
import { sumSessionMinutes, sumSessionPages } from '@/lib/readingAggregates';
import {
  sumMinutesForDay,
  rankBooksForDay,
  compactPrimarySecondary,
  computeDayIntensity,
  type DayIntensityLevel,
} from '@/lib/calendarIntensity';
import { rankTopBooksOfMonth } from '@/lib/calendarTopBooks';
import { rankJournalEntriesForDay } from '@/lib/calendarJournalPriority';
import { queryKeys } from '@/lib/queryKeys';
import type { CalendarDay } from '@/lib/calendarGrid';
import type { ReadingSession } from '@/types/readingSession';
import type { UserBookWithDetails } from '@/types/userBook';
import type { ActivityEvent } from '@/types/activityEvent';
import type { JournalFeedEntry } from '@/types/journalEntry';

const DAY_KEY_FORMAT = 'yyyy-MM-dd';

export interface SessionWithBookSummary {
  session: ReadingSession;
  userBook: UserBookWithDetails;
}

/**
 * КАЛЕНДАР 2.0 (POLYTSIA V1.6.1, Фаза 19) + ВІЗУАЛЬНА КОМПОЗИЦІЯ (пост-Фаза 19,
 * `docs/CALENDAR_2_0.md` §"Visual Day Composition") — статистика ОДНОГО дня для клітинки
 * місяця-сітки: `primaryUserBook`/`secondaryUserBook` — обкладинки cover-стеку (`null`, коли
 * книги нема чи вже м'яко видалена), `additionalBookCount` — для бейджа "+N" (3+ книги дня),
 * `hasStartedBook`/`hasFinishedBook` — tiny start/finish індикатор (джерело — `ReadingRun`, не
 * `user_book.started_at`/`finished_at`, докладніше коментар над `ReadingRunRepository.
 * listStartedOrFinishedBetween`), `intensity`/`totalMinutes`/`totalPages` — компактна метрика
 * й індикатор насиченості.
 */
export interface DayCalendarStats {
  dayKey: string;
  intensity: DayIntensityLevel;
  totalMinutes: number;
  totalPages: number;
  sessionCount: number;
  primaryUserBook: UserBookWithDetails | null;
  secondaryUserBook: UserBookWithDetails | null;
  additionalBookCount: number;
  hasStartedBook: boolean;
  hasFinishedBook: boolean;
}

function emptyDayStats(dayKey: string): DayCalendarStats {
  return {
    dayKey,
    intensity: 0,
    totalMinutes: 0,
    totalPages: 0,
    sessionCount: 0,
    primaryUserBook: null,
    secondaryUserBook: null,
    additionalBookCount: 0,
    hasStartedBook: false,
    hasFinishedBook: false,
  };
}

/**
 * Дані для ВСІХ клітинок видимої сітки календаря — один запит сесій на весь діапазон сітки
 * (`ReadingSessionRepository.listStartedBetween`, як і раніше) + один запит run-подій
 * (`ReadingRunRepository.listStartedOrFinishedBetween`, НОВЕ — для start/finish індикатора) +
 * ОДИН пакетний запит книжкових деталей (`UserBookRepository.listWithDetailsByIds`) на ВСІ
 * унікальні "перші дві" книги кожного дня місяця відразу (лише перші дві на день реально
 * показуються обкладинкою — решта позначені лише числом, їм книжкові деталі не потрібні) —
 * фіксована кількість запитів, незалежно від того, скільки днів місяця мали активність.
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

      const [sessions, runs] = await Promise.all([
        ReadingSessionRepository.listStartedBetween(db, startIso, endIso),
        ReadingRunRepository.listStartedOrFinishedBetween(db, startIso, endIso),
      ]);

      // ІСНУЮЧЕ (НЕ ЗМІНЕНЕ цією фазою) ПРАВИЛО прив'язки сесії до дня — сесія, що перетинає
      // північ (почалась 23:50, закінчилась 00:20 наступного дня), належить ЦІЛКОМ дню
      // `session.startedAt` (тут — 23:50-й день), НІКОЛИ не розділяється між двома днями.
      // Це правило існувало вже в колишній `useMonthActivity` (до Фази 19) і лишається без змін
      // усіма фазами Календаря, включно з цією — ВІЗУАЛЬНА КОМПОЗИЦІЯ явно вимагає "не вигадуй
      // нове розділення по хвилинах, задокументуй наявне правило" (ТЗ, §"північ"), а не міняти
      // семантику: `format(new Date(session.startedAt), 'yyyy-MM-dd')` — той самий локальний
      // (пристрій-часовий-пояс) `Date`-парсинг ISO-рядка, що й решта Календаря
      // (`useMonthSummary`/`useDaySessions` нижче використовують той самий підхід для власних
      // діапазонів). Докладніше, з прикладом — `docs/CALENDAR_VISUAL_REDESIGN_REPORT.md`
      // §"Північ і межі дня".
      const sessionsByDay = new Map<string, ReadingSession[]>();
      for (const session of sessions) {
        const dayKey = format(new Date(session.startedAt), DAY_KEY_FORMAT);
        const list = sessionsByDay.get(dayKey);
        if (list) list.push(session);
        else sessionsByDay.set(dayKey, [session]);
      }

      const rankedByDay = new Map<string, ReturnType<typeof rankBooksForDay>>();
      const neededBookIds = new Set<string>();
      for (const [dayKey, daySessions] of sessionsByDay) {
        const ranked = rankBooksForDay(daySessions);
        rankedByDay.set(dayKey, ranked);
        for (const book of ranked.slice(0, 2)) neededBookIds.add(book.userBookId);
      }

      const startedDayKeys = new Set<string>();
      const finishedDayKeys = new Set<string>();
      for (const run of runs) {
        if (run.startedAt >= startIso && run.startedAt < endIso) {
          startedDayKeys.add(format(new Date(run.startedAt), DAY_KEY_FORMAT));
        }
        if (run.finishedAt && run.finishedAt >= startIso && run.finishedAt < endIso) {
          finishedDayKeys.add(format(new Date(run.finishedAt), DAY_KEY_FORMAT));
        }
      }

      // Milestone 8-style пакетне довантаження — ФІКСОВАНА кількість запитів (усередині
      // `listWithDetailsByIds`), незалежно від кількості днів з активністю в місяці.
      const books = await UserBookRepository.listWithDetailsByIds(db, [...neededBookIds]);
      const bookById = new Map(books.map((ub) => [ub.id, ub]));

      const result = new Map<string, DayCalendarStats>();
      for (const [dayKey, daySessions] of sessionsByDay) {
        const ranked = rankedByDay.get(dayKey) ?? [];
        const totalMinutes = sumMinutesForDay(daySessions);
        const totalPages = ranked.reduce((sum, b) => sum + b.totalPages, 0);
        const { primary, secondary } = compactPrimarySecondary(
          ranked.slice(0, 2).map((b) => b.userBookId),
          bookById,
        );
        result.set(dayKey, {
          dayKey,
          totalMinutes,
          totalPages,
          sessionCount: daySessions.length,
          intensity: computeDayIntensity(totalMinutes),
          primaryUserBook: primary,
          secondaryUserBook: secondary,
          additionalBookCount: Math.max(0, ranked.length - 2),
          hasStartedBook: startedDayKeys.has(dayKey),
          hasFinishedBook: finishedDayKeys.has(dayKey),
        });
      }

      // Дні зі стартом/фінішем книги, але БЕЗ жодної сесії ТОГО дня (наприклад: позначив
      // "Прочитано" напряму, без сесії таймера того дня) — мають з'явитись у результаті теж,
      // інакше tiny start/finish індикатор дня-клітинки для них не спрацює.
      for (const dayKey of new Set([...startedDayKeys, ...finishedDayKeys])) {
        if (result.has(dayKey)) continue;
        result.set(dayKey, {
          ...emptyDayStats(dayKey),
          hasStartedBook: startedDayKeys.has(dayKey),
          hasFinishedBook: finishedDayKeys.has(dayKey),
        });
      }

      return result;
    },
    enabled: !!firstDay && !!lastDay,
  });
}

/** Одна книга в топі "Найчастіше цього місяця" (ранжування — `rankTopBooksOfMonth`, групування
 * ЗА ТВОРОМ, докладніше коментар там-таки). */
export interface MonthTopBook {
  userBook: UserBookWithDetails;
  totalMinutes: number;
}

export interface MonthSummary {
  totalMinutes: number;
  totalPages: number;
  activeDaysCount: number;
  distinctBooksCount: number;
  booksStartedCount: number;
  booksFinishedCount: number;
  topBooks: MonthTopBook[];
}

/**
 * Підсумок КАЛЕНДАРНОГО місяця — на відміну від `useMonthCalendarData` вище, діапазон тут —
 * рівно межі місяця (`startOfMonth`/`endOfMonth`), а НЕ сітка з паддінгом сусідніх місяців.
 * `topBooks` (ВІЗУАЛЬНА КОМПОЗИЦІЯ, пост-Фаза 19) — ОДИН додатковий пакетний запит книжкових
 * деталей на всі унікальні книги місяця (той самий batching-принцип, що й місяць-сітка вище) —
 * без нього неможливо було б знати `work.id` кожної сесії для групування "за твором"
 * (`ReadingSession` несе лише `userBookId`).
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
      const distinctUserBookIds = [...new Set(sessions.map((s) => s.userBookId))];

      const books = await UserBookRepository.listWithDetailsByIds(db, distinctUserBookIds);
      const bookById = new Map(books.map((ub) => [ub.id, ub]));

      const sessionsForTopBooks = sessions
        .map((session) => {
          const workId = bookById.get(session.userBookId)?.work.id;
          return workId ? { userBookId: session.userBookId, workId, durationSeconds: session.durationSeconds } : null;
        })
        .filter((s): s is { userBookId: string; workId: string; durationSeconds: number | null } => s !== null);

      const topBooks: MonthTopBook[] = rankTopBooksOfMonth(sessionsForTopBooks, 3)
        .map((ranked) => {
          const userBook = bookById.get(ranked.representativeUserBookId);
          return userBook ? { userBook, totalMinutes: ranked.totalMinutes } : null;
        })
        .filter((b): b is MonthTopBook => b !== null);

      return {
        totalMinutes: sumSessionMinutes(sessions),
        totalPages: sumSessionPages(sessions),
        activeDaysCount,
        distinctBooksCount: distinctUserBookIds.length,
        booksStartedCount: events.filter((e) => e.type === 'book_started').length,
        booksFinishedCount: events.filter((e) => e.type === 'book_finished').length,
        topBooks,
      };
    },
  });
}

/** Одна книга дня — деталі + підсумок (для "Книги, прочитані цього дня", primary першою —
 * порядок успадкований від `rankBooksForDay`). */
export interface DayBookSummary {
  userBook: UserBookWithDetails;
  totalMinutes: number;
  totalPages: number;
  sessionCount: number;
}

/** Пункт таймлайну "почав/завершив" (ВІЗУАЛЬНА КОМПОЗИЦІЯ, пост-Фаза 19) — джерело дати САМЕ
 * `ReadingRun.startedAt`/`finishedAt` (не `ActivityEvent`'s `book_started`/`book_finished`,
 * докладніше — коментар над `ReadingRunRepository.listStartedOrFinishedBetween`). */
export interface DayRunEvent {
  type: 'started' | 'finished';
  occurredAt: string;
  userBook: UserBookWithDetails;
}

export interface DayDetailsData {
  /** Книги дня, primary першою (той самий tie-break, що й день-клітинка місяця). */
  books: DayBookSummary[];
  sessions: SessionWithBookSummary[];
  /** RUN-AWARE (Фаза 19) — `session.id → runNumber`, лише коли `runNumber > 1` (перечитування).
   * Свідомо НЕ поширюється на нотатки/цитати (докладніше — `docs/CALENDAR_2_0.md` §"Run-aware
   * day details"). */
  runNumberBySessionId: Map<string, number>;
  /** "Почав читати"/"Завершив" — хронологічно (ВІЗУАЛЬНА КОМПОЗИЦІЯ, пост-Фаза 19). */
  timelineEvents: DayRunEvent[];
  /** "Збережено цього дня" — макс. 3, пріоритет обране→момент→думка→цитата→інше
   * (`rankJournalEntriesForDay`), уже spoiler-safe відфільтровано всередині
   * `JournalRepository.listFeedPage`. */
  journalItems: JournalFeedEntry[];
  /** Скільки journal_entry/quote цього дня приховано spoiler-safe режимом — для рядка "Ще N
   * записів приховано режимом «без спойлерів»." (0 → рядок не показується). */
  hiddenJournalCount: number;
  /** Решта типів подій ТЗ, що не мають власної секції вище (оцінка/полиця/додавання книги) —
   * `session_completed`/`book_started`/`book_finished`/`journal_entry`/`quote` тепер УСІ мають
   * власні, змістовніші секції (`books`+`sessions`, `timelineEvents`, `journalItems`), і
   * навмисно виключені звідси, щоб не дублюватись. */
  otherEvents: ActivityEvent[];
}

function emptyDayDetailsData(): DayDetailsData {
  return {
    books: [],
    sessions: [],
    runNumberBySessionId: new Map(),
    timelineEvents: [],
    journalItems: [],
    hiddenJournalCount: 0,
    otherEvents: [],
  };
}

/**
 * Деталі дня — "reading day" (ВІЗУАЛЬНА КОМПОЗИЦІЯ, пост-Фаза 19, `app/day/[date].tsx`). Той
 * самий діапазон-запит, що й раніше (`listStartedBetween` на межі одного дня), книжкові деталі
 * — ОДНИМ пакетним запитом (`listWithDetailsByIds`, тепер на об'єднання userBookId сесій ТА
 * run-подій дня, все одно один запит) — без N+1.
 */
export function useDaySessions(date: Date | undefined) {
  const dayKey = date ? format(date, DAY_KEY_FORMAT) : '';

  return useQuery<DayDetailsData>({
    queryKey: queryKeys.calendar.day(dayKey),
    queryFn: async () => {
      if (!date) return emptyDayDetailsData();
      const db = await getDatabase();
      const startIso = startOfDay(date).toISOString();
      const endIso = addDays(startOfDay(date), 1).toISOString();
      // `JournalRepository.listFeedPage`'s `dateTo` — межа ВКЛЮЧНА (на відміну від напіввідкритого
      // `[startIso, endIso)`, яким користується решта Календаря) — той самий "відняти 1мс від
      // виключної межі" підхід, що й `useReadingSeason.ts`'s `dateToInclusive`.
      const dateToInclusive = new Date(new Date(endIso).getTime() - 1).toISOString();

      const [sessions, events, runs, journalPage, hiddenJournalCount] = await Promise.all([
        ReadingSessionRepository.listStartedBetween(db, startIso, endIso),
        ActivityHistoryRepository.listBetween(db, startIso, endIso),
        ReadingRunRepository.listStartedOrFinishedBetween(db, startIso, endIso),
        JournalRepository.listFeedPage(db, { dateFrom: startIso, dateTo: dateToInclusive, limit: 50 }),
        ActivityHistoryRepository.countSpoilerHiddenJournalBetween(db, startIso, endIso),
      ]);

      const ranked = rankBooksForDay(sessions);

      const userBookIds = [...new Set([...sessions.map((s) => s.userBookId), ...runs.map((r) => r.userBookId)])];
      const userBooks = await UserBookRepository.listWithDetailsByIds(db, userBookIds);
      const userBookById = new Map(userBooks.map((ub) => [ub.id, ub]));

      const books: DayBookSummary[] = ranked
        .map((r) => {
          const userBook = userBookById.get(r.userBookId);
          return userBook
            ? { userBook, totalMinutes: r.totalMinutes, totalPages: r.totalPages, sessionCount: r.sessionCount }
            : null;
        })
        .filter((b): b is DayBookSummary => b !== null);

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

      const timelineEvents: DayRunEvent[] = [];
      for (const run of runs) {
        const userBook = userBookById.get(run.userBookId);
        if (!userBook) continue;
        if (run.startedAt >= startIso && run.startedAt < endIso) {
          timelineEvents.push({ type: 'started', occurredAt: run.startedAt, userBook });
        }
        if (run.finishedAt && run.finishedAt >= startIso && run.finishedAt < endIso) {
          timelineEvents.push({ type: 'finished', occurredAt: run.finishedAt, userBook });
        }
      }
      timelineEvents.sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0));

      const journalItems = rankJournalEntriesForDay(journalPage.items, 3);

      const eventTypesWithOwnSection = new Set<ActivityEvent['type']>([
        'session_completed',
        'book_started',
        'book_finished',
        'journal_entry',
        'quote',
      ]);
      const otherEvents = events.filter((e) => !eventTypesWithOwnSection.has(e.type));

      return { books, sessions: sessionSummaries, runNumberBySessionId, timelineEvents, journalItems, hiddenJournalCount, otherEvents };
    },
    enabled: !!date,
  });
}
