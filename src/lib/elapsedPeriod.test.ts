import {
  formatElapsedGap,
  formatTimeAgo,
  getElapsedCalendarPeriod,
} from './elapsedPeriod';
import { formatReturnGap } from './readingMilestoneCopy';
import { formatTimeSinceFinished } from './recall';

/**
 * POLYTSIA V1.7, Phase 9 — ТЗ модуль E §17, §32.
 *
 * Дати будуються з локальних КОМПОНЕНТІВ (`new Date(y, m-1, d, 12)`), а не з рядка `'2026-01-15'`:
 * рядкова date-only форма за специфікацією парситься як UTC-північ, і в поясі на захід від
 * Гринвіча «15 січня» стало б 14 січня — той самий клас помилки, проти якого написані
 * `readingCalendar.ts#readingDayFromKey` і весь набір `test:tz`. Полудень — щоб і зсув на ±1
 * годину (перехід на літній час) не міг зсунути календарний день.
 */
function at(year: number, month: number, day: number): string {
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

describe('getElapsedCalendarPeriod — один розрахунок для всіх «скільки минуло»', () => {
  it('менше місяця: повних місяців нема, лишаються дні', () => {
    const period = getElapsedCalendarPeriod(at(2026, 1, 15), at(2026, 2, 14));
    expect(period.totalMonths).toBe(0);
    expect(period.days).toBe(30);
  });

  it('РІВНО місяць — це вже місяць', () => {
    const period = getElapsedCalendarPeriod(at(2026, 1, 15), at(2026, 2, 15));
    expect(period.totalMonths).toBe(1);
  });

  /**
   * Останній день місяця — свідомий виняток у `differenceInMonths`, а не випадковість: 31 січня
   * → 28 лютого рахується ПОВНИМ місяцем, бо 28 лютого — останній день лютого, і «того самого
   * числа наступного місяця» тут просто не існує. Порівняння нижче показує, що правило працює
   * саме як виняток: 15 січня → 14 лютого (звичайні числа) повного місяця не дає.
   */
  it('кінець місяця: 31 січня → 28 лютого — повний місяць; 15 січня → 14 лютого — ні', () => {
    expect(getElapsedCalendarPeriod(at(2026, 1, 31), at(2026, 2, 28)).totalMonths).toBe(1);
    expect(getElapsedCalendarPeriod(at(2026, 1, 15), at(2026, 2, 14)).totalMonths).toBe(0);
    expect(getElapsedCalendarPeriod(at(2026, 1, 31), at(2026, 3, 31)).totalMonths).toBe(2);
  });

  it('11 → 12 місяців: рік настає рівно на дванадцятому', () => {
    expect(getElapsedCalendarPeriod(at(2026, 1, 10), at(2026, 12, 10)).totalMonths).toBe(11);
    expect(getElapsedCalendarPeriod(at(2026, 1, 10), at(2027, 1, 10)).totalMonths).toBe(12);
    expect(getElapsedCalendarPeriod(at(2026, 1, 10), at(2027, 1, 10)).years).toBe(1);
  });

  it('кілька років розкладаються на роки + залишок місяців', () => {
    const period = getElapsedCalendarPeriod(at(2025, 1, 10), at(2027, 5, 10));
    expect(period.totalMonths).toBe(28);
    expect(period.years).toBe(2);
    expect(period.months).toBe(4);
  });

  /**
   * 2028 — високосний. Річниця 29 лютого у невисокосному році припадає на 28 лютого, а не
   * «зникає» й не переїжджає на 1 березня — та сама поведінка, що вже закладена в річниці віх
   * (`readingMilestones.ts` рахує їх через `addYears`, який так само зводить 29 лютого до 28).
   * Тобто «скільки минуло» і «коли річниця» не розходяться на високосних датах.
   */
  it('високосний рік: 29 лютого → 28 лютого наступного року — це вже повний рік', () => {
    expect(getElapsedCalendarPeriod(at(2028, 2, 29), at(2029, 2, 28)).totalMonths).toBe(12);
    expect(getElapsedCalendarPeriod(at(2028, 2, 29), at(2029, 2, 28)).years).toBe(1);
    // І у зворотний бік: 28 лютого невисокосного → 29 лютого високосного теж рівно рік.
    expect(getElapsedCalendarPeriod(at(2027, 2, 28), at(2028, 2, 29)).years).toBe(1);
    // Пів року від 29 лютого — звичайні шість місяців, без сюрпризів.
    expect(getElapsedCalendarPeriod(at(2028, 2, 29), at(2028, 8, 29)).totalMonths).toBe(6);
  });

  it('зворотний порядок дат не дає від’ємної тривалості', () => {
    const period = getElapsedCalendarPeriod(at(2027, 5, 10), at(2025, 1, 10));
    expect(period.totalMonths).toBe(0);
    expect(period.years).toBe(0);
  });
});

describe('formatTimeAgo — погляд назад', () => {
  it('той самий день — «сьогодні», а не «0 днів тому»', () => {
    expect(formatTimeAgo(getElapsedCalendarPeriod(at(2026, 9, 11), at(2026, 9, 11)))).toBe('сьогодні');
  });

  it('дні плюралізуються', () => {
    expect(formatTimeAgo(getElapsedCalendarPeriod(at(2026, 9, 10), at(2026, 9, 11)))).toBe('1 день тому');
    expect(formatTimeAgo(getElapsedCalendarPeriod(at(2026, 9, 8), at(2026, 9, 11)))).toBe('3 дні тому');
    expect(formatTimeAgo(getElapsedCalendarPeriod(at(2026, 8, 31), at(2026, 9, 11)))).toBe('11 днів тому');
  });

  it('місяці плюралізуються', () => {
    expect(formatTimeAgo(getElapsedCalendarPeriod(at(2026, 8, 11), at(2026, 9, 11)))).toBe('1 місяць тому');
    expect(formatTimeAgo(getElapsedCalendarPeriod(at(2026, 6, 11), at(2026, 9, 11)))).toBe('3 місяці тому');
  });

  it('від року — округлені роки, без «14 місяців тому» і без залишку', () => {
    expect(formatTimeAgo(getElapsedCalendarPeriod(at(2025, 9, 11), at(2026, 9, 11)))).toBe('1 рік тому');
    expect(formatTimeAgo(getElapsedCalendarPeriod(at(2025, 7, 11), at(2026, 9, 11)))).toBe('1 рік тому');
    expect(formatTimeAgo(getElapsedCalendarPeriod(at(2021, 9, 11), at(2026, 9, 11)))).toBe('5 років тому');
  });
});

describe('formatElapsedGap — проміжок між подіями', () => {
  it('менше повного місяця — не подія', () => {
    expect(formatElapsedGap(getElapsedCalendarPeriod(at(2026, 1, 10), at(2026, 1, 13)))).toBeNull();
  });

  it('лише місяці / лише роки / роки з місяцями', () => {
    expect(formatElapsedGap(getElapsedCalendarPeriod(at(2026, 1, 10), at(2026, 6, 10)))).toBe('через 5 місяців');
    expect(formatElapsedGap(getElapsedCalendarPeriod(at(2025, 1, 10), at(2030, 1, 10)))).toBe('через 5 років');
    expect(formatElapsedGap(getElapsedCalendarPeriod(at(2025, 1, 10), at(2027, 5, 10)))).toBe('через 2 роки 4 місяці');
  });

  it('ніколи не говорить днями', () => {
    const gap = formatElapsedGap(getElapsedCalendarPeriod(at(2025, 1, 10), at(2027, 5, 10)));
    expect(gap).not.toMatch(/дн/);
  });
});

/**
 * ТЗ §17/§32 — головна причина існування цього файлу: дві поверхні більше НЕ можуть розійтись у
 * тому, скільки часу минуло. Раніше саме на цьому вході вони давали різні відповіді:
 * `formatTimeSinceFinished` бачив 0 повних місяців, а `formatReturnGap` — 1 календарний.
 */
describe('дві фрази — один розрахунок (регресія розбіжності Phase 8)', () => {
  it('30 днів: «менш ніж місяць» для ОБОХ формулювань', () => {
    const from = at(2026, 1, 15);
    const to = at(2026, 2, 14);
    expect(formatTimeSinceFinished(from, new Date(to))).toBe('30 днів тому');
    expect(formatReturnGap(from, to)).toBeNull();
  });

  it('рівно місяць: «місяць» для ОБОХ формулювань', () => {
    const from = at(2026, 1, 15);
    const to = at(2026, 2, 15);
    expect(formatTimeSinceFinished(from, new Date(to))).toBe('1 місяць тому');
    expect(formatReturnGap(from, to)).toBe('через 1 місяць');
  });

  it('31 серпня → 11 вересня: 11 днів, а не «місяць» — приклад із докблока, тепер обидві згодні', () => {
    const from = at(2026, 8, 31);
    const to = at(2026, 9, 11);
    expect(formatTimeSinceFinished(from, new Date(to))).toBe('11 днів тому');
    expect(formatReturnGap(from, to)).toBeNull();
  });

  it('кінець місяця: 31 січня → 28 лютого — повний місяць для ОБОХ', () => {
    const from = at(2026, 1, 31);
    const to = at(2026, 2, 28);
    expect(formatTimeSinceFinished(from, new Date(to))).toBe('1 місяць тому');
    expect(formatReturnGap(from, to)).toBe('через 1 місяць');
  });
});
