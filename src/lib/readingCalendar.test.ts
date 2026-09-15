import {
  READING_WEEK_STARTS_ON,
  dayRange,
  inclusiveEnd,
  monthRange,
  monthRangeOf,
  monthSpanRange,
  readingDayKey,
  readingDayKeyOf,
  weekRange,
  yearRange,
  yearRangeOf,
} from './readingCalendar';

/**
 * POLYTSIA V1.7 — тести canonical reading calendar (`docs/V1_7_TEMPORAL_SEMANTICS.md`).
 *
 * ЧОМУ ТЕСТИ ПОБУДОВАНІ САМЕ ТАК. CI (GitHub Actions) працює в UTC, тож тест виду "в Києві о
 * 00:30 має бути 16 серпня" у CI виродився б у тривіальність: при `TZ=UTC` локальний час
 * ДОРІВНЮЄ UTC, і будь-яка реалізація (навіть багована `.slice(0, 10)`) пройшла б. Додавати
 * `TZ=Europe/Kyiv` у глобальну jest-конфігурацію не можна — це змінило б оточення для всіх 88
 * наявних suite'ів і могло б зламати тести, писані в припущенні UTC.
 *
 * Тому тут перевіряються ІНВАРІАНТИ, істинні в БУДЬ-ЯКОМУ часовому поясі:
 *
 *   `new Date(2026, 7, 16, 0, 30)` — це завжди 16 серпня 00:30 ЛОКАЛЬНОГО часу, у якому б поясі
 *   не виконувався тест. `.toISOString()` переводить цей момент у UTC instant (у Києві це стане
 *   `2026-08-15T21:30:00.000Z`, у UTC — `2026-08-16T00:30:00.000Z`). Вимога до
 *   `readingDayKey` — повернути `2026-08-16` в ОБОХ випадках, бо це той день, який людина
 *   прожила.
 *
 * Саме цей round-trip і є суттю фіксу: багована реалізація `iso.slice(0, 10)` дала б
 * `2026-08-15` у Києві (і пройшла б у UTC) — інваріант ловить її скрізь, де вона неправильна,
 * і не дає хибного спокою там, де різниці немає.
 */

/** 16 серпня 2026, 00:30 ЛОКАЛЬНОГО часу — нічне читання, головний випадок misattribution. */
const LOCAL_AUG_16_00_30 = new Date(2026, 7, 16, 0, 30);

describe('readingDayKey — локальна календарна дата, а не UTC-день', () => {
  it('нічна сесія о 00:30 належить своєму ЛОКАЛЬНОМУ дню (round-trip instant → ключ)', () => {
    expect(readingDayKey(LOCAL_AUG_16_00_30.toISOString())).toBe('2026-08-16');
  });

  it('сесія о 23:50 належить тому самому локальному дню, не наступному', () => {
    const late = new Date(2026, 7, 16, 23, 50);
    expect(readingDayKey(late.toISOString())).toBe('2026-08-16');
  });

  it('новорічна ніч: 1 січня 00:30 локального — це вже НОВИЙ рік, не 31 грудня', () => {
    const newYearNight = new Date(2027, 0, 1, 0, 30);
    expect(readingDayKey(newYearNight.toISOString())).toBe('2027-01-01');
  });

  it('31 грудня 23:50 локального лишається в СТАРОМУ році', () => {
    const lastMoment = new Date(2026, 11, 31, 23, 50);
    expect(readingDayKey(lastMoment.toISOString())).toBe('2026-12-31');
  });

  it('readingDayKeyOf(Date) і readingDayKey(iso) дають той самий ключ для того самого моменту', () => {
    expect(readingDayKeyOf(LOCAL_AUG_16_00_30)).toBe(readingDayKey(LOCAL_AUG_16_00_30.toISOString()));
  });
});

