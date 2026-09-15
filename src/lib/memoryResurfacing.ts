import { differenceInCalendarDays } from 'date-fns';
import { getElapsedCalendarPeriod } from './elapsedPeriod';
import { readingDayKeyOf } from './readingCalendar';
import type { JournalEntryType } from '@/types/journalEntry';
import type { UserBookStatus } from '@/types/userBook';

/**
 * POLYTSIA V1.7, Phase 9 — MEMORY RESURFACING (ТЗ V1.7 модуль E).
 *
 * ── ЩО ЦЕ ТАКЕ ───────────────────────────────────────────────────────────────────────────────
 * М'яке повернення до власної читацької пам'яті. НЕ reminder, НЕ retention, НЕ push.
 * Питання, на яке відповідає модуль: «яку частину своєї читацької історії людині буде приємно
 * випадково зустріти знову?» — а не «що змусить її знову відкрити застосунок».
 *
 * ── ЯК ЗАБОРОНИ ТЗ ЗРОБЛЕНО СТРУКТУРНИМИ, А НЕ ДОМОВЛЕНІСТЮ ──────────────────────────────────
 * ТЗ §4/§24/§28 забороняють inactivity, streak, вік TBR і незавершені книги як тригери. Найтонше
 * місце тут — що заборону легко порушити випадково, дописавши «ще одне поле» через рік. Тому вона
 * винесена в ТИПИ ВХОДУ: `MemoryResurfacingInput` нижче фізично не має полів `daysSinceLastSession`,
 * `streak`, `goal`, `tbrAddedAt`, `currentPage` — і не може їх мати, бо цей модуль нічого, окрім
 * уже СТВОРЕНИХ записів і ЗАВЕРШЕНИХ проходів, не приймає. Щоб зробити з бездіяльності кандидата,
 * довелось би спершу розширити вхідний тип — тобто свідомо, а не мимохідь (тест §28 стереже саме
 * це: книга без записів і без завершених проходів не дає кандидата, хоч би скільки її не читали).
 *
 * `notifications.ts` тут не імпортується й не може бути імпортований (ТЗ §1) — resurfacing живе
 * лише на двох ЕКРАННИХ поверхнях: Memory Hub (pull) і один слот Home (ambient).
 *
 * ── ЖОДНОЇ НОВОЇ ТАБЛИЦІ (ТЗ §20, §33) ───────────────────────────────────────────────────────
 * Кандидати derived із `note`/`quote`/`reading_run`, як і Reading Life, Recaps та Milestones.
 * `memory_resurfacing_event` не існує й не потрібен. Єдиний стан, який модуль пам'ятає між
 * показами, — коли що показувалось (`HomeResurfacingState`), і це presentation state, не історія
 * читання: живе в SecureStore поза бекапом (`resurfacingPresentationStorage.ts`).
 *
 * ── ЧИСТІ ФУНКЦІЇ ────────────────────────────────────────────────────────────────────────────
 * Жодного `new Date()`/SQL/React усередині — `now` завжди параметр (той самий house-патерн, що й
 * `onThisDay.ts`/`readingMilestones.ts`).
 */

// ─── ПОРОГИ ───────────────────────────────────────────────────────────────────────────────────

/**
 * ТЗ §8: Home показує ambient-спогад не частіше разу на 7 днів. Це НЕ те саме, що приглушення
 * «не сьогодні» (§10) — той механізм прибирає одну картку на день, цей тримає саму рідкість:
 * «reading memory повинна залишатися приємною рідкістю».
 */
export const HOME_RESURFACING_MIN_INTERVAL_DAYS = 7;

/**
 * ТЗ §9: один і той самий спогад не повертається на Home раніше ніж через 90 днів після показу
 * (чи відхилення). Без цього «рідкість раз на 7 днів» звелася б до того, що одна й та сама
 * найсильніша цитата спливала б щотижня.
 */
export const HOME_RESURFACING_CANDIDATE_COOLDOWN_DAYS = 90;

