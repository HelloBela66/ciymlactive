import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { DnfReflectionRepository } from './DnfReflectionRepository';

/**
 * Repository-інтеграційний тест для `DnfReflectionRepository` (POLYTSIA V1.6, Фаза 12 — DNF
 * IMPROVEMENT). `dnf_reflection.user_book_id` — UNIQUE (migration 017), і, на відміну від
 * `PreReadingReflectionRepository` (де перший запис — `upsert` від користувача), тут рядок
 * створюється лише через `captureIfMissing` (той самий "автоматичний знімок миті" підхід, що й
 * `started_at`/`finished_at`) — тести перевіряють, що повторний виклик НЕ перезаписує вже
 * зафіксовану сторінку/дату, і що `updateDetails` міняє лише причину/нотатку.
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

const NOW = '2026-01-01T00:00:00.000Z';

async function seedUserBook(db: SQLiteDatabase, id: string, currentPage = 0): Promise<void> {
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
    [id, `${id}-edition`, 'did_not_finish', currentPage, NOW, NOW],
  );
}

describe('DnfReflectionRepository.getByUserBookId', () => {
  it('null, якщо знімка ще немає', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    expect(await DnfReflectionRepository.getByUserBookId(db, 'ub-1')).toBeNull();
  });
});

describe('DnfReflectionRepository.captureIfMissing', () => {
  it('перший виклик створює рядок зі сторінкою і без причини/нотатки', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-2', 120);

    await DnfReflectionRepository.captureIfMissing(db, 'ub-2', 120);

    const reflection = await DnfReflectionRepository.getByUserBookId(db, 'ub-2');
    expect(reflection).not.toBeNull();
    expect(reflection?.page).toBe(120);
    expect(reflection?.reason).toBeNull();
    expect(reflection?.note).toBeNull();
  });

  it('повторний виклик НЕ перезаписує вже зафіксовану сторінку/дату', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-3', 50);

    await DnfReflectionRepository.captureIfMissing(db, 'ub-3', 50);
    const first = await DnfReflectionRepository.getByUserBookId(db, 'ub-3');

    // Книга "просунулась" далі (наприклад, користувач повернувся читати й знову позначив DNF) —
    // повторний виклик captureIfMissing з іншою сторінкою все одно НЕ повинен нічого змінити,
    // бо рядок уже існує.
    await DnfReflectionRepository.captureIfMissing(db, 'ub-3', 200);
    const second = await DnfReflectionRepository.getByUserBookId(db, 'ub-3');

    expect(second?.id).toBe(first?.id);
    expect(second?.page).toBe(50);
    expect(second?.createdAt).toBe(first?.createdAt);
  });
});

describe('DnfReflectionRepository.updateDetails', () => {
  it('оновлює причину й нотатку, не чіпаючи сторінку/дату створення', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-4', 80);
    await DnfReflectionRepository.captureIfMissing(db, 'ub-4', 80);
    const before = await DnfReflectionRepository.getByUserBookId(db, 'ub-4');

    const updated = await DnfReflectionRepository.updateDetails(db, 'ub-4', {
      reason: 'boring',
      note: 'Занадто повільний початок.',
    });

    expect(updated?.reason).toBe('boring');
    expect(updated?.note).toBe('Занадто повільний початок.');
    expect(updated?.page).toBe(80);
    expect(updated?.createdAt).toBe(before?.createdAt);

    const fetched = await DnfReflectionRepository.getByUserBookId(db, 'ub-4');
    expect(fetched?.reason).toBe('boring');
    expect(fetched?.note).toBe('Занадто повільний початок.');
  });

  it('повертає null, якщо рядка для цієї книги ще нема', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-5');

    const result = await DnfReflectionRepository.updateDetails(db, 'ub-5', { reason: 'other', note: null });

    expect(result).toBeNull();
  });
});

describe('DnfReflectionRepository.remove', () => {
  it('видаляє рядок за id, getByUserBookId повертає null після цього', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-6', 10);
    await DnfReflectionRepository.captureIfMissing(db, 'ub-6', 10);
    const reflection = await DnfReflectionRepository.getByUserBookId(db, 'ub-6');

    await DnfReflectionRepository.remove(db, reflection!.id);

    expect(await DnfReflectionRepository.getByUserBookId(db, 'ub-6')).toBeNull();
  });
});

describe('DnfReflectionRepository — cascade delete разом із user_book', () => {
  it('видалення user_book видаляє й знімок DNF (ON DELETE CASCADE)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-7', 30);
    await DnfReflectionRepository.captureIfMissing(db, 'ub-7', 30);

    await db.runAsync(`DELETE FROM user_book WHERE id = ?`, ['ub-7']);

    expect(await DnfReflectionRepository.getByUserBookId(db, 'ub-7')).toBeNull();
  });
});
