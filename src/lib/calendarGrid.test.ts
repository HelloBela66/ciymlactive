import { buildMonthGrid } from './calendarGrid';

describe('buildMonthGrid', () => {
  it('починає тиждень з понеділка і повністю покриває місяць', () => {
    // Вересень 2026: 1 вересня 2026 — вівторок.
    const anchor = new Date(2026, 8, 15);
    const grid = buildMonthGrid(anchor, 1, new Date(2026, 8, 15));

    expect(grid[0]?.date.getDay()).toBe(1); // перший день сітки — понеділок
    expect(grid.length % 7).toBe(0);

    const daysInCurrentMonth = grid.filter((d) => d.inCurrentMonth);
    expect(daysInCurrentMonth).toHaveLength(30); // у вересні 30 днів
  });

  it('позначає сьогодні рівно один день', () => {
    const today = new Date(2026, 8, 6);
    const grid = buildMonthGrid(today, 1, today);
    const todays = grid.filter((d) => d.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0]?.date.getDate()).toBe(6);
  });
});
