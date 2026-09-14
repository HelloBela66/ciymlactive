import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { getDatabase } from '@/data/db';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { queryKeys } from '@/lib/queryKeys';
import { computeStreaks } from '@/lib/streaks';
import { sumSessionMinutes, sumSessionPages } from '@/lib/readingAggregates';

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
 * - `activeDaysCount`/вхід для `computeStreaks` — лише УНІКАЛЬНІ ключі днів
 *   (`listDistinctActiveDayKeys`), не повні рядки сесій;
 * - "сьогодні" — окремий вузький запит (`listByStartedDayKey(todayKey)`), що повертає лише
 *   сесії сьогоднішнього `dayKey`, а не фільтрує їх із повного набору в JS; побайтово той самий
 *   `dayKey`-рядок, що й раніше (SQLite `substr` ідентичний JS `.slice(0,10)`), тож поведінка
 *   (включно з тим, що `todayKey` рахується за ЛОКАЛЬНИМ часом пристрою, а `started_at` у БД —
 *   UTC) НЕ змінена цією фазою — лише спосіб, яким дістається той самий результат.
 */
export function useOverallStatistics() {
  return useQuery<OverallStatistics>({
    queryKey: queryKeys.statistics.overall,
    queryFn: async () => {
      const db = await getDatabase();
      const todayKey = format(new Date(), DAY_KEY_FORMAT);

      // `listStatusOnly` замість `listByStatus` (Milestone 8, продуктивність) — тут
      // потрібні лише `finishedAt`/кількість, а `listByStatus` тягнув би повний
      // edition/work/authors/publisher/translators на кожну завершену книгу даремно.
      const [lifetimeTotals, activeDayKeys, todaySessions, finishedBooks] = await Promise.all([
        ReadingSessionRepository.getLifetimeCompletedTotals(db),
        ReadingSessionRepository.listDistinctActiveDayKeys(db),
        ReadingSessionRepository.listByStartedDayKey(db, todayKey),
        UserBookRepository.listStatusOnly(db, 'finished'),
      ]);

      const { current, longest } = computeStreaks(activeDayKeys, todayKey);
      const todayMinutes = sumSessionMinutes(todaySessions);
      const todayPages = sumSessionPages(todaySessions);

      const currentYear = new Date().getFullYear();
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
