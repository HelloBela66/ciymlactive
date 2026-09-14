import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { ShelfRepository } from './ShelfRepository';
import { UserBookRepository } from './UserBookRepository';

/**
 * Repository-інтеграційний тест (той самий підхід, що й `PublisherRepository.test.ts` —
 * `migrateDbIfNeeded` проти реальної `:memory:` SQLite, не вручну написаний `CREATE TABLE`).
 *
 * POLYTSIA V1.6.1, Фаза 28 (re-audit) — знайдений тут реальний баг (не заплановане ТЗ): `bookCount`
 * у `listAll`/`search` рахував РЯДКИ `shelf_book`, а не живі книги. `UserBookRepository.remove`
 * робить м'яке видалення (`deleted_at`) і НІКОЛИ не чистить `shelf_book` (немає `ON DELETE
 * CASCADE` на м'яке видалення — лише на жорстке видалення самої полиці, `ShelfRepository.
 * remove`), тож полиця, що колись мала прибрану з бібліотеки книгу, показувала завищений
 * лічильник — розбіжність із `listBooksByShelf` (через `UserBookRepository.
 * listWithDetailsByIds`), яка такі книги коректно не показує.
 */
async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

async function seedUserBook(db: SQLiteDatabase, id: string): Promise<void> {
  const t0 = '2026-01-01T00:00:00.000Z';
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    `${id}-work`,
    `Книга ${id}`,
    t0,
    t0,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [`${id}-edition`, `${id}-work`, `Книга ${id}`, 'uk', 'paperback', t0, t0],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,'want_to_read',0,?,?)`,
    [id, `${id}-edition`, t0, t0],
  );
}

describe('ShelfRepository.listAll — лічильник книг (bookCount)', () => {
  it('рахує лише живі книги полиці, не рахує книгу, прибрану з бібліотеки (Фаза 28, знайдений баг)', async () => {
    const db = await openMigratedTestDb();
    const shelf = await ShelfRepository.create(db, 'До відпустки');
    await seedUserBook(db, 'ub-live');
    await seedUserBook(db, 'ub-removed');
    await ShelfRepository.addBook(db, shelf.id, 'ub-live');
    await ShelfRepository.addBook(db, shelf.id, 'ub-removed');

    // Ще до видалення — полиця показує обидві книги.
    const beforeRemoval = await ShelfRepository.listAll(db);
    expect(beforeRemoval.find((s) => s.id === shelf.id)?.bookCount).toBe(2);

    // `UserBookRepository.remove` — те саме м'яке видалення, що й з екрана "Деталі книги"
    // ("Прибрати з бібліотеки"); `shelf_book`-рядок для 'ub-removed' свідомо НЕ чиститься.
    await UserBookRepository.remove(db, 'ub-removed');

    const afterRemoval = await ShelfRepository.listAll(db);
    const shelfAfter = afterRemoval.find((s) => s.id === shelf.id);
    expect(shelfAfter?.bookCount).toBe(1);

    // Лічильник узгоджений із тим, що реально показує сама полиця при відкритті.
    const booksOnShelf = await ShelfRepository.listBooksByShelf(db, shelf.id);
    expect(booksOnShelf).toHaveLength(shelfAfter?.bookCount ?? -1);
  });

  it('полиця без жодної книги — bookCount 0 (LEFT JOIN не перетворився на INNER)', async () => {
    const db = await openMigratedTestDb();
    const shelf = await ShelfRepository.create(db, 'Порожня полиця');

    const shelves = await ShelfRepository.listAll(db);
    expect(shelves.find((s) => s.id === shelf.id)?.bookCount).toBe(0);
  });
});

describe('ShelfRepository.search — той самий фікс лічильника, що й listAll', () => {
  it('не рахує прибрану з бібліотеки книгу в результатах пошуку', async () => {
    const db = await openMigratedTestDb();
    const shelf = await ShelfRepository.create(db, 'Фентезі 2026');
    await seedUserBook(db, 'ub-search-live');
    await seedUserBook(db, 'ub-search-removed');
    await ShelfRepository.addBook(db, shelf.id, 'ub-search-live');
    await ShelfRepository.addBook(db, shelf.id, 'ub-search-removed');
    await UserBookRepository.remove(db, 'ub-search-removed');

    const results = await ShelfRepository.search(db, 'Фентезі');
    expect(results.find((s) => s.id === shelf.id)?.bookCount).toBe(1);
  });
});
