import { canEditDnfReflection, computeDnfProgressPercent, normalizeDnfNote } from './dnfReflection';

describe('normalizeDnfNote', () => {
  it('trims whitespace', () => {
    expect(normalizeDnfNote('  трохи занудно  ')).toBe('трохи занудно');
  });

  it('turns empty/whitespace-only text into null', () => {
    expect(normalizeDnfNote('')).toBeNull();
    expect(normalizeDnfNote('   ')).toBeNull();
  });

  it('passes null through', () => {
    expect(normalizeDnfNote(null)).toBeNull();
  });
});

describe('computeDnfProgressPercent', () => {
  it('computes percent from a known page count', () => {
    expect(computeDnfProgressPercent(100, 400)).toBe(25);
  });

  it('returns null when the edition page count is unknown', () => {
    expect(computeDnfProgressPercent(100, null)).toBeNull();
  });

  it('handles page 0 (DNF right at the start)', () => {
    expect(computeDnfProgressPercent(0, 400)).toBe(0);
  });
});

describe('canEditDnfReflection', () => {
  it('is editable only while status is did_not_finish', () => {
    expect(canEditDnfReflection('did_not_finish')).toBe(true);
    expect(canEditDnfReflection('reading')).toBe(false);
    expect(canEditDnfReflection('finished')).toBe(false);
    expect(canEditDnfReflection('paused')).toBe(false);
    expect(canEditDnfReflection('want_to_read')).toBe(false);
    expect(canEditDnfReflection('rereading')).toBe(false);
  });
});
