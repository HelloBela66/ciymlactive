import {
  buildReadingLife,
  findReadingLifeMonth,
  findReadingLifeYear,
  formatReadingMonthKey,
  parseReadingMonthKey,
  type ReadingLifeInput,
} from './readingLife';
import type { PeriodFinishedRunInput, PeriodSessionInput } from './readingPeriodSummary';

/**
 * POLYTSIA V1.7, Phase 4 — тести Reading Life (`src/lib/readingLife.ts`).
 *
 * Той самий принцип побудови, що й у `readingCalendar.test.ts`: дати створюються з ЛОКАЛЬНИХ
 * компонентів (`new Date(2026, 5, 1, 0, 30)`) і переводяться в instant через `.toISOString()`.
 * Так тест перевіряє ІНВАРІАНТ, істинний у будь-якому поясі, а не збіг рядків при `TZ=UTC` (CI
 * працює в UTC, тож перевірка на сирих UTC-літералах тут виродилась би в тривіальність і
 * пропустила б саме ту misattribution, яку Phase 1 усунула). Ці ж suite'и додатково ганяються
 * під `TZ=Europe/Kyiv` (`npm run test:tz`, окремий крок CI).
 */

function localIso(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
): string {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

function session(
  startedAtIso: string,
  { minutes = 30, pages = 10 }: { minutes?: number; pages?: number } = {},
): PeriodSessionInput {
  return {
    startedAt: startedAtIso,
    durationSeconds: minutes * 60,
    startPage: 0,
    endPage: pages,
  };
}

function finishedRun(
  finishedAtIso: string | null,
  {
    id = `run-${finishedAtIso ?? 'open'}`,
    userBookId = 'ub-1',
    workId = 'work-1',
    runNumber = 1,
    status = 'finished',
  }: Partial<PeriodFinishedRunInput> = {},
): PeriodFinishedRunInput {
  return { id, userBookId, workId, runNumber, status, finishedAt: finishedAtIso };
}

const EMPTY_INPUT: ReadingLifeInput = { sessions: [], finishedRuns: [] };

describe('formatReadingMonthKey / parseReadingMonthKey', () => {
  it('складає ключ із двоцифровим місяцем', () => {
    expect(formatReadingMonthKey(2026, 6)).toBe('2026-06');
    expect(formatReadingMonthKey(2026, 12)).toBe('2026-12');
  });

  it('розбирає власний ключ назад без втрат', () => {
    expect(parseReadingMonthKey(formatReadingMonthKey(2026, 6))).toEqual({ year: 2026, month: 6 });
  });

  it('повертає null на сміття з маршруту, а не кидає виняток', () => {
    expect(parseReadingMonthKey('')).toBeNull();
    expect(parseReadingMonthKey('2026')).toBeNull();
    expect(parseReadingMonthKey('2026-6')).toBeNull();
    expect(parseReadingMonthKey('2026-13')).toBeNull();
    expect(parseReadingMonthKey('2026-00')).toBeNull();
    expect(parseReadingMonthKey('abcd-ef')).toBeNull();
  });
});

describe('buildReadingLife — групування', () => {
  it('порожній вхід дає порожню історію, а не рік із нулями', () => {
    expect(buildReadingLife(EMPTY_INPUT).years).toEqual([]);
  });

  it('роки — найновіший перший, місяці всередині року — теж', () => {
    const life = buildReadingLife({
      sessions: [
        session(localIso(2025, 3, 10)),
        session(localIso(2026, 1, 5)),
        session(localIso(2026, 11, 20)),
      ],
      finishedRuns: [],
    });

    expect(life.years.map((y) => y.year)).toEqual([2026, 2025]);
    expect(life.years[0]?.months.map((m) => m.monthKey)).toEqual(['2026-11', '2026-01']);
  });

  it('місяці без активності не створюються (немає порожніх дірок між подіями)', () => {
    const life = buildReadingLife({
      sessions: [session(localIso(2026, 1, 5)), session(localIso(2026, 12, 5))],
      finishedRuns: [],
    });
    expect(life.years[0]?.months).toHaveLength(2);
  });
});

describe('buildReadingLife — межі періодів (canonical-семантика V1.7)', () => {
  it('нічна сесія 1 червня о 00:30 потрапляє в ЧЕРВЕНЬ, а не в травень', () => {
    const life = buildReadingLife({
      sessions: [session(localIso(2026, 6, 1, 0, 30))],
      finishedRuns: [],
    });
    expect(life.years[0]?.months.map((m) => m.monthKey)).toEqual(['2026-06']);
  });

  it('НОВОРІЧНА НІЧ: сесія 1 січня о 00:30 належить НОВОМУ року', () => {
    const life = buildReadingLife({
      sessions: [session(localIso(2026, 12, 31, 23, 50)), session(localIso(2027, 1, 1, 0, 30))],
      finishedRuns: [],
    });
    expect(life.years.map((y) => y.year)).toEqual([2027, 2026]);
    expect(findReadingLifeYear(life, 2027)?.summary.sessionCount).toBe(1);
    expect(findReadingLifeYear(life, 2026)?.summary.sessionCount).toBe(1);
  });

  it('прочитання відноситься до місяця СВОГО завершення, а не початку читання', () => {
    const life = buildReadingLife({
      sessions: [],
      finishedRuns: [finishedRun(localIso(2026, 3, 2))],
    });
    expect(life.years[0]?.months.map((m) => m.monthKey)).toEqual(['2026-03']);
  });

  it('прочитання, яке ще триває (finishedAt = null), не належить жодному місяцю', () => {
    const life = buildReadingLife({ sessions: [], finishedRuns: [finishedRun(null)] });
    expect(life.years).toEqual([]);
  });
});

describe('buildReadingLife — рік і місяці не можуть розійтись', () => {
  const input: ReadingLifeInput = {
    sessions: [
      session(localIso(2026, 3, 1), { minutes: 20, pages: 5 }),
      session(localIso(2026, 3, 1, 20, 0), { minutes: 40, pages: 15 }),
      session(localIso(2026, 3, 18), { minutes: 30, pages: 10 }),
      session(localIso(2026, 7, 4), { minutes: 60, pages: 25 }),
    ],
    finishedRuns: [
      finishedRun(localIso(2026, 3, 20), { id: 'r1', userBookId: 'ub-a', workId: 'work-a' }),
      finishedRun(localIso(2026, 7, 9), {
        id: 'r2',
        userBookId: 'ub-a',
        workId: 'work-a',
        runNumber: 2,
      }),
      finishedRun(localIso(2026, 7, 28), { id: 'r3', userBookId: 'ub-b', workId: 'work-b' }),
    ],
    journalInstants: [localIso(2026, 3, 2), localIso(2026, 3, 3), localIso(2026, 7, 5)],
  };

  const life = buildReadingLife(input);
  const year = findReadingLifeYear(life, 2026);

  it('адитивні метрики року дорівнюють сумі місячних (жодного подвійного рахунку)', () => {
    const months = year?.months ?? [];
    const sum = (pick: (m: (typeof months)[number]) => number) =>
      months.reduce((total, month) => total + pick(month), 0);

    expect(year?.summary.readingMinutes).toBe(sum((m) => m.summary.readingMinutes));
    expect(year?.summary.pagesRead).toBe(sum((m) => m.summary.pagesRead));
    expect(year?.summary.sessionCount).toBe(sum((m) => m.summary.sessionCount));
    expect(year?.summary.activeDays).toBe(sum((m) => m.summary.activeDays));
    expect(year?.summary.finishedRunCount).toBe(sum((m) => m.summary.finishedRunCount));
    expect(year?.summary.journalCount).toBe(sum((m) => m.summary.journalCount ?? 0));
  });

  it('дві сесії одного дня дають ОДИН активний день, а не два', () => {
    expect(findReadingLifeMonth(life, '2026-03')?.summary.activeDays).toBe(2);
  });

  it('унікальні твори року — НЕ сума місячних: та сама книга, перечитана пізніше, рахується раз', () => {
    expect(findReadingLifeMonth(life, '2026-03')?.summary.uniqueFinishedWorkIds).toEqual(['work-a']);
    expect(findReadingLifeMonth(life, '2026-07')?.summary.uniqueFinishedWorkIds).toEqual([
      'work-a',
      'work-b',
    ]);
    // Сума місячних дала б 3; правильна відповідь за рік — 2 унікальні твори.
    expect(year?.summary.uniqueFinishedWorkIds.sort()).toEqual(['work-a', 'work-b']);
    expect(year?.summary.finishedRunCount).toBe(3);
  });

  it('перечитування рахується окремо від першого прочитання (ТЗ §25)', () => {
    expect(year?.summary.firstTimeFinishCount).toBe(2);
    expect(year?.summary.rereadFinishCount).toBe(1);
  });
});

describe('buildReadingLife — журнал', () => {
  it('без `journalInstants` лічильник лишається null («не рахувалось»), а не 0', () => {
    const life = buildReadingLife({ sessions: [session(localIso(2026, 3, 1))], finishedRuns: [] });
    expect(findReadingLifeMonth(life, '2026-03')?.summary.journalCount).toBeNull();
    expect(findReadingLifeYear(life, 2026)?.summary.journalCount).toBeNull();
  });

  it('із `journalInstants` місяць без записів має 0, а не null', () => {
    const life = buildReadingLife({
      sessions: [session(localIso(2026, 3, 1)), session(localIso(2026, 4, 1))],
      finishedRuns: [],
      journalInstants: [localIso(2026, 3, 2)],
    });
    expect(findReadingLifeMonth(life, '2026-03')?.summary.journalCount).toBe(1);
    expect(findReadingLifeMonth(life, '2026-04')?.summary.journalCount).toBe(0);
  });

  it('місяць, у якому БУВ лише запис щоденника, усе одно існує в історії', () => {
    const life = buildReadingLife({
      sessions: [],
      finishedRuns: [],
      journalInstants: [localIso(2026, 5, 9)],
    });
    expect(life.years.map((y) => y.year)).toEqual([2026]);
    expect(findReadingLifeMonth(life, '2026-05')?.summary.journalCount).toBe(1);
    expect(findReadingLifeMonth(life, '2026-05')?.summary.sessionCount).toBe(0);
  });
});

describe('findReadingLifeYear / findReadingLifeMonth', () => {
  const life = buildReadingLife({
    sessions: [session(localIso(2026, 3, 1))],
    finishedRuns: [],
  });

  it('знаходять наявні період', () => {
    expect(findReadingLifeYear(life, 2026)?.year).toBe(2026);
    expect(findReadingLifeMonth(life, '2026-03')?.month).toBe(3);
  });

  it('повертають null для року/місяця без активності й для зіпсованого ключа', () => {
    expect(findReadingLifeYear(life, 2001)).toBeNull();
    expect(findReadingLifeMonth(life, '2026-04')).toBeNull();
    expect(findReadingLifeMonth(life, 'не-ключ')).toBeNull();
  });
});
