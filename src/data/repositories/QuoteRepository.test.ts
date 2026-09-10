import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { QuoteRepository } from './QuoteRepository';

/**
 * Repository-інтеграційний тест для `QuoteRepository` — той самий привід і той самий підхід,
 * що й у щойно доданому `NoteRepository.test.ts`: перший спеціальний тестовий файл саме для
 * цього репозиторію, з приводу `setRevisitLater` (ТЗ Фази 11, «ПОВЕРНУТИСЯ ПІЗНІШЕ»).
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

describe('QuoteRepository', () => {
  it('create: нова цитата завжди починається з revisitLater=false (той самий патерн, що й isFavorite)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db);

    const quote = await QuoteRepository.create(db, {
      userBookId: 'user_book-1',
      editionId: 'edition-1',
      text: 'Перша цитата',
    });
    expect(quote.revisitLater).toBe(false);

    const [stored] = await QuoteRepository.listByUserBookId(db, 'user_book-1');
    expect(stored?.revisitLater).toBe(false);
  });

  it('setRevisitLater(true) позначає цитату, видиму через listByUserBookId', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db);
    const quote = await QuoteRepository.create(db, {
      userBookId: 'user_book-1',
      editionId: 'edition-1',
      text: 'Повернутись сюди',
    });

    await QuoteRepository.setRevisitLater(db, quote.id, true);

    const [stored] = await QuoteRepository.listByUserBookId(db, 'user_book-1');
    expect(stored?.revisitLater).toBe(true);
  });

  it('setRevisitLater(false) знімає позначку — повторний виклик коректно перемикає в обидва боки', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db);
    const quote = await QuoteRepository.create(db, {
      userBookId: 'user_book-1',
      editionId: 'edition-1',
      text: 'Туди-сюди',
    });

    await QuoteRepository.setRevisitLater(db, quote.id, true);
    await QuoteRepository.setRevisitLater(db, quote.id, false);

    const [stored] = await QuoteRepository.listByUserBookId(db, 'user_book-1');
    expect(stored?.revisitLater).toBe(false);
  });

  it('setRevisitLater не зачіпає isFavorite/reaction тієї самої цитати', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db);
    const quote = await QuoteRepository.create(db, {
      userBookId: 'user_book-1',
      editionId: 'edition-1',
      text: 'Незалежні прапорці',
    });

    await QuoteRepository.setFavorite(db, quote.id, true);
    await QuoteRepository.setReaction(db, quote.id, 'favorite');
    await QuoteRepository.setRevisitLater(db, quote.id, true);

    const [stored] = await QuoteRepository.listByUserBookId(db, 'user_book-1');
    expect(stored?.isFavorite).toBe(true);
    expect(stored?.reaction).toBe('favorite');
    expect(stored?.revisitLater).toBe(true);
  });
});
