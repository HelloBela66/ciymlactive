import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { PreReadingReflectionRepository } from './PreReadingReflectionRepository';

/**
 * Repository-інтеграційний тест для `PreReadingReflectionRepository` (POLYTSIA V1.6, Фаза 6 —
 * «До/Після»). `pre_reading_reflection.user_book_id` — UNIQUE у схемі (migration 014), тому
 * `upsert` — єдиний спосіб запису: тести перевіряють обидві гілки (insert/update), що id рядка
 * не змінюється при повторному upsert, і cascade-видалення разом із `user_book` (той самий
 * набір, що й `RatingRepository.test.ts`/`CapsuleRecallRepository.test.ts`).
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

describe('PreReadingReflectionRepository.getByUserBookId', () => {
  it('null, якщо нотатки ще немає', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    expect(await PreReadingReflectionRepository.getByUserBookId(db, 'ub-1')).toBeNull();
  });
});

describe('PreReadingReflectionRepository.upsert — insert і update гілки', () => {
  it('перший виклик створює новий рядок', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-2');

    const reflection = await PreReadingReflectionRepository.upsert(db, {
      userBookId: 'ub-2',
      reasonText: 'Порадили друзі',
      expectationText: 'Чекаю щось легке',
      expectedRating: 4,
    });

    expect(reflection.reasonText).toBe('Порадили друзі');
    expect(reflection.expectationText).toBe('Чекаю щось легке');
    expect(reflection.expectedRating).toBe(4);

    const fetched = await PreReadingReflectionRepository.getByUserBookId(db, 'ub-2');
    expect(fetched?.id).toBe(reflection.id);
  });

  it('повторний виклик ОНОВЛЮЄ той самий рядок (той самий id), а не створює другий', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-3');

    const first = await PreReadingReflectionRepository.upsert(db, {
      userBookId: 'ub-3',
      reasonText: 'Причина 1',
      expectationText: null,
      expectedRating: null,
    });
    const second = await PreReadingReflectionRepository.upsert(db, {
      userBookId: 'ub-3',
      reasonText: 'Причина 2',
      expectationText: 'Тепер і очікування',
      expectedRating: 5,
    });

    expect(second.id).toBe(first.id);
    expect(second.reasonText).toBe('Причина 2');
    expect(second.expectationText).toBe('Тепер і очікування');
    expect(second.expectedRating).toBe(5);

    const fetched = await PreReadingReflectionRepository.getByUserBookId(db, 'ub-3');
    expect(fetched?.reasonText).toBe('Причина 2');
  });

  it('created_at НЕ змінюється при повторному upsert — лишається "миттю ДО читання"', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-4');

    const first = await PreReadingReflectionRepository.upsert(db, {
      userBookId: 'ub-4',
      reasonText: 'Причина',
      expectationText: null,
      expectedRating: null,
    });
    const second = await PreReadingReflectionRepository.upsert(db, {
      userBookId: 'ub-4',
      reasonText: 'Змінена причина',
      expectationText: null,
      expectedRating: null,
    });

    expect(second.createdAt).toBe(first.createdAt);
  });

  it('усі текстові поля можна лишити null — валідні тільки з expectedRating', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-5');

    const reflection = await PreReadingReflectionRepository.upsert(db, {
      userBookId: 'ub-5',
      reasonText: null,
      expectationText: null,
      expectedRating: 3.5,
    });

    expect(reflection.reasonText).toBeNull();
    expect(reflection.expectationText).toBeNull();
    expect(reflection.expectedRating).toBe(3.5);
  });
});

describe('PreReadingReflectionRepository.remove', () => {
  it('видаляє рядок за id, getByUserBookId повертає null після цього', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-6');
    const reflection = await PreReadingReflectionRepository.upsert(db, {
      userBookId: 'ub-6',
      reasonText: 'Причина',
      expectationText: null,
      expectedRating: null,
    });

    await PreReadingReflectionRepository.remove(db, reflection.id);

    expect(await PreReadingReflectionRepository.getByUserBookId(db, 'ub-6')).toBeNull();
  });
});

describe('PreReadingReflectionRepository — cascade delete разом із user_book', () => {
  it('видалення user_book видаляє й нотатку "До читання" (ON DELETE CASCADE)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-7');
    await PreReadingReflectionRepository.upsert(db, {
      userBookId: 'ub-7',
      reasonText: 'Причина',
      expectationText: null,
      expectedRating: null,
    });

    await db.runAsync(`DELETE FROM user_book WHERE id = ?`, ['ub-7']);

    expect(await PreReadingReflectionRepository.getByUserBookId(db, 'ub-7')).toBeNull();
  });
});
