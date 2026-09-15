import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { UserBookRepository } from './UserBookRepository';
import { ReadingSessionRepository } from './ReadingSessionRepository';
import { ReadingRunRepository } from './ReadingRunRepository';
import { JournalRepository } from './JournalRepository';
import { summarizeReadingPeriod } from '@/features/reading-period/summarizeReadingPeriod';
import type { ReadingPeriodSummary } from '@/lib/readingPeriodSummary';
import {
  monthRange,
  monthRangeOf,
  monthSpanRange,
  readingDayKey,
  weekRange,
  yearRangeOf,
} from '@/lib/readingCalendar';
import { buildReadingLife, findReadingLifeMonth, findReadingLifeYear } from '@/lib/readingLife';
import { recapRangeOf } from '@/lib/readingRecap';
import { sumSessionMinutes, sumSessionPages } from '@/lib/readingAggregates';

/**
 * POLYTSIA V1.7, Phase 1 — CROSS-SURFACE PARITY (ТЗ V1.7 §15).
 *
 * Окремі тести вже доводять КОЖЕН шматок ізольовано: `readingCalendar.test.ts` — межі періодів,
 * `readingPeriodSummary.test.ts` — формули над уже завантаженими даними, тести репозиторіїв —
 * самі запити. Цього не досить: ТЗ прямо вимагає довести, що ОДНА Й ТА САМА історія дає ОДНАКОВІ
 * базові цифри на РІЗНИХ поверхнях — тобто що в застосунку не існує "п'яти різних відповідей на
 * питання «скільки я читав цього місяця?»".
 *
 * Тому тут дані сіються ОДИН раз, а потім проходять тим самим шляхом, що й реальні хуки:
 * діапазон із `readingCalendar` → ті самі repository-методи → той самий
 * `computeReadingPeriodSummary`. Перевіряється не рівність функції самій собі, а узгодженість
 * ЛАНЦЮЖКА: тиждень+тиждень = місяць, сума місяців = рік, підсумок = ручна сума по сесіях.
 *
 * Дати будуються з ЛОКАЛЬНИХ компонентів (`new Date(2026, 7, 16, 0, 30)`) і переводяться в
 * instant через `.toISOString()` — інваріанти істинні в будь-якому поясі, включно з UTC у CI
 * (докладніше — коментар у `readingCalendar.test.ts`).
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

async function seedBook(db: SQLiteDatabase, id: string, title = `Книга ${id}`): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    `${id}-work`,
    title,
    now,
    now,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [`${id}-edition`, `${id}-work`, title, 'uk', 'paperback', now, now],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,?,?,?,?)`,
    [id, `${id}-edition`, 'reading', 0, now, now],
  );
}

/** Пряма вставка — `start()`/`finish()` завжди пишуть `nowIso()` і не приймають історичну дату. */
async function seedSession(
  db: SQLiteDatabase,
  params: { id: string; userBookId: string; startedAtLocal: Date; durationSeconds: number; startPage: number; endPage: number },
): Promise<void> {
  const now = new Date().toISOString();
  const startedAt = params.startedAtLocal.toISOString();
  const endedAt = new Date(params.startedAtLocal.getTime() + params.durationSeconds * 1000).toISOString();
  await db.runAsync(
    `INSERT INTO reading_session
       (id, user_book_id, started_at, ended_at, goal_minutes, paused_intervals, start_page, end_page,
        duration_seconds, mood_note, is_edited, created_at, updated_at, deleted_at, reading_run_id)
     VALUES (?,?,?,?,NULL,'[]',?,?,?,NULL,0,?,?,NULL,NULL)`,
    [params.id, params.userBookId, startedAt, endedAt, params.startPage, params.endPage, params.durationSeconds, now, now],
  );
}

async function seedFinishedRun(
  db: SQLiteDatabase,
  params: { id: string; userBookId: string; runNumber: number; finishedAtLocal: Date; status?: string },
): Promise<void> {
  const now = new Date().toISOString();
  const finishedAt = params.finishedAtLocal.toISOString();
  await db.runAsync(
    `INSERT INTO reading_run (id, user_book_id, run_number, status, started_at, finished_at, is_legacy_backfill, created_at, updated_at)
     VALUES (?,?,?,?,?,?,0,?,?)`,
    [params.id, params.userBookId, params.runNumber, params.status ?? 'finished', finishedAt, finishedAt, now, now],
  );
}

