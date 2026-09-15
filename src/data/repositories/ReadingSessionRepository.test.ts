import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { ReadingSessionRepository } from './ReadingSessionRepository';
import { ReadingProgressRepository } from './ReadingProgressRepository';
import { UserBookRepository } from './UserBookRepository';
import { ReadingRunRepository } from './ReadingRunRepository';

/**
 * Repository-інтеграційний тест для `ReadingSessionRepository.setReadingExperience` (ТЗ
 * Фази 9 — SESSION REFLECTION). Перший спеціальний тестовий файл саме для цього репозиторію —
 * решта його методів досі покривались опосередковано (`ReadingContinuity.test.ts` — Фаза 8,
 * `finish()`/`pause()`/`resume()` — через фічеві хуки); той самий підхід (`openTestDatabase()`
 * + `migrateDbIfNeeded`, реальна SQLite), що й в усіх інших repository-тестах.
 *
 * POLYTSIA V1.6.1, Фаза 5 (`docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 31 — "найважливіша
 * прогалина покриття у всьому списку"): нижче додано ПРЯМІ repository-тести на транзакційну
 * серцевину `start`/`pause`/`resume`/`finish`/`discard`, яких до цієї фази не існувало
 * взагалі (лише опосередковано, через `listLastCompletedByUserBookIds` і
 * `setReadingExperience`). Мінімум сценаріїв — за ТЗ Фази 5: старт створює сесію, "активна"
 * сесія лишається коректною навіть після кількох стартів/discard, крайові випадки
 * pause/resume, атомарність `finish()` (сесія + `user_book.current_page` + `reading_progress`
 * однією транзакцією), обчислення тривалості з урахуванням паузи (в т.ч. паузи, що застала
 * застосунок згорнутим — "background timestamps"), відкат при помилці всередині транзакції,
 * `discard()`, невалідна сторінка, перечитування, м'яко видалена книга.
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

/** Мінімальний work+edition+user_book для тестів сесій нижче — той самий патерн, що й
 * `seedCompletedSession`/`seedThreeBooks` в сусідніх тестових файлах цього репозиторію. */
