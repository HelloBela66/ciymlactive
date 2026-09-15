import type { RawProviderBook, ProviderSearchError } from '@/data/providers';

/**
 * POLYTSIA FOUNDATION FINAL POLISH — Search Provider Error Transparency (Task B/C).
 *
 * Чисті функції, що комбінують результати КІЛЬКОХ провайдерів (дедуплікація за ISBN, gate
 * "чи осіли безкоштовні джерела" для платного ISBNdb, "чи справді провалились УСІ джерела") —
 * винесені з `app/(tabs)/search.tsx` СЛОВО В СЛОВО (жодної зміни поведінки), лише щоб їх можна
 * було протестувати напряму (Jest не рендерить React Native компоненти без додаткової
 * інфраструктури — ці функції й так уже були чистими, без React/JSX, просто локальними
 * функціями файлу екрана). Той самий house-патерн, що й `calendarIntensity.ts`/
 * `calendarTopBooks.ts` — чиста логіка, окремо від UI-шару.
 */

/** Дедуплікація результатів пошуку між секціями за ISBN (Milestone 10 fix6,
 * `docs/STATUS_V1.md` п. 3.2) — докладне пояснення "чому саме ISBN і чому порядок секцій
 * важливий" лишається коментарем над викликом у `app/(tabs)/search.tsx`. */
export function isbnKey(book: RawProviderBook): string | null {
  return book.isbn13 ?? book.isbn10 ?? null;
}

export function dedupeAgainst(books: RawProviderBook[] | undefined, seen: ReadonlySet<string>): RawProviderBook[] {
  if (!books) return [];
  return books.filter((book) => {
    const key = isbnKey(book);
    return key === null || !seen.has(key);
  });
}

export function withSeen(books: RawProviderBook[] | undefined, seen: ReadonlySet<string>): Set<string> {
  const next = new Set(seen);
  for (const book of books ?? []) {
    const key = isbnKey(book);
    if (key !== null) next.add(key);
  }
  return next;
}

/** Мінімальна форма одного результату `useProviderSearch`, потрібна цим комбінаторам —
 * навмисно вужча за реальний `UseQueryResult`, щоб тести могли передавати прості об'єкти-
 * заглушки, не весь React Query API. */
export interface SettleCheckable {
  isLoading: boolean;
  data?: { items: unknown[]; error: ProviderSearchError | null };
}

/**
 * "Осіло" — допоміжна перевірка для gate платного ISBNdb (не запускати його, доки безкоштовні
 * джерела ще "думають"). Навмисно трактує "помилка джерела" так само, як "порожній результат",
 * ЛИШЕ для цієї gate-логіки — і навмисно трактує "джерело вже щось знайшло" як ЩЕ НЕ "осіло"
 * (платний пошук не потрібен, якщо безкоштовні джерела вже дали результат — джерело з
 * результатами просто ніколи не "звільняє" gate, бо ISBNdb і не мусить тоді вмикатись).
 */
export function isProviderSettled(result: SettleCheckable): boolean {
  return !result.isLoading && ((result.data?.items.length ?? 0) === 0 || result.data?.error != null);
}

/**
 * "Усі спробувані джерела провалились" (§19 ТЗ) — ≠ "нічого не знайдено". `true` лише коли:
 * усі передані результати вже завершились (не `isLoading`), жодна книга не потрапила в
 * підсумковий (уже дедуплікований) список, І кожен окремий результат несе саме `error`, а не
 * просто порожній успіх. Якщо хоч ОДНЕ джерело завершилось порожнім УСПІХОМ (не помилкою) —
 * це вже не "усі провалились", а "усі перевірили — і книги справді нема" (генуїнний empty
 * стан), і показувати банер-помилку тут було б оманливо.
 */
export function haveAllProvidersFailed(results: SettleCheckable[], totalDedupedResultCount: number): boolean {
  const allSettled = results.every((r) => !r.isLoading);
  const anySuccess = totalDedupedResultCount > 0;
  return allSettled && !anySuccess && results.every((r) => r.data?.error != null);
}
