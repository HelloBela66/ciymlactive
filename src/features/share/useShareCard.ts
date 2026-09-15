import { useState, type RefObject } from 'react';
import type { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { captureRef } from 'react-native-view-shot';
import {
  SHARE_CARD_CAPTURE_OPTIONS,
  saveCardImageToLibrary,
  shareCardImage,
} from '@/lib/shareCardFile';
import {
  EMPTY_SHARE_CARD_FEEDBACK,
  SAVE_CARD_FAILED_FEEDBACK,
  SHARE_CARD_FAILED_FEEDBACK,
  describeSaveOutcome,
  describeShareOutcome,
  type ShareCardFeedback,
} from '@/lib/shareCardMessages';
import type { Logger } from '@/lib/logger';

/**
 * POLYTSIA V1.7, Phase 5 — SHARE INFRASTRUCTURE CONSOLIDATION (ТЗ V1.7 §13, §98), поведінкова
 * частина.
 *
 * ЩО САМЕ КОНСОЛІДОВАНО. Дублювались не лише три `*CardFile.ts` (див. `shareCardFile.ts`), а й
 * ~60 рядків у КОЖНОМУ з трьох екранів: `CAPTURE_OPTIONS`, дві `useMutation`, три `useState`,
 * два обробники з однаковим захистом від подвійного тапу й однакові тексти помилок. Це і є
 * справжня «share-інфраструктура» з §13 — самі файли були лише її верхівкою.
 *
 * ЧОМУ `useMutation`, А НЕ ПРОСТИЙ `async`-обробник: це збережено з наявних екранів навмисно —
 * `isPending` дає стан кнопки («Готую зображення…») без власного `useState`, а `onError` ловить
 * і синхронні, і асинхронні збої `captureRef`. Інлайн-мутація прямо у фічі (не в `data/`) — той
 * самий вибір, що вже діяв: це взаємодія з ПРИСТРОЄМ (захоплення View, системний «Поділитися»,
 * фотогалерея), а не SQLite-мутація даних, тож інвалідації кешу тут немає й бути не може.
 *
 * ЩО ЛИШАЄТЬСЯ ЕКРАНУ: сама картка (`<View ref={cardRef} collapsable={false}>`) і будь-які
 * налаштування шаблону. `collapsable={false}` — обов'язково для Android: без нього нативна
 * оптимізація дерева view може «сплющити» цей вузол, і `captureRef` або впаде, або захопить не
 * те (відоме обмеження `react-native-view-shot`). Цього хук за екран зробити не може, тому це
 * лишається його відповідальністю.
 */
export interface UseShareCardOptions {
  /** Реф на View, який захоплюється в зображення (потребує `collapsable={false}`). */
  cardRef: RefObject<View | null>;
  /** Заголовок системного діалогу «Поділитися» — єдине, чим фічі тут відрізняються. */
  dialogTitle: string;
  /** Логер екрана, щоб запис у лозі вказував на конкретну поверхню, а не на спільний хук. */
  log: Logger;
}

export interface UseShareCard extends ShareCardFeedback {
  share: () => void;
  save: () => void;
  /** Йде захоплення для «Поділитися» — для підпису кнопки. */
  isSharing: boolean;
  /** Йде захоплення для «Зберегти» — для підпису кнопки. */
  isSaving: boolean;
  /** Будь-яка з двох дій триває — обидві кнопки неактивні. */
  isBusy: boolean;
}

export function useShareCard({ cardRef, dialogTitle, log }: UseShareCardOptions): UseShareCard {
  const [feedback, setFeedback] = useState<ShareCardFeedback>(EMPTY_SHARE_CARD_FEEDBACK);

  const shareMutation = useMutation({
    mutationFn: async () => {
      const uri = await captureRef(cardRef, SHARE_CARD_CAPTURE_OPTIONS);
      return shareCardImage(uri, dialogTitle);
    },
    onSuccess: (shared) => setFeedback(describeShareOutcome(shared)),
    onError: (error) => {
      log.error('Не вдалося поділитися карткою', {
        error: error instanceof Error ? error.message : String(error),
      });
      setFeedback(SHARE_CARD_FAILED_FEEDBACK);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const uri = await captureRef(cardRef, SHARE_CARD_CAPTURE_OPTIONS);
      return saveCardImageToLibrary(uri);
    },
    onSuccess: (outcome) => setFeedback(describeSaveOutcome(outcome)),
    onError: (error) => {
      log.error('Не вдалося зберегти картку в галерею', {
        error: error instanceof Error ? error.message : String(error),
      });
      setFeedback(SAVE_CARD_FAILED_FEEDBACK);
    },
  });

  const isBusy = shareMutation.isPending || saveMutation.isPending;

  /**
   * Явна синхронна перевірка «вже виконується» (аудит M11, п.6.3) — той самий захист, що й
   * `handleStatusChange` в `app/work/[workId].tsx`, а не лише покладання на `Button.disabled`:
   * `disabled` стає `true` лише ПІСЛЯ повторного рендеру з новим `isPending`, тож швидкий
   * подвійний тап теоретично встигає натиснути двічі до того, як кнопка візуально стане
   * неактивною — тут другий виклик відсікається одразу.
   */
  const run = (action: () => void) => {
    if (isBusy) return;
    setFeedback(EMPTY_SHARE_CARD_FEEDBACK);
    action();
  };

  return {
    ...feedback,
    share: () => run(() => shareMutation.mutate()),
    save: () => run(() => saveMutation.mutate()),
    isSharing: shareMutation.isPending,
    isSaving: saveMutation.isPending,
    isBusy,
  };
}
