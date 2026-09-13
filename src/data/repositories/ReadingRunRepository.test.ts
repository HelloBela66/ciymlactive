import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { ReadingRunRepository } from './ReadingRunRepository';

/**
 * Repository-інтеграційний тест для `ReadingRunRepository` (POLYTSIA V1.6.1, Фаза 6 —
 * REREADING MODEL, `docs/READING_RUN.md`). Той самий підхід (`openTestDatabase()` +
 * `migrateDbIfNeeded`, реальна SQLite), що й в усіх інших repository-тестах.
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

async function seedUserBook(db: SQLiteDatabase, id: string): Promise<void> {
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

describe('ReadingRunRepository.start', () => {
  it('перший run для книги — run_number 1, status in_progress, finishedAt null', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');

    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-1' });

    expect(run.runNumber).toBe(1);
    expect(run.status).toBe('in_progress');
    expect(run.finishedAt).toBeNull();
    expect(run.isLegacyBackfill).toBe(false);

    const fetched = await ReadingRunRepository.getById(db, run.id);
    expect(fetched).toMatchObject({ userBookId: 'ub-1', runNumber: 1, status: 'in_progress' });
  });

  it('другий виклик для тієї самої книги — run_number 2, обидва видно через listByUserBookId', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-2');

    const first = await ReadingRunRepository.start(db, { userBookId: 'ub-2' });
    const second = await ReadingRunRepository.start(db, { userBookId: 'ub-2' });

    expect(first.runNumber).toBe(1);
    expect(second.runNumber).toBe(2);

    const runs = await ReadingRunRepository.listByUserBookId(db, 'ub-2');
    expect(runs.map((r) => r.runNumber)).toEqual([1, 2]);
  });

  it('run_number рахується окремо для кожної книги', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-3a');
    await seedUserBook(db, 'ub-3b');

    await ReadingRunRepository.start(db, { userBookId: 'ub-3a' });
    await ReadingRunRepository.start(db, { userBookId: 'ub-3a' });
    const bFirst = await ReadingRunRepository.start(db, { userBookId: 'ub-3b' });

    expect(bFirst.runNumber).toBe(1);
  });

  it('startedAt можна передати явно (для майбутнього бекфілу Фази 6b)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-4');

    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-4', startedAt: '2025-01-01T00:00:00.000Z' });
    expect(run.startedAt).toBe('2025-01-01T00:00:00.000Z');
  });
});

describe('ReadingRunRepository.getActiveByUserBookId', () => {
  it('немає жодного run — null', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-active0');
    expect(await ReadingRunRepository.getActiveByUserBookId(db, 'ub-active0')).toBeNull();
  });

  it('усі run завершені — null', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-active1');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-active1' });
    await ReadingRunRepository.finish(db, run.id, { status: 'finished' });

    expect(await ReadingRunRepository.getActiveByUserBookId(db, 'ub-active1')).toBeNull();
  });

  it('кілька незавершених run одночасно — активним лишається найновіший, без корупції стану', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-active2');

    const first = await ReadingRunRepository.start(db, { userBookId: 'ub-active2' });
    const second = await ReadingRunRepository.start(db, { userBookId: 'ub-active2' });

    const active = await ReadingRunRepository.getActiveByUserBookId(db, 'ub-active2');
    expect(active?.id).toBe(second.id);
    expect(active?.id).not.toBe(first.id);
  });
});

describe('ReadingRunRepository.finish', () => {
  it('фіксує status і finishedAt', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-fin1');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-fin1' });

    const finished = await ReadingRunRepository.finish(db, run.id, {
      status: 'finished',
      finishedAt: '2025-06-01T00:00:00.000Z',
    });

    expect(finished?.status).toBe('finished');
    expect(finished?.finishedAt).toBe('2025-06-01T00:00:00.000Z');

    const fetched = await ReadingRunRepository.getById(db, run.id);
    expect(fetched?.status).toBe('finished');
  });

  it('повторний виклик — ідемпотентно, не перезаписує вже зафіксований результат', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-fin2');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-fin2' });

    await ReadingRunRepository.finish(db, run.id, { status: 'finished', finishedAt: '2025-01-01T00:00:00.000Z' });
    const second = await ReadingRunRepository.finish(db, run.id, {
      status: 'did_not_finish',
      finishedAt: '2025-02-01T00:00:00.000Z',
    });

    expect(second?.status).toBe('finished');
    expect(second?.finishedAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('неіснуючий id — повертає null, нічого не падає', async () => {
    const db = await openMigratedTestDb();
    const result = await ReadingRunRepository.finish(db, 'no-such-run', { status: 'finished' });
    expect(result).toBeNull();
  });
});

describe('ReadingRunRepository.discard', () => {
  it('м\'яко видаляє run — зникає з getById/listByUserBookId/getActiveByUserBookId', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-disc1');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-disc1' });

    await ReadingRunRepository.discard(db, run.id);

    expect(await ReadingRunRepository.getById(db, run.id)).toBeNull();
    expect(await ReadingRunRepository.listByUserBookId(db, 'ub-disc1')).toEqual([]);
    expect(await ReadingRunRepository.getActiveByUserBookId(db, 'ub-disc1')).toBeNull();
  });

  it('run_number наступного start не перевикористовується після discard', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-disc2');
    const first = await ReadingRunRepository.start(db, { userBookId: 'ub-disc2' });
    await ReadingRunRepository.discard(db, first.id);

    const second = await ReadingRunRepository.start(db, { userBookId: 'ub-disc2' });
    expect(second.runNumber).toBe(2); // не 1 — номери монотонні, навіть крізь видалені рядки.
  });

  it('SOFT-DELETE READINESS (Фаза 26) — ReadingRun несе deletedAt: null для живого run, фізичний рядок і далі позначений deleted_at після discard', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-disc3');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-disc3' });
    expect(run.deletedAt).toBeNull();

    await ReadingRunRepository.discard(db, run.id);

    const raw = await db.getFirstAsync<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM reading_run WHERE id = ?`,
      [run.id],
    );
    expect(raw?.deleted_at).not.toBeNull();
  });
});

describe('ReadingRunRepository — обмеження схеми (019_reading_run.ts)', () => {
  it('видалення user_book каскадно видаляє його reading_run (ON DELETE CASCADE)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-cascade1');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-cascade1' });

    await db.runAsync(`DELETE FROM user_book WHERE id = ?`, ['ub-cascade1']);

    expect(await ReadingRunRepository.getById(db, run.id)).toBeNull();
  });

  it('UNIQUE(user_book_id, run_number) — прямий дубльований INSERT відхиляється', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-unique1');
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO reading_run (id, user_book_id, run_number, status, started_at, finished_at, is_legacy_backfill, created_at, updated_at)
       VALUES (?,?,?,'in_progress',?,NULL,0,?,?)`,
      ['run-a', 'ub-unique1', 1, now, now, now],
    );

    await expect(
      db.runAsync(
        `INSERT INTO reading_run (id, user_book_id, run_number, status, started_at, finished_at, is_legacy_backfill, created_at, updated_at)
         VALUES (?,?,?,'in_progress',?,NULL,0,?,?)`,
        ['run-b', 'ub-unique1', 1, now, now, now],
      ),
    ).rejects.toThrow();
  });
});

/** REREADING MODEL, Фаза 8 (`docs/READING_RUN.md`) — на відміну від `getActiveByUserBookId`
 * (лише `in_progress`), ця вибірка НЕЗАЛЕЖНА від статусу: `BookMemoryRepository` потребує
 * "останній прохід книги" вже ПІСЛЯ того, як він завершився (Фаза 7 `updateStatus` уже
 * зробила run не-`in_progress` на той момент). */
