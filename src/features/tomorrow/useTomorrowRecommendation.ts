import { useMutation } from '@tanstack/react-query';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase } from '@/data/db';
import {
  GoogleBooksProvider,
  filterUkrainianBooks,
  hasCyrillicTitle,
  recommendCuratedBooks,
  type RawProviderBook,
} from '@/data/providers';
import { EditionRepository } from '@/data/repositories/EditionRepository';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { RecommendationRepository } from '@/data/repositories/RecommendationRepository';
import { computeRollingPace, FALLBACK_PAGES_PER_MINUTE } from '@/lib/readingPace';
import {
  buildSearchQueries,
  estimatePageBudget,
  excludeCandidates,
  pickCandidate,
  pickLanguageTier,
  rankCandidates,
  recommendationBookKey,
  TIME_BUDGET_OPTIONS,
  type RecommendationPurpose,
  type TimeBudgetPreset,
} from '@/lib/tomorrowRecommendation';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';

const log = createLogger('features/tomorrow');

export interface TomorrowRecommendationInput {
  genreId: string;
  genreNameUk: string;
  purpose: RecommendationPurpose;
  timeBudget: TimeBudgetPreset;
}

export interface TomorrowRecommendationResult {
  book: RawProviderBook;
  providerId: 'google_books' | 'curated';
  /** Орієнтовна кількість сторінок під обраний бюджет часу (реальний темп читання, коли є
   * історія, інакше — той самий фолбек, що й TBR reality check) — для показу "~N год за
   * твоїм темпом" на екрані результату. */
  pageBudget: number;
  /** `true`, коли пул кандидатів на цю пару жанр+мета вичерпався і історію показів щойно
   * скинуто (`RecommendationRepository.resetShown`) — екран показує м'яке пояснення, а не
   * мовчки повторює книгу, яку користувач уже бачив. */
  recycled: boolean;
  /** Для `providerId: 'curated'` — завжди `confirmed` (кожен запис кураторської добірки
   * вручну перевірений власником продукту, `CuratedCatalogProvider.ts`). Для `google_books` —
   * `confirmed`, коли і мовна мітка Google Books, і кирилична назва підтверджують українську,
   * `unverified`, коли довелось відступити до слабшого рівня (`pickLanguageTier`,
   * `src/lib/tomorrowRecommendation.ts`), бо суворіший фільтр не дав жодного кандидата для
   * цього запиту; екран результату показує це чесно, а не мовчки. */
  languageConfidence: 'confirmed' | 'unverified';
}

/** Прибирає дублікати між кількома паралельними пошуковими запитами
 * (`buildSearchQueries` дає кілька запитів на один тап) за тим самим ключем, що й трекінг
 * показів — інакше та сама книга могла б з'явитись у пулі кандидатів кілька разів. */
function dedupeByKey(books: RawProviderBook[]): RawProviderBook[] {
  const seen = new Set<string>();
  const result: RawProviderBook[] = [];
  for (const book of books) {
    const key = recommendationBookKey(book);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(book);
  }
  return result;
}

/** Із уже мовно-відфільтрованого (для Google Books) чи вручну довіреного (для кураторської
 * добірки) пулу кандидатів прибирає власні книги користувача, тоді вже показані на цю саму
 * пару жанр+мета. Коли показане вичерпало ввесь пул неопрацьованих кандидатів — не глухий
 * кут: чистимо історію показів ЛИШЕ для цієї пари (не всю таблицю) і починаємо коло знову,
 * позначаючи це `recycled: true`. Спільна для обох джерел (curated і google_books) — та сама
 * поведінка на однакову ситуацію, незалежно від того, звідки прийшов пул кандидатів. */
async function selectCandidates(
  db: SQLiteDatabase,
  genreId: string,
  purpose: RecommendationPurpose,
  notOwned: RawProviderBook[],
  shownKeys: ReadonlySet<string>,
): Promise<{ candidates: RawProviderBook[]; recycled: boolean }> {
  const candidates = excludeCandidates(notOwned, shownKeys);
  if (candidates.length === 0 && notOwned.length > 0) {
    await RecommendationRepository.resetShown(db, genreId, purpose);
    return { candidates: notOwned, recycled: true };
  }
  return { candidates, recycled: false };
}

