import { computeStaleReadingInfo, type StaleReadingInfo } from './staleReading';
import type { MemoryResurfacingCandidate } from './memoryResurfacing';
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
export type HomeContextCardKind =
  | 'stale_reading'
  | 'capsule_due'
  | 'milestone'
  | 'on_this_day'
  | 'memory_resurfacing'
  | 'goal_near_completion'
  | 'tbr_suggestion';

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

/**
 * POLYTSIA V1.7, Phase 8 (ТЗ §21-§23) — віха як кандидат на контекстну картку.
 *
 * Свідомо МІНІМАЛЬНИЙ тип: лише id (для приглушення) і момент. Сам текст віхи будує
 * `formatMilestoneCopy`, а дані — `useReadingMilestones`; цей чистий модуль про віхи нічого не
 * знає й знати не мусить — він лише обирає, чий слот.
 */
export interface MilestoneCandidate {
  id: string;
  at: string;
}

/**
 * Скільки днів віха лишається «новиною» для Home. Стара віха не спливає раптово на головній через
 * рік — вона лишається в Reading Life, де їй і місце. Це НЕ нагадування й не pre-milestone
 * сповіщення (ТЗ §26): картка показується лише тому, що подія щойно сталась.
 */
export const MILESTONE_HOME_CARD_MAX_AGE_DAYS = 14;

/** Найновіша віха, якщо вона достатньо свіжа, щоб бути новиною (див. константу вище). */
export function findRecentMilestoneCandidate(
  milestones: MilestoneCandidate[],
  now: Date,
): MilestoneCandidate | null {
  const latest = milestones.length > 0 ? milestones[milestones.length - 1] : undefined;
  if (!latest) return null;
  const ageMs = now.getTime() - new Date(latest.at).getTime();
  if (ageMs < 0) return null;
  return ageMs <= MILESTONE_HOME_CARD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000 ? latest : null;
}

export type HomeContextCard =
  | { kind: 'stale_reading'; candidate: StaleReadingCandidate }
  | { kind: 'capsule_due'; candidate: CapsuleDueCandidate }
  | { kind: 'milestone'; candidate: MilestoneCandidate }
  | { kind: 'on_this_day' }
  | { kind: 'memory_resurfacing'; candidate: MemoryResurfacingCandidate }
  | { kind: 'goal_near_completion'; candidate: GoalCandidate }
  | { kind: 'tbr_suggestion'; bookCount: number; oldestWaiting: OldestWaitingInsight | null };

export interface HomeContextSelectionInput {
  staleReading: StaleReadingCandidate | null;
  capsuleDue: CapsuleDueCandidate | null;
  /** Чи `OnThisDayCard` сама вирішила б показатись (`selectHomePrimaryMemory(summary) != null`,
   * `src/lib/onThisDay.ts`) — сам вміст картки лишається повністю в `OnThisDayCard`, тут
   * потрібен лише булевий сигнал "чи вона хоче зайняти слот". */
  onThisDayAvailable: boolean;
  /** POLYTSIA V1.7, Phase 8 — найсвіжіша віха, якщо вона є (`findRecentMilestoneCandidate`). */
  milestone: MilestoneCandidate | null;
  /**
   * POLYTSIA V1.7, Phase 9 (ТЗ модуль E §2B, §7) — ambient-спогад, ЯКЩО він узагалі має право
   * зараз показатись. Уся рідкість (не частіше разу на 7 днів) і cooldown конкретного спогаду
   * вирішені ДО цієї точки, у `selectHomeResurfacingCandidate` — сюди приходить або готовий
   * кандидат, або `null`. Цей модуль про пам'ять нічого не знає; він лише роздає єдиний слот.
   */
  memoryResurfacing: MemoryResurfacingCandidate | null;
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
  // POLYTSIA V1.7, Phase 8 (ТЗ §22) — віха стоїть ВИЩЕ за `on_this_day`, але нижче за дві
  // перші. Логіка: перші дві картки — про те, що людина може зробити ЗАРАЗ (покинуте читання,
  // капсула, час якої настав); віха — рідкісна подія, що щойно сталась; `on_this_day`
  // ротується щодня сам і нічого не втрачає, якщо поступиться слотом раз на кілька років.
  // Card flood не виникає: слот усе одно рівно один (ТЗ §22).
  if (input.milestone) return { kind: 'milestone', candidate: input.milestone };
  if (input.onThisDayAvailable) return { kind: 'on_this_day' };
  // POLYTSIA V1.7, Phase 9 (ТЗ модуль E §7) — resurfacing НИЖЧЕ за віху й за On This Day, але
  // вище за ціль і TBR. ТЗ дає «концептуальний» пріоритет із Year/Month/Week Recap угорі, але
  // просить звірити з live code, а не переносити список механічно: recap-карток на Home НЕ
  // існує (Recap — окремі екрани, `app/reading-recap/*`), тож у фактичній мапі їм нема чого
  // посунути. Лишається саме те, що ТЗ вимагає по суті: спогад не домінує над Home і поступається
  // і рідкісній віхі, і сьогоднішньому On This Day.
  if (input.memoryResurfacing) return { kind: 'memory_resurfacing', candidate: input.memoryResurfacing };
  if (input.goalNearCompletion) return { kind: 'goal_near_completion', candidate: input.goalNearCompletion };
  if (input.tbrBookCount > 0) {
    return { kind: 'tbr_suggestion', bookCount: input.tbrBookCount, oldestWaiting: input.tbrOldestWaiting };
  }
  return null;
}

