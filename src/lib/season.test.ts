import {
  seasonDateRange,
  formatSeasonKey,
  parseSeasonKey,
  currentSeasonKey,
  adjacentSeasonKey,
  formatSeasonLabel,
  formatSeasonHeroTitle,
  type SeasonKey,
} from './season';

/**
 * POLYTSIA V1.7 (`docs/V1_7_TEMPORAL_SEMANTICS.md`) — тести меж сезону переписані разом із
 * `seasonDateRange`. Раніше вони звіряли межі з жорстко закодованими UTC-рядками
 * (`'2026-06-01T00:00:00.000Z'`). Це фіксувало саме ту помилку, яку V1.7 виправляє: межа сезону
 * проводилась опівночі UTC, а не опівночі за місцевим часом, тож у Києві читання 1 червня о
 * 01:00 ще належало ВЕСНІ. Такий тест до того ж проходив би лише в UTC-оточенні (CI) і падав
 * на реальному пристрої користувача.
 *
 * Тепер перевіряються ЛОКАЛЬНІ компоненти межі — інваріант, істинний у будь-якому поясі.
 */
describe('seasonDateRange — межі за ЛОКАЛЬНИМ календарем', () => {
  function localParts(iso: string): { year: number; month: number; day: number; hour: number } {
    const date = new Date(iso);
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours() };
  }

  it('прив\'язує зиму до пізнішого року — грудень попереднього до березня поточного', () => {
    const range = seasonDateRange('winter', 2026);
    expect(localParts(range.start)).toEqual({ year: 2025, month: 12, day: 1, hour: 0 });
    expect(localParts(range.end)).toEqual({ year: 2026, month: 3, day: 1, hour: 0 });
  });

  it('весна/літо/осінь лишаються в межах одного календарного року', () => {
    expect(localParts(seasonDateRange('spring', 2026).start)).toEqual({ year: 2026, month: 3, day: 1, hour: 0 });
    expect(localParts(seasonDateRange('spring', 2026).end)).toEqual({ year: 2026, month: 6, day: 1, hour: 0 });
    expect(localParts(seasonDateRange('summer', 2026).start)).toEqual({ year: 2026, month: 6, day: 1, hour: 0 });
    expect(localParts(seasonDateRange('summer', 2026).end)).toEqual({ year: 2026, month: 9, day: 1, hour: 0 });
    expect(localParts(seasonDateRange('autumn', 2026).start)).toEqual({ year: 2026, month: 9, day: 1, hour: 0 });
    expect(localParts(seasonDateRange('autumn', 2026).end)).toEqual({ year: 2026, month: 12, day: 1, hour: 0 });
  });

  it('сезони межують без щілин і перекриття', () => {
    expect(seasonDateRange('spring', 2026).end).toBe(seasonDateRange('summer', 2026).start);
    expect(seasonDateRange('summer', 2026).end).toBe(seasonDateRange('autumn', 2026).start);
    expect(seasonDateRange('autumn', 2026).end).toBe(seasonDateRange('winter', 2027).start);
  });

  it('читання 1 червня о 00:30 локального часу належить ЛІТУ, а не весні (регресія V1.7)', () => {
    const juneFirstNight = new Date(2026, 5, 1, 0, 30).toISOString();
    const summer = seasonDateRange('summer', 2026);
    const spring = seasonDateRange('spring', 2026);
    expect(juneFirstNight >= summer.start).toBe(true);
    expect(juneFirstNight < summer.end).toBe(true);
    expect(juneFirstNight >= spring.end).toBe(true);
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

/**
 * POLYTSIA V1.7 — моменти будуються з ЛОКАЛЬНИХ компонентів (`new Date(2026, 11, 15)`), а не з
 * UTC-рядків (`new Date('2026-12-15T00:00:00.000Z')`), бо `currentSeasonKey` тепер визначає
 * місяць локально (`docs/V1_7_TEMPORAL_SEMANTICS.md`). Старий варіант проходив лише в UTC чи за
 * додатного offset: для UTC−5 момент `2026-03-01T00:00:00Z` — це ще 28 лютого локально, тобто
 * ЗИМА, і межовий тест падав би на реальному пристрої.
 */
describe('currentSeasonKey', () => {
  it('грудень належить зимі НАСТУПНОГО року', () => {
    expect(currentSeasonKey(new Date(2026, 11, 15, 12, 0))).toEqual({ seasonId: 'winter', year: 2027 });
  });

  it('січень/лютий належать зимі того самого року', () => {
    expect(currentSeasonKey(new Date(2026, 0, 1, 0, 0))).toEqual({ seasonId: 'winter', year: 2026 });
    expect(currentSeasonKey(new Date(2026, 1, 28, 23, 59))).toEqual({ seasonId: 'winter', year: 2026 });
  });

  it('межа зима/весна — 1 березня', () => {
    expect(currentSeasonKey(new Date(2026, 1, 28, 23, 59))).toEqual({ seasonId: 'winter', year: 2026 });
    expect(currentSeasonKey(new Date(2026, 2, 1, 0, 0))).toEqual({ seasonId: 'spring', year: 2026 });
  });

  it('межа весна/літо — 1 червня', () => {
    expect(currentSeasonKey(new Date(2026, 4, 31, 23, 0))).toEqual({ seasonId: 'spring', year: 2026 });
    expect(currentSeasonKey(new Date(2026, 5, 1, 0, 30))).toEqual({ seasonId: 'summer', year: 2026 });
  });

  it('межа літо/осінь — 1 вересня', () => {
    expect(currentSeasonKey(new Date(2026, 7, 31, 23, 0))).toEqual({ seasonId: 'summer', year: 2026 });
    expect(currentSeasonKey(new Date(2026, 8, 1, 0, 30))).toEqual({ seasonId: 'autumn', year: 2026 });
  });

  it('межа осінь/зима — 1 грудня', () => {
    expect(currentSeasonKey(new Date(2026, 10, 30, 23, 0))).toEqual({ seasonId: 'autumn', year: 2026 });
    expect(currentSeasonKey(new Date(2026, 11, 1, 0, 30))).toEqual({ seasonId: 'winter', year: 2027 });
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

/**
 * POLYTSIA V1.6.2, #167 — `formatSeasonLabel` фіксує баг, який `seasonDateRange` уже рахував
 * правильно, але текст підпису показував лише пізніший рік БЕЗ діапазону ("Зима 2027" замість
 * "Зима 2026/27") — розбіжність була лише в рядку показу, не в самій даті. Тести нижче
 * перевіряють кілька РІЗНИХ років для зими (не лише один випадковий приклад), щоб довести, що
 * рахується саме різниця років (`year - 1` / `slice(2)`), а не захардкожений рядок.
 */
describe('formatSeasonLabel', () => {
  it('зима — діапазон років через слеш ("<рік-1>/<останні 2 цифри року>")', () => {
    expect(formatSeasonLabel('winter', 2027)).toBe('Зима 2026/27');
  });

  it('інші три сезони — просто "<Назва> <рік>", без діапазону', () => {
    expect(formatSeasonLabel('spring', 2026)).toBe('Весна 2026');
    expect(formatSeasonLabel('summer', 2026)).toBe('Літо 2026');
    expect(formatSeasonLabel('autumn', 2026)).toBe('Осінь 2026');
  });

  it('зимовий рік-суфікс коректний для різних років — не лише випадково збігається для 2027', () => {
    expect(formatSeasonLabel('winter', 2020)).toBe('Зима 2019/20');
    expect(formatSeasonLabel('winter', 2000)).toBe('Зима 1999/00');
    expect(formatSeasonLabel('winter', 2101)).toBe('Зима 2100/01');
  });
});

describe('formatSeasonHeroTitle', () => {
  it('"<Назва сезону> твого читання" — довша емоційна форма, окремо від короткого formatSeasonLabel', () => {
    expect(formatSeasonHeroTitle('summer')).toBe('Літо твого читання');
    expect(formatSeasonHeroTitle('winter')).toBe('Зима твого читання');
    expect(formatSeasonHeroTitle('spring')).toBe('Весна твого читання');
    expect(formatSeasonHeroTitle('autumn')).toBe('Осінь твого читання');
  });
});
