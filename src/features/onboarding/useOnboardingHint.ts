import { useCallback, useEffect, useState } from 'react';
import { OnboardingHintStorage, type OnboardingHintId } from '@/lib/onboardingHintStorage';

interface UseOnboardingHintResult {
  /** `true`, лише коли підтверджено (асинхронне читання `SecureStore` завершилось), що ця
   * підказка ще ЖОДНОГО разу не була показана. */
  visible: boolean;
  /** Ховає підказку одразу (локальний стан) і зберігає "показано" — підказка більше НІКОЛИ не
   * з'явиться на цьому пристрої, незалежно від того, чи повториться сама умова показу
   * (наприклад, `firstSession`/`firstFinishedBookCapsule` — лічильники, до яких екран можна
   * повернутись, доки не з'явиться друга сесія/книга). */
  dismiss: () => void;
}

/**
 * PROGRESSIVE ONBOARDING, Фаза 18 (`docs/PROGRESSIVE_ONBOARDING.md`) — спільний хук для всіх
 * трьох контекстних підказок цієї фази. За замовчуванням `visible: false` (той самий "не
 * показуй новий стан, доки не підтверджено" принцип, що й `isLibraryEmpty` у Фазі 17,
 * `app/(tabs)/index.tsx`) — для будь-якого користувача, що вже бачив цю підказку раніше
 * (переважна більшість відкриттів), жодного "блимання" немає: `visible` лишається `false` увесь
 * час. Лише коли `SecureStore` підтвердить "ще не бачив" — підказка з'являється.
 */
export function useOnboardingHint(id: OnboardingHintId): UseOnboardingHintResult {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    OnboardingHintStorage.hasSeen(id).then((seen) => {
      if (!cancelled && !seen) setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const dismiss = useCallback(() => {
    setVisible(false);
    void OnboardingHintStorage.markSeen(id);
  }, [id]);

  return { visible, dismiss };
}