/**
 * POLYTSIA V1.6.2, #169 (HOME CONTEXT SUPPRESSION) — до цієї фази ЖОДЕН з п'яти типів
 * контекстної картки не мав способу, яким користувач міг би сказати "не зараз, прибери це":
 * `capsule_due` зникає лише після повного recall-флоу (`markOpened`), `on_this_day` — лише
 * наступного календарного дня, а `stale_reading`/`goal_near_completion`/`tbr_suggestion` не
 * зникають взагалі, доки не зміниться сам факт (книга прочитана, ціль виконана) — `tbr_suggestion`
 * найпоказовіше: доки в "Хочу прочитати" лишається хоч одна книга, ця картка може показуватись
 * ідентичною щодня необмежено довго. Ключ ідентифікує КОНКРЕТНОГО кандидата (не просто тип
 * картки) — щоб приховання due-капсули книги A сьогодні не приховало б завтрашню due-капсулу
 * геть іншої книги B; для `on_this_day`/`tbr_suggestion`, де немає стабільного "хто саме"
 * (спогад ротується щодня сам, TBR-пропозиція — по всьому пулу), ключ — просто тип картки.
 */
export function getHomeContextCardSuppressionKey(card: HomeContextCard): string {
  switch (card.kind) {
    case 'stale_reading':
      return `stale_reading:${card.candidate.userBookId}`;
    case 'capsule_due':
      return `capsule_due:${card.candidate.capsuleId}`;
    // Ключ — КОНКРЕТНА віха, не тип: приховати «50-ту книгу» сьогодні не повинно приховати
    // «100 годин» наступного місяця (ТЗ §23). Приглушення не видаляє віху з Reading Life.
    case 'milestone':
      return `milestone:${card.candidate.id}`;
    case 'on_this_day':
      return 'on_this_day';
    // Ключ — КОНКРЕТНИЙ спогад (ТЗ §10, §21): «не сьогодні» для однієї цитати не повинно
    // приховати геть інший спогад завтра. Це денне приглушення й НЕ замінює 90-денний cooldown
    // самого спогаду (`HOME_RESURFACING_CANDIDATE_COOLDOWN_DAYS`) — механізми різні за терміном і
    // за джерелом істини, і навмисно не об'єднані.
    case 'memory_resurfacing':
      return `memory_resurfacing:${card.candidate.semanticKey}`;
    case 'goal_near_completion':
      return `goal_near_completion:${card.candidate.goal.id}`;
    case 'tbr_suggestion':
      return 'tbr_suggestion';
  }
}

/**
 * #169 — прибирає з `HomeContextSelectionInput` рівно того кандидата, чий тип щойно програв
 * через приглушення, щоб наступна ітерація `selectVisibleHomeContextCard` природно "провалилась"
 * до наступного за пріоритетом кандидата — той самий механізм, яким уже сьогодні `capsuleDue`
 * стає `null` після фільтра `openedAt` ДО виклику `selectHomeContextCard` (`useHomeContextCard.ts`),
 * лише узагальнений на всі п'ять типів і застосований ПІСЛЯ вибору, а не до нього (приглушення
 * стосується КОНКРЕТНОГО обраного кандидата, не всього типу одразу).
 */
export function nullifyHomeContextCandidate(
  input: HomeContextSelectionInput,
  kind: HomeContextCardKind,
): HomeContextSelectionInput {
  switch (kind) {
    case 'stale_reading':
      return { ...input, staleReading: null };
    case 'capsule_due':
      return { ...input, capsuleDue: null };
    case 'milestone':
      return { ...input, milestone: null };
    case 'on_this_day':
      return { ...input, onThisDayAvailable: false };
    case 'memory_resurfacing':
      return { ...input, memoryResurfacing: null };
    case 'goal_near_completion':
      return { ...input, goalNearCompletion: null };
    case 'tbr_suggestion':
      return { ...input, tbrBookCount: 0 };
  }
}

/** Скільки типів карток існує — межа циклу нижче, щоб приглушення НЕ МОГЛО зациклитись
 * (кожна ітерація або повертає картку, або приглушує рівно один тип і ніколи не повертає його). */
const HOME_CONTEXT_CARD_KIND_COUNT = 7;

/**
 * #169 — той самий вибір, що й `selectHomeContextCard`, але з урахуванням приглушених сьогодні
 * карток (`suppressedKeys` — уже прочитані й непрострочені ключі з `homeContextSuppressionStorage.ts`,
 * читання/сховище навмисно поза цією чистою функцією, той самий "чиста функція + тонка обгортка"
 * розподіл, що й `fetchReadingSeasonData`/`useReadingSeason` у #167). Коли обраний кандидат
 * приглушений — він прибирається (`nullifyHomeContextCandidate`) і вибір повторюється для решти,
 * аж доки не знайдеться неприглушений кандидат або кандидати не закінчаться — та сама "тиха
 * деградація", що й `selectHomeContextCard`: `null`, коли показати нічого.
 */
export function selectVisibleHomeContextCard(
  input: HomeContextSelectionInput,
  suppressedKeys: ReadonlySet<string>,
): HomeContextCard | null {
  let current = input;
  for (let i = 0; i < HOME_CONTEXT_CARD_KIND_COUNT; i++) {
    const card = selectHomeContextCard(current);
    if (!card) return null;
    if (!suppressedKeys.has(getHomeContextCardSuppressionKey(card))) return card;
    current = nullifyHomeContextCandidate(current, card.kind);
  }
  return null;
}
