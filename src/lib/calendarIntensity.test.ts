import {
  rankBooksForDay,
  compactPrimarySecondary,
  selectPrimaryBookForDay,
  computeDayIntensity,
  sumMinutesForDay,
} from './calendarIntensity';

/** Хелпер — заповнює обов'язкові поля `DaySessionSummary`, які більшості тестів тут не
 * важливі (лише `startPage`/`endPage` за замовчуванням "без сторінок"), щоб кожен тест-кейс
 * писав лише те, що реально перевіряє. */
function s(overrides: {
  userBookId: string;
  durationSeconds?: number | null;
  startedAt?: string;
  startPage?: number;
  endPage?: number | null;
}) {
  return {
    durationSeconds: 0,
    startedAt: '2026-01-01T00:00:00.000Z',
    startPage: 0,
    endPage: null,
    ...overrides,
  };
}

describe('rankBooksForDay', () => {
  it('без сесій — порожній список', () => {
    expect(rankBooksForDay([])).toEqual([]);
  });

  it('одна книга — єдина в ранжуванні, з правильним підсумком', () => {
    const result = rankBooksForDay([
      s({ userBookId: 'book-1', durationSeconds: 600, startPage: 10, endPage: 25, startedAt: '2026-01-01T10:00:00.000Z' }),
    ]);
    expect(result).toEqual([
      { userBookId: 'book-1', totalMinutes: 10, totalPages: 15, sessionCount: 1, latestActivityAt: '2026-01-01T10:00:00.000Z' },
    ]);
  });

  it('рівень 1 (хвилини) — перемагає книга з більшою сумою хвилин за день, а не довшою окремою сесією', () => {
    // book-1: дві сесії по 20хв = 40хв. book-2: одна сесія 35хв. book-1 перемагає сумою.
    const ranked = rankBooksForDay([
      s({ userBookId: 'book-1', durationSeconds: 1200, startedAt: '2026-01-01T09:00:00.000Z' }),
      s({ userBookId: 'book-2', durationSeconds: 2100, startedAt: '2026-01-01T10:00:00.000Z' }),
      s({ userBookId: 'book-1', durationSeconds: 1200, startedAt: '2026-01-01T20:00:00.000Z' }),
    ]);
    expect(ranked.map((r) => r.userBookId)).toEqual(['book-1', 'book-2']);
  });

  it('рівень 2 (сторінки) — рівність хвилин, перемагає книга з більшою сумою сторінок', () => {
    const ranked = rankBooksForDay([
      s({ userBookId: 'book-1', durationSeconds: 600, startPage: 0, endPage: 10, startedAt: '2026-01-01T08:00:00.000Z' }),
      s({ userBookId: 'book-2', durationSeconds: 600, startPage: 0, endPage: 30, startedAt: '2026-01-01T09:00:00.000Z' }),
    ]);
    expect(ranked[0]?.userBookId).toBe('book-2');
    expect(ranked[1]?.userBookId).toBe('book-1');
  });

  it('рівень 3 (кількість сесій) — рівність хвилин і сторінок, перемагає книга з більшою кількістю сесій', () => {
    const ranked = rankBooksForDay([
      s({ userBookId: 'book-1', durationSeconds: 1200, startPage: 0, endPage: 20, startedAt: '2026-01-01T08:00:00.000Z' }),
      s({ userBookId: 'book-2', durationSeconds: 600, startPage: 0, endPage: 10, startedAt: '2026-01-01T09:00:00.000Z' }),
      s({ userBookId: 'book-2', durationSeconds: 600, startPage: 10, endPage: 20, startedAt: '2026-01-01T15:00:00.000Z' }),
    ]);
    // Обидві книги: 20хв, 20 стор. book-2 — 2 сесії проти 1 у book-1.
    expect(ranked[0]?.userBookId).toBe('book-2');
    expect(ranked[0]?.sessionCount).toBe(2);
    expect(ranked[1]?.userBookId).toBe('book-1');
  });

  it('рівень 4 (найновіша активність) — рівність хвилин/сторінок/сесій, перемагає книга з ПІЗНІШОЮ сесією дня', () => {
    const ranked = rankBooksForDay([
      s({ userBookId: 'book-1', durationSeconds: 600, startPage: 0, endPage: 10, startedAt: '2026-01-01T08:00:00.000Z' }),
      s({ userBookId: 'book-2', durationSeconds: 600, startPage: 0, endPage: 10, startedAt: '2026-01-01T20:00:00.000Z' }),
    ]);
    expect(ranked[0]?.userBookId).toBe('book-2');
    expect(ranked[1]?.userBookId).toBe('book-1');
  });

  it('3+ книги — повне ранжування за спадання хвилин', () => {
    const ranked = rankBooksForDay([
      s({ userBookId: 'book-a', durationSeconds: 300 }),
      s({ userBookId: 'book-b', durationSeconds: 900 }),
      s({ userBookId: 'book-c', durationSeconds: 600 }),
    ]);
    expect(ranked.map((r) => r.userBookId)).toEqual(['book-b', 'book-c', 'book-a']);
  });

  it('3 книги — довжина ранжування 3, отже additionalBookCount = ranked.length - 2 = 1 (UI: 2 обкладинки + "+1")', () => {
    const ranked = rankBooksForDay([
      s({ userBookId: 'book-a', durationSeconds: 300 }),
      s({ userBookId: 'book-b', durationSeconds: 200 }),
      s({ userBookId: 'book-c', durationSeconds: 100 }),
    ]);
    expect(ranked).toHaveLength(3);
    expect(Math.max(0, ranked.length - 2)).toBe(1);
  });

  it('5 книг — довжина ранжування 5, отже additionalBookCount = ranked.length - 2 = 3 (UI: 2 обкладинки + "+3")', () => {
    const ranked = rankBooksForDay([
      s({ userBookId: 'book-a', durationSeconds: 500 }),
      s({ userBookId: 'book-b', durationSeconds: 400 }),
      s({ userBookId: 'book-c', durationSeconds: 300 }),
      s({ userBookId: 'book-d', durationSeconds: 200 }),
      s({ userBookId: 'book-e', durationSeconds: 100 }),
    ]);
    expect(ranked).toHaveLength(5);
    expect(Math.max(0, ranked.length - 2)).toBe(3);
  });

  it('перечитування — сесії різних ReadingRun ТІЄЇ САМОЇ книги (один userBookId) зливаються в ОДИН запис ранжування, не дублюються', () => {
    // rankBooksForDay навмисно не знає про readingRunId — групування виключно за userBookId,
    // тож сесії прочитання №1 і прочитання №2 тієї самої книги природно об'єднуються в один
    // запис (одна картка/обкладинка дня), а не дві — жодного "дубльованого заголовка".
    const ranked = rankBooksForDay([
      s({ userBookId: 'book-reread', durationSeconds: 600, startedAt: '2026-01-01T08:00:00.000Z' }),
      s({ userBookId: 'book-reread', durationSeconds: 900, startedAt: '2026-01-01T20:00:00.000Z' }),
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({ userBookId: 'book-reread', totalMinutes: 25, sessionCount: 2 });
  });

  it('null durationSeconds трактується як 0 хвилин, не ламає підрахунок', () => {
    const ranked = rankBooksForDay([
      s({ userBookId: 'book-1', durationSeconds: null, startedAt: '2026-01-01T08:00:00.000Z' }),
      s({ userBookId: 'book-2', durationSeconds: 60, startedAt: '2026-01-01T09:00:00.000Z' }),
    ]);
    expect(ranked[0]?.userBookId).toBe('book-2');
  });

  it('від\'ємна/відсутня дельта сторінок рахується як 0, не як помилка', () => {
    const ranked = rankBooksForDay([s({ userBookId: 'book-1', startPage: 50, endPage: 40 })]);
    expect(ranked[0]?.totalPages).toBe(0);
  });
});

describe('selectPrimaryBookForDay', () => {
  it('без сесій — null', () => {
    expect(selectPrimaryBookForDay([])).toBeNull();
  });

  it('одна книга — вона й перемагає', () => {
    expect(selectPrimaryBookForDay([s({ userBookId: 'book-1', durationSeconds: 600 })])).toBe('book-1');
  });

  it('делегує повний tie-break ланцюжок до rankBooksForDay (перший елемент ранжування)', () => {
    const sessions = [
      s({ userBookId: 'book-1', durationSeconds: 600, startPage: 0, endPage: 10, startedAt: '2026-01-01T08:00:00.000Z' }),
      s({ userBookId: 'book-2', durationSeconds: 600, startPage: 0, endPage: 30, startedAt: '2026-01-01T09:00:00.000Z' }),
    ];
    expect(selectPrimaryBookForDay(sessions)).toBe(rankBooksForDay(sessions)[0]?.userBookId);
    expect(selectPrimaryBookForDay(sessions)).toBe('book-2');
  });
});

describe('computeDayIntensity', () => {
  it('0 хвилин — рівень 0', () => {
    expect(computeDayIntensity(0)).toBe(0);
  });

  it('від\'ємне значення (захисно) — рівень 0', () => {
    expect(computeDayIntensity(-5)).toBe(0);
  });

  it('до 30 хвилин включно — рівень 1', () => {
    expect(computeDayIntensity(1)).toBe(1);
    expect(computeDayIntensity(30)).toBe(1);
  });

  it('від 31 до 90 хвилин включно — рівень 2', () => {
    expect(computeDayIntensity(31)).toBe(2);
    expect(computeDayIntensity(90)).toBe(2);
  });

  it('понад 90 хвилин — рівень 3', () => {
    expect(computeDayIntensity(91)).toBe(3);
    expect(computeDayIntensity(500)).toBe(3);
  });
});

describe('sumMinutesForDay', () => {
  it('той самий вираз, що й sumSessionMinutes (тонка обгортка)', () => {
    expect(sumMinutesForDay([{ durationSeconds: 90 }, { durationSeconds: 30 }])).toBe(3);
    expect(sumMinutesForDay([])).toBe(0);
  });
});

describe('compactPrimarySecondary', () => {
  it('порожній список id — обидва null', () => {
    expect(compactPrimarySecondary([], new Map())).toEqual({ primary: null, secondary: null });
  });

  it('одна книга — лише primary, secondary null', () => {
    const byId = new Map([['book-1', { title: 'Книга 1' }]]);
    expect(compactPrimarySecondary(['book-1'], byId)).toEqual({ primary: { title: 'Книга 1' }, secondary: null });
  });

  it('дві книги — primary+secondary у порядку вхідного масиву id', () => {
    const byId = new Map([
      ['book-1', { title: 'Книга 1' }],
      ['book-2', { title: 'Книга 2' }],
    ]);
    expect(compactPrimarySecondary(['book-1', 'book-2'], byId)).toEqual({
      primary: { title: 'Книга 1' },
      secondary: { title: 'Книга 2' },
    });
  });

  it('м\'яко видалена (не знайдена в byId) primary-книга — ущільнюється: secondary "підіймається" на місце primary', () => {
    // book-1 (мав бути primary) відсутній у byId (наприклад, м'яко видалений з бібліотеки
    // ПІСЛЯ того, як сесія була записана) — ущільнення зсуває book-2 на позицію primary, а не
    // лишає "діру" (primary: null, secondary: book-2).
    const byId = new Map([['book-2', { title: 'Книга 2' }]]);
    expect(compactPrimarySecondary(['book-1', 'book-2'], byId)).toEqual({
      primary: { title: 'Книга 2' },
      secondary: null,
    });
  });

  it('обидві книги не знайдені (обидві видалені) — обидва null, без падіння', () => {
    expect(compactPrimarySecondary(['book-1', 'book-2'], new Map())).toEqual({ primary: null, secondary: null });
  });
});
