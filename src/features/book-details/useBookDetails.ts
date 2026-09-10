import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { WorkRepository } from '@/data/repositories/WorkRepository';
import { EditionRepository } from '@/data/repositories/EditionRepository';
import { SeriesRepository } from '@/data/repositories/SeriesRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { OwnedBookRepository } from '@/data/repositories/OwnedBookRepository';
import { queryKeys } from '@/lib/queryKeys';
import type { WorkWithAuthors } from '@/types/work';
import type { EditionWithRelations } from '@/types/edition';
import type { SeriesContext } from '@/types/series';
import type { UserBook } from '@/types/userBook';
import type { OwnedBook } from '@/types/ownedBook';

export interface BookDetails {
  work: WorkWithAuthors;
  editions: EditionWithRelations[];
  seriesContext: SeriesContext | null;
  /**
   * Статус книги в бібліотеці користувача — прив'язаний до "головного" видання (перше з
   * editions, зазвичай єдине для книг, доданих вручну в Milestone 1). Множинні видання того
   * самого твору з різними UserBook-записами — можливе майбутнє уточнення UI, не потрібне
   * для одного користувача зараз.
   */
  primaryEdition: EditionWithRelations | null;
  userBook: UserBook | null;
  ownedBook: OwnedBook | null;
}

/**
 * Дані Book Details screen. Milestone 1 дав каталожну частину (Work+Edition+серія);
 * Milestone 2 додає стан бібліотеки користувача для "головного" видання — статус читання,
 * улюблене, чи книга позначена як фізично наявна.
 */
export function useBookDetails(workId: string | undefined) {
  return useQuery<BookDetails | null>({
    queryKey: queryKeys.works.detail(workId ?? ''),
    queryFn: async () => {
      if (!workId) return null;
      const db = await getDatabase();
      const work = await WorkRepository.getByIdWithAuthors(db, workId);
      if (!work) return null;
      const [editions, seriesContext] = await Promise.all([
        EditionRepository.listByWorkIdWithRelations(db, workId),
        SeriesRepository.getContextForWork(db, workId),
      ]);

      const primaryEdition = editions[0] ?? null;
      const [userBook, ownedBook] = primaryEdition
        ? await Promise.all([
            UserBookRepository.getByEditionId(db, primaryEdition.id),
            OwnedBookRepository.getByEditionId(db, primaryEdition.id),
          ])
        : [null, null];

      return { work, editions, seriesContext, primaryEdition, userBook, ownedBook };
    },
    enabled: !!workId,
  });
}
