import { computeStaleReadingInfo, type StaleReadingInfo } from './staleReading';
import type { OldestWaitingInsight } from './tbrPersonality';
import type { ReadingSession } from '@/types/readingSession';
import type { ReadingGoal, ReadingGoalProgress } from '@/types/readingGoal';

/**
 * «Home Redesign» (ТЗ Фази 18, HOME REDESIGN, `docs/HOME_REDESIGN.md`) — Home НЕ повинен
 * показувати кілька контекстних карток одночасно ("Не показуй 5 одночасно. Створи
 * prioritization function"), тож уся логіка вибору ОДНІЄЇ картки живе тут, чистими функціями
 * (жодного SQL/React), той самий house-принцип, що й `onePicker.ts`/`tbrPersonality.ts`.
 *
 * ТЗ дає пріоритет у ДВОХ місцях дещо різними словами — розділ CONTEXTUAL HOME CARD перелічує
 * п'ять кандидатів як план (не порядок): "«Цей день у твоєму читанні»; Book Capsule ready;
 * давно не читав; goal near completion; TBR suggestion", а нижче в тому самому розділі дає
 * буквальний "Приклад пріоритету": "active stale reading → capsule due → on this day → goal →
 * TBR". Тут узятий буквальний приклад пріоритету як ЄДИНЕ джерело істини для порядку (докладне
 * обґрунтування цього вибору — `docs/HOME_REDESIGN.md` §Порядок пріоритету) — перелік вище був
 * просто списком назв карток, не порядком показу.
 */
export type HomeContextCardKind = 'stale_reading' | 'capsule_due' | 'on_this_day' | 'goal_near_completion' | 'tbr_suggestion';

export interface StaleReadingBookInput {
  userBookId: string;
  workId: string;
  title: string;
  coverUrl: string | null;
  coverFallbackColor: string | null;
  /** Найновіша ЗАВЕРШЕНА сесія книги, чи `null` — той самий вхід, що й `StaleReadingSection`
   * на Book Details (`app/work/[workId].tsx`). */
  lastSession: Pick<ReadingSession, 'endedAt' | 'endPage'> | null;
}

export interface StaleReadingCandidate {
  userBookId: string;
  workId: string;
  title: string;
  coverUrl: string | null;
  coverFallbackColor: string | null;
  info: StaleReadingInfo;
}

/**
 * Серед усіх книг зі статусом "Читаю"/"Перечитую" — та, що НАЙДОВШЕ не читалась (найбільший
 * `daysSinceLastSession`), якщо вона взагалі є (`computeStaleReadingInfo` уже враховує поріг
 * `STALE_READING_THRESHOLD_DAYS`). Той самий "хто найдовше чекає" принцип пріоритезації, що й
 * `findOldestWaitingBook`/`findCapsuleDueCandidate` нижче — послідовний вибір серед кандидатів
 * одного типу перед тим, як порівнювати РІЗНІ типи карток.
 */
export function findStaleReadingCandidate(books: StaleReadingBookInput[], now: Date): StaleReadingCandidate | null {
  let best: StaleReadingCandidate | null = null;
  for (const book of books) {
    const info = computeStaleReadingInfo(book.lastSession, now);
    if (!info) continue;
    if (!best || info.daysSinceLastSession > best.info.daysSinceLastSession) {
      best = {
        userBookId: book.userBookId,
        workId: book.workId,
        title: book.title,
        coverUrl: book.coverUrl,
        coverFallbackColor: book.coverFallbackColor,
        info,
      };
    }
  }
  return best;
}

export interface CapsuleDueCandidateInput {
  capsuleId: string;
  userBookId: string;
  workId: string;
  title: string;
  coverUrl: string | null;
  coverFallbackColor: string | null;
  reopenAt: string | null;
  openedAt: string | null;
}

export interface CapsuleDueCandidate {
  capsuleId: string;
  userBookId: string;
  workId: string;
  title: string;
  coverUrl: string | null;
  coverFallbackColor: string | null;
  reopenAt: string;
}

/**
 * Капсули "ready" (ТЗ: "Book Capsule ready") — `reopenAt` уже настав ВІДНОСНО `now`
 * (`BookCapsuleRepository.getDue`-еквівалент, той самий поріг, що й `isCapsuleDue` у
 * `bookCapsule.ts`) і ще НЕ переглянуті (`openedAt == null` — уже відкритий recall не повинен
 * знову й знову займати слот). УСІ такі, найдовше прострочена перша (найраніший `reopenAt`) —
 * Фаза 16 (MEMORY HUB HIERARCHY, `docs/MEMORY_HUB.md`) додала цю функцію для розділу
 * "Час згадати" на `app/memory/index.tsx`: до цієї фази `BookCapsuleRepository.getDue`
 * використовувався лише для ОДНОГО Home-слоту (`findCapsuleDueCandidate` нижче, тепер побудована
 * поверх цієї функції — той самий фільтр/сортування, просто без обрізання до одного елемента).
 */
