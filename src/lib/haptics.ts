import * as Haptics from 'expo-haptics';
import { createLogger } from './logger';

const log = createLogger('lib/haptics');

/**
 * ТЗ Фази 19 V1.6 (DESIGN SYSTEM EXTENSION, §HAPTICS) — "light haptic feedback for: save
 * journal; finish reading; favorite; successful scan. НЕ на кожен тап." Єдина точка виклику
 * `Haptics.impactAsync` для всіх чотирьох місць — щоб не дублювати обробку помилки в кожному
 * виклику: на симуляторі/вебі/пристроях без вібромотора `expo-haptics` сам тихо нічого не
 * робить, але про всяк випадок помилка тут ловиться і лише логується, а не кидається — сама дія
 * користувача (збереження запису, зміна статусу тощо) не повинна залежати від успіху вібрації.
 *
 * Усі 4 приклади ТЗ підключені: збереження запису щоденника, завершення книги, позначення
 * "улюблене" (лише при встановленні), і, з POLYTSIA V1.6.1 Фази 23 (`docs/HAPTICS_CLEANUP.md`),
 * успішне сканування ISBN камерою (`app/isbn-scan.tsx`) — Фаза 19 V1.6 помилково вважала, що
 * цієї фічі в застосунку взагалі немає (вона існує з Milestone 7, задовго до написання того
 * запису); Фаза 23 виправила і сам виклик, і факт у `CHANGELOG.md`.
 */
export function triggerLightHapticFeedback(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((error: unknown) => {
    log.warn('Не вдалося відтворити haptic feedback', { error });
  });
}
