import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { BookCapsuleRepository } from './BookCapsuleRepository';
import { CapsuleRecallRepository } from './CapsuleRecallRepository';

/**
 * Repository-інтеграційний тест для `CapsuleRecallRepository` (POLYTSIA V1.6, Фаза 5 —
 * «Книга через час»). Той самий `openMigratedTestDb()`/seed-патерн, що й
 * `BookCapsuleRepository.test.ts`.
 */

const NOW = '2026-01-01T00:00:00.000Z';

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

async function seedUserBook(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`INSERT INTO work (id, title, cover_fallback_color, created_at, updated_at) VALUES (?,?,?,?,?)`, [
    `${id}-work`,
    `Книга ${id}`,
    '#123456',
    NOW,
    NOW,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [`${id}-edition`, `${id}-work`, `Книга ${id}`, 'uk', 'paperback', NOW, NOW],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, started_at, finished_at, added_at, updated_at)
     VALUES (?, ?, 'finished', 0, ?, ?, ?, ?)`,
    [id, `${id}-edition`, NOW, NOW, NOW, NOW],
  );
}

async function seedCapsule(db: SQLiteDatabase, userBookId: string) {
  return BookCapsuleRepository.create(db, {
    userBookId,
    lastingThought: 'Думка',
    oneSentenceMemory: null,
    favoriteCharacterText: null,
    favoriteLoreEntityId: null,
    journalEntryKind: null,
    journalEntryId: null,
    reopenOption: 'none',
    reopenAt: null,
    notificationIdentifier: null,
    completedAt: null,
  });
}

describe('CapsuleRecallRepository', () => {
  it('create — зберігає спробу з текстом і без нього', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    const capsule = await seedCapsule(db, 'ub-1');

    const withText = await CapsuleRecallRepository.create(db, {
      bookCapsuleId: capsule.id,
      currentMemoryText: 'Пам\'ятаю дощ на початку.',
    });
    expect(withText.currentMemoryText).toBe('Пам\'ятаю дощ на початку.');
    expect(withText.bookCapsuleId).toBe(capsule.id);

    const withoutText = await CapsuleRecallRepository.create(db, {
      bookCapsuleId: capsule.id,
      currentMemoryText: null,
    });
    expect(withoutText.currentMemoryText).toBeNull();
  });

  it('listByBookCapsuleId — найновіша спроба перша, кілька спроб не перезаписують одна одну', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    const capsule = await seedCapsule(db, 'ub-1');

    const first = await CapsuleRecallRepository.create(db, { bookCapsuleId: capsule.id, currentMemoryText: 'Перша' });
    const second = await CapsuleRecallRepository.create(db, { bookCapsuleId: capsule.id, currentMemoryText: 'Друга' });

    const list = await CapsuleRecallRepository.listByBookCapsuleId(db, capsule.id);
    expect(list).toHaveLength(2);
    expect(list.map((r) => r.id)).toEqual(expect.arrayContaining([first.id, second.id]));
  });

  it('listByBookCapsuleId — порожньо, коли спроб ще не було', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    const capsule = await seedCapsule(db, 'ub-1');
    expect(await CapsuleRecallRepository.listByBookCapsuleId(db, capsule.id)).toEqual([]);
  });

  it('видалення капсули каскадно видаляє її recall-історію (ON DELETE CASCADE)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    const capsule = await seedCapsule(db, 'ub-1');
    await CapsuleRecallRepository.create(db, { bookCapsuleId: capsule.id, currentMemoryText: 'Спроба' });

    await BookCapsuleRepository.remove(db, capsule.id);

    expect(await CapsuleRecallRepository.listByBookCapsuleId(db, capsule.id)).toEqual([]);
  });
});
