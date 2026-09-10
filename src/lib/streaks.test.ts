import { computeStreaks } from './streaks';

describe('computeStreaks', () => {
  it('порожня множина — нуль і нуль', () => {
    expect(computeStreaks([], '2026-09-07')).toEqual({ current: 0, longest: 0 });
  });

  it('лише сьогодні — current і longest 1', () => {
    expect(computeStreaks(['2026-09-07'], '2026-09-07')).toEqual({ current: 1, longest: 1 });
  });

  it('3 дні поспіль, що закінчуються сьогодні', () => {
    const days = ['2026-09-05', '2026-09-06', '2026-09-07'];
    expect(computeStreaks(days, '2026-09-07')).toEqual({ current: 3, longest: 3 });
  });

  it('серія закінчилась учора (сьогодні ще не читали) — current рахує від учора', () => {
    const days = ['2026-09-04', '2026-09-05', '2026-09-06'];
    expect(computeStreaks(days, '2026-09-07')).toEqual({ current: 3, longest: 3 });
  });

  it('перерва більше доби тому — current 0, longest лишається з минулого', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03'];
    expect(computeStreaks(days, '2026-09-07')).toEqual({ current: 0, longest: 3 });
  });

  it('дві окремі серії — longest бере довшу, current — лише хвіст, що торкається сьогодні/вчора', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-06', '2026-09-07'];
    expect(computeStreaks(days, '2026-09-07')).toEqual({ current: 2, longest: 4 });
  });

  it('дублікати ключів не ламають підрахунок', () => {
    const days = ['2026-09-07', '2026-09-07', '2026-09-06'];
    expect(computeStreaks(days, '2026-09-07')).toEqual({ current: 2, longest: 2 });
  });

  it('несортований вхід обробляється так само (сортуємо всередині)', () => {
    const days = ['2026-09-07', '2026-09-05', '2026-09-06'];
    expect(computeStreaks(days, '2026-09-07')).toEqual({ current: 3, longest: 3 });
  });
});
