import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { queryKeys } from '@/lib/queryKeys';
import type { UserBookStatus, UserBookWithDetails } from '@/types/userBook';

/** Книги користувача з певним статусом — вкладки Бібліотеки (Milestone 2). */
export function useLibraryByStatus(status: UserBookStatus) {
  return useQuery<UserBookWithDetails[]>({
    queryKey: queryKeys.userBooks.byStatus(status),
    queryFn: async () => {
      const db = await getDatabase();
      return UserBookRepository.listByStatus(db, status);
    },
  });
}

/** Уся бібліотека користувача — для лічильників по статусах у шапці вкладки. */
export function useLibraryAll() {
  return useQuery<UserBookWithDetails[]>({
    queryKey: queryKeys.userBooks.all,
    queryFn: async () => {
      const db = await getDatabase();
      return UserBookRepository.listAll(db);
    },
  });
}

export type LibraryFilter = 'all' | UserBookStatus;

const ACTIVE_READING_STATUSES: UserBookStatus[] = ['reading', 'rereading'];

/**
 * Сортування комбінованого перегляду "Усі" (Milestone 11, доповнення3 — пряме прохання
 * власника продукту: "спершу ті, що в стані читання, потім — додані останніми"). Навмисно НЕ
 * просто `listAll`'s "updated_at DESC" — там книга, яку щойно перемкнули в "Прочитано" чи
 * "Відкладено", тимчасово стрибала б угору списку разом з активно читаними, хоча читання вже
 * не триває. Тут два явні кошики з різним сенсом сортування для кожного: активне читання
 * (`reading`/`rereading`) — найсвіжіша активність (`updatedAt`) зверху; решта — дата додавання
 * в бібліотеку (`addedAt`), найновіші зверху. ISO-рядки з `nowIso()` порівнюються лексикографічно
 * коректно (той самий прийом, що й `JournalRepository`'s keyset-курсор за `created_at`).
 */
function sortAllLibraryView(books: UserBookWithDetails[]): UserBookWithDetails[] {
  const reading: UserBookWithDetails[] = [];
  const rest: UserBookWithDetails[] = [];
  for (const book of books) {
    (ACTIVE_READING_STATUSES.includes(book.status) ? reading : rest).push(book);
  }
  reading.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  rest.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  return [...reading, ...rest];
}

/**
 * Книги бібліотеки за фільтром — конкретний статус (як і раніше, `listByStatus`) або "Усі"
 * (Milestone 11, доповнення3): комбінований перегляд усієї бібліотеки одним списком, тепер
 * default-вкладка на екрані Бібліотеки (`app/(tabs)/library/index.tsx`) — див.
 * `sortAllLibraryView` вище. Один `useQuery` з `filter`, що впливає і на ключ, і на `queryFn`
 * (а не два окремих хуки з умовним вибором — так довелось би або порушити Rules of Hooks
 * умовним викликом, або завжди виконувати обидва запити, включно з непотрібним).
 */
export function useLibraryByFilter(filter: LibraryFilter) {
  return useQuery<UserBookWithDetails[]>({
    // `allSorted`, НЕ `userBooks.all` (самоперевірка перед комітом) — `useLibraryAll` вище вже
    // читає РІВНО той самий `userBooks.all` ключ із власним, несортованим `queryFn`; спільний
    // ключ на два різних `queryFn` означав би, що кеш віддає то сортований, то несортований
    // результат залежно від того, який з двох хуків останнім виконав запит. Обидва ключі
    // однаково падають під префікс `['userBooks']`, тож будь-яка наявна інвалідація за цим
    // префіксом (додавання книги, зміна статусу тощо) змиває кеш ОБОХ однаково коректно.
    queryKey: filter === 'all' ? queryKeys.userBooks.allSorted : queryKeys.userBooks.byStatus(filter),
    queryFn: async () => {
      const db = await getDatabase();
      if (filter === 'all') {
        return sortAllLibraryView(await UserBookRepository.listAll(db));
      }
      return UserBookRepository.listByStatus(db, filter);
    },
  });
}

/** Одна книга бібліотеки за `userBookId` (Milestone 11, доповнення — компактний екран
 * запуску сесії читання, `app/session/launch/[userBookId].tsx`). Той самий
 * `UserBookRepository.getByIdWithDetails`, що вже використовує `useSessionWithBook` — але
 * ЗА userBookId, не sessionId (тут ще немає жодної сесії, це екран ПЕРЕД її стартом). */
export function useUserBookWithDetails(userBookId: string | undefined) {
  return useQuery<UserBookWithDetails | null>({
    queryKey: queryKeys.userBooks.detail(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return null;
      const db = await getDatabase();
      return UserBookRepository.getByIdWithDetails(db, userBookId);
    },
    enabled: !!userBookId,
  });
}
