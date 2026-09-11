import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { queryKeys } from '@/lib/queryKeys';
import type { LibrarySortOption } from '@/lib/libraryPreferenceStorage';
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

/** Перше ім'я автора — стабільний ключ для сортування "за автором" (той самий підхід, що й
 * `BookRow`'s `authorNames`, лише перший автор, а не весь об'єднаний рядок — щоб порядок не
 * "стрибав" через співавторів, доданих другими). */
function firstAuthorName(book: UserBookWithDetails): string {
  return book.work.authors[0]?.name ?? '';
}

/**
 * POLYTSIA V1.6, Фаза 1 (Library UX) — явний вибір сортування користувачем (кнопка "Сортувати"
 * на екрані Бібліотеки), незалежний від дефолтної логіки `sortAllLibraryView`. Обраний тут
 * порядок ЗАМІНЮЄ, а не доповнює дефолтний — власник продукту, який явно обрав "За назвою",
 * очікує суцільний алфавітний список, а не "читані книги нагорі, а решта за алфавітом" (це
 * була б третя, ніким не проговорена поведінка).
 */
function applySortOption(books: UserBookWithDetails[], sort: LibrarySortOption): UserBookWithDetails[] {
  const sorted = [...books];
  switch (sort) {
    case 'title':
      // Без явного локале-аргумента (Milestone-стиль: `sortAllLibraryView` вище так само
      // порівнює ISO-рядки голим `localeCompare()`) — багатоаргументна, "ICU"-версія
      // `localeCompare` на Hermes залежить від того, чи зібрано рушій з повним пакетом Intl-
      // даних, і на деяких збірках мовчки ігнорує локаль замість коректного українського
      // сортування. Базова однораргументна форма підтримується Hermes завжди й дає прийнятний
      // порядок для кириличних заголовків без цього ризику.
      sorted.sort((a, b) => a.work.title.localeCompare(b.work.title));
      break;
    case 'author':
      sorted.sort((a, b) => firstAuthorName(a).localeCompare(firstAuthorName(b)));
      break;
    case 'updated':
      sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      break;
    case 'default':
      break;
  }
  return sorted;
}

/**
 * Книги бібліотеки за фільтром — конкретний статус (як і раніше, `listByStatus`) або "Усі"
 * (Milestone 11, доповнення3): комбінований перегляд усієї бібліотеки одним списком, тепер
 * default-вкладка на екрані Бібліотеки (`app/(tabs)/library/index.tsx`) — див.
 * `sortAllLibraryView` вище. Один `useQuery` з `filter`, що впливає і на ключ, і на `queryFn`
 * (а не два окремих хуки з умовним вибором — так довелось би або порушити Rules of Hooks
 * умовним викликом, або завжди виконувати обидва запити, включно з непотрібним).
 *
 * POLYTSIA V1.6, Фаза 1: другий параметр `sort` (за замовчуванням `'default'` — та сама
 * поведінка, що й раніше, жоден наявний виклик не ламається) додає ключ і до `queryKey`, щоб
 * різні сортування самого фільтра кешувались окремо (перемикання сортування вперед-назад не
 * б'є повторний запит до БД щоразу).
 */
export function useLibraryByFilter(filter: LibraryFilter, sort: LibrarySortOption = 'default') {
  return useQuery<UserBookWithDetails[]>({
    // `allSorted`/`byStatus`, НЕ голий `userBooks.all` (самоперевірка перед комітом) —
    // `useLibraryAll` вище вже читає РІВНО той самий `userBooks.all` ключ із власним,
    // несортованим `queryFn`; спільний ключ на два різних `queryFn` означав би, що кеш віддає
    // то сортований, то несортований результат залежно від того, який з хуків останнім
    // виконав запит. Обидва ключі однаково падають під префікс `['userBooks']`, тож будь-яка
    // наявна інвалідація за цим префіксом (додавання книги, зміна статусу тощо) змиває кеш усіх
    // варіантів однаково коректно.
    queryKey:
      filter === 'all'
        ? [...queryKeys.userBooks.allSorted, sort]
        : [...queryKeys.userBooks.byStatus(filter), sort],
    queryFn: async () => {
      const db = await getDatabase();
      const books = filter === 'all' ? await UserBookRepository.listAll(db) : await UserBookRepository.listByStatus(db, filter);
      if (sort !== 'default') {
        return applySortOption(books, sort);
      }
      return filter === 'all' ? sortAllLibraryView(books) : books;
    },
  });
}

/** Скільки книг показувати в кожній "розумній" горизонтальній стрічці на вкладці "Усі"
 * (Фаза 1) — досить, щоб стрічку було чим гортати, замало, щоб перетворити верх екрана на ще
 * один повноцінний список (сама стрічка — короткий "натяк", повний перелік лишається доступним
 * через відповідну вкладку статусу). */
const CAROUSEL_LIMIT = 12;

/**
 * "Давно чекають" (Фаза 1, ТЗ п. Library UX) — найдовше не розпочаті книги зі списку "Хочу
 * прочитати", найстаріші за датою додавання — спереду. Той самий базовий запит, що й вкладка
 * "Хочу прочитати" (`byStatus('want_to_read')`, ключ навмисно збігається із `sort:'default'`
 * гілкою `useLibraryByFilter` вище, щоб дані реально ділили один кеш, а не дублювали запит до
 * БД), лише інше сортування й обрізання застосовані клієнтським `select` — не новий запит.
 */
export function useWaitingLongest() {
  return useQuery<UserBookWithDetails[], Error, UserBookWithDetails[]>({
    queryKey: [...queryKeys.userBooks.byStatus('want_to_read'), 'default'],
    queryFn: async () => {
      const db = await getDatabase();
      return UserBookRepository.listByStatus(db, 'want_to_read');
    },
    select: (books) => [...books].sort((a, b) => a.addedAt.localeCompare(b.addedAt)).slice(0, CAROUSEL_LIMIT),
  });
}

/**
 * "Нещодавно завершені" (Фаза 1) — книги, дочитані останніми, найновіші `finishedAt` спереду.
 * Той самий принцип спільного кешу з вкладкою "Прочитано", що й `useWaitingLongest` вище.
 */
export function useRecentlyFinished() {
  return useQuery<UserBookWithDetails[], Error, UserBookWithDetails[]>({
    queryKey: [...queryKeys.userBooks.byStatus('finished'), 'default'],
    queryFn: async () => {
      const db = await getDatabase();
      return UserBookRepository.listByStatus(db, 'finished');
    },
    select: (books) =>
      [...books]
        .filter((book) => !!book.finishedAt)
        .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))
        .slice(0, CAROUSEL_LIMIT),
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
