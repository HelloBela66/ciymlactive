import {
  canEditPreReadingReflection,
  normalizeReflectionText,
  pickBeforeCardText,
  validatePreReadingReflectionContent,
} from './beforeAfter';

/**
 * Чисті функції `src/lib/beforeAfter.ts` (POLYTSIA V1.6, Фаза 6 — «До/Після») — без БД, той
 * самий підхід, що й `bookCapsule.test.ts`/`recall.test.ts`.
 */

describe('normalizeReflectionText', () => {
  it('обрізає пробіли з обох боків', () => {
    expect(normalizeReflectionText('  чекаю дуже важку фантастику  ')).toBe('чекаю дуже важку фантастику');
  });

  it('рядок лише з пробілів → null', () => {
    expect(normalizeReflectionText('   \n\t')).toBeNull();
  });

  it('null лишається null', () => {
    expect(normalizeReflectionText(null)).toBeNull();
  });
});

describe('validatePreReadingReflectionContent', () => {
  it('усі поля порожні → false', () => {
    expect(validatePreReadingReflectionContent({ reasonText: null, expectationText: null, expectedRating: null })).toBe(false);
  });

  it('лише reasonText → true', () => {
    expect(
      validatePreReadingReflectionContent({ reasonText: 'Порадили друзі', expectationText: null, expectedRating: null }),
    ).toBe(true);
  });

  it('лише expectationText → true', () => {
    expect(
      validatePreReadingReflectionContent({ reasonText: null, expectationText: 'Чекаю щось легке', expectedRating: null }),
    ).toBe(true);
  });

  it('лише expectedRating → true', () => {
    expect(validatePreReadingReflectionContent({ reasonText: null, expectationText: null, expectedRating: 4.5 })).toBe(true);
  });

  it('рядок лише з пробілів рахується як порожній', () => {
    expect(
      validatePreReadingReflectionContent({ reasonText: '   ', expectationText: '   ', expectedRating: null }),
    ).toBe(false);
  });
});

describe('canEditPreReadingReflection', () => {
  it('"reading" — можна', () => {
    expect(canEditPreReadingReflection('reading')).toBe(true);
  });

  it('"finished" — не можна (писати "до" заднім числом підважує сенс порівняння)', () => {
    expect(canEditPreReadingReflection('finished')).toBe(false);
  });

  it('"want_to_read" — ще не можна', () => {
    expect(canEditPreReadingReflection('want_to_read')).toBe(false);
  });

  it('"paused"/"rereading"/"did_not_finish" — не можна', () => {
    expect(canEditPreReadingReflection('paused')).toBe(false);
    expect(canEditPreReadingReflection('rereading')).toBe(false);
    expect(canEditPreReadingReflection('did_not_finish')).toBe(false);
  });
});

describe('pickBeforeCardText', () => {
  it('null (нотатки немає) → null', () => {
    expect(pickBeforeCardText(null)).toBeNull();
  });

  it('обидва поля є → пріоритет expectationText', () => {
    expect(pickBeforeCardText({ reasonText: 'Порадили друзі', expectationText: 'Чекаю щось легке' })).toBe('Чекаю щось легке');
  });

  it('лише reasonText → повертає його', () => {
    expect(pickBeforeCardText({ reasonText: 'Порадили друзі', expectationText: null })).toBe('Порадили друзі');
  });

  it('обидва null → null', () => {
    expect(pickBeforeCardText({ reasonText: null, expectationText: null })).toBeNull();
  });
});
