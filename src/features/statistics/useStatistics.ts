import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { queryKeys } from '@/lib/queryKeys';
import { computeStreaks } from '@/lib/streaks';
import { sumSessionMinutes, sumSessionPages } from '@/lib/readingAggregates';
import { dayRange, readingDayKey, readingDayKeyOf } from '@/lib/readingCalendar';

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

/**
 * Загальна статистика (розділ 30 ТЗ) — `streaks.ts` (чиста функція, окремо перевірена й
 * протестована) для поточного/найдовшого streak, `readingAggregates.ts` (Фаза 15,
 * `docs/MY_READING.md`) для сум хвилин/сторінок "сьогодні".
 *
 * POLYTSIA V1.6.2, #168 (ANALYTICS PERFORMANCE): раніше — один `ReadingSessionRepository.
 * listAllCompleted(db)` (уся історія завершених сесій користувача) і все далі рахувалось у JS
 * над цим повним масивом, включно з "сьогодні" (`sessions.filter(s => s.startedAt.slice(0,10)
 * === todayKey)`) — фільтр вузького діапазону поверх УЖЕ витягнутого повного набору, той самий
 * клас марнотратності, що `ReadingGoalRepository.getProgress` уже мав і виправив у Фазі 15
 * (`listStartedBetween`). Цей хук — найгарячіший з-поміж усієї аналітики застосунку (монтується
 * на Home і в Профілі, `app/(tabs)/index.tsx`/`app/(tabs)/profile/index.tsx`/
 * `app/completion/[workId].tsx`), тож тут це найбільше окупається:
 * - `totalMinutes`/`totalPages`/`totalSessions` — один SQL-агрегат
 *   (`getLifetimeCompletedTotals`, та сама конвенція округлення хвилин на сесію, що й
 *   `sumSessionMinutes` — докладніше доккоментар методу);
 * - `activeDaysCount`/вхід для `computeStreaks` — лише моменти початку сесій
 *   (`listCompletedStartInstants`, одна колонка), не повні рядки сесій;
 * - "сьогодні" — окремий вузький діапазонний запит (`listStartedBetween` на межах локальної
 *   доби), а не фільтр повного набору в JS.
 *
 * POLYTSIA V1.7 — ВИПРАВЛЕНО ЖИВИЙ TIMEZONE-БАГ (`docs/V1_7_TEMPORAL_SEMANTICS.md` §3.1).
 * До цієї фази тут було ДВА різні уявлення про день в одному запиті:
 * - `todayKey` рахувався `format(new Date(), 'yyyy-MM-dd')` — ЛОКАЛЬНИЙ день пристрою;
 * - `listByStartedDayKey` порівнював його з `substr(started_at, 1, 10)` — UTC-днем.
 * Ключ і колонка були в різних системах координат. Наслідок для Києва (UTC+2/+3): кожне читання
 * між 00:00 і 03:00 місцевого часу не потрапляло в "сьогодні" — екран показував «сьогодні 0
 * хвилин» одразу після завершеної сесії. Той самий розрив ламав streak: `computeStreaks`
 * отримував UTC-ключі днів, але локальний `todayKey`, тож "сьогодні" могло не збігтися з
 * останнім активним днем і серія обривалась на рівному місці.
 *
 * Тепер обидві величини рахує одна canonical-семантика (`src/lib/readingCalendar.ts`):
 * "сьогодні" — діапазон локальної доби, переведений в інстанти (`dayRange`); ключі днів —
 * `readingDayKey` над моментами початку сесій. Жодного string-prefix зіставлення дат.
 */
export function useOverallStatistics() {
  return useQuery<OverallStatistics>({
    queryKey: queryKeys.statistics.overall,
    queryFn: async () => {
      const db = await getDatabase();
      const now = new Date();
      const todayKey = readingDayKeyOf(now);
      const today = dayRange(now);

      // `listStatusOnly` замість `listByStatus` (Milestone 8, продуктивність) — тут
      // потрібні лише `finishedAt`/кількість, а `listByStatus` тягнув би повний
      // edition/work/authors/publisher/translators на кожну завершену книгу даремно.
      const [lifetimeTotals, startInstants, todaySessions, finishedBooks] = await Promise.all([
        ReadingSessionRepository.getLifetimeCompletedTotals(db),
        ReadingSessionRepository.listCompletedStartInstants(db),
        ReadingSessionRepository.listStartedBetween(db, today.startIso, today.endIso),
        UserBookRepository.listStatusOnly(db, 'finished'),
      ]);

      // Унікальні ЛОКАЛЬНІ дні, відсортовані — рівно той контракт, що його очікує
      // `computeStreaks` (і той самий, що раніше давав `SELECT DISTINCT ... ORDER BY`, лише
      // тепер у правильному часовому поясі).
      const activeDayKeys = [...new Set(startInstants.map(readingDayKey))].sort();

      const { current, longest } = computeStreaks(activeDayKeys, todayKey);
      const todayMinutes = sumSessionMinutes(todaySessions);
      const todayPages = sumSessionPages(todaySessions);

      // `getFullYear()` на локальному `Date` — уже локальний рік, тож тут розбіжності не було;
      // лишається без змін. Перехід цього лічильника на run-based canonical-агрегацію
      // (`readingPeriodSummary.ts`) робить Phase 6 разом із Year Recap, де "чи рахувати
      // перечитування окремою книгою" — продуктове питання, а не технічне.
      const currentYear = now.getFullYear();
      const booksFinishedThisYear = finishedBooks.filter(
        (ub) => ub.finishedAt != null && new Date(ub.finishedAt).getFullYear() === currentYear,
      ).length;

      return {
        totalMinutes: lifetimeTotals.totalMinutes,
        totalPages: lifetimeTotals.totalPages,
        totalSessions: lifetimeTotals.totalSessions,
        booksFinishedAllTime: finishedBooks.length,
        booksFinishedThisYear,
        activeDaysCount: activeDayKeys.length,
        currentStreak: current,
        longestStreak: longest,
        today: { minutes: todayMinutes, pages: todayPages },
      };
    },
  });
}
