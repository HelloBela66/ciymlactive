import { rankTopBooksOfMonth } from './calendarTopBooks';

describe('rankTopBooksOfMonth', () => {
  it('без сесій — порожній список', () => {
    expect(rankTopBooksOfMonth([])).toEqual([]);
  });

  it('одна книга — єдина в топі', () => {
    const ranked = rankTopBooksOfMonth([
      { userBookId: 'ub-1', workId: 'work-1', durationSeconds: 1800 },
    ]);
    expect(ranked).toEqual([{ workId: 'work-1', representativeUserBookId: 'ub-1', totalMinutes: 30 }]);
  });

  it('сортує за спаданням суми хвилин', () => {
    const ranked = rankTopBooksOfMonth([
      { userBookId: 'ub-a', workId: 'work-a', durationSeconds: 600 },
      { userBookId: 'ub-b', workId: 'work-b', durationSeconds: 3600 },
      { userBookId: 'ub-c', workId: 'work-c', durationSeconds: 1800 },
    ]);
    expect(ranked.map((r) => r.workId)).toEqual(['work-b', 'work-c', 'work-a']);
  });

  it('обрізає до limit (за замовчуванням 3)', () => {
    const ranked = rankTopBooksOfMonth([
      { userBookId: 'ub-a', workId: 'work-a', durationSeconds: 100 },
      { userBookId: 'ub-b', workId: 'work-b', durationSeconds: 200 },
      { userBookId: 'ub-c', workId: 'work-c', durationSeconds: 300 },
      { userBookId: 'ub-d', workId: 'work-d', durationSeconds: 400 },
    ]);
    expect(ranked).toHaveLength(3);
    expect(ranked.map((r) => r.workId)).toEqual(['work-d', 'work-c', 'work-b']);
  });

  it('кастомний limit', () => {
    const ranked = rankTopBooksOfMonth(
      [
        { userBookId: 'ub-a', workId: 'work-a', durationSeconds: 100 },
        { userBookId: 'ub-b', workId: 'work-b', durationSeconds: 200 },
      ],
      1,
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.workId).toBe('work-b');
  });

  it('групує ЗА workId, не за userBookId — два userBookId того самого твору (перечитання з новим доданням) підсумовуються в один запис', () => {
    const ranked = rankTopBooksOfMonth([
      { userBookId: 'ub-old', workId: 'work-1', durationSeconds: 600 },
      { userBookId: 'ub-new', workId: 'work-1', durationSeconds: 900 },
    ]);
    expect(ranked).toEqual([{ workId: 'work-1', representativeUserBookId: 'ub-new', totalMinutes: 25 }]);
  });

  it('представник твору — userBookId з найбільшою сумою хвилин серед userBookId цього твору', () => {
    const ranked = rankTopBooksOfMonth([
      { userBookId: 'ub-a', workId: 'work-1', durationSeconds: 300 },
      { userBookId: 'ub-b', workId: 'work-1', durationSeconds: 1200 },
      { userBookId: 'ub-a', workId: 'work-1', durationSeconds: 300 },
    ]);
    // ub-a: 300+300=600 (10хв), ub-b: 1200 (20хв) — ub-b представник.
    expect(ranked[0]?.representativeUserBookId).toBe('ub-b');
  });

  it('null durationSeconds трактується як 0, не ламає підрахунок', () => {
    const ranked = rankTopBooksOfMonth([
      { userBookId: 'ub-1', workId: 'work-1', durationSeconds: null },
      { userBookId: 'ub-2', workId: 'work-2', durationSeconds: 60 },
    ]);
    expect(ranked[0]?.workId).toBe('work-2');
    expect(ranked.find((r) => r.workId === 'work-1')?.totalMinutes).toBe(0);
  });
});
