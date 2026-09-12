import {
  seasonDateRange,
  formatSeasonKey,
  parseSeasonKey,
  currentSeasonKey,
  adjacentSeasonKey,
  type SeasonKey,
} from './season';

describe('seasonDateRange', () => {
  it('прив\'язує зиму до пізнішого року — грудень попереднього до березня поточного', () => {
    expect(seasonDateRange('winter', 2026)).toEqual({
      start: '2025-12-01T00:00:00.000Z',
      end: '2026-03-01T00:00:00.000Z',
    });
  });

  it('весна/літо/осінь лишаються в межах одного календарного року', () => {
    expect(seasonDateRange('spring', 2026)).toEqual({
      start: '2026-03-01T00:00:00.000Z',
      end: '2026-06-01T00:00:00.000Z',
    });
    expect(seasonDateRange('summer', 2026)).toEqual({
      start: '2026-06-01T00:00:00.000Z',
      end: '2026-09-01T00:00:00.000Z',
    });
    expect(seasonDateRange('autumn', 2026)).toEqual({
      start: '2026-09-01T00:00:00.000Z',
      end: '2026-12-01T00:00:00.000Z',
    });
  });
});

describe('formatSeasonKey / parseSeasonKey', () => {
  it('round-trip для кожного сезону', () => {
    const keys: SeasonKey[] = [
      { seasonId: 'winter', year: 2026 },
      { seasonId: 'spring', year: 2026 },
      { seasonId: 'summer', year: 2026 },
      { seasonId: 'autumn', year: 2026 },
    ];
    for (const key of keys) {
      expect(parseSeasonKey(formatSeasonKey(key))).toEqual(key);
    }
  });

  it('повертає null для нерозпізнаного рядка', () => {
    expect(parseSeasonKey('literally-not-a-season')).toBeNull();
    expect(parseSeasonKey('winter-26')).toBeNull();
    expect(parseSeasonKey('')).toBeNull();
  });
});

describe('currentSeasonKey', () => {
  it('грудень належить зимі НАСТУПНОГО року', () => {
    expect(currentSeasonKey(new Date('2026-12-15T00:00:00.000Z'))).toEqual({ seasonId: 'winter', year: 2027 });
  });

  it('січень/лютий належать зимі того самого року', () => {
    expect(currentSeasonKey(new Date('2026-01-01T00:00:00.000Z'))).toEqual({ seasonId: 'winter', year: 2026 });
    expect(currentSeasonKey(new Date('2026-02-28T23:59:59.000Z'))).toEqual({ seasonId: 'winter', year: 2026 });
  });

  it('межа зима/весна — 1 березня', () => {
    expect(currentSeasonKey(new Date('2026-03-01T00:00:00.000Z'))).toEqual({ seasonId: 'spring', year: 2026 });
  });

  it('межа весна/літо — 1 червня', () => {
    expect(currentSeasonKey(new Date('2026-05-31T23:00:00.000Z'))).toEqual({ seasonId: 'spring', year: 2026 });
    expect(currentSeasonKey(new Date('2026-06-01T00:00:00.000Z'))).toEqual({ seasonId: 'summer', year: 2026 });
  });

  it('межа літо/осінь — 1 вересня', () => {
    expect(currentSeasonKey(new Date('2026-08-31T23:00:00.000Z'))).toEqual({ seasonId: 'summer', year: 2026 });
    expect(currentSeasonKey(new Date('2026-09-01T00:00:00.000Z'))).toEqual({ seasonId: 'autumn', year: 2026 });
  });

  it('межа осінь/зима — 1 грудня', () => {
    expect(currentSeasonKey(new Date('2026-11-30T23:00:00.000Z'))).toEqual({ seasonId: 'autumn', year: 2026 });
    expect(currentSeasonKey(new Date('2026-12-01T00:00:00.000Z'))).toEqual({ seasonId: 'winter', year: 2027 });
  });
});

describe('adjacentSeasonKey', () => {
  it('в межах року крок вперед не міняє рік (зима -> весна -> літо -> осінь)', () => {
    expect(adjacentSeasonKey({ seasonId: 'winter', year: 2026 }, 'next')).toEqual({ seasonId: 'spring', year: 2026 });
    expect(adjacentSeasonKey({ seasonId: 'spring', year: 2026 }, 'next')).toEqual({ seasonId: 'summer', year: 2026 });
    expect(adjacentSeasonKey({ seasonId: 'summer', year: 2026 }, 'next')).toEqual({ seasonId: 'autumn', year: 2026 });
  });

  it('з осені вперед — зима вже наступного року', () => {
    expect(adjacentSeasonKey({ seasonId: 'autumn', year: 2026 }, 'next')).toEqual({ seasonId: 'winter', year: 2027 });
  });

  it('із зими назад — осінь попереднього року', () => {
    expect(adjacentSeasonKey({ seasonId: 'winter', year: 2026 }, 'prev')).toEqual({ seasonId: 'autumn', year: 2025 });
  });

  it('в межах року крок назад не міняє рік', () => {
    expect(adjacentSeasonKey({ seasonId: 'spring', year: 2026 }, 'prev')).toEqual({ seasonId: 'winter', year: 2026 });
    expect(adjacentSeasonKey({ seasonId: 'summer', year: 2026 }, 'prev')).toEqual({ seasonId: 'spring', year: 2026 });
    expect(adjacentSeasonKey({ seasonId: 'autumn', year: 2026 }, 'prev')).toEqual({ seasonId: 'summer', year: 2026 });
  });

  it('повний цикл із 4 кроків вперед повертає той самий сезон, але рік вперед на 1', () => {
    // 4 сезони вперед — це рівно 12 місяців, тобто точно один календарний рік: "Весна 2026"
    // (березень-травень 2026) + 4 сезони = "Весна 2027" (березень-травень 2027), а НЕ та сама
    // "Весна 2026" — на відміну від зимового переходу (де рік у назві сезону й так уже
    // "зсунутий" на пізніший рік), тут коректна поведінка — саме зсув року, не його збереження.
    let key: SeasonKey = { seasonId: 'spring', year: 2026 };
    for (let i = 0; i < 4; i += 1) {
      key = adjacentSeasonKey(key, 'next');
    }
    expect(key).toEqual({ seasonId: 'spring', year: 2027 });
  });

  it('4 кроки вперед і 4 назад повертають вихідний сезон і рік', () => {
    const start: SeasonKey = { seasonId: 'winter', year: 2026 };
    let key = start;
    for (let i = 0; i < 4; i += 1) key = adjacentSeasonKey(key, 'next');
    for (let i = 0; i < 4; i += 1) key = adjacentSeasonKey(key, 'prev');
    expect(key).toEqual(start);
  });
});
