import { predictFinish } from './finishPrediction';
import type { RollingPace } from './readingPace';

const NO_PACE: RollingPace = { pagesPerMinute: 0, minutesPerActiveDay: 0, sessionsConsidered: 0 };
const KNOWN_PACE: RollingPace = { pagesPerMinute: 1, minutesPerActiveDay: 30, sessionsConsidered: 3 }; // 1 стор/хв, 30 хв/день

describe('predictFinish', () => {
  it('totalPages невідомий — усе null', () => {
    const result = predictFinish({
      currentPage: 50,
      totalPages: null,
      pace: KNOWN_PACE,
      referenceDate: new Date('2026-09-07T00:00:00.000Z'),
    });
    expect(result).toEqual({ remainingPages: null, estimatedHoursRemaining: null, estimatedFinishDate: null });
  });

  it('книга вже дочитана (currentPage >= totalPages) — 0 залишку, дата = сьогодні', () => {
    const referenceDate = new Date('2026-09-07T00:00:00.000Z');
    const result = predictFinish({ currentPage: 300, totalPages: 300, pace: KNOWN_PACE, referenceDate });
    expect(result.remainingPages).toBe(0);
    expect(result.estimatedHoursRemaining).toBe(0);
    expect(result.estimatedFinishDate).toBe(referenceDate.toISOString());
  });

  it('немає даних про темп — залишок сторінок відомий, але дата/години null', () => {
    const result = predictFinish({
      currentPage: 50,
      totalPages: 300,
      pace: NO_PACE,
      referenceDate: new Date('2026-09-07T00:00:00.000Z'),
    });
    expect(result.remainingPages).toBe(250);
    expect(result.estimatedHoursRemaining).toBeNull();
    expect(result.estimatedFinishDate).toBeNull();
  });

  it('звичайний випадок: 250 сторінок лишилось, 1 стор/хв, 30 хв/день → 250 хв / 30 хв/день = 9 днів', () => {
    const referenceDate = new Date('2026-09-07T00:00:00.000Z');
    const result = predictFinish({ currentPage: 50, totalPages: 300, pace: KNOWN_PACE, referenceDate });
    expect(result.remainingPages).toBe(250);
    expect(result.estimatedHoursRemaining).toBeCloseTo(250 / 60, 1);
    expect(result.estimatedFinishDate).toBe('2026-09-16T00:00:00.000Z');
  });
});