/**
 * Наскільки старим має бути запис, щоб стати СПОГАДОМ (ТЗ §3A «Старі…»). Пів року обрано як
 * поріг, за яким запис уже не частина поточного читацького контексту: нотатка з минулого тижня —
 * це не «випадково зустріти знову», це просто нотатка. Точне число ТЗ не задає.
 */
export const MIN_JOURNAL_MEMORY_AGE_DAYS = 180;

/**
 * Скільки ПОВНИХ років має минути, щоб стосунок із книгою став спогадом (ТЗ §3C: «Минуло три
 * роки від першого читання…»). Менше року — ще не дистанція, з якої озираються.
 */
export const MIN_RELATIONSHIP_MEMORY_YEARS = 1;

/** Скільки кандидатів максимум віддає Memory Hub (ТЗ §13, §35 — не нескінченна стрічка). */
export const MEMORY_HUB_RESURFACING_LIMIT = 6;

// ─── СЕМАНТИЧНА ІДЕНТИЧНІСТЬ (ТЗ §21) ─────────────────────────────────────────────────────────

/**
 * ТЗ §21 вимагає дедуплікації за СУТНІСТЮ, а не за відрендереним текстом. Ключі будуються тут —
 * однією функцією на кожен вид джерела — щоб обидві сторони порівняння (кандидат resurfacing і
 * те, що вже показує On This Day / віха / recap) складали рядок ОДНАКОВО. Якби кожна сторона
 * клеїла свій формат, дедуп мовчки перестав би працювати від однієї зайвої двокрапки.
 */
export function journalSemanticKey(entryId: string): string {
  return `journal:${entryId}`;
}

export function runSemanticKey(runId: string): string {
  return `run:${runId}`;
}

/** Стосунок із твором у цілому («повертався двічі», «три роки від першого читання»). */
export function workRelationshipSemanticKey(workId: string): string {
  return `work-relationship:${workId}`;
}

export function periodSemanticKey(periodKind: 'month' | 'year', periodKey: string): string {
  return `period:${periodKind}:${periodKey}`;
}

// ─── КАНДИДАТ ─────────────────────────────────────────────────────────────────────────────────

export type MemoryResurfacingKind =
  | 'journal_memory'
  | 'book_memory'
  | 'reading_relationship'
  | 'past_period';

export interface MemoryResurfacingCandidate {
  /** Він же ідентичність для дедупу й для cooldown (ТЗ §21) — див. `*SemanticKey` вище. */
  semanticKey: string;
  kind: MemoryResurfacingKind;
  /** Коли сталася САМА подія (не коли її показали). */
  occurredAt: string;
  workId: string | null;
  userBookId: string | null;
  bookTitle: string | null;
  coverUrl: string | null;
  coverFallbackColor: string | null;
  /** Текст запису — лише для `journal_memory`. */
  text: string | null;
  /** Вид запису — лише для `journal_memory`; потрібен текстам, щоб сказати «цю цитату», а не
   * «цей запис» (`memoryResurfacingCopy.ts`). */
  entryType: JournalEntryType | null;
  /** Скільки разів книгу завершено — лише для `reading_relationship`. */
  finishedRunCount: number | null;
  /** Куди веде `past_period` (ТЗ §3D — лише посилання на вже існуючий Recap). */
  periodKind: 'month' | 'year' | null;
  periodKey: string | null;
  /**
   * ТЗ §13 «candidate quality > quantity»: чому цей кандидат заслуговує показу. Менше — вагоміше.
   * Порядок успадкований від канонічного пріоритету On This Day (ТЗ §3A, §5: «не вигадуй новий
   * пріоритет, якщо existing On This Day вже має canonical порядок»).
   */
  weight: number;
  /**
   * Чи може кандидат зайняти слот Home. `false` — лише Memory Hub. Так виражені §3D (період —
   * навігація до вже існуючого артефакту, а не ambient-спогад) і §6 (капсульний контент не
   * отримує автоматичного Home-нагадування).
   */
  homeEligible: boolean;
}

