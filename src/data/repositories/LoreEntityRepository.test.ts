import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { LoreEntityRepository } from './LoreEntityRepository';

/**
 * Repository-інтеграційний тест для `LoreEntityRepository` (POLYTSIA V1.6, Фаза 9-10 —
 * «Персонажі» → PERSONAL LORE). Той самий `openMigratedTestDb()`/seed-патерн, що й
 * `CapsuleRecallRepository.test.ts`.
 */

const NOW = '2026-01-01T00:00:00.000Z';

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

async function seedWork(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`INSERT INTO work (id, title, cover_fallback_color, created_at, updated_at) VALUES (?,?,?,?,?)`, [
    id,
    `Книга ${id}`,
    '#123456',
    NOW,
    NOW,
  ]);
}

describe('LoreEntityRepository', () => {
  it('create — зберігає персонажа з обчисленим first_seen_progress', async () => {
    const db = await openMigratedTestDb();
    await seedWork(db, 'work-1');

    const entity = await LoreEntityRepository.create(db, {
      workId: 'work-1',
      type: 'character',
      name: 'Пол Атрідес',
      description: 'Спадкоємець дому Атрідес.',
      firstSeenPage: 12,
      firstSeenProgress: 3.5,
    });

    expect(entity.name).toBe('Пол Атрідес');
    expect(entity.firstSeenProgress).toBe(3.5);
    expect(entity.reaction).toBeNull();
    expect(entity.isFavorite).toBe(false);
  });

  it('listByWorkId — обидва персонажі твору повертаються, персонаж іншого твору — ні', async () => {
    const db = await openMigratedTestDb();
    await seedWork(db, 'work-1');
    await seedWork(db, 'work-2');

    const first = await LoreEntityRepository.create(db, {
      workId: 'work-1',
      type: 'character',
      name: 'Перший',
      description: null,
      firstSeenPage: null,
      firstSeenProgress: null,
    });
    // Різний `createdAt` гарантований не буде — обидва `create` викликають `nowIso()` у тому
    // самому тесті, теоретично можуть збігтись до мілісекунди (той самий застережний коментар,
    // що й `BookCapsuleRepository.test.ts`) — тому нижче перевіряємо МНОЖИНУ id
    // (`ORDER BY created_at DESC`-порядок при рівних таймстемпах не гарантований), а не точний
    // порядок.
    const second = await LoreEntityRepository.create(db, {
      workId: 'work-1',
      type: 'character',
      name: 'Другий',
      description: null,
      firstSeenPage: null,
      firstSeenProgress: null,
    });
    await LoreEntityRepository.create(db, {
      workId: 'work-2',
      type: 'character',
      name: 'З іншої книги',
      description: null,
      firstSeenPage: null,
      firstSeenProgress: null,
    });

    const list = await LoreEntityRepository.listByWorkId(db, 'work-1');
    expect(list).toHaveLength(2);
    expect(new Set(list.map((entity) => entity.id))).toEqual(new Set([first.id, second.id]));
  });

  it('update — змінює ім\'я/опис/реакцію, не чіпає workId/type', async () => {
    const db = await openMigratedTestDb();
    await seedWork(db, 'work-1');
    const entity = await LoreEntityRepository.create(db, {
      workId: 'work-1',
      type: 'character',
      name: 'Ім\'я',
      description: null,
      firstSeenPage: null,
      firstSeenProgress: null,
    });

    await LoreEntityRepository.update(db, {
      id: entity.id,
      name: 'Нове ім\'я',
      description: 'Опис',
      firstSeenPage: 40,
      firstSeenProgress: 10,
      reaction: 'like',
    });

    const updated = await LoreEntityRepository.getById(db, entity.id);
    expect(updated?.name).toBe('Нове ім\'я');
    expect(updated?.reaction).toBe('like');
    expect(updated?.workId).toBe('work-1');
  });

  it('remove — м\'яке видалення: зникає зі списку, getById більше не повертає', async () => {
    const db = await openMigratedTestDb();
    await seedWork(db, 'work-1');
    const entity = await LoreEntityRepository.create(db, {
      workId: 'work-1',
      type: 'character',
      name: 'Персонаж',
      description: null,
      firstSeenPage: null,
      firstSeenProgress: null,
    });

    await LoreEntityRepository.remove(db, entity.id);

    expect(await LoreEntityRepository.getById(db, entity.id)).toBeNull();
    expect(await LoreEntityRepository.listByWorkId(db, 'work-1')).toEqual([]);
  });

  it('setFavorite — перемикає позначку "обране"', async () => {
    const db = await openMigratedTestDb();
    await seedWork(db, 'work-1');
    const entity = await LoreEntityRepository.create(db, {
      workId: 'work-1',
      type: 'character',
      name: 'Персонаж',
      description: null,
      firstSeenPage: null,
      firstSeenProgress: null,
    });

    await LoreEntityRepository.setFavorite(db, entity.id, true);
    expect((await LoreEntityRepository.getById(db, entity.id))?.isFavorite).toBe(true);

    await LoreEntityRepository.setFavorite(db, entity.id, false);
    expect((await LoreEntityRepository.getById(db, entity.id))?.isFavorite).toBe(false);
  });

  it('linkJournalEntry/unlinkJournalEntry — ідемпотентне зв\'язування, коректне відв\'язування', async () => {
    const db = await openMigratedTestDb();
    await seedWork(db, 'work-1');
    const entity = await LoreEntityRepository.create(db, {
      workId: 'work-1',
      type: 'character',
      name: 'Персонаж',
      description: null,
      firstSeenPage: null,
      firstSeenProgress: null,
    });

    await LoreEntityRepository.linkJournalEntry(db, entity.id, 'note', 'note-1');
    await LoreEntityRepository.linkJournalEntry(db, entity.id, 'note', 'note-1'); // повторно — без дубля

    const links = await LoreEntityRepository.listLinksForEntity(db, entity.id);
    expect(links).toHaveLength(1);
    expect(links[0]?.entryId).toBe('note-1');

    await LoreEntityRepository.unlinkJournalEntry(db, entity.id, 'note', 'note-1');
    expect(await LoreEntityRepository.listLinksForEntity(db, entity.id)).toEqual([]);
  });

  it('видалення твору каскадно видаляє персонажа й зв\'язок (ON DELETE CASCADE)', async () => {
    const db = await openMigratedTestDb();
    await seedWork(db, 'work-1');
    const entity = await LoreEntityRepository.create(db, {
      workId: 'work-1',
      type: 'character',
      name: 'Персонаж',
      description: null,
      firstSeenPage: null,
      firstSeenProgress: null,
    });
    await LoreEntityRepository.linkJournalEntry(db, entity.id, 'note', 'note-1');

    await db.runAsync(`DELETE FROM work WHERE id = ?`, ['work-1']);

    const remaining = await db.getAllAsync(`SELECT * FROM lore_entity WHERE id = ?`, [entity.id]);
    expect(remaining).toHaveLength(0);
    const remainingLinks = await db.getAllAsync(`SELECT * FROM journal_lore_link WHERE lore_entity_id = ?`, [
      entity.id,
    ]);
    expect(remainingLinks).toHaveLength(0);
  });
});
