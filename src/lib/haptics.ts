import * as Haptics from 'expo-haptics';
import { createLogger } from './logger';

const log = createLogger('lib/haptics');

/**
 * ТЗ Фази 19 (DESIGN SYSTEM EXTENSION, §HAPTICS) — "light haptic feedback for: save journal;
 * finish reading; favorite; successful scan. НЕ на кожен тап." Єдина точка виклику
 * `Haptics.impactAsync` для всіх чотирьох місць — щоб не дублювати обробку помилки в кожному
 * виклику: на симуляторі/вебі/пристроях без вібромотора `expo-haptics` сам тихо нічого не
 * робить, але про всяк випадок помилка тут ловиться і лише логується, а не кидається — сама дія
 * користувача (збереження запису, зміна статусу тощо) не повинна залежати від успіху вібрації.
 *
 * У цьому застосунку немає окремої фічі сканування штрихкоду/ISBN камерою (лише фото обкладинки,
 * `app/cover-photo/[editionId].tsx`, і ручний ввід ISBN у пошуку) — тож "successful scan" із ТЗ
 * не має реального місця виклику; докладніше — `docs/DESIGN_SYSTEM_EXTENSION.md` §HAPTICS.
 */
export function triggerLightHapticFeedback(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((error: unknown) => {
    log.warn('Не вдалося відтворити haptic feedback', { error });
  });
}
