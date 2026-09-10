import * as SecureStore from 'expo-secure-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('lib/backupExportStatusStorage');

const LAST_MANUAL_EXPORT_KEY = 'polytsya_backup_last_manual_export_at';

/**
 * ТЗ Фази 13 (BACKUP HEALTH UX) — «last successful export time, якщо це реально можна
 * визначити». Ручний експорт (`useExportBackup`, кнопка «Створити й поділитися») — єдиний
 * механізм бекапу, що РЕАЛЬНО виконується сьогодні: `AutoBackupSettingsStorage` має метод
 * `setLastRunAt`, але жодне місце в коді його ще не викликає — сам фоновий запуск авто-бекапу
 * ще не реалізований (ймовірний технічний борг для майбутньої Фази CLEANUP, не для цієї). Фаза
 * 13 навмисно НЕ вигадує фонову задачу лише заради цього екрана — ТЗ прямо каже показувати час
 * лише "якщо це реально можна визначити", а не будь-що.
 *
 * `expo-secure-store`, а НЕ `app_settings.last_backup_at` (реальна, але НІКОЛИ не записувана
 * прикладним кодом колонка з Migration 001 — лише фігурує в seed-даних
 * `BackupRepository.test.ts`) — той самий привід, що вже задокументовано в
 * `autoBackupSettingsStorage.ts`/`ThemeProvider.tsx`: SQLite-персистентність налаштувань САМОГО
 * механізму бекапу (а не даних, які він зберігає) на реальному пристрої підтвердилась
 * ненадійною (докладніше — коментар у `ThemeProvider.tsx`, той самий баг з `app_settings.theme`
 * заради якого налаштування теми переїхали на `expo-secure-store`). До того ж
 * `last_backup_at` — колонка ВСЕРЕДИНІ самого бекапу: відновлення СТАРОЇ резервної копії
 * відкотило б і сам запис "коли її було створено" на застарілу дату, що для показника
 * "здоров'я бекапу" було б прямо оманливим.
 */
export const BackupExportStatusStorage = {
  async getLastManualExportAt(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(LAST_MANUAL_EXPORT_KEY);
    } catch (error) {
      log.warn('Не вдалося прочитати час останнього ручного експорту', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  async setLastManualExportAt(iso: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(LAST_MANUAL_EXPORT_KEY, iso);
    } catch (error) {
      log.warn('Не вдалося зберегти час останнього ручного експорту', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
