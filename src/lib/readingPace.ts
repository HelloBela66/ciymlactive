export interface PaceSessionInput {
  startPage: number;
  endPage: number | null;
  durationSeconds: number | null;
  startedAt: string;
}

export interface RollingPace {
  /** Сторінок за хвилину; 0, якщо недостатньо даних (уникає ділення на нуль на виклику). */
  pagesPerMinute: number;
  /** Середня тривалість читання за день, коли читання реально відбувалось (хв). */
  minutesPerActiveDay: number;
  sessionsConsidered: number;
}

/** POLYTSIA V1.6.2, #168 (ANALYTICS PERFORMANCE): експортовано (раніше — приватна константа
 * файлу) так, щоб `ReadingSessionRepository.listRecentCompleted` (SQL-запит, що замінив
 * `listAllCompleted` у `useOnePicker.ts`) міг попросити рівно стільки рядків, скільки
 * `computeRollingPace` за замовчуванням і так візьме — одне джерело істини для цього числа
 * замість двох синхронізованих вручну "5". */
export const DEFAULT_ROLLING_WINDOW = 5;

/** ~30 стор/год — розумне припущення на випадок, коли реальної історії читання ще немає
 * взагалі (нема жодної завершеної сесії, з якої порахувати темп). Єдине джерело цього числа —
 * раніше жило лише локально в `useTbrReality.ts`; піднято сюди (Milestone 11, доповнення
 * "Що почитати завтра?"), щоб `useTomorrowRecommendation.ts` користувався тим самим
 * припущенням, а не власною копією того самого числа. */
export const FALLBACK_PAGES_PER_MINUTE = 0.5;

/**
 * Rolling-average темп читання (розділ 30 ТЗ, `docs/TESTING.md`: "readingPace.ts") — свідомо
 * НЕ lifetime-середнє (докладніше — `finishPrediction.ts`): бере лише останні `windowSize`
 * сесій за `started_at`, щоб прогноз реагував на те, як людина читає ОСТАННІМ часом, а не на
 * середнє за весь час знайомства з книгою (яке може тягнути давню паузу в кілька місяців).
 */
export function computeRollingPace(sessions: PaceSessionInput[], windowSize: number = DEFAULT_ROLLING_WINDOW): RollingPace {
  const sorted = [...sessions].sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
  const recent = sorted.slice(0, windowSize);

  let totalPages = 0;
  let totalMinutes = 0;
  const activeDayKeys = new Set<string>();

  for (const session of recent) {
    const pages = session.endPage != null ? Math.max(0, session.endPage - session.startPage) : 0;
    const minutes = (session.durationSeconds ?? 0) / 60;
    totalPages += pages;
    totalMinutes += minutes;
    if (minutes > 0) activeDayKeys.add(session.startedAt.slice(0, 10));
  }

  return {
    pagesPerMinute: totalMinutes > 0 ? totalPages / totalMinutes : 0,
    minutesPerActiveDay: activeDayKeys.size > 0 ? totalMinutes / activeDayKeys.size : 0,
    sessionsConsidered: recent.length,
  };
}

/**
 * `pagesPerMinute`-частина `computeRollingPace` вище, узята з уже готових ПІДСУМКІВ (не сирих
 * сесій) — POLYTSIA V1.6.2, #168 (ANALYTICS PERFORMANCE). `useTbrReality.ts`/
 * `useTomorrowRecommendation.ts` рахують `computeRollingPace(sessions, sessions.length)` — тобто
 * `windowSize` = усі сесії, справжнього "вікна" тут нема — весь цикл функції вище зводиться
 * рівно до цього одного виразу над двома лічильниками. Обидва хука тепер отримують ці два
 * лічильники напряму SQL-агрегатом (`ReadingSessionRepository.getLifetimePaceTotals`) замість
 * сирих рядків усієї історії сесій — ця функція лишає формулу "0, якщо ділити нема на що" в
 * ОДНОМУ місці, а не дублює `totalMinutes > 0 ? totalPages / totalMinutes : 0` у двох хуках.
 */
export function pagesPerMinuteFromTotals(totalPages: number, totalMinutes: number): number {
  return totalMinutes > 0 ? totalPages / totalMinutes : 0;
}
