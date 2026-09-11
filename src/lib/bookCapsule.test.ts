import {
  calculateCapsuleReopenAt,
  canCreateCapsule,
  isCapsuleDue,
  normalizeCapsuleText,
  validateCapsuleContent,
} from './bookCapsule';

/**
 * Чисті функції `src/lib/bookCapsule.ts` (POLYTSIA V1.6, Фаза 4 — «Капсула книги») — без БД,
 * той самий підхід, що й `onThisDay.test.ts`/`finishPrediction.test.ts`.
 */

describe('validateCapsuleContent', () => {
  it('порожня капсула (усі поля null) — відхилена', () => {
    expect(
      validateCapsuleContent({
        lastingThought: null,
        oneSentenceMemory: null,
        favoriteCharacterText: null,
        journalEntryId: null,
      }),
    ).toBe(false);
  });

  it('лише пробіли в усіх текстових полях — так само відхилена, як порожні (п.39 ТЗ, trim)', () => {
    expect(
      validateCapsuleContent({
        lastingThought: '   ',
        oneSentenceMemory: '\n\t',
        favoriteCharacterText: '  ',
        journalEntryId: null,
      }),
    ).toBe(false);
  });

  it('лише lastingThought — достатньо', () => {
    expect(
      validateCapsuleContent({
        lastingThought: 'Ця книга навчила мене чекати.',
        oneSentenceMemory: null,
        favoriteCharacterText: null,
        journalEntryId: null,
      }),
    ).toBe(true);
  });

  it('лише oneSentenceMemory — достатньо', () => {
    expect(
      validateCapsuleContent({
        lastingThought: null,
        oneSentenceMemory: 'Про дорослішання.',
        favoriteCharacterText: null,
        journalEntryId: null,
      }),
    ).toBe(true);
  });

  it('лише favoriteCharacterText — достатньо', () => {
    expect(
      validateCapsuleContent({
        lastingThought: null,
        oneSentenceMemory: null,
        favoriteCharacterText: 'Пол Атрідес',
        journalEntryId: null,
      }),
    ).toBe(true);
  });

  it('лише journalEntryId (без жодного тексту) — достатньо', () => {
    expect(
      validateCapsuleContent({
        lastingThought: null,
        oneSentenceMemory: null,
        favoriteCharacterText: null,
        journalEntryId: 'note-1',
      }),
    ).toBe(true);
  });
});

describe('normalizeCapsuleText', () => {
  it('обрізає пробіли з обох боків', () => {
    expect(normalizeCapsuleText('  привіт  ')).toBe('привіт');
  });

  it('рядок лише з пробілів → null', () => {
    expect(normalizeCapsuleText('   ')).toBeNull();
  });

  it('null лишається null', () => {
    expect(normalizeCapsuleText(null)).toBeNull();
  });
});

describe('calculateCapsuleReopenAt', () => {
  const CREATED_AT = new Date('2026-01-10T12:00:00.000Z');

  it("'none' — без нагадування, null", () => {
    expect(calculateCapsuleReopenAt('none', CREATED_AT)).toBeNull();
  });

  it("'3_months' — +3 календарні місяці", () => {
    expect(calculateCapsuleReopenAt('3_months', CREATED_AT)).toBe(
      new Date('2026-04-10T12:00:00.000Z').toISOString(),
    );
  });

  it("'6_months' — +6 календарних місяців", () => {
    expect(calculateCapsuleReopenAt('6_months', CREATED_AT)).toBe(
      new Date('2026-07-10T12:00:00.000Z').toISOString(),
    );
  });

  it("'1_year' — +1 календарний рік", () => {
    expect(calculateCapsuleReopenAt('1_year', CREATED_AT)).toBe(
      new Date('2027-01-10T12:00:00.000Z').toISOString(),
    );
  });

  it('п.37 ТЗ: кінець місяця (31 серпня + 6 місяців) — clamp на останній день лютого, а не переліт у березень', () => {
    const endOfAugust = new Date('2026-08-31T12:00:00.000Z');
    expect(calculateCapsuleReopenAt('6_months', endOfAugust)).toBe(
      new Date('2027-02-28T12:00:00.000Z').toISOString(),
    );
  });

  it('п.38 ТЗ: 29 лютого високосного року + 1 рік → 28 лютого наступного невисокосного року', () => {
    const leapDay = new Date('2028-02-29T12:00:00.000Z');
    expect(calculateCapsuleReopenAt('1_year', leapDay)).toBe(new Date('2029-02-28T12:00:00.000Z').toISOString());
  });
});

describe('canCreateCapsule', () => {
  it('finished — прийнятна', () => {
    expect(canCreateCapsule('finished')).toBe(true);
  });

  it('did_not_finish (DNF) — НЕ прийнятна (п.33 ТЗ)', () => {
    expect(canCreateCapsule('did_not_finish')).toBe(false);
  });

  it('reading — не прийнятна', () => {
    expect(canCreateCapsule('reading')).toBe(false);
  });

  it('want_to_read — не прийнятна', () => {
    expect(canCreateCapsule('want_to_read')).toBe(false);
  });

  it('paused — не прийнятна', () => {
    expect(canCreateCapsule('paused')).toBe(false);
  });

  it('rereading — не прийнятна для СТВОРЕННЯ нової (п.13/30 ТЗ — немає надійного способу прив’язати до нового прочитання)', () => {
    expect(canCreateCapsule('rereading')).toBe(false);
  });
});

describe('isCapsuleDue', () => {
  const REFERENCE = new Date('2026-09-11T12:00:00.000Z');

  it('reopenAt у минулому — due', () => {
    expect(isCapsuleDue({ reopenAt: '2026-09-01T00:00:00.000Z' }, REFERENCE)).toBe(true);
  });

  it('reopenAt точно зараз — due (включно)', () => {
    expect(isCapsuleDue({ reopenAt: REFERENCE.toISOString() }, REFERENCE)).toBe(true);
  });

  it('reopenAt у майбутньому — ще не due', () => {
    expect(isCapsuleDue({ reopenAt: '2027-01-01T00:00:00.000Z' }, REFERENCE)).toBe(false);
  });

  it('reopenAt відсутній (null) — ніколи не due', () => {
    expect(isCapsuleDue({ reopenAt: null }, REFERENCE)).toBe(false);
  });
});
