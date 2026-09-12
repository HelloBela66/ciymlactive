import {
  type RecommendationPurpose,
  PURPOSE_KEYWORDS,
  type TimeBudgetPreset,
} from './tomorrowRecommendation';
import { FALLBACK_PAGES_PER_MINUTE } from './readingPace';
import type { UserBookStatus } from '@/types/userBook';

/**
 * «Обери мені книгу» (ТЗ Фази 16, ONE BOOK PICKER, `docs/ONE_BOOK_PICKER.md`) — ТЗ: "Покращ
 * поточний «Що почитати завтра?». Не видаляй existing recommendation logic без причини." Це НЕ
 * заміна `tomorrowRecommendation.ts`, а паралельна фіча з іншим data source: той файл підбирає
 * книгу ЗВІДКИ ЗАВГОДНО (Google Books/курований каталог), яку користувач ще НЕ додав; цей —
 * підбирає ОДНУ книгу з уже наявної бібліотеки користувача (`user_book`, переважно TBR). Через
 * це універсум кандидатів і сама логіка фільтрації принципово різні — переписати одну поверх
 * іншої означало б втратити обидві. Спільні лише дрібні перевикористані шматки, явно
 * імпортовані звідти, де вони вже є "загальним словником", а не приватним UI-хелпером:
 * `RecommendationPurpose`/`PURPOSE_KEYWORDS` (той самий набір "настроїв" і їхніх ключових слів,
 * щоб два пікери не вигадували два різні словники того самого поняття) і `FALLBACK_PAGES_PER_MINUTE`
 * з `readingPace.ts` (єдине джерело темпу-за-замовчуванням, той самий принцип, що вже
 * задокументований у самому `readingPace.ts`).
 *
 * Увесь файл — чисті функції над уже зібраними даними (жодного SQL/React тут), той самий
 * "чисті функції, збір даних лишається хуку" підхід, що й `readingProfile.ts`/
 * `readingFingerprint.ts`. Фактичний збір — `src/features/onePicker/useOnePicker.ts`.
 */

export type SeriesFilter = 'any' | 'standalone' | 'series';
export type TbrScope = 'tbr' | 'any_unread';
export type OwnershipScope = 'any' | 'owned';

/** Які статуси `user_book` входять у пул кандидатів на кожен `TbrScope` — ТЗ: "тільки з TBR"
 * (звужений пул) проти ширшого пошуку. `any_unread` навмисно НЕ включає `reading`/`rereading`
 * (книгу, яку й так уже читаєш, підбирати нема сенсу) і НЕ включає `finished` (уже прочитана) —
 * лишає `want_to_read`/`paused`/`did_not_finish`: усе, що логічно можна "почати (або
 * повернутись) читати просто зараз". */
export const TBR_SCOPE_STATUSES: Record<TbrScope, UserBookStatus[]> = {
  tbr: ['want_to_read'],
  any_unread: ['want_to_read', 'paused', 'did_not_finish'],
};

export interface PickerFilters {
  genreId: string | null;
  timeBudget: TimeBudgetPreset;
  desiredMood: RecommendationPurpose | null;
  maxPages: number | null;
  seriesFilter: SeriesFilter;
  tbrScope: TbrScope;
  ownershipScope: OwnershipScope;
}

/** Уже "сплющені" дані одного кандидата — хук збирає їх пакетними запитами
 * (`GenreRepository.listByWorkIds`/`SeriesRepository.listWorkIdsInSeries`/
 * `OwnedBookRepository.listOwnedEditionIds`) і передає сюди прості поля, а не самі об'єкти
 * репозиторію — той самий поділ "чиста функція над примітивами", що й `PickerCandidate`-подібні
 * входи `readingProfile.ts`/`readingFingerprint.ts`. */
export interface PickerCandidate {
  userBookId: string;
  status: UserBookStatus;
  pageCount: number | null;
  genreIds: string[];
  genreNames: string[];
  isInSeries: boolean;
  isOwned: boolean;
  descriptionText: string | null;
}

/* ---------------------------------------------------------------------------------------- *
 * Фільтрація (жорсткі фільтри — кандидат або в пулі, або ні)
 * ---------------------------------------------------------------------------------------- */

