import { parse, differenceInCalendarDays, format } from 'date-fns';

const DAY_KEY_FORMAT = 'yyyy-MM-dd';

export interface StreakResult {
  /** Поточний "живий" streak: якщо сьогодні вже читали — довжина серії до сьогодні; якщо
   * сьогодні ще ні, але вчора читали — довжина серії до вчора (серія ще не перервалась,
   * бо сьогоднішній день не скінчився); інакше 0. */
  current: number;
  /** Найдовша серія поспіль-днів з читанням за весь час. */
  longest: number;
}

function toDate(dayKey: string): Date {
  return parse(dayKey, DAY_KEY_FORMAT, new Date());
}

/**
 * Streaks (розділ 30 ТЗ) — чиста функція без React/SQL, як `sessionTiming.ts`/`calendarGrid.ts`.
 * Приймає МНОЖИНУ ключів `yyyy-MM-dd` днів, коли була хоч одна завершена сесія читання
 * (дедуплікація — відповідальність виклику, дивись `useStatistics.ts`), і "сьогоднішній" ключ
 * окремим параметром — щоб функція лишалась детермінованою й тестованою (не викликає
 * `new Date()` сама).
 */
export function computeStreaks(activeDayKeys: string[], todayKey: string): StreakResult {
  const uniqueSorted = Array.from(new Set(activeDayKeys)).sort();
  if (uniqueSorted.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < uniqueSorted.length; i += 1) {
    const prevKey = uniqueSorted[i - 1];
    const key = uniqueSorted[i];
    if (!prevKey || !key) continue;
    const gap = differenceInCalendarDays(toDate(key), toDate(prevKey));
    run = gap === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const activeSet = new Set(uniqueSorted);
  const yesterdayKey = format(new Date(toDate(todayKey).getTime() - 24 * 60 * 60 * 1000), DAY_KEY_FORMAT);

  let anchorKey: string | null = null;
  if (activeSet.has(todayKey)) anchorKey = todayKey;
  else if (activeSet.has(yesterdayKey)) anchorKey = yesterdayKey;

  if (!anchorKey) return { current: 0, longest };

  // Рахуємо назад від anchorKey (сьогодні або вчора), поки попередній день є в множині.
  let current = 1;
  let cursorDate = toDate(anchorKey);
  for (;;) {
    const prevDate = new Date(cursorDate.getTime() - 24 * 60 * 60 * 1000);
    const prevKey = format(prevDate, DAY_KEY_FORMAT);
    if (!activeSet.has(prevKey)) break;
    current += 1;
    cursorDate = prevDate;
  }

  return { current, longest };
}
