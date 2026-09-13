import { selectPrimaryBookForDay, computeDayIntensity, sumMinutesForDay } from './calendarIntensity';

describe('selectPrimaryBookForDay', () => {
  it('без сесій — null', () => {
    expect(selectPrimaryBookForDay([])).toBeNull();
  });

  it('одна книга — вона й перемагає', () => {
    expect(
      selectPrimaryBookForDay([{ userBookId: 'book-1', durationSeconds: 600, startedAt: '2026-01-01T10:00:00.000Z' }]),
    ).toBe('book-1');
  });

  it('перемагає книга з більшою сумою хвилин за день, а не з довшою окремою сесією', () => {
    // book-1: дві сесії по 20хв = 40хв. book-2: одна сесія 35хв. book-1 перемагає сумою.
    const sessions = [
      { userBookId: 'book-1', durationSeconds: 1200, startedAt: '2026-01-01T09:00:00.000Z' },
      { userBookId: 'book-2', durationSeconds: 2100, startedAt: '2026-01-01T10:00:00.000Z' },
      { userBookId: 'book-1', durationSeconds: 1200, startedAt: '2026-01-01T20:00:00.000Z' },
    ];
    expect(selectPrimaryBookForDay(sessions)).toBe('book-1');
  });

  it('рівність сум хвилин — перемагає книга з РАНІШЕ розпочатою сесією того дня', () => {
    const sessions = [
      { userBookId: 'book-2', durationSeconds: 600, startedAt: '2026-01-01T12:00:00.000Z' },
      { userBookId: 'book-1', durationSeconds: 600, startedAt: '2026-01-01T08:00:00.000Z' },
    ];
    expect(selectPrimaryBookForDay(sessions)).toBe('book-1');
  });

  it('null durationSeconds трактується як 0 хвилин, не ламає підрахунок', () => {
    const sessions = [
      { userBookId: 'book-1', durationSeconds: null, startedAt: '2026-01-01T08:00:00.000Z' },
      { userBookId: 'book-2', durationSeconds: 60, startedAt: '2026-01-01T09:00:00.000Z' },
    ];
    expect(selectPrimaryBookForDay(sessions)).toBe('book-2');
  });
});

describe('computeDayIntensity', () => {
  it('0 хвилин — рівень 0', () => {
    expect(computeDayIntensity(0)).toBe(0);
  });

  it('від\'ємне значення (захисно) — рівень 0', () => {
    expect(computeDayIntensity(-5)).toBe(0);
  });

  it('до 30 хвилин включно — рівень 1', () => {
    expect(computeDayIntensity(1)).toBe(1);
    expect(computeDayIntensity(30)).toBe(1);
  });

  it('від 31 до 90 хвилин включно — рівень 2', () => {
    expect(computeDayIntensity(31)).toBe(2);
    expect(computeDayIntensity(90)).toBe(2);
  });

  it('понад 90 хвилин — рівень 3', () => {
    expect(computeDayIntensity(91)).toBe(3);
    expect(computeDayIntensity(500)).toBe(3);
  });
});

describe('sumMinutesForDay', () => {
  it('той самий вираз, що й sumSessionMinutes (тонка обгортка)', () => {
    expect(sumMinutesForDay([{ durationSeconds: 90 }, { durationSeconds: 30 }])).toBe(3);
    expect(sumMinutesForDay([])).toBe(0);
  });
});