export function filterCandidates(candidates: PickerCandidate[], filters: PickerFilters): PickerCandidate[] {
  const allowedStatuses = TBR_SCOPE_STATUSES[filters.tbrScope];
  return candidates.filter((candidate) => {
    if (!allowedStatuses.includes(candidate.status)) return false;
    if (filters.genreId != null && !candidate.genreIds.includes(filters.genreId)) return false;
    // Невідома довжина (`pageCount === null`) НЕ виключається максимальним лімітом — брак
    // метаданих не має караватись, той самий "тиха деградація" принцип, що й усюди в
    // застосунку; невідома довжина лише не бере участі в ранжуванні за близькістю нижче.
    if (filters.maxPages != null && candidate.pageCount != null && candidate.pageCount > filters.maxPages) {
      return false;
    }
    if (filters.seriesFilter === 'standalone' && candidate.isInSeries) return false;
    if (filters.seriesFilter === 'series' && !candidate.isInSeries) return false;
    if (filters.ownershipScope === 'owned' && !candidate.isOwned) return false;
    return true;
  });
}

/* ---------------------------------------------------------------------------------------- *
 * Настрій — м'який сигнал ранжування, НЕ жорсткий фільтр
 * ---------------------------------------------------------------------------------------- */

/** Настрій навмисно НЕ жорсткий фільтр (на відміну від решти фільтрів вище): книга-кандидат
 * рідко має надійний "тег настрою" в метаданих (`PURPOSE_KEYWORDS` шукаються лише серед НАЗВ
 * ЖАНРІВ і опису твору, які часто відсутні чи короткі) — жорсткий фільтр за таким слабким
 * сигналом легко лишив би порожній пул навіть коли підходящі книги є. Замість цього — м'який
 * пріоритет у ранжуванні (`rankCandidates` нижче): збіг переміщує кандидата вище, відсутність
 * збігу не виключає його. ТЗ EXPLANATION: "Не вигадуй attributes, яких немає в metadata" —
 * тому збіг перевіряється лише за РЕАЛЬНИМ текстом (жанри/опис), ніколи не вгадується. */
export function matchesDesiredMood(candidate: PickerCandidate, desiredMood: RecommendationPurpose | null): boolean {
  if (desiredMood == null) return false;
  const haystack = [...candidate.genreNames, candidate.descriptionText ?? ''].join(' ').toLowerCase();
  return PURPOSE_KEYWORDS[desiredMood].some((keyword) => haystack.includes(keyword.toLowerCase()));
}

/* ---------------------------------------------------------------------------------------- *
 * Ранжування й вибір — той самий "рахуй відстань, обери випадково з топ-N" підхід, що й
 * `tomorrowRecommendation.ts#rankCandidates`/`pickCandidate`, окрема реалізація над власним
 * типом кандидата (той самий "кожна фіча-картка не ділить дрібну логіку з іншою" принцип, що
 * вже пояснювали `seasonCardFile.ts`/`fingerprintCardFile.ts`).
 * ---------------------------------------------------------------------------------------- */

export interface ScoredPickerCandidate {
  candidate: PickerCandidate;
  /** `Number.POSITIVE_INFINITY`, коли довжина невідома — такий кандидат сортується в самий
   * кінець своєї групи (настрій-збіг/без збігу), а не виключається. */
  distance: number;
  moodMatched: boolean;
}

export function rankCandidates(
  candidates: PickerCandidate[],
  pageBudget: number,
  desiredMood: RecommendationPurpose | null,
): ScoredPickerCandidate[] {
  const scored: ScoredPickerCandidate[] = candidates.map((candidate) => ({
    candidate,
    distance: candidate.pageCount != null ? Math.abs(candidate.pageCount - pageBudget) : Number.POSITIVE_INFINITY,
    moodMatched: matchesDesiredMood(candidate, desiredMood),
  }));

  return scored.sort((a, b) => {
    if (a.moodMatched !== b.moodMatched) return a.moodMatched ? -1 : 1;
    return a.distance - b.distance;
  });
}

/** Той самий "випадковий вибір серед топ-N найближчих" підхід, що й
 * `tomorrowRecommendation.ts#pickCandidate` (ті самі значення за замовчуванням) — щоб «Іншу»
 * реально показувала іншу книгу, а не завжди найближчу за відстанню. */
