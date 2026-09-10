import { useQuery } from '@tanstack/react-query';
import { SharedCatalogClient } from '@/data/remote/sharedCatalogClient';
import { sharedCatalogRowToRawBook } from '@/data/providers';
import type { RawProviderBook } from '@/data/providers';
import { queryKeys } from '@/lib/queryKeys';

const TRENDS_LIMIT = 10;

export interface TrendingBook {
  rank: number;
  book: RawProviderBook;
  addedCount: number;
}

/**
 * «Тренди» (Milestone 11, доповнення, пряме прохання власника продукту): топ-10 книг за
 * кількістю РІЗНИХ пристроїв, що зберегли їх собі в бібліотеку (`catalog_top_books`,
 * `supabase/schema.sql` — та сама анонімна per-device агрегація, що вже рахує `added_count`
 * для бейджа "Хтось уже додав цю книгу" в звичайному пошуку, `app/(tabs)/search.tsx`, лише
 * тут — окремий відсортований список замість побічного поля).
 *
 * Свідомо НЕ бере участі кураторська добірка (`curated_book`): «Тренди» мають лишатись
 * сигналом органічного вибору справжніх користувачів, а не тим, що порадив алгоритм
 * рекомендацій — інакше "популярне" почало б означати "часто пропоноване", а не "часто
 * обране", і сама метрика втратила б сенс.
 *
 * `useQuery`, не `useMutation`: це список для перегляду, який має сенс кешувати й
 * автоматично рефетчити (`staleTime` коротший за `useProviderSearch`, бо тут немає
 * дороговартісного зовнішнього API — лише власний Supabase). Без конфігурованого спільного
 * каталогу (`isSharedCatalogConfigured`) `SharedCatalogClient.topBooks` сам поверне `[]` —
 * той самий degradation-safe підхід, що й решта клієнта, тож екран просто покаже порожній
 * стан замість помилки.
 */
export function useTrendingBooks() {
  return useQuery<TrendingBook[], Error>({
    queryKey: queryKeys.trends.top,
    queryFn: async ({ signal }) => {
      const rows = await SharedCatalogClient.topBooks(TRENDS_LIMIT, signal);
      return rows.map((row, index) => ({
        rank: index + 1,
        book: sharedCatalogRowToRawBook(row),
        addedCount: row.added_count,
      }));
    },
    staleTime: 2 * 60 * 1000,
    retry: false,
  });
}
