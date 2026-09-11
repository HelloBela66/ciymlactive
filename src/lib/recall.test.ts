import { formatTimeSinceFinished, normalizeRecallText } from './recall';

/**
 * Чисті функції `src/lib/recall.ts` (POLYTSIA V1.6, Фаза 5 — «Книга через час») — без БД, той
 * самий підхід, що й `bookCapsule.test.ts`/`onThisDay.test.ts`.
 */

describe('normalizeRecallText', () => {
  it('обрізає пробіли з обох боків', () => {
    expect(normalizeRecallText('  пам\'ятаю дощ  ')).toBe('пам\'ятаю дощ');
  });

  it('рядок лише з пробілів → null', () => {
    expect(normalizeRecallText('   \n\t')).toBeNull();
  });

  it('null лишається null', () => {
    expect(normalizeRecallText(null)).toBeNull();
  });
});

describe('formatTimeSinceFinished', () => {
  it('той самий день — "сьогодні"', () => {
    expect(formatTimeSinceFinished('2026-09-11T08:00:00.000Z', new Date('2026-09-11T20:00:00.000Z'))).toBe(
      'сьогодні',
    );
  });

  it('менше місяця — дні, з правильною плюралізацією (1 день)', () => {
    expect(formatTimeSinceFinished('2026-09-10T12:00:00.000Z', new Date('2026-09-11T12:00:00.000Z'))).toBe(
      '1 день тому',
    );
  });

  it('менше місяця — дні (3 дні)', () => {
    expect(formatTimeSinceFinished('2026-09-08T12:00:00.000Z', new Date('2026-09-11T12:00:00.000Z'))).toBe(
      '3 дні тому',
    );
  });

  it('менше повного місяця через день місяця (31 серпня → 11 вересня) — дні, виняток 11-14 (differenceInMonths, не differenceInCalendarMonths)', () => {
    expect(formatTimeSinceFinished('2026-08-31T12:00:00.000Z', new Date('2026-09-11T12:00:00.000Z'))).toBe(
      '11 днів тому',
    );
  });

  it('рівно 1 календарний місяць — "1 місяць тому"', () => {
    expect(formatTimeSinceFinished('2026-08-11T12:00:00.000Z', new Date('2026-09-11T12:00:00.000Z'))).toBe(
      '1 місяць тому',
    );
  });

  it('кілька місяців — "3 місяці тому"', () => {
    expect(formatTimeSinceFinished('2026-06-11T12:00:00.000Z', new Date('2026-09-11T12:00:00.000Z'))).toBe(
      '3 місяці тому',
    );
  });

  it('8 повних місяців (1 січня → 11 вересня) — "8 місяців тому"', () => {
    expect(formatTimeSinceFinished('2026-01-01T12:00:00.000Z', new Date('2026-09-11T12:00:00.000Z'))).toBe(
      '8 місяців тому',
    );
  });

  it('рівно 12 місяців → округлені роки, не "12 місяців тому"', () => {
    expect(formatTimeSinceFinished('2025-09-11T12:00:00.000Z', new Date('2026-09-11T12:00:00.000Z'))).toBe(
      '1 рік тому',
    );
  });

  it('14 місяців → округлено до "1 рік тому", а не "14 місяців тому"', () => {
    expect(formatTimeSinceFinished('2025-07-11T12:00:00.000Z', new Date('2026-09-11T12:00:00.000Z'))).toBe(
      '1 рік тому',
    );
  });

  it('кілька років — "2 роки тому"', () => {
    expect(formatTimeSinceFinished('2024-09-11T12:00:00.000Z', new Date('2026-09-11T12:00:00.000Z'))).toBe(
      '2 роки тому',
    );
  });

  it('багато років — "5 років тому"', () => {
    expect(formatTimeSinceFinished('2021-09-11T12:00:00.000Z', new Date('2026-09-11T12:00:00.000Z'))).toBe(
      '5 років тому',
    );
  });
});