describe('dayRange — межі локальної доби', () => {
  it('нічна сесія о 00:30 потрапляє в діапазон СВОГО дня', () => {
    const range = dayRange(LOCAL_AUG_16_00_30);
    const instant = LOCAL_AUG_16_00_30.toISOString();
    expect(instant >= range.startIso).toBe(true);
    expect(instant < range.endIso).toBe(true);
  });

  it('початок діапазону — локальна північ, кінець — локальна північ наступного дня', () => {
    const range = dayRange(LOCAL_AUG_16_00_30);
    const start = new Date(range.startIso);
    const end = new Date(range.endIso);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getDate()).toBe(16);
    expect(end.getHours()).toBe(0);
    expect(end.getDate()).toBe(17);
  });

  it('сесія, що перетинає північ, належить дню СВОГО початку (правило атрибуції V1.7)', () => {
    const startedBeforeMidnight = new Date(2026, 7, 16, 23, 50);
    const range = dayRange(startedBeforeMidnight);
    // Сесія почалась 23:50 і скінчилась 00:20 наступного дня — у діапазон 16-го потрапляє саме
    // МОМЕНТ ПОЧАТКУ, і цього достатньо: вся сесія належить 16-му, не ділиться.
    expect(startedBeforeMidnight.toISOString() >= range.startIso).toBe(true);
    expect(startedBeforeMidnight.toISOString() < range.endIso).toBe(true);
    expect(readingDayKey(startedBeforeMidnight.toISOString())).toBe('2026-08-16');
  });
});

describe('weekRange — понеділок 00:00 → наступний понеділок 00:00', () => {
  it('починається саме в понеділок', () => {
    // 2026-08-16 — неділя; тиждень має починатись у понеділок 10 серпня.
    const range = weekRange(new Date(2026, 7, 16, 12, 0));
    const start = new Date(range.startIso);
    expect(start.getDay()).toBe(READING_WEEK_STARTS_ON);
    expect(start.getDate()).toBe(10);
    expect(start.getHours()).toBe(0);
  });

  it('закінчується наступним понеділком 00:00', () => {
    const range = weekRange(new Date(2026, 7, 16, 12, 0));
    const end = new Date(range.endIso);
    expect(end.getDay()).toBe(READING_WEEK_STARTS_ON);
    expect(end.getDate()).toBe(17);
    expect(end.getHours()).toBe(0);
  });

  it('МЕЖА ПОНЕДІЛКА: неділя 23:50 належить тижню, що ЗАКІНЧУЄТЬСЯ цією неділею', () => {
    const sundayNight = new Date(2026, 7, 16, 23, 50); // неділя
    const range = weekRange(sundayNight);
    const instant = sundayNight.toISOString();
    expect(instant >= range.startIso).toBe(true);
    expect(instant < range.endIso).toBe(true);
    expect(new Date(range.startIso).getDate()).toBe(10); // понеділок 10 серпня
  });

  it('понеділок 00:20 належить НОВОМУ тижню, а не попередньому', () => {
    const mondayEarly = new Date(2026, 7, 17, 0, 20);
    const range = weekRange(mondayEarly);
    expect(new Date(range.startIso).getDate()).toBe(17);
  });

  it('тиждень із переходом на літній/зимовий час усе одно закінчується понеділком 00:00', () => {
    // Останній тиждень жовтня — у більшості європейських зон містить перехід на зимовий час.
    // `addWeeks` (а не `+168 годин`) гарантує саме локальний понеділок 00:00.
    const range = weekRange(new Date(2026, 9, 28, 12, 0));
    const end = new Date(range.endIso);
    expect(end.getDay()).toBe(READING_WEEK_STARTS_ON);
    expect(end.getHours()).toBe(0);
    expect(end.getMinutes()).toBe(0);
  });
});

