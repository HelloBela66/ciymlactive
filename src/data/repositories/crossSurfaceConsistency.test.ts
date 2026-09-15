import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { summarizeReadingPeriod } from '@/features/reading-period/summarizeReadingPeriod';
import { fetchReadingSeasonData } from '@/features/seasons/useReadingSeason';
import { buildReadingLife, findReadingLifeMonth, findReadingLifeYear } from '@/lib/readingLife';
import { computeStreaks } from '@/lib/streaks';
import { monthRangeOf, yearRangeOf } from '@/lib/readingCalendar';
import { JournalRepository } from './JournalRepository';
import { ReadingRunRepository } from './ReadingRunRepository';
import { ReadingSessionRepository } from './ReadingSessionRepository';
import { UserBookRepository } from './UserBookRepository';

/**
 * POLYTSIA V1.7, Phase 11 — CROSS-SURFACE CONSISTENCY (ТЗ §21).
 *
 * ── ЩО ЦЕ ДОДАЄ ДО `readingPeriodParity.test.ts` ─────────────────────────────────────────────
 * Той тест доводить, що ЛАНЦЮГ періодів узгоджений: тиждень+тиждень = місяць, місяці = рік,
 * сезон = три місяці. Він робить це на однорідних даних.
 *
 * Тут інше й нове: ОДНА багата історія, у якій одночасно є все, що V1.7 навчився розрізняти —
 * legacy-рядки без збереженої дати й нові з нею, перечитування, DNF, записи щоденника, книга,
 * прибрана з Бібліотеки, межі місяця й року. І на ній звіряються ПОВЕРХНІ, а не лише періоди:
 * підсумок періоду, Reading Life, Сезони і денний набір Статистики/streak'ів.
 *
 * ТЗ §21 формулює вимогу точно: «Не вимагай однакового UI. Вимагай однакової historical truth.»
 */

const YEAR = 2027;

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

