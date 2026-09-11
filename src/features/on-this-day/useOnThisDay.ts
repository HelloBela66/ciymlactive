import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { OnThisDayRepository } from '@/data/repositories/OnThisDayRepository';
import { RatingRepository } from '@/data/repositories/RatingRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { queryKeys } from '@/lib/queryKeys';
import { applySpoilerRules, buildOnThisDaySummary, computeLocalOffsetModifier, computeMonthDay } from '@/lib/onThisDay';
import type { OnThisDaySummary } from '@/types/onThisDay';

/**
 * POLYTSIA V1.6, Фаза 3 («Цей день у твоєму читанні») — уся SQL/композиція в ОДНОМУ `queryFn`
 * (той самий підхід, що й `useStatistics.ts`), а не кілька окремих `useQuery`: рейтинги й
 * активні (reading/rereading) книги для spoiler-евристики потрібні лише ЯК ВХІД для чистих
 * функцій `src/lib/onThisDay.ts`, не як самостійний UI-стан — окремий хук на кожен із них
 * означав би зайві проміжні ре-рендери й складнішу координацію без жодної користі.
 *
 * `UserBookRepository.listByStatus('reading'/'rereading')` — навмисно ті самі, вже наявні
 * методи, що й `useLibraryByStatus` (Бібліотека, Home "Зараз читаєш") — жодного нового
 * repository-методу заради spoiler-мапи не додано (`applySpoilerRules` у `src/lib/onThisDay.ts`
 * пояснює, чому мапа обмежена саме цими двома статусами).
 */
export function useOnThisDay() {
  const now = new Date();
  const monthDay = computeMonthDay(now);

  return useQuery<OnThisDaySummary>({
    queryKey: queryKeys.onThisDay.forMonthDay(monthDay),
    queryFn: async () => {
      const db = await getDatabase();
      const offsetModifier = computeLocalOffsetModifier(now);
      const rawEvents = await OnThisDayRepository.listByMonthDay(db, monthDay, offsetModifier);

      const finishedUserBookIds = [...new Set(rawEvents.filter((e) => e.source === 'finished').map((e) => e.userBookId))];
      const ratings = await RatingRepository.listByUserBookIds(db, finishedUserBookIds);
      const ratingsByUserBookId = new Map([...ratings.entries()].map(([userBookId, rating]) => [userBookId, rating.value]));

      let summary = buildOnThisDaySummary(rawEvents, ratingsByUserBookId, now);

      if (summary.totalCount > 0) {
        const [reading, rereading] = await Promise.all([
          UserBookRepository.listByStatus(db, 'reading'),
          UserBookRepository.listByStatus(db, 'rereading'),
        ]);
        const activePageByWorkId = new Map<string, number>();
        for (const userBook of [...reading, ...rereading]) {
          activePageByWorkId.set(userBook.work.id, userBook.currentPage);
        }
        summary = applySpoilerRules(summary, activePageByWorkId);
      }

      return summary;
    },
  });
}
