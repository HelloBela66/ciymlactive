import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { NoteRepository } from './NoteRepository';

/**
 * Repository-інтеграційний тест для `NoteRepository` — перший спеціальний тестовий файл саме
 * для цього репозиторію (той самий привід, що й у `ReadingSessionRepository.test.ts`, Фаза 9:
 * решта методів досі покривались опосередковано через фічеві хуки/`JournalRepository.test.ts`).
 * Привід з'явитись саме зараз — `setRevisitLater` (ТЗ Фази 11, «ПОВЕРНУТИСЯ ПІЗНІШЕ»), той самий
 * підхід (`openTestDatabase()` + `migrateDbIfNeeded`, реальна SQLite), що й в усіх інших
 * repository-тестах.
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

async function seedUserBook(db: SQLiteDatabase): Promise<void> {
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
    ['user_book-1', 'edition-1', 'reading', 0, now, now],
  );
}

describe('NoteRepository', () => {
  it('create: нова нотатка завжди починається з revisitLater=false (той самий патерн, що й isFavorite)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db);

    const note = await NoteRepository.create(db, { userBookId: 'user_book-1', type: 'thought', text: 'Перша думка' });
    expect(note.revisitLater).toBe(false);

    const [stored] = await NoteRepository.listByUserBookId(db, 'user_book-1');
    expect(stored?.revisitLater).toBe(false);
  });

  it('setRevisitLater(true) позначає нотатку, видиму через listByUserBookId', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db);
    const note = await NoteRepository.create(db, { userBookId: 'user_book-1', type: 'thought', text: 'Повернутись сюди' });

    await NoteRepository.setRevisitLater(db, note.id, true);

    const [stored] = await NoteRepository.listByUserBookId(db, 'user_book-1');
    expect(stored?.revisitLater).toBe(true);
  });

  it('setRevisitLater(false) знімає позначку — повторний виклик коректно перемикає в обидва боки', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db);
    const note = await NoteRepository.create(db, { userBookId: 'user_book-1', type: 'thought', text: 'Туди-сюди' });

    await NoteRepository.setRevisitLater(db, note.id, true);
    await NoteRepository.setRevisitLater(db, note.id, false);

    const [stored] = await NoteRepository.listByUserBookId(db, 'user_book-1');
    expect(stored?.revisitLater).toBe(false);
  });

  it('setRevisitLater не зачіпає isFavorite/reaction тієї самої нотатки', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db);
    const note = await NoteRepository.create(db, { userBookId: 'user_book-1', type: 'thought', text: 'Незалежні прапорці' });

    await NoteRepository.setFavorite(db, note.id, true);
    await NoteRepository.setReaction(db, note.id, 'funny');
    await NoteRepository.setRevisitLater(db, note.id, true);

    const [stored] = await NoteRepository.listByUserBookId(db, 'user_book-1');
    expect(stored?.isFavorite).toBe(true);
    expect(stored?.reaction).toBe('funny');
    expect(stored?.revisitLater).toBe(true);
  });
});