export function listDueCapsuleCandidates(capsules: CapsuleDueCandidateInput[], now: Date): CapsuleDueCandidate[] {
  const nowIso = now.toISOString();
  return capsules
    .filter((c): c is CapsuleDueCandidateInput & { reopenAt: string } => c.openedAt == null && c.reopenAt != null && c.reopenAt <= nowIso)
    .map((c) => ({
      capsuleId: c.capsuleId,
      userBookId: c.userBookId,
      workId: c.workId,
      title: c.title,
      coverUrl: c.coverUrl,
      coverFallbackColor: c.coverFallbackColor,
      reopenAt: c.reopenAt,
    }))
    .sort((a, b) => (a.reopenAt < b.reopenAt ? -1 : a.reopenAt > b.reopenAt ? 1 : 0));
}

/**
 * Капсула "ready", найдовше прострочена — той самий "хто найдовше чекає" принцип, що й
 * `findStaleReadingCandidate` вище. З Фази 16 — тонка обгортка над `listDueCapsuleCandidates`
 * (перший елемент уже відсортованого списку); поведінка НЕ змінилась.
 */
export function findCapsuleDueCandidate(capsules: CapsuleDueCandidateInput[], now: Date): CapsuleDueCandidate | null {
  return listDueCapsuleCandidates(capsules, now)[0] ?? null;
}

export interface GoalCandidate {
  goal: ReadingGoal;
  progress: ReadingGoalProgress;
}

/** Наскільки близько до виконання ціль повинна бути, щоб вважатись "near completion" (ТЗ не
 * дає точного числа) — 80% обрано так само, як `STALE_READING_THRESHOLD_DAYS`/`MIN_*`-пороги
 * деінде: досить високо, щоб "near" не означало "щойно почав", і досить конкретно, щоб лишатись
 * легко поясненим числом. */
export const GOAL_NEAR_COMPLETION_RATIO = 0.8;

/**
 * Серед активних (не виконаних, не скасованих) цілей — та, що найближче до виконання, якщо
 * хоч одна перетнула поріг `GOAL_NEAR_COMPLETION_RATIO`. Цілі з `target <= 0` (теоретично
 * неможливо за валідацією форми, `CreateReadingGoalInputSchema`, але захисно) пропускаються —
 * ділення на нуль тут не повинно "виграти" слот через `Infinity`.
 */
export function findGoalNearCompletionCandidate(goals: GoalCandidate[]): GoalCandidate | null {
  let best: GoalCandidate | null = null;
  let bestRatio = 0;
  for (const item of goals) {
    if (item.goal.status !== 'active' || item.progress.isComplete) continue;
    if (item.progress.target <= 0) continue;
    const ratio = item.progress.current / item.progress.target;
    if (ratio < GOAL_NEAR_COMPLETION_RATIO) continue;
    if (ratio > bestRatio) {
      best = item;
      bestRatio = ratio;
    }
  }
  return best;
}

export type HomeContextCard =
  | { kind: 'stale_reading'; candidate: StaleReadingCandidate }
  | { kind: 'capsule_due'; candidate: CapsuleDueCandidate }
  | { kind: 'on_this_day' }
  | { kind: 'goal_near_completion'; candidate: GoalCandidate }
  | { kind: 'tbr_suggestion'; bookCount: number; oldestWaiting: OldestWaitingInsight | null };

export interface HomeContextSelectionInput {
  staleReading: StaleReadingCandidate | null;
  capsuleDue: CapsuleDueCandidate | null;
  /** Чи `OnThisDayCard` сама вирішила б показатись (`selectHomePrimaryMemory(summary) != null`,
   * `src/lib/onThisDay.ts`) — сам вміст картки лишається повністю в `OnThisDayCard`, тут
   * потрібен лише булевий сигнал "чи вона хоче зайняти слот". */
  onThisDayAvailable: boolean;
  goalNearCompletion: GoalCandidate | null;
  tbrBookCount: number;
  tbrOldestWaiting: OldestWaitingInsight | null;
}

/**
 * ЄДИНА точка вибору контекстної картки Home (ТЗ: "У конкретний момент показуй максимум ОДНУ
 * context card... Не показуй 5 одночасно"). Пріоритет — буквальний приклад з ТЗ: active stale
 * reading → capsule due → on this day → goal → TBR (обґрунтування вибору цього порядку серед
 * двох дещо різних формулювань ТЗ — див. коментар над модулем і `docs/HOME_REDESIGN.md`).
 * `null`, коли жоден кандидат не застосовується — Home тоді просто не показує розділ контекстної
 * картки (та сама "тиха деградація", що й `OnThisDayCard`/усі insight-фічі V1.6).
 */
export function selectHomeContextCard(input: HomeContextSelectionInput): HomeContextCard | null {
  if (input.staleReading) return { kind: 'stale_reading', candidate: input.staleReading };
  if (input.capsuleDue) return { kind: 'capsule_due', candidate: input.capsuleDue };
  if (input.onThisDayAvailable) return { kind: 'on_this_day' };
  if (input.goalNearCompletion) return { kind: 'goal_near_completion', candidate: input.goalNearCompletion };
  if (input.tbrBookCount > 0) {
    return { kind: 'tbr_suggestion', bookCount: input.tbrBookCount, oldestWaiting: input.tbrOldestWaiting };
  }
  return null;
}
