import {
  buildSearchQueries,
  estimatePageBudget,
  excludeCandidates,
  pickCandidate,
  pickLanguageTier,
  PURPOSE_KEYWORDS,
  rankCandidates,
  recommendationBookKey,
  TIME_BUDGET_OPTIONS,
  type RecommendationPurpose,
} from './tomorrowRecommendation';
import type { RawProviderBook } from '@/data/providers';

function book(overrides: Partial<RawProviderBook> = {}): RawProviderBook {
  return {
    externalId: 'ext-1',
    title: 'Книга',
    authors: ['Автор'],
    ...overrides,
  };
}

describe('estimatePageBudget', () => {
  it('множить хвилини на темп і округлює', () => {
    expect(estimatePageBudget(270, 0.5)).toBe(135);
  });

  it('ніколи не повертає менше 1 (навіть при нульовому темпі)', () => {
    expect(estimatePageBudget(90, 0)).toBe(1);
  });
});

describe('buildSearchQueries', () => {
  it('перший запит — лише жанр (гарантовано широкий), решта — жанр + варіант ключового слова мети', () => {
    const purposes: RecommendationPurpose[] = ['light', 'cry', 'laugh', 'absorbed'];
    for (const purpose of purposes) {
      const queries = buildSearchQueries('Фентезі', purpose);
      expect(queries).toHaveLength(PURPOSE_KEYWORDS[purpose].length + 1);
      expect(queries[0]).toBe('Фентезі');
      for (const query of queries.slice(1)) {
        expect(query.startsWith('Фентезі ')).toBe(true);
      }
    }
  });

  it('не лишає зайвого пробілу і не додає порожній жанр-запит, коли назва жанру порожня', () => {
    const queries = buildSearchQueries('  ', 'laugh');
    expect(queries).toEqual([...PURPOSE_KEYWORDS.laugh]);
  });
});

describe('TIME_BUDGET_OPTIONS', () => {
  it('чотири пресети, зростаючі за хвилинами', () => {
    expect(TIME_BUDGET_OPTIONS).toHaveLength(4);
    const minutes = TIME_BUDGET_OPTIONS.map((o) => o.minutesMid);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
  });
});

describe('recommendationBookKey', () => {
  it('пріоритет isbn13 над isbn10', () => {
    const key = recommendationBookKey(book({ isbn13: '9780000000001', isbn10: '0000000001' }));
    expect(key).toBe('9780000000001');
  });

  it('isbn10, коли isbn13 відсутній', () => {
    const key = recommendationBookKey(book({ isbn13: undefined, isbn10: '0000000001' }));
    expect(key).toBe('0000000001');
  });

  it('фолбек на сам externalId, коли ISBN узагалі немає', () => {
    const key = recommendationBookKey(book({ isbn13: undefined, isbn10: undefined, externalId: 'abc123' }));
    expect(key).toBe('abc123');
  });
});

describe('excludeCandidates', () => {
  it('прибирає лише книги з ключем у переданому наборі', () => {
    const books = [book({ externalId: 'a', isbn13: undefined, isbn10: undefined }), book({ externalId: 'b', isbn13: undefined, isbn10: undefined })];
    const result = excludeCandidates(books, new Set(['a']));
    expect(result.map((b) => b.externalId)).toEqual(['b']);
  });
});

describe('rankCandidates', () => {
  it('сортує за близькістю pageCount до бюджету, найближче — перше', () => {
    const books = [
      book({ externalId: 'far', pageCount: 500 }),
      book({ externalId: 'exact', pageCount: 200 }),
      book({ externalId: 'near', pageCount: 220 }),
    ];
    const ranked = rankCandidates(books, 200);
    expect(ranked.map((c) => c.book.externalId)).toEqual(['exact', 'near', 'far']);
  });

  it('книга без pageCount отримує помірний штраф (не завжди останню/першу позицію)', () => {
    const books = [
      book({ externalId: 'unknown', pageCount: undefined }),
      book({ externalId: 'far', pageCount: 900 }),
      book({ externalId: 'close', pageCount: 210 }),
    ];
    const ranked = rankCandidates(books, 200);
    // "unknown" (штраф 200*0.35=70) має бути ближче за "far" (дистанція 700), але далі за "close" (10).
    expect(ranked.map((c) => c.book.externalId)).toEqual(['close', 'unknown', 'far']);
  });
});

describe('pickLanguageTier', () => {
  it('перший непорожній рівень перемагає, з confirmed для рівня 0', () => {
    const strict = [book({ externalId: 'a' })];
    const result = pickLanguageTier([strict, [], []]);
    expect(result.confidence).toBe('confirmed');
    expect(result.books).toBe(strict);
  });

  it('відступає до слабшого рівня, коли суворіший порожній — confidence unverified', () => {
    const weaker = [book({ externalId: 'b' })];
    const result = pickLanguageTier([[], weaker, []]);
    expect(result.confidence).toBe('unverified');
    expect(result.books).toBe(weaker);
  });

  it('коли всі рівні порожні — порожній результат, unverified', () => {
    const result = pickLanguageTier([[], [], []]);
    expect(result.confidence).toBe('unverified');
    expect(result.books).toEqual([]);
  });

  it('порожній масив рівнів — те саме, що всі рівні порожні', () => {
    expect(pickLanguageTier([])).toEqual({ books: [], confidence: 'unverified' });
  });
});

describe('pickCandidate', () => {
  it('повертає null для порожнього списку', () => {
    expect(pickCandidate([], 5, () => 0)).toBeNull();
  });

  it('з фіксованим rng детерміновано обирає елемент пулу за індексом', () => {
    const ranked = rankCandidates(
      [book({ externalId: 'a', pageCount: 100 }), book({ externalId: 'b', pageCount: 200 }), book({ externalId: 'c', pageCount: 300 })],
      100,
    );
    expect(pickCandidate(ranked, 5, () => 0)?.book.externalId).toBe('a');
    expect(pickCandidate(ranked, 5, () => 0.99)?.book.externalId).toBe('c');
  });

  it('обмежує пул до poolSize навіть коли кандидатів більше', () => {
    const many = Array.from({ length: 10 }, (_, i) => book({ externalId: `b${i}`, pageCount: i * 10 }));
    const ranked = rankCandidates(many, 0);
    // rng, що завжди повертає значення "майже 1" — мав би вказати на останній елемент пулу,
    // а не на останній елемент усього (більшого) списку кандидатів.
    const picked = pickCandidate(ranked, 3, () => 0.999);
    expect(ranked.indexOf(picked!)).toBeLessThan(3);
  });
});
