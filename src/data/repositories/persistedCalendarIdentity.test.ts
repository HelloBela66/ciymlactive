import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { summarizeReadingPeriod } from '@/features/reading-period/summarizeReadingPeriod';
import {
  monthRange,
  monthRangeOf,
  resolveEventCalendarDate,
  yearRangeOf,
} from '@/lib/readingCalendar';
import { ReadingRunRepository } from './ReadingRunRepository';
import { ReadingSessionRepository } from './ReadingSessionRepository';

/**
 * POLYTSIA V1.7, Phase 11 — ПЕРСИСТЕНТНА КАЛЕНДАРНА ІДЕНТИЧНІСТЬ (ТЗ §9, §14).
 *
 * ── ЯК ТУТ ПЕРЕВІРЯЄТЬСЯ ЗМІНА ПОЯСУ (і чому НЕ підміною поясу) ──────────────────────────────
 * Спокуслива ідея — «перемкнути пояс» усередині тесту. Вона не працює чесно: `TZ` Node читає при
 * старті процесу, а підміна `Date.prototype.getTimezoneOffset` нічого не дає, бо ця функція лише
 * ПОВІДОМЛЯЄ зсув — саму конверсію local↔UTC движок робить власними даними про пояси. Тест із
 * такою підміною виглядав би переконливо й не перевіряв нічого.
 *
 * Тому зміна поясу перевіряється за своїм НАСЛІДКОМ, а він точний: після переїзду локальний день
 * інстанта перестає збігатися зі збереженою датою. Рядки нижче саме такі — збережена дата
 * відрізняється від локального дня свого інстанта в БУДЬ-ЯКОМУ поясі. Якщо запити йдуть за
 * збереженою датою, історія не їде; якщо за інстантом — тест червоний. Це той самий доказ, але
 * детермінований і незалежний від того, під яким `TZ` запущено набір.
 *
 * У продакшні дата й інстант у момент запису, звісно, збігаються — розходяться вони саме потім,
 * і це стан, який тут відтворено напряму.
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

async function seedBook(db: SQLiteDatabase, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    `${id}-work`,
    `Книга ${id}`,
    now,
    now,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [`${id}-edition`, `${id}-work`, `Книга ${id}`, 'uk', 'paperback', now, now],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,?,?,?,?)`,
    [id, `${id}-edition`, 'reading', 0, now, now],
  );
}

/** Legacy-рядок: інстант є, збереженої дати НЕМА — рівно те, що лишилось після міграції без backfill. */
async function seedLegacySession(
  db: SQLiteDatabase,
  params: { id: string; userBookId: string; startedAtLocal: Date; durationSeconds: number; startPage: number; endPage: number },
): Promise<void> {
  const now = new Date().toISOString();
  const startedAt = params.startedAtLocal.toISOString();
  const endedAt = new Date(params.startedAtLocal.getTime() + params.durationSeconds * 1000).toISOString();
  await db.runAsync(
    `INSERT INTO reading_session
       (id, user_book_id, started_at, ended_at, goal_minutes, paused_intervals, start_page, end_page,
        duration_seconds, mood_note, is_edited, created_at, updated_at, deleted_at, reading_run_id,
        started_calendar_date)
     VALUES (?,?,?,?,NULL,'[]',?,?,?,NULL,0,?,?,NULL,NULL,NULL)`,
    [params.id, params.userBookId, startedAt, endedAt, params.startPage, params.endPage, params.durationSeconds, now, now],
  );
}

/** Новий рядок: інстант + збережена дата, як їх записав би репозиторій. */
async function seedModernSession(
  db: SQLiteDatabase,
  params: {
    id: string;
    userBookId: string;
    startedAtLocal: Date;
    calendarDate: string;
    durationSeconds: number;
    startPage: number;
    endPage: number;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const startedAt = params.startedAtLocal.toISOString();
  const endedAt = new Date(params.startedAtLocal.getTime() + params.durationSeconds * 1000).toISOString();
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
      params.durationSeconds,
      now,
      now,
      params.calendarDate,
    ],
  );
}

// ─── ЗАПИС (§5, §6, §7) ───────────────────────────────────────────────────────────────────────

