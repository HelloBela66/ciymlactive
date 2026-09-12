import {
  findOldestWaitingBook,
  formatBookCountSentence,
  formatOldestWaitingSentence,
  formatDaysWaitingSentence,
  type TbrWaitingBook,
} from './tbrPersonality';

const NOW = new Date('2026-09-12T12:00:00.000Z');

function book(overrides: Partial<TbrWaitingBook> = {}): TbrWaitingBook {
  return {
    userBookId: 'ub-1',
    workId: 'work-1',
    title: 'Тестова книга',
    addedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('findOldestWaitingBook', () => {
  it('null на порожньому списку', () => {
    expect(findOldestWaitingBook([], NOW)).toBeNull();
  });

  it('обирає книгу з найранішим addedAt, а не першу за порядком у масиві', () => {
    const books = [
      book({ userBookId: 'newer', addedAt: '2026-09-10T00:00:00.000Z' }),
      book({ userBookId: 'oldest', addedAt: '2026-01-01T00:00:00.000Z' }),
      book({ userBookId: 'middle', addedAt: '2026-06-01T00:00:00.000Z' }),
    ];
    expect(findOldestWaitingBook(books, NOW)?.userBookId).toBe('oldest');
  });

  it('рахує кількість днів очікування від NOW', () => {
    const insight = findOldestWaitingBook([book({ addedAt: '2026-09-01T00:00:00.000Z' })], NOW);
    expect(insight?.daysWaiting).toBe(11);
  });

  it('0, коли книгу додано сьогодні (не негативне число)', () => {
    const insight = findOldestWaitingBook([book({ addedAt: '2026-09-12T08:00:00.000Z' })], NOW);
    expect(insight?.daysWaiting).toBe(0);
  });

  it('передає title/workId/userBookId обраної книги без змін', () => {
    const insight = findOldestWaitingBook(
      [book({ userBookId: 'ub-42', workId: 'work-42', title: 'Мандрівка на край ночі' })],
      NOW,
    );
    expect(insight).toEqual({ userBookId: 'ub-42', workId: 'work-42', title: 'Мандрівка на край ночі', daysWaiting: 11 });
  });
});

describe('formatBookCountSentence', () => {
  it('однина дієслова лише для рівно 1', () => {
    expect(formatBookCountSentence(1)).toBe('1 книга чекає на тебе.');
  });

  it('множина для 0 і 2+', () => {
    expect(formatBookCountSentence(0)).toBe('0 книг чекають на тебе.');
    expect(formatBookCountSentence(2)).toBe('2 книги чекають на тебе.');
    expect(formatBookCountSentence(41)).toBe('41 книга чекає на тебе.');
  });
});

describe('formatOldestWaitingSentence', () => {
  it('обгортає назву в лапки', () => {
    expect(formatOldestWaitingSentence('Дюна')).toBe('Найдовше чекає: «Дюна».');
  });
});

describe('formatDaysWaitingSentence', () => {
  it('окрема фраза для 0 днів', () => {
    expect(formatDaysWaitingSentence(0)).toBe('Додано сьогодні.');
  });

  it('число + правильна форма слова "день"', () => {
    expect(formatDaysWaitingSentence(1)).toBe('Додано 1 день тому.');
    expect(formatDaysWaitingSentence(3)).toBe('Додано 3 дні тому.');
    expect(formatDaysWaitingSentence(427)).toBe('Додано 427 днів тому.');
  });
});
