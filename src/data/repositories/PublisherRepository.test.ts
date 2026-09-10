import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { PublisherRepository } from './PublisherRepository';

/**
 * Repository-інтеграційний тест (POLYTSIA V1.5, Фаза 3, п.44 ТЗ) — "створення сутності →
 * читання" проти реальної `:memory:` SQLite, схема якої піднята тим самим `migrateDbIfNeeded`,
 * що й на пристрої користувача (а не вручну написаний `CREATE TABLE` в тесті, який міг би
 * розійтись зі справжніми міграціями).
 */
async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await migrateDbIfNeeded(db);
  return db;
}

describe('PublisherRepository', () => {
  it('findOrCreateByName створює новий запис, getById і findByName повертають його ж дані', async () => {
    const db = await openMigratedTestDb();

    const created = await PublisherRepository.findOrCreateByName(db, '  Видавництво Старого Лева  ');
    expect(created.name).toBe('Видавництво Старого Лева');
    expect(created.id).toEqual(expect.any(String));
    expect(created.country).toBeNull();

    const byId = await PublisherRepository.getById(db, created.id);
    expect(byId).toEqual(created);

    const byName = await PublisherRepository.findByName(db, 'Видавництво Старого Лева');
    expect(byName).toEqual(created);
  });

  it('findOrCreateByName вдруге з тим самим (trim-нормалізованим) іменем не створює дубліката', async () => {
    const db = await openMigratedTestDb();

    const first = await PublisherRepository.findOrCreateByName(db, 'А-ба-ба-га-ла-ма-га');
    const second = await PublisherRepository.findOrCreateByName(db, '  А-ба-ба-га-ла-ма-га');

    expect(second.id).toBe(first.id);

    const all = await db.getAllAsync<{ id: string }>(`SELECT id FROM publisher WHERE name = ?`, [
      'А-ба-ба-га-ла-ма-га',
    ]);
    expect(all).toHaveLength(1);
  });

  it('getById для неіснуючого id повертає null, а не кидає виняток', async () => {
    const db = await openMigratedTestDb();

    const result = await PublisherRepository.getById(db, 'does-not-exist');
    expect(result).toBeNull();
  });

  it('listByIds повертає лише знайдені записи, ключ Map — id', async () => {
    const db = await openMigratedTestDb();

    const a = await PublisherRepository.findOrCreateByName(db, 'Видавництво А');
    const b = await PublisherRepository.findOrCreateByName(db, 'Видавництво Б');

    const result = await PublisherRepository.listByIds(db, [a.id, b.id, 'missing-id']);

    expect(result.size).toBe(2);
    expect(result.get(a.id)).toEqual(a);
    expect(result.get(b.id)).toEqual(b);
    expect(result.has('missing-id')).toBe(false);
  });

  it('listByIds з порожнім масивом повертає порожню Map без запиту до БД', async () => {
    const db = await openMigratedTestDb();

    const result = await PublisherRepository.listByIds(db, []);
    expect(result.size).toBe(0);
  });
});
