import { computeRunReadingStats, computeNumericDelta, EMPTY_RUN_READING_STATS } from './rereadComparison';

describe('computeRunReadingStats', () => {
  it('порожній масив сесій — повертає EMPTY_RUN_READING_STATS', () => {
    expect(computeRunReadingStats([])).toEqual(EMPTY_RUN_READING_STATS);
  });

  it('сумує durationSeconds усіх сесій, null трактується як 0', () => {
    const stats = computeRunReadingStats([
      { startedAt: '2026-01-01T10:00:00.000Z', durationSeconds: 600, readingExperience: null },
      { startedAt: '2026-01-02T10:00:00.000Z', durationSeconds: null, readingExperience: null },
      { startedAt: '2026-01-03T10:00:00.000Z', durationSeconds: 900, readingExperience: null },
    ]);
    expect(stats.totalDurationSeconds).toBe(1500);
    expect(stats.sessionCount).toBe(3);
  });

  it('daysSpent рахує УНІКАЛЬНІ календарні дні — дві сесії того самого дня рахуються один раз', () => {
    const stats = computeRunReadingStats([
      { startedAt: '2026-01-01T10:00:00.000Z', durationSeconds: 300, readingExperience: null },
      { startedAt: '2026-01-01T20:00:00.000Z', durationSeconds: 300, readingExperience: null },
      { startedAt: '2026-01-02T10:00:00.000Z', durationSeconds: 300, readingExperience: null },
    ]);
    expect(stats.daysSpent).toBe(2);
  });

  it('dominantExperience — найчастіше розпізнане значення', () => {
    const stats = computeRunReadingStats([
      { startedAt: '2026-01-01T10:00:00.000Z', durationSeconds: 300, readingExperience: 'engaging' },
      { startedAt: '2026-01-02T10:00:00.000Z', durationSeconds: 300, readingExperience: 'calm' },
      { startedAt: '2026-01-03T10:00:00.000Z', durationSeconds: 300, readingExperience: 'engaging' },
    ]);
    expect(stats.dominantExperience).toBe('engaging');
  });

  it('нерозпізнане значення readingExperience ігнорується, як і null', () => {
    const stats = computeRunReadingStats([
      { startedAt: '2026-01-01T10:00:00.000Z', durationSeconds: 300, readingExperience: 'some_future_value' },
      { startedAt: '2026-01-02T10:00:00.000Z', durationSeconds: 300, readingExperience: null },
    ]);
    expect(stats.dominantExperience).toBeNull();
  });

  it('рівність голосів — перемагає значення, що зустрілось РАНІШЕ у вхідному масиві', () => {
    const stats = computeRunReadingStats([
      { startedAt: '2026-01-01T10:00:00.000Z', durationSeconds: 300, readingExperience: 'calm' },
      { startedAt: '2026-01-02T10:00:00.000Z', durationSeconds: 300, readingExperience: 'tense' },
    ]);
    expect(stats.dominantExperience).toBe('calm');
  });

  it('усі сесії без readingExperience — dominantExperience null, решта полів рахуються нормально', () => {
    const stats = computeRunReadingStats([
      { startedAt: '2026-01-01T10:00:00.000Z', durationSeconds: 120, readingExperience: null },
    ]);
    expect(stats.dominantExperience).toBeNull();
    expect(stats.totalDurationSeconds).toBe(120);
    expect(stats.sessionCount).toBe(1);
    expect(stats.daysSpent).toBe(1);
  });
});

describe('computeNumericDelta', () => {
  it('обидва значення відомі — diff = to - from', () => {
    expect(computeNumericDelta(3, 4.5)).toEqual({ from: 3, to: 4.5, diff: 1.5 });
  });

  it('обидва значення відомі, спадання — diff від\'ємний', () => {
    expect(computeNumericDelta(5, 2)).toEqual({ from: 5, to: 2, diff: -3 });
  });

  it('from відсутній — diff null, а не вигадане число', () => {
    expect(computeNumericDelta(null, 4)).toEqual({ from: null, to: 4, diff: null });
  });

  it('to відсутній — diff null', () => {
    expect(computeNumericDelta(3, null)).toEqual({ from: 3, to: null, diff: null });
  });

  it('обидва відсутні — diff null', () => {
    expect(computeNumericDelta(null, null)).toEqual({ from: null, to: null, diff: null });
  });
});