export function pickCandidate(
  ranked: ScoredPickerCandidate[],
  poolSize = 5,
  rng: () => number = Math.random,
): ScoredPickerCandidate | null {
  if (ranked.length === 0) return null;
  const pool = ranked.slice(0, poolSize);
  const index = Math.floor(rng() * pool.length);
  return pool[index] ?? pool[0] ?? null;
}

/* ---------------------------------------------------------------------------------------- *
 * Оцінка часу читання — обернений напрямок `estimatePageBudget` (хвилини -> сторінки), тут
 * сторінки -> хвилини, для показу на картці результату
 * ---------------------------------------------------------------------------------------- */

export function estimateMinutesToRead(pageCount: number | null, pagesPerMinute: number): number | null {
  if (pageCount == null || pageCount <= 0) return null;
  const effectivePace = pagesPerMinute > 0 ? pagesPerMinute : FALLBACK_PAGES_PER_MINUTE;
  return Math.round(pageCount / effectivePace);
}

/* ---------------------------------------------------------------------------------------- *
 * Статус серії — для картки результату ("Card: ... series status")
 * ---------------------------------------------------------------------------------------- */

export function formatSeriesStatus(context: { seriesName: string; position: number | null } | null): string {
  if (!context) return 'Окрема історія';
  return context.position != null
    ? `${context.position}-а книга серії «${context.seriesName}»`
    : `Частина серії «${context.seriesName}»`;
}

/* ---------------------------------------------------------------------------------------- *
 * Пояснення вибору — ТЗ EXPLANATION: "Recommendation повинен бути explainable... Не вигадуй
 * attributes, яких немає в metadata"
 * ---------------------------------------------------------------------------------------- */

const TIME_BUDGET_REASON: Record<TimeBudgetPreset, string> = {
  short: 'ти хочеш щось коротке',
  medium: 'у тебе є кілька вечорів на цю книгу',
  long: 'попереду досить часу для довшої історії',
  epic: 'попереду багато часу для великої історії',
};

const MOOD_REASON: Record<RecommendationPurpose, string> = {
  light: 'щось легке для настрою',
  cry: 'щось, що може зворушити',
  laugh: 'щось смішне',
  absorbed: 'щось атмосферне, у що можна зануритися',
};

/** Скільки причин максимум потрапляє в одне речення — довша "простиня" причин гірше читається
 * й суперечить ТЗ-прикладу ("Підходить, бо ти хочеш щось коротке, атмосферне й уже маєш цю
 * книгу на полиці." — рівно три причини). Пріоритет причин (масив нижче) — той самий порядок,
 * у якому їх додає `buildPickExplanation`. */
export const MAX_EXPLANATION_REASONS = 3;

function joinReasonsUk(reasons: string[]): string {
  if (reasons.length === 0) return 'вона підходить під твій запит';
  if (reasons.length === 1) return reasons[0]!;
  return `${reasons.slice(0, -1).join(', ')} й ${reasons[reasons.length - 1]}`;
}

/** Кожна причина тут — РЕАЛЬНИЙ факт про кандидата/фільтри, ніколи не вигадана (ТЗ: "Не
 * вигадуй attributes, яких немає в metadata") — `isOwned`/`moodMatched`/`seriesFilter` беруться
 * напряму з уже порахованих `PickerCandidate`/`PickerFilters`, жодного нового припущення тут
 * немає. */
export function buildPickExplanation(params: {
  filters: PickerFilters;
  moodMatched: boolean;
  isOwned: boolean;
}): string {
  const { filters, moodMatched, isOwned } = params;
  const reasons: string[] = [TIME_BUDGET_REASON[filters.timeBudget]];

  if (moodMatched && filters.desiredMood != null) reasons.push(MOOD_REASON[filters.desiredMood]);
  if (isOwned) reasons.push('уже маєш цю книгу на полиці');
  if (filters.seriesFilter === 'standalone') reasons.push('це окрема історія, не частина серії');
  else if (filters.seriesFilter === 'series') reasons.push('це частина серії');
  if (filters.genreId != null) reasons.push('це саме той жанр, який ти шукаєш');

  return `Підходить, бо ${joinReasonsUk(reasons.slice(0, MAX_EXPLANATION_REASONS))}.`;
}
