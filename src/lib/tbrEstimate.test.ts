import { estimateTbr } from './tbrEstimate';

describe('estimateTbr', () => {
  it('порожній список — усе 0', () => {
    const result = estimateTbr([], 1);
    expect(result.totalPages).toBe(0);
    expect(result.booksWithoutPageCount).toEqual([]);
    expect(result.estimatedDaysByMinutesPerDay).toEqual({ 15: 0, 30: 0, 60: 0 });
  });

  it('книги без pageCount виключені з суми й повертаються окремо', () => {
    const books = [
      { id: '1', title: 'Книга A', pageCount: 300 },
      { id: '2', title: 'Книга B', pageCount: null },
      { id: '3', title: 'Книга C', pageCount: 0 },
    ];
    const result = estimateTbr(books, 1);
    expect(result.totalPages).toBe(300);
    expect(result.booksWithoutPageCount.map((b) => b.id)).toEqual(['2', '3']);
  });

  it('рахує дні для 15/30/60 хв на день коректно (600 сторінок, 1 стор/хв = 600 хв)', () => {
    const books = [{ id: '1', title: 'Книга A', pageCount: 600 }];
    const result = estimateTbr(books, 1);
    expect(result.estimatedDaysByMinutesPerDay[15]).toBe(40);
    expect(result.estimatedDaysByMinutesPerDay[30]).toBe(20);
    expect(result.estimatedDaysByMinutesPerDay[60]).toBe(10);
  });

  it('округлює вгору (не занижує оцінку)', () => {
    const books = [{ id: '1', title: 'Книга A', pageCount: 100 }];
    const result = estimateTbr(books, 1); // 100 хв
    expect(result.estimatedDaysByMinutesPerDay[60]).toBe(2); // 100/60 = 1.67 -> 2
  });
});
