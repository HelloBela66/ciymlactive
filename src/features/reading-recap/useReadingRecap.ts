import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import {
  summarizeReadingPeriod,
  type PeriodBookRow,
} from '@/features/reading-period/summarizeReadingPeriod';
import { queryKeys } from '@/lib/queryKeys';
import type { ReadingPeriodSummary } from '@/lib/readingPeriodSummary';
import {
  buildReadingRecap,
  recapPeriodFromRange,
  recapPeriodKeyOf,
  recapRangeOf,
  resolveRecapAnchor,
  shiftRecapAnchor,
  type ReadingRecap,
  type RecapPeriodKind,
} from '@/lib/readingRecap';

/**
 * POLYTSIA V1.7, Phase 5 — READING RECAPS (`docs/V1_7_READING_LIFE.md`, ТЗ V1.7 модуль C).
 *
 * ОДИН хук на тиждень, місяць і рік. Не три: період відрізняється лише діапазоном
 * (`recapRangeOf`), а все інше — той самий canonical-двигун (`computeReadingPeriodSummary`), той
 * самий детермінований шаблонізатор (`buildReadingRecap`) і ті самі repository-методи, якими вже
 * користуються Сезони, Wrapped і Reading Life.
 *
 * ЧОМУ ЦЕ ВАЖЛИВО, А НЕ ПРОСТО ЗРУЧНО. ТЗ V1.7 прямо забороняє, щоб Wrapped став «паралельною
 * системою» поруч із Recap. Тут це забезпечено структурно: якщо колись Year Recap захоче іншу
 * цифру, ніж Wrapped, йому доведеться змінити `computeReadingPeriodSummary` — тобто змінити її
 * ОДРАЗУ скрізь, а не тихо розійтися в одному місці.
 *
 * ЖОДНОЇ НОВОЇ ТАБЛИЦІ (§71-§72): recap не зберігається, він перераховується. Тому «recap за
 * минулий травень» не може застаріти чи розійтися з тим, що показує Reading Life за травень.
 *
 * ДВА ДІАПАЗОНИ ЗА ОДИН ЗАПИТ: поточний період і попередній (для рядка порівняння). Попередній
 * рахується тим самим кодом — інакше «на 40 хв більше» порівнювало б величини, обчислені різними
 * шляхами.
 */

/** Рядок книги періоду — той самий тип, що й у Reading Life/Wrapped (спільний
 * `summarizeReadingPeriod`). Ре-експорт, щоб екран не знав про `features/reading-period`. */
export type RecapFinishedBookRow = PeriodBookRow;

export interface ReadingRecapData {
  recap: ReadingRecap;
  summary: ReadingPeriodSummary;
  /** Книги, прочитання яких завершилось у періоді — для обкладинок під текстом recap. */
  books: RecapFinishedBookRow[];
  /** Ключі сусідніх періодів — для стрілок «назад/вперед». */
  previousKey: string;
  nextKey: string;
  /** `true`, якщо наступний період ще не почався: у майбутнє гортати нема сенсу. */
  isLatest: boolean;
}

export function useReadingRecap(kind: RecapPeriodKind, periodKey: string) {
  const anchor = resolveRecapAnchor(kind, periodKey);

  return useQuery<ReadingRecapData>({
    queryKey: queryKeys.readingRecap.period(kind, periodKey),
    // Зіпсований ключ із маршруту — запит просто не виконується, екран показує «періоду немає».
    enabled: anchor != null,
    queryFn: async () => {
      if (!anchor) throw new Error('Некоректний ключ періоду');
      const db = await getDatabase();

      const range = recapRangeOf(kind, anchor);
      const previousAnchor = shiftRecapAnchor(kind, anchor, -1);
      const previousRange = recapRangeOf(kind, previousAnchor);

      const [current, previous] = await Promise.all([
        summarizeReadingPeriod(db, range),
        summarizeReadingPeriod(db, previousRange),
      ]);

      const recap = buildReadingRecap({
        period: recapPeriodFromRange(kind, range),
        summary: current.summary,
        previousSummary: previous.summary,
        finishedBooks: current.books
          .filter((book) => book.status === 'finished')
          .map((book) => ({ title: book.userBook.work.title, isReread: book.runNumber > 1 })),
      });

      const nextAnchor = shiftRecapAnchor(kind, anchor, 1);
      // «Зараз» береться тут, а не в `lib/*.ts`: чисті модулі V1.7 свідомо не звертаються до
      // годинника (той самий house-принцип, що й `season.ts`/`readingCalendar.ts`).
      const nextRange = recapRangeOf(kind, nextAnchor);
      const isLatest = new Date().toISOString() < nextRange.startIso;

      return {
        recap,
        summary: current.summary,
        books: current.books,
        previousKey: recapPeriodKeyOf(kind, previousAnchor),
        nextKey: recapPeriodKeyOf(kind, nextAnchor),
        isLatest,
      };
    },
  });
}