async function seedBook(
  db: SQLiteDatabase,
  id: string,
  options: { deletedAt?: string | null } = {},
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    `${id}-work`,
    `Книга ${id}`,
    now,
    now,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, page_count, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [`${id}-edition`, `${id}-work`, `Книга ${id}`, 'uk', 'paperback', 300, now, now],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?)`,
    [id, `${id}-edition`, 'finished', 0, now, now, options.deletedAt ?? null],
  );
}

/** `calendarDate: null` → legacy-рядок (після міграції без backfill); рядок → новий. */
async function seedSession(
  db: SQLiteDatabase,
  params: {
    id: string;
    userBookId: string;
    startedAtLocal: Date;
    calendarDate: string | null;
    minutes: number;
    startPage: number;
    endPage: number;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const durationSeconds = params.minutes * 60;
  const startedAt = params.startedAtLocal.toISOString();
  const endedAt = new Date(params.startedAtLocal.getTime() + durationSeconds * 1000).toISOString();
  await db.runAsync(
    `INSERT INTO reading_session
       (id, user_book_id, started_at, ended_at, goal_minutes, paused_intervals, start_page, end_page,
        duration_seconds, mood_note, is_edited, created_at, updated_at, deleted_at, reading_run_id,
        started_calendar_date)
     VALUES (?,?,?,?,NULL,'[]',?,?,?,NULL,0,?,?,NULL,NULL,?)`,
    [
      params.id,
      params.userBookId,
      startedAt,
      endedAt,
      params.startPage,
      params.endPage,
      durationSeconds,
      now,
      now,
      params.calendarDate,
    ],
  );
}

async function seedRun(
  db: SQLiteDatabase,
  params: {
    id: string;
    userBookId: string;
    runNumber: number;
    status: 'finished' | 'did_not_finish';
    finishedAtLocal: Date;
    calendarDate: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const finishedAt = params.finishedAtLocal.toISOString();
  await db.runAsync(
    `INSERT INTO reading_run
       (id, user_book_id, run_number, status, started_at, finished_at, is_legacy_backfill,
        created_at, updated_at, started_calendar_date, finished_calendar_date)
     VALUES (?,?,?,?,?,?,0,?,?,NULL,?)`,
    [
      params.id,
      params.userBookId,
      params.runNumber,
      params.status,
      finishedAt,
      finishedAt,
      now,
      now,
      params.calendarDate,
    ],
  );
}

async function seedNote(
  db: SQLiteDatabase,
  params: { id: string; userBookId: string; createdAtLocal: Date },
): Promise<void> {
  const iso = params.createdAtLocal.toISOString();
  await db.runAsync(
    `INSERT INTO note (id, user_book_id, page, progress_percent, type, text, is_favorite, created_at, updated_at)
     VALUES (?,?,?,NULL,'thought',?,1,?,?)`,
    [params.id, params.userBookId, 10, 'Думка з цієї історії.', iso, iso],
  );
}

/**
 * Одна багата історія на весь файл. Свідомо змішана: `calendarDate: null` — це рядки, що пережили
 * міграцію без backfill, рядки з датою — записані вже після неї.
 */
async function seedRichHistory(db: SQLiteDatabase): Promise<void> {
  await seedBook(db, 'b-main');
  await seedBook(db, 'b-reread');
  await seedBook(db, 'b-dnf');
  // Книга, прибрана з Бібліотеки ПІСЛЯ прочитання — історія має її пам'ятати (ТЗ §61/§19).
  await seedBook(db, 'b-gone', { deletedAt: new Date(YEAR, 11, 1).toISOString() });

  // Лютий — лише legacy-рядки.
  await seedSession(db, { id: 's1', userBookId: 'b-main', startedAtLocal: new Date(YEAR, 1, 10, 9, 0), calendarDate: null, minutes: 30, startPage: 0, endPage: 20 });
  await seedSession(db, { id: 's2', userBookId: 'b-main', startedAtLocal: new Date(YEAR, 1, 11, 9, 0), calendarDate: null, minutes: 45, startPage: 20, endPage: 50 });
  await seedRun(db, { id: 'r1', userBookId: 'b-main', runNumber: 1, status: 'finished', finishedAtLocal: new Date(YEAR, 1, 11, 10, 0), calendarDate: null });

  // Червень — уже нові рядки зі збереженою датою.
  await seedSession(db, { id: 's3', userBookId: 'b-reread', startedAtLocal: new Date(YEAR, 5, 5, 20, 0), calendarDate: `${YEAR}-06-05`, minutes: 60, startPage: 0, endPage: 40 });
  await seedSession(db, { id: 's4', userBookId: 'b-reread', startedAtLocal: new Date(YEAR, 5, 6, 20, 0), calendarDate: `${YEAR}-06-06`, minutes: 20, startPage: 40, endPage: 55 });
  await seedRun(db, { id: 'r2', userBookId: 'b-reread', runNumber: 1, status: 'finished', finishedAtLocal: new Date(YEAR, 5, 6, 21, 0), calendarDate: `${YEAR}-06-06` });
  // Перечитування тієї самої книги — другий завершений прохід.
  await seedRun(db, { id: 'r3', userBookId: 'b-reread', runNumber: 2, status: 'finished', finishedAtLocal: new Date(YEAR, 5, 20, 21, 0), calendarDate: `${YEAR}-06-20` });

  // DNF — окремо, ніколи не в «прочитано».
  await seedRun(db, { id: 'r4', userBookId: 'b-dnf', runNumber: 1, status: 'did_not_finish', finishedAtLocal: new Date(YEAR, 5, 25, 12, 0), calendarDate: `${YEAR}-06-25` });

  // Прибрана книга — прочитана у вересні.
  await seedSession(db, { id: 's5', userBookId: 'b-gone', startedAtLocal: new Date(YEAR, 8, 3, 8, 0), calendarDate: `${YEAR}-09-03`, minutes: 25, startPage: 0, endPage: 18 });
  await seedRun(db, { id: 'r5', userBookId: 'b-gone', runNumber: 1, status: 'finished', finishedAtLocal: new Date(YEAR, 8, 3, 9, 0), calendarDate: `${YEAR}-09-03` });

  // МЕЖА МІСЯЦЯ і МЕЖА РОКУ — по одному рядку кожного виду.
  await seedSession(db, { id: 's6', userBookId: 'b-main', startedAtLocal: new Date(YEAR, 8, 30, 23, 40), calendarDate: `${YEAR}-09-30`, minutes: 15, startPage: 50, endPage: 60 });
  await seedSession(db, { id: 's7', userBookId: 'b-main', startedAtLocal: new Date(YEAR, 11, 31, 23, 30), calendarDate: `${YEAR}-12-31`, minutes: 20, startPage: 60, endPage: 75 });

  await seedNote(db, { id: 'n1', userBookId: 'b-main', createdAtLocal: new Date(YEAR, 1, 10, 9, 30) });
  await seedNote(db, { id: 'n2', userBookId: 'b-reread', createdAtLocal: new Date(YEAR, 5, 5, 20, 30) });
}

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
      finishedCalendarDate: run.finishedCalendarDate,
    })),
    journalInstants,
  });
}

describe('§21 — одна історія, однакова правда на всіх поверхнях', () => {
  it('рік = сума дванадцяти місяців, і legacy-рядки з неї не випадають', async () => {
    const db = await openMigratedTestDb();
    await seedRichHistory(db);

    const year = await summarizeReadingPeriod(db, yearRangeOf(YEAR));
    let minutes = 0;
    let pages = 0;
    let sessions = 0;
    let finished = 0;
    let dnf = 0;
    for (let month = 1; month <= 12; month++) {
      const summary = (await summarizeReadingPeriod(db, monthRangeOf(YEAR, month))).summary;
      minutes += summary.readingMinutes;
      pages += summary.pagesRead;
      sessions += summary.sessionCount;
      finished += summary.finishedRunCount;
      dnf += summary.dnfRunCount;
    }

    expect(minutes).toBe(year.summary.readingMinutes);
    expect(pages).toBe(year.summary.pagesRead);
    expect(sessions).toBe(year.summary.sessionCount);
    expect(finished).toBe(year.summary.finishedRunCount);
    expect(dnf).toBe(year.summary.dnfRunCount);

    // Контроль абсолютних чисел — щоб «узгоджено» не означало «узгоджено на нулях».
    expect(year.summary.sessionCount).toBe(7);
    expect(year.summary.finishedRunCount).toBe(4);
    expect(year.summary.dnfRunCount).toBe(1);
  });

  it('Reading Life і підсумок періоду дають ті самі числа на тій самій історії', async () => {
    const db = await openMigratedTestDb();
    await seedRichHistory(db);

    const life = await buildLifeLikeHook(db);
    const lifeYear = findReadingLifeYear(life, YEAR);
    const yearSummary = (await summarizeReadingPeriod(db, yearRangeOf(YEAR))).summary;

    expect(lifeYear?.summary.readingMinutes).toBe(yearSummary.readingMinutes);
    expect(lifeYear?.summary.pagesRead).toBe(yearSummary.pagesRead);
    expect(lifeYear?.summary.sessionCount).toBe(yearSummary.sessionCount);
    expect(lifeYear?.summary.finishedRunCount).toBe(yearSummary.finishedRunCount);
    expect(lifeYear?.summary.activeDays).toBe(yearSummary.activeDays);

    // І помісячно — включно з лютим, де всі рядки legacy.
    for (const month of [2, 6, 9, 12]) {
      const lifeMonth = findReadingLifeMonth(life, `${YEAR}-${String(month).padStart(2, '0')}`);
      const summary = (await summarizeReadingPeriod(db, monthRangeOf(YEAR, month))).summary;
      expect(lifeMonth?.summary.readingMinutes).toBe(summary.readingMinutes);
      expect(lifeMonth?.summary.sessionCount).toBe(summary.sessionCount);
      expect(lifeMonth?.summary.finishedRunCount).toBe(summary.finishedRunCount);
    }
  });

  it('Сезон дорівнює своїм трьом місяцям на змішаній історії', async () => {
    const db = await openMigratedTestDb();
    await seedRichHistory(db);

    // Літо = червень + липень + серпень.
    const summer = await fetchReadingSeasonData(db, 'summer', YEAR);
    let minutes = 0;
    let completedRuns = 0;
    for (const month of [6, 7, 8]) {
      const summary = (await summarizeReadingPeriod(db, monthRangeOf(YEAR, month))).summary;
      minutes += summary.readingMinutes;
      completedRuns += summary.finishedRunCount;
    }
    expect(summer.totalMinutes).toBe(minutes);
    expect(summer.completedRuns).toBe(completedRuns);
  });

  it('денний набір Статистики збігається з активними днями підсумку періоду', async () => {
    const db = await openMigratedTestDb();
    await seedRichHistory(db);

    // Той самий шлях, яким іде `useStatistics`: дні з репозиторію → `computeStreaks`.
    const allDays = await ReadingSessionRepository.listCompletedCalendarDays(db);
    const yearSummary = (await summarizeReadingPeriod(db, yearRangeOf(YEAR))).summary;

    // Уся історія фікстури — в межах одного року, тож набори мають збігтися повністю.
    expect(allDays).toEqual(yearSummary.activeDayKeys);
    expect(allDays.length).toBe(yearSummary.activeDays);

    // І streak рахується саме з цих днів, а не з якихось власних.
    const { longest } = computeStreaks(allDays, `${YEAR}-12-31`);
    // 10 і 11 лютого — два дні поспіль; 5 і 6 червня — теж; довша серія не виникає.
    expect(longest).toBe(2);
  });

  it('прибрана з Бібліотеки книга лишається в історії всіх поверхонь', async () => {
    const db = await openMigratedTestDb();
    await seedRichHistory(db);

    const september = (await summarizeReadingPeriod(db, monthRangeOf(YEAR, 9))).summary;
    // Вересень: сесія прибраної книги + сесія 30 вересня.
    expect(september.sessionCount).toBe(2);
    expect(september.finishedRunCount).toBe(1);

    const life = await buildLifeLikeHook(db);
    const lifeSeptember = findReadingLifeMonth(life, `${YEAR}-09`);
    expect(lifeSeptember?.summary.finishedRunCount).toBe(1);

    const autumn = await fetchReadingSeasonData(db, 'autumn', YEAR);
    expect(autumn.completedRuns).toBe(1);
  });

  it('перечитування не називається новою книгою, DNF не рахується прочитаним', async () => {
    const db = await openMigratedTestDb();
    await seedRichHistory(db);

    const june = (await summarizeReadingPeriod(db, monthRangeOf(YEAR, 6))).summary;
    // Два завершені проходи однієї книги + жодного DNF у «прочитано».
    expect(june.finishedRunCount).toBe(2);
    expect(june.firstTimeFinishCount).toBe(1);
    expect(june.rereadFinishCount).toBe(1);
    expect(june.dnfRunCount).toBe(1);
    // Але КНИГА — одна: ідентичність за твором, не за проходом.
    expect(june.uniqueFinishedWorkIds).toHaveLength(1);
  });

  it('межа року: сесія 31 грудня 23:30 лишається в цьому році', async () => {
    const db = await openMigratedTestDb();
    await seedRichHistory(db);

    const december = (await summarizeReadingPeriod(db, monthRangeOf(YEAR, 12))).summary;
    const nextYear = (await summarizeReadingPeriod(db, yearRangeOf(YEAR + 1))).summary;
    expect(december.sessionCount).toBe(1);
    expect(nextYear.sessionCount).toBe(0);
  });
});
