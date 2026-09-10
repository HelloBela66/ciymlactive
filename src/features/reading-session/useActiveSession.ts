import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { queryKeys } from '@/lib/queryKeys';
import type { ReadingSession } from '@/types/readingSession';

/**
 * Незавершена сесія читання будь-де в застосунку (`ended_at IS NULL`) — щонайбільше одна
 * одночасно (докладніше — ReadingSessionRepository). Використовується і для "продовжити" на
 * Book Details, і для банера відновлення "осиротілої" сесії на Home після relaunch.
 */
export function useActiveSession() {
  return useQuery<ReadingSession | null>({
    queryKey: queryKeys.sessions.active,
    queryFn: async () => {
      const db = await getDatabase();
      return ReadingSessionRepository.getActiveSession(db);
    },
  });
}
