import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { OwnedBookRepository } from './OwnedBookRepository';

/**
 * Repository-інтеграційний тест для `OwnedBookRepository` (POLYTSIA V1.6.2, #165 — раніше без
 * жодного тесту). Особлива увага — дедублікація в `create` (повертає ІСНУЮЧИЙ рядок AS-IS,
 * без оновлення полів, якщо для цього edition вже є запис), м'яке видалення в `remove`, і
 * фільтрація видалених у `getByEditionId`/`listOwnedEditionIds`.
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

async function seedEdition(db: SQLiteDatabase, editionId: string): Promise<void> {
  const now = new Date().toISOString();
  const workId = `work-${editionId}`;
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    workId,
    `Книга ${editionId}`,
    now,
    now,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [editionId, workId, `Книга ${editionId}`, 'uk', 'paperback', now, now],
  );
}

describe('OwnedBookRepository.create', () => {
  it('створює новий запис із переданими condition/location/notes', async () => {
    const db = await openMigratedTestDb();
    await seedEdition(db, 'edition-1');

    const owned = await OwnedBookRepository.create(db, {
      editionId: 'edition-1',
      condition: 'good',
      location: 'Полиця у вітальні',
      notes: 'Подарунок',
    });

    expect(owned.editionId).toBe('edition-1');
    expect(owned.condition).toBe('good');
    expect(owned.location).toBe('Полиця у вітальні');
    expect(owned.notes).toBe('Подарунок');
    expect(owned.purchaseDate).toBeNull();
    expect(owned.purchasePrice).toBeNull();
  });

  it('повторний create для того самого editionId повертає ІСНУЮЧИЙ рядок, а не дублікат', async () => {
    const db = await openMigratedTestDb();
    await seedEdition(db, 'edition-1');

    const first = await OwnedBookRepository.create(db, { editionId: 'edition-1', condition: 'good' });
    const second = await OwnedBookRepository.create(db, { editionId: 'edition-1', condition: 'damaged' });

    expect(second.id).toBe(first.id);
    // Друге condition НЕ застосувалось — create повертає наявний рядок AS-IS.
    expect(second.condition).toBe('good');

    const rows = await db.getAllAsync(`SELECT * FROM owned_book WHERE edition_id = ?`, ['edition-1']);
    expect(rows).toHaveLength(1);
  });
});

describe('OwnedBookRepository.getByEditionId', () => {
  it('повертає null, якщо книга не позначена власною', async () => {
    const db = await openMigratedTestDb();
    await seedEdition(db, 'edition-1');
    expect(await OwnedBookRepository.getByEditionId(db, 'edition-1')).toBeNull();
  });

  it('повертає null для м’яко видаленого запису', async () => {
    const db = await openMigratedTestDb();
    await seedEdition(db, 'edition-1');
    const owned = await OwnedBookRepository.create(db, { editionId: 'edition-1' });

    await OwnedBookRepository.remove(db, owned.id);

    expect(await OwnedBookRepository.getByEditionId(db, 'edition-1')).toBeNull();
  });
});

describe('OwnedBookRepository.remove', () => {
  it('м’яко видаляє: рядок лишається в таблиці з проставленим deleted_at', async () => {
    const db = await openMigratedTestDb();
    await seedEdition(db, 'edition-1');
    const owned = await OwnedBookRepository.create(db, { editionId: 'edition-1' });

    await OwnedBookRepository.remove(db, owned.id);

    const row = await db.getFirstAsync<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM owned_book WHERE id = ?`,
      [owned.id],
    );
    expect(row?.deleted_at).not.toBeNull();
  });

  it('після видалення можна знову позначити ту саму книгу власною (новий рядок)', async () => {
    const db = await openMigratedTestDb();
    await seedEdition(db, 'edition-1');
    const first = await OwnedBookRepository.create(db, { editionId: 'edition-1' });
    await OwnedBookRepository.remove(db, first.id);

    const second = await OwnedBookRepository.create(db, { editionId: 'edition-1' });

    expect(second.id).not.toBe(first.id);
    expect(await OwnedBookRepository.getByEditionId(db, 'edition-1')).not.toBeNull();
  });
});

describe('OwnedBookRepository.listOwnedEditionIds', () => {
  it('порожній масив editionIds повертає порожній Set без запиту до БД', async () => {
    const db = await openMigratedTestDb();
    expect((await OwnedBookRepository.listOwnedEditionIds(db, [])).size).toBe(0);
  });

  it('повертає лише ті edition, що ДІЙСНО позначені власними, виключно активні', async () => {
    const db = await openMigratedTestDb();
    await seedEdition(db, 'edition-owned');
    await seedEdition(db, 'edition-not-owned');
    await seedEdition(db, 'edition-removed');
    await OwnedBookRepository.create(db, { editionId: 'edition-owned' });
    const removed = await OwnedBookRepository.create(db, { editionId: 'edition-removed' });
    await OwnedBookRepository.remove(db, removed.id);

    const result = await OwnedBookRepository.listOwnedEditionIds(db, [
      'edition-owned',
      'edition-not-owned',
      'edition-removed',
    ]);

    expect(result.has('edition-owned')).toBe(true);
    expect(result.has('edition-not-owned')).toBe(false);
    expect(result.has('edition-removed')).toBe(false);
  });
});
