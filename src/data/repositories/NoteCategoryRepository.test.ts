import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { NoteCategoryRepository } from './NoteCategoryRepository';

/**
 * Repository-інтеграційний тест для `NoteCategoryRepository` (POLYTSIA V1.6.2, #165 — раніше
 * без жодного тесту). Особлива увага — `sortOrder` (MAX(sort_order)+1, скопований ЛИШЕ в
 * межах однієї книги, докладніше коментар у самому репозиторії) і м'яке видалення `remove`
 * (стара нотатка з видаленою категорією й далі має бачити її назву через
 * `listAllByUserBookId`, лише сама категорія зникає з `listActiveByUserBookId`).
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

async function seedUserBook(db: SQLiteDatabase, userBookId: string): Promise<void> {
  const now = new Date().toISOString();
  const workId = `work-${userBookId}`;
  const editionId = `edition-${userBookId}`;
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    workId,
    `Книга ${userBookId}`,
    now,
    now,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [editionId, workId, `Книга ${userBookId}`, 'uk', 'paperback', now, now],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,?,?,?,?)`,
    [userBookId, editionId, 'reading', 0, now, now],
  );
}

describe('NoteCategoryRepository.create — sortOrder', () => {
  it('перша категорія книги отримує sortOrder=0', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');

    const category = await NoteCategoryRepository.create(db, 'ub-1', 'Цитати');
    expect(category.sortOrder).toBe(0);
    expect(category.label).toBe('Цитати');
    expect(category.deletedAt).toBeNull();
  });

  it('наступні категорії тієї самої книги отримують послідовний sortOrder (MAX+1)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');

    const first = await NoteCategoryRepository.create(db, 'ub-1', 'Цитати');
    const second = await NoteCategoryRepository.create(db, 'ub-1', 'Персонажі');
    const third = await NoteCategoryRepository.create(db, 'ub-1', 'Думки');

    expect([first.sortOrder, second.sortOrder, third.sortOrder]).toEqual([0, 1, 2]);
  });

  it('трімить label перед збереженням', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');

    const category = await NoteCategoryRepository.create(db, 'ub-1', '  Цитати  ');
    expect(category.label).toBe('Цитати');
  });

  it('sortOrder рахується ОКРЕМО для кожної книги, а не глобально', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    await seedUserBook(db, 'ub-2');

    await NoteCategoryRepository.create(db, 'ub-1', 'Категорія книги 1 (a)');
    await NoteCategoryRepository.create(db, 'ub-1', 'Категорія книги 1 (b)');
    const firstForBookTwo = await NoteCategoryRepository.create(db, 'ub-2', 'Категорія книги 2');

    expect(firstForBookTwo.sortOrder).toBe(0);
  });
});

describe('NoteCategoryRepository.rename', () => {
  it('оновлює label і трімить нове значення', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    const category = await NoteCategoryRepository.create(db, 'ub-1', 'Старий label');

    await NoteCategoryRepository.rename(db, category.id, '  Новий label  ');

    const [active] = await NoteCategoryRepository.listActiveByUserBookId(db, 'ub-1');
    expect(active?.label).toBe('Новий label');
  });
});

describe('NoteCategoryRepository.remove — м’яке видалення', () => {
  it('зникає з listActiveByUserBookId, але лишається в listAllByUserBookId', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    const kept = await NoteCategoryRepository.create(db, 'ub-1', 'Лишається');
    const removed = await NoteCategoryRepository.create(db, 'ub-1', 'Видаляється');

    await NoteCategoryRepository.remove(db, removed.id);

    const active = await NoteCategoryRepository.listActiveByUserBookId(db, 'ub-1');
    expect(active.map((c) => c.id)).toEqual([kept.id]);

    const all = await NoteCategoryRepository.listAllByUserBookId(db, 'ub-1');
    expect(all.map((c) => c.id).sort()).toEqual([kept.id, removed.id].sort());
    expect(all.find((c) => c.id === removed.id)?.deletedAt).not.toBeNull();
  });
});

describe('NoteCategoryRepository.listActiveByUserBookId / listAllByUserBookId — порядок і ізоляція', () => {
  it('повертає категорії за sortOrder ASC', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    await NoteCategoryRepository.create(db, 'ub-1', 'Перша');
    await NoteCategoryRepository.create(db, 'ub-1', 'Друга');
    await NoteCategoryRepository.create(db, 'ub-1', 'Третя');

    const active = await NoteCategoryRepository.listActiveByUserBookId(db, 'ub-1');
    expect(active.map((c) => c.label)).toEqual(['Перша', 'Друга', 'Третя']);
  });

  it('не показує категорії іншої книги', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    await seedUserBook(db, 'ub-2');
    await NoteCategoryRepository.create(db, 'ub-1', 'Категорія книги 1');
    await NoteCategoryRepository.create(db, 'ub-2', 'Категорія книги 2');

    const forBookOne = await NoteCategoryRepository.listActiveByUserBookId(db, 'ub-1');
    expect(forBookOne.map((c) => c.label)).toEqual(['Категорія книги 1']);
  });

  it('порожній список для книги без категорій', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    expect(await NoteCategoryRepository.listActiveByUserBookId(db, 'ub-1')).toEqual([]);
    expect(await NoteCategoryRepository.listAllByUserBookId(db, 'ub-1')).toEqual([]);
  });
});
