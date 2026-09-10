import { computeJournalTimelineMarkers } from './journalTimeline';
import type { JournalEntry } from '@/types/journalEntry';

/** Мінімальна фабрика запису щоденника для тестів — лише поля, що впливають на позиціонування
 * (`page`/`progressPercent`) чи категорію (`isFavorite`/`kind`/`type`), решта — стабільні
 * заглушки, той самий підхід, що й `session()` у `bookStats.test.ts`. */
function entry(overrides: Partial<JournalEntry> & Pick<JournalEntry, 'id'>): JournalEntry {
  return {
    kind: 'note',
    userBookId: 'ub-1',
    editionId: null,
    sessionId: null,
    page: null,
    progressPercent: null,
    type: 'thought',
    categoryId: null,
    text: 'text',
    comment: null,
    tags: [],
    isFavorite: false,
    // POLYTSIA V1.5, Фаза 11 («ПОВЕРНУТИСЯ ПІЗНІШЕ») — заглушка на кшталт `isFavorite` вище,
    // не впливає на позиціонування/категорію маркера, тож не є частиною `overrides` у жодному
    // з тестів нижче.
    revisitLater: false,
    reaction: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeJournalTimelineMarkers', () => {
  it('returns an empty array for no entries', () => {
    expect(computeJournalTimelineMarkers([], 300)).toEqual([]);
  });

  it('places a single entry at its progressPercent', () => {
    const markers = computeJournalTimelineMarkers([entry({ id: 'a', progressPercent: 40 })], 300);
    expect(markers).toEqual([{ percent: 40, category: 'thought', entries: [expect.objectContaining({ id: 'a' })] }]);
  });

  it('falls back to page/pageCount when progressPercent is absent', () => {
    // 60/300 = 20%.
    const markers = computeJournalTimelineMarkers([entry({ id: 'a', page: 60 })], 300);
    expect(markers[0]?.percent).toBe(20);
  });

  it('prefers progressPercent over the page/pageCount fallback when both are present', () => {
    // `bucketPercent: 1` тут навмисно (не типове 2) — цей кейс перевіряє пріоритет
    // `progressPercent` над `page`/`pageCount`, а не арифметику бакетизації; 77 саме по
    // собі не кратне 2, тож із типовим кроком воно округлилось би до найближчого кошика
    // (78) і затуляло б те, що саме тут перевіряється.
    const markers = computeJournalTimelineMarkers([entry({ id: 'a', page: 1, progressPercent: 77 })], 300, 1);
    expect(markers[0]?.percent).toBe(77);
  });

  it('excludes entries with neither progressPercent nor a resolvable page/pageCount', () => {
    const markers = computeJournalTimelineMarkers(
      [entry({ id: 'no-position' }), entry({ id: 'has-position', progressPercent: 10 })],
      null,
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]?.entries.map((e) => e.id)).toEqual(['has-position']);
  });

  it('clamps out-of-range progressPercent defensively into [0, 100]', () => {
    const markers = computeJournalTimelineMarkers(
      [entry({ id: 'low', progressPercent: -15 }), entry({ id: 'high', progressPercent: 140 })],
      300,
    );
    const percents = markers.map((m) => m.percent).sort((a, b) => a - b);
    expect(percents).toEqual([0, 100]);
  });

  it('clusters entries within the same bucket into one marker', () => {
    // 40 і 41 НЕ підходять для цього кейса: `Math.round(41 / 2) * 2` округлює 41 до 42, а не
    // до 40 (JS `Math.round` округлює `.5` вгору) — тобто вони вже потрапили б у різні кошики
    // й не перевірили б власне кластеризацію. 40 і 40.9 обидва округлюються до того самого
    // кошика (40) при кроці 2, що й є суттю тесту.
    const markers = computeJournalTimelineMarkers(
      [entry({ id: 'a', progressPercent: 40 }), entry({ id: 'b', progressPercent: 40.9 })],
      300,
      2,
    );
    expect(markers).toHaveLength(1);
    expect(markers[0]?.entries.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });

  it('keeps entries in separate markers when far enough apart for the bucket size', () => {
    const markers = computeJournalTimelineMarkers(
      [entry({ id: 'a', progressPercent: 10 }), entry({ id: 'b', progressPercent: 90 })],
      300,
      2,
    );
    expect(markers).toHaveLength(2);
  });

  it('resolves category by priority: favorite beats quote, quote beats moment, moment beats thought', () => {
    const favoriteWins = computeJournalTimelineMarkers(
      [
        entry({ id: 'a', progressPercent: 50, kind: 'quote' }),
        entry({ id: 'b', progressPercent: 50, isFavorite: true, type: 'general' }),
      ],
      300,
      2,
    );
    expect(favoriteWins[0]?.category).toBe('favorite');

    const quoteWins = computeJournalTimelineMarkers(
      [
        entry({ id: 'a', progressPercent: 50, type: 'moment' }),
        entry({ id: 'b', progressPercent: 50, kind: 'quote' }),
      ],
      300,
      2,
    );
    expect(quoteWins[0]?.category).toBe('quote');

    const momentWins = computeJournalTimelineMarkers(
      [
        entry({ id: 'a', progressPercent: 50, type: 'thought' }),
        entry({ id: 'b', progressPercent: 50, type: 'moment' }),
      ],
      300,
      2,
    );
    expect(momentWins[0]?.category).toBe('moment');
  });

  it('falls back to the thought category for unlisted note types (question/theory/general)', () => {
    const markers = computeJournalTimelineMarkers([entry({ id: 'a', progressPercent: 50, type: 'question' })], 300);
    expect(markers[0]?.category).toBe('thought');
  });

  it('sorts markers by percent ascending', () => {
    // `bucketPercent: 1` — це кейс про порядок сортування, не про бакетизацію; з типовим
    // кроком 2 сам `5` округлився б до 6 (`Math.round(5 / 2) * 2`) і зробив би очікуваний
    // результат неочевидним для читача тесту.
    const markers = computeJournalTimelineMarkers(
      [entry({ id: 'a', progressPercent: 80 }), entry({ id: 'b', progressPercent: 5 }), entry({ id: 'c', progressPercent: 40 })],
      300,
      1,
    );
    expect(markers.map((m) => m.percent)).toEqual([5, 40, 80]);
  });

  it('sorts entries within a marker by page, then createdAt, with pageless entries last', () => {
    const markers = computeJournalTimelineMarkers(
      [
        entry({ id: 'no-page', progressPercent: 50, createdAt: '2026-01-01T00:00:00.000Z' }),
        entry({ id: 'page-20', progressPercent: 50, page: 20, createdAt: '2026-01-02T00:00:00.000Z' }),
        entry({ id: 'page-10', progressPercent: 50, page: 10, createdAt: '2026-01-03T00:00:00.000Z' }),
      ],
      300,
      2,
    );
    expect(markers[0]?.entries.map((e) => e.id)).toEqual(['page-10', 'page-20', 'no-page']);
  });
});