describe('ReadingRunRepository.getLatestByUserBookId', () => {
  it('null, якщо книга взагалі не має жодного run', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-latest1');
    expect(await ReadingRunRepository.getLatestByUserBookId(db, 'ub-latest1')).toBeNull();
  });

  it('повертає найновіший run НЕЗАЛЕЖНО від статусу (finished теж, не лише in_progress)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-latest2');

    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-latest2' });
    await ReadingRunRepository.finish(db, run.id, { status: 'finished' });

    const latest = await ReadingRunRepository.getLatestByUserBookId(db, 'ub-latest2');
    expect(latest?.id).toBe(run.id);
    expect(latest?.status).toBe('finished');
  });

  it('кілька run — обирається найвищий run_number, а не перший/активний', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-latest3');

    const first = await ReadingRunRepository.start(db, { userBookId: 'ub-latest3' });
    await ReadingRunRepository.finish(db, first.id, { status: 'finished' });
    const second = await ReadingRunRepository.start(db, { userBookId: 'ub-latest3' });

    const latest = await ReadingRunRepository.getLatestByUserBookId(db, 'ub-latest3');
    expect(latest?.id).toBe(second.id);
    expect(latest?.runNumber).toBe(2);
  });
});

/** MEMORY HUB HIERARCHY, Фаза 16 (`docs/MEMORY_HUB.md`) — "Перечитання" на `app/memory/index.tsx`
 * потребує глобальний перелік книг, які реально можна порівняти (≥2 `finished` run), той самий
 * поріг, що й `selectComparableRuns` (`useReadingRunsDetail.ts`). */
