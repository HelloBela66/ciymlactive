import { pagesPerMinuteFromTotals, DEFAULT_ROLLING_WINDOW } from './readingPace';

/**
 * POLYTSIA V1.6.2, #168 (ANALYTICS PERFORMANCE) — `pagesPerMinuteFromTotals` — новий export,
 * що замінив `computeRollingPace(sessions, sessions.length).pagesPerMinute` у
 * `useTbrReality.ts`/`useTomorrowRecommendation.ts`, коли обидва хуки перейшли на SQL-агрегат
 * `ReadingSessionRepository.getLifetimePaceTotals` замість сирих рядків сесій. Формула —
 * буквально та сама, що досі жила лише всередині `computeRollingPace` (`readingPace.ts`, не
 * тестувалась окремо до цієї фази).
 */
describe('pagesPerMinuteFromTotals', () => {
  it('totalMinutes > 0 — ділить сторінки на хвилини', () => {
    expect(pagesPerMinuteFromTotals(300, 100)).toBe(3);
  });

  it('totalMinutes === 0 — 0, не Infinity/NaN', () => {
    expect(pagesPerMinuteFromTotals(300, 0)).toBe(0);
  });

  it('totalMinutes < 0 (не мало б статись, але захист лишається) — 0, не від\'ємне число', () => {
    expect(pagesPerMinuteFromTotals(300, -5)).toBe(0);
  });

  it('totalPages === 0 — 0', () => {
    expect(pagesPerMinuteFromTotals(0, 50)).toBe(0);
  });
});

describe('DEFAULT_ROLLING_WINDOW', () => {
  it('дорівнює 5 — те саме число, яке ReadingSessionRepository.listRecentCompleted просить у useOnePicker.ts', () => {
    expect(DEFAULT_ROLLING_WINDOW).toBe(5);
  });
});
