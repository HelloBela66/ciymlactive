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

      // Дешевий попередній фільтр ДО запиту деталей: переглянуті due-капсули не варті зайвої
      // роботи (`findCapsuleDueCandidate` однаково відфільтрував би їх).
      const unopenedDueCapsules = rawDueCapsules.filter((c) => c.openedAt == null);

      /**
       * POLYTSIA V1.7, Phase 11 (ТЗ §17) — ВИПРАВЛЕНИЙ N+1. Раніше тут був послідовний
       * `getByIdWithDetails` на КОЖНУ due-капсулу. Виправдання «due-капсул завжди мало» вірне
       * для ОДНОГО Home-слоту, але цей екран показує їх УСІ: людина, що роками ставила капсули
       * на 6-12 місяців, легко накопичує десятки прострочених одночасно — і кожна коштувала
       * окремого запиту з трьома JOIN'ами. Пакетний метод уже існував (`listWithDetailsByIds`,
       * ним користується сусідній розділ «Перечитання» в цьому ж хуку) — тут його просто не
       * застосували.
       */
      const dueUserBooks = await UserBookRepository.listWithDetailsByIds(
        db,
        [...new Set(unopenedDueCapsules.map((c) => c.userBookId))],
      );
      const dueUserBookById = new Map(dueUserBooks.map((ub) => [ub.id, ub]));
      const dueCapsuleCandidateInputs: CapsuleDueCandidateInput[] = unopenedDueCapsules
        .map((capsule) => ({ capsule, userBook: dueUserBookById.get(capsule.userBookId) }))
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

      // Той самий пакетний запит, що й для капсул вище: фіксована кількість запитів незалежно
      // від розміру списку.
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
