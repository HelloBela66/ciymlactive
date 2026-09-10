import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { ReadingGoalRepository } from './ReadingGoalRepository';

/**
 * Repository-інтеграційний тест для `ReadingGoalRepository.getProgress` — перший тест на цей
 * репозиторій (раніше не мав жодного). Написаний разом із фіксом POLYTSIA V1.5, Фаза 15
 * (PERFORMANCE REVIEW): `getProgress` для типів minutes/pages/reading_days раніше вантажив
 * УСІ завершені сесії (`ReadingSessionRepository.listAllCompleted`) і фільтрував по періоду
 * цілі в JS; тепер — `listStartedBetween(periodStart, periodEnd)`, SQL сам звужує вибірку.
 * Тести нижче навмисно приділяють особливу увагу межам періоду `[periodStart, periodEnd)`
 * (сесія рівно на початку періоду — рахується; рівно на кінці — ні), бо це найлегше зламати
 * при переписуванні JS-фільтра на SQL WHERE.
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

async function seedBookWithUserBook(db: SQLiteDatabase, workId: string, userBookId: string): Promise<void> {
  const now = '2026-01-01T00:00:00.000Z';
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    workId,
    `Книга ${workId}`,
    now,
    now,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [`${workId}-edition`, workId, `Книга ${workId}`, 'uk', 'paperback', now, now],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,?,?,?,?)`,
    [userBookId, `${workId}-edition`, 'reading', 0, now, now],
  );
}

let sessionCounter = 0;
async function seedCompletedSession(
  db: SQLiteDatabase,
  userBookId: string,
  params: { startedAt: string; startPage: number; endPage: number; durationSeconds: number },
): Promise<void> {
  sessionCounter += 1;
  const now = '2026-01-01T00:00:00.000Z';
  await db.runAsync(
    `INSERT INTO reading_session (
       id, user_book_id, started_at, ended_at, paused_intervals, start_page, end_page,
       duration_seconds, is_edited, created_at, updated_at
     ) VALUES (?,?,?,?,'[]',?,?,?,0,?,?)`,
    [
      `goal-test-session-${sessionCounter}`,
      userBookId,
      params.startedAt,
      params.startedAt,
      params.startPage,
      params.endPage,
      params.durationSeconds,
      now,
      now,
    ],
  );
}

function minutesGoal(periodStart: string, periodEnd: string, target = 999999) {
  return {
    id: 'goal-minutes',
    type: 'minutes' as const,
    target,
    periodStart,
    periodEnd,
    relatedWorkId: null,
    relatedSeriesId: null,
    status: 'active' as const,
    createdAt: periodStart,
    updatedAt: periodStart,
  };
}

describe('ReadingGoalRepository.getProgress — minutes/pages/reading_days (SQL-звужена вибірка, Фаза 15)', () => {
  const PERIOD_START = '2026-03-01T00:00:00.000Z';
  const PERIOD_END = '2026-04-01T00:00:00.000Z';

  it('рахує лише сесії всередині періоду цілі, ігноруючи сесії до й після нього', async () => {
    const db = await openMigratedTestDb();
    await seedBookWithUserBook(db, 'work-1', 'user_book-1');

    await seedCompletedSession(db, 'user_book-1', {
      startedAt: '2026-02-15T10:00:00.000Z', // до періоду — не рахується
      startPage: 0,
      endPage: 50,
      durationSeconds: 3600,
    });
    await seedCompletedSession(db, 'user_book-1', {
      startedAt: '2026-03-15T10:00:00.000Z', // всередині періоду
      startPage: 50,
      endPage: 80,
      durationSeconds: 1800,
    });
    await seedCompletedSession(db, 'user_book-1', {
      startedAt: '2026-04-15T10:00:00.000Z', // після періоду — не рахується
      startPage: 80,
      endPage: 100,
      durationSeconds: 900,
    });

    const progress = await ReadingGoalRepository.getProgress(db, minutesGoal(PERIOD_START, PERIOD_END));
    expect(progress.current).toBe(30); // лише середня сесія: 1800с = 30хв
  });

  it('межа [periodStart, periodEnd): сесія рівно на початку рахується, рівно на кінці — ні', async () => {
    const db = await openMigratedTestDb();
    await seedBookWithUserBook(db, 'work-1', 'user_book-1');

    await seedCompletedSession(db, 'user_book-1', {
      startedAt: PERIOD_START, // рівно periodStart — включно
      startPage: 0,
      endPage: 10,
      durationSeconds: 600,
    });
    await seedCompletedSession(db, 'user_book-1', {
      startedAt: PERIOD_END, // рівно periodEnd — виключно
      startPage: 10,
      endPage: 20,
      durationSeconds: 600,
    });

    const progress = await ReadingGoalRepository.getProgress(db, minutesGoal(PERIOD_START, PERIOD_END));
    expect(progress.current).toBe(10); // лише перша сесія (600с = 10хв)
  });

  it('type: pages — сума приросту сторінок лише за сесії всередині періоду', async () => {
    const db = await openMigratedTestDb();
    await seedBookWithUserBook(db, 'work-1', 'user_book-1');

    await seedCompletedSession(db, 'user_book-1', {
      startedAt: '2026-03-05T00:00:00.000Z',
      startPage: 0,
      endPage: 40,
      durationSeconds: 1200,
    });
    await seedCompletedSession(db, 'user_book-1', {
      startedAt: '2026-03-20T00:00:00.000Z',
      startPage: 40,
      endPage: 65,
      durationSeconds: 1200,
    });
    await seedCompletedSession(db, 'user_book-1', {
      startedAt: '2026-05-01T00:00:00.000Z', // поза періодом
      startPage: 65,
      endPage: 200,
      durationSeconds: 1200,
    });

    const progress = await ReadingGoalRepository.getProgress(db, {
      ...minutesGoal(PERIOD_START, PERIOD_END),
      type: 'pages',
    });
    expect(progress.current).toBe(65); // 40 + 25, третя сесія (поза періодом) не рахується
  });

  it('type: reading_days — кількість УНІКАЛЬНИХ днів усередині періоду (дві сесії того самого дня = 1)', async () => {
    const db = await openMigratedTestDb();
    await seedBookWithUserBook(db, 'work-1', 'user_book-1');

    await seedCompletedSession(db, 'user_book-1', {
      startedAt: '2026-03-10T08:00:00.000Z',
      startPage: 0,
      endPage: 10,
      durationSeconds: 600,
    });
    await seedCompletedSession(db, 'user_book-1', {
      startedAt: '2026-03-10T20:00:00.000Z', // той самий день, другий сеанс
      startPage: 10,
      endPage: 20,
      durationSeconds: 600,
    });
    await seedCompletedSession(db, 'user_book-1', {
      startedAt: '2026-03-11T08:00:00.000Z', // інший день
      startPage: 20,
      endPage: 30,
      durationSeconds: 600,
    });

    const progress = await ReadingGoalRepository.getProgress(db, {
      ...minutesGoal(PERIOD_START, PERIOD_END),
      type: 'reading_days',
    });
    expect(progress.current).toBe(2);
  });

  it('isComplete: true лише коли current сягнув target', async () => {
    const db = await openMigratedTestDb();
    await seedBookWithUserBook(db, 'work-1', 'user_book-1');

    await seedCompletedSession(db, 'user_book-1', {
      startedAt: '2026-03-10T08:00:00.000Z',
      startPage: 0,
      endPage: 10,
      durationSeconds: 600, // 10 хв
    });

    const belowTarget = await ReadingGoalRepository.getProgress(db, minutesGoal(PERIOD_START, PERIOD_END, 20));
    expect(belowTarget.isComplete).toBe(false);

    const atTarget = await ReadingGoalRepository.getProgress(db, minutesGoal(PERIOD_START, PERIOD_END, 10));
    expect(atTarget.isComplete).toBe(true);
  });

  it('без жодної сесії в періоді повертає current: 0, isComplete: false', async () => {
    const db = await openMigratedTestDb();
    const progress = await ReadingGoalRepository.getProgress(db, minutesGoal(PERIOD_START, PERIOD_END));
    expect(progress).toEqual({ current: 0, target: 999999, isComplete: false });
  });
});

describe('ReadingGoalRepository.getProgress — books_per_year/finish_book (без змін у Фазі 15, побіжна перевірка)', () => {
  it('type: books_per_year рахує книги, завершені в межах періоду за finished_at', async () => {
    const db = await openMigratedTestDb();
    const now = '2026-01-01T00:00:00.000Z';
    await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
      'work-1',
      'Книга 1',
      now,
      now,
    ]);
    await db.runAsync(
      `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['edition-1', 'work-1', 'Книга 1', 'uk', 'paperback', now, now],
    );
    await db.runAsync(
      `INSERT INTO user_book (id, edition_id, status, finished_at, current_page, added_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      ['user_book-1', 'edition-1', 'finished', '2026-06-15T00:00:00.000Z', 300, now, now],
    );

    const goal = {
      id: 'goal-books',
      type: 'books_per_year' as const,
      target: 1,
      periodStart: '2026-01-01T00:00:00.000Z',
      periodEnd: '2027-01-01T00:00:00.000Z',
      relatedWorkId: null,
      relatedSeriesId: null,
      status: 'active' as const,
      createdAt: now,
      updatedAt: now,
    };

    const progress = await ReadingGoalRepository.getProgress(db, goal);
    expect(progress).toEqual({ current: 1, target: 1, isComplete: true });
  });

  it('type: finish_book без relatedWorkId повертає нульовий прогрес, не кидає', async () => {
    const db = await openMigratedTestDb();
    const now = '2026-01-01T00:00:00.000Z';
    const goal = {
      id: 'goal-finish-book',
      type: 'finish_book' as const,
      target: 1,
      periodStart: now,
      periodEnd: now,
      relatedWorkId: null,
      relatedSeriesId: null,
      status: 'active' as const,
      createdAt: now,
      updatedAt: now,
    };

    const progress = await ReadingGoalRepository.getProgress(db, goal);
    expect(progress).toEqual({ current: 0, target: 1, isComplete: false });
  });
});
