import { isValidIsbn, isbn10To13, isbn13To10, isbnEquivalents, normalizeIsbn } from './isbn';

describe('normalizeIsbn', () => {
  it('прибирає дефіси, пробіли, приводить до верхнього регістру', () => {
    expect(normalizeIsbn('978-966-03-9500-8')).toBe('9789660395008');
    expect(normalizeIsbn('0 306 40615 2')).toBe('0306406152');
    expect(normalizeIsbn('080442957x')).toBe('080442957X');
  });
});

describe('isValidIsbn', () => {
  it('коректний ISBN-10 (звичайна цифра й "X")', () => {
    expect(isValidIsbn('0-306-40615-2')).toBe(true);
    expect(isValidIsbn('080442957X')).toBe(true);
  });

  it('коректний ISBN-13', () => {
    expect(isValidIsbn('978-966-03-9500-8')).toBe(true);
    expect(isValidIsbn('9780306406157')).toBe(true);
  });

  it('хибна контрольна цифра — не валідний', () => {
    expect(isValidIsbn('0-306-40615-3')).toBe(false);
    expect(isValidIsbn('9780306406158')).toBe(false);
  });

  it('неправильна довжина — не валідний', () => {
    expect(isValidIsbn('12345')).toBe(false);
    expect(isValidIsbn('')).toBe(false);
  });
});

describe('isbn10To13 / isbn13To10 — конвертація в обидва боки', () => {
  it('ISBN-10 → ISBN-13 — відомий приклад', () => {
    expect(isbn10To13('0-306-40615-2')).toBe('9780306406157');
  });

  it('ISBN-13 (978…) → ISBN-10 — зворотна конвертація того самого прикладу', () => {
    expect(isbn13To10('9780306406157')).toBe('0306406152');
  });

  it('round-trip: ISBN-10 → ISBN-13 → ISBN-10 повертає той самий ISBN-10', () => {
    const isbn13 = isbn10To13('080442957X');
    expect(isbn13).not.toBeNull();
    expect(isbn13To10(isbn13!)).toBe('080442957X');
  });

  it('ISBN-13 з префіксом 979 не має ISBN-10-еквівалента', () => {
    // 9791234567896 — коректна контрольна цифра, префікс 979
    expect(isbn13To10('9791234567896')).toBeNull();
  });

  it('некоректний вхід повертає null замість викидання винятку', () => {
    expect(isbn10To13('not-an-isbn')).toBeNull();
    expect(isbn13To10('not-an-isbn')).toBeNull();
  });
});

describe('isbnEquivalents', () => {
  it('на вході ISBN-10 — обчислює відповідний ISBN-13', () => {
    expect(isbnEquivalents('0-306-40615-2')).toEqual({
      isbn10: '0306406152',
      isbn13: '9780306406157',
    });
  });

  it('на вході ISBN-13 (978…) — обчислює відповідний ISBN-10', () => {
    expect(isbnEquivalents('9780306406157')).toEqual({
      isbn10: '0306406152',
      isbn13: '9780306406157',
    });
  });

  it('на вході ISBN-13 (979…) — ISBN-10 відсутній за визначенням', () => {
    expect(isbnEquivalents('9791234567896')).toEqual({
      isbn10: null,
      isbn13: '9791234567896',
    });
  });

  it('некоректний вхід — обидва поля null', () => {
    expect(isbnEquivalents('garbage')).toEqual({ isbn10: null, isbn13: null });
  });
});
