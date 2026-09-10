import Database from 'better-sqlite3';
import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Тестова `:memory:` SQLite-БД для repository-інтеграційних тестів (Фаза 3, п.44 ТЗ).
 *
 * ЧОМУ НЕ `expo-sqlite` напряму (як спочатку було написано в `migrationRunner.test.ts`/
 * `PublisherRepository.test.ts`): емпірично перевірено реальним запуском на GitHub Actions —
 * нативний модуль `expo-sqlite` (`NativeDatabase`) НЕ конструюється під `jest-expo` на
 * headless Ubuntu runner'і (`TypeError: _ExpoSQLite.default.NativeDatabase is not a
 * constructor`, `node_modules/expo-sqlite/src/SQLiteDatabase.ts:584`). Це й є та розвилка,
 * яку `docs/TESTING.md` явно залишав відкритою ("Jest + `expo` preset, або окремий
 * Node-SQLite драйвер... — обираємо на етапі M0 залежно від того, що стабільно піднімається
 * без емулятора") — тепер відповідь відома емпірично, задокументовано там само.
 *
 * Тому тут — `better-sqlite3`: синхронний нативний SQLite-драйвер для Node із прекомпільованими
 * бінарниками під linux-x64/win32-x64/darwin (не потребує компілятора/node-gyp ні на машині
 * розробника, ні на GitHub Actions runner'і — той самий клас гарантій, що вже був критерієм
 * при виборі `expo-sqlite` для самого застосунку). Той самий SQLite-рушій, той самий SQL-діалект,
 * той самий `?`-плейсхолдер і PRAGMA-інтерфейс, що й `expo-sqlite` — тож `migrationRunner.ts` і
 * всі repository-модулі викликаються тут БЕЗ ЖОДНОЇ ЗМІНИ: адаптер нижче лише підставляє під ту
 * саму сигнатуру (`execAsync`/`runAsync`/`getFirstAsync`/`getAllAsync`/`withTransactionAsync`)
 * інший рушій виконання.
 *
 * `withTransactionAsync` реалізовано вручну через `BEGIN`/`COMMIT`/`ROLLBACK`, а не вбудований
 * `Database.prototype.transaction()` з `better-sqlite3` — той очікує СИНХРОННИЙ колбек, а
 * `migration.up` усередині справжня async-функція з `await` (сама робота синхронна під капотом,
 * але виклики через Promise).
 *
 * Лише для тестів — жоден файл продакшн-коду (`app/**`, `src/features/**` тощо) цей модуль не
 * імпортує; `better-sqlite3` — `devDependency` (`package.json`), відсутній у продакшн-білді.
 */
function createBetterSqliteAdapter(raw: Database.Database): SQLiteDatabase {
  const adapter = {
    async execAsync(source: string): Promise<void> {
      raw.exec(source);
    },

    async runAsync(
      source: string,
      params: unknown[] = [],
    ): Promise<{ lastInsertRowId: number; changes: number }> {
      const result = raw.prepare(source).run(...params);
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: result.changes };
    },

    async getFirstAsync<T>(source: string, params: unknown[] = []): Promise<T | null> {
      const row = raw.prepare(source).get(...params) as T | undefined;
      return row ?? null;
    },

    async getAllAsync<T>(source: string, params: unknown[] = []): Promise<T[]> {
      return raw.prepare(source).all(...params) as T[];
    },

    async withTransactionAsync(task: () => Promise<void>): Promise<void> {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };

  // `adapter` навмисно реалізує лише підмножину `SQLiteDatabase` (рівно ті 5 методів, які
  // реально викликають migrationRunner.ts/репозиторії — перевірено `grep`-ом по всьому
  // `src/data/`) — звідси `unknown`-каст, а не структурна відповідність усьому класу.
  return adapter as unknown as SQLiteDatabase;
}

/**
 * Відкриває нову незалежну `:memory:` тестову БД (без диска, без застосунку). Кожен виклик —
 * окремий інстанс, на відміну від `getDatabase()` у `client.ts`, який кешує одне спільне
 * з'єднання для застосунку — тести не ділять стан між собою.
 */
export async function openTestDatabase(): Promise<SQLiteDatabase> {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  return createBetterSqliteAdapter(raw);
}
