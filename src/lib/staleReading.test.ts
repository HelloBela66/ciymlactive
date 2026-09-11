import { computeStaleReadingInfo, describeStaleReading, STALE_READING_THRESHOLD_DAYS } from './staleReading';

const NOW = new Date('2026-02-01T12:00:00.000Z');

describe('computeStaleReadingInfo', () => {
  it('returns null when there is no last session', () => {
    expect(computeStaleReadingInfo(null, NOW)).toBeNull();
  });

  it('returns null when the last session has no endedAt (not actually completed)', () => {
    expect(computeStaleReadingInfo({ endedAt: null, endPage: 120 }, NOW)).toBeNull();
  });

  it('returns null just below the threshold', () => {
    expect(STALE_READING_THRESHOLD_DAYS).toBe(14);
    // 13 днів тому.
    const lastSession = { endedAt: '2026-01-19T12:00:00.000Z', endPage: 120 };
    expect(computeStaleReadingInfo(lastSession, NOW)).toBeNull();
  });

  it('returns info exactly at the threshold', () => {
    // 14 днів тому.
    const lastSession = { endedAt: '2026-01-18T12:00:00.000Z', endPage: 120 };
    expect(computeStaleReadingInfo(lastSession, NOW)).toEqual({ daysSinceLastSession: 14, lastPage: 120 });
  });

  it('returns info above the threshold', () => {
    // 18 днів тому — той самий приклад, що й у ТЗ Фази 8.
    const lastSession = { endedAt: '2026-01-14T12:00:00.000Z', endPage: 418 };
    expect(computeStaleReadingInfo(lastSession, NOW)).toEqual({ daysSinceLastSession: 18, lastPage: 418 });
  });

  it('carries a null lastPage through unchanged', () => {
    const lastSession = { endedAt: '2026-01-01T00:00:00.000Z', endPage: null };
    expect(computeStaleReadingInfo(lastSession, NOW)).toEqual({ daysSinceLastSession: 31, lastPage: null });
  });
});

describe('describeStaleReading', () => {
  it('pluralizes "день" for 1', () => {
    expect(describeStaleReading({ daysSinceLastSession: 1, lastPage: null })).toBe('Останнє читання — 1 день тому.');
  });

  it('pluralizes "дні" for 2-4', () => {
    expect(describeStaleReading({ daysSinceLastSession: 3, lastPage: null })).toBe('Останнє читання — 3 дні тому.');
  });

  it('pluralizes "днів" for 5+ (and for the 11-14 exception)', () => {
    expect(describeStaleReading({ daysSinceLastSession: 18, lastPage: null })).toBe(
      'Останнє читання — 18 днів тому.',
    );
    expect(describeStaleReading({ daysSinceLastSession: 14, lastPage: null })).toBe(
      'Останнє читання — 14 днів тому.',
    );
  });

  it('appends the last page when known', () => {
    expect(describeStaleReading({ daysSinceLastSession: 18, lastPage: 418 })).toBe(
      'Останнє читання — 18 днів тому. Ти зупинився на стор. 418.',
    );
  });

  it('omits the page sentence when the page is unknown', () => {
    expect(describeStaleReading({ daysSinceLastSession: 18, lastPage: null })).toBe(
      'Останнє читання — 18 днів тому.',
    );
  });
});
