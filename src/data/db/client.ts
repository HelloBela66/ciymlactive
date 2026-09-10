import * as SQLite from 'expo-sqlite';
import { createLogger } from '@/lib/logger';

const log = createLogger('db/client');

const DATABASE_NAME = 'polytsya.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Єдина точка отримання з'єднання з SQLite. Лінива ініціалізація + кешування проміса
 * (а не інстансу одразу) запобігає гонці, якщо кілька repositories звернуться до БД
 * одночасно під час старту застосунку.
 *
 * Якщо відкриття/PRAGMA-виклики впадуть — `dbPromise` явно скидається назад у `null`
 * (Milestone 8, аудит: раніше цього не було, і `dbPromise` назавжди лишався
 * "зіпсованим" відхиленим промісом до перезапуску процесу — жоден подальший
 * `getDatabase()` за весь час життя застосунку більше не мав шансу на успіх, навіть якщо
 * причина була тимчасовою). Скидання дозволяє наступному виклику спробувати відкрити БД
 * ще раз, замість назавжди повертати ту саму відхилену обіцянку.
 */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME)
      .then(async (db) => {
        await db.execAsync('PRAGMA foreign_keys = ON;');
        await db.execAsync('PRAGMA journal_mode = WAL;');
        log.debug('SQLite з\'єднання відкрито', { DATABASE_NAME });
        return db;
      })
      .catch((error) => {
        log.error('Не вдалося відкрити SQLite з\'єднання — дозволяю повторну спробу', {
          error: error instanceof Error ? error.message : String(error),
        });
        dbPromise = null;
        throw error;
      });
  }
  return dbPromise;
}

/** Лише для тестів/скидання стану — не використовувати у фічах. */
export function __resetDatabaseConnectionForTests(): void {
  dbPromise = null;
}
