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
