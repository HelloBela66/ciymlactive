import {
  buildBookRelationshipTimeline,
  isMeaningfulJournalEntry,
  type BookTimelineEvent,
  type TimelineJournalInput,
  type TimelineRunInput,
  type TimelineSessionInput,
} from './bookRelationshipTimeline';

/**
 * POLYTSIA V1.7, Phase 2 — тести хронології книги (ТЗ V1.7 §6-§10).
 *
 * Дати будуються з ЛОКАЛЬНИХ компонентів і переводяться в instant через `.toISOString()` —
 * той самий підхід, що й у тестах Phase 1 (`readingCalendar.test.ts`): інваріанти істинні в
 * будь-якому поясі, а не лише в UTC, на якому закріплений `npm test`.
 */

function iso(y: number, m: number, d: number, h = 12, min = 0): string {
  return new Date(y, m - 1, d, h, min).toISOString();
}

function run(id: string, runNumber: number, startedAt: string, finishedAt: string | null, status = 'finished'): TimelineRunInput {
  return { id, runNumber, status, startedAt, finishedAt };
}

function session(
  id: string,
  readingRunId: string | null,
  startedAt: string,
  durationSeconds: number,
  startPage: number,
  endPage: number | null,
): TimelineSessionInput {
  return { id, readingRunId, startedAt, durationSeconds, startPage, endPage };
}

function journal(
  id: string,
  createdAt: string,
  opts: Partial<TimelineJournalInput> = {},
): TimelineJournalInput {
  return {
    id,
    kind: 'note',
    sessionId: null,
    page: null,
    text: `Запис ${id}`,
    isFavorite: false,
    revisitLater: false,
    createdAt,
    ...opts,
  };
}

function kinds(events: BookTimelineEvent[]): string[] {
  return events.map((e) => e.kind);
}

describe('порожня історія', () => {
  it('книга без жодної активності — жодної глави, але «додано» лишається', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: iso(2026, 4, 1),
      runs: [],
      sessions: [],
      journal: [],
    });
    expect(kinds(result.prelude)).toEqual(['book_added']);
    expect(result.chapters).toEqual([]);
    expect(result.finishedRunCount).toBe(0);
    expect(result.hasReread).toBe(false);
  });

  it('без дати додавання prelude порожній, а не з подією-заглушкою', () => {
    const result = buildBookRelationshipTimeline({ addedAt: null, runs: [], sessions: [], journal: [] });
    expect(result.prelude).toEqual([]);
  });
});

describe('одне прочитання — глава з подіями в хронологічному порядку', () => {
  it('починається «почав», закінчується «завершив»', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: iso(2026, 4, 1),
      runs: [run('r1', 1, iso(2026, 4, 4, 9), iso(2026, 4, 17, 21))],
      sessions: [
        session('s1', 'r1', iso(2026, 4, 4, 20), 1800, 0, 30),
        session('s2', 'r1', iso(2026, 4, 9, 20), 2400, 30, 80),
      ],
      journal: [],
    });

    expect(result.chapters).toHaveLength(1);
    const chapter = result.chapters[0];
    expect(chapter?.runNumber).toBe(1);
    expect(kinds(chapter?.events ?? [])).toEqual(['run_started', 'sessions', 'run_finished']);
  });

  it('сесії ЗГОРНУТІ в один відрізок, а не показані поодинці (ТЗ §7)', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: null,
      runs: [run('r1', 1, iso(2026, 4, 4, 9), iso(2026, 4, 17, 21))],
      sessions: [
        session('s1', 'r1', iso(2026, 4, 4, 20), 1800, 0, 30),
        session('s2', 'r1', iso(2026, 4, 5, 20), 1800, 30, 60),
        session('s3', 'r1', iso(2026, 4, 9, 20), 3600, 60, 140),
      ],
      journal: [],
    });

    const chapter = result.chapters[0];
    const sessionEvents = (chapter?.events ?? []).filter((e) => e.kind === 'sessions');
    expect(sessionEvents).toHaveLength(1);
    expect(chapter?.sessions).toEqual({
      firstStartedAt: iso(2026, 4, 4, 20),
      lastStartedAt: iso(2026, 4, 9, 20),
      sessionCount: 3,
      minutes: 120,
      pages: 140,
      daysSpent: 3,
    });
  });

  it('жодної технічної події сесії (start/pause/resume) у хронології не зʼявляється', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: null,
      runs: [run('r1', 1, iso(2026, 4, 4), iso(2026, 4, 17))],
      sessions: [session('s1', 'r1', iso(2026, 4, 4, 20), 1800, 0, 30)],
      journal: [],
    });
    const allKinds = kinds(result.chapters[0]?.events ?? []);
    expect(allKinds).not.toContain('session_started');
    expect(allKinds).not.toContain('session_paused');
    expect(allKinds.filter((k) => k === 'sessions')).toHaveLength(1);
  });

  it('незавершений прохід не має події завершення', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: null,
      runs: [run('r1', 1, iso(2026, 4, 4), null, 'in_progress')],
      sessions: [session('s1', 'r1', iso(2026, 4, 5, 20), 1800, 0, 30)],
      journal: [],
    });
    expect(kinds(result.chapters[0]?.events ?? [])).toEqual(['run_started', 'sessions']);
    expect(result.finishedRunCount).toBe(0);
  });

  it('DNF дає окрему подію, не «завершив»', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: null,
      runs: [run('r1', 1, iso(2026, 4, 4), iso(2026, 4, 20), 'did_not_finish')],
      sessions: [],
      journal: [],
    });
    expect(kinds(result.chapters[0]?.events ?? [])).toEqual(['run_started', 'run_dnf']);
    expect(result.finishedRunCount).toBe(0);
  });
});

