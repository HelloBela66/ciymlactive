'use strict';

const { normalizeRecord } = require('./normalize');

/** Хелпер — повний "сирий" (ще не нормалізований) запис із усіма 12 полями, як їх повертає
 * `catalogSchema.js`'s `rawRecordFromRow` (усе рядками, як безпосередньо з CSV). */
function raw(overrides) {
  return {
    id: 'book-1',
    title: '  Назва книги  ',
    authors: 'Перший Автор;Другий Автор',
    isbn13: '',
    isbn10: '',
    page_count: '',
    cover_url: '',
    description: '',
    genres: 'Фентезі;Романтика',
    purposes: 'light',
    language: '',
    is_active: '',
    ...overrides,
  };
}

describe('normalizeRecord — authors/genres/purposes', () => {
  it('розбиває authors за ";" і обрізає пробіли', () => {
    expect(normalizeRecord(raw()).authors).toEqual(['Перший Автор', 'Другий Автор']);
  });

  it('genres/purposes розбиваються так само, як authors', () => {
    const n = normalizeRecord(raw());
    expect(n.genres).toEqual(['Фентезі', 'Романтика']);
    expect(n.purposes).toEqual(['light']);
  });

  it('title обрізається (trim), сам текст не змінюється — жодного AI-рерайту/прикрашання (ТЗ §9)', () => {
    expect(normalizeRecord(raw()).title).toBe('Назва книги');
  });
});

describe('normalizeRecord — ISBN-еквіваленти (ТЗ §7)', () => {
  it('дано лише isbn13 — isbn10 обчислюється автоматично, якщо можливо', () => {
    const n = normalizeRecord(raw({ isbn13: '9780306406157', isbn10: '' }));
    expect(n.isbn13).toBe('9780306406157');
    expect(n.isbn10).toBe('0306406152');
  });

  it('дано лише isbn10 — isbn13 обчислюється автоматично', () => {
    const n = normalizeRecord(raw({ isbn13: '', isbn10: '0-306-40615-2' }));
    expect(n.isbn10).toBe('0306406152');
    expect(n.isbn13).toBe('9780306406157');
  });

  it('дано обидва — обидва нормалізуються (дефіси/пробіли прибрано), еквівалент НЕ перезаписує явно вказане значення', () => {
    const n = normalizeRecord(raw({ isbn13: '978-966-03-9500-8', isbn10: '0-306-40615-2' }));
    expect(n.isbn13).toBe('9789660395008');
    expect(n.isbn10).toBe('0306406152');
  });

  it('жоден ISBN не вказано — обидва поля null (не порожній рядок)', () => {
    const n = normalizeRecord(raw({ isbn13: '', isbn10: '' }));
    expect(n.isbn13).toBeNull();
    expect(n.isbn10).toBeNull();
  });

  it('isbn13 з префіксом 979 — isbn10 лишається null (за визначенням немає еквівалента)', () => {
    const n = normalizeRecord(raw({ isbn13: '9791234567896', isbn10: '' }));
    expect(n.isbn13).toBe('9791234567896');
    expect(n.isbn10).toBeNull();
  });
});

describe('normalizeRecord — page_count/description/language/is_active', () => {
  it('page_count — рядок числа стає числом', () => {
    expect(normalizeRecord(raw({ page_count: '544' })).pageCount).toBe(544);
  });

  it('порожній page_count — null, не 0 і не NaN', () => {
    expect(normalizeRecord(raw({ page_count: '' })).pageCount).toBeNull();
  });

  it('опис обрізається (trim), порожній опис — null', () => {
    expect(normalizeRecord(raw({ description: '  Опис книги.  ' })).description).toBe('Опис книги.');
    expect(normalizeRecord(raw({ description: '' })).description).toBeNull();
  });

  it('порожня мова — дефолт "uk"; вказана мова — обрізається (trim), не змінюється інакше', () => {
    expect(normalizeRecord(raw({ language: '' })).language).toBe('uk');
    expect(normalizeRecord(raw({ language: ' en ' })).language).toBe('en');
  });

  it('is_active: порожній рядок чи "true" — isActive true; лише явне "false" — isActive false', () => {
    expect(normalizeRecord(raw({ is_active: '' })).isActive).toBe(true);
    expect(normalizeRecord(raw({ is_active: 'true' })).isActive).toBe(true);
    expect(normalizeRecord(raw({ is_active: 'false' })).isActive).toBe(false);
  });
});

describe('normalizeRecord — coverSourceUrl (ТЗ §16-17, §23: лише провенанс)', () => {
  it('cover_url із CSV потрапляє в coverSourceUrl, обрізаний (trim)', () => {
    expect(normalizeRecord(raw({ cover_url: ' https://example.com/cover.jpg ' })).coverSourceUrl).toBe('https://example.com/cover.jpg');
  });

  it('порожній cover_url — coverSourceUrl null', () => {
    expect(normalizeRecord(raw({ cover_url: '' })).coverSourceUrl).toBeNull();
  });

  it('результат не має жодного поля "coverUrl" (без "Source") — джерело ніколи не маскується під фінальний URL', () => {
    const n = normalizeRecord(raw({ cover_url: 'https://example.com/cover.jpg' }));
    expect(n).not.toHaveProperty('coverUrl');
    expect(Object.keys(n)).toContain('coverSourceUrl');
  });
});

describe('normalizeRecord — id незмінний', () => {
  it('id передається як є, без trim/зміни регістру (валідація вже гарантувала формат)', () => {
    expect(normalizeRecord(raw({ id: 'kobzar-1840' })).id).toBe('kobzar-1840');
  });
});
