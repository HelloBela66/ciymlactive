import type { SQLiteDatabase } from 'expo-sqlite';
import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { BookCapsuleRepository } from '@/data/repositories/BookCapsuleRepository';
import { ReadingGoalRepository } from '@/data/repositories/ReadingGoalRepository';
import { queryKeys } from '@/lib/queryKeys';
import { findOldestWaitingBook } from '@/lib/tbrPersonality';
import { selectHomePrimaryMemory } from '@/lib/onThisDay';
import { useOnThisDay } from '@/features/on-this-day/useOnThisDay';
import {
  findStaleReadingCandidate,
  findCapsuleDueCandidate,
  findGoalNearCompletionCandidate,
  selectHomeContextCard,
  type StaleReadingCandidate,
  type CapsuleDueCandidate,
  type GoalCandidate,
  type HomeContextCard,
} from '@/lib/homeContext';
import type { BookCapsule } from '@/types/bookCapsule';

interface HomeContextRestData {
  staleReading: StaleReadingCandidate | null;
  capsuleDue: CapsuleDueCandidate | null;
  goalNearCompletion: GoalCandidate | null;
  tbrBookCount: number;
  tbrOldestWaiting: ReturnType<typeof findOldestWaitingBook>;
}

/** Деталі книги, потрібні лише для due-капсул (обкладинка/назва) — послідовний N+1, той самий
 * прийнятний прийом, що й `rebuildCapsuleRemindersAsync` (`useBookCapsule.ts`): due-капсул
 * завжди мало (п.45 ТЗ), і це не "гарячий" шлях (рахується разово на Home-рендер, не в циклі). */
async function attachCapsuleDetails(
  db: SQLiteDatabase,
  capsules: BookCapsule[],
): Promise<Parameters<typeof findCapsuleDueCandidate>[0]> {
  const withDetails = await Promise.all(
    capsules.map(async (capsule) => ({ capsule, userBook: await UserBookRepository.getByIdWithDetails(db, capsule.userBookId) })),
  );
  return withDetails
    .filter((x): x is { capsule: BookCapsule; userBook: NonNullable<typeof x.userBook> } => x.userBook != null)
    .map(({ capsule, userBook }) => ({
      capsuleId: capsule.id,
      userBookId: capsule.userBookId,
      workId: userBook.work.id,
      title: userBook.work.title,
      coverUrl: userBook.edition.coverUrl,
      coverFallbackColor: userBook.work.coverFallbackColor,
      reopenAt: capsule.reopenAt,
      openedAt: capsule.openedAt,
    }));
}

/**
 * Усі "сирі" дані, потрібні для вибору контекстної картки Home (ТЗ Фази 18, HOME REDESIGN),
 * ОКРІМ «Цей день у твоєму читанні» — той сигнал бере вже наявний `useOnThisDay()` нижче (той
 * самий React Query кеш, що й `OnThisDayCard`, жодного дублювання запиту). Один `queryFn` на
 * решту чотирьох кандидатів (той самий підхід, що й `useTbrRealityCheck`/`useStatistics`) — усі
 * запити тут вузькі й уже проіндексовані/пакетні (`listByStatus`, `listLastCompletedByUserBookIds`,
 * `getDue`, `listAll` цілей — їх завжди мало), тож жодних "10 full table scans" (ТЗ, HOME
 * PERFORMANCE).
 */
function useHomeContextRestData() {
  return useQuery<HomeContextRestData>({
    queryKey: queryKeys.home.contextCard,
    queryFn: async () => {
      const db = await getDatabase();
      const now = new Date();

      const [reading, rereading, dueCapsules, goals, wantToRead] = await Promise.all([
        UserBookRepository.listByStatus(db, 'reading'),
        UserBookRepository.listByStatus(db, 'rereading'),
        BookCapsuleRepository.getDue(db, now.toISOString()),
        ReadingGoalRepository.listAll(db),
        UserBookRepository.listByStatus(db, 'want_to_read'),
      ]);

      // Той самий набір статусів, що й `StaleReadingSection` на Book Details
      // (`app/work/[workId].tsx`) — "Читаю"/"Перечитую", не лише буквальне "reading" з ТЗ.
      const activeReadingBooks = [...reading, ...rereading];
      const lastSessions = await ReadingSessionRepository.listLastCompletedByUserBookIds(
        db,
        activeReadingBooks.map((ub) => ub.id),
      );

      const staleReading = findStaleReadingCandidate(
        activeReadingBooks.map((ub) => ({
          userBookId: ub.id,
          workId: ub.work.id,
          title: ub.work.title,
          coverUrl: ub.edition.coverUrl,
          coverFallbackColor: ub.work.coverFallbackColor,
          lastSession: lastSessions.get(ub.id) ?? null,
        })),
        now,
      );

      // Дешевий попередній фільтр ДО N+1 деталей — переглянуті due-капсули не варті зайвого
      // запиту (`findCapsuleDueCandidate` однаково відфільтрував би їх, але без потреби
      // тягнути `UserBookRepository.getByIdWithDetails` на кожну).
      const unopenedDueCapsules = dueCapsules.filter((c) => c.openedAt == null);
      const capsuleDue =
        unopenedDueCapsules.length > 0
          ? findCapsuleDueCandidate(await attachCapsuleDetails(db, unopenedDueCapsules), now)
          : null;

      const goalsWithProgress = await Promise.all(
        goals.map(async (goal) => ({ goal, progress: await ReadingGoalRepository.getProgress(db, goal) })),
      );
      const goalNearCompletion = findGoalNearCompletionCandidate(goalsWithProgress);

      const tbrOldestWaiting = findOldestWaitingBook(
        wantToRead.map((ub) => ({ userBookId: ub.id, workId: ub.work.id, title: ub.work.title, addedAt: ub.addedAt })),
        now,
      );

      return { staleReading, capsuleDue, goalNearCompletion, tbrBookCount: wantToRead.length, tbrOldestWaiting };
    },
  });
}

/**
 * Вибрана ЄДИНА контекстна картка Home, чи `null` — саму логіку пріоритезації рахує чиста
 * `selectHomeContextCard` (`src/lib/homeContext.ts`), тут лише зібрані докупи "сирі" дані.
 * Повертає `null` і поки дані ще завантажуються (та сама "тиха деградація", що й решта
 * контекстних карток V1.6) — Home просто не показує розділ, доки не буде відомо, що саме
 * показати, а не "блимає" порожньою карткою чи спінером.
 */
export function useHomeContextCard(): HomeContextCard | null {
  const onThisDayQuery = useOnThisDay();
  const restQuery = useHomeContextRestData();

  if (!restQuery.data) return null;

  const onThisDayAvailable = !!onThisDayQuery.data && selectHomePrimaryMemory(onThisDayQuery.data) != null;

  return selectHomeContextCard({ ...restQuery.data, onThisDayAvailable });
}
