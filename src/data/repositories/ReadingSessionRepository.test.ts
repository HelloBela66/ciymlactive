import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { ReadingSessionRepository } from './ReadingSessionRepository';

/**
 * Repository-інтеграційний тест для `ReadingSessionRepository.setReadingExperience` (ТЗ
 * Фази 9 — SESSION REFLECTION). Перший спеціальний тестовий файл саме для цього репозиторію —
 * решта його методів досі покривались опосередковано (`ReadingContinuity.test.ts` — Фаза 8,
 * `finish()`/`pause()`/`resume()` — через фічеві хуки); той самий підхід (`openTestDatabase()`
 * + `migrateDbIfNeeded`, реальна SQLite), що й в усіх інших repository-тестах.
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

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
