import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { ReadingSessionRepository } from './ReadingSessionRepository';
import { JournalRepository } from './JournalRepository';

/**
 * Repository-інтеграційні тести для двох batch-методів READING CONTINUITY (POLYTSIA V1.5,
 * Фаза 8 — картка "Зараз читаєш" на Home): `ReadingSessionRepository.listLastCompletedByUserBookIds`
 * і `JournalRepository.listLatestByUserBookIds`. Та сама інфраструктура (`openTestDatabase()`/
 * `migrateDbIfNeeded`, реальна SQLite), що й `JournalRepository.test.ts`/`PersonalSearch.test.ts`.
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

// user_book-1 — дві завершені сесії (перевірка "лишається найновіша"), дві нотатки.
// user_book-2 — одна сесія, одна цитата.
// user_book-3 — узагалі без сесій/записів щоденника (перевірка "гарної деградації": книга
// лишається поза результатом, а не з'являється в Map з `null`-полями чи падає з помилкою).
const D1 = '2026-01-01T09:00:00.000Z';
const D1E = '2026-01-01T09:30:00.000Z'; // 30 хв, 0 → 15 стор.
const D2 = '2026-02-01T09:00:00.000Z';
const D2E = '2026-02-01T09:37:00.000Z'; // 37 хв, 15 → 39 стор. (найновіша сесія user_book-1)
const D3 = '2026-03-01T09:00:00.000Z';
const D3E = '2026-03-01T09:10:00.000Z'; // 10 хв, 0 → 5 стор.

async function seedThreeBooks(db: SQLiteDatabase): Promise<void> {
  for (const n of [1, 2, 3] as const) {
    await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
      `work-${n}`,
      `Книга ${n}`,
      D1,
      D1,
    ]);
    await db.runAsync(
      `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at, page_count) VALUES (?,?,?,?,?,?,?,?)`,
      [`edition-${n}`, `work-${n}`, `Книга ${n}`, 'uk', 'paperback', D1, D1, 300],
    );
    await db.runAsync(
      `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,?,?,?,?)`,
      [`user_book-${n}`, `edition-${n}`, 'reading', 0, D1, D1],
    );
  }

  // user_book-1: дві завершені сесії.
  await db.runAsync(
    `INSERT INTO reading_session (id, user_book_id, started_at, ended_at, paused_intervals, start_page, end_page, duration_seconds, is_edited, created_at, updated_at)
     VALUES (?,?,?,?,'[]',?,?,?,0,?,?)`,
    ['session-1a', 'user_book-1', D1, D1E, 0, 15, 1800, D1, D1E],
  );
  await db.runAsync(
    `INSERT INTO reading_session (id, user_book_id, started_at, ended_at, paused_intervals, start_page, end_page, duration_seconds, is_edited, created_at, updated_at)
     VALUES (?,?,?,?,'[]',?,?,?,0,?,?)`,
    ['session-1b', 'user_book-1', D2, D2E, 15, 39, 2220, D2, D2E],
  );

  // user_book-2: одна завершена сесія.
  await db.runAsync(
    `INSERT INTO reading_session (id, user_book_id, started_at, ended_at, paused_intervals, start_page, end_page, duration_seconds, is_edited, created_at, updated_at)
     VALUES (?,?,?,?,'[]',?,?,?,0,?,?)`,
    ['session-2a', 'user_book-2', D3, D3E, 0, 5, 600, D3, D3E],
  );

  // user_book-1: дві нотатки, друга новіша.
  await db.runAsync(
    `INSERT INTO note (id, user_book_id, type, text, tags, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    ['note-1a', 'user_book-1', 'thought', 'Перша думка про книгу 1.', '[]', D1, D1],
  );
  await db.runAsync(
    `INSERT INTO note (id, user_book_id, type, text, tags, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    ['note-1b', 'user_book-1', 'thought', 'Друга, новіша думка про книгу 1.', '[]', D2, D2],
  );

  // user_book-2: одна цитата.
  await db.runAsync(
    `INSERT INTO quote (id, user_book_id, edition_id, text, comment, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    ['quote-2a', 'user_book-2', 'edition-2', 'Єдина цитата книги 2.', null, D3, D3],
  );

  // user_book-3: жодної сесії/запису — навмисно.
}

describe('READING CONTINUITY — batch-методи (Фаза 8)', () => {
  it('ReadingSessionRepository.listLastCompletedByUserBookIds: лишає найновішу сесію на книгу', async () => {
    const db = await openMigratedTestDb();
    await seedThreeBooks(db);

    const result = await ReadingSessionRepository.listLastCompletedByUserBookIds(db, [
      'user_book-1',
      'user_book-2',
      'user_book-3',
    ]);

    expect(result.size).toBe(2); // user_book-3 узагалі без сесій — відсутній у Map.
    expect(result.get('user_book-1')).toMatchObject({
      id: 'session-1b',
      startedAt: D2,
      durationSeconds: 2220,
      startPage: 15,
      endPage: 39,
    });
    expect(result.get('user_book-2')).toMatchObject({ id: 'session-2a', durationSeconds: 600 });
    expect(result.has('user_book-3')).toBe(false);
  });

  it('ReadingSessionRepository.listLastCompletedByUserBookIds: порожній масив id — порожній результат без запиту', async () => {
    const db = await openMigratedTestDb();
    await seedThreeBooks(db);

    const result = await ReadingSessionRepository.listLastCompletedByUserBookIds(db, []);
    expect(result.size).toBe(0);
  });

  it('JournalRepository.listLatestByUserBookIds: лишає найновіший note/quote на книгу', async () => {
    const db = await openMigratedTestDb();
    await seedThreeBooks(db);

    const result = await JournalRepository.listLatestByUserBookIds(db, [
      'user_book-1',
      'user_book-2',
      'user_book-3',
    ]);

    expect(result.size).toBe(2);
    expect(result.get('user_book-1')).toMatchObject({ id: 'note-1b', text: 'Друга, новіша думка про книгу 1.' });
    expect(result.get('user_book-2')).toMatchObject({ id: 'quote-2a', kind: 'quote' });
    expect(result.has('user_book-3')).toBe(false);
  });

  it('JournalRepository.listLatestByUserBookIds: порожній масив id — порожній результат без запиту', async () => {
    const db = await openMigratedTestDb();
    await seedThreeBooks(db);

    const result = await JournalRepository.listLatestByUserBookIds(db, []);
    expect(result.size).toBe(0);
  });
});
