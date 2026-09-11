import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { RatingRepository } from './RatingRepository';

/**
 * Repository-інтеграційний тест для `RatingRepository` — перший тест на цей репозиторій
 * (критичний за quality gate POLYTSIA V1.6). `rating.user_book_id` — UNIQUE у схемі
 * (migration 001), тому `upsert` — єдиний спосіб запису: тести перевіряють обидві гілки
 * (insert/update) і те, що id рядка не змінюється при повторному upsert.
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
    [id, `${id}-edition`, 'finished', 0, NOW, NOW],
  );
}

describe('RatingRepository.getByUserBookId', () => {
  it('null, якщо оцінки ще немає', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    expect(await RatingRepository.getByUserBookId(db, 'ub-1')).toBeNull();
  });
});

describe('RatingRepository.upsert — insert і update гілки', () => {
  it('перший виклик створює новий рядок', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-2');

    const rating = await RatingRepository.upsert(db, { userBookId: 'ub-2', value: 4.5, review: 'Дуже добре' });

    expect(rating.value).toBe(4.5);
    expect(rating.review).toBe('Дуже добре');

    const fetched = await RatingRepository.getByUserBookId(db, 'ub-2');
    expect(fetched?.id).toBe(rating.id);
  });

  it('повторний виклик ОНОВЛЮЄ той самий рядок (той самий id), а не створює другий', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-3');

    const first = await RatingRepository.upsert(db, { userBookId: 'ub-3', value: 3, review: null });
    const second = await RatingRepository.upsert(db, { userBookId: 'ub-3', value: 5, review: 'Змінив думку' });

    expect(second.id).toBe(first.id);
    expect(second.value).toBe(5);
    expect(second.review).toBe('Змінив думку');

    const fetched = await RatingRepository.getByUserBookId(db, 'ub-3');
    expect(fetched?.value).toBe(5);
  });

  it('review можна не вказувати — зберігається як null', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-4');

    const rating = await RatingRepository.upsert(db, { userBookId: 'ub-4', value: 2 });
    expect(rating.review).toBeNull();
  });
});

describe('RatingRepository.listByUserBookIds', () => {
  it('повертає Map лише для книг, що МАЮТЬ оцінку — інші відсутні в результаті', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-5');
    await seedUserBook(db, 'ub-6');
    await RatingRepository.upsert(db, { userBookId: 'ub-5', value: 4 });
    // ub-6 без оцінки

    const result = await RatingRepository.listByUserBookIds(db, ['ub-5', 'ub-6']);
    expect(result.size).toBe(1);
    expect(result.get('ub-5')?.value).toBe(4);
    expect(result.has('ub-6')).toBe(false);
  });

  it('порожній масив id повертає порожню Map', async () => {
    const db = await openMigratedTestDb();
    expect((await RatingRepository.listByUserBookIds(db, [])).size).toBe(0);
  });
});

describe('RatingRepository.remove', () => {
  it('видаляє рядок за id, getByUserBookId повертає null після цього', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-7');
    const rating = await RatingRepository.upsert(db, { userBookId: 'ub-7', value: 5 });

    await RatingRepository.remove(db, rating.id);

    expect(await RatingRepository.getByUserBookId(db, 'ub-7')).toBeNull();
  });
});