describe('журнал — окремо лише значуще (ТЗ §7)', () => {
  it('звичайний запис НЕ стає подією, але рахується в journalCount', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: null,
      runs: [run('r1', 1, iso(2026, 4, 4), iso(2026, 4, 17))],
      sessions: [],
      journal: [journal('j1', iso(2026, 4, 6)), journal('j2', iso(2026, 4, 7))],
    });
    const chapter = result.chapters[0];
    expect(kinds(chapter?.events ?? [])).toEqual(['run_started', 'run_finished']);
    expect(chapter?.journalCount).toBe(2);
    expect(chapter?.meaningfulJournalCount).toBe(0);
  });

  it('обраний запис стає окремою подією', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: null,
      runs: [run('r1', 1, iso(2026, 4, 4), iso(2026, 4, 17))],
      sessions: [],
      journal: [journal('j1', iso(2026, 4, 9), { isFavorite: true, page: 183 })],
    });
    const chapter = result.chapters[0];
    expect(kinds(chapter?.events ?? [])).toEqual(['run_started', 'journal', 'run_finished']);
    expect(chapter?.meaningfulJournalCount).toBe(1);
  });

  it('«повернутися пізніше» так само вважається значущим', () => {
    expect(isMeaningfulJournalEntry(journal('j', iso(2026, 4, 9), { revisitLater: true }))).toBe(true);
    expect(isMeaningfulJournalEntry(journal('j', iso(2026, 4, 9)))).toBe(false);
  });
});

describe('run-атрибуція журналу', () => {
  it('точна прив\'язка через сесію має пріоритет над часовою', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: null,
      runs: [run('r1', 1, iso(2026, 4, 1), iso(2026, 4, 30)), run('r2', 2, iso(2026, 5, 1), iso(2026, 5, 30))],
      sessions: [session('s-in-r2', 'r2', iso(2026, 5, 10, 20), 1800, 0, 20)],
      // createdAt потрапляє у вікно ПЕРШОГО проходу, але сесія належить ДРУГОМУ —
      // перемагає сесія.
      journal: [journal('j1', iso(2026, 4, 15), { sessionId: 's-in-r2', isFavorite: true })],
    });

    expect(result.chapters[0]?.meaningfulJournalCount).toBe(0);
    expect(result.chapters[1]?.meaningfulJournalCount).toBe(1);
  });

  it('без сесії запис лягає в прохід за часом', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: null,
      runs: [run('r1', 1, iso(2026, 4, 1), iso(2026, 4, 30)), run('r2', 2, iso(2026, 5, 1), iso(2026, 5, 30))],
      sessions: [],
      journal: [journal('j1', iso(2026, 5, 15), { isFavorite: true })],
    });
    expect(result.chapters[0]?.journalCount).toBe(0);
    expect(result.chapters[1]?.journalCount).toBe(1);
  });

  it('запис МІЖ проходами не губиться — потрапляє в главу без проходу', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: null,
      runs: [run('r1', 1, iso(2026, 4, 1), iso(2026, 4, 30)), run('r2', 2, iso(2026, 6, 1), iso(2026, 6, 30))],
      sessions: [],
      journal: [journal('j1', iso(2026, 5, 15), { isFavorite: true })],
    });
    const orphan = result.chapters.find((c) => c.runId === null);
    expect(orphan?.journalCount).toBe(1);
    expect(orphan?.meaningfulJournalCount).toBe(1);
  });
});