// ─── ВХІД ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Запис щоденника як потенційний спогад (ТЗ §3A).
 *
 * `bookStatus` тут ЄДИНЕ поле про поточний стан книги, і воно використовується рівно для одного —
 * виключити `did_not_finish` (ТЗ §4: DNF не повинен спливати як заклик повернутися). Воно НЕ бере
 * участі ні в якому «давно не читав» — такого поняття в цьому модулі немає.
 *
 * Спойлер-фільтрація тут НЕ повторюється: вона вже застосована централізовано
 * (`isSpoilerHidden`, `spoilerSafe.ts`) там, де читаються рядки — `JournalRepository.listFeedPage`
 * (ТЗ §15: resurfacing не створює власної spoiler-реалізації). Це стосується й перечитування
 * (ТЗ §16): `isSpoilerSafeActive` вмикається і для `rereading`, а `current_page` під час
 * перечитування показує прогрес ПОТОЧНОГО проходу — тож старий запис першого проходу, що
 * випереджає поточну сторінку, ховається сам, без жодного коду тут.
 */
export interface JournalMemoryInput {
  entryId: string;
  entryType: JournalEntryType;
  isFavorite: boolean;
  text: string;
  createdAt: string;
  userBookId: string;
  workId: string;
  workTitle: string;
  coverUrl: string | null;
  coverFallbackColor: string | null;
  bookStatus: UserBookStatus;
}

/** Завершений прохід книги (ТЗ §3B/§3C). Незавершені проходи сюди не потрапляють взагалі. */
export interface FinishedRunMemoryInput {
  runId: string;
  userBookId: string;
  workId: string;
  workTitle: string;
  coverUrl: string | null;
  coverFallbackColor: string | null;
  finishedAt: string;
  /** Скільки ЗАВЕРШЕНИХ проходів має цей твір усього (для «повертався двічі»). */
  finishedRunCount: number;
  /** Чи це найперший завершений прохід твору — якір для «N років від першого читання». */
  isFirstFinishedRun: boolean;
}

/** Період, для якого ВЖЕ існує завершений Recap (ТЗ §3D — не створюємо другу копію recap). */
export interface PastPeriodMemoryInput {
  periodKind: 'month' | 'year';
  periodKey: string;
  /** Момент, яким період представлений на шкалі часу (як правило — його кінець). */
  occurredAt: string;
}

/**
 * Свідомо вузький вхід (див. докблок модуля): лише вже створені записи, лише завершені проходи,
 * лише вже наявні recap-періоди. Жодного сигналу про бездіяльність, streak, цілі чи TBR.
 */
export interface MemoryResurfacingInput {
  journalEntries: JournalMemoryInput[];
  finishedRuns: FinishedRunMemoryInput[];
  pastPeriods: PastPeriodMemoryInput[];
  now: Date;
}

// ─── ВАГА (ТЗ §3A, §5, §13) ───────────────────────────────────────────────────────────────────

/**
 * Той самий канонічний порядок, що вже діє в `onThisDay.ts#journalPreviewPriority`
 * (favorite → moment → thought → quote → інше). ТЗ §3A/§5 прямо просять перевикористати його там,
 * де семантика збігається, а не вигадувати новий. Він не імпортований звідти лише тому, що там
 * функція приватна й типізована під `OnThisDayJournalPreview`; значення й порядок — ті самі, і
 * тест стереже, що вони не розійдуться.
 */
function journalMemoryWeight(entry: JournalMemoryInput): number {
  if (entry.isFavorite) return 0;
  if (entry.entryType === 'moment') return 1;
  if (entry.entryType === 'thought') return 2;
  if (entry.entryType === 'quote') return 3;
  return 4;
}

/** Ваги видів між собою: спогад із власними словами людини вагоміший за похідний факт. */
const RELATIONSHIP_WEIGHT = 5;
const BOOK_MEMORY_WEIGHT = 6;
const PAST_PERIOD_WEIGHT = 7;

/**
 * «Змістовний» запис (ТЗ §3A: moment / thought / quote / інші meaningful). `question`, `theory` і
 * `general` проходять лише як обране — інакше Memory Hub сповз би в «40 старих нотаток
 * хронологічним списком», що ТЗ §13 прямо називає відповідальністю Журналу, а не resurfacing.
 */