async function seedUserBook(
  db: SQLiteDatabase,
  params: { id: string; status?: string; currentPage?: number },
): Promise<void> {
  const now = new Date().toISOString();
  const workId = `work-${params.id}`;
  const editionId = `edition-${params.id}`;
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    workId,
    `Книга ${params.id}`,
    now,
    now,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [editionId, workId, `Книга ${params.id}`, 'uk', 'paperback', now, now],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,?,?,?,?)`,
    [params.id, editionId, params.status ?? 'reading', params.currentPage ?? 0, now, now],
  );
}

/** Пряме читання сирого рядка `user_book`, БЕЗ фільтра `deleted_at IS NULL`, який має
 * `UserBookRepository.getById` — потрібно для сценарію "м'яко видалена книга" нижче, де саме
 * поведінка ПІСЛЯ `deleted_at` і є предметом перевірки. */
async function getRawUserBookRow(
  db: SQLiteDatabase,
  id: string,
): Promise<{ current_page: number; deleted_at: string | null } | null> {
  return db.getFirstAsync<{ current_page: number; deleted_at: string | null }>(
    `SELECT current_page, deleted_at FROM user_book WHERE id = ?`,
    [id],
  );
}

describe('ReadingSessionRepository.start (Фаза 5)', () => {
  it('створює сесію з очікуваними полями, видиму одразу через getById/getActiveSession', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-start1' });

    const created = await ReadingSessionRepository.start(db, { userBookId: 'ub-start1', startPage: 12 });

    expect(created.userBookId).toBe('ub-start1');
    expect(created.startPage).toBe(12);
    expect(created.endedAt).toBeNull();
    expect(created.endPage).toBeNull();
    expect(created.durationSeconds).toBeNull();
    expect(created.pausedIntervals).toEqual([]);
    expect(created.goalMinutes).toBeNull();

    const fetched = await ReadingSessionRepository.getById(db, created.id);
    expect(fetched).toMatchObject({ userBookId: 'ub-start1', startPage: 12, endedAt: null });

    const active = await ReadingSessionRepository.getActiveSession(db);
    expect(active?.id).toBe(created.id);
  });

  it('goalMinutes не передано — зберігається null, а не 0/undefined', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-start2' });

    const created = await ReadingSessionRepository.start(db, { userBookId: 'ub-start2', startPage: 0 });
    expect(created.goalMinutes).toBeNull();

    const fetched = await ReadingSessionRepository.getById(db, created.id);
    expect(fetched?.goalMinutes).toBeNull();
  });
});

describe('ReadingSessionRepository.getActiveSession — коректність "активної" сесії (Фаза 5)', () => {
  it('немає жодної сесії — null, без помилки', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-active0' });
    expect(await ReadingSessionRepository.getActiveSession(db)).toBeNull();
  });

  it('всі сесії завершені — null (активної немає)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-active1' });
    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-active1', startPage: 0 });
    await ReadingSessionRepository.finish(db, s.id, { endPage: 10 });

    expect(await ReadingSessionRepository.getActiveSession(db)).toBeNull();
  });

  it('стартувало кілька незавершених сесій — активною лишається найновіша, без корупції стану', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-active2a' });
    await seedUserBook(db, { id: 'ub-active2b' });

    const first = await ReadingSessionRepository.start(db, { userBookId: 'ub-active2a', startPage: 0 });
    const second = await ReadingSessionRepository.start(db, { userBookId: 'ub-active2b', startPage: 0 });

    const active = await ReadingSessionRepository.getActiveSession(db);
    expect(active?.id).toBe(second.id);
    expect(active?.id).not.toBe(first.id);
  });

  it('discard найновішої незавершеної сесії — активною коректно стає попередня, а не null/помилка', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-active3a' });
    await seedUserBook(db, { id: 'ub-active3b' });

    const first = await ReadingSessionRepository.start(db, { userBookId: 'ub-active3a', startPage: 0 });
    const second = await ReadingSessionRepository.start(db, { userBookId: 'ub-active3b', startPage: 0 });

    await ReadingSessionRepository.discard(db, second.id);

    const active = await ReadingSessionRepository.getActiveSession(db);
    expect(active?.id).toBe(first.id);
  });
});

describe('ReadingSessionRepository.pause / resume — крайові випадки (Фаза 5)', () => {
  it('pause додає один відкритий інтервал (resumedAt: null)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-pr1' });
    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-pr1', startPage: 0 });

    await ReadingSessionRepository.pause(db, s.id);

    const fetched = await ReadingSessionRepository.getById(db, s.id);
    expect(fetched?.pausedIntervals).toHaveLength(1);
    expect(fetched?.pausedIntervals[0]?.resumedAt).toBeNull();
  });

  it('повторний pause без проміжного resume — no-op, інтервал не дублюється', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-pr2' });
    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-pr2', startPage: 0 });

    await ReadingSessionRepository.pause(db, s.id);
    await ReadingSessionRepository.pause(db, s.id);
    await ReadingSessionRepository.pause(db, s.id);

    const fetched = await ReadingSessionRepository.getById(db, s.id);
    expect(fetched?.pausedIntervals).toHaveLength(1);
  });

  it('resume закриває останній відкритий інтервал (resumedAt проставляється)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-pr3' });
    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-pr3', startPage: 0 });

    await ReadingSessionRepository.pause(db, s.id);
    await ReadingSessionRepository.resume(db, s.id);

    const fetched = await ReadingSessionRepository.getById(db, s.id);
    expect(fetched?.pausedIntervals).toHaveLength(1);
    expect(fetched?.pausedIntervals[0]?.resumedAt).not.toBeNull();
  });

  it('resume без активної паузи — no-op, інтервали не змінюються', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-pr4' });
    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-pr4', startPage: 0 });

    await ReadingSessionRepository.resume(db, s.id); // ще жодної паузи не було

    const fetched = await ReadingSessionRepository.getById(db, s.id);
    expect(fetched?.pausedIntervals).toEqual([]);
  });

  it('pause і resume на вже завершеній сесії — no-op, стан сесії не змінюється', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-pr5' });
    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-pr5', startPage: 0 });
    await ReadingSessionRepository.finish(db, s.id, { endPage: 20 });

    await ReadingSessionRepository.pause(db, s.id);
    await ReadingSessionRepository.resume(db, s.id);

    const fetched = await ReadingSessionRepository.getById(db, s.id);
    expect(fetched?.pausedIntervals).toEqual([]);
    expect(fetched?.endedAt).not.toBeNull();
  });

  it('pause і resume на неіснуючому id — безпечно повертаються, без помилки', async () => {
    const db = await openMigratedTestDb();
    await expect(ReadingSessionRepository.pause(db, 'no-such-session')).resolves.toBeUndefined();
    await expect(ReadingSessionRepository.resume(db, 'no-such-session')).resolves.toBeUndefined();
  });
});

describe('ReadingSessionRepository.finish — атомарний запис (Фаза 5)', () => {
  it('однією транзакцією оновлює сесію, user_book.current_page і додає reading_progress', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-fin1', currentPage: 5 });
    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-fin1', startPage: 5 });

    const result = await ReadingSessionRepository.finish(db, s.id, { endPage: 42, moodNote: 'чудовий розділ' });

    expect(result?.endedAt).not.toBeNull();
    expect(result?.endPage).toBe(42);
    expect(result?.moodNote).toBe('чудовий розділ');

    const userBook = await UserBookRepository.getById(db, 'ub-fin1');
    expect(userBook?.currentPage).toBe(42);

    const progress = await ReadingProgressRepository.listByUserBookId(db, 'ub-fin1');
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({ sessionId: s.id, page: 42, source: 'session' });
  });

  it('finish на вже завершеній сесії — ідемпотентно, без повторного запису прогресу', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-fin2' });
    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-fin2', startPage: 0 });

    await ReadingSessionRepository.finish(db, s.id, { endPage: 30 });
    const second = await ReadingSessionRepository.finish(db, s.id, { endPage: 99 });

    // Друга спроба нічого не змінює — повертає ту саму, вже завершену сесію (endPage 30, не 99).
    expect(second?.endPage).toBe(30);

    const userBook = await UserBookRepository.getById(db, 'ub-fin2');
    expect(userBook?.currentPage).toBe(30);

    const progress = await ReadingProgressRepository.listByUserBookId(db, 'ub-fin2');
    expect(progress).toHaveLength(1);
  });

  it('finish на неіснуючому id — повертає null, нічого не падає', async () => {
    const db = await openMigratedTestDb();
    const result = await ReadingSessionRepository.finish(db, 'no-such-session', { endPage: 1 });
    expect(result).toBeNull();
  });

  it('відкат при помилці всередині транзакції: жоден з трьох записів не застосовується', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-fin3', currentPage: 7 });
    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-fin3', startPage: 7 });

    const spy = jest
      .spyOn(ReadingProgressRepository, 'recordForSession')
      .mockRejectedValueOnce(new Error('симуляція збою диска'));

    await expect(ReadingSessionRepository.finish(db, s.id, { endPage: 55 })).rejects.toThrow(
      'симуляція збою диска',
    );
    spy.mockRestore();

    // Усі три мутації транзакції відкотились разом — сесія лишилась НЕзавершеною.
    const fetched = await ReadingSessionRepository.getById(db, s.id);
    expect(fetched?.endedAt).toBeNull();
    expect(fetched?.endPage).toBeNull();

    const userBook = await UserBookRepository.getById(db, 'ub-fin3');
    expect(userBook?.currentPage).toBe(7); // не 55 — відкотилось разом із сесією.

    const progress = await ReadingProgressRepository.listByUserBookId(db, 'ub-fin3');
    expect(progress).toHaveLength(0);
  });
});

describe('ReadingSessionRepository.finish — тривалість і паузи, включно з "background timestamps" (Фаза 5)', () => {
  it('віднімає з тривалості паузу, що вже закрита на момент finish', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-dur1' });

    const now = Date.now();
    const startedAt = new Date(now - 10 * 60 * 1000).toISOString(); // сесія почалась 10 хв тому
    const pausedAt = new Date(now - 5 * 60 * 1000).toISOString();
    const resumedAt = new Date(now - 3 * 60 * 1000).toISOString(); // пауза тривала 2 хв

    await db.runAsync(
      `INSERT INTO reading_session (
         id, user_book_id, started_at, ended_at, paused_intervals, start_page, end_page,
         duration_seconds, is_edited, created_at, updated_at
       ) VALUES (?,?,?,NULL,?,?,NULL,NULL,0,?,?)`,
      ['session-dur1', 'ub-dur1', startedAt, JSON.stringify([{ pausedAt, resumedAt }]), 0, startedAt, startedAt],
    );

    const result = await ReadingSessionRepository.finish(db, 'session-dur1', { endPage: 40 });

    // 10 хв загалом мінус 2 хв паузи = 8 хв = 480с; невеликий допуск на реальний час виконання тесту.
    expect(result?.durationSeconds).toBeGreaterThanOrEqual(475);
    expect(result?.durationSeconds).toBeLessThanOrEqual(485);
  });

  it('застосунок згорнуто й не розгорнуто до finish — відкриту паузу тихо закриває моментом ended_at', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-dur2' });

    const now = Date.now();
    const startedAt = new Date(now - 10 * 60 * 1000).toISOString();
    const pausedAt = new Date(now - 3 * 60 * 1000).toISOString(); // пауза ще триває (resumedAt: null)

    await db.runAsync(
      `INSERT INTO reading_session (
         id, user_book_id, started_at, ended_at, paused_intervals, start_page, end_page,
         duration_seconds, is_edited, created_at, updated_at
       ) VALUES (?,?,?,NULL,?,?,NULL,NULL,0,?,?)`,
      ['session-dur2', 'ub-dur2', startedAt, JSON.stringify([{ pausedAt, resumedAt: null }]), 0, startedAt, startedAt],
    );

    const result = await ReadingSessionRepository.finish(db, 'session-dur2', { endPage: 40 });

    // 10 хв загалом мінус ~3 хв відкритої паузи (закритої щойно самим finish) ≈ 7 хв = 420с.
    expect(result?.durationSeconds).toBeGreaterThanOrEqual(415);
    expect(result?.durationSeconds).toBeLessThanOrEqual(425);

    const fetched = await ReadingSessionRepository.getById(db, 'session-dur2');
    expect(fetched?.pausedIntervals[0]?.resumedAt).not.toBeNull(); // паузу закрито, не лишилась "висіти".
  });
});

describe('ReadingSessionRepository.finish — невалідна сторінка (Фаза 5)', () => {
  it('документує реальну поведінку: end_page сесії лишається сирим, а user_book.current_page затискається до 0', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-inv1', currentPage: 10 });
    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-inv1', startPage: 10 });

    const result = await ReadingSessionRepository.finish(db, s.id, { endPage: -5 });

    // Сама сесія й reading_progress зберігають те, що передали (жодного клампа тут немає).
    expect(result?.endPage).toBe(-5);
    const progress = await ReadingProgressRepository.listByUserBookId(db, 'ub-inv1');
    expect(progress[0]?.page).toBe(-5);

    // UserBookRepository.updateCurrentPage окремо захищає лише user_book.current_page (Math.max(0, ...)).
    const userBook = await UserBookRepository.getById(db, 'ub-inv1');
    expect(userBook?.currentPage).toBe(0);
  });
});

describe('ReadingSessionRepository.discard (Фаза 5)', () => {
  it('м\'яко видаляє сесію — зникає з getById і з getActiveSession', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-disc1' });
    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-disc1', startPage: 0 });

    await ReadingSessionRepository.discard(db, s.id);

    expect(await ReadingSessionRepository.getById(db, s.id)).toBeNull();
    expect(await ReadingSessionRepository.getActiveSession(db)).toBeNull();
  });

  it('discard на неіснуючому id — безпечно, без помилки', async () => {
    const db = await openMigratedTestDb();
    await expect(ReadingSessionRepository.discard(db, 'no-such-session')).resolves.toBeUndefined();
  });
});

/**
 * READING RUN CANCEL/DISCARD FIX (POLYTSIA V1.6.2, Фаза 2) — прогалина, яку виявив і зробив
 * реально видимою P0 FIX Фази 1 (`inferStatusForSessionStart`, група тестів вище): до цієї фази
 * `discard()` чіпав ЛИШЕ саму сесію, а run і `user_book.status`, які щойно виставив `start()`,
 * лишались "висіти" назавжди. Тести нижче — саме на нову поведінку: run і статус книги мають
 * відкочуватись, коли скасована сесія була ЄДИНОЮ живою в своєму (ще не завершеному) run, і
 * лишатись недоторканими в усіх інших випадках (реальна історія, а не помилковий старт).
 */
describe('ReadingSessionRepository.discard — відкат run і user_book.status (Фаза 2, V1.6.2)', () => {
  it('скасував єдину сесію щойно створеного run на "want_to_read" → run видалено, статус і started_at повертаються назад', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-disc-wtr', status: 'want_to_read' });

    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-disc-wtr', startPage: 0 });
    const runId = s.readingRunId as string;
    expect((await UserBookRepository.getById(db, 'ub-disc-wtr'))?.status).toBe('reading');

    await ReadingSessionRepository.discard(db, s.id);

    const userBook = await UserBookRepository.getById(db, 'ub-disc-wtr');
    expect(userBook?.status).toBe('want_to_read');
    expect(userBook?.startedAt).toBeNull();
    expect(await ReadingRunRepository.getById(db, runId)).toBeNull();
    expect(await ReadingRunRepository.getActiveByUserBookId(db, 'ub-disc-wtr')).toBeNull();
  });

  it('скасував єдину сесію run, створеного для перечитування на "finished" → run перечитування видалено, статус повертається в "finished" (не "want_to_read") завдяки попередньому завершеному run', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-disc-fin', status: 'finished' });
    // Реалістичний стан: "finished" книга ЗАВЖДИ має позаду реальний завершений run (той самий
    // сетап, що й тест "фінішований → rereading" у групі P0 FIX вище) — інакше status='finished'
    // без жодного run в історії суперечив би самій моделі (`legacy_contradictory_status`).
    const firstRun = await ReadingRunRepository.start(db, { userBookId: 'ub-disc-fin' });
    await ReadingRunRepository.finish(db, firstRun.id, { status: 'finished' });

    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-disc-fin', startPage: 0 });
    expect((await UserBookRepository.getById(db, 'ub-disc-fin'))?.status).toBe('rereading');

    await ReadingSessionRepository.discard(db, s.id);

    const userBook = await UserBookRepository.getById(db, 'ub-disc-fin');
    expect(userBook?.status).toBe('finished');
    const runs = await ReadingRunRepository.listByUserBookId(db, 'ub-disc-fin');
    expect(runs).toHaveLength(1); // лишився лише перший (реальний) run, скасований run №2 видалено
    expect(runs[0]?.id).toBe(firstRun.id);
  });

  it('скасував єдину сесію run, відновленого з "did_not_finish" → run відновлення видалено, статус повертається в "did_not_finish" (не "reading") завдяки попередньому DNF-run', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-disc-dnf', status: 'did_not_finish' });
    const firstRun = await ReadingRunRepository.start(db, { userBookId: 'ub-disc-dnf' });
    await ReadingRunRepository.finish(db, firstRun.id, { status: 'did_not_finish' });

    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-disc-dnf', startPage: 0 });
    expect((await UserBookRepository.getById(db, 'ub-disc-dnf'))?.status).toBe('reading');

    await ReadingSessionRepository.discard(db, s.id);

    const userBook = await UserBookRepository.getById(db, 'ub-disc-dnf');
    expect(userBook?.status).toBe('did_not_finish');
    const runs = await ReadingRunRepository.listByUserBookId(db, 'ub-disc-dnf');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.id).toBe(firstRun.id);
  });

  it('"did_not_finish" БЕЗ жодного run в історії (нетиповий/легасі стан) — скасування єдиного новоствореного run відкочує аж до "want_to_read", а не залишає видуманий DNF без підстави', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-disc-dnf-norun', status: 'did_not_finish' });

    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-disc-dnf-norun', startPage: 0 });
    expect((await UserBookRepository.getById(db, 'ub-disc-dnf-norun'))?.status).toBe('reading');

    await ReadingSessionRepository.discard(db, s.id);

    // Немає жодного живого run, на який можна було б відкотитись — computeStatusAfterRunRemoval
    // чесно повертає 'want_to_read' (докладніше — коментар над функцією), а не вигадує 'did_not_finish'.
    const userBook = await UserBookRepository.getById(db, 'ub-disc-dnf-norun');
    expect(userBook?.status).toBe('want_to_read');
  });

  it('у run лишається ще одна жива сесія — run і статус НЕ чіпаються, видаляється лише скасована сесія', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-disc-multi', status: 'want_to_read' });

    const first = await ReadingSessionRepository.start(db, { userBookId: 'ub-disc-multi', startPage: 0 });
    const runId = first.readingRunId as string;
    const second = await ReadingSessionRepository.start(db, { userBookId: 'ub-disc-multi', startPage: 5 });
    expect(second.readingRunId).toBe(runId); // той самий run (Фаза 7 — без завершення між стартами)

    await ReadingSessionRepository.discard(db, second.id);

    expect(await ReadingSessionRepository.getById(db, first.id)).not.toBeNull(); // перша сесія лишається живою
    const userBook = await UserBookRepository.getById(db, 'ub-disc-multi');
    expect(userBook?.status).toBe('reading'); // не відкотилось — run усе ще активний і має живу сесію
    const run = await ReadingRunRepository.getById(db, runId);
    expect(run?.status).toBe('in_progress'); // run не видалено
  });

  it('run уже завершений (finishedAt проставлено) — це реальна історія, discard сесії його не чіпає', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-disc-done', status: 'reading' });
    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-disc-done', startPage: 0 });
    const runId = s.readingRunId as string;
    await ReadingRunRepository.finish(db, runId, { status: 'finished' });
    // Статус книги свідомо НЕ синхронізуємо вручну тут — тест перевіряє лише що discard() не
    // чіпає вже завершений run/побічно завершені дані, а не повний UpdateStatus-флоу.

    await ReadingSessionRepository.discard(db, s.id);

    const run = await ReadingRunRepository.getById(db, runId);
    expect(run).not.toBeNull(); // run НЕ видалено — фінішований run це вже історія, а не помилковий старт
    expect(run?.status).toBe('finished');
  });

  it('легасі-сесія без reading_run_id (до Фази 7) — discard видаляє лише сесію, без помилки', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-disc-legacy', status: 'reading' });
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO reading_session (
         id, user_book_id, reading_run_id, started_at, ended_at, paused_intervals, start_page, end_page,
         duration_seconds, is_edited, created_at, updated_at
       ) VALUES (?,?,NULL,?,NULL,'[]',?,NULL,NULL,0,?,?)`,
      ['session-disc-legacy', 'ub-disc-legacy', now, 0, now, now],
    );

    await expect(ReadingSessionRepository.discard(db, 'session-disc-legacy')).resolves.toBeUndefined();

    expect(await ReadingSessionRepository.getById(db, 'session-disc-legacy')).toBeNull();
    const userBook = await UserBookRepository.getById(db, 'ub-disc-legacy');
    expect(userBook?.status).toBe('reading'); // легасі-сесія без run — статус книги поза межами цієї функції
  });
});

