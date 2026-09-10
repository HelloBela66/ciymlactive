import { computeRollingPace, type PaceSessionInput } from './readingPace';

describe('computeRollingPace', () => {
  it('без сесій — усе 0', () => {
    expect(computeRollingPace([])).toEqual({ pagesPerMinute: 0, minutesPerActiveDay: 0, sessionsConsidered: 0 });
  });

  it('одна сесія: 30 сторінок за 60 хв', () => {
    const sessions: PaceSessionInput[] = [
      { startPage: 0, endPage: 30, durationSeconds: 3600, startedAt: '2026-09-01T10:00:00.000Z' },
    ];
    const pace = computeRollingPace(sessions);
    expect(pace.pagesPerMinute).toBeCloseTo(0.5);
    expect(pace.minutesPerActiveDay).toBeCloseTo(60);
    expect(pace.sessionsConsidered).toBe(1);
  });

  it('бере лише останні windowSize сесій за started_at, ігноруючи старіші', () => {
    const sessions: PaceSessionInput[] = [
      { startPage: 0, endPage: 100, durationSeconds: 6000, startedAt: '2026-01-01T10:00:00.000Z' }, // стара, дуже повільна
      { startPage: 0, endPage: 30, durationSeconds: 1800, startedAt: '2026-09-05T10:00:00.000Z' },
      { startPage: 30, endPage: 60, durationSeconds: 1800, startedAt: '2026-09-06T10:00:00.000Z' },
    ];
    const pace = computeRollingPace(sessions, 2);
    expect(pace.sessionsConsidered).toBe(2);
    // 60 сторінок за 60 хв разом (дві останні сесії по 30 хв/30 сторінок) — стара сесія
    // (100 сторінок за 100 хв) не має впливати на результат.
    expect(pace.pagesPerMinute).toBeCloseTo(1);
  });

  it('сесія без endPage не додає сторінок, але додає хвилини й активний день', () => {
    const sessions: PaceSessionInput[] = [
      { startPage: 10, endPage: null, durationSeconds: 600, startedAt: '2026-09-01T10:00:00.000Z' },
    ];
    const pace = computeRollingPace(sessions);
    expect(pace.pagesPerMinute).toBe(0);
    expect(pace.minutesPerActiveDay).toBeCloseTo(10);
  });

  it('дві сесії того самого дня усереднюються по одному активному дню, не по двох', () => {
    const sessions: PaceSessionInput[] = [
      { startPage: 0, endPage: 10, durationSeconds: 600, startedAt: '2026-09-01T09:00:00.000Z' },
      { startPage: 10, endPage: 20, durationSeconds: 600, startedAt: '2026-09-01T20:00:00.000Z' },
    ];
    const pace = computeRollingPace(sessions);
    expect(pace.minutesPerActiveDay).toBeCloseTo(20); // 20 хв разом, 1 унікальний день
  });
});
