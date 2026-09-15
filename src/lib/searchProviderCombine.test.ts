import {
  isbnKey,
  dedupeAgainst,
  withSeen,
  isProviderSettled,
  haveAllProvidersFailed,
  type SettleCheckable,
} from './searchProviderCombine';
import type { RawProviderBook, ProviderSearchError } from '@/data/providers';

/**
 * POLYTSIA FOUNDATION FINAL POLISH — Task B/C (`docs/FOUNDATION_FINAL_POLISH_REPORT.md`).
 *
 * Ці функції — саме ТОЙ шар, що вирішує на екрані Пошуку "показати результати всіх джерел, чи
 * показати banner 'не вдалося завантажити результати пошуку цілком'" (§19 ТЗ): раніше ця логіка
 * жила виключно всередині `app/(tabs)/search.tsx` (React-компонент, важко тестувати напряму без
 * додаткової RTL-інфраструктури) — винесена сюди СЛОВО В СЛОВО (`src/lib/searchProviderCombine.ts`,
 * докладніше коментар там), тому ці тести доводять реальний production-шлях комбінування
 * кількох провайдерів, а не ізольований helper.
 */

function book(overrides: Partial<RawProviderBook> = {}): RawProviderBook {
  return {
    externalId: overrides.externalId ?? 'ext-1',
    title: overrides.title ?? 'Назва',
    authors: overrides.authors ?? ['Автор'],
    ...overrides,
  };
}

function err(kind: ProviderSearchError['kind']): ProviderSearchError {
  return { kind };
}

function settled(overrides: Partial<SettleCheckable> = {}): SettleCheckable {
  return { isLoading: false, ...overrides };
}

describe('searchProviderCombine.isbnKey / dedupeAgainst / withSeen', () => {
  it('isbn13 має пріоритет над isbn10', () => {
    expect(isbnKey(book({ isbn13: '978-1', isbn10: '1-1' }))).toBe('978-1');
  });

  it('без isbn13 — fallback на isbn10', () => {
    expect(isbnKey(book({ isbn10: '1-1' }))).toBe('1-1');
  });

  it('без жодного ISBN — null (ніколи не дедуплікується)', () => {
    expect(isbnKey(book({}))).toBeNull();
  });

  it('dedupeAgainst прибирає книги, чий ISBN уже "бачений", лишає книги без ISBN завжди', () => {
    const seen = new Set(['978-1']);
    const books = [book({ externalId: 'a', isbn13: '978-1' }), book({ externalId: 'b', isbn13: '978-2' }), book({ externalId: 'c' })];
    const result = dedupeAgainst(books, seen);
    expect(result.map((b) => b.externalId)).toEqual(['b', 'c']);
  });

  it('dedupeAgainst(undefined, ...) — порожній масив, не падає', () => {
    expect(dedupeAgainst(undefined, new Set())).toEqual([]);
  });

  it('withSeen накопичує ISBN через кілька викликів (порядок секцій екрана Пошуку)', () => {
    const afterCatalog = withSeen([book({ isbn13: '978-1' })], new Set());
    const afterCurated = withSeen([book({ isbn13: '978-2' })], afterCatalog);
    expect(afterCurated.has('978-1')).toBe(true);
    expect(afterCurated.has('978-2')).toBe(true);
  });

  it('наскрізний сценарій: та сама книга (спільний ISBN) у каталозі й у Google Books — Google-секція її не повторює', () => {
    const catalogBooks = [book({ externalId: 'catalog-1', isbn13: '978-1' })];
    const googleBooks = [book({ externalId: 'google-1', isbn13: '978-1' }), book({ externalId: 'google-2', isbn13: '978-3' })];

    const seenAfterCatalog = withSeen(catalogBooks, new Set());
    const dedupedGoogle = dedupeAgainst(googleBooks, seenAfterCatalog);

    expect(dedupedGoogle.map((b) => b.externalId)).toEqual(['google-2']);
  });
});

describe('searchProviderCombine.isProviderSettled', () => {
  it('ще завантажується — НЕ осіло, незалежно від наявних даних', () => {
    expect(isProviderSettled({ isLoading: true })).toBe(false);
    expect(isProviderSettled({ isLoading: true, data: { items: [], error: null } })).toBe(false);
  });

  it('завершено, даних ще нема (undefined) — осіло (трактується як порожньо)', () => {
    expect(isProviderSettled(settled())).toBe(true);
  });

  it('завершено, успіх із порожнім результатом — осіло', () => {
    expect(isProviderSettled(settled({ data: { items: [], error: null } }))).toBe(true);
  });

  it('завершено, успіх ІЗ книгами — НЕ осіло (платному ISBNdb вмикатись не потрібно)', () => {
    expect(isProviderSettled(settled({ data: { items: [book()], error: null } }))).toBe(false);
  });

  it('завершено, з помилкою (навіть якщо items порожній) — осіло (помилка трактується як порожньо для цього gate)', () => {
    expect(isProviderSettled(settled({ data: { items: [], error: err('server') } }))).toBe(true);
  });
});

describe('searchProviderCombine.haveAllProvidersFailed', () => {
  it('хоч одне джерело ще завантажується — false', () => {
    const results: SettleCheckable[] = [
      { isLoading: true },
      settled({ data: { items: [], error: err('server') } }),
    ];
    expect(haveAllProvidersFailed(results, 0)).toBe(false);
  });

  it('усі завершені, ОДНЕ успішно повернуло книги — false (успіх ≠ провал)', () => {
    const results: SettleCheckable[] = [
      settled({ data: { items: [book()], error: null } }),
      settled({ data: { items: [], error: err('server') } }),
    ];
    // totalDedupedResultCount відображає реальний підсумок після дедуплікації — тут 1 книга.
    expect(haveAllProvidersFailed(results, 1)).toBe(false);
  });

  it('усі завершені, ВСІ ПОМИЛКА (429 + 500 + мережа) — true, це і є "усі провалились"', () => {
    const results: SettleCheckable[] = [
      settled({ data: { items: [], error: err('rate_limited') } }),
      settled({ data: { items: [], error: err('server') } }),
      settled({ data: { items: [], error: err('network') } }),
    ];
    expect(haveAllProvidersFailed(results, 0)).toBe(true);
  });

  it('усі завершені, УСІ порожні, АЛЕ жодної помилки (справжній "нічого не знайдено") — false', () => {
    const results: SettleCheckable[] = [
      settled({ data: { items: [], error: null } }),
      settled({ data: { items: [], error: null } }),
    ];
    expect(haveAllProvidersFailed(results, 0)).toBe(false);
  });

  it('одне джерело впало, ІНШЕ успішно порожнє (не помилка) — false: не всі "провалились", лише реально нічого нема', () => {
    const results: SettleCheckable[] = [
      settled({ data: { items: [], error: err('server') } }),
      settled({ data: { items: [], error: null } }),
    ];
    expect(haveAllProvidersFailed(results, 0)).toBe(false);
  });

  it('одне джерело впало, ІНШЕ успішно з книгами — false, і жодна книга не "губиться" з підрахунку', () => {
    const results: SettleCheckable[] = [
      settled({ data: { items: [], error: err('server') } }),
      settled({ data: { items: [book(), book({ externalId: 'ext-2' })], error: null } }),
    ];
    expect(haveAllProvidersFailed(results, 2)).toBe(false);
  });
});
