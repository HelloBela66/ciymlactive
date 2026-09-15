import {
  computePagesPerHour,
  computeReadingPeriodSummary,
  EMPTY_READING_PERIOD_SUMMARY,
  type PeriodFinishedRunInput,
  type PeriodSessionInput,
} from './readingPeriodSummary';

/**
 * POLYTSIA V1.7 — тести єдиного canonical-двигуна періоду
 * (`docs/V1_7_READING_LIFE.md`, `docs/V1_7_TEMPORAL_SEMANTICS.md`).
 *
 * Той самий підхід до часових поясів, що й у `readingCalendar.test.ts`: моменти будуються з
 * ЛОКАЛЬНИХ компонентів (`new Date(2026, 7, 16, ...)`) і переводяться в instant через
 * `.toISOString()`, тож інваріанти істинні в будь-якому поясі, включно з UTC у CI.
 */

function session(local: Date, durationSeconds: number | null, startPage: number, endPage: number | null): PeriodSessionInput {
  return { startedAt: local.toISOString(), durationSeconds, startPage, endPage };
}

function finishedRun(
  id: string,
  userBookId: string,
  workId: string | null,
  runNumber: number,
  status = 'finished',
): PeriodFinishedRunInput {
  return { id, userBookId, workId, runNumber, status, finishedAt: new Date(2026, 7, 20, 12, 0).toISOString() };
}

describe('computeReadingPeriodSummary — порожній період', () => {
  it('нуль сесій і нуль прочитань — нулі, а не помилка', () => {
    const result = computeReadingPeriodSummary({ sessions: [], finishedRuns: [] });
    expect(result).toEqual(EMPTY_READING_PERIOD_SUMMARY);
  });

  it('темп при порожньому періоді — null (ховаємо метрику, не показуємо 0 стор/год)', () => {
    expect(computeReadingPeriodSummary({ sessions: [], finishedRuns: [] }).pagesPerHour).toBeNull();
  });
});

describe('computeReadingPeriodSummary — базові метрики', () => {
  it('одна сесія: хвилини, сторінки, кількість, активні дні', () => {
    const result = computeReadingPeriodSummary({
      sessions: [session(new Date(2026, 7, 16, 20, 0), 1800, 10, 40)],
      finishedRuns: [],
    });
    expect(result.readingMinutes).toBe(30);
    expect(result.pagesRead).toBe(30);
    expect(result.sessionCount).toBe(1);
    expect(result.activeDays).toBe(1);
    expect(result.activeDayKeys).toEqual(['2026-08-16']);
  });

  it('кілька сесій одного дня — один активний день, суми складаються', () => {
    const result = computeReadingPeriodSummary({
      sessions: [
        session(new Date(2026, 7, 16, 9, 0), 600, 0, 10),
        session(new Date(2026, 7, 16, 21, 0), 1200, 10, 25),
      ],
      finishedRuns: [],
    });
    expect(result.activeDays).toBe(1);
    expect(result.readingMinutes).toBe(30);
    expect(result.pagesRead).toBe(25);
    expect(result.sessionCount).toBe(2);
  });

  it('сесії різних днів — активні дні рахуються окремо й відсортовані', () => {
    const result = computeReadingPeriodSummary({
      sessions: [
        session(new Date(2026, 7, 18, 9, 0), 600, 0, 5),
        session(new Date(2026, 7, 16, 9, 0), 600, 0, 5),
      ],
      finishedRuns: [],
    });
    expect(result.activeDayKeys).toEqual(['2026-08-16', '2026-08-18']);
    expect(result.activeDays).toBe(2);
  });

  it('сесія без endPage — 0 сторінок, але хвилини й активний день зараховуються', () => {
    const result = computeReadingPeriodSummary({
      sessions: [session(new Date(2026, 7, 16, 9, 0), 900, 10, null)],
      finishedRuns: [],
    });
    expect(result.pagesRead).toBe(0);
    expect(result.readingMinutes).toBe(15);
    expect(result.activeDays).toBe(1);
  });

  it('сесія без durationSeconds — 0 хвилин, але сторінки зараховуються', () => {
    const result = computeReadingPeriodSummary({
      sessions: [session(new Date(2026, 7, 16, 9, 0), null, 10, 30)],
      finishedRuns: [],
    });
    expect(result.readingMinutes).toBe(0);
    expect(result.pagesRead).toBe(20);
  });

  it('відʼємна дельта сторінок (виправлення прогресу) не зменшує підсумок', () => {
    const result = computeReadingPeriodSummary({
      sessions: [
        session(new Date(2026, 7, 16, 9, 0), 600, 100, 120),
        session(new Date(2026, 7, 17, 9, 0), 600, 120, 90),
      ],
      finishedRuns: [],
    });
    expect(result.pagesRead).toBe(20);
  });
});

