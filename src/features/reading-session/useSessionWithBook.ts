import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { queryKeys } from '@/lib/queryKeys';
import type { ReadingSession } from '@/types/readingSession';
import type { UserBookWithDetails } from '@/types/userBook';

export interface SessionWithBook {
  session: ReadingSession;
  userBook: UserBookWithDetails;
}

/** Сесія разом з книгою (назва/автор/обкладинка) — для екрана активної сесії читання. */
export function useSessionWithBook(sessionId: string | undefined) {
  return useQuery<SessionWithBook | null>({
    queryKey: queryKeys.sessions.detail(sessionId ?? ''),
    queryFn: async () => {
      if (!sessionId) return null;
      const db = await getDatabase();
      const session = await ReadingSessionRepository.getById(db, sessionId);
      if (!session) return null;
      const userBook = await UserBookRepository.getByIdWithDetails(db, session.userBookId);
      if (!userBook) return null;
      return { session, userBook };
    },
    enabled: !!sessionId,
  });
}