/**
 * РІВНО той код, який виконують реальні хуки періоду (Wrapped/Recap/Reading Life) — не імітація
 * його (POLYTSIA V1.7, Phase 6).
 *
 * До Phase 6 тут жила власна копія ланцюжка «діапазон → repository-методи → формула». Вона
 * доводила менше, ніж здавалось: тест міг лишатись зеленим, поки продакшн-хук тихо взяв би інший
 * метод (наприклад, `listStartedOrFinishedBetween` замість `listFinishedBetween`) чи забув
 * `...IncludingDeleted`. Тепер обидва шляхи — це буквально одна функція.
 */
async function summarize(db: SQLiteDatabase, range: { startIso: string; endIso: string }) {
  const { summary } = await summarizeReadingPeriod(db, range);
  return summary;
}

describe('V1.7 parity — тиждень/місяць/рік не розходяться між собою', () => {
  it('сума двох суміжних тижнів дорівнює їхньому спільному відрізку місяця', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'p-a');
    // Тиждень 10-16 серпня 2026 (пн-нд) і тиждень 17-23 серпня.
    await seedSession(db, { id: 's1', userBookId: 'p-a', startedAtLocal: new Date(2026, 7, 11, 10, 0), durationSeconds: 1800, startPage: 0, endPage: 20 });
    await seedSession(db, { id: 's2', userBookId: 'p-a', startedAtLocal: new Date(2026, 7, 16, 23, 50), durationSeconds: 1200, startPage: 20, endPage: 35 });
    await seedSession(db, { id: 's3', userBookId: 'p-a', startedAtLocal: new Date(2026, 7, 17, 0, 30), durationSeconds: 600, startPage: 35, endPage: 40 });
    await seedSession(db, { id: 's4', userBookId: 'p-a', startedAtLocal: new Date(2026, 7, 20, 9, 0), durationSeconds: 900, startPage: 40, endPage: 50 });

    const first = await summarize(db, weekRange(new Date(2026, 7, 12, 12, 0)));
    const second = await summarize(db, weekRange(new Date(2026, 7, 19, 12, 0)));

    // Сесія 16 серпня 23:50 (неділя) належить ПЕРШОМУ тижню; 17 серпня 00:30 (понеділок) — ДРУГОМУ.
    expect(first.sessionCount).toBe(2);
    expect(second.sessionCount).toBe(2);
    expect(first.readingMinutes).toBe(50);
    expect(second.readingMinutes).toBe(25);
    expect(first.readingMinutes + second.readingMinutes).toBe(75);
    expect(first.pagesRead + second.pagesRead).toBe(50);
  });

  it('МЕЖА МІСЯЦЯ: сесія 31 серпня 23:50 рахується в серпні й НЕ рахується у вересні', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'p-b');
    await seedSession(db, { id: 's1', userBookId: 'p-b', startedAtLocal: new Date(2026, 7, 31, 23, 50), durationSeconds: 1800, startPage: 0, endPage: 15 });
    await seedSession(db, { id: 's2', userBookId: 'p-b', startedAtLocal: new Date(2026, 8, 1, 10, 0), durationSeconds: 600, startPage: 15, endPage: 20 });

    const august = await summarize(db, monthRange(new Date(2026, 7, 15)));
    const september = await summarize(db, monthRange(new Date(2026, 8, 15)));

    expect(august.sessionCount).toBe(1);
    expect(august.readingMinutes).toBe(30);
    expect(august.pagesRead).toBe(15);
    expect(august.activeDayKeys).toEqual(['2026-08-31']);

    expect(september.sessionCount).toBe(1);
    expect(september.readingMinutes).toBe(10);

    // Тривалість не подвоюється: жодна сесія не потрапила в обидва місяці.
    expect(august.readingMinutes + september.readingMinutes).toBe(40);
  });

  it('МЕЖА РОКУ: новорічне читання о 00:30 належить НОВОМУ року', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'p-c');
    await seedSession(db, { id: 's1', userBookId: 'p-c', startedAtLocal: new Date(2026, 11, 31, 23, 50), durationSeconds: 600, startPage: 0, endPage: 5 });
    await seedSession(db, { id: 's2', userBookId: 'p-c', startedAtLocal: new Date(2027, 0, 1, 0, 30), durationSeconds: 1800, startPage: 5, endPage: 25 });

    const y2026 = await summarize(db, yearRangeOf(2026));
    const y2027 = await summarize(db, yearRangeOf(2027));

    expect(y2026.sessionCount).toBe(1);
    expect(y2026.readingMinutes).toBe(10);
    expect(y2027.sessionCount).toBe(1);
    expect(y2027.readingMinutes).toBe(30);
    expect(y2027.activeDayKeys).toEqual(['2027-01-01']);
  });

  it('підсумок періоду дорівнює ручній сумі по тих самих сесіях (немає власної формули)', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'p-d');
    await seedSession(db, { id: 's1', userBookId: 'p-d', startedAtLocal: new Date(2026, 7, 3, 10, 0), durationSeconds: 1850, startPage: 0, endPage: 22 });
    await seedSession(db, { id: 's2', userBookId: 'p-d', startedAtLocal: new Date(2026, 7, 4, 10, 0), durationSeconds: 905, startPage: 22, endPage: 31 });

    const range = monthRange(new Date(2026, 7, 15));
    const summary = await summarize(db, range);
    const sessions = await ReadingSessionRepository.listStartedBetween(db, range.startIso, range.endIso);

    expect(summary.readingMinutes).toBe(sumSessionMinutes(sessions));
    expect(summary.pagesRead).toBe(sumSessionPages(sessions));
    expect(summary.activeDays).toBe(new Set(sessions.map((s) => readingDayKey(s.startedAt))).size);
  });
});

