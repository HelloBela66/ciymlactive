import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded, LATEST_SCHEMA_VERSION, __applyMigrationsForTests } from './migrationRunner';

/**
 * Repository-інтеграційні тести (POLYTSIA V1.5, Фаза 3, п.44 ТЗ) — проти РЕАЛЬНОГО
 * `expo-sqlite` (`:memory:`, без диска й без емулятора/симулятора — `jest-expo` виконує
 * нативний модуль напряму в Node), не in-memory JS-мок: SQL із самих міграцій справді
 * виконується рушієм SQLite, а не просто "не кидає виняток у замоканому шарі".
 *
 * Кожен `it` відкриває свою власну `:memory:` БД — вони не діляться станом між собою (на
 * відміну від `getDatabase()` з `client.ts`, який кешує одне спільне з'єднання для
 * застосунку).
 */
async function openTestDb(): Promise<SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(':memory:');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  return db;
}

describe('migrateDbIfNeeded', () => {
  it('застосовує всі міграції на порожній БД без помилок і доводить до LATEST_SCHEMA_VERSION', async () => {
    const db = await openTestDb();

    const finalVersion = await migrateDbIfNeeded(db);
    expect(finalVersion).toBe(LATEST_SCHEMA_VERSION);

    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(row?.user_version).toBe(LATEST_SCHEMA_VERSION);

    // Побіжна перевірка, що таблиці з РІЗНИХ міграцій (001 — базова схема, 008 — остання, що
    // додає нову таблицю) справді створені, а не лише що PRAGMA-лічильник збігся.
    const tables = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('author', 'shelf', 'note_category')
       ORDER BY name`,
    );
    expect(tables.map((t) => t.name)).toEqual(['author', 'note_category', 'shelf']);
  });

  it('повторний виклик на вже актуальній БД — без помилок, версія не змінюється (ідемпотентність)', async () => {
    const db = await openTestDb();

    await migrateDbIfNeeded(db);
    const secondRunVersion = await migrateDbIfNeeded(db);

    expect(secondRunVersion).toBe(LATEST_SCHEMA_VERSION);
  });

  it('нова міграція (009: shelf.theme) застосовується на seed-БД попередньої версії без втрати даних', async () => {
    const db = await openTestDb();

    // Готуємо БД "версії 8" — усі міграції, КРІМ найновішої (009).
    await __applyMigrationsForTests(db, LATEST_SCHEMA_VERSION - 1);
    const beforeVersion = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(beforeVersion?.user_version).toBe(LATEST_SCHEMA_VERSION - 1);

    // Реальний рядок, створений "попередньою версією застосунку" — до появи стовпця `theme`.
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO shelf (id, name, is_system, sort_order, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`,
      ['shelf-1', 'Улюблене', now, now],
    );

    // Тепер — те саме, що відбулось би на пристрої власника продукту після оновлення
    // застосунку: `migrateDbIfNeeded` бачить, що не вистачає лише останньої міграції.
    const finalVersion = await migrateDbIfNeeded(db);
    expect(finalVersion).toBe(LATEST_SCHEMA_VERSION);

    const shelf = await db.getFirstAsync<{ id: string; name: string; theme: string }>(
      `SELECT id, name, theme FROM shelf WHERE id = ?`,
      ['shelf-1'],
    );
    expect(shelf).not.toBeNull();
    expect(shelf?.name).toBe('Улюблене');
    // ALTER TABLE ... DEFAULT 'classic' (009_shelf_theme.ts) має заднім числом проставити
    // значення й уже наявним рядкам, не лише новим.
    expect(shelf?.theme).toBe('classic');
  });
});
