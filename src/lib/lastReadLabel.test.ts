import { formatLastReadLabel } from './lastReadLabel';

describe('formatLastReadLabel (Фаза 8 — READING CONTINUITY)', () => {
  const now = new Date('2026-09-10T15:00:00.000Z');

  it('сьогодні — лише час, з малої літери', () => {
    expect(formatLastReadLabel('2026-09-10T22:41:00.000Z', now)).toBe('сьогодні о 22:41');
  });

  it('учора — з часом', () => {
    expect(formatLastReadLabel('2026-09-09T22:41:00.000Z', now)).toBe('учора о 22:41');
  });

  it('давніше — дата без року, з часом', () => {
    expect(formatLastReadLabel('2026-08-01T10:05:00.000Z', now)).toBe('1 серпня о 10:05');
  });

  it('межа опівночі: учора о 23:59 не стає "сьогодні"', () => {
    const midnight = new Date('2026-09-10T00:10:00.000Z');
    expect(formatLastReadLabel('2026-09-09T23:59:00.000Z', midnight)).toBe('учора о 23:59');
  });
});
