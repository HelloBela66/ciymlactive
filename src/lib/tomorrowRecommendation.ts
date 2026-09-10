import type { RawProviderBook } from '@/data/providers';

/**
 * «Що почитати завтра?» (Milestone 11, доповнення) — пряме прохання власника продукту:
 * кнопка на Головній, що за жанром + доступним часом + метою читання підбирає ОДНУ нову
 * книгу (яку користувач ще не додав у бібліотеку), не повторюючи вже показане на той самий
 * запит (`RecommendationRepository`, `app/tomorrow.tsx`). Уся логіка вибору тут — чиста,
 * без мережі й без SQLite (той самий принцип, що й `memoryCardMood.ts`/`tbrEstimate.ts`) —
 * фактичний пошук через Google Books і читання/запис історії показів підняті окремо, у
 * `useTomorrowRecommendation.ts`.
 *
 * Свідомо лише Google Books, ніколи ISBNdb (`docs/SECURITY.md`, знахідка 🔴): це фіча, до
 * якої користувач природно тапатиме повторно ("Спробувати іншу") — множити на неї платні
 * виклики ISBNdb означало б множити фінансовий ризик, який сам аудит щойно задокументував.
 */

export type RecommendationPurpose = 'light' | 'cry' | 'laugh' | 'absorbed';

/**
 * Кілька варіантів ключових слів на кожну мету — кожен комбінується з назвою жанру в окремий
 * пошуковий запит (`buildSearchQueries`). Google Books — вільнотекстовий пошук, без
 * структурованого параметра "жанр"/"настрій" (`docs/BOOK_PROVIDERS.md`), тож кілька запитів
 * одразу — єдиний спосіб отримати ширший пул кандидатів з одного тапу користувача, а не
 * єдиний вузький результат "жанр + одне слово".
 */
export const PURPOSE_KEYWORDS: Record<RecommendationPurpose, readonly string[]> = {
  light: ['легке чтиво', 'легкий роман для відпочинку', 'приємне читання'],
  cry: ['зворушлива історія', 'до сліз', 'пронизлива драма'],
  laugh: ['гумористична книга', 'комедія', 'з гумором'],
  absorbed: ['захопливий сюжет', 'неможливо відірватися', 'напружений сюжет'],
};

export interface TimeBudgetOption {
  value: 'short' | 'medium' | 'long' | 'epic';
  /** Середина діапазону в хвилинах — умовна точка для оцінки "скільки сторінок влізе"
   * (`estimatePageBudget`), не жорстка межа: книги трохи довші/коротші за неї так само
   * лишаються кандидатами, лише нижче в рейтингу (`rankCandidates`). */
  minutesMid: number;
}

export type TimeBudgetPreset = TimeBudgetOption['value'];

export const TIME_BUDGET_OPTIONS: readonly TimeBudgetOption[] = [
  { value: 'short', minutesMid: 90 },
  { value: 'medium', minutesMid: 270 },
  { value: 'long', minutesMid: 570 },
  { value: 'epic', minutesMid: 900 },
];

/**
 * `minutesAvailable * pagesPerMinute` — обернене до напрямку `estimateTbr` (`tbrEstimate.ts`,
 * "сторінки → дні за фіксованим бюджетом хвилин/день"): тут навпаки — "скільки сторінок
 * реалістично влізе в заданий сумарний бюджет часу на ОДНУ книгу". `pagesPerMinute` —
 * той самий rolling-темп (`computeRollingPace`, `readingPace.ts`), з тим самим фолбеком
 * (`FALLBACK_PAGES_PER_MINUTE`), коли реальної історії читання ще немає, що й TBR reality
 * check (`useTbrReality.ts`).
 */
export function estimatePageBudget(minutesAvailable: number, pagesPerMinute: number): number {
  return Math.max(1, Math.round(minutesAvailable * pagesPerMinute));
}

/**
 * Кожен варіант ключового слова для обраної мети — окремий пошуковий запит, разом з назвою
 * жанру ("жанр + ключове слово"). Google Books трактує пробіл між словами як неявне "І" —
 * запит із двома-трьома одночасно обов'язковими токенами (жанр + багатослівна фраза мети,
 * напр. "Фентезі" + "зворушлива історія") реалістично може не знайти ЖОДНОГО видання для
 * рідкісних поєднань, ще до того, як спрацює українська мовна фільтрація
 * (`isLikelyUkrainianBook`, другий шар) — саме це й трапилось на реальному пристрої
 * (жанр "Фентезі" + мета "поплакати" → 0 результатів, хоча українських фентезі-видань
 * реально багато).
 *
 * Тому масив завжди містить окремий, ГАРАНТОВАНО широкий запит лише за назвою жанру (без
 * жодного слова мети) — він забезпечує непорожній пул кандидатів навіть тоді, коли жоден із
 * вужчих "жанр + мета" запитів нічого не знайшов. Мета в такому разі впливає лише на
 * ранжування (через `rankCandidates`/бюджет сторінок) серед знайденого за жанром, а не на
 * сам факт "знайшлось щось чи ні" — свідомий компроміс на користь "завжди дати відповідь"
 * над "точний збіг мети чи нічого".
 */
export function buildSearchQueries(genreNameUk: string, purpose: RecommendationPurpose): string[] {
  const genre = genreNameUk.trim();
  const combined = PURPOSE_KEYWORDS[purpose].map((keyword) => (genre.length > 0 ? `${genre} ${keyword}` : keyword));
  return genre.length > 0 ? [genre, ...combined] : combined;
}

