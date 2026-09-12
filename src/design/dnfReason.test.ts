import { DNF_REASON_ORDER, isDnfReasonId } from './dnfReason';

/**
 * POLYTSIA V1.6, Фаза 21 (TESTS) — `isDnfReasonId` (Фаза 12, DNF IMPROVEMENT) не мав жодного
 * тесту: єдиний виклик — `app/work/[workId].tsx`, UI-код, який ця сесія не покриває unit-
 * тестами. Той самий тип guard-функції, що й `isReadingExperienceId`
 * (`src/design/readingExperience.ts`) — перевіряє довільний рядок (наприклад, зі старого
 * бекапу чи БД) проти фіксованого списку `DNF_REASON_ORDER`.
 */
describe('isDnfReasonId', () => {
  it('кожне значення з DNF_REASON_ORDER визнається валідним', () => {
    for (const reason of DNF_REASON_ORDER) {
      expect(isDnfReasonId(reason)).toBe(true);
    }
  });

  it('невідомий рядок — false', () => {
    expect(isDnfReasonId('not_a_real_reason')).toBe(false);
  });

  it('порожній рядок — false', () => {
    expect(isDnfReasonId('')).toBe(false);
  });
});
