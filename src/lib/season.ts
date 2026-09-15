import { SEASON_ORDER, SEASON_META } from '@/design/season';
import type { SeasonId } from '@/design/season';
import { monthRangeOf } from '@/lib/readingCalendar';

/**
 * Межі сезону — `start` включно, `end` виключно (той самий контракт, що й
 * `ReadingSessionRepository.listStartedBetween`).
 *
 * POLYTSIA V1.7 — ВИПРАВЛЕНО (`docs/V1_7_TEMPORAL_SEMANTICS.md`). Раніше межі будувались як
 * літеральний рядок `` `${year}-${MM}-01T00:00:00.000Z` `` — тобто опівніч UTC, а не опівніч
 * за місцевим часом користувача. Наслідок: у Києві (UTC+2/+3) читання 1 червня між 00:00 і
 * 03:00 потрапляло ще у ВЕСНУ, а читання 31 серпня о 23:50 — уже в ОСІНЬ. Тепер межі —
 * локальні (`monthRangeOf`, `src/lib/readingCalendar.ts`), виражені інстантами для SQL:
 * сама межа лишається однією точкою часу, але проведена там, де її проводить людина.
 */
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

/** Початок місяця за ЛОКАЛЬНИМ календарем, виражений абсолютним інстантом
 * (`monthRangeOf(...).startIso`) — єдина canonical-точка побудови меж місяця у застосунку. */
function isoMonthStart(year: number, month: number): string {
  return monthRangeOf(year, month).startIso;
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
 * `now` — явний параметр (house convention: жодного `new Date()` усередині `lib/*.ts`).
 *
 * POLYTSIA V1.7 — місяць/рік рахуються за ЛОКАЛЬНИМ календарем
 * (`docs/V1_7_TEMPORAL_SEMANTICS.md`), а не `getUTCMonth()`/`getUTCFullYear()`, як було раніше.
 * Інакше 1 червня о 00:30 у Києві застосунок відкривав би ще ВЕСНУ, хоча межі самих сезонів
 * (`seasonDateRange`) уже локальні — тобто "поточний сезон" розходився б із тим, у який
 * потрапляє щойно завершена сесія.
 */
export function currentSeasonKey(now: Date): SeasonKey {
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
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

/** Рік у відображуваному підписі сезону. Зима — єдиний сезон, що перетинає межу календарного
 * року (`seasonDateRange`/`currentSeasonKey` вище прив'язують її ДО пізнішого року, тут лише
 * форматується підпис для читача, сама дата/рік не змінюються): "Зима 2026/27" для періоду
 * грудень 2026 — лютий 2027 (`year` тут — 2027, той самий пізніший рік). Інші три сезони не
 * перетинають межу року — простий рядок року, без діапазону. */
function formatSeasonYearSuffix(seasonId: SeasonId, year: number): string {
  if (seasonId !== 'winter') return String(year);
  return `${year - 1}/${String(year).slice(2)}`;
}

/**
 * POLYTSIA V1.6.2, #167 (READING SEASONS — PRODUCT REDEFINITION, ТЗ §64) — канонічний короткий
 * підпис сезону, "<Назва> <рік>" (напр. "Літо 2026", "Зима 2026/27"). Єдине місце, де рік
 * перетворюється на рядок для показу — раніше навігаційний заголовок/hero/картка кожен окремо
 * конкатенували `meta.label + ' ' + key.year`, тож зимовий сезон завжди показував лише пізніший
 * рік БЕЗ діапазону ("Зима 2027" замість "Зима 2026/27", хоча сама дата вже коректно рахувалась
 * від грудня попереднього року — розбіжність була лише в тексті підпису, не в даних). */
export function formatSeasonLabel(seasonId: SeasonId, year: number): string {
  return `${SEASON_META[seasonId].label} ${formatSeasonYearSuffix(seasonId, year)}`;
}

/** «Х твого читання» (ТЗ §35/37) — емоційна hero-фраза сезону, окремо від короткого
 * `formatSeasonLabel` (навігаційний заголовок і компактна картка лишаються короткими "Літо
 * 2026" — hero-заголовок на самому екрані отримує цю довшу, особисту форму). */
export function formatSeasonHeroTitle(seasonId: SeasonId): string {
  return `${SEASON_META[seasonId].label} твого читання`;
}
