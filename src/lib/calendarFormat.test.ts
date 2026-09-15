import {
  formatCompactDuration,
  formatDurationForAccessibility,
  formatMonthName,
} from './calendarFormat';

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

/**
 * POLYTSIA V1.7, Phase 6 — регресійний тест на КОНКРЕТНИЙ виправлений дефект: Wrapped будував
 * назву найактивнішого місяця через `Date.UTC(year, month - 1, 1)`, і в поясі на захід від
 * Гринвіча січень підписувався як «грудень».
 *
 * Інваріант навмисно сформульований так, щоб бути істинним у БУДЬ-ЯКОМУ поясі: назва місяця
 * мусить залежати ЛИШЕ від переданих `year`/`month`. Багована реалізація цю умову порушувала
 * рівно там, де offset від'ємний (`npm run test:tz` ганяє цей suite ще й під `TZ=Europe/Kyiv`).
 */
describe('formatMonthName', () => {
  it('приймає людський номер місяця (1-12) і дає називний відмінок з великої літери', () => {
    expect(formatMonthName(2026, 1)).toBe('Січень');
    expect(formatMonthName(2026, 8)).toBe('Серпень');
    expect(formatMonthName(2026, 12)).toBe('Грудень');
  });

  it('МЕЖА РОКУ: січень лишається січнем, грудень — груднем (регресія UTC-дефекту)', () => {
    expect(formatMonthName(2027, 1)).toBe('Січень');
    expect(formatMonthName(2026, 12)).toBe('Грудень');
    expect(formatMonthName(2027, 1)).not.toBe(formatMonthName(2026, 12));
  });

  it('назва залежить лише від номера місяця, не від року', () => {
    for (let month = 1; month <= 12; month += 1) {
      expect(formatMonthName(2026, month)).toBe(formatMonthName(2031, month));
    }
  });

  it("усі дванадцять місяців різні — жоден не «з'їхав» на сусідній", () => {
    const names = Array.from({ length: 12 }, (_, index) => formatMonthName(2026, index + 1));
    expect(new Set(names).size).toBe(12);
  });
});
