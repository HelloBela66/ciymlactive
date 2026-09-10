import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { queryKeys } from '@/lib/queryKeys';
import type { ReadingSession } from '@/types/readingSession';

/**
 * Історія читання книги — лише завершені сесії (immutable-журнал, докладніше —
 * ReadingSessionRepository.listByUserBookId). Показується на Book Details під блоком
 * бібліотеки.
 */
export function useReadingHistory(userBookId: string | undefined) {
  return useQuery<ReadingSession[]>({
    queryKey: queryKeys.sessions.history(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return [];
      const db = await getDatabase();
      return ReadingSessionRepository.listByUserBookId(db, userBookId);
    },
    enabled: !!userBookId,
  });
}
