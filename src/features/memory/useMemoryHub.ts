import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { BookCapsuleRepository } from '@/data/repositories/BookCapsuleRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { ReadingRunRepository } from '@/data/repositories/ReadingRunRepository';
import { queryKeys } from '@/lib/queryKeys';
import { listDueCapsuleCandidates, type CapsuleDueCandidate, type CapsuleDueCandidateInput } from '@/lib/homeContext';

export interface RereadCandidate {
  userBookId: string;
  workId: string;
  title: string;
  coverUrl: string | null;
  coverFallbackColor: string | null;
}

interface MemoryHubData {
  dueCapsules: CapsuleDueCandidate[];
  rereadCandidates: RereadCandidate[];
}

/**
 * MEMORY HUB HIERARCHY, Фаза 16 (`docs/MEMORY_HUB.md`) — "сирі" дані для ДВОХ нових розділів
 * `app/memory/index.tsx` ("Час згадати"/"Перечитання"), яких до цієї фази не існувало як
 * глобальних переліків: due-капсули були лише ОДНИМ Home-слотом (`useHomeContextCard.ts`), а
 * "чи є що порівняти" перевірялось лише ПОЧИНАЮЧИ з конкретної книги (Book Details/Book
 * Memory). Третій розділ ("Капсули") і надалі йде окремим, НЕЗМІНЕНИМ `useMemoryIndex()` —
 * той самий "групуй, не переобчислюй" принцип, що й Фаза 14/15: цей хук не чіпає жодної
 * наявної лічилки/фільтра, лише додає два нові переліки.
 */
export function useMemoryHub() {
  return useQuery<MemoryHubData>({
    queryKey: queryKeys.memoryHub.all,
    queryFn: async () => {
      const db = await getDatabase();
      const now = new Date();

      const [rawDueCapsules, rereadUserBookIds] = await Promise.all([
        BookCapsuleRepository.getDue(db, now.toISOString()),
        ReadingRunRepository.listUserBookIdsWithMultipleFinishedRuns(db),
      ]);

      // Дешевий попередній фільтр ДО N+1 деталей — той самий прийом, що й
      // `useHomeContextCard.ts`'s `attachCapsuleDetails` (переглянуті due-капсули не варті
      // зайвого запиту на деталі книги).
      const unopenedDueCapsules = rawDueCapsules.filter((c) => c.openedAt == null);
      const dueCapsuleInputs = await Promise.all(
        unopenedDueCapsules.map(async (capsule) => ({
          capsule,
          userBook: await UserBookRepository.getByIdWithDetails(db, capsule.userBookId),
        })),
      );
      const dueCapsuleCandidateInputs: CapsuleDueCandidateInput[] = dueCapsuleInputs
        .filter((x): x is { capsule: typeof x.capsule; userBook: NonNullable<typeof x.userBook> } => x.userBook != null)
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
      const dueCapsules = listDueCapsuleCandidates(dueCapsuleCandidateInputs, now);

      // Пакетний запит (`listWithDetailsByIds`, фіксована кількість запитів незалежно від
      // розміру списку) — на відміну від due-капсул (завжди мало), книг з ≥2 завершеними
      // прочитаннями з часом може стати помітно більше, тож послідовний N+1 тут не годиться.
      const rereadUserBooks = await UserBookRepository.listWithDetailsByIds(db, rereadUserBookIds);
      const rereadCandidates: RereadCandidate[] = rereadUserBooks.map((userBook) => ({
        userBookId: userBook.id,
        workId: userBook.work.id,
        title: userBook.work.title,
        coverUrl: userBook.edition.coverUrl,
        coverFallbackColor: userBook.work.coverFallbackColor,
      }));

      return { dueCapsules, rereadCandidates };
    },
  });
}
