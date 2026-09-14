import {
  sumSessionMinutes,
  sumSessionPages,
  computeBusiestMonth,
  filterFinishedInRange,
  computeTopGenreAmong,
  computeActiveDays,
  computeDominantReadingExperience,
  MIN_SESSIONS_FOR_READING_EXPERIENCE,
} from './readingAggregates';

describe('sumSessionMinutes', () => {
  it('порожній масив — 0', () => {
    expect(sumSessionMinutes([])).toBe(0);
  });

  it('округлює КОЖНУ сесію окремо, тоді сумує', () => {
    // 90с → round(1.5) = 2; 30с → round(0.5) = 1 (round-half-up); разом 3, НЕ round((90+30)/60)=2
    expect(sumSessionMinutes([{ durationSeconds: 90 }, { durationSeconds: 30 }])).toBe(3);
  });

  it('null durationSeconds трактується як 0', () => {
    expect(sumSessionMinutes([{ durationSeconds: null }, { durationSeconds: 600 }])).toBe(10);
  });
});

describe('sumSessionPages', () => {
  it('порожній масив — 0', () => {
    expect(sumSessionPages([])).toBe(0);
  });

  it('сумує додатну дельту endPage - startPage', () => {
    expect(
      sumSessionPages([
        { startPage: 10, endPage: 25 },
        { startPage: 25, endPage: 40 },
      ]),
    ).toBe(30);
  });

  it('endPage відсутній — 0 сторінок для цієї сесії, не помилка', () => {
    expect(sumSessionPages([{ startPage: 10, endPage: null }])).toBe(0);
  });

  it('від\'ємна дельта обрізається знизу нулем', () => {
    expect(sumSessionPages([{ startPage: 50, endPage: 40 }])).toBe(0);
  });
});

describe('computeBusiestMonth', () => {
  it('немає сесій — null', () => {
    expect(computeBusiestMonth([])).toBeNull();
  });

  it('обирає місяць з найбільшою кількістю сесій (UTC)', () => {
    const result = computeBusiestMonth([
      { startedAt: '2026-01-05T10:00:00.000Z' },
      { startedAt: '2026-03-01T10:00:00.000Z' },
      { startedAt: '2026-03-15T10:00:00.000Z' },
      { startedAt: '2026-03-20T10:00:00.000Z' },
    ]);
    expect(result).toEqual({ month: 3, sessionsCount: 3 });
  });

  it('рівність — перемагає місяць, що зустрівся першим у вхідному масиві', () => {
    const result = computeBusiestMonth([
      { startedAt: '2026-05-01T10:00:00.000Z' },
      { startedAt: '2026-02-01T10:00:00.000Z' },
    ]);
    expect(result).toEqual({ month: 5, sessionsCount: 1 });
  });
});

describe('filterFinishedInRange', () => {
  const range = { start: '2026-01-01T00:00:00.000Z', end: '2027-01-01T00:00:00.000Z' };

  it('лишає лише книги з finishedAt у межах [start, end)', () => {
    const books = [
      { id: 'a', finishedAt: '2026-06-15T00:00:00.000Z' },
      { id: 'b', finishedAt: '2025-12-31T23:59:59.000Z' },
      { id: 'c', finishedAt: '2027-01-01T00:00:00.000Z' },
      { id: 'd', finishedAt: null },
    ];
    expect(filterFinishedInRange(books, range).map((b) => b.id)).toEqual(['a']);
  });

  it('межа start включна', () => {
    const books = [{ id: 'a', finishedAt: range.start }];
    expect(filterFinishedInRange(books, range).map((b) => b.id)).toEqual(['a']);
  });

  it('межа end виключна', () => {
    const books = [{ id: 'a', finishedAt: range.end }];
    expect(filterFinishedInRange(books, range)).toEqual([]);
  });
});