describe('НІЧНА СЕСІЯ — атрибуція за локальним днем (головний регресійний випадок V1.7)', () => {
  it('сесія о 00:30 дає активний день СВОЄЇ локальної дати, не попередньої', () => {
    const result = computeReadingPeriodSummary({
      sessions: [session(new Date(2026, 7, 16, 0, 30), 1800, 0, 20)],
      finishedRuns: [],
    });
    expect(result.activeDayKeys).toEqual(['2026-08-16']);
  });

  it('23:50 і 00:30 наступної доби — ДВА різні активні дні', () => {
    const result = computeReadingPeriodSummary({
      sessions: [
        session(new Date(2026, 7, 16, 23, 50), 600, 0, 10),
        session(new Date(2026, 7, 17, 0, 30), 600, 10, 20),
      ],
      finishedRuns: [],
    });
    expect(result.activeDayKeys).toEqual(['2026-08-16', '2026-08-17']);
    expect(result.activeDays).toBe(2);
  });

  it('новорічне читання о 00:30 дає активний день 1 січня НОВОГО року', () => {
    const result = computeReadingPeriodSummary({
      sessions: [session(new Date(2027, 0, 1, 0, 30), 1800, 0, 15)],
      finishedRuns: [],
    });
    expect(result.activeDayKeys).toEqual(['2027-01-01']);
  });
});

describe('ТРИВАЛІСТЬ НЕ ДУБЛЮЄТЬСЯ — сесія належить рівно одному періоду', () => {
  it('сума хвилин періодів дорівнює сумі хвилин усіх сесій (інваріант)', () => {
    const augustSessions = [
      session(new Date(2026, 7, 30, 12, 0), 1800, 0, 10),
      // Перетинає північ і межу місяця: почалась 31 серпня 23:50, скінчилась 1 вересня 00:20.
      session(new Date(2026, 7, 31, 23, 50), 1800, 10, 25),
    ];
    const septemberSessions = [session(new Date(2026, 8, 1, 10, 0), 600, 25, 30)];

    const august = computeReadingPeriodSummary({ sessions: augustSessions, finishedRuns: [] });
    const september = computeReadingPeriodSummary({ sessions: septemberSessions, finishedRuns: [] });
    const all = computeReadingPeriodSummary({
      sessions: [...augustSessions, ...septemberSessions],
      finishedRuns: [],
    });

    expect(august.readingMinutes + september.readingMinutes).toBe(all.readingMinutes);
    expect(august.pagesRead + september.pagesRead).toBe(all.pagesRead);
    expect(august.sessionCount + september.sessionCount).toBe(all.sessionCount);
  });

  it('сесія, що перетинає межу місяця, повністю належить місяцю свого початку', () => {
    // 31 серпня 23:50, 30 хвилин — уся тривалість і всі сторінки в серпні.
    const crossing = session(new Date(2026, 7, 31, 23, 50), 1800, 10, 25);
    const august = computeReadingPeriodSummary({ sessions: [crossing], finishedRuns: [] });
    expect(august.readingMinutes).toBe(30);
    expect(august.pagesRead).toBe(15);
    expect(august.activeDayKeys).toEqual(['2026-08-31']);
  });
});