describe('V1.7 parity — перечитування й DNF рахуються узгоджено', () => {
  it('перечитування не робить книгу другою УНІКАЛЬНОЮ книгою року', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'p-e');
    await seedFinishedRun(db, { id: 'r1', userBookId: 'p-e', runNumber: 1, finishedAtLocal: new Date(2026, 2, 10, 12, 0) });
    await seedFinishedRun(db, { id: 'r2', userBookId: 'p-e', runNumber: 2, finishedAtLocal: new Date(2026, 9, 5, 12, 0) });

    const year = await summarize(db, yearRangeOf(2026));

    expect(year.finishedRunCount).toBe(2);
    expect(year.firstTimeFinishCount).toBe(1);
    expect(year.rereadFinishCount).toBe(1);
    expect(year.uniqueFinishedWorkIds).toEqual(['p-e-work']);
  });

  it('DNF не потрапляє в завершені прочитання, але видимий окремо', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'p-f');
    await seedBook(db, 'p-g');
    await seedFinishedRun(db, { id: 'r1', userBookId: 'p-f', runNumber: 1, finishedAtLocal: new Date(2026, 4, 2, 12, 0) });
    await seedFinishedRun(db, { id: 'r2', userBookId: 'p-g', runNumber: 1, finishedAtLocal: new Date(2026, 4, 9, 12, 0), status: 'did_not_finish' });

    const year = await summarize(db, yearRangeOf(2026));

    expect(year.finishedRunCount).toBe(1);
    expect(year.dnfRunCount).toBe(1);
    expect(year.uniqueFinishedWorkIds).toEqual(['p-f-work']);
  });
});

