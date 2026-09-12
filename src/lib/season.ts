import { SEASON_ORDER } from '@/design/season';
import type { SeasonId } from '@/design/season';

/** Межі сезону в UTC — `start` включно, `end` виключно (той самий контракт, що й
 * `ReadingSessionRepository.listStartedBetween`/`yearRange` у `useWrappedYear.ts`: `>= start
 * && < end`, без окремої обробки часових зон — застосунок і так усюди зберігає час в UTC ISO). */
export interface SeasonRange {
  start: string;
  end: string;
}

/** Місяць старту/кінця (1-12) кожного сезону + зсув року відносно параметра `year`, що
 * йде в `seasonDateRange` — той самий "план даних, не гілки коду" підхід, що й `SEASON_META`
 * вище: єдине місце зі свіжого прочитання видає всю таблицю меж одразу, замість `switch` на
 * чотири майже однакові гілки. Лише "зима" має ненульовий `startYearOffset` (-1) — єдиний
 * сезон, що перетинає межу календарного року. */
const SEASON_MONTH_RANGE: Record<SeasonId, { startMonth: number; startYearOffset: number; endMonth: number }> = {
  winter: { startMonth: 12, startYearOffset: -1, endMonth: 3 },
  spring: { startMonth: 3, startYearOffset: 0, endMonth: 6 },
  summer: { startMonth: 6, startYearOffset: 0, endMonth: 9 },
  autumn: { startMonth: 9, startYearOffset: 0, endMonth: 12 },
};

function isoMonthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
}

/**
 * Метеорологічні (не астрономічні) межі сезону — рівні календарні місяці, без обчислення
 * сонцестоянь/рівнодень, той самий навмисно спрощений підхід, що й `yearRange` у
 * `useWrappedYear.ts` для календарного року. Зима — єдиний сезон, що перетинає межу року;
 * прив'язана до ПІЗНішого року (того, у якому закінчується): "Зима 2026" — грудень 2025 —
 * лютий 2026 включно. Це той самий побутовий сенс, що й фраза "Зима 2026" у розмові — здебільшого
 * зима, про яку йдеться, це та, що закінчується на початку названого року, а не починається
 * наприкінці попереднього. Докладніше — `docs/READING_SEASONS.md`.
 */
export function seasonDateRange(seasonId: SeasonId, year: number): SeasonRange {
  const range = SEASON_MONTH_RANGE[seasonId];
  return {
    start: isoMonthStart(year + range.startYearOffset, range.startMonth),
    end: isoMonthStart(year, range.endMonth),
  };
}

export interface SeasonKey {
  seasonId: SeasonId;
  year: number;
}

/** Стабільний рядковий ідентифікатор сезону для роута (`app/seasons/[seasonKey].tsx`) і
 * queryKey (`queryKeys.seasons.bySeasonKey`) — напр. `"winter-2026"`. */
export function formatSeasonKey({ seasonId, year }: SeasonKey): string {
  return `${seasonId}-${year}`;
}

/** Зворотне до `formatSeasonKey`. `null` для нерозпізнаного рядка (побитий/старий route param)
 * — той самий "не кидати" підхід, що й решта guard/parse-функцій застосунку; викликач сам
 * вирішує, яким сезоном "за замовчуванням" підмінити (`currentSeasonKey`). */
export function parseSeasonKey(key: string): SeasonKey | null {
  const match = /^(winter|spring|summer|autumn)-(\d{4})$/.exec(key);
  if (!match) return null;
  const [, seasonId, yearStr] = match;
  return { seasonId: seasonId as SeasonId, year: Number(yearStr) };
}

/**
 * Який сезон "зараз" — визначає, з якого сезону відкривається екран за замовчуванням (та сама
 * "Wrapped на поточний рік" точка входу з `app/(tabs)/profile/index.tsx`, тепер для сезону).
 * `now` — явний параметр (house convention: жодного `new Date()` усередині `lib/*.ts`),
 * місяць рахується в UTC — той самий вибір, що й решта застосунку (без часових зон).
 */
export function currentSeasonKey(now: Date): SeasonKey {
  const month = now.getUTCMonth() + 1; // 1-12
  const year = now.getUTCFullYear();
  if (month === 12) return { seasonId: 'winter', year: year + 1 };
  if (month <= 2) return { seasonId: 'winter', year };
  if (month <= 5) return { seasonId: 'spring', year };
  if (month <= 8) return { seasonId: 'summer', year };
  return { seasonId: 'autumn', year };
}

/**
 * Попередній/наступний сезон за календарем — той самий "локальна стрілка" UX, що й рік у
 * Wrapped (`app/wrapped/[year].tsx`), лише крок тут менший за рік. Рік у результаті НЕ завжди
 * дорівнює вхідному: перетин межі "зима" — єдине місце, де він змінюється (вихід ЗІ зими вперед,
 * у весну, лишає той самий рік — зима Y і весна Y мають той самий "сезонний рік"; вхід У зиму
 * вперед, з осені, означає зиму вже НАСТУПНОГО року — і дзеркально назад).
 */
export function adjacentSeasonKey({ seasonId, year }: SeasonKey, direction: 'prev' | 'next'): SeasonKey {
  const index = SEASON_ORDER.indexOf(seasonId);
  const delta = direction === 'next' ? 1 : -1;
  const nextIndex = (index + delta + SEASON_ORDER.length) % SEASON_ORDER.length;
  const nextSeasonId = SEASON_ORDER[nextIndex] as SeasonId;

  let nextYear = year;
  if (direction === 'next' && seasonId === 'autumn') nextYear = year + 1;
  if (direction === 'prev' && seasonId === 'winter') nextYear = year - 1;

  return { seasonId: nextSeasonId, year: nextYear };
}
