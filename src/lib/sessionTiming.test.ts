import { computeElapsedMs, computePausedMs, formatDuration, isCurrentlyPaused } from './sessionTiming';
import type { PausedInterval } from '@/types/readingSession';

describe('computePausedMs', () => {
  it('повертає 0 без пауз', () => {
    expect(computePausedMs([], new Date('2026-01-01T00:10:00Z'))).toBe(0);
  });

  it('рахує завершену паузу', () => {
    const intervals: PausedInterval[] = [
      { pausedAt: '2026-01-01T00:00:00Z', resumedAt: '2026-01-01T00:05:00Z' },
    ];
    expect(computePausedMs(intervals, new Date('2026-01-01T00:10:00Z'))).toBe(5 * 60 * 1000);
  });

  it('рахує паузу, що ще триває, до now', () => {
    const intervals: PausedInterval[] = [{ pausedAt: '2026-01-01T00:00:00Z', resumedAt: null }];
    expect(computePausedMs(intervals, new Date('2026-01-01T00:03:00Z'))).toBe(3 * 60 * 1000);
  });
});

describe('computeElapsedMs', () => {
  it('без пауз дорівнює простій різниці now - startedAt', () => {
    const elapsed = computeElapsedMs('2026-01-01T00:00:00Z', [], new Date('2026-01-01T00:20:00Z'));
    expect(elapsed).toBe(20 * 60 * 1000);
  });

  it('віднімає завершену паузу', () => {
    const intervals: PausedInterval[] = [
      { pausedAt: '2026-01-01T00:05:00Z', resumedAt: '2026-01-01T00:10:00Z' },
    ];
    const elapsed = computeElapsedMs('2026-01-01T00:00:00Z', intervals, new Date('2026-01-01T00:20:00Z'));
    expect(elapsed).toBe(15 * 60 * 1000); // 20 хв загалом мінус 5 хв паузи
  });

  it('"заморожує" час, поки пауза ще триває', () => {
    const intervals: PausedInterval[] = [{ pausedAt: '2026-01-01T00:05:00Z', resumedAt: null }];
    const atPause = computeElapsedMs('2026-01-01T00:00:00Z', intervals, new Date('2026-01-01T00:05:00Z'));
    const laterDuringSamePause = computeElapsedMs(
      '2026-01-01T00:00:00Z',
      intervals,
      new Date('2026-01-01T00:15:00Z'),
    );
    expect(atPause).toBe(5 * 60 * 1000);
    expect(laterDuringSamePause).toBe(5 * 60 * 1000); // не зростає, поки пауза триває
  });

  it('для завершеної сесії рахує до endedAt, ігноруючи пізніший now', () => {
    const elapsed = computeElapsedMs(
      '2026-01-01T00:00:00Z',
      [],
      new Date('2026-01-01T02:00:00Z'), // now набагато пізніше
      '2026-01-01T00:30:00Z', // але сесія завершилась раніше
    );
    expect(elapsed).toBe(30 * 60 * 1000);
  });
});

describe('isCurrentlyPaused', () => {
  it('false без інтервалів', () => {
    expect(isCurrentlyPaused([])).toBe(false);
  });

  it('true, якщо останній інтервал не має resumedAt', () => {
    expect(isCurrentlyPaused([{ pausedAt: '2026-01-01T00:00:00Z', resumedAt: null }])).toBe(true);
  });

  it('false, якщо останній інтервал завершено', () => {
    const intervals: PausedInterval[] = [
      { pausedAt: '2026-01-01T00:00:00Z', resumedAt: '2026-01-01T00:01:00Z' },
    ];
    expect(isCurrentlyPaused(intervals)).toBe(false);
  });
});

describe('formatDuration', () => {
  it('формат MM:SS для менше години', () => {
    expect(formatDuration(65 * 1000)).toBe('01:05');
  });

  it('формат HH:MM:SS для години й довше', () => {
    expect(formatDuration(3661 * 1000)).toBe('01:01:01');
  });

  it('0 мс форматується як 00:00', () => {
    expect(formatDuration(0)).toBe('00:00');
  });
});