/**
 * Ключ книги для дедуплікації результатів і для трекінгу вже показаного
 * (`RecommendationRepository`) — ISBN, коли є (той самий пріоритет isbn13 → isbn10, що й
 * `isbnKey` у `app/(tabs)/search.tsx`), інакше сам `externalId` (Milestone 11, доповнення:
 * після появи `CuratedCatalogProvider` поруч із Google Books джерело кандидата вже не одне —
 * тому без префікса джерела: `externalId` завжди унікальний У МЕЖАХ свого джерела (Google
 * Books id чи слаг кураторської книги), а зіткнення МІЖ джерелами практично неможливе —
 * ідентифікатори Google Books непрозорі буквено-цифрові рядки, слаги кураторської добірки
 * обирає власник продукту сам).
 */
export function recommendationBookKey(book: RawProviderBook): string {
  return book.isbn13 ?? book.isbn10 ?? book.externalId;
}

/** Прибирає кандидатів, чий {@link recommendationBookKey} уже в переданому наборі —
 * використовується і для "вже в бібліотеці", і для "вже показано на цей запит". */
export function excludeCandidates(books: RawProviderBook[], excludeKeys: ReadonlySet<string>): RawProviderBook[] {
  return books.filter((book) => !excludeKeys.has(recommendationBookKey(book)));
}

export interface LanguageTierResult {
  books: RawProviderBook[];
  /** `confirmed` — перший (найсуворіший) рівень дав хоч одного кандидата. `unverified` —
   * довелось відступити до слабшого рівня (чи взагалі без мовної фільтрації), бо суворіший
   * не дав жодного — екран результату показує це користувачу чесно, а не мовчки. */
  confidence: 'confirmed' | 'unverified';
}

/**
 * Каскад "перший непорожній рівень перемагає" — застосовується до вже класифікованих масивів
 * (сама класифікація — `isLikelyUkrainianBook`/`hasCyrillicTitle`,
 * `src/data/providers/ukrainianFilter.ts`, навмисно поза цим чистим шаром; тут `RawProviderBook`
 * — просто дані, без знання ПРО ЩО саме кожен рівень перевіряє).
 *
 * Причина існування (Milestone 11, доповнення, реальний тест на пристрої): подвійний фільтр
 * `isLikelyUkrainianBook` (мовна мітка Google Books + кирилична назва одночасно) — свідомо
 * консервативна політика для звичайного пошуку (Milestone 7.1, `docs/BOOK_PROVIDERS.md`,
 * НЕ змінюється тут), але для «Що почитати завтра?» інколи відсіює геть усе (мовна мітка для
 * українських видань у Google Books часто відсутня чи неточна) — порожній результат для
 * користувача гірший за менш певний. Виклик (`useTomorrowRecommendation.ts`) передає рівні
 * від найсуворішого до найслабшого (типово: підтверджено українською → лише кирилична назва
 * → взагалі без фільтра) — перший непорожній перемагає.
 */
export function pickLanguageTier(tiers: RawProviderBook[][]): LanguageTierResult {
  for (let i = 0; i < tiers.length; i += 1) {
    const books = tiers[i];
    if (books && books.length > 0) {
      return { books, confidence: i === 0 ? 'confirmed' : 'unverified' };
    }
  }
  return { books: [], confidence: 'unverified' };
}

export interface ScoredCandidate {
  book: RawProviderBook;
  key: string;
  distance: number;
}

/** Коли в кандидата взагалі немає `pageCount` (нерідко серед результатів Google Books) — не
 * виключаємо його (це відкинуло б забагато реальних варіантів) і не ставимо завжди в
 * кінець/початок рейтингу — умовний "середній" штраф ставить такі книги приблизно туди, де
 * опинилась би книга середньої довжини для цього бюджету часу. */
function distanceFor(pageCount: number | null | undefined, pageBudget: number): number {
  if (pageCount == null) return pageBudget * 0.35;
  return Math.abs(pageCount - pageBudget);
}

/** Сортує кандидатів за близькістю `pageCount` до бюджету часу (менша дистанція — краще). */
export function rankCandidates(books: RawProviderBook[], pageBudget: number): ScoredCandidate[] {
  return books
    .map((book) => ({ book, key: recommendationBookKey(book), distance: distanceFor(book.pageCount, pageBudget) }))
    .sort((a, b) => a.distance - b.distance);
}

/**
 * Обирає один варіант із топ-`poolSize` найближчих за бюджетом часу кандидатів — НЕ завжди
 * найкращий-за-рейтингом (інакше той самий запит завжди повертав би ту саму першу книгу з
 * пулу, поки її не виключить історія показів). `rng` ін'єктується для тестів (за
 * замовчуванням `Math.random`) — на відміну від `memoryCardMood.ts`, тут навмисно НЕ
 * детерміновано за seed: мета фічі саме "щоразу інша книга на той самий запит", а не
 * стабільний вигляд одного й того самого запису.
 */
export function pickCandidate(
  ranked: ScoredCandidate[],
  poolSize = 5,
  rng: () => number = Math.random,
): ScoredCandidate | null {
  if (ranked.length === 0) return null;
  const pool = ranked.slice(0, Math.max(1, poolSize));
  const index = Math.min(Math.floor(rng() * pool.length), pool.length - 1);
  return pool[index] ?? null;
}