describe('завершені прочитання, перечитування, DNF', () => {
  it('перше прочитання — finished 1, reread 0', () => {
    const result = computeReadingPeriodSummary({
      sessions: [],
      finishedRuns: [finishedRun('r1', 'ub1', 'w1', 1)],
    });
    expect(result.finishedRunCount).toBe(1);
    expect(result.firstTimeFinishCount).toBe(1);
    expect(result.rereadFinishCount).toBe(0);
    expect(result.uniqueFinishedWorkIds).toEqual(['w1']);
  });

  it('перечитування НЕ рахується як нова книга (ТЗ §25)', () => {
    const result = computeReadingPeriodSummary({
      sessions: [],
      finishedRuns: [finishedRun('r2', 'ub1', 'w1', 2)],
    });
    expect(result.finishedRunCount).toBe(1);
    expect(result.firstTimeFinishCount).toBe(0);
    expect(result.rereadFinishCount).toBe(1);
  });

  it('перше прочитання + перечитування ТОЇ САМОЇ книги в одному періоді — 2 прочитання, 1 унікальний твір', () => {
    const result = computeReadingPeriodSummary({
      sessions: [],
      finishedRuns: [finishedRun('r1', 'ub1', 'w1', 1), finishedRun('r2', 'ub1', 'w1', 2)],
    });
    expect(result.finishedRunCount).toBe(2);
    expect(result.uniqueFinishedWorkIds).toEqual(['w1']);
    expect(result.firstTimeFinishCount).toBe(1);
    expect(result.rereadFinishCount).toBe(1);
  });

  it('DNF ніколи не потрапляє у finishedRunCount', () => {
    const result = computeReadingPeriodSummary({
      sessions: [],
      finishedRuns: [finishedRun('r1', 'ub1', 'w1', 1), finishedRun('r2', 'ub2', 'w2', 1, 'did_not_finish')],
    });
    expect(result.finishedRunCount).toBe(1);
    expect(result.dnfRunCount).toBe(1);
    expect(result.uniqueFinishedWorkIds).toEqual(['w1']);
  });

  it('два різні видання одного твору — один унікальний твір (ідентичність за work)', () => {
    const result = computeReadingPeriodSummary({
      sessions: [],
      finishedRuns: [finishedRun('r1', 'ub1', 'w1', 1), finishedRun('r2', 'ub2', 'w1', 1)],
    });
    expect(result.finishedRunCount).toBe(2);
    expect(result.uniqueFinishedWorkIds).toEqual(['w1']);
  });

  it('нерезолвлений workId (фізично видалені дані) не ламає підрахунок', () => {
    const result = computeReadingPeriodSummary({
      sessions: [],
      finishedRuns: [finishedRun('r1', 'ub1', null, 1)],
    });
    expect(result.finishedRunCount).toBe(1);
    expect(result.uniqueFinishedWorkIds).toEqual([]);
    expect(result.finishedUserBookIds).toEqual(['ub1']);
  });
});

describe('темп — показуємо лише за наявності даних (ТЗ §28)', () => {
  it('60 сторінок за 60 хвилин — 60 стор/год', () => {
    expect(computePagesPerHour(60, 60)).toBe(60);
  });

  it('немає сторінок — null, а НЕ 0 стор/год', () => {
    expect(computePagesPerHour(0, 120)).toBeNull();
  });

  it('немає хвилин — null', () => {
    expect(computePagesPerHour(50, 0)).toBeNull();
  });

  it('у підсумку періоду без page tracking темп прихований', () => {
    const result = computeReadingPeriodSummary({
      sessions: [session(new Date(2026, 7, 16, 9, 0), 3600, 10, null)],
      finishedRuns: [],
    });
    expect(result.readingMinutes).toBe(60);
    expect(result.pagesPerHour).toBeNull();
  });
});

describe('journalCount', () => {
  it('не переданий — null (метрика недоступна, а не нульова)', () => {
    expect(computeReadingPeriodSummary({ sessions: [], finishedRuns: [] }).journalCount).toBeNull();
  });

  it('переданий нуль — саме 0, а не null', () => {
    const result = computeReadingPeriodSummary({ sessions: [], finishedRuns: [], journalCount: 0 });
    expect(result.journalCount).toBe(0);
  });

  it('переданий — повертається без змін', () => {
    expect(computeReadingPeriodSummary({ sessions: [], finishedRuns: [], journalCount: 7 }).journalCount).toBe(7);
  });
});
