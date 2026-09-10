import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { filterUkrainianBooks } from '@/data/providers/ukrainianFilter';
import type { BookMetadataProvider, RawProviderBook } from '@/data/providers';

/**
 * Пошук через один конкретний провайдер (Milestone 7). Окремий хук на провайдер (а не один
 * "усі одразу") — щоб Google Books і Open Library мали незалежні loading/error стани: якщо
 * один провайдер впав чи повільний, це не ховає результати іншого (docs/BOOK_PROVIDERS.md,
 * "degradation-safe"). Провайдер сам ловить мережеві помилки й повертає `[]` — тут `isError`
 * практично ніколи не спрацює, але лишається на випадок несподіваного винятку.
 *
 * `signal` з React Query прокидається у `provider.searchBooks` — коли користувач набирає
 * далі до відповіді сервера, попередній (уже застарілий) запит скасовується замість того,
 * щоб долетіти й даремно з'їсти ліміт безключового Google Books API (реальна знахідка з
 * тестування на пристрої: швидкий набір з паузами між словами легко ловить HTTP 429).
 *
 * `select: filterUkrainianBooks` — явне прохання користувача після реального тесту
 * (`docs/BOOK_PROVIDERS.md` / `src/data/providers/ukrainianFilter.ts`): пошук має показувати
 * лише видання, які справді виглядають українськомовними, а не будь-яке видання будь-якою
 * мовою. Фільтр застосовано в `select`, а не в самому провайдері — кеш React Query лишається
 * "сирим" (весь відповідний запит), фільтрація лише на рівні відображення, тож її легко
 * послабити/зробити опціональною пізніше без повторних мережевих запитів.
 *
 * `options.enabled` (Milestone 8.2) — додаткова умова ЗВЕРХУ базової (`provider.isEnabled &&
 * query.length >= 3`), а не заміна її: використовується екраном пошуку, щоб не викликати
 * платний ISBNdb, доки спільний каталог/безкоштовні джерела ще не "осіли" з порожнім
 * результатом (`app/(tabs)/search.tsx`).
 */
export function useProviderSearch(
  provider: BookMetadataProvider,
  rawQuery: string,
  options?: { enabled?: boolean },
) {
  const query = useDebouncedValue(rawQuery.trim(), 500);
  const extraEnabled = options?.enabled ?? true;

  return useQuery<RawProviderBook[], Error, RawProviderBook[]>({
    queryKey: queryKeys.providerSearch.byProvider(provider.id, query),
    queryFn: ({ signal }) => provider.searchBooks(query, signal),
    select: filterUkrainianBooks,
    enabled: provider.isEnabled && query.length >= 3 && extraEnabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
