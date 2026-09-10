import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { WorkRepository, type WorkSearchResult } from '@/data/repositories/WorkRepository';
import { queryKeys } from '@/lib/queryKeys';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

/**
 * Локальний пошук по каталогу (Milestone 1). Дебаунсить ввід і повертає порожній результат
 * без запиту до БД для порожнього рядка — див. WorkRepository.search.
 */
export function useBookSearch(rawQuery: string) {
  const query = useDebouncedValue(rawQuery.trim(), 250);

  return useQuery<WorkSearchResult[]>({
    queryKey: queryKeys.works.search(query),
    queryFn: async () => {
      const db = await getDatabase();
      return WorkRepository.search(db, query);
    },
    enabled: query.length > 0,
  });
}

/** Останні додані книги — показуються в пошуку, поки користувач ще нічого не ввів. */
export function useRecentWorks() {
  return useQuery<WorkSearchResult[]>({
    queryKey: queryKeys.works.recent(),
    queryFn: async () => {
      const db = await getDatabase();
      return WorkRepository.listRecent(db);
    },
  });
}
