import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { queryKeys } from '@/lib/queryKeys';
import { computeRollingPace, FALLBACK_PAGES_PER_MINUTE } from '@/lib/readingPace';
import { estimateTbr, type TbrEstimate } from '@/lib/tbrEstimate';

export interface TbrRealityCheck extends TbrEstimate {
  bookCount: number;
  usedFallbackPace: boolean;
}

/**
 * TBR reality check (розділ 30 ТЗ, Milestone 6): скільки часу знадобиться дочитати все з
 * "Хочу прочитати" за різного щоденного бюджету часу. На відміну від `finishPrediction`
 * (rolling-average останніх сесій — навмисно чутливий до недавнього темпу), тут беремо темп
 * за ВЕСЬ наявний час (той самий `computeRollingPace`, просто з вікном на всі сесії) — TBR-
 * оцінка довгострокова, одна недавня повільна/швидка сесія не повинна її різко хитати.
 */
export function useTbrRealityCheck() {
  return useQuery<TbrRealityCheck>({
    queryKey: queryKeys.tbr.reality,
    queryFn: async () => {
      const db = await getDatabase();
      const [wantToRead, sessions] = await Promise.all([
        UserBookRepository.listByStatus(db, 'want_to_read'),
        ReadingSessionRepository.listAllCompleted(db),
      ]);

      const lifetimePace = computeRollingPace(sessions, sessions.length);
      const usedFallbackPace = lifetimePace.pagesPerMinute <= 0;
      const pagesPerMinute = usedFallbackPace ? FALLBACK_PAGES_PER_MINUTE : lifetimePace.pagesPerMinute;

      const books = wantToRead.map((ub) => ({ id: ub.id, title: ub.work.title, pageCount: ub.edition.pageCount }));
      const estimate = estimateTbr(books, pagesPerMinute);

      return { ...estimate, bookCount: wantToRead.length, usedFallbackPace };
    },
  });
}
