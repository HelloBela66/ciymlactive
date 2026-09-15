import {
  sumSessionMinutes,
  sumSessionPages,
  computeBusiestMonth,
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

  it('обирає місяць з найбільшою кількістю сесій (за ЛОКАЛЬНИМ календарем)', () => {
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

/**
 * POLYTSIA V1.7 — тести `filterFinishedInRange` ВИЛУЧЕНІ разом із самою функцією
 * (`docs/V1_7_READING_LIFE.md`). Вона відбирала книги за `UserBook.finishedAt` — полем живої
 * картки книги, а не за завершенням конкретного прохождення, — і разом із
 * `listByStatus('finished')` давала зникнення перечитаних і soft-deleted книг із минулих
 * періодів. Canonical-відповідник — `ReadingRunRepository.listFinishedBetween` +
 * `src/lib/readingPeriodSummary.ts`, покриті власними тестами.
 */

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

/**
 * POLYTSIA V1.6.2, #167 — READING SEASONS, ТЗ §44: "активні дні" сезону.
 *
 * POLYTSIA V1.7 — тести переписані разом із самою функцією
 * (`docs/V1_7_TEMPORAL_SEMANTICS.md`). Раніше вони фіксували UTC-поведінку жорстко закодованими
 * `...Z`-рядками, і один із них був timezone-крихким: дві сесії `08:00Z` і `21:00Z` того самого
 * UTC-дня — це ОДИН день лише в UTC; у Києві (+3) друга припадає вже на наступну добу, тож тест
 * проходив у CI (UTC) і провалився б на реальному пристрої користувача. Тепер моменти будуються
 * з ЛОКАЛЬНИХ компонентів і переводяться в instant через `.toISOString()` — інваріант істинний
 * у будь-якому поясі, включно з UTC.
 */
describe('computeActiveDays', () => {
  it('немає сесій — 0', () => {
    expect(computeActiveDays([])).toBe(0);
  });

  it('кілька сесій того самого ЛОКАЛЬНОГО дня рахуються як один день', () => {
    const result = computeActiveDays([
      { startedAt: new Date(2026, 6, 1, 8, 0).toISOString() },
      { startedAt: new Date(2026, 6, 1, 21, 0).toISOString() },
    ]);
    expect(result).toBe(1);
  });

  it('сесії різних днів рахуються окремо', () => {
    const result = computeActiveDays([
      { startedAt: new Date(2026, 6, 1, 8, 0).toISOString() },
      { startedAt: new Date(2026, 6, 2, 8, 0).toISOString() },
      { startedAt: new Date(2026, 6, 10, 8, 0).toISOString() },
    ]);
    expect(result).toBe(3);
  });

  it('23:50 і 00:30 наступної доби — ДВА активні дні (регресія V1.7, нічне читання)', () => {
    const result = computeActiveDays([
      { startedAt: new Date(2026, 6, 1, 23, 50).toISOString() },
      { startedAt: new Date(2026, 6, 2, 0, 30).toISOString() },
    ]);
    expect(result).toBe(2);
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