describe('перечитування — окремі глави (ТЗ §8)', () => {
  it('два завершені проходи дають дві глави в хронологічному порядку', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: iso(2026, 3, 20),
      runs: [
        run('r2', 2, iso(2027, 8, 3), iso(2027, 8, 18)),
        run('r1', 1, iso(2026, 4, 4), iso(2026, 4, 17)),
      ],
      sessions: [
        session('s1', 'r1', iso(2026, 4, 5, 20), 1800, 0, 40),
        session('s2', 'r2', iso(2027, 8, 4, 20), 1200, 0, 25),
      ],
      journal: [],
    });

    expect(result.chapters.map((c) => c.runNumber)).toEqual([1, 2]);
    expect(result.finishedRunCount).toBe(2);
    expect(result.hasReread).toBe(true);
    expect(result.chapters[0]?.sessions?.sessionCount).toBe(1);
    expect(result.chapters[1]?.sessions?.sessionCount).toBe(1);
  });

  it('статистика проходів не змішується між главами', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: null,
      runs: [run('r1', 1, iso(2026, 4, 1), iso(2026, 4, 20)), run('r2', 2, iso(2028, 4, 1), iso(2028, 4, 10))],
      sessions: [
        session('s1', 'r1', iso(2026, 4, 2, 20), 3600, 0, 100),
        session('s2', 'r1', iso(2026, 4, 3, 20), 3600, 100, 200),
        session('s3', 'r2', iso(2028, 4, 2, 20), 1800, 0, 50),
      ],
      journal: [],
    });

    expect(result.chapters[0]?.sessions).toMatchObject({ sessionCount: 2, minutes: 120, pages: 200 });
    expect(result.chapters[1]?.sessions).toMatchObject({ sessionCount: 1, minutes: 30, pages: 50 });
  });

  it('одне прочитання — hasReread false', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: null,
      runs: [run('r1', 1, iso(2026, 4, 1), iso(2026, 4, 20))],
      sessions: [],
      journal: [],
    });
    expect(result.hasReread).toBe(false);
  });
});

describe('оцінка / спогад / капсула прив\'язані до свого проходу', () => {
  it('оцінка другого проходу не потрапляє в главу першого', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: null,
      runs: [run('r1', 1, iso(2026, 4, 1), iso(2026, 4, 20)), run('r2', 2, iso(2028, 4, 1), iso(2028, 4, 10))],
      sessions: [],
      journal: [],
      ratings: [
        { at: iso(2026, 4, 20, 22), runId: 'r1', value: 4.5 },
        { at: iso(2028, 4, 10, 22), runId: 'r2', value: 5 },
      ],
    });

    const first = result.chapters[0]?.events.find((e) => e.kind === 'rating');
    const second = result.chapters[1]?.events.find((e) => e.kind === 'rating');
    expect(first).toMatchObject({ kind: 'rating', value: 4.5 });
    expect(second).toMatchObject({ kind: 'rating', value: 5 });
  });

  it('спогад і капсула зʼявляються подіями своєї глави', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: null,
      runs: [run('r1', 1, iso(2026, 4, 1), iso(2026, 4, 20))],
      sessions: [],
      journal: [],
      memories: [{ at: iso(2026, 4, 21), runId: 'r1' }],
      capsules: [{ at: iso(2026, 4, 22), runId: 'r1' }],
    });
    expect(kinds(result.chapters[0]?.events ?? [])).toEqual([
      'run_started',
      'run_finished',
      'memory',
      'capsule',
    ]);
  });

  it('запис без дати не стає подією', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: null,
      runs: [run('r1', 1, iso(2026, 4, 1), iso(2026, 4, 20))],
      sessions: [],
      journal: [],
      memories: [{ at: null, runId: 'r1' }],
    });
    expect(kinds(result.chapters[0]?.events ?? [])).toEqual(['run_started', 'run_finished']);
  });
});

