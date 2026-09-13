import * as SecureStore from 'expo-secure-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('lib/onboardingHintStorage');

/**
 * PROGRESSIVE ONBOARDING, Фаза 18 (`docs/PROGRESSIVE_ONBOARDING.md`) — три контекстні підказки,
 * кожна показується РІВНО ОДИН РАЗ на весь час користування застосунком (не за сесію):
 * `welcome` (порожня бібліотека при першому запуску), `firstSession` (одразу після першої
 * сесії читання), `firstFinishedBookCapsule` (пояснення Капсули/Моєї пам'яті при першій
 * завершеній книзі). Один спільний тип-ключ, а не три окремі константи — той самий підхід, що
 * вже дав змогу додати четверту підказку в майбутньому без нового файлу сховища.
 */
export type OnboardingHintId = 'welcome' | 'firstSession' | 'firstFinishedBookCapsule';

function storageKey(id: OnboardingHintId): string {
  return `polytsya_onboarding_hint_seen_${id}`;
}

/**
 * Той самий `expo-secure-store`, що й `themePreferenceStorage.ts`/`libraryPreferenceStorage.ts`
 * — не залежить від відкриття SQLite/міграцій, переживає перезапуск незалежно від порядку
 * ініціалізації екрана, на якому підказка показується.
 */
export const OnboardingHintStorage = {
  async hasSeen(id: OnboardingHintId): Promise<boolean> {
    try {
      const value = await SecureStore.getItemAsync(storageKey(id));
      return value === '1';
    } catch (error) {
      log.warn('Не вдалося прочитати стан onboarding-підказки з SecureStore', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
      // Безпечний бік помилки — вважати підказку НЕ показаною замість падіння: у
      // найгіршому разі користувач побачить підказку ще раз, а не втратить її назавжди
      // через тимчасовий збій сховища.
      return false;
    }
  },

  async markSeen(id: OnboardingHintId): Promise<void> {
    try {
      await SecureStore.setItemAsync(storageKey(id), '1');
    } catch (error) {
      log.warn('Не вдалося зберегти стан onboarding-підказки в SecureStore', {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