describe('ReadingRunRepository.listUserBookIdsWithMultipleFinishedRuns', () => {
  it('порожній масив, коли взагалі немає run', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-multi0');
    expect(await ReadingRunRepository.listUserBookIdsWithMultipleFinishedRuns(db)).toEqual([]);
  });

  it('книга з лише одним finished run — не потрапляє в перелік', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-multi1');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-multi1' });
    await ReadingRunRepository.finish(db, run.id, { status: 'finished' });

    expect(await ReadingRunRepository.listUserBookIdsWithMultipleFinishedRuns(db)).toEqual([]);
  });

  it('книга з двома finished run — потрапляє в перелік', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-multi2');
    const first = await ReadingRunRepository.start(db, { userBookId: 'ub-multi2' });
    await ReadingRunRepository.finish(db, first.id, { status: 'finished' });
    const second = await ReadingRunRepository.start(db, { userBookId: 'ub-multi2' });
    await ReadingRunRepository.finish(db, second.id, { status: 'finished' });

    expect(await ReadingRunRepository.listUserBookIdsWithMultipleFinishedRuns(db)).toEqual(['ub-multi2']);
  });

  it('один finished + один in_progress (або did_not_finish) — не рахується як 2 finished', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-multi3');
    const first = await ReadingRunRepository.start(db, { userBookId: 'ub-multi3' });
    await ReadingRunRepository.finish(db, first.id, { status: 'finished' });
    await ReadingRunRepository.start(db, { userBookId: 'ub-multi3' }); // лишається in_progress

    expect(await ReadingRunRepository.listUserBookIdsWithMultipleFinishedRuns(db)).toEqual([]);
  });

  it('м\'яко видалений (discard) finished run не рахується', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-multi4');
    const first = await ReadingRunRepository.start(db, { userBookId: 'ub-multi4' });
    await ReadingRunRepository.finish(db, first.id, { status: 'finished' });
    const second = await ReadingRunRepository.start(db, { userBookId: 'ub-multi4' });
    await ReadingRunRepository.finish(db, second.id, { status: 'finished' });
    await ReadingRunRepository.discard(db, second.id);

    expect(await ReadingRunRepository.listUserBookIdsWithMultipleFinishedRuns(db)).toEqual([]);
  });

  it('серед кількох книг повертає лише ті, що дійсно мають ≥2 finished run', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-multi5a');
    await seedUserBook(db, 'ub-multi5b');

    const aFirst = await ReadingRunRepository.start(db, { userBookId: 'ub-multi5a' });
    await ReadingRunRepository.finish(db, aFirst.id, { status: 'finished' });
    const aSecond = await ReadingRunRepository.start(db, { userBookId: 'ub-multi5a' });
    await ReadingRunRepository.finish(db, aSecond.id, { status: 'finished' });

    const bFirst = await ReadingRunRepository.start(db, { userBookId: 'ub-multi5b' });
    await ReadingRunRepository.finish(db, bFirst.id, { status: 'finished' });

    expect(await ReadingRunRepository.listUserBookIdsWithMultipleFinishedRuns(db)).toEqual(['ub-multi5a']);
  });
});

/**
 * Календар 2.0 (Фаза 19, `docs/CALENDAR_2_0.md`) — `listByIds` пакетно завантажує run'и для
 * "run-aware day details": декілька сесій дня можуть належати різним `reading_run_id`, тож
 * деталі дня запитують їх ОДНИМ IN-запитом замість по одному на сесію.
 */
describe('ReadingRunRepository.listByIds', () => {
  it('порожній список id — порожня Map, без запиту', async () => {
    const db = await openMigratedTestDb();
    expect((await ReadingRunRepository.listByIds(db, [])).size).toBe(0);
  });

  it('повертає Map id → run лише для реально знайдених id', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-batch1');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-batch1' });

    const result = await ReadingRunRepository.listByIds(db, [run.id, 'nonexistent-id']);

    expect(result.size).toBe(1);
    expect(result.get(run.id)).toMatchObject({ userBookId: 'ub-batch1', runNumber: 1 });
    expect(result.has('nonexistent-id')).toBe(false);
  });

  it('м\'яко видалений run не потрапляє в результат', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-batch2');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-batch2' });
    await ReadingRunRepository.discard(db, run.id);

    const result = await ReadingRunRepository.listByIds(db, [run.id]);
    expect(result.has(run.id)).toBe(false);
  });

  it('декілька run різних книг одним викликом', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-batch3a');
    await seedUserBook(db, 'ub-batch3b');
    const runA = await ReadingRunRepository.start(db, { userBookId: 'ub-batch3a' });
    const runB = await ReadingRunRepository.start(db, { userBookId: 'ub-batch3b' });

    const result = await ReadingRunRepository.listByIds(db, [runA.id, runB.id]);
    expect(result.size).toBe(2);
    expect(result.get(runA.id)?.userBookId).toBe('ub-batch3a');
    expect(result.get(runB.id)?.userBookId).toBe('ub-batch3b');
  });
});