describe('історичні дані без проходу (до міграції reading_run)', () => {
  it('сесії без run не губляться — окрема глава без номера', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: null,
      runs: [],
      sessions: [session('s1', null, iso(2024, 6, 1, 20), 1800, 0, 40)],
      journal: [],
    });
    const orphan = result.chapters.find((c) => c.runId === null);
    expect(orphan?.runNumber).toBeNull();
    expect(orphan?.sessions?.sessionCount).toBe(1);
  });

  it('глава без проходу зʼявляється лише за наявності активності', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: iso(2026, 1, 1),
      runs: [run('r1', 1, iso(2026, 4, 1), iso(2026, 4, 20))],
      sessions: [session('s1', 'r1', iso(2026, 4, 2, 20), 1800, 0, 40)],
      journal: [],
    });
    expect(result.chapters.every((c) => c.runId !== null)).toBe(true);
  });
});

describe('нічне читання — дні рахуються локальним календарем (успадковано з Phase 1)', () => {
  it('сесії 23:50 і 00:30 наступної доби дають daysSpent = 2', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: null,
      runs: [run('r1', 1, iso(2026, 4, 1), iso(2026, 4, 20))],
      sessions: [
        session('s1', 'r1', iso(2026, 4, 5, 23, 50), 600, 0, 10),
        session('s2', 'r1', iso(2026, 4, 6, 0, 30), 600, 10, 20),
      ],
      journal: [],
    });
    expect(result.chapters[0]?.sessions?.daysSpent).toBe(2);
  });

  it('дві сесії того самого локального дня — daysSpent = 1', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: null,
      runs: [run('r1', 1, iso(2026, 4, 1), iso(2026, 4, 20))],
      sessions: [
        session('s1', 'r1', iso(2026, 4, 5, 9), 600, 0, 10),
        session('s2', 'r1', iso(2026, 4, 5, 23, 30), 600, 10, 20),
      ],
      journal: [],
    });
    expect(result.chapters[0]?.sessions?.daysSpent).toBe(1);
  });
});

/**
 * POLYTSIA V1.7, Phase 8 (ТЗ §8) — «повернувся до цієї книги через N років».
 *
 * Тут перевіряються самі ДАНІ (`previousRunFinishedAt`); людський текст проміжку будує
 * `formatReturnGap` і покривають тести `readingMilestones.test.ts`. Розділення навмисне: подія
 * стосунків із книгою живе в хронології книги, а не серед глобальних віх.
 */
describe('previousRunFinishedAt — повернення до книги (ТЗ §8)', () => {
  it('перший прохід не має попереднього — поля немає чим заповнити', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: iso(2025, 1, 1),
      runs: [run('r1', 1, iso(2025, 1, 2), iso(2025, 2, 1))],
      sessions: [],
      journal: [],
    });
    expect(result.chapters[0]?.previousRunFinishedAt).toBeNull();
  });

  it('другий прохід знає, коли книгу відклали перед ним', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: iso(2025, 1, 1),
      runs: [
        run('r1', 1, iso(2025, 1, 2), iso(2025, 2, 1)),
        run('r2', 2, iso(2027, 6, 10), iso(2027, 7, 1)),
      ],
      sessions: [],
      journal: [],
    });
    const second = result.chapters.find((chapter) => chapter.runNumber === 2);
    expect(second?.previousRunFinishedAt).toBe(iso(2025, 2, 1));
  });

  it('повернення після ВІДКЛАДЕНОЇ книги теж рахується поверненням до книги', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: iso(2025, 1, 1),
      runs: [
        run('r1', 1, iso(2025, 1, 2), iso(2025, 2, 1), 'did_not_finish'),
        run('r2', 2, iso(2028, 3, 10), null),
      ],
      sessions: [],
      journal: [],
    });
    const second = result.chapters.find((chapter) => chapter.runNumber === 2);
    expect(second?.previousRunFinishedAt).toBe(iso(2025, 2, 1));
  });

  it('незавершений попередній прохід не дає дати повернення', () => {
    const result = buildBookRelationshipTimeline({
      addedAt: iso(2025, 1, 1),
      runs: [run('r1', 1, iso(2025, 1, 2), null), run('r2', 2, iso(2025, 6, 1), null)],
      sessions: [],
      journal: [],
    });
    expect(result.chapters.find((chapter) => chapter.runNumber === 2)?.previousRunFinishedAt).toBeNull();
  });
});