describe('computeTopGenreAmong', () => {
  it('немає книг — null', () => {
    expect(computeTopGenreAmong([])).toBeNull();
  });

  it('книга з кількома жанрами рахується в кожен', () => {
    const result = computeTopGenreAmong([
      ['Фентезі', 'Пригоди'],
      ['Фентезі'],
    ]);
    expect(result).toEqual({ name: 'Фентезі', count: 2 });
  });

  it('рівність — перемагає жанр, що зустрівся першим у вхідному масиві', () => {
    const result = computeTopGenreAmong([['Детектив'], ['Романтика']]);
    expect(result).toEqual({ name: 'Детектив', count: 1 });
  });

  it('книга без жанрів (порожній список) не ламає підрахунок', () => {
    const result = computeTopGenreAmong([[], ['Наука'], ['Наука']]);
    expect(result).toEqual({ name: 'Наука', count: 2 });
  });
});

/** POLYTSIA V1.6.2, #167 — READING SEASONS, ТЗ §44: "активні дні" сезону. */
describe('computeActiveDays', () => {
  it('немає сесій — 0', () => {
    expect(computeActiveDays([])).toBe(0);
  });

  it('кілька сесій того самого UTC-дня рахуються як один день', () => {
    const result = computeActiveDays([
      { startedAt: '2026-07-01T08:00:00.000Z' },
      { startedAt: '2026-07-01T21:00:00.000Z' },
    ]);
    expect(result).toBe(1);
  });

  it('сесії різних днів рахуються окремо', () => {
    const result = computeActiveDays([
      { startedAt: '2026-07-01T08:00:00.000Z' },
      { startedAt: '2026-07-02T08:00:00.000Z' },
      { startedAt: '2026-07-10T08:00:00.000Z' },
    ]);
    expect(result).toBe(3);
  });
});

/** POLYTSIA V1.6.2, #167 — READING SEASONS, ТЗ §50: "Як читалося" — insight, який може чесно
 * мовчати, якщо сесій із розпізнаним значенням замало (`MIN_SESSIONS_FOR_READING_EXPERIENCE`). */
describe('computeDominantReadingExperience', () => {
  it('немає сесій — null', () => {
    expect(computeDominantReadingExperience([])).toBeNull();
  });

  it(`менше за ${MIN_SESSIONS_FOR_READING_EXPERIENCE} розпізнаних сесій — null, навіть з одностайною відповіддю`, () => {
    const sessions = Array.from({ length: MIN_SESSIONS_FOR_READING_EXPERIENCE - 1 }, () => ({
      readingExperience: 'engaging',
    }));
    expect(computeDominantReadingExperience(sessions)).toBeNull();
  });

  it(`рівно ${MIN_SESSIONS_FOR_READING_EXPERIENCE} розпізнаних сесій — рахує домінантне значення`, () => {
    const sessions = Array.from({ length: MIN_SESSIONS_FOR_READING_EXPERIENCE }, () => ({
      readingExperience: 'calm',
    }));
    expect(computeDominantReadingExperience(sessions)).toBe('calm');
  });

  it('нерозпізнане/null значення не рахується в поріг вибірки', () => {
    const sessions = [
      { readingExperience: 'engaging' },
      { readingExperience: 'engaging' },
      { readingExperience: 'engaging' },
      { readingExperience: null },
      { readingExperience: 'not-a-real-value' },
    ];
    // лише 3 розпізнані сесії — менше порогу, навіть якщо вхідний масив довший.
    expect(computeDominantReadingExperience(sessions)).toBeNull();
  });

  it('рівність — перемагає значення, що зустрілось першим у вхідному масиві', () => {
    const sessions = [
      { readingExperience: 'engaging' },
      { readingExperience: 'calm' },
      { readingExperience: 'engaging' },
      { readingExperience: 'calm' },
      { readingExperience: 'difficult' },
    ];
    expect(computeDominantReadingExperience(sessions)).toBe('engaging');
  });

  it('чітка більшість серед розпізнаних сесій — повертає її', () => {
    const sessions = [
      { readingExperience: 'engaging' },
      { readingExperience: 'engaging' },
      { readingExperience: 'engaging' },
      { readingExperience: 'calm' },
      { readingExperience: 'calm' },
    ];
    expect(computeDominantReadingExperience(sessions)).toBe('engaging');
  });
});
