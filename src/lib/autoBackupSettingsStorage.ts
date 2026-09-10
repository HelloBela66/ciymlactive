import * as SecureStore from 'expo-secure-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('lib/autoBackupSettingsStorage');

const ENABLED_KEY = 'polytsya_autobackup_enabled';
const LAST_RUN_KEY = 'polytsya_autobackup_last_run_at';

/**
 * Налаштування автоматичного резервного копіювання (Milestone 9) — той самий підхід, що й
 * `themePreferenceStorage.ts` (Milestone 8.1): `expo-secure-store`, а не SQLite
 * `app_settings`, навмисно — авто-бекап сам читає/пише SQLite (`BackupRepository.exportAll`),
 * тож його ВЛАСНІ налаштування (увімкнено/коли востаннє) мають жити незалежно від БД, щоб не
 * було циклічної залежності "перевірити, чи писати бекап БД" → "прочитати БД".
 */
export const AutoBackupSettingsStorage = {
  /** За замовчуванням увімкнено (`null` — ще не збережено жодного разу) — авто-бекап це
   * суто локальна, безпечна за замовчуванням поведінка (нічого не шле на сервер), тож немає
   * причини просити явного opt-in. */
  async isEnabled(): Promise<boolean> {
    try {
      const value = await SecureStore.getItemAsync(ENABLED_KEY);
      return value !== 'false';
    } catch (error) {
      log.warn('Не вдалося прочитати налаштування авто-бекапу', {
        error: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
  },

  async setEnabled(value: boolean): Promise<void> {
    try {
      await SecureStore.setItemAsync(ENABLED_KEY, String(value));
    } catch (error) {
      log.warn('Не вдалося зберегти налаштування авто-бекапу', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async getLastRunAt(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(LAST_RUN_KEY);
    } catch (error) {
      log.warn('Не вдалося прочитати час останнього авто-бекапу', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  async setLastRunAt(iso: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(LAST_RUN_KEY, iso);
    } catch (error) {
      log.warn('Не вдалося зберегти час останнього авто-бекапу', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
