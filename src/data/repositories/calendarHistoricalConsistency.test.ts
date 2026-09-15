import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { UserBookRepository } from './UserBookRepository';
import { ReadingSessionRepository } from './ReadingSessionRepository';
import { ReadingRunRepository } from './ReadingRunRepository';
import { rankBooksForDay } from '@/lib/calendarIntensity';
import { rankTopBooksOfMonth, type MonthSessionForTopBooks } from '@/lib/calendarTopBooks';

/**
 * POLYTSIA FOUNDATION FINAL POLISH — Task C (Calendar Cross-Consistency Regression Coverage).
 *
 * `ReadingRunRepository.test.ts`/`UserBookRepository.test.ts` уже доводять КОЖЕН окремий
 * repository-метод ізольовано (History Preservation Principle тримається для
 * `listWithDetailsByIdsIncludingDeleted` і для `listStartedOrFinishedBetween` кожного окремо).
 * Цього не досить: ТЗ прямо вимагає довести, що РІЗНІ Calendar-проекції (місяць-сітка, деталі
 * дня, місячний підсумок, "Найчастіше цього місяця", start/finish-мітки) НЕ РОЗХОДЯТЬСЯ для
 * ОДНОГО й того самого набору історичної активності — тобто що вони фактично побудовані на
 * СУМІСНІЙ історичній семантиці, а не просто що кожен шматок окремо коректний.
 *
 * Замість React-хук/компонент тесту (Calendar-хуки, `useCalendarSessions.ts`, тримають
 * агрегацію вбудованою прямо в `queryFn`, не експортованою окремими функціями — виносити її
 * окремо означало б архітектурний рефакторинг Календаря, явно заборонений цим ТЗ) — тут
 * напряму викликаються ТІ САМІ repository-методи й ті самі чисті lib-функції
 * (`rankBooksForDay`/`rankTopBooksOfMonth`), у ТОМУ САМОМУ порядку, що й реальні
 * `useMonthCalendarData`/`useDaySessions`/`useMonthSummary` — тобто це тест саме над рівнем
 * "потік даних вище одного маленького helper-а", а не просто повторний виклик одного методу.
 *
 * Друга половина кожного сценарію — контрольна: `UserBookRepository.listAll`/`listByStatus`/
 * `listByIds` (Library-орієнтовані, alive-only) МУСЯТЬ і далі не бачити м'яко видалену книгу —
 * "live library query ≠ historical query" має виконуватись ОДНОЧАСНО з History Preservation,
 * а не замість неї.
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

/** Пряма вставка завершеної сесії читання з керованим `started_at`/тривалістю — той самий
 * підхід прямого INSERT, що й `ReadingRunRepository.test.ts` для `reading_run`, потрібен, бо
 * `ReadingSessionRepository.start`/`finish` фіксують час через `nowIso()`, не приймаючи
 * довільну історичну дату. */
async function seedSession(
  db: SQLiteDatabase,
  params: { id: string; userBookId: string; startedAt: string; durationSeconds: number; startPage?: number; endPage?: number },
): Promise<void> {
  const now = new Date().toISOString();
  const endedAt = new Date(new Date(params.startedAt).getTime() + params.durationSeconds * 1000).toISOString();
  await db.runAsync(
    `INSERT INTO reading_session
       (id, user_book_id, started_at, ended_at, goal_minutes, paused_intervals, start_page, end_page,
        duration_seconds, mood_note, is_edited, created_at, updated_at, deleted_at, reading_run_id)
     VALUES (?,?,?,?,?,'[]',?,?,?,NULL,0,?,?,NULL,NULL)`,
    [
      params.id,
      params.userBookId,
      params.startedAt,
      endedAt,
      null,
      params.startPage ?? 0,
      params.endPage ?? 20,
      params.durationSeconds,
      now,
      now,
    ],
  );
}

const RANGE_START = '2026-03-01T00:00:00.000Z';
const RANGE_END = '2026-04-01T00:00:00.000Z';

/** Відтворює РІВНО той самий агрегаційний крок, що й `useMonthSummary`'s `topBooks` — реальні
 * `sessions`/`bookById`, ті самі `rankTopBooksOfMonth`. */