describe('§9 запис — календарна дата фіксується в момент події', () => {
  it('нова сесія зберігає і абсолютний момент, і локальну календарну дату', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'w-1');

    const session = await ReadingSessionRepository.start(db, { userBookId: 'w-1', startPage: 0 });

    expect(session.startedCalendarDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const row = await db.getFirstAsync<{ started_calendar_date: string | null; started_at: string }>(
      `SELECT started_calendar_date, started_at FROM reading_session WHERE id = ?`,
      [session.id],
    );
    expect(row?.started_calendar_date).toBe(session.startedCalendarDate);
    // Абсолютний момент нікуди не подівся — дата його не замінює, а доповнює.
    expect(row?.started_at).toBe(session.startedAt);
  });

  it('новий прохід зберігає дату старту, а завершення — власну дату завершення', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'w-2');

    const run = await ReadingRunRepository.start(db, { userBookId: 'w-2' });
    expect(run.startedCalendarDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(run.finishedCalendarDate).toBeNull();

    const finished = await ReadingRunRepository.finish(db, run.id, { status: 'finished' });
    expect(finished?.finishedCalendarDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const row = await db.getFirstAsync<{ started_calendar_date: string | null; finished_calendar_date: string | null }>(
      `SELECT started_calendar_date, finished_calendar_date FROM reading_run WHERE id = ?`,
      [run.id],
    );
    // ТЗ §14 — старт і фініш стабільні НЕЗАЛЕЖНО: завершення не перезаписує дату старту.
    expect(row?.started_calendar_date).toBe(run.startedCalendarDate);
    expect(row?.finished_calendar_date).toBe(finished?.finishedCalendarDate);
  });

  it('сесія 23:50 → 00:40 належить даті СТАРТУ (ТЗ §5)', async () => {
    const startedAt = new Date(2027, 2, 14, 23, 50).toISOString();
    // Сесія перетинає північ, але календарна дата береться зі старту — і тільки з нього.
    expect(resolveEventCalendarDate('2027-03-14', startedAt)).toBe('2027-03-14');
    const endedAt = new Date(2027, 2, 15, 0, 40).toISOString();
    expect(resolveEventCalendarDate('2027-03-14', endedAt)).toBe('2027-03-14');
  });
});

// ─── ЗМІНА ПОЯСУ — головна причина існування §9 ───────────────────────────────────────────────

describe('§9 зміна поясу — нова історія більше не їде', () => {
  it('подія, створена в поясі A, лишається в тому самому дні в поясі B', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'w-tz');

    /**
     * Стан ПІСЛЯ переїзду: подію записано як «1 червня», а локальний день її інстанта тепер
     * 31 травня (полудень UTC 31 травня — це 31 травня в будь-якому реальному поясі, тож тест
     * детермінований і під `TZ=UTC`, і під `TZ=Europe/Kyiv`).
     */
    await seedModernSession(db, {
      id: 's-tz',
      userBookId: 'w-tz',
      startedAtLocal: new Date(Date.UTC(2027, 4, 31, 12, 0)),
      calendarDate: '2027-06-01',
      durationSeconds: 1800,
      startPage: 0,
      endPage: 20,
    });

    const june = await summarizeReadingPeriod(db, monthRangeOf(2027, 6));
    const may = await summarizeReadingPeriod(db, monthRangeOf(2027, 5));

    // Читацький день зафіксований — червень його не втрачає, травень не забирає.
    expect(june.summary.sessionCount).toBe(1);
    expect(june.summary.activeDayKeys).toEqual(['2027-06-01']);
    expect(may.summary.sessionCount).toBe(0);
  });

  it('legacy-рядок у тій самій ситуації ЇДЕ — і це задокументована поведінка, не баг', async () => {
    /**
     * Саме цього §9 і не може виправити: для старого рядка справжній пояс невідомий, тож день
     * відновлюється з поточного. Тест фіксує це явно, щоб поведінка була свідомою, а не
     * випадковою — і щоб було видно різницю між legacy reconstructed attribution і persisted truth.
     */
    const db = await openMigratedTestDb();
    await seedBook(db, 'w-legacy-tz');
    await seedLegacySession(db, {
      id: 's-legacy-tz',
      userBookId: 'w-legacy-tz',
      startedAtLocal: new Date(Date.UTC(2027, 4, 31, 12, 0)),
      durationSeconds: 1800,
      startPage: 0,
      endPage: 20,
    });

    const june = await summarizeReadingPeriod(db, monthRangeOf(2027, 6));
    const may = await summarizeReadingPeriod(db, monthRangeOf(2027, 5));
    // Рядок потрапляє рівно в один місяць — у який саме, залежить від поясу виконання тесту.
    expect(june.summary.sessionCount + may.summary.sessionCount).toBe(1);
  });
});

// ─── ЗМІШАНА ІСТОРІЯ (§9 SQL, §14) ────────────────────────────────────────────────────────────

