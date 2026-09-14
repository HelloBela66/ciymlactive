'use strict';

const { validateRecord, splitList } = require('./validate');

/** Хелпер — заповнює всі 12 полів формату (порожніми рядками за замовчуванням), щоб кожен
 * тест-кейс писав лише те, що реально перевіряє (той самий підхід, що house-хелпери
 * `calendarIntensity.test.ts`'s `s(...)` тощо). */
function record(overrides) {
  return {
    id: 'valid-id-1',
    title: 'Валідна назва',
    authors: 'Автор Імʼярек',
    isbn13: '',
    isbn10: '',
    page_count: '',
    cover_url: '',
    description: '',
    genres: 'Фентезі',
    purposes: '',
    language: '',
    is_active: '',
    ...overrides,
  };
}

describe('validateRecord — id', () => {
  it('порожній id — MISSING_ID', () => {
    const { errors } = validateRecord(record({ id: '' }));
    expect(errors).toEqual([{ code: 'MISSING_ID', field: 'id' }]);
  });

  it('id з великими літерами чи пробілом — INVALID_ID', () => {
    expect(validateRecord(record({ id: 'Bad Id' })).errors).toEqual([{ code: 'INVALID_ID', field: 'id' }]);
  });

  it('id довший за 100 символів — INVALID_ID (реальний край-кейс, знайдений у curated-books.csv)', () => {
    const longId = 'a'.repeat(101);
    expect(validateRecord(record({ id: longId })).errors).toEqual([{ code: 'INVALID_ID', field: 'id' }]);
  });

  it('id рівно 100 символів — валідний (межа включно)', () => {
    const id100 = 'a'.repeat(100);
    expect(validateRecord(record({ id: id100 })).errors).toEqual([]);
  });
});

describe('validateRecord — title', () => {
  it('порожня назва — MISSING_TITLE', () => {
    expect(validateRecord(record({ title: '' })).errors).toContainEqual({ code: 'MISSING_TITLE', field: 'title' });
  });

  it('назва довша за 500 символів — TITLE_TOO_LONG', () => {
    expect(validateRecord(record({ title: 'а'.repeat(501) })).errors).toContainEqual({ code: 'TITLE_TOO_LONG', field: 'title' });
  });

  it('"Книга N" у назві — POTENTIAL_SERIES_METADATA (попередження, не помилка, ТЗ §47)', () => {
    const { errors, warnings } = validateRecord(record({ title: 'Трон зі скла. Книга 1' }));
    expect(errors).toEqual([]);
    expect(warnings).toContainEqual({ code: 'POTENTIAL_SERIES_METADATA', field: 'title' });
  });
});

describe('validateRecord — ISBN (ТЗ §57)', () => {
  it('валідний ISBN-13 — без помилок', () => {
    expect(validateRecord(record({ isbn13: '9786171707610' })).errors).toEqual([]);
  });

  it('невалідна контрольна цифра ISBN-13 — INVALID_ISBN', () => {
    expect(validateRecord(record({ isbn13: '9786171707611' })).errors).toContainEqual({ code: 'INVALID_ISBN', field: 'isbn13' });
  });

  it('ISBN з пробілами/дефісами — приймається (нормалізується перед перевіркою, ТЗ §7)', () => {
    expect(validateRecord(record({ isbn13: '978-617-17-0761-0' })).errors).toEqual([]);
  });

  it('відсутній ISBN — не помилка (обидва поля опціональні)', () => {
    expect(validateRecord(record({ isbn13: '', isbn10: '' })).errors).toEqual([]);
  });

  it('ISBN-13 неправильної довжини (напр. випадково вписаний ISBN-10 у колонку isbn13) — INVALID_ISBN', () => {
    expect(validateRecord(record({ isbn13: '0596520689' })).errors).toContainEqual({ code: 'INVALID_ISBN', field: 'isbn13' });
  });
});

describe('validateRecord — page_count', () => {
  it('валідне додатне ціле — без помилок', () => {
    expect(validateRecord(record({ page_count: '544' })).errors).toEqual([]);
  });

  it('нуль/від\'ємне/нецілі — INVALID_PAGE_COUNT', () => {
    expect(validateRecord(record({ page_count: '0' })).errors).toContainEqual({ code: 'INVALID_PAGE_COUNT', field: 'page_count' });
    expect(validateRecord(record({ page_count: '-5' })).errors).toContainEqual({ code: 'INVALID_PAGE_COUNT', field: 'page_count' });
    expect(validateRecord(record({ page_count: '12.5' })).errors).toContainEqual({ code: 'INVALID_PAGE_COUNT', field: 'page_count' });
    expect(validateRecord(record({ page_count: 'abc' })).errors).toContainEqual({ code: 'INVALID_PAGE_COUNT', field: 'page_count' });
  });
});

