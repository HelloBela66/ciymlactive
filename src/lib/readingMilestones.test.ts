import {
  FINISHED_BOOK_MILESTONES,
  READING_HOUR_MILESTONES,
  buildReadingMilestones,
  filterMilestonesInRange,
  latestMilestone,
  type MilestoneFinishedRunInput,
  type MilestoneSessionInput,
  type ReadingMilestone,
} from './readingMilestones';
import { formatMilestoneCopy, formatReturnGap } from './readingMilestoneCopy';

/**
 * POLYTSIA V1.7, Phase 8 — тести віх (ТЗ V1.7 §30-§35).
 *
 * Дати будуються з ЛОКАЛЬНИХ компонентів — той самий принцип, що й у решті V1.7: інваріанти
 * мусять бути істинними в будь-якому поясі (`npm run test:tz` ганяє цей suite під
 * `TZ=Europe/Kyiv`).
 */

const NOW = new Date(2030, 0, 1, 12, 0);

function localIso(year: number, month: number, day: number, hour = 12, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

function run(
  overrides: Partial<MilestoneFinishedRunInput> & { runId: string; finishedAt: string | null },
): MilestoneFinishedRunInput {
  return {
    userBookId: `ub-${overrides.workId ?? overrides.runId}`,
    workId: `work-${overrides.runId}`,
    status: 'finished',
    ...overrides,
  };
}

function session(
  sessionId: string,
  startedAt: string,
  minutes: number,
  userBookId = 'ub-1',
): MilestoneSessionInput {
  return { sessionId, userBookId, startedAt, durationSeconds: minutes * 60 };
}

/** N завершених УНІКАЛЬНИХ творів, по одному на день, у детермінованому порядку. */
function uniqueFinishedRuns(count: number, startDay = 1): MilestoneFinishedRunInput[] {
  return Array.from({ length: count }, (_, index) =>
    run({
      runId: `r${String(index + 1).padStart(4, '0')}`,
      workId: `work-${index + 1}`,
      userBookId: `ub-${index + 1}`,
      finishedAt: localIso(2026, 1, 1 + startDay + index),
    }),
  );
}

function build(input: Partial<Parameters<typeof buildReadingMilestones>[0]> = {}): ReadingMilestone[] {
  return buildReadingMilestones({
    finishedRuns: [],
    sessions: [],
    earliestReadingInstant: null,
    now: NOW,
    ...input,
  });
}

function idsOf(milestones: ReadingMilestone[]): string[] {
  return milestones.map((milestone) => milestone.id);
}

describe('порожня історія', () => {
  it('не породжує жодної віхи — і не вигадує дати початку', () => {
    expect(build()).toEqual([]);
  });
});

describe('книжкові віхи — унікальні твори (ТЗ §4-§6, §30)', () => {
  it('перша завершена книга — віха', () => {
    const milestones = build({ finishedRuns: uniqueFinishedRuns(1) });
    expect(idsOf(milestones)).toEqual(['finished_books:1']);
  });

  it('9 книг — ще ні; 10-та — так', () => {
    expect(idsOf(build({ finishedRuns: uniqueFinishedRuns(9) }))).toEqual(['finished_books:1']);
    expect(idsOf(build({ finishedRuns: uniqueFinishedRuns(10) }))).toEqual([
      'finished_books:1',
      'finished_books:10',
    ]);
  });

  it('24 → 25 і 49 → 50', () => {
    expect(idsOf(build({ finishedRuns: uniqueFinishedRuns(24) }))).not.toContain('finished_books:25');
    expect(idsOf(build({ finishedRuns: uniqueFinishedRuns(25) }))).toContain('finished_books:25');
    expect(idsOf(build({ finishedRuns: uniqueFinishedRuns(49) }))).not.toContain('finished_books:50');
    expect(idsOf(build({ finishedRuns: uniqueFinishedRuns(50) }))).toContain('finished_books:50');
  });

  it('50-та віха вказує саме на ту книгу, що стала 50-ю', () => {
    const runs = uniqueFinishedRuns(50);
    const milestone = build({ finishedRuns: runs }).find((m) => m.id === 'finished_books:50');
    expect(milestone?.workId).toBe('work-50');
    expect(milestone?.at).toBe(runs[49]?.finishedAt);
  });

  it('ПЕРЕЧИТУВАННЯ МІЖ 49 І 50 не зсуває порядковий номер (ТЗ §5)', () => {
    const runs = uniqueFinishedRuns(49);
    // Перечитування вже зарахованого твору — між 49-м і наступним новим.
    runs.push(run({ runId: 'r-reread', workId: 'work-1', userBookId: 'ub-1', finishedAt: localIso(2026, 3, 1) }));
    runs.push(run({ runId: 'r-new', workId: 'work-new', userBookId: 'ub-new', finishedAt: localIso(2026, 3, 2) }));

    const milestone = build({ finishedRuns: runs }).find((m) => m.id === 'finished_books:50');
    expect(milestone).toBeDefined();
    // 50-ю стала НОВА книга, а не перечитана.
    expect(milestone?.workId).toBe('work-new');
  });

  it('різні видання того самого твору — одна книга (ТЗ §30)', () => {
    const runs = [
      run({ runId: 'r1', workId: 'work-a', userBookId: 'ub-paperback', finishedAt: localIso(2026, 1, 5) }),
      run({ runId: 'r2', workId: 'work-a', userBookId: 'ub-ebook', finishedAt: localIso(2026, 2, 5) }),
    ];
    const books = build({ finishedRuns: runs }).filter((m) => m.kind === 'finished_books');
    expect(books).toHaveLength(1);
  });

  it('DNF не рахується як завершена книга (ТЗ §20)', () => {
    const runs = [
      run({ runId: 'r1', workId: 'work-a', finishedAt: localIso(2026, 1, 5), status: 'did_not_finish' }),
      run({ runId: 'r2', workId: 'work-b', finishedAt: localIso(2026, 1, 6) }),
    ];
    const milestones = build({ finishedRuns: runs }).filter((m) => m.kind === 'finished_books');
    expect(milestones).toHaveLength(1);
    expect(milestones[0]?.workId).toBe('work-b');
  });

  it('прохід без `workId` (пошкоджені дані) не рахується й не зсуває нумерацію', () => {
    const runs = [
      run({ runId: 'r1', workId: null, finishedAt: localIso(2026, 1, 5) }),
      run({ runId: 'r2', workId: 'work-b', finishedAt: localIso(2026, 1, 6) }),
    ];
    const first = build({ finishedRuns: runs }).find((m) => m.id === 'finished_books:1');
    expect(first?.workId).toBe('work-b');
  });

  it('після 100 віхи стають рідшими — жодної на 110, 120, 150', () => {
    for (const value of [110, 120, 150, 200]) {
      expect(FINISHED_BOOK_MILESTONES).not.toContain(value);
    }
  });
});

describe('детермінізм порядку (ТЗ §6, §34)', () => {
  it('два завершення з ОДНАКОВИМ timestamp розводяться стабільним tie-break', () => {
    const sameInstant = localIso(2026, 5, 5);
    const runs = [
      run({ runId: 'r-b', workId: 'work-b', finishedAt: sameInstant }),
      run({ runId: 'r-a', workId: 'work-a', finishedAt: sameInstant }),
    ];
    const first = build({ finishedRuns: runs }).find((m) => m.id === 'finished_books:1');
    // `runId` — persisted UUID, тож порядок однаковий на будь-якому пристрої й після restore.
    expect(first?.workId).toBe('work-a');

    // Той самий набір у ЗВОРОТНОМУ порядку рядків дає той самий результат.
    const reversed = build({ finishedRuns: [...runs].reverse() }).find((m) => m.id === 'finished_books:1');
    expect(reversed?.workId).toBe('work-a');
  });

  it('та сама історія двічі дає побайтово той самий результат (ідемпотентність, ТЗ §18)', () => {
    const input = {
      finishedRuns: uniqueFinishedRuns(12),
      sessions: [session('s1', localIso(2026, 1, 2), 60 * 120)],
      earliestReadingInstant: localIso(2025, 1, 1),
    };
    expect(JSON.stringify(build(input))).toBe(JSON.stringify(build(input)));
  });

  it('віхи повертаються хронологічно, найстаріша перша', () => {
    const milestones = build({
      finishedRuns: uniqueFinishedRuns(10),
      earliestReadingInstant: localIso(2026, 1, 1),
    });
    const dates = milestones.map((m) => m.at);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe('часові віхи (ТЗ §9, §10, §31)', () => {
  it('99 год 59 хв — ще ні; перетин 100 годин — так', () => {
    const almost = build({ sessions: [session('s1', localIso(2026, 1, 1), 99 * 60 + 59)] });
    expect(idsOf(almost)).toEqual([]);

    const crossed = build({
      sessions: [
        session('s1', localIso(2026, 1, 1), 99 * 60 + 59),
        session('s2', localIso(2026, 1, 2), 1, 'ub-crossing'),
      ],
    });
    expect(idsOf(crossed)).toEqual(['reading_hours:100']);
  });

  it('віха фіксує САМЕ ту сесію й книгу, на якій поріг перетнуто (ТЗ §10)', () => {
    const milestones = build({
      sessions: [
        session('s1', localIso(2026, 1, 1), 99 * 60, 'ub-earlier'),
        session('s2', localIso(2026, 6, 1), 120, 'ub-crossing'),
      ],
    });
    expect(milestones[0]?.userBookId).toBe('ub-crossing');
    expect(milestones[0]?.at).toBe(localIso(2026, 6, 1));
  });

  it('одна дуже довга сесія може перетнути кілька порогів одразу', () => {
    const milestones = build({ sessions: [session('s1', localIso(2026, 1, 1), 600 * 60)] });
    expect(idsOf(milestones)).toEqual(['reading_hours:100', 'reading_hours:250', 'reading_hours:500']);
  });

  it('сесії без записаної тривалості не ламають підрахунок', () => {
    const milestones = build({
      sessions: [
        { sessionId: 's0', userBookId: 'ub-1', startedAt: localIso(2026, 1, 1), durationSeconds: null },
        session('s1', localIso(2026, 1, 2), 100 * 60),
      ],
    });
    expect(idsOf(milestones)).toEqual(['reading_hours:100']);
  });

  it('порядок рядків сесій не впливає на результат', () => {
    const sessions = [
      session('s2', localIso(2026, 6, 1), 120, 'ub-crossing'),
      session('s1', localIso(2026, 1, 1), 99 * 60, 'ub-earlier'),
    ];
    expect(build({ sessions })[0]?.userBookId).toBe('ub-crossing');
  });

  it('пороги рідкісні — жодного на 150 чи 200 годин', () => {
    for (const value of [50, 150, 200, 300]) {
      expect(READING_HOUR_MILESTONES).not.toContain(value);
    }
  });
});

describe('перше перечитування (ТЗ §7, §32)', () => {
  it('одне завершене прочитання — віхи немає', () => {
    expect(idsOf(build({ finishedRuns: uniqueFinishedRuns(1) }))).not.toContain('first_reread');
  });

  it('друге ЗАВЕРШЕНЕ прочитання того самого твору — віха', () => {
    const runs = [
      run({ runId: 'r1', workId: 'work-a', finishedAt: localIso(2026, 1, 5) }),
      run({ runId: 'r2', workId: 'work-a', finishedAt: localIso(2027, 1, 5) }),
    ];
    const milestone = build({ finishedRuns: runs }).find((m) => m.kind === 'first_reread');
    expect(milestone?.at).toBe(localIso(2027, 1, 5));
    expect(milestone?.workId).toBe('work-a');
  });

  it('DNF, а потім завершення — це НЕ перечитування (ТЗ §32)', () => {
    const runs = [
      run({ runId: 'r1', workId: 'work-a', finishedAt: localIso(2026, 1, 5), status: 'did_not_finish' }),
      run({ runId: 'r2', workId: 'work-a', finishedAt: localIso(2026, 3, 5) }),
    ];
    expect(idsOf(build({ finishedRuns: runs }))).not.toContain('first_reread');
  });

  it('три перечитування — усе одно РІВНО одна глобальна віха', () => {
    const runs = [
      run({ runId: 'r1', workId: 'work-a', finishedAt: localIso(2026, 1, 5) }),
      run({ runId: 'r2', workId: 'work-a', finishedAt: localIso(2026, 6, 5) }),
      run({ runId: 'r3', workId: 'work-a', finishedAt: localIso(2027, 1, 5) }),
      run({ runId: 'r4', workId: 'work-b', finishedAt: localIso(2027, 2, 5) }),
      run({ runId: 'r5', workId: 'work-b', finishedAt: localIso(2027, 6, 5) }),
    ];
    expect(idsOf(build({ finishedRuns: runs })).filter((id) => id === 'first_reread')).toHaveLength(1);
  });

  it('віха вказує на ПЕРШЕ за часом повернення, а не на останнє', () => {
    const runs = [
      run({ runId: 'r1', workId: 'work-a', finishedAt: localIso(2026, 1, 5) }),
      run({ runId: 'r2', workId: 'work-b', finishedAt: localIso(2026, 2, 5) }),
      run({ runId: 'r3', workId: 'work-b', finishedAt: localIso(2026, 8, 5) }),
      run({ runId: 'r4', workId: 'work-a', finishedAt: localIso(2027, 1, 5) }),
    ];
    expect(build({ finishedRuns: runs }).find((m) => m.kind === 'first_reread')?.workId).toBe('work-b');
  });
});

describe('ювілей читацької історії (ТЗ §11-§12, §33)', () => {
  it('без історії ювілеїв немає — дата не вигадується', () => {
    expect(idsOf(build({ earliestReadingInstant: null }))).toEqual([]);
  });

  it("рік від першої події — одна віха; п'ять років — п'ять", () => {
    const oneYear = build({ earliestReadingInstant: localIso(2029, 1, 1), now: new Date(2030, 0, 2) });
    expect(idsOf(oneYear)).toEqual(['reading_life_anniversary:1']);

    const fiveYears = build({ earliestReadingInstant: localIso(2025, 1, 1), now: new Date(2030, 0, 2) });
    expect(idsOf(fiveYears)).toEqual([
      'reading_life_anniversary:1',
      'reading_life_anniversary:2',
      'reading_life_anniversary:3',
      'reading_life_anniversary:4',
      'reading_life_anniversary:5',
    ]);
  });

  it('ювілей, який ще не настав, не показується', () => {
    const milestones = build({
      earliestReadingInstant: localIso(2029, 6, 1),
      now: new Date(2030, 0, 1),
    });
    expect(idsOf(milestones)).toEqual([]);
  });

  it('ВИСОКОСНИЙ РІК: 29 лютого дає детерміновану дату ювілею', () => {
    const milestones = build({
      earliestReadingInstant: localIso(2028, 2, 29),
      now: new Date(2030, 0, 1),
    });
    expect(idsOf(milestones)).toEqual(['reading_life_anniversary:1']);
    const at = new Date(milestones[0]?.at as string);
    expect(at.getMonth()).toBe(1);
    expect(at.getDate()).toBe(28);
  });

  it('ЮВІЛЕЙ ≠ STREAK: місяць без читання його не скасовує (ТЗ §12)', () => {
    // Жодної сесії взагалі — сам факт існування історії лишається фактом.
    const milestones = build({
      earliestReadingInstant: localIso(2025, 1, 1),
      sessions: [],
      now: new Date(2030, 0, 2),
    });
    expect(idsOf(milestones)).toContain('reading_life_anniversary:5');
  });
});

describe('вибірка для поверхонь (ТЗ §21-§22)', () => {
  const milestones = build({
    finishedRuns: uniqueFinishedRuns(10),
    earliestReadingInstant: localIso(2026, 1, 1),
  });

  it('фільтр за періодом бере лише те, що сталось усередині', () => {
    const inJanuary = filterMilestonesInRange(milestones, {
      startIso: localIso(2026, 1, 1, 0, 0),
      endIso: localIso(2026, 2, 1, 0, 0),
    });
    expect(inJanuary.length).toBeGreaterThan(0);
    for (const milestone of inJanuary) {
      expect(milestone.at >= localIso(2026, 1, 1, 0, 0)).toBe(true);
      expect(milestone.at < localIso(2026, 2, 1, 0, 0)).toBe(true);
    }
  });

  it('найновіша віха — остання хронологічно', () => {
    expect(latestMilestone(milestones)?.at).toBe(milestones[milestones.length - 1]?.at);
    expect(latestMilestone([])).toBeNull();
  });
});

describe('копірайт (ТЗ §15, §16, §38)', () => {
  const finished50: ReadingMilestone = {
    id: 'finished_books:50',
    kind: 'finished_books',
    at: localIso(2027, 8, 14),
    value: 50,
    userBookId: 'ub-50',
    workId: 'work-50',
  };

  it('констатує факт, без вигуків і наказів', () => {
    const copy = formatMilestoneCopy(finished50, 'Тигролови');
    expect(copy.title).toBe('50-та завершена книга');
    expect(copy.description).toBe('Це 50-та книга у твоїй читацькій історії — «Тигролови».');
    expect(`${copy.title} ${copy.description}`).not.toMatch(
      /Неймовірно|чемпіон|Так тримати|Не зупиняйся|Наступна ціль|вітаємо|!/i,
    );
  });

  it('НІКОЛИ не показує наступну ціль (ТЗ §16)', () => {
    for (const milestone of build({ finishedRuns: uniqueFinishedRuns(50) })) {
      const copy = formatMilestoneCopy(milestone, 'Книга');
      const text = `${copy.title} ${copy.description ?? ''}`;
      expect(text).not.toMatch(/\d+\s*\/\s*\d+/); // «50 / 100»
      expect(text).not.toMatch(/залишилося|до наступної|наступн/i);
    }
  });

  it('без назви книги текст лишається цілим, а не «undefined»', () => {
    const copy = formatMilestoneCopy(finished50, null);
    expect(copy.description).toBe('Це 50-та книга у твоїй читацькій історії.');
    expect(JSON.stringify(copy)).not.toContain('undefined');
  });

  it('години плюралізуються українською', () => {
    const copy = formatMilestoneCopy(
      { id: 'reading_hours:100', kind: 'reading_hours', at: localIso(2027, 1, 1), value: 100, userBookId: 'ub-1', workId: null },
      'Тигролови',
    );
    expect(copy.title).toBe('100 годин із книгами');
    expect(copy.description).toBe('Цю позначку ти перетнув під час читання «Тигролови».');
  });

  it('ювілей: «Рік» в однині, «5 років» у множині', () => {
    const one = formatMilestoneCopy(
      { id: 'reading_life_anniversary:1', kind: 'reading_life_anniversary', at: localIso(2027, 1, 1), value: 1, userBookId: null, workId: null },
      null,
    );
    const five = formatMilestoneCopy(
      { id: 'reading_life_anniversary:5', kind: 'reading_life_anniversary', at: localIso(2031, 1, 1), value: 5, userBookId: null, workId: null },
      null,
    );
    expect(one.title).toBe('Рік твоєї читацької історії');
    expect(five.title).toBe('5 років твоєї читацької історії');
  });

  it('перше прочитання й перше перечитування мають різні тексти', () => {
    const first = formatMilestoneCopy(
      { id: 'finished_books:1', kind: 'finished_books', at: localIso(2026, 1, 1), value: 1, userBookId: 'ub-1', workId: 'work-1' },
      'Тигролови',
    );
    const reread = formatMilestoneCopy(
      { id: 'first_reread', kind: 'first_reread', at: localIso(2027, 1, 1), value: null, userBookId: 'ub-1', workId: 'work-1' },
      'Тигролови',
    );
    expect(first.title).toBe('Перша завершена книга');
    expect(reread.title).toBe('Перше перечитування');
    expect(reread.description).toContain('повернувся');
  });
});

describe('formatReturnGap — людська тривалість повернення (ТЗ §8)', () => {
  it('роки й місяці разом', () => {
    expect(formatReturnGap(localIso(2025, 1, 10), localIso(2027, 5, 10))).toBe('через 2 роки 4 місяці');
  });

  it('рівно роки — без місяців', () => {
    expect(formatReturnGap(localIso(2025, 1, 10), localIso(2030, 1, 10))).toBe('через 5 років');
  });

  it('менше року — самі місяці', () => {
    expect(formatReturnGap(localIso(2026, 1, 10), localIso(2026, 6, 10))).toBe('через 5 місяців');
  });

  it('менше місяця — не подія, повертає null', () => {
    expect(formatReturnGap(localIso(2026, 1, 10), localIso(2026, 1, 13))).toBeNull();
  });

  it('НІКОЛИ не рахує днями («через 854 дні»)', () => {
    const gap = formatReturnGap(localIso(2025, 1, 10), localIso(2027, 5, 10));
    expect(gap).not.toMatch(/дн/);
  });
});
