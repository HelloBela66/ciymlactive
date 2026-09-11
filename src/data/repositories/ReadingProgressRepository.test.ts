import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { ReadingProgressRepository } from './ReadingProgressRepository';

/**
 * Repository-інтеграційний тест для `ReadingProgressRepository` — перший тест на цей
 * репозиторій (критичний за quality gate POLYTSIA V1.6). Це незмінний журнал прогресу
 * (docs/DATABASE.md): кожен запис лишається назавжди, навіть якщо сторінка пізніше
 * "відкочується". Тести перевіряють обидва джерела запису (`session`/`manual`),
 * хронологічний порядок і те, що книги не змішуються між собою.
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

const NOW = '2026-01-01T00:00:00.000Z';

async function seedUserBook(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    `${id}-work`,
    `Книга ${id}`,
    NOW,
    NOW,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [`${id}-edition`, `${id}-work`, `Книга ${id}`, 'uk', 'paperback', NOW, NOW],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,?,?,?,?)`,
    [id, `${id}-edition`, 'reading', 0, NOW, NOW],
  );
}

async function seedSession(db: SQLiteDatabase, id: string, userBookId: string, startedAt: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO reading_session (id, user_book_id, started_at, start_page, paused_intervals, is_edited, created_at, updated_at)
     VALUES (?,?,?,0,'[]',0,?,?)`,
    [id, userBookId, startedAt, NOW, NOW],
  );
}

describe('ReadingProgressRepository.recordForSession / recordManual', () => {
  it('recordForSession: створює запис з source="session" і прив\'язаним sessionId', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    await seedSession(db, 'session-1', 'ub-1', '2026-03-01T10:00:00.000Z');

    await ReadingProgressRepository.recordForSession(db, { userBookId: 'ub-1', sessionId: 'session-1', page: 42 });

    const list = await ReadingProgressRepository.listByUserBookId(db, 'ub-1');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ userBookId: 'ub-1', sessionId: 'session-1', page: 42, source: 'session' });
  });

  it('recordManual: створює запис з source="manual" і sessionId=null', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-2');

    await ReadingProgressRepository.recordManual(db, { userBookId: 'ub-2', page: 100 });

    const list = await ReadingProgressRepository.listByUserBookId(db, 'ub-2');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ userBookId: 'ub-2', sessionId: null, page: 100, source: 'manual' });
  });
});

describe('ReadingProgressRepository.listByUserBookId — хронологічний порядок, ізоляція між книгами, append-only', () => {
  it('повертає записи в порядку зростання recorded_at, незалежно від порядку вставки', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-3');

    // Вставляємо у зворотньому хронологічному порядку навмисно.
    await db.runAsync(
      `INSERT INTO reading_progress (id, user_book_id, session_id, page, recorded_at, source, created_at) VALUES (?,?,?,?,?,?,?)`,
      ['p-late', 'ub-3', null, 90, '2026-03-10T00:00:00.000Z', 'manual', NOW],
    );
    await db.runAsync(
      `INSERT INTO reading_progress (id, user_book_id, session_id, page, recorded_at, source, created_at) VALUES (?,?,?,?,?,?,?)`,
      ['p-early', 'ub-3', null, 10, '2026-03-01T00:00:00.000Z', 'manual', NOW],
    );

    const list = await ReadingProgressRepository.listByUserBookId(db, 'ub-3');
    expect(list.map((p) => p.id)).toEqual(['p-early', 'p-late']);
  });

  it('не змішує записи різних книг', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-4');
    await seedUserBook(db, 'ub-5');

    await ReadingProgressRepository.recordManual(db, { userBookId: 'ub-4', page: 5 });
    await ReadingProgressRepository.recordManual(db, { userBookId: 'ub-5', page: 200 });

    expect(await ReadingProgressRepository.listByUserBookId(db, 'ub-4')).toHaveLength(1);
    expect(await ReadingProgressRepository.listByUserBookId(db, 'ub-5')).toHaveLength(1);
  });

  it('append-only: повторний запис тієї самої сторінки не замінює попередній, обидва лишаються', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-6');

    await ReadingProgressRepository.recordManual(db, { userBookId: 'ub-6', page: 50 });
    await ReadingProgressRepository.recordManual(db, { userBookId: 'ub-6', page: 50 });

    const list = await ReadingProgressRepository.listByUserBookId(db, 'ub-6');
    expect(list).toHaveLength(2);
  });

  it('без жодного запису повертає порожній масив', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-7');
    expect(await ReadingProgressRepository.listByUserBookId(db, 'ub-7')).toEqual([]);
  });
});