function isMeaningfulJournalEntry(entry: JournalMemoryInput): boolean {
  if (entry.isFavorite) return true;
  return entry.entryType === 'moment' || entry.entryType === 'thought' || entry.entryType === 'quote';
}

// ─── ПОБУДОВА КАНДИДАТІВ ──────────────────────────────────────────────────────────────────────

/**
 * Усі кандидати, відсортовані детерміновано (ТЗ §14). Відбір «що саме показати» — окремо
 * (`selectHomeResurfacingCandidate`/`selectHubResurfacingCandidates`), щоб обидві поверхні
 * дивились на ОДИН список і не могли розійтись у тому, що взагалі вважається спогадом.
 *
 * ОДИН прохід по кожному масиву (ТЗ §35) — жодного «для кожного порогу пройти всю історію».
 */
export function buildMemoryResurfacingCandidates(
  input: MemoryResurfacingInput,
): MemoryResurfacingCandidate[] {
  const candidates: MemoryResurfacingCandidate[] = [];
  const nowIso = input.now.toISOString();

  for (const entry of input.journalEntries) {
    // ТЗ §4: DNF не спливає — ні як запис, ні як книга.
    if (entry.bookStatus === 'did_not_finish') continue;
    if (entry.text.trim().length === 0) continue;
    if (!isMeaningfulJournalEntry(entry)) continue;
    if (differenceInCalendarDays(input.now, new Date(entry.createdAt)) < MIN_JOURNAL_MEMORY_AGE_DAYS) continue;

    candidates.push({
      semanticKey: journalSemanticKey(entry.entryId),
      kind: 'journal_memory',
      occurredAt: entry.createdAt,
      workId: entry.workId,
      userBookId: entry.userBookId,
      bookTitle: entry.workTitle,
      coverUrl: entry.coverUrl,
      coverFallbackColor: entry.coverFallbackColor,
      text: entry.text,
      entryType: entry.entryType,
      finishedRunCount: null,
      periodKind: null,
      periodKey: null,
      weight: journalMemoryWeight(entry),
      homeEligible: true,
    });
  }

  for (const run of input.finishedRuns) {
    const ageDays = differenceInCalendarDays(input.now, new Date(run.finishedAt));

    /**
     * ТЗ §3C. Свідомо НЕ прив'язано до сьогоднішньої календарної дати: «N років тому САМЕ
     * СЬОГОДНІ» — це рівно той engine, який ТЗ §5 забороняє дублювати, бо він уже існує як
     * On This Day. Тут інше твердження — про сам стосунок із книгою («минуло три роки від
     * першого читання», «повертався двічі»), і воно однаково правдиве будь-якого дня.
     */
    if (run.isFirstFinishedRun) {
      // Роки — через ТОЙ САМИЙ розрахунок, що й усі «скільки минуло» у V1.7 (ТЗ §17), а не
      // `ageDays / 365`: інакше поріг «рік» і фраза «минув рік» могли б розійтись на добу
      // навколо високосного року, і саме там, де це найважче помітити.
      const years = getElapsedCalendarPeriod(run.finishedAt, nowIso).years;
      const isReturned = run.finishedRunCount >= 2;
      if (years >= MIN_RELATIONSHIP_MEMORY_YEARS || isReturned) {
        candidates.push({
          semanticKey: workRelationshipSemanticKey(run.workId),
          kind: 'reading_relationship',
          occurredAt: run.finishedAt,
          workId: run.workId,
          userBookId: run.userBookId,
          bookTitle: run.workTitle,
          coverUrl: run.coverUrl,
          coverFallbackColor: run.coverFallbackColor,
          text: null,
          entryType: null,
          finishedRunCount: run.finishedRunCount,
          periodKind: null,
          periodKey: null,
          weight: RELATIONSHIP_WEIGHT,
          homeEligible: true,
        });
      }
    }

    // Сам факт завершеної книги як спогад (ТЗ §3B) — лише коли він уже достатньо давній, щоб
    // бути спогадом, а не подією цього тижня.
    if (ageDays >= MIN_JOURNAL_MEMORY_AGE_DAYS) {
      candidates.push({
        semanticKey: runSemanticKey(run.runId),
        kind: 'book_memory',
        occurredAt: run.finishedAt,
        workId: run.workId,
        userBookId: run.userBookId,
        bookTitle: run.workTitle,
        coverUrl: run.coverUrl,
        coverFallbackColor: run.coverFallbackColor,
        text: null,
        entryType: null,
        finishedRunCount: run.finishedRunCount,
        periodKind: null,
        periodKey: null,
        weight: BOOK_MEMORY_WEIGHT,
        homeEligible: true,
      });
    }
  }

  for (const period of input.pastPeriods) {
    if (period.occurredAt > nowIso) continue;
    candidates.push({
      semanticKey: periodSemanticKey(period.periodKind, period.periodKey),
      kind: 'past_period',
      occurredAt: period.occurredAt,
      workId: null,
      userBookId: null,
      bookTitle: null,
      coverUrl: null,
      coverFallbackColor: null,
      text: null,
      entryType: null,
      finishedRunCount: null,
      periodKind: period.periodKind,
      periodKey: period.periodKey,
      weight: PAST_PERIOD_WEIGHT,
      /**
       * ТЗ §3D + §22: період — це ПОСИЛАННЯ на вже існуючий Recap, а не ambient-спогад. Тримати
       * його поза Home одразу знімає весь клас дублювання «Home показує recap двічі»: нема чому
       * конкурувати з Recap за слот, якщо кандидат туди не потрапляє за визначенням.
       */
      homeEligible: false,
    });
  }

  return sortCandidates(candidates);
}