describe('ReadingSessionRepository — перечитування та м\'яко видалена книга (Фаза 5)', () => {
  it('перечитування (user_book.status = "rereading") — репозиторій сесій до статусу байдужий', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-reread1', status: 'rereading', currentPage: 0 });

    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-reread1', startPage: 0 });
    const result = await ReadingSessionRepository.finish(db, s.id, { endPage: 25 });

    expect(result?.endedAt).not.toBeNull();
    const userBook = await UserBookRepository.getById(db, 'ub-reread1');
    expect(userBook?.currentPage).toBe(25);
    expect(userBook?.status).toBe('rereading');
  });

  it('книгу м\'яко видалено (user_book.deleted_at) посеред сесії — finish() усе одно проходить', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-del1', currentPage: 3 });
    const s = await ReadingSessionRepository.start(db, { userBookId: 'ub-del1', startPage: 3 });

    await UserBookRepository.remove(db, 'ub-del1'); // м'яке видалення — рядок фізично лишається.

    const result = await ReadingSessionRepository.finish(db, s.id, { endPage: 18 });
    expect(result?.endedAt).not.toBeNull();

    // UserBookRepository.getById фільтрує видалені книги — тож книга "зникла" для звичайних
    // read-шляхів, але сирий рядок (і його current_page) фізично не зачеплений ON DELETE CASCADE
    // (це саме м'яке видалення, не DELETE FROM user_book) — finish() його все одно оновлює.
    expect(await UserBookRepository.getById(db, 'ub-del1')).toBeNull();
    const raw = await getRawUserBookRow(db, 'ub-del1');
    expect(raw?.deleted_at).not.toBeNull();
    expect(raw?.current_page).toBe(18);
  });
});