describe('V1.7 parity — History Preservation тримається на рівні періоду', () => {
  it('м\'яко видалена книга ЛИШАЄТЬСЯ в історичному періоді, але зникає з живої Бібліотеки', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'p-h');
    await seedSession(db, { id: 's1', userBookId: 'p-h', startedAtLocal: new Date(2026, 5, 10, 10, 0), durationSeconds: 1800, startPage: 0, endPage: 30 });
    await seedFinishedRun(db, { id: 'r1', userBookId: 'p-h', runNumber: 1, finishedAtLocal: new Date(2026, 5, 12, 12, 0) });

    const before = await summarize(db, yearRangeOf(2026));
    await db.runAsync(`UPDATE user_book SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), 'p-h']);
    const after = await summarize(db, yearRangeOf(2026));

    // Історія не переписується видаленням із Бібліотеки сьогодні.
    expect(after.readingMinutes).toBe(before.readingMinutes);
    expect(after.pagesRead).toBe(before.pagesRead);
    expect(after.finishedRunCount).toBe(before.finishedRunCount);
    expect(after.uniqueFinishedWorkIds).toEqual(before.uniqueFinishedWorkIds);

    // Контроль: жива Бібліотека книгу коректно НЕ бачить.
    const library = await UserBookRepository.listAll(db);
    expect(library.map((ub) => ub.id)).not.toContain('p-h');
  });
});

/**
 * POLYTSIA V1.7, Phase 4 — НАЙВАЖЛИВІША перевірка цієї фази.
 *
 * Reading Life (`src/lib/readingLife.ts`) бере ВСЮ історію одним запитом і ріже її на роки й
 * місяці в JS. Wrapped/Seasons/Recap беруть ОДИН період діапазонним SQL-запитом. Це два різні
 * шляхи до однієї цифри — рівно та конфігурація, з якої й народжуються «п'ять різних відповідей
 * на питання «скільки я читав цього місяця?»».
 *
 * Тому тут обидва шляхи проганяються по ОДНИХ І ТИХ САМИХ даних і звіряються полем за полем.
 * Якщо колись хтось «оптимізує» один із них окремо — цей тест впаде першим.
 */
async function buildLifeLikeHook(db: SQLiteDatabase) {
  const [sessions, runs, journalInstants] = await Promise.all([
    ReadingSessionRepository.listAllCompletedMetrics(db),
    ReadingRunRepository.listAllFinished(db),
    JournalRepository.listCreatedInstants(db),
  ]);
  const workIdByUserBookId = await UserBookRepository.listWorkIdsByIds(db, [
    ...new Set(runs.map((run) => run.userBookId)),
  ]);
  return buildReadingLife({
    sessions,
    finishedRuns: runs.map((run) => ({
      id: run.id,
      userBookId: run.userBookId,
      workId: workIdByUserBookId.get(run.userBookId) ?? null,
      runNumber: run.runNumber,
      status: run.status,
      finishedAt: run.finishedAt,
    })),
    journalInstants,
  });
}

/** Усі метрики, які обидва шляхи мають рахувати однаково (журнал — лише в Reading Life). */
function comparableMetrics(summary: ReadingPeriodSummary) {
  return {
    readingMinutes: summary.readingMinutes,
    pagesRead: summary.pagesRead,
    sessionCount: summary.sessionCount,
    activeDays: summary.activeDays,
    activeDayKeys: summary.activeDayKeys,
    finishedRunCount: summary.finishedRunCount,
    firstTimeFinishCount: summary.firstTimeFinishCount,
    rereadFinishCount: summary.rereadFinishCount,
    dnfRunCount: summary.dnfRunCount,
    uniqueFinishedWorkIds: [...summary.uniqueFinishedWorkIds].sort(),
    pagesPerHour: summary.pagesPerHour,
  };
}

describe('V1.7 parity — Reading Life і діапазонний запит дають ТУ САМУ цифру', () => {
  async function seedMixedHistory(db: SQLiteDatabase): Promise<void> {
    await seedBook(db, 'p-k');
    await seedBook(db, 'p-l');

    // Червень 2026, зокрема нічне читання 1 червня о 00:30 (UTC-семантика віднесла б його в травень).
    await seedSession(db, { id: 's1', userBookId: 'p-k', startedAtLocal: new Date(2026, 5, 1, 0, 30), durationSeconds: 1800, startPage: 0, endPage: 20 });
    await seedSession(db, { id: 's2', userBookId: 'p-k', startedAtLocal: new Date(2026, 5, 14, 20, 0), durationSeconds: 2700, startPage: 20, endPage: 55 });
    await seedSession(db, { id: 's3', userBookId: 'p-l', startedAtLocal: new Date(2026, 5, 14, 22, 0), durationSeconds: 900, startPage: 0, endPage: 8 });
    // Липень — щоб рік не складався з одного місяця.
    await seedSession(db, { id: 's4', userBookId: 'p-l', startedAtLocal: new Date(2026, 6, 2, 9, 0), durationSeconds: 3600, startPage: 8, endPage: 70 });
    // Попередній рік — щоб перевірити, що роки не змішуються.
    await seedSession(db, { id: 's5', userBookId: 'p-k', startedAtLocal: new Date(2025, 10, 3, 9, 0), durationSeconds: 1200, startPage: 0, endPage: 10 });

    await seedFinishedRun(db, { id: 'r1', userBookId: 'p-k', runNumber: 1, finishedAtLocal: new Date(2026, 5, 20, 12, 0) });
    await seedFinishedRun(db, { id: 'r2', userBookId: 'p-k', runNumber: 2, finishedAtLocal: new Date(2026, 6, 28, 12, 0) });
    await seedFinishedRun(db, { id: 'r3', userBookId: 'p-l', runNumber: 1, finishedAtLocal: new Date(2026, 6, 30, 12, 0), status: 'did_not_finish' });
  }

  it('місяць Reading Life дорівнює тому самому місяцю через `monthRange` + repository', async () => {
    const db = await openMigratedTestDb();
    await seedMixedHistory(db);

    const life = await buildLifeLikeHook(db);

    for (const [monthKey, anchor] of [
      ['2026-06', new Date(2026, 5, 15)],
      ['2026-07', new Date(2026, 6, 15)],
      ['2025-11', new Date(2025, 10, 15)],
    ] as const) {
      const fromLife = findReadingLifeMonth(life, monthKey);
      const fromRange = await summarize(db, monthRange(anchor));
      expect(fromLife).not.toBeNull();
      expect(fromLife ? comparableMetrics(fromLife.summary) : null).toEqual(comparableMetrics(fromRange));
    }
  });

  it('рік Reading Life дорівнює тому самому року через `yearRangeOf` + repository', async () => {
    const db = await openMigratedTestDb();
    await seedMixedHistory(db);

    const life = await buildLifeLikeHook(db);

    for (const year of [2026, 2025]) {
      const fromLife = findReadingLifeYear(life, year);
      const fromRange = await summarize(db, yearRangeOf(year));
      expect(fromLife).not.toBeNull();
      expect(fromLife ? comparableMetrics(fromLife.summary) : null).toEqual(comparableMetrics(fromRange));
    }
  });

  it('роки й місяці Reading Life — саме ті, у яких щось відбулось (без порожніх і без пропусків)', async () => {
    const db = await openMigratedTestDb();
    await seedMixedHistory(db);

    const life = await buildLifeLikeHook(db);

    expect(life.years.map((year) => year.year)).toEqual([2026, 2025]);
    expect(findReadingLifeYear(life, 2026)?.months.map((month) => month.monthKey)).toEqual([
      '2026-07',
      '2026-06',
    ]);
    expect(findReadingLifeYear(life, 2025)?.months.map((month) => month.monthKey)).toEqual(['2025-11']);
  });

  it("Recap бере той самий діапазон місяця, що й Reading Life (третій шлях не з'являється)", async () => {
    const db = await openMigratedTestDb();
    await seedMixedHistory(db);

    const life = await buildLifeLikeHook(db);

    for (const [monthKey, anchor] of [
      ['2026-06', new Date(2026, 5, 15)],
      ['2026-07', new Date(2026, 6, 15)],
    ] as const) {
      // `recapRangeOf` — те, чим користується `useReadingRecap`; `findReadingLifeMonth` — те, що
      // показує Reading Life. Якщо колись Recap почне рахувати «свій» місяць, цей тест впаде.
      const fromRecapRange = await summarize(db, recapRangeOf('month', anchor));
      const fromLife = findReadingLifeMonth(life, monthKey);
      expect(fromLife).not.toBeNull();
      expect(fromLife ? comparableMetrics(fromLife.summary) : null).toEqual(
        comparableMetrics(fromRecapRange),
      );
    }
  });

  it("м'яко видалена книга лишається і в Reading Life (та сама History Preservation)", async () => {
    const db = await openMigratedTestDb();
    await seedMixedHistory(db);

    const before = findReadingLifeYear(await buildLifeLikeHook(db), 2026);
    await db.runAsync(`UPDATE user_book SET deleted_at = ? WHERE id = ?`, [
      new Date().toISOString(),
      'p-k',
    ]);
    const after = findReadingLifeYear(await buildLifeLikeHook(db), 2026);

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after ? comparableMetrics(after.summary) : null).toEqual(
      before ? comparableMetrics(before.summary) : undefined,
    );
  });
});

describe('V1.7 parity — СЕЗОН узгоджений із місяцями, з яких складається (Phase 7)', () => {
  it('літо = червень + липень + серпень, без щілин і подвійного рахунку', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'p-s');

    // По сесії в кожному місяці літа + межові випадки на самих краях сезону.
    await seedSession(db, { id: 's1', userBookId: 'p-s', startedAtLocal: new Date(2026, 5, 1, 0, 30), durationSeconds: 1800, startPage: 0, endPage: 20 });
    await seedSession(db, { id: 's2', userBookId: 'p-s', startedAtLocal: new Date(2026, 6, 15, 12, 0), durationSeconds: 3600, startPage: 20, endPage: 60 });
    await seedSession(db, { id: 's3', userBookId: 'p-s', startedAtLocal: new Date(2026, 7, 31, 23, 50), durationSeconds: 1200, startPage: 60, endPage: 75 });
    // Поза сезоном з обох боків — не має потрапити нікуди.
    await seedSession(db, { id: 's4', userBookId: 'p-s', startedAtLocal: new Date(2026, 4, 31, 23, 50), durationSeconds: 600, startPage: 0, endPage: 5 });
    await seedSession(db, { id: 's5', userBookId: 'p-s', startedAtLocal: new Date(2026, 8, 1, 0, 30), durationSeconds: 600, startPage: 75, endPage: 80 });

    await seedFinishedRun(db, { id: 'r1', userBookId: 'p-s', runNumber: 1, finishedAtLocal: new Date(2026, 6, 20, 12, 0) });

    // `monthSpanRange(2026, 6, 3)` — рівно те, чим Сезони будують своє вікно (`seasonDateRange`).
    const season = await summarize(db, monthSpanRange(2026, 6, 3));
    const months = await Promise.all(
      [6, 7, 8].map((month) => summarize(db, monthRangeOf(2026, month))),
    );
    const sum = (pick: (m: (typeof months)[number]) => number) =>
      months.reduce((total, month) => total + pick(month), 0);

    expect(season.sessionCount).toBe(3);
    expect(season.readingMinutes).toBe(sum((m) => m.readingMinutes));
    expect(season.pagesRead).toBe(sum((m) => m.pagesRead));
    expect(season.activeDays).toBe(sum((m) => m.activeDays));
    expect(season.finishedRunCount).toBe(sum((m) => m.finishedRunCount));

    // МЕЖІ: нічне читання 1 червня о 00:30 у сезоні; 31 травня о 23:50 — ні.
    expect(season.activeDayKeys).toEqual(['2026-06-01', '2026-07-15', '2026-08-31']);
  });

  it('зимовий сезон через межу року теж дорівнює сумі своїх місяців', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'p-w');
    await seedSession(db, { id: 's1', userBookId: 'p-w', startedAtLocal: new Date(2026, 11, 20, 12, 0), durationSeconds: 1800, startPage: 0, endPage: 20 });
    await seedSession(db, { id: 's2', userBookId: 'p-w', startedAtLocal: new Date(2027, 0, 1, 0, 30), durationSeconds: 1200, startPage: 20, endPage: 35 });
    await seedSession(db, { id: 's3', userBookId: 'p-w', startedAtLocal: new Date(2027, 1, 10, 12, 0), durationSeconds: 600, startPage: 35, endPage: 40 });

    const season = await summarize(db, monthSpanRange(2026, 12, 3));
    const months = await Promise.all([
      summarize(db, monthRangeOf(2026, 12)),
      summarize(db, monthRangeOf(2027, 1)),
      summarize(db, monthRangeOf(2027, 2)),
    ]);

    expect(season.sessionCount).toBe(3);
    expect(season.readingMinutes).toBe(
      months.reduce((total, month) => total + month.readingMinutes, 0),
    );
    // Новорічна ніч належить зимі 2026/27 і НЕ губиться на межі року.
    expect(season.activeDayKeys).toContain('2027-01-01');
  });
});

describe('V1.7 parity — темп однаковий скрізь, де показується', () => {
  it('темп рахується з тих самих сум, що й показані хвилини/сторінки', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'p-i');
    await seedSession(db, { id: 's1', userBookId: 'p-i', startedAtLocal: new Date(2026, 7, 5, 10, 0), durationSeconds: 3600, startPage: 0, endPage: 60 });

    const summary = await summarize(db, monthRange(new Date(2026, 7, 15)));

    expect(summary.readingMinutes).toBe(60);
    expect(summary.pagesRead).toBe(60);
    expect(summary.pagesPerHour).toBe(60);
  });

  it('без сторінок темп прихований, а не нульовий', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'p-j');
    await seedSession(db, { id: 's1', userBookId: 'p-j', startedAtLocal: new Date(2026, 7, 5, 10, 0), durationSeconds: 3600, startPage: 10, endPage: 10 });

    const summary = await summarize(db, monthRange(new Date(2026, 7, 15)));

    expect(summary.readingMinutes).toBe(60);
    expect(summary.pagesRead).toBe(0);
    expect(summary.pagesPerHour).toBeNull();
  });
});
