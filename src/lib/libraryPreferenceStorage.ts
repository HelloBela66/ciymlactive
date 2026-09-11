import * as SecureStore from 'expo-secure-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('lib/libraryPreferenceStorage');

export type LibraryViewMode = 'list' | 'grid';
export type LibrarySortOption = 'default' | 'title' | 'author' | 'updated';

const VIEW_MODE_KEY = 'polytsya_library_view_mode';
const SORT_KEY = 'polytsya_library_sort';

function isValidViewMode(value: string | null): value is LibraryViewMode {
  return value === 'list' || value === 'grid';
}

function isValidSort(value: string | null): value is LibrarySortOption {
  return value === 'default' || value === 'title' || value === 'author' || value === 'updated';
}

/**
 * POLYTSIA V1.6, Фаза 1 (Library UX) — вибір вигляду (список/сітка) і сортування бібліотеки,
 * ті самі дрібні пристрій-специфічні UI-преференції, що й тема застосунку. Навмисно той самий
 * `expo-secure-store`, а не SQLite `app_settings` — той самий обґрунтований вибір, що й
 * `themePreferenceStorage.ts` (не залежить від відкриття БД/міграцій, переживає перезапуск
 * незалежно від порядку ініціалізації екрана Бібліотеки).
 */
export const LibraryPreferenceStorage = {
  async loadViewMode(): Promise<LibraryViewMode | null> {
    try {
      const value = await SecureStore.getItemAsync(VIEW_MODE_KEY);
      return isValidViewMode(value) ? value : null;
    } catch (error) {
      log.warn('Не вдалося прочитати вигляд бібліотеки з SecureStore', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  async saveViewMode(value: LibraryViewMode): Promise<void> {
    try {
      await SecureStore.setItemAsync(VIEW_MODE_KEY, value);
    } catch (error) {
      log.warn('Не вдалося зберегти вигляд бібліотеки в SecureStore', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async loadSort(): Promise<LibrarySortOption | null> {
    try {
      const value = await SecureStore.getItemAsync(SORT_KEY);
      return isValidSort(value) ? value : null;
    } catch (error) {
      log.warn('Не вдалося прочитати сортування бібліотеки з SecureStore', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  async saveSort(value: LibrarySortOption): Promise<void> {
    try {
      await SecureStore.setItemAsync(SORT_KEY, value);
    } catch (error) {
      log.warn('Не вдалося зберегти сортування бібліотеки в SecureStore', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
