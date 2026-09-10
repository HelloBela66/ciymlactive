import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { JournalRepository } from '@/data/repositories/JournalRepository';
import { queryKeys } from '@/lib/queryKeys';
import type { ReadingSession } from '@/types/readingSession';
import type { JournalEntry } from '@/types/journalEntry';

export interface ReadingContinuityInfo {
  lastSession: ReadingSession | null;
  lastEntry: JournalEntry | null;
}

/**
 * Дані для картки "Зараз читаєш" на Home (ТЗ Фази 8 — READING CONTINUITY: current page /
 * progress / last reading date-time / duration останньої сесії / last journal entry preview) —
 * остання завершена сесія й останній запис щоденника, пакетно для ВСЬОГО видимого списку книг
 * одразу (`Promise.all` двох batch-репозиторних методів), а не окремим запитом на кожну
 * картку — той самий принцип продуктивності, що й решта Home-віджетів
 * (`ShelfRepository.listNamesByUserBookIds`, `UserBookRepository.attachDetailsBatch`).
 *
 * `userBookIds` — очікується малий, стабільний список (щонайбільше `HOME_READING_LIST_LIMIT`
 * з `app/(tabs)/index.tsx`); порожній масив (до завантаження `useLibraryByStatus('reading')`
 * чи коли жодної книги в статусі "reading" немає) — нормальний, очікуваний стан, запит просто
 * не виконується (`enabled`).
 */
export function useReadingContinuity(userBookIds: string[]) {
  return useQuery<Map<string, ReadingContinuityInfo>>({
    queryKey: queryKeys.sessions.continuity(userBookIds),
    queryFn: async () => {
      const db = await getDatabase();
      const [sessions, entries] = await Promise.all([
        ReadingSessionRepository.listLastCompletedByUserBookIds(db, userBookIds),
        JournalRepository.listLatestByUserBookIds(db, userBookIds),
      ]);

      const result = new Map<string, ReadingContinuityInfo>();
      for (const id of userBookIds) {
        result.set(id, { lastSession: sessions.get(id) ?? null, lastEntry: entries.get(id) ?? null });
      }
      return result;
    },
    enabled: userBookIds.length > 0,
  });
}