/**
 * «Що почитати завтра?» (Milestone 11, доповнення) — оркеструє чисту логіку вибору
 * (`src/lib/tomorrowRecommendation.ts`) разом із реальними даними: ISBN уже в бібліотеці
 * (`EditionRepository`), історія показів (`RecommendationRepository`), реальний темп читання
 * (`computeRollingPace`, той самий, що й TBR reality check, `useTbrReality.ts`). `useMutation`,
 * не `useQuery` — це дія за тапом ("Підібрати книгу"/"Спробувати іншу"), не щось, що варто
 * кешувати чи автоматично рефетчити.
 *
 * Milestone 11, доповнення (реальний тест на пристрої показав, що навіть після двох
 * послідовних виправлень фільтрів Google Books усе одно міг повертати порожній результат для
 * типових поєднань жанр+мета — власник продукту прямо попросив власну базу): спершу пробуємо
 * кураторську добірку (`recommendCuratedBooks`) — жанр+мета в ній проставлені вручну, не
 * вгадані з вільнотекстового запиту, тож і точніше, і без жодного мережевого пошуку по
 * зовнішньому API. Лише коли для цієї пари жанр+мета в добірці взагалі немає (ще) жодного
 * неопрацьованого кандидата — фолбек на попередній каскад Google Books (`buildSearchQueries`
 * → `pickLanguageTier`), без змін від fix1/fix2.
 */
export function useTomorrowRecommendation() {
  const onError = useMutationErrorHandler(log, 'Не вдалося підібрати книгу. Спробуй ще раз.');

  return useMutation<TomorrowRecommendationResult | null, Error, TomorrowRecommendationInput>({
    mutationFn: async ({ genreId, genreNameUk, purpose, timeBudget }) => {
      const db = await getDatabase();

      const [sessions, ownedKeys, shownKeys] = await Promise.all([
        ReadingSessionRepository.listAllCompleted(db),
        EditionRepository.listAllIsbnKeys(db),
        RecommendationRepository.listShownKeys(db, genreId, purpose),
      ]);

      const pace = computeRollingPace(sessions, sessions.length);
      const pagesPerMinute = pace.pagesPerMinute > 0 ? pace.pagesPerMinute : FALLBACK_PAGES_PER_MINUTE;
      const minutesMid = TIME_BUDGET_OPTIONS.find((option) => option.value === timeBudget)?.minutesMid ?? 270;
      const pageBudget = estimatePageBudget(minutesMid, pagesPerMinute);

      // 1. Кураторська добірка — перший вибір: вручну довірене джерело, жодної мовної
      // фільтрації не потрібно (кожен запис уже українською за визначенням добірки).
      const curatedRaw = await recommendCuratedBooks(genreNameUk, purpose, 30);
      const curatedNotOwned = excludeCandidates(dedupeByKey(curatedRaw), ownedKeys);
      const curatedSelection = await selectCandidates(db, genreId, purpose, curatedNotOwned, shownKeys);

      if (curatedSelection.candidates.length > 0) {
        const ranked = rankCandidates(curatedSelection.candidates, pageBudget);
        const picked = pickCandidate(ranked);
        if (picked) {
          await RecommendationRepository.recordShown(db, genreId, purpose, picked.key, picked.book.title);
          return {
            book: picked.book,
            providerId: 'curated',
            pageBudget,
            recycled: curatedSelection.recycled,
            languageConfidence: 'confirmed',
          };
        }
      }

      // 2. Фолбек на Google Books — коли для цієї пари жанр+мета в кураторській добірці взагалі
      // немає жодного кандидата (`curatedNotOwned` порожній — `curatedSelection.candidates`
      // теж порожній за побудовою `selectCandidates`). Каскад від найсуворішого до
      // найслабшого мовного рівня (`pickLanguageTier`, `src/lib/tomorrowRecommendation.ts`) —
      // той самий, що й після fix1/fix2, без змін.
      const queries = buildSearchQueries(genreNameUk, purpose);
      const resultsByQuery = await Promise.all(queries.map((query) => GoogleBooksProvider.searchBooks(query)));
      const merged = dedupeByKey(resultsByQuery.flat());

      const { books: languagePool, confidence: languageConfidence } = pickLanguageTier([
        filterUkrainianBooks(merged),
        merged.filter(hasCyrillicTitle),
        merged,
      ]);
      const notOwned = excludeCandidates(languagePool, ownedKeys);
      const { candidates, recycled } = await selectCandidates(db, genreId, purpose, notOwned, shownKeys);

      if (candidates.length === 0) return null;

      const ranked = rankCandidates(candidates, pageBudget);
      const picked = pickCandidate(ranked);
      if (!picked) return null;

      await RecommendationRepository.recordShown(db, genreId, purpose, picked.key, picked.book.title);

      return { book: picked.book, providerId: 'google_books', pageBudget, recycled, languageConfidence };
    },
    onError,
  });
}
