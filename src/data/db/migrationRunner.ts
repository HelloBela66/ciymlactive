import type { SQLiteDatabase } from 'expo-sqlite';
import { createLogger } from '@/lib/logger';
import * as migration001 from './migrations/001_base_schema';
import * as migration002 from './migrations/002_book_source_isbndb';
import * as migration003 from './migrations/003_journal_entry_extensions';
import * as migration004 from './migrations/004_book_memory';
import * as migration005 from './migrations/005_book_memory_template';
import * as migration006 from './migrations/006_recommendation_shown';
import * as migration007 from './migrations/007_book_source_curated';
import * as migration008 from './migrations/008_note_category';
import * as migration009 from './migrations/009_shelf_theme';
import * as migration010 from './migrations/010_reading_experience';
import * as migration011 from './migrations/011_revisit_later';
import * as migration012 from './migrations/012_book_capsule';
import * as migration013 from './migrations/013_capsule_recall';
import * as migration014 from './migrations/014_pre_reading_reflection';
import * as migration015 from './migrations/015_lore_entity';
import * as migration016 from './migrations/016_spoiler_safe';

const log = createLogger('db/migrations');

interface Migration {
  version: number;
  up: (db: SQLiteDatabase) => Promise<void>;
  /** Коли true, раннер НЕ обгортає `up` у власну `withTransactionAsync` — міграція керує
   * транзакцією(-ями) сама. Потрібно для міграцій, яким доводиться перемикати
   * `PRAGMA foreign_keys` (не можна робити всередині транзакції) — див. коментар у
   * `002_book_source_isbndb.ts`. */
  manualTransaction?: boolean;
}

/**
 * Реєстр міграцій у порядку зростання версії. Додавання нової міграції = новий файл
 * `NNN_description.ts` з `export const version` та `export async function up(db)`,
 * доданий сюди в кінець масиву. Ніколи не редагуй вже застосовану міграцію заднім числом
 * (п.42 ТЗ) — лише додавай нову.
 */
const migrations: Migration[] = [
  { version: migration001.version, up: migration001.up },
  { version: migration002.version, up: migration002.up, manualTransaction: migration002.manualTransaction },
  { version: migration003.version, up: migration003.up, manualTransaction: migration003.manualTransaction },
  { version: migration004.version, up: migration004.up },
  { version: migration005.version, up: migration005.up },
  { version: migration006.version, up: migration006.up },
  { version: migration007.version, up: migration007.up, manualTransaction: migration007.manualTransaction },
  { version: migration008.version, up: migration008.up },
  { version: migration009.version, up: migration009.up },
  { version: migration010.version, up: migration010.up },
  { version: migration011.version, up: migration011.up },
  { version: migration012.version, up: migration012.up },
  { version: migration013.version, up: migration013.up },
  { version: migration014.version, up: migration014.up },
  { version: migration015.version, up: migration015.up },
  { version: migration016.version, up: migration016.up },
];

export const LATEST_SCHEMA_VERSION = migrations[migrations.length - 1]?.version ?? 0;

/** Застосовує задані міграції послідовно, кожну у власній транзакції (крім
 * `manualTransaction`), і після кожної одразу проставляє `PRAGMA user_version`. Спільна для
 * `migrateDbIfNeeded` і тестового `__applyMigrationsForTests` нижче. */
async function applyMigrations(db: SQLiteDatabase, pending: Migration[]): Promise<void> {
  for (const migration of pending) {
    log.info('Застосовую міграцію', { version: migration.version });
    if (migration.manualTransaction) {
      await migration.up(db);
    } else {
      await db.withTransactionAsync(async () => {
        await migration.up(db);
      });
    }
    await db.execAsync(`PRAGMA user_version = ${migration.version}`);
  }
}

/**
 * Застосовує всі міграції з версією > поточного PRAGMA user_version, послідовно, кожну у
 * власній транзакції. Це офіційно рекомендований Expo SQLite патерн (PRAGMA user_version).
 */
export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  const pending = migrations.filter((m) => m.version > currentVersion).sort((a, b) => a.version - b.version);

  if (pending.length === 0) {
    log.debug('Схема БД уже актуальна', { currentVersion });
    return currentVersion;
  }

  await applyMigrations(db, pending);
  const finalVersion = pending[pending.length - 1]?.version ?? currentVersion;
  log.info('Міграції застосовано', { currentVersion: finalVersion });
  return finalVersion;
}

/**
 * Лише для тестів (Фаза 3, п.44 ТЗ) — застосовує міграції включно до `upToVersion`,
 * незалежно від поточного `PRAGMA user_version`. Дозволяє підготувати в тесті "seed-БД
 * попередньої версії" (усі міграції, КРІМ найновішої) і потім прогнати саме
 * `migrateDbIfNeeded` на ній — так само, як це відбулося б на реальному пристрої власника
 * продукту після оновлення застосунку з даними, створеними попередньою версією схеми.
 */
export async function __applyMigrationsForTests(db: SQLiteDatabase, upToVersion: number): Promise<void> {
  const pending = migrations.filter((m) => m.version <= upToVersion).sort((a, b) => a.version - b.version);
  await applyMigrations(db, pending);
}
