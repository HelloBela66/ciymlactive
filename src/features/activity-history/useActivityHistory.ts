import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { ActivityHistoryRepository } from '@/data/repositories/ActivityHistoryRepository';
import { queryKeys } from '@/lib/queryKeys';
import type { ActivityEvent } from '@/types/activityEvent';

/**
 * ТЗ Фази 12 (READING ACTIVITY HISTORY) — один запит на всю похідну стрічку подій
 * (`ActivityHistoryRepository.listRecent`), той самий "один query на весь екран" підхід, що й
 * `useOverallStatistics`. Групування по днях (ТЗ: "Group by date") — на рівні екрана
 * (`groupActivityEventsByDate`, `src/lib/activityHistory.ts`), не тут: хук лишається простою
 * обгорткою над репозиторієм, без власної логіки.
 */
export function useActivityHistory() {
  return useQuery<ActivityEvent[]>({
    queryKey: queryKeys.activityHistory.recent,
    queryFn: async () => {
      const db = await getDatabase();
      return ActivityHistoryRepository.listRecent(db);
    },
  });
}