/**
 * Повний детермінований порядок (ТЗ §14): вага → новіше першим → semanticKey як тай-брейк.
 * Третій ключ обов'язковий — без нього два кандидати з однаковою вагою й однаковим моментом
 * лишались би в порядку надходження з БД, і «одна цитата при відкритті, інша при поверненні»
 * стало б можливим саме тоді, коли його найважче помітити.
 */
function sortCandidates(candidates: MemoryResurfacingCandidate[]): MemoryResurfacingCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      a.weight - b.weight ||
      (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0) ||
      (a.semanticKey < b.semanticKey ? -1 : a.semanticKey > b.semanticKey ? 1 : 0),
  );
}

// ─── ВІДБІР ───────────────────────────────────────────────────────────────────────────────────

/**
 * Presentation state (ТЗ §9, §33) — НЕ історія читання. Тому й не таблиця: `lastShownAt` і мапа
 * «ключ → коли показували» живуть у SecureStore поза бекапом
 * (`resurfacingPresentationStorage.ts`), як і приглушення контекстних карток Home.
 */
export interface HomeResurfacingState {
  /** Коли Home востаннє показував БУДЬ-ЯКИЙ resurfacing (ТЗ §8). */
  lastShownAt: string | null;
  /** semanticKey → ISO останнього показу цього конкретного спогаду (ТЗ §9). */
  shownAtByKey: Readonly<Record<string, string>>;
}

export const EMPTY_HOME_RESURFACING_STATE: HomeResurfacingState = {
  lastShownAt: null,
  shownAtByKey: {},
};

export interface HomeResurfacingSelectionOptions {
  now: Date;
  state: HomeResurfacingState;
  /**
   * Семантичні ключі подій, які вже розповідає щось інше (ТЗ §21, §30): сьогоднішній On This Day,
   * актуальна віха, hero-спогад свіжого Recap. Будується викликачем, бо лише він знає про ті
   * поверхні; сам цей модуль про них нічого не знає й не мусить.
   */
  excludedSemanticKeys: ReadonlySet<string>;
}