function buildTopBooks(
  sessions: { userBookId: string; durationSeconds: number | null }[],
  bookById: Map<string, { work: { id: string } }>,
): ReturnType<typeof rankTopBooksOfMonth> {
  const forTopBooks: MonthSessionForTopBooks[] = sessions
    .map((s) => {
      const workId = bookById.get(s.userBookId)?.work.id;
      return workId ? { userBookId: s.userBookId, workId, durationSeconds: s.durationSeconds } : null;
    })
    .filter((s): s is MonthSessionForTopBooks => s !== null);
  return rankTopBooksOfMonth(forTopBooks, 3);
}

describe('Calendar — крос-узгодженість історичних проекцій (Foundation Final Polish, Task C)', () => {
  it(
    'одна книга, прочитана й ЗГОДОМ м\'яко видалена з бібліотеки: сесії (місяць-сітка/деталі дня), ' +
      'start/finish-мітки (ReadingRun) і "Найчастіше цього місяця" лишаються узгоджено видимі, ' +
      'а Library-запити (listAll/listByStatus/listByIds) книгу коректно НЕ бачать',
    async () => {
      const db = await openMigratedTestDb();
      await seedBook(db, 'cb-solo');
      await seedSession(db, {
        id: 'sess-solo',
        userBookId: 'cb-solo',
        startedAt: '2026-03-10T10:00:00.000Z',
        durationSeconds: 1800,
        startPage: 0,
        endPage: 30,
      });
      const run = await ReadingRunRepository.start(db, {
        userBookId: 'cb-solo',
        startedAt: '2026-03-10T10:00:00.000Z',
      });
      await ReadingRunRepository.finish(db, run.id, {
        status: 'finished',
        finishedAt: '2026-03-10T10:30:00.000Z',
      });

      // ДО видалення — базова лінія: усі проекції бачать книгу.
      await UserBookRepository.remove(db, 'cb-solo');

      // 1) Сесії (Month Grid + Day Details джерело) — не залежать від user_book.deleted_at
      //    узагалі (жодного JOIN на user_book), тож лишаються без змін самі по собі.
      const sessions = await ReadingSessionRepository.listStartedBetween(db, RANGE_START, RANGE_END);
      expect(sessions.map((s) => s.id)).toEqual(['sess-solo']);

      // 2) Книжкові деталі для ЦИХ сесій — ІСТОРИЧНА резолюція (IncludingDeleted), так само,
      //    як усередині useMonthCalendarData/useDaySessions/useMonthSummary.
      const bookIds = [...new Set(sessions.map((s) => s.userBookId))];
      const books = await UserBookRepository.listWithDetailsByIdsIncludingDeleted(db, bookIds);
      const bookById = new Map(books.map((b) => [b.id, b]));
      expect(bookById.has('cb-solo')).toBe(true);
      expect(bookById.get('cb-solo')?.work.title).toBe('Книга cb-solo');

      // 3) Day Details ranking (rankBooksForDay) для дня 10 березня — книга й далі присутня.
      const dayRanked = rankBooksForDay(
        sessions.map((s) => ({
          userBookId: s.userBookId,
          durationSeconds: s.durationSeconds,
          startPage: s.startPage,
          endPage: s.endPage,
          startedAt: s.startedAt,
        })),
      );
      expect(dayRanked.map((r) => r.userBookId)).toEqual(['cb-solo']);

      // 4) start/finish-мітки (ReadingRun) — Gap B фікс: run і далі повертається.
      const runs = await ReadingRunRepository.listStartedOrFinishedBetween(db, RANGE_START, RANGE_END);
      expect(runs.map((r) => r.id)).toEqual([run.id]);
      expect(runs[0]?.userBookId).toBe('cb-solo');

      // 5) "Найчастіше цього місяця" (rankTopBooksOfMonth) — Gap A фікс: книга й далі в топі.
      const topBooks = buildTopBooks(sessions, bookById);
      expect(topBooks.map((t) => t.representativeUserBookId)).toEqual(['cb-solo']);
      expect(topBooks[0]?.totalMinutes).toBe(30);

      // 6) КОНТРОЛЬ — Library-орієнтовані запити (alive-only) книгу коректно НЕ бачать: History
      //    Preservation для історичних поверхонь не означає "книга повернулась у бібліотеку".
      expect(await UserBookRepository.listAll(db)).toEqual([]);
      expect(await UserBookRepository.listByStatus(db, 'reading')).toEqual([]);
      expect(await UserBookRepository.listByIds(db, ['cb-solo'])).toEqual([]);
    },
  );

  it(
    'у ТОМУ САМОМУ місяці одна книга лишається живою, а інша — згодом видалена: обидві й далі ' +
      'разом присутні в історичних проекціях, але Library бачить лише живу',
    async () => {
      const db = await openMigratedTestDb();
      await seedBook(db, 'cb-live', 'Жива книга');
      await seedBook(db, 'cb-hist', 'Історична книга');

      await seedSession(db, {
        id: 'sess-live',
        userBookId: 'cb-live',
        startedAt: '2026-03-05T09:00:00.000Z',
        durationSeconds: 600,
      });
      await seedSession(db, {
        id: 'sess-hist',
        userBookId: 'cb-hist',
        startedAt: '2026-03-20T09:00:00.000Z',
        durationSeconds: 1200,
      });

      await UserBookRepository.remove(db, 'cb-hist');

      const sessions = await ReadingSessionRepository.listStartedBetween(db, RANGE_START, RANGE_END);
      expect(sessions.map((s) => s.userBookId).sort()).toEqual(['cb-hist', 'cb-live']);

      const bookIds = [...new Set(sessions.map((s) => s.userBookId))];
      const books = await UserBookRepository.listWithDetailsByIdsIncludingDeleted(db, bookIds);
      const bookById = new Map(books.map((b) => [b.id, b]));
      expect(bookById.has('cb-live')).toBe(true);
      expect(bookById.has('cb-hist')).toBe(true);

      // "Найчастіше цього місяця" бачить ОБИДВІ книги — видалення однієї не витісняє й не
      // перекручує ранжування іншої.
      const topBooks = buildTopBooks(sessions, bookById);
      expect(topBooks.map((t) => t.representativeUserBookId).sort()).toEqual(['cb-hist', 'cb-live']);

      // Library бачить ЛИШЕ живу книгу.
      const libraryBooks = await UserBookRepository.listAll(db);
      expect(libraryBooks.map((b) => b.id)).toEqual(['cb-live']);
    },
  );

  it(
    'перечитування (перший run завершено, другий/повторний run завершено), книгу згодом видалено ' +
      'з бібліотеки — ОБИДВА run-и (і обидві сесії) лишаються видимі в історичних проекціях',
    async () => {
      const db = await openMigratedTestDb();
      await seedBook(db, 'cb-reread', 'Книга для перечитування');

      const firstRun = await ReadingRunRepository.start(db, {
        userBookId: 'cb-reread',
        startedAt: '2026-03-02T08:00:00.000Z',
      });
      await ReadingRunRepository.finish(db, firstRun.id, {
        status: 'finished',
        finishedAt: '2026-03-03T08:00:00.000Z',
      });
      await seedSession(db, {
        id: 'sess-reread-1',
        userBookId: 'cb-reread',
        startedAt: '2026-03-02T08:00:00.000Z',
        durationSeconds: 3600,
      });

      const secondRun = await ReadingRunRepository.start(db, {
        userBookId: 'cb-reread',
        startedAt: '2026-03-25T08:00:00.000Z',
      });
      await ReadingRunRepository.finish(db, secondRun.id, {
        status: 'finished',
        finishedAt: '2026-03-26T08:00:00.000Z',
      });
      await seedSession(db, {
        id: 'sess-reread-2',
        userBookId: 'cb-reread',
        startedAt: '2026-03-25T08:00:00.000Z',
        durationSeconds: 1800,
      });

      await UserBookRepository.remove(db, 'cb-reread');

      // Обидві сесії (обох проходів) лишаються — Календар не втрачає жодного реального run/
      // активності через видалення книги, і НЕ вигадує нову архітектуру ReadingRun (обидва
      // run лишаються окремими рядками, як і були).
      const sessions = await ReadingSessionRepository.listStartedBetween(db, RANGE_START, RANGE_END);
      expect(sessions.map((s) => s.id).sort()).toEqual(['sess-reread-1', 'sess-reread-2']);

      // Обидва start/finish-паттерни (4 події: 2×старт + 2×фініш) лишаються видимі.
      const runs = await ReadingRunRepository.listStartedOrFinishedBetween(db, RANGE_START, RANGE_END);
      expect(runs.map((r) => r.id).sort()).toEqual([firstRun.id, secondRun.id].sort());
      expect(runs.every((r) => r.finishedAt !== null)).toBe(true);

      // Книга й далі коректно НЕ в бібліотеці.
      expect(await UserBookRepository.listAll(db)).toEqual([]);
    },
  );
});
