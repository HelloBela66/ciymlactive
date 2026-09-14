import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { queryKeys } from '@/lib/queryKeys';
import { FALLBACK_PAGES_PER_MINUTE, pagesPerMinuteFromTotals } from '@/lib/readingPace';
import { estimateTbr, type TbrEstimate } from '@/lib/tbrEstimate';
import { findOldestWaitingBook, type OldestWaitingInsight } from '@/lib/tbrPersonality';

export interface TbrRealityCheck extends TbrEstimate {
  bookCount: number;
  usedFallbackPace: boolean;
  /** ТЗ Фази 17 (TBR PERSONALITY / ANTI-TBR) — книга з найранішим `addedAt` у списку
   * "Хочу прочитати", для playful-insight'ів і CTA «Нарешті прочитати» на `app/tbr.tsx`.
   * `null`, лише коли `bookCount === 0` (той самий випадок, що вже ловить `EmptyState`). */
  oldestWaiting: OldestWaitingInsight | null;
}

/**
 * TBR reality check (розділ 30 ТЗ, Milestone 6; playful insights — ТЗ Фази 17, `docs/
 * TBR_PERSONALITY.md`): скільки часу знадобиться дочитати все з "Хочу прочитати" за різного
 * щоденного бюджету часу, плюс кілька дружніх, не соромливих речень про сам список (скільки
 * книг, яка найдовше чекає). На відміну від `finishPrediction` (rolling-average останніх
 * сесій — навмисно чутливий до недавнього темпу), тут беремо темп за ВЕСЬ наявний час — TBR-
 * оцінка довгострокова, одна недавня повільна/швидка сесія не повинна її різко хитати.
 *
 * POLYTSIA V1.6.2, #168 (ANALYTICS PERFORMANCE): раніше — `listAllCompleted(db)` (уся історія
 * сесій користувача) + `computeRollingPace(sessions, sessions.length)`, де `windowSize =
 * sessions.length` робить "вікно" фіктивним (бере геть усе). `getLifetimePaceTotals` рахує ті
 * самі два числа (`totalPages`/`totalMinutes`, СИРА конвенція хвилин без округлення на сесію —
 * докладніше доккоментар методу) одним SQL-агрегатом, без передачі жодного рядка сесії через
 * міст; `pagesPerMinuteFromTotals` — та сама формула "0, якщо ділити нема на що", що раніше
 * лишалась усередині `computeRollingPace`.
 */
export function useTbrRealityCheck() {
  return useQuery<TbrRealityCheck>({
    queryKey: queryKeys.tbr.reality,
    queryFn: async () => {
      const db = await getDatabase();
      const [wantToRead, { totalPages, totalMinutes }] = await Promise.all([
        UserBookRepository.listByStatus(db, 'want_to_read'),
        ReadingSessionRepository.getLifetimePaceTotals(db),
      ]);

      const lifetimePagesPerMinute = pagesPerMinuteFromTotals(totalPages, totalMinutes);
      const usedFallbackPace = lifetimePagesPerMinute <= 0;
      const pagesPerMinute = usedFallbackPace ? FALLBACK_PAGES_PER_MINUTE : lifetimePagesPerMinute;

      const books = wantToRead.map((ub) => ({ id: ub.id, title: ub.work.title, pageCount: ub.edition.pageCount }));
      const estimate = estimateTbr(books, pagesPerMinute);

      const oldestWaiting = findOldestWaitingBook(
        wantToRead.map((ub) => ({ userBookId: ub.id, workId: ub.work.id, title: ub.work.title, addedAt: ub.addedAt })),
        new Date(),
      );

      return { ...estimate, bookCount: wantToRead.length, usedFallbackPace, oldestWaiting };
    },
  });
}
