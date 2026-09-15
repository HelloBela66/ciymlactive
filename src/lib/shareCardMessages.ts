/**
 * POLYTSIA V1.7, Phase 5 — SHARE INFRASTRUCTURE CONSOLIDATION (ТЗ V1.7 §13, §98), текстова
 * (чиста) частина.
 *
 * ЧОМУ ЦЕЙ ФАЙЛ ІСНУЄ ОКРЕМО ВІД `shareCardFile.ts`: той імпортує `expo-sharing`/
 * `expo-media-library`, тобто нативні модулі; тут — самі рядки й перехід «результат → що
 * показати користувачу», без жодної залежності від Expo, тож ця логіка покривається звичайним
 * unit-тестом, а не лише очима.
 *
 * ОДИН НАБІР ФОРМУЛЮВАНЬ НА ВЕСЬ ЗАСТОСУНОК. До цієї консолідації ті самі шість рядків
 * («Готую зображення…», «Системне "Поділитися" тут недоступне.», «Картку збережено в галерею.»,
 * два тексти про дозвіл і два про помилку) жили ТРИЧІ — окремими копіями в `app/memory/
 * [workId].tsx`, `app/seasons/[seasonKey].tsx` і `app/fingerprint.tsx`. Розходження там ще не
 * встигло статись, але четверта копія (Recap) уже зробила б це питанням часу.
 */

/** Результат спроби зберегти картку в галерею. Тип живе тут, а не в `shareCardFile.ts`, щоб цей
 * модуль лишався вільним від нативних імпортів. */
export type SaveShareCardOutcome =
  | { kind: 'saved' }
  | { kind: 'permission_denied'; canAskAgain: boolean };

/**
 * Те, що екран показує під кнопками. Три поля замість одного рядка, бо це три різні речі:
 * нейтральний статус, помилка дозволу (інший колір) і «дозвіл заблоковано назавжди» (з'являється
 * кнопка «Відкрити налаштування»).
 */
export interface ShareCardFeedback {
  statusMessage: string | null;
  permissionError: string | null;
  permissionBlocked: boolean;
}

export const EMPTY_SHARE_CARD_FEEDBACK: ShareCardFeedback = {
  statusMessage: null,
  permissionError: null,
  permissionBlocked: false,
};

function status(message: string | null): ShareCardFeedback {
  return { statusMessage: message, permissionError: null, permissionBlocked: false };
}

export const SHARE_CARD_FAILED_FEEDBACK = status('Не вдалося поділитися карткою. Спробуй ще раз.');
export const SAVE_CARD_FAILED_FEEDBACK = status('Не вдалося зберегти картку. Спробуй ще раз.');

/**
 * `shared === false` — системного «Поділитися» на цьому пристрої немає
 * (`Sharing.isAvailableAsync()`); це не помилка застосунку, тож нейтральний статус, а не
 * червоний текст. `shared === true` — діалог показано, і сказати вже нема чого: користувач
 * бачить результат сам, зайвий рядок «готово» був би шумом.
 */
export function describeShareOutcome(shared: boolean): ShareCardFeedback {
  return status(shared ? null : 'Системне "Поділитися" тут недоступне.');
}

/**
 * `canAskAgain === false` означає, що системний діалог більше не з'явиться — просити ще раз
 * марно, єдиний шлях — налаштування пристрою. Саме тому текст різний, а `permissionBlocked`
 * вмикає окрему кнопку: інакше користувач тиснув би «Зберегти» вдруге й утретє без жодної
 * реакції системи.
 */
export function describeSaveOutcome(outcome: SaveShareCardOutcome): ShareCardFeedback {
  if (outcome.kind === 'saved') return status('Картку збережено в галерею.');
  return {
    statusMessage: null,
    permissionError: outcome.canAskAgain
      ? 'Немає дозволу зберегти в галерею.'
      : 'Доступ до збереження фото відхилено назавжди — увімкни дозвіл для «Полиці» в налаштуваннях пристрою.',
    permissionBlocked: !outcome.canAskAgain,
  };
}
