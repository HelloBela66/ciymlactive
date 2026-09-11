import {
  computeReadingExperienceTimeline,
  MIN_SESSIONS_FOR_READING_EXPERIENCE_TIMELINE,
} from './readingExperienceTimeline';
import type { ReadingSession } from '@/types/readingSession';

/** Мінімальна фабрика завершеної сесії читання для тестів — той самий підхід, що й `entry()` у
 * `journalTimeline.test.ts`: лише поля, що впливають на позиціонування (`startedAt`/`startPage`/
 * `endPage`) чи `experience` (`readingExperience`), решта — стабільні заглушки. */
function session(overrides: Partial<ReadingSession> & Pick<ReadingSession, 'id' | 'startedAt'>): ReadingSession {
  return {
    userBookId: 'ub-1',
    endedAt: overrides.startedAt,
    goalMinutes: null,
    pausedIntervals: [],
    startPage: 1,
    endPage: 10,
    durationSeconds: 600,
    moodNote: null,
    readingExperience: null,
    isEdited: false,
    createdAt: overrides.startedAt,
    updatedAt: overrides.startedAt,
    ...overrides,
  };
}

describe('computeReadingExperienceTimeline', () => {
  it('returns an empty array for no sessions', () => {
    expect(computeReadingExperienceTimeline([], 300)).toEqual([]);
  });

  it('returns an empty array below the minimum session threshold', () => {
    expect(MIN_SESSIONS_FOR_READING_EXPERIENCE_TIMELINE).toBe(3);
    const sessions = [
      session({ id: 'a', startedAt: '2026-01-01T00:00:00.000Z' }),
      session({ id: 'b', startedAt: '2026-01-02T00:00:00.000Z' }),
    ];
    expect(computeReadingExperienceTimeline(sessions, 300)).toEqual([]);
  });

  it('positions sessions by end-page progress when pageCount is known', () => {
    const sessions = [
      session({ id: 'a', startedAt: '2026-01-01T00:00:00.000Z', startPage: 1, endPage: 30 }),
      session({ id: 'b', startedAt: '2026-01-02T00:00:00.000Z', startPage: 30, endPage: 150 }),
      session({ id: 'c', startedAt: '2026-01-03T00:00:00.000Z', startPage: 150, endPage: 300 }),
    ];
    const markers = computeReadingExperienceTimeline(sessions, 300);
    expect(markers.map((m) => [m.sessionId, m.percent, m.positionSource])).toEqual([
      ['a', 10, 'progress'],
      ['b', 50, 'progress'],
      ['c', 100, 'progress'],
    ]);
  });

  it('falls back to evenly-spread chronological positions when pageCount is unknown', () => {
    const sessions = [
      session({ id: 'a', startedAt: '2026-01-01T00:00:00.000Z' }),
      session({ id: 'b', startedAt: '2026-01-02T00:00:00.000Z' }),
      session({ id: 'c', startedAt: '2026-01-03T00:00:00.000Z' }),
    ];
    const markers = computeReadingExperienceTimeline(sessions, null);
    expect(markers.map((m) => [m.sessionId, m.percent, m.positionSource])).toEqual([
      ['a', 0, 'chronological'],
      ['b', 50, 'chronological'],
      ['c', 100, 'chronological'],
    ]);
  });

  it('sorts markers chronologically regardless of input order', () => {
    const sessions = [
      session({ id: 'c', startedAt: '2026-01-03T00:00:00.000Z' }),
      session({ id: 'a', startedAt: '2026-01-01T00:00:00.000Z' }),
      session({ id: 'b', startedAt: '2026-01-02T00:00:00.000Z' }),
    ];
    const markers = computeReadingExperienceTimeline(sessions, null);
    expect(markers.map((m) => m.sessionId)).toEqual(['a', 'b', 'c']);
  });

  it('carries a recognized reading_experience value through', () => {
    const sessions = [
      session({ id: 'a', startedAt: '2026-01-01T00:00:00.000Z', readingExperience: 'engaging' }),
      session({ id: 'b', startedAt: '2026-01-02T00:00:00.000Z' }),
      session({ id: 'c', startedAt: '2026-01-03T00:00:00.000Z', readingExperience: 'difficult' }),
    ];
    const markers = computeReadingExperienceTimeline(sessions, null);
    expect(markers.map((m) => m.experience)).toEqual(['engaging', null, 'difficult']);
  });

  it('treats an unrecognized reading_experience value as "no answer"', () => {
    const sessions = [
      session({ id: 'a', startedAt: '2026-01-01T00:00:00.000Z', readingExperience: 'some-future-value' }),
      session({ id: 'b', startedAt: '2026-01-02T00:00:00.000Z' }),
      session({ id: 'c', startedAt: '2026-01-03T00:00:00.000Z' }),
    ];
    const markers = computeReadingExperienceTimeline(sessions, null);
    expect(markers[0]?.experience).toBeNull();
  });
});
