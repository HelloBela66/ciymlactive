import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { WorkRepository, type WorkSearchResult } from '@/data/repositories/WorkRepository';
import { SeriesRepository } from '@/data/repositories/SeriesRepository';
import { ShelfRepository } from '@/data/repositories/ShelfRepository';
import { JournalRepository } from '@/data/repositories/JournalRepository';
import { queryKeys } from '@/lib/queryKeys';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import type { Series } from '@/types/series';
import type { ShelfWithCount } from '@/types/shelf';
import type { JournalFeedEntry } from '@/types/journalEntry';

export interface PersonalSearchResult {
  books: WorkSearchResult[];
  notes: JournalFeedEntry[];
  quotes: JournalFeedEntry[];
  series: Series[];
  shelves: ShelfWithCount[];
}

/**
 * «Глобальний особистий пошук» (POLYTSIA V1.5, Фаза 6) — окремий концепт від зовнішнього
 * `useProviderSearch`/`useBookSearch` (той, що шукає в Google Books/ISBNdb/спільному каталозі
 * для ДОДАВАННЯ нової книги): цей хук шукає лише серед того, що користувач уже має —
 * книги/автори (`WorkRepository.search`, той самий метод, що й локальна секція "у твоєму
 * каталозі" раніше), серії, полиці, нотатки й цитати щоденника. Повністю офлайн — жодного
 * мережевого запиту.
 *
 * П'ять паралельних SQLite-запитів замість одного об'єднаного — домени фізично незалежні
 * таблиці (work/series/shelf/note/quote), спільний SQL лише ускладнив би читання без
 * практичної переваги для обсягів одного користувача.
 */
export function usePersonalSearch(rawQuery: string) {
  const query = useDebouncedValue(rawQuery.trim(), 250);

  return useQuery<PersonalSearchResult>({
    queryKey: queryKeys.search.personal(query),
    queryFn: async () => {
      const db = await getDatabase();
      const [books, journal, series, shelves] = await Promise.all([
        WorkRepository.search(db, query),
        JournalRepository.searchFeed(db, query),
        SeriesRepository.search(db, query),
        ShelfRepository.search(db, query),
      ]);
      return { books, notes: journal.notes, quotes: journal.quotes, series, shelves };
    },
    enabled: query.length > 0,
  });
}
