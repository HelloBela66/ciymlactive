import * as SecureStore from 'expo-secure-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('lib/themePreferenceStorage');

export type ThemePreferenceValue = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'polytsya_theme_preference';

function isValidPreference(value: string | null): value is ThemePreferenceValue {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * Сховище вибору теми через `expo-secure-store` (Milestone 8, виправлення після реального
 * тестування на пристрої: перша версія персистила через SQLite `app_settings.theme`
 * (`AppSettingsRepository`), але на пристрої вибір НЕ переживав перезапуск застосунку —
 * незважаючи на те, що сам UPSERT/SELECT був окремо перевірений і коректний. Найімовірніша
 * причина — `ThemeProvider` навмисно сидить ВИЩЕ `DatabaseProvider` у дереві (щоб сам
 * `DatabaseProvider` міг стилізувати свій loading/error стан через `useTheme()`), тож його
 * запис/читання теми залежали від того самого `getDatabase()`-з'єднання й порядку міграцій,
 * що й решта застосунку, — залежність, якої простій пристрій-специфічній преференції не
 * мало бути потрібно.
 *
 * `expo-secure-store` — окремий нативний модуль (уже в `app.config.ts` з Milestone 0,
 * закладений під майбутні секрети), працює повністю незалежно від SQLite: не чекає на
 * відкриття БД чи застосування міграцій, тож немає жодної точки, де порядок ініціалізації
 * застосунку міг би завадити запису чи читанню.
 */
export const ThemePreferenceStorage = {
  async load(): Promise<ThemePreferenceValue | null> {
    try {
      const value = await SecureStore.getItemAsync(STORAGE_KEY);
      return isValidPreference(value) ? value : null;
    } catch (error) {
      log.warn('Не вдалося прочитати збережену тему з SecureStore', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  async save(value: ThemePreferenceValue): Promise<void> {
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, value);
    } catch (error) {
      log.warn('Не вдалося зберегти тему в SecureStore', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
