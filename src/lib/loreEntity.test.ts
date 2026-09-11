import {
  computeFirstSeenProgress,
  normalizeLoreEntityDescription,
  normalizeLoreEntityName,
  trimOrNull,
  validateLoreEntityName,
} from './loreEntity';

describe('trimOrNull', () => {
  it('returns null for null', () => {
    expect(trimOrNull(null)).toBeNull();
  });

  it('returns null for a whitespace-only string', () => {
    expect(trimOrNull('   ')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(trimOrNull('  Пол Атрідес  ')).toBe('Пол Атрідес');
  });
});

describe('validateLoreEntityName', () => {
  it('rejects an empty name', () => {
    expect(validateLoreEntityName('')).toBe(false);
  });

  it('rejects a whitespace-only name', () => {
    expect(validateLoreEntityName('   ')).toBe(false);
  });

  it('accepts a non-empty name', () => {
    expect(validateLoreEntityName('Пол Атрідес')).toBe(true);
  });
});

describe('normalizeLoreEntityName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeLoreEntityName('  Пол Атрідес  ')).toBe('Пол Атрідес');
  });
});

describe('normalizeLoreEntityDescription', () => {
  it('converts an empty string to null', () => {
    expect(normalizeLoreEntityDescription('')).toBeNull();
  });

  it('converts null to null', () => {
    expect(normalizeLoreEntityDescription(null)).toBeNull();
  });

  it('trims a non-empty description', () => {
    expect(normalizeLoreEntityDescription('  Спадкоємець дому Атрідес.  ')).toBe('Спадкоємець дому Атрідес.');
  });
});

describe('computeFirstSeenProgress', () => {
  it('returns null when the page is unknown', () => {
    expect(computeFirstSeenProgress(null, 400)).toBeNull();
  });

  it('returns null when the page count is unknown', () => {
    expect(computeFirstSeenProgress(40, null)).toBeNull();
  });

  it('computes the percent from page and page count', () => {
    expect(computeFirstSeenProgress(100, 400)).toBe(25);
  });
});