async function seedCompletedSession(db: SQLiteDatabase): Promise<void> {
  const now = new Date().toISOString();
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
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,?,?,?,?)`,
    ['user_book-1', 'edition-1', 'reading', 10, now, now],
  );
  await db.runAsync(
    `INSERT INTO reading_session (
       id, user_book_id, started_at, ended_at, paused_intervals, start_page, end_page,
       duration_seconds, is_edited, created_at, updated_at
     ) VALUES (?,?,?,?,'[]',?,?,?,0,?,?)`,
    ['session-1', 'user_book-1', now, now, 0, 10, 600, now, now],
  );
}

describe('ReadingSessionRepository.setReadingExperience (Фаза 9)', () => {
  it('записує значення, яке потім видно через getById', async () => {
    const db = await openMigratedTestDb();
    await seedCompletedSession(db);

    let session = await ReadingSessionRepository.getById(db, 'session-1');
    expect(session?.readingExperience).toBeNull();

    await ReadingSessionRepository.setReadingExperience(db, 'session-1', 'engaging');

    session = await ReadingSessionRepository.getById(db, 'session-1');
    expect(session?.readingExperience).toBe('engaging');
  });

  it('повторний виклик перезаписує попереднє значення', async () => {
    const db = await openMigratedTestDb();
    await seedCompletedSession(db);

    await ReadingSessionRepository.setReadingExperience(db, 'session-1', 'tense');
    await ReadingSessionRepository.setReadingExperience(db, 'session-1', 'calm');

    const session = await ReadingSessionRepository.getById(db, 'session-1');
    expect(session?.readingExperience).toBe('calm');
  });

  it('value: null повертає поле назад у "без відповіді"', async () => {
    const db = await openMigratedTestDb();
    await seedCompletedSession(db);

    await ReadingSessionRepository.setReadingExperience(db, 'session-1', 'difficult');
    await ReadingSessionRepository.setReadingExperience(db, 'session-1', null);

    const session = await ReadingSessionRepository.getById(db, 'session-1');
    expect(session?.readingExperience).toBeNull();
  });

  it('не чіпає решту полів сесії (endPage/duration/moodNote лишаються ті самі)', async () => {
    const db = await openMigratedTestDb();
    await seedCompletedSession(db);

    await ReadingSessionRepository.setReadingExperience(db, 'session-1', 'easy');

    const session = await ReadingSessionRepository.getById(db, 'session-1');
    expect(session?.endPage).toBe(10);
    expect(session?.durationSeconds).toBe(600);
  });
});

/**
 * REREADING MODEL, Фаза 7 (`docs/READING_RUN.md`) — `start()` тепер ЗАВЖДИ прив'язує сесію до
 * якогось `ReadingRun`: або до вже активного (зазвичай створеного переходом статусу,
 * `UserBookRepository.updateStatus`, Фаза 7), або, якщо активного немає, створює новий сама.
 *
 * P0 FIX (POLYTSIA V1.6.2, Фаза 1) — з цієї фази `start()` ТАКОЖ виставляє коректний
 * `user_book.status` (`inferStatusForSessionStart`, коментар у самому репозиторії), а не лишає
 * його незмінним, як раніше. Група тестів нижче ("статус книги...") перевіряє саме це.
 */
describe("ReadingSessionRepository.start — прив'язка до reading_run (Фаза 7)", () => {
  it('активний run уже існує → сесія прив\'язується до нього, новий НЕ створюється', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-run1' });
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-run1' });

    const session = await ReadingSessionRepository.start(db, { userBookId: 'ub-run1', startPage: 0 });

    expect(session.readingRunId).toBe(run.id);
    const runs = await ReadingRunRepository.listByUserBookId(db, 'ub-run1');
    expect(runs).toHaveLength(1);
  });

  it('активного run немає → створює новий (run_number=1) і прив\'язує сесію до нього', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-run2' });
    expect(await ReadingRunRepository.getActiveByUserBookId(db, 'ub-run2')).toBeNull();

    const session = await ReadingSessionRepository.start(db, { userBookId: 'ub-run2', startPage: 0 });

    expect(session.readingRunId).not.toBeNull();
    const run = await ReadingRunRepository.getById(db, session.readingRunId as string);
    expect(run?.runNumber).toBe(1);
    expect(run?.status).toBe('in_progress');

    const fetched = await ReadingSessionRepository.getById(db, session.id);
    expect(fetched?.readingRunId).toBe(session.readingRunId);
  });

  it('дві сесії підряд без завершення run між ними → обидві належать тому самому run, дубль не створюється', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-run3' });

    const first = await ReadingSessionRepository.start(db, { userBookId: 'ub-run3', startPage: 0 });
    const second = await ReadingSessionRepository.start(db, { userBookId: 'ub-run3', startPage: 5 });

    expect(second.readingRunId).toBe(first.readingRunId);
    const runs = await ReadingRunRepository.listByUserBookId(db, 'ub-run3');
    expect(runs).toHaveLength(1);
  });

  it('P0 FIX (V1.6.2): "want_to_read" → "reading" разом зі стартом нового run, started_at виставляється', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-run4', status: 'want_to_read' });

    await ReadingSessionRepository.start(db, { userBookId: 'ub-run4', startPage: 0 });

    const userBook = await UserBookRepository.getById(db, 'ub-run4');
    expect(userBook?.status).toBe('reading');
    expect(userBook?.startedAt).not.toBeNull();
  });
});

describe('ReadingSessionRepository.start — статус книги узгоджується з run (P0 FIX, POLYTSIA V1.6.2, Фаза 1)', () => {
  it('"finished" → "rereading" (новий run, старт після завершеного прочитання = перечитування)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-p0-1', status: 'finished' });
    await ReadingRunRepository.start(db, { userBookId: 'ub-p0-1' });
    await ReadingRunRepository.finish(db, (await ReadingRunRepository.getActiveByUserBookId(db, 'ub-p0-1'))!.id, {
      status: 'finished',
    });

    const session = await ReadingSessionRepository.start(db, { userBookId: 'ub-p0-1', startPage: 0 });

    const userBook = await UserBookRepository.getById(db, 'ub-p0-1');
    expect(userBook?.status).toBe('rereading');
    const run = await ReadingRunRepository.getById(db, session.readingRunId as string);
    expect(run?.runNumber).toBe(2);
  });

  it('"did_not_finish" → "reading", НЕ "rereading" (продовження, не перечитування — рішення власника продукту), новий run все одно створюється', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-p0-2', status: 'did_not_finish' });

    const session = await ReadingSessionRepository.start(db, { userBookId: 'ub-p0-2', startPage: 0 });

    const userBook = await UserBookRepository.getById(db, 'ub-p0-2');
    expect(userBook?.status).toBe('reading');
    const run = await ReadingRunRepository.getById(db, session.readingRunId as string);
    expect(run?.runNumber).toBe(1); // перший run цієї книги — DNF ще не мав жодного завершеного run до цього
  });

  it('вже "reading" з активним run — статус не міняється, started_at не перезаписується (без "стрибка" дати)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-p0-3', status: 'reading' });
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-p0-3', startedAt: '2020-01-01T00:00:00.000Z' });
    await db.runAsync(`UPDATE user_book SET started_at = ? WHERE id = ?`, ['2020-01-01T00:00:00.000Z', 'ub-p0-3']);

    await ReadingSessionRepository.start(db, { userBookId: 'ub-p0-3', startPage: 0 });

    const userBook = await UserBookRepository.getById(db, 'ub-p0-3');
    expect(userBook?.status).toBe('reading');
    expect(userBook?.startedAt).toBe('2020-01-01T00:00:00.000Z');
    const runs = await ReadingRunRepository.listByUserBookId(db, 'ub-p0-3');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.id).toBe(run.id);
  });

  it('"paused" з активним run №1 — відновлюється в "reading" (не "rereading")', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-p0-4', status: 'paused' });
    await ReadingRunRepository.start(db, { userBookId: 'ub-p0-4' });

    await ReadingSessionRepository.start(db, { userBookId: 'ub-p0-4', startPage: 0 });

    const userBook = await UserBookRepository.getById(db, 'ub-p0-4');
    expect(userBook?.status).toBe('reading');
  });

  it('"paused" з активним run №2+ — відновлюється в "rereading" (це вже повторне прочитання)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-p0-5', status: 'paused' });
    const firstRun = await ReadingRunRepository.start(db, { userBookId: 'ub-p0-5' });
    await ReadingRunRepository.finish(db, firstRun.id, { status: 'finished' });
    await ReadingRunRepository.start(db, { userBookId: 'ub-p0-5' }); // run_number=2, in_progress

    await ReadingSessionRepository.start(db, { userBookId: 'ub-p0-5', startPage: 0 });

    const userBook = await UserBookRepository.getById(db, 'ub-p0-5');
    expect(userBook?.status).toBe('rereading');
  });

  it('дані з "легасі-суперечністю" (finished, але вже DataIntegrityDoctor знайшов би invariant-порушення) більше не виникають після старту сесії', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, { id: 'ub-p0-6', status: 'want_to_read' });

    await ReadingSessionRepository.start(db, { userBookId: 'ub-p0-6', startPage: 0 });

    const userBook = await UserBookRepository.getById(db, 'ub-p0-6');
    const activeRun = await ReadingRunRepository.getActiveByUserBookId(db, 'ub-p0-6');
    // Той самий "суперечність" тест, що runDataIntegrityCheck робить для legacy_contradictory_status:
    // активний run І "читацький" статус мають узгоджуватись, а не суперечити одне одному.
    const bookIsReading = userBook?.status === 'reading' || userBook?.status === 'rereading';
    expect(activeRun).not.toBeNull();
    expect(bookIsReading).toBe(true);
  });
});

/**
 * POLYTSIA V1.6.2, #168 (ANALYTICS PERFORMANCE) — `listRecentCompleted`/
 * `getLifetimeCompletedTotals`/`getLifetimePaceTotals`: нові bounded/SQL-агрегатні методи, що
 * замінили `listAllCompleted(db)` + JS-обчислення в
 * `useOnePicker.ts`/`useStatistics.ts`/`useTbrReality.ts`/`useTomorrowRecommendation.ts`.
 * POLYTSIA V1.7 — два з них (`listByStartedDayKey`/`listDistinctActiveDayKeys`) замінені на
 * `listCompletedStartInstants`, див. коментар нижче.
 * Пряма SQL-вставка `reading_session` (як і `seedSession` в інших тестових файлах цього
 * репозиторію) — жоден repository-метод не приймає довільний `startedAt`/`durationSeconds`,
 * `start()`/`finish()` завжди пишуть `now()`.
 */
describe('ReadingSessionRepository — bounded/агрегатні запити (#168)', () => {
  let sessionCounter = 0;

  async function seedCompletedSessionAt(
    db: SQLiteDatabase,
    params: { userBookId: string; startedAt: string; startPage?: number; endPage?: number | null; durationSeconds?: number | null },
  ): Promise<void> {
    sessionCounter += 1;
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO reading_session (
         id, user_book_id, started_at, ended_at, goal_minutes, paused_intervals,
         start_page, end_page, duration_seconds, mood_note, reading_experience, is_edited,
         created_at, updated_at, reading_run_id
       ) VALUES (?, ?, ?, ?, NULL, '[]', ?, ?, ?, NULL, NULL, 0, ?, ?, NULL)`,
      [
        `test-agg-session-${sessionCounter}`,
        params.userBookId,
        params.startedAt,
        params.startedAt, // ended_at — довільний, не NULL (лише завершені сесії видно нижче)
        params.startPage ?? 0,
        params.endPage ?? null,
        params.durationSeconds ?? null,
        now,
        now,
      ],
    );
  }

  describe('listRecentCompleted', () => {
    it('порожня таблиця — порожній масив', async () => {
      const db = await openMigratedTestDb();
      expect(await ReadingSessionRepository.listRecentCompleted(db, 5)).toEqual([]);
    });

    it('повертає лише останні `limit` сесій, найновіші перші — той самий порядок, що ручне сортування+slice', async () => {
      const db = await openMigratedTestDb();
      await seedUserBook(db, { id: 'ub-recent1' });
      for (let i = 1; i <= 8; i += 1) {
        await seedCompletedSessionAt(db, { userBookId: 'ub-recent1', startedAt: `2026-01-0${i}T10:00:00.000Z` });
      }

      const result = await ReadingSessionRepository.listRecentCompleted(db, 5);

      expect(result.map((s) => s.startedAt)).toEqual([
        '2026-01-08T10:00:00.000Z',
        '2026-01-07T10:00:00.000Z',
        '2026-01-06T10:00:00.000Z',
        '2026-01-05T10:00:00.000Z',
        '2026-01-04T10:00:00.000Z',
      ]);
    });

    it('менше сесій, ніж `limit` — повертає всі наявні, без падіння', async () => {
      const db = await openMigratedTestDb();
      await seedUserBook(db, { id: 'ub-recent2' });
      await seedCompletedSessionAt(db, { userBookId: 'ub-recent2', startedAt: '2026-01-01T10:00:00.000Z' });

      const result = await ReadingSessionRepository.listRecentCompleted(db, 5);

      expect(result).toHaveLength(1);
    });
  });

  /**
   * POLYTSIA V1.7 (`docs/V1_7_TEMPORAL_SEMANTICS.md`) — `listByStartedDayKey` і
   * `listDistinctActiveDayKeys` ВИЛУЧЕНІ разом із їхніми тестами. Обидва робили атрибуцію
   * календарного дня через SQL-підрядок `substr(started_at, 1, 10)`, тобто через UTC-день, тоді
   * як викликач (`useStatistics.ts`) передавав ЛОКАЛЬНИЙ `todayKey` — реальний виробничий баг,
   * через який нічне читання не потрапляло в "сьогодні", а streak рахувався з розбіжних
   * ключів. Замінені на `listCompletedStartInstants` (сирі моменти, день рахує JS у локальному
   * поясі) і `listStartedBetween` (діапазон локальної доби в інстантах).
   *
   * Старі тести не «полагоджені», а свідомо видалені: вони СТВЕРДЖУВАЛИ саме UTC-атрибуцію
   * («повертає лише сесії того самого UTC-дня») — тобто фіксували баговану поведінку як
   * очікувану. Залишати їх означало б зберегти регресійний захист навколо дефекту.
   */
  describe('listCompletedStartInstants', () => {
    it('порожня таблиця — порожній масив', async () => {
      const db = await openMigratedTestDb();
      expect(await ReadingSessionRepository.listCompletedStartInstants(db)).toEqual([]);
    });

    it('повертає моменти початку всіх завершених сесій у хронологічному порядку', async () => {
      const db = await openMigratedTestDb();
      await seedUserBook(db, { id: 'ub-days1' });
      await seedCompletedSessionAt(db, { userBookId: 'ub-days1', startedAt: '2026-02-03T20:00:00.000Z' });
      await seedCompletedSessionAt(db, { userBookId: 'ub-days1', startedAt: '2026-02-01T08:00:00.000Z' });
      await seedCompletedSessionAt(db, { userBookId: 'ub-days1', startedAt: '2026-02-03T08:00:00.000Z' });

      const result = await ReadingSessionRepository.listCompletedStartInstants(db);

      expect(result).toEqual([
        '2026-02-01T08:00:00.000Z',
        '2026-02-03T08:00:00.000Z',
        '2026-02-03T20:00:00.000Z',
      ]);
    });

    it('не включає незавершені й м\'яко видалені сесії', async () => {
      const db = await openMigratedTestDb();
      await seedUserBook(db, { id: 'ub-days2' });
      await seedCompletedSessionAt(db, { userBookId: 'ub-days2', startedAt: '2026-02-05T08:00:00.000Z' });
      await db.runAsync(
        `INSERT INTO reading_session (
           id, user_book_id, started_at, ended_at, goal_minutes, paused_intervals,
           start_page, end_page, duration_seconds, mood_note, reading_experience, is_edited,
           created_at, updated_at, reading_run_id
         ) VALUES ('unfinished-1', 'ub-days2', '2026-02-06T08:00:00.000Z', NULL, NULL, '[]', 0, NULL, NULL, NULL, NULL, 0, '2026-02-06T08:00:00.000Z', '2026-02-06T08:00:00.000Z', NULL)`,
      );

      expect(await ReadingSessionRepository.listCompletedStartInstants(db)).toEqual(['2026-02-05T08:00:00.000Z']);
    });
  });

  describe('getLifetimeCompletedTotals — та сама конвенція округлення хвилин, що й sumSessionMinutes', () => {
    it('порожня таблиця — усі нулі, не помилка на SUM(NULL)', async () => {
      const db = await openMigratedTestDb();
      expect(await ReadingSessionRepository.getLifetimeCompletedTotals(db)).toEqual({
        totalMinutes: 0,
        totalPages: 0,
        totalSessions: 0,
      });
    });

    it('округлює КОЖНУ сесію окремо, тоді сумує (SQL ROUND, не SUM/60) — включно з рівно X.5 межею', async () => {
      const db = await openMigratedTestDb();
      await seedUserBook(db, { id: 'ub-total1' });
      // 90с → round(1.5) = 2; 30с → round(0.5) = 1 — той самий приклад, що й
      // readingAggregates.test.ts#sumSessionMinutes, тепер перевірений через SQL ROUND.
      await seedCompletedSessionAt(db, { userBookId: 'ub-total1', startedAt: '2026-01-01T10:00:00.000Z', durationSeconds: 90 });
      await seedCompletedSessionAt(db, { userBookId: 'ub-total1', startedAt: '2026-01-02T10:00:00.000Z', durationSeconds: 30 });

      const result = await ReadingSessionRepository.getLifetimeCompletedTotals(db);

      expect(result.totalMinutes).toBe(3); // 2 + 1, НЕ round((90+30)/60) = 2
      expect(result.totalSessions).toBe(2);
    });

    it('сторінки — додатна дельта endPage-startPage, обрізана знизу нулем; null endPage — 0', async () => {
      const db = await openMigratedTestDb();
      await seedUserBook(db, { id: 'ub-total2' });
      await seedCompletedSessionAt(db, { userBookId: 'ub-total2', startedAt: '2026-01-01T10:00:00.000Z', startPage: 10, endPage: 25 });
      await seedCompletedSessionAt(db, { userBookId: 'ub-total2', startedAt: '2026-01-02T10:00:00.000Z', startPage: 50, endPage: 40 }); // від'ємна дельта
      await seedCompletedSessionAt(db, { userBookId: 'ub-total2', startedAt: '2026-01-03T10:00:00.000Z', startPage: 5, endPage: null });

      const result = await ReadingSessionRepository.getLifetimeCompletedTotals(db);

      expect(result.totalPages).toBe(15); // 15 + 0 + 0
    });

    it('null durationSeconds не ламає суму (трактується як 0 хвилин)', async () => {
      const db = await openMigratedTestDb();
      await seedUserBook(db, { id: 'ub-total3' });
      await seedCompletedSessionAt(db, { userBookId: 'ub-total3', startedAt: '2026-01-01T10:00:00.000Z', durationSeconds: null });
      await seedCompletedSessionAt(db, { userBookId: 'ub-total3', startedAt: '2026-01-02T10:00:00.000Z', durationSeconds: 600 });

      const result = await ReadingSessionRepository.getLifetimeCompletedTotals(db);

      expect(result.totalMinutes).toBe(10);
      expect(result.totalSessions).toBe(2);
    });
  });

  describe('getLifetimePaceTotals — СИРА конвенція (без округлення на сесію), для computeRollingPace-lifetime', () => {
    it('порожня таблиця — нулі', async () => {
      const db = await openMigratedTestDb();
      expect(await ReadingSessionRepository.getLifetimePaceTotals(db)).toEqual({ totalMinutes: 0, totalPages: 0 });
    });

    it('сумує сирі секунди/60 БЕЗ округлення на кожну сесію (на відміну від getLifetimeCompletedTotals)', async () => {
      const db = await openMigratedTestDb();
      await seedUserBook(db, { id: 'ub-pace1' });
      // 90с (1.5хв) + 30с (0.5хв) = 120с = 2хв рівно — жодного округлення на сесію, тож
      // результат ІНШИЙ за getLifetimeCompletedTotals (там був би 2+1=3, не 2).
      await seedCompletedSessionAt(db, { userBookId: 'ub-pace1', startedAt: '2026-01-01T10:00:00.000Z', durationSeconds: 90 });
      await seedCompletedSessionAt(db, { userBookId: 'ub-pace1', startedAt: '2026-01-02T10:00:00.000Z', durationSeconds: 30 });

      const result = await ReadingSessionRepository.getLifetimePaceTotals(db);

      expect(result.totalMinutes).toBe(2);
    });

    it('сторінки — та сама формула, що й getLifetimeCompletedTotals', async () => {
      const db = await openMigratedTestDb();
      await seedUserBook(db, { id: 'ub-pace2' });
      await seedCompletedSessionAt(db, { userBookId: 'ub-pace2', startedAt: '2026-01-01T10:00:00.000Z', startPage: 10, endPage: 25 });
      await seedCompletedSessionAt(db, { userBookId: 'ub-pace2', startedAt: '2026-01-02T10:00:00.000Z', startPage: 50, endPage: 40 });

      const result = await ReadingSessionRepository.getLifetimePaceTotals(db);

      expect(result.totalPages).toBe(15);
    });
  });
});