describe('§9 змішана історія — legacy не зникає після міграції', () => {
  it('нові й старі рядки рахуються разом у місяці, тижні й році', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'w-mix');

    // Обидві сесії — 10 і 20 серпня 2027, але одна legacy, друга з persisted date.
    await seedLegacySession(db, {
      id: 's-old',
      userBookId: 'w-mix',
      startedAtLocal: new Date(2027, 7, 10, 10, 0),
      durationSeconds: 1800,
      startPage: 0,
      endPage: 20,
    });
    await seedModernSession(db, {
      id: 's-new',
      userBookId: 'w-mix',
      startedAtLocal: new Date(2027, 7, 20, 10, 0),
      calendarDate: '2027-08-20',
      durationSeconds: 900,
      startPage: 20,
      endPage: 30,
    });

    const august = await summarizeReadingPeriod(db, monthRange(new Date(2027, 7, 15)));
    expect(august.summary.sessionCount).toBe(2);
    expect(august.summary.readingMinutes).toBe(45);
    expect(august.summary.activeDayKeys).toEqual(['2027-08-10', '2027-08-20']);

    const year = await summarizeReadingPeriod(db, yearRangeOf(2027));
    expect(year.summary.sessionCount).toBe(2);
  });

  it('МЕЖА МІСЯЦЯ тримається для обох видів рядків', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'w-edge');
    await seedLegacySession(db, {
      id: 's-edge-legacy',
      userBookId: 'w-edge',
      startedAtLocal: new Date(2027, 7, 31, 23, 50),
      durationSeconds: 600,
      startPage: 0,
      endPage: 5,
    });
    await seedModernSession(db, {
      id: 's-edge-new',
      userBookId: 'w-edge',
      startedAtLocal: new Date(2027, 8, 1, 0, 20),
      calendarDate: '2027-09-01',
      durationSeconds: 600,
      startPage: 5,
      endPage: 10,
    });

    const august = await summarizeReadingPeriod(db, monthRangeOf(2027, 8));
    const september = await summarizeReadingPeriod(db, monthRangeOf(2027, 9));
    expect(august.summary.sessionCount).toBe(1);
    expect(september.summary.sessionCount).toBe(1);
  });

  it('МЕЖА РОКУ: 1 січня за збереженою датою лишається в своєму році', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'w-ny');
    // Записано як «1 січня 2028»; локальний день інстанта — 31 грудня 2027 у будь-якому поясі.
    await seedModernSession(db, {
      id: 's-ny',
      userBookId: 'w-ny',
      startedAtLocal: new Date(Date.UTC(2027, 11, 31, 12, 0)),
      calendarDate: '2028-01-01',
      durationSeconds: 600,
      startPage: 0,
      endPage: 5,
    });

    // Межа року — найдорожча помилка такого роду: рік читання не повинен змінюватись від переїзду.
    const y2028 = await summarizeReadingPeriod(db, yearRangeOf(2028));
    const y2027 = await summarizeReadingPeriod(db, yearRangeOf(2027));
    expect(y2028.summary.sessionCount).toBe(1);
    expect(y2027.summary.sessionCount).toBe(0);
  });
});

// ─── LEGACY FALLBACK (§8) ─────────────────────────────────────────────────────────────────────

describe('§8 правило читання — збережена дата перша, legacy другим', () => {
  it('є збережена дата → вона канонічна, момент не перевизначає її', () => {
    expect(resolveEventCalendarDate('2027-06-01', new Date(2027, 4, 31, 21, 30).toISOString())).toBe(
      '2027-06-01',
    );
  });

  it('немає збереженої дати → день відновлюється з моменту', () => {
    const instant = new Date(2027, 7, 10, 10, 0).toISOString();
    expect(resolveEventCalendarDate(null, instant)).toBe('2027-08-10');
    expect(resolveEventCalendarDate(undefined, instant)).toBe('2027-08-10');
  });
});

// ─── BACKUP ROUND-TRIP (§12) ──────────────────────────────────────────────────────────────────

describe('§12 backup — збережені дати переживають round-trip', () => {
  it('дата після export → restore не змінилась', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'w-bk');
    await seedModernSession(db, {
      id: 's-bk',
      userBookId: 'w-bk',
      startedAtLocal: new Date(2027, 7, 20, 10, 0),
      calendarDate: '2027-08-20',
      durationSeconds: 900,
      startPage: 0,
      endPage: 10,
    });

    // `BackupRepository` вивантажує `SELECT *` і відновлює за `Object.keys(row)`, тож нові
    // колонки проходять в обидва боки без окремого коду. Тест перевіряє саме це, а не мапінг.
    const exported = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM reading_session`);
    expect(exported[0]?.started_calendar_date).toBe('2027-08-20');

    await db.runAsync(`DELETE FROM reading_session WHERE id = ?`, ['s-bk']);
    const columns = Object.keys(exported[0] ?? {});
    await db.runAsync(
      `INSERT INTO reading_session (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
      columns.map((c) => (exported[0]?.[c] ?? null) as string | number | null),
    );

    const restored = await db.getFirstAsync<{ started_calendar_date: string | null }>(
      `SELECT started_calendar_date FROM reading_session WHERE id = ?`,
      ['s-bk'],
    );
    expect(restored?.started_calendar_date).toBe('2027-08-20');
  });

  it('старий бекап без нових колонок лишається сумісним', async () => {
    // Відновлення рядка БЕЗ `started_calendar_date` — саме те, що станеться зі старим файлом.
    const db = await openMigratedTestDb();
    await seedBook(db, 'w-old-bk');
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO reading_session
         (id, user_book_id, started_at, ended_at, paused_intervals, start_page, end_page,
          duration_seconds, is_edited, created_at, updated_at)
       VALUES (?,?,?,?,'[]',?,?,?,0,?,?)`,
      [
        's-old-bk',
        'w-old-bk',
        new Date(2027, 7, 12, 10, 0).toISOString(),
        new Date(2027, 7, 12, 10, 30).toISOString(),
        0,
        20,
        1800,
        now,
        now,
      ],
    );

    const august = await summarizeReadingPeriod(db, monthRangeOf(2027, 8));
    expect(august.summary.sessionCount).toBe(1);
    expect(august.summary.activeDayKeys).toEqual(['2027-08-12']);
  });
});
