import type { SQLiteDatabase } from 'expo-sqlite';
import { nowIso } from '@/lib/dateUtils';

/**
 * `app_settings` — singleton-рядок (`id = 'local'`), створений одразу в
 * `001_base_schema.ts`'s `up()` — тож `getFirstAsync` тут завжди має що повернути в живому
 * застосунку (рядок вставляється в тій самій транзакції, що й створення таблиці, до будь-якого
 * коду фічі).
 *
 * `theme`-методи нижче (`getTheme`/`setTheme`) БІЛЬШЕ НЕ використовуються `ThemeProvider`
 * (Milestone 8): перша версія персистила вибір теми саме сюди, але на реальному пристрої
 * підтвердилось, що значення не переживало перезапуск застосунку — `ThemeProvider` сидить
 * вище `DatabaseProvider` в дереві, і залежність від готовності SQLite/міграцій виявилась
 * крихкою для простої пристрій-специфічної преференції. Персистентність перенесено на
 * `expo-secure-store` (`src/lib/themePreferenceStorage.ts`), незалежну від БД. Ці методи й
 * колонка `theme` лишені в схемі як є (не варті окремої міграції на видалення заради
 * прибирання) — решта колонок (`week_start`, `reading_units`, ...) так само чекають на
 * власні фічі-налаштувань пізніше.
 */
export type ThemePreferenceValue = 'system' | 'light' | 'dark';

export const AppSettingsRepository = {
  /** @deprecated Більше не джерело правди для теми — див. коментар вище файлу. */
  async getTheme(db: SQLiteDatabase): Promise<ThemePreferenceValue | null> {
    try {
      const row = await db.getFirstAsync<{ theme: ThemePreferenceValue }>(
        `SELECT theme FROM app_settings WHERE id = 'local'`,
      );
      return row?.theme ?? null;
    } catch {
      return null;
    }
  },

  /** @deprecated Більше не викликається з `ThemeProvider` — див. коментар вище файлу.
   * `INSERT ... ON CONFLICT DO UPDATE` замість чистого UPDATE — захист на випадок, якщо
   * рядок `id = 'local'` колись не existує (наприклад, файл БД відновлено з бекапу, зробленого
   * до того, як ця колонка/рядок з'явились) — тоді просто створює його з дефолтними
   * значеннями решти полів замість мовчазного no-op UPDATE, який нічого не змінив би. */
  async setTheme(db: SQLiteDatabase, theme: ThemePreferenceValue): Promise<void> {
    const now = nowIso();
    await db.runAsync(
      `INSERT INTO app_settings (id, theme, updated_at) VALUES ('local', ?, ?)
       ON CONFLICT (id) DO UPDATE SET theme = excluded.theme, updated_at = excluded.updated_at`,
      [theme, now],
    );
  },
};