describe('validateRecord — cover_url', () => {
  it('валідний http(s) URL — без помилок', () => {
    expect(validateRecord(record({ cover_url: 'https://example.com/cover.jpg' })).errors).toEqual([]);
  });

  it('не-URL значення — INVALID_COVER_URL', () => {
    expect(validateRecord(record({ cover_url: 'не-посилання' })).errors).toContainEqual({ code: 'INVALID_COVER_URL', field: 'cover_url' });
  });

  it('URL довший за 2000 символів — INVALID_COVER_URL', () => {
    const longUrl = `https://example.com/${'a'.repeat(2000)}.jpg`;
    expect(validateRecord(record({ cover_url: longUrl })).errors).toContainEqual({ code: 'INVALID_COVER_URL', field: 'cover_url' });
  });
});

describe('validateRecord — description', () => {
  it('порожній опис — не помилка (опціональне поле)', () => {
    expect(validateRecord(record({ description: '' })).errors).toEqual([]);
  });

  it('опис довший за 5000 символів — DESCRIPTION_TOO_LONG', () => {
    expect(validateRecord(record({ description: 'а'.repeat(5001) })).errors).toContainEqual({ code: 'DESCRIPTION_TOO_LONG', field: 'description' });
  });

  it('підозріло короткий опис — SUSPICIOUS_SHORT_DESCRIPTION (попередження, ТЗ §48)', () => {
    const { warnings } = validateRecord(record({ description: 'Коротко.' }));
    expect(warnings).toContainEqual({ code: 'SUSPICIOUS_SHORT_DESCRIPTION', field: 'description' });
  });
});

describe('validateRecord — genres/purposes (ТЗ §12-13)', () => {
  it('жоден жанр не вказано — NO_GENRES (попередження)', () => {
    expect(validateRecord(record({ genres: '' })).warnings).toContainEqual({ code: 'NO_GENRES', field: 'genres' });
  });

  it('жанр поза GenreRepository.SEED_GENRES — UNKNOWN_GENRE (попередження, не блокує)', () => {
    const { errors, warnings } = validateRecord(record({ genres: 'Вигаданий жанр' }));
    expect(errors).toEqual([]);
    expect(warnings).toContainEqual({ code: 'UNKNOWN_GENRE', field: 'genres' });
  });

  it('genres з кількома валідними значеннями через ; — без попереджень', () => {
    expect(validateRecord(record({ genres: 'Фентезі;Романтика' })).warnings).toEqual([]);
  });

  it('moods/purposes НЕ трактуються як жанри — жанрова валідація на purposes не спрацьовує (ТЗ §13)', () => {
    const { warnings } = validateRecord(record({ genres: 'Фентезі', purposes: 'absorbed;cry' }));
    expect(warnings.filter((w) => w.code === 'UNKNOWN_GENRE')).toEqual([]);
  });

  it('purpose поза light/cry/laugh/absorbed — UNKNOWN_PURPOSE (попередження)', () => {
    expect(validateRecord(record({ purposes: 'sad' })).warnings).toContainEqual({ code: 'UNKNOWN_PURPOSE', field: 'purposes' });
  });
});

describe('validateRecord — language/is_active', () => {
  it('порожня мова — не помилка (нормалізація дає дефолт uk)', () => {
    expect(validateRecord(record({ language: '' })).errors).toEqual([]);
  });

  it('is_active порожній/true/false — не помилка', () => {
    expect(validateRecord(record({ is_active: '' })).errors).toEqual([]);
    expect(validateRecord(record({ is_active: 'true' })).errors).toEqual([]);
    expect(validateRecord(record({ is_active: 'false' })).errors).toEqual([]);
  });

  it('is_active — будь-яке інше значення — INVALID_BOOLEAN', () => {
    expect(validateRecord(record({ is_active: 'yes' })).errors).toContainEqual({ code: 'INVALID_BOOLEAN', field: 'is_active' });
  });
});

describe('validateRecord — некоректний UTF-8', () => {
  it('replacement-символ (U+FFFD) у будь-якому полі — INVALID_UTF8', () => {
    expect(validateRecord(record({ title: 'Зіпсований текст �' })).errors).toContainEqual({ code: 'INVALID_UTF8', field: 'title' });
  });
});

describe('splitList', () => {
  it('розбиває за ";", обрізає пробіли, прибирає порожні й дублікати', () => {
    expect(splitList('Фентезі; Романтика ;;Фентезі')).toEqual(['Фентезі', 'Романтика']);
  });

  it('порожній вхід — порожній список', () => {
    expect(splitList('')).toEqual([]);
  });
});