/**
 * Найбільше ОДИН ambient-спогад для слота Home (ТЗ §2B, §7, §8).
 *
 * Три незалежні гальма, кожне зі свого пункту ТЗ:
 *   1. §8 — не частіше разу на 7 днів, незалежно від того, скільки є кандидатів;
 *   2. §9 — той самий спогад не повертається раніше ніж через 90 днів;
 *   3. §21 — подія, яку вже розповідає інша поверхня, не розповідається вдруге.
 *
 * Детермінізм (ТЗ §14): порядок повний і стабільний, а ротація в межах найсильнішої ваги —
 * від ключа ДНЯ, не від `Math.random()`. Той самий день → той самий спогад, скільки б разів екран
 * не перемалювався.
 */
export function selectHomeResurfacingCandidate(
  candidates: MemoryResurfacingCandidate[],
  options: HomeResurfacingSelectionOptions,
): MemoryResurfacingCandidate | null {
  const { now, state, excludedSemanticKeys } = options;

  if (state.lastShownAt != null) {
    const daysSinceLast = differenceInCalendarDays(now, new Date(state.lastShownAt));
    if (daysSinceLast < HOME_RESURFACING_MIN_INTERVAL_DAYS) return null;
  }

  const eligible = candidates.filter((candidate) => {
    if (!candidate.homeEligible) return false;
    if (excludedSemanticKeys.has(candidate.semanticKey)) return false;
    if (candidate.workId != null && excludedSemanticKeys.has(workRelationshipSemanticKey(candidate.workId))) {
      return false;
    }
    const shownAt = state.shownAtByKey[candidate.semanticKey];
    if (shownAt != null) {
      const daysSinceShown = differenceInCalendarDays(now, new Date(shownAt));
      if (daysSinceShown < HOME_RESURFACING_CANDIDATE_COOLDOWN_DAYS) return false;
    }
    return true;
  });

  if (eligible.length === 0) return null;

  // Ротація лише всередині найсильнішої ваги: «випадково зустріти знову» має бути різним із
  // тижня в тиждень, але ніколи не ціною показу слабшого кандидата замість сильнішого.
  // `Math.min` замість `eligible[0].weight` навмисно: інакше правильність мовчки залежала б від
  // того, чи прийшов масив уже відсортованим, і викликач, що зібрав кандидатів сам, зламав би
  // відбір, нічого не помітивши.
  const bestWeight = eligible.reduce((min, candidate) => Math.min(min, candidate.weight), Infinity);
  const topTier = sortCandidates(eligible.filter((candidate) => candidate.weight === bestWeight));
  return topTier[dailyRotationOffset(readingDayKeyOf(now), topTier.length)] ?? null;
}

/**
 * Детермінований зсув у межах доби (ТЗ §14). Той самий `dayKey` завжди дає той самий індекс —
 * отже, ре-рендер, повернення на екран і повторне відкриття застосунку показують те саме.
 * Навмисно найпростіший стабільний хеш (та сама 31-множник-схема, що й `String#hashCode`): це
 * не безпека, а лише рівномірний розподіл днів по пулу.
 */
export function dailyRotationOffset(dayKey: string, poolSize: number): number {
  if (poolSize <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < dayKey.length; i++) {
    hash = (hash * 31 + dayKey.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % poolSize;
}

/**
 * Кандидати для Memory Hub (ТЗ §2A, §8, §12, §13).
 *
 * Тут людина прийшла САМА — штучного ліміту «раз на 7 днів» немає, cooldown показу теж не
 * застосовується (він про ambient-нав'язливість Home, не про те, що можна знайти, коли шукаєш).
 * Лишається лише дедуп (§21) і обмеження кількості (§13/§35: не нескінченна стрічка).
 */
export function selectHubResurfacingCandidates(
  candidates: MemoryResurfacingCandidate[],
  options: { excludedSemanticKeys: ReadonlySet<string>; limit?: number },
): MemoryResurfacingCandidate[] {
  const limit = options.limit ?? MEMORY_HUB_RESURFACING_LIMIT;
  return sortCandidates(
    candidates.filter((candidate) => !options.excludedSemanticKeys.has(candidate.semanticKey)),
  ).slice(0, limit);
}
