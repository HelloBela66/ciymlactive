import { formatCompactDuration, formatDurationForAccessibility } from './calendarFormat';

describe('formatCompactDuration', () => {
  it('0 (і захисно від\'ємне) — "0 хв"', () => {
    expect(formatCompactDuration(0)).toBe('0 хв');
    expect(formatCompactDuration(-5)).toBe('0 хв');
  });

  it('менше години — лише хвилини', () => {
    expect(formatCompactDuration(1)).toBe('1 хв');
    expect(formatCompactDuration(45)).toBe('45 хв');
    expect(formatCompactDuration(59)).toBe('59 хв');
  });

  it('рівно N годин без залишку — без "0 хв"', () => {
    expect(formatCompactDuration(60)).toBe('1 год');
    expect(formatCompactDuration(120)).toBe('2 год');
  });

  it('години + хвилини-залишок', () => {
    expect(formatCompactDuration(72)).toBe('1 год 12 хв');
    expect(formatCompactDuration(125)).toBe('2 год 5 хв');
  });

  it('округлює дробові хвилини до цілого перед форматуванням', () => {
    expect(formatCompactDuration(72.4)).toBe('1 год 12 хв');
    expect(formatCompactDuration(59.6)).toBe('1 год');
  });
});

describe('formatDurationForAccessibility', () => {
  it('0 (і захисно від\'ємне) — "0 хвилин"', () => {
    expect(formatDurationForAccessibility(0)).toBe('0 хвилин');
    expect(formatDurationForAccessibility(-5)).toBe('0 хвилин');
  });

  it('менше години — лише хвилини, правильна форма', () => {
    expect(formatDurationForAccessibility(1)).toBe('1 хвилина');
    expect(formatDurationForAccessibility(3)).toBe('3 хвилини');
    expect(formatDurationForAccessibility(5)).toBe('5 хвилин');
  });

  it('рівно N годин без залишку — без "0 хвилин"', () => {
    expect(formatDurationForAccessibility(60)).toBe('1 година');
    expect(formatDurationForAccessibility(120)).toBe('2 години');
  });

  it('години + хвилини-залишок, приклад з ТЗ ("1 година 12 хвилин")', () => {
    expect(formatDurationForAccessibility(72)).toBe('1 година 12 хвилин');
  });
});
