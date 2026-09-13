import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { ReadingRunRepository } from '@/data/repositories/ReadingRunRepository';
import { RatingRepository } from '@/data/repositories/RatingRepository';
import { BookMemoryRepository } from '@/data/repositories/BookMemoryRepository';
import { PreReadingReflectionRepository } from '@/data/repositories/PreReadingReflectionRepository';
import { BookCapsuleRepository } from '@/data/repositories/BookCapsuleRepository';
import { DnfReflectionRepository } from '@/data/repositories/DnfReflectionRepository';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { computeRunReadingStats, type RunReadingStats } from '@/lib/rereadComparison';
import { queryKeys } from '@/lib/queryKeys';
import type { ReadingRun } from '@/types/readingRun';
import type { Rating } from '@/types/rating';
import type { BookMemory } from '@/types/bookMemory';
import type { PreReadingReflection } from '@/types/preReadingReflection';
import type { BookCapsule } from '@/types/bookCapsule';
import type { DnfReflection } from '@/types/dnfReflection';

export interface ReadingRunDetail {
  run: ReadingRun;
  rating: Rating | null;
  memory: BookMemory | null;
  beforeAfter: PreReadingReflection | null;
  capsule: BookCapsule | null;
  dnf: DnfReflection | null;
  stats: RunReadingStats;
}

/**
 * REREADING MODEL, Фаза 12 (`docs/READING_RUN.md` §"Фаза 12") — усі `reading_run` книги, кожен
 * збагачений даними, які до нього прив'язані: оцінка (`RatingRepository.getByReadingRunId`,
 * Фаза 12), спогад (`BookMemoryRepository`, Фаза 8), нотатка "До" (`PreReadingReflectionRepository`,
 * Фаза 9), капсула (`BookCapsuleRepository`, Фаза 10), DNF-знімок (`DnfReflectionRepository`,
 * Фаза 11) і статистика сесій цього run (`computeRunReadingStats`, `src/lib/rereadComparison.ts`).
 *
 * РІВНО ОДИН хук на ОБИДВА нові UI-поверхні Фази 12 — той самий "один запит, спільний кеш"
 * принцип, що й підйом `useReadingHistory` у `BookDetailsScreen` (Фаза 2, коментар над
 * `FinishPredictionSection`/`ReadingHistorySection`, `app/work/[workId].tsx`):
 *
 * - "Історія прочитань" (`ReadingRunsHistorySection`) показує ВСІ run'и, незалежно від статусу
 *   (включно з `in_progress`/`did_not_finish`) — читач хоче бачити повну хронологію.
 * - Екран порівняння (`app/reread-comparison/[workId].tsx`) сам фільтрує лише
 *   `run.status === 'finished'` із цього самого результату (капсулу, як і рейтинг-порівняння,
 *   свідомо не має сенсу пропонувати для `did_not_finish`/`in_progress` — `canCreateCapsule`,
 *   `src/lib/bookCapsule.ts`, і так дозволяє капсулу лише для `finished`) — БЕЗ окремого запиту.
 *
 * Дані по кожному run завантажуються `Promise.all` — по одному короткому запиту на репозиторій
 * на кожен run, а не N+1 послідовно; для книги з реалістичною кількістю прочитань (рідко більше
 * кількох) це не помітне навантаження.
 */
export function useReadingRunsDetail(userBookId: string | undefined) {
  return useQuery<ReadingRunDetail[]>({
    queryKey: queryKeys.readingRuns.detailByUserBook(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return [];
      const db = await getDatabase();

      const [runs, sessions] = await Promise.all([
        ReadingRunRepository.listByUserBookId(db, userBookId),
        ReadingSessionRepository.listByUserBookId(db, userBookId),
      ]);
      if (runs.length === 0) return [];

      return Promise.all(
        runs.map(async (run): Promise<ReadingRunDetail> => {
          const [rating, memory, beforeAfter, capsule, dnf] = await Promise.all([
            RatingRepository.getByReadingRunId(db, run.id),
            BookMemoryRepository.getByReadingRunId(db, run.id),
            PreReadingReflectionRepository.getByReadingRunId(db, run.id),
            BookCapsuleRepository.getByReadingRunId(db, run.id),
            DnfReflectionRepository.getByReadingRunId(db, run.id),
          ]);
          const runSessions = sessions.filter((session) => session.readingRunId === run.id);
          const stats = computeRunReadingStats(runSessions);
          return { run, rating, memory, beforeAfter, capsule, dnf, stats };
        }),
      );
    },
    enabled: !!userBookId,
  });
}

/** Завершені прочитання, придатні для порівняння ("Як змінилася книга для тебе") — лише
 * `status === 'finished'`, найстаріше перше (`ReadingRunRepository.listByUserBookId` уже
 * повертає в цьому порядку). Окрема експортована функція, а не inline-фільтр у кожному
 * споживачі — щоб той самий критерій (і майбутня зміна його) жив в одному місці. */
export function selectComparableRuns(details: ReadingRunDetail[]): ReadingRunDetail[] {
  return details.filter((detail) => detail.run.status === 'finished');
}