describe('monthRange / monthRangeOf — межі локального місяця', () => {
  it('МЕЖА МІСЯЦЯ: 31 серпня 23:50 належить СЕРПНЮ', () => {
    const lastNight = new Date(2026, 7, 31, 23, 50);
    const range = monthRange(lastNight);
    const instant = lastNight.toISOString();
    expect(instant >= range.startIso).toBe(true);
    expect(instant < range.endIso).toBe(true);
    expect(new Date(range.startIso).getMonth()).toBe(7);
  });

  it('1 вересня 00:20 належить ВЕРЕСНЮ, а не серпню', () => {
    const range = monthRange(new Date(2026, 8, 1, 0, 20));
    expect(new Date(range.startIso).getMonth()).toBe(8);
  });

  it('monthRangeOf приймає людський номер місяця (1-12)', () => {
    const range = monthRangeOf(2026, 8);
    const start = new Date(range.startIso);
    expect(start.getMonth()).toBe(7);
    expect(start.getDate()).toBe(1);
    expect(new Date(range.endIso).getMonth()).toBe(8);
  });

  it('лютий високосного року — 29 днів, межа коректна', () => {
    const range = monthRangeOf(2028, 2);
    const feb29 = new Date(2028, 1, 29, 12, 0);
    expect(feb29.toISOString() < range.endIso).toBe(true);
    expect(new Date(range.endIso).getMonth()).toBe(2);
    expect(new Date(range.endIso).getDate()).toBe(1);
  });
});

describe('yearRange / yearRangeOf — межі локального року', () => {
  it('МЕЖА РОКУ: 31 грудня 23:50 належить СТАРОМУ року', () => {
    const lastMoment = new Date(2026, 11, 31, 23, 50);
    const range = yearRange(lastMoment);
    expect(lastMoment.toISOString() >= range.startIso).toBe(true);
    expect(lastMoment.toISOString() < range.endIso).toBe(true);
    expect(new Date(range.startIso).getFullYear()).toBe(2026);
  });

  it('НОВОРІЧНА НІЧ: 1 січня 00:30 належить НОВОМУ року (головний регресійний випадок)', () => {
    const newYearNight = new Date(2027, 0, 1, 0, 30);
    const range = yearRangeOf(2027);
    expect(newYearNight.toISOString() >= range.startIso).toBe(true);
    expect(newYearNight.toISOString() < range.endIso).toBe(true);

    // І дзеркально: цей момент НЕ належить 2026 року.
    const previous = yearRangeOf(2026);
    expect(newYearNight.toISOString() >= previous.endIso).toBe(true);
  });

  it('yearRangeOf межує рівно з наступним роком, без щілин і перекриття', () => {
    expect(yearRangeOf(2026).endIso).toBe(yearRangeOf(2027).startIso);
  });
});

describe('monthSpanRange — сезон із трьох місяців, у т.ч. через межу року', () => {
  it('літо 2026 — червень, липень, серпень', () => {
    const range = monthSpanRange(2026, 6, 3);
    expect(new Date(range.startIso).getMonth()).toBe(5);
    expect(new Date(range.endIso).getMonth()).toBe(8);
  });

  it('зима через межу року — грудень 2026 → березень 2027', () => {
    const range = monthSpanRange(2026, 12, 3);
    const start = new Date(range.startIso);
    const end = new Date(range.endIso);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(11);
    expect(end.getFullYear()).toBe(2027);
    expect(end.getMonth()).toBe(2);
  });
});

describe('inclusiveEnd', () => {
  it('на 1 мс менше за виключну межу', () => {
    const range = dayRange(LOCAL_AUG_16_00_30);
    expect(new Date(range.endIso).getTime() - new Date(inclusiveEnd(range)).getTime()).toBe(1);
  });
});

describe('суміжні періоди не мають щілин і перекриття', () => {
  it('день за днем', () => {
    const first = dayRange(new Date(2026, 7, 16, 12, 0));
    const second = dayRange(new Date(2026, 7, 17, 12, 0));
    expect(first.endIso).toBe(second.startIso);
  });

  it('тиждень за тижнем', () => {
    const first = weekRange(new Date(2026, 7, 12, 12, 0));
    const second = weekRange(new Date(2026, 7, 19, 12, 0));
    expect(first.endIso).toBe(second.startIso);
  });

  it('місяць за місяцем, включно з переходом через рік', () => {
    expect(monthRangeOf(2026, 12).endIso).toBe(monthRangeOf(2027, 1).startIso);
  });
});
