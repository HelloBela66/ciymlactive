import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { BookCapsuleRepository } from '@/data/repositories/BookCapsuleRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { queryKeys } from '@/lib/queryKeys';

export interface MemoryIndexItem {
  userBookId: string;
  workId: string;
  title: string;
  authors: string;
  coverUrl: string | null;
  coverFallbackColor: string | null;
  capsuleId: string;
  lastingThought: string | null;
  oneSentenceMemory: string | null;
  createdAt: string;
}

/**
 * «Моя пам'ять» (ТЗ Фази 18, HOME REDESIGN §HOME SHORTCUTS) — перелік усіх книг, для яких
 * користувач створив Капсулу (Фаза 4), найновіша капсула найзверху
 * (`BookCapsuleRepository.listAll`, `created_at DESC`). Капсул завжди мало (п.45 ТЗ Фази 4),
 * тож послідовний N+1 на деталі книги (`UserBookRepository.getByIdWithDetails`) — той самий
 * прийнятний прийом, що й `rebuildCapsuleRemindersAsync` (`src/features/memory/useBookCapsule.ts`),
 * не "гарячий" шлях застосунку.
 *
 * Одна книга — щонайбільше один рядок (перша зустрінута, тобто найновіша капсула завдяки
 * сортуванню запиту) — перечитування може створити кілька капсул на книгу (п.30/46 ТЗ Фази 4),
 * але список "пам'яті" показує по одному представнику на книгу, не всю історію.
 */
export function useMemoryIndex() {
  return useQuery<MemoryIndexItem[]>({
    queryKey: queryKeys.memoryIndex.all,
    queryFn: async () => {
      const db = await getDatabase();
      const capsules = await BookCapsuleRepository.listAll(db);

      const seenUserBookIds = new Set<string>();
      const items: MemoryIndexItem[] = [];
      for (const capsule of capsules) {
        if (seenUserBookIds.has(capsule.userBookId)) continue;
        seenUserBookIds.add(capsule.userBookId);

        const userBook = await UserBookRepository.getByIdWithDetails(db, capsule.userBookId);
        if (!userBook) continue;

        items.push({
          userBookId: userBook.id,
          workId: userBook.work.id,
          title: userBook.work.title,
          authors: userBook.work.authors.map((a) => a.name).join(', '),
          coverUrl: userBook.edition.coverUrl,
          coverFallbackColor: userBook.work.coverFallbackColor,
          capsuleId: capsule.id,
          lastingThought: capsule.lastingThought,
          oneSentenceMemory: capsule.oneSentenceMemory,
          createdAt: capsule.createdAt,
        });
      }
      return items;
    },
  });
}
