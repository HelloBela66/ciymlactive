import { formatTimeAgo, getElapsedCalendarPeriod } from './elapsedPeriod';

/**
 * POLYTSIA V1.6, Фаза 5 («Книга через час») — уся доменна логіка чистими функціями без
 * SQL/React, той самий house-патерн, що й `bookCapsule.ts`/`onThisDay.ts`: `now`/значення —
 * явний параметр, жодного `new Date()` усередині.
 */

/** П.39 ТЗ (той самий підхід, що й `bookCapsule.ts#normalizeCapsuleText`) — trim, порожній
 * рядок (чи лише пробіли) — це "не заповнено", не валідний контент. */
export function normalizeRecallText(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * «Ти прочитав цю книгу N місяців тому.» (Фаза 5 ТЗ, крок Flow).
 *
 * POLYTSIA V1.7, Phase 9 (ТЗ модуль E §17) — сам РОЗРАХУНОК переїхав у `elapsedPeriod.ts`, щоб
 * «скільки минуло» в усьому застосунку рахувалось однаково (раніше ця функція і
 * `formatReturnGap` розходились на семантиці місяця — розбір у докблоці `elapsedPeriod.ts`).
 * Обґрунтування самої семантики, що була тут, лишається чинним і переїхало разом із кодом:
 * `differenceInMonths` (кількість ПОВНИХ місяців) саме тому, що 31 серпня → 11 вересня — це
 * 11 днів, а не «1 місяць».
 *
 * Поведінка й сигнатура НЕ змінені: та сама фраза на тих самих входах (`recall.test.ts` лишився
 * незмінним і продовжує це стерегти), тож `app/recall/[workId].tsx` чіпати не довелось.
 */
export function formatTimeSinceFinished(finishedAtIso: string, now: Date): string {
  return formatTimeAgo(getElapsedCalendarPeriod(finishedAtIso, now.toISOString()));
}
