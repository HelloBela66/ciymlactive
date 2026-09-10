/**
 * Централізовані React Query ключі. Один файл замість розкиданих рядкових літералів по
 * фічах — щоб інвалідація після мутацій (наприклад, після додавання книги) не залежала від
 * того, чи всі місця написали той самий ключ вручну однаково.
 */
export const queryKeys = {
  works: {
    all: ['works'] as const,
    search: (query: string) => ['works', 'search', query] as const,
    recent: () => ['works', 'recent'] as const,
    detail: (workId: string) => ['works', 'detail', workId] as const,
  },
  userBooks: {
    all: ['userBooks'] as const,
    // Milestone 11, доповнення3 — окремий ключ для сортованого "Усі" (`useLibraryByFilter`,
    // `sortAllLibraryView`), навмисно НЕ той самий, що `all` (яким користується `useLibraryAll`,
    // з нею — з ІНШИМ, несортованим `queryFn`): один спільний ключ на два різних `queryFn` —
    // класична пастка React Query, де кеш віддає то сортований, то несортований результат
    // залежно від того, який хук останнім зробив запит.
    allSorted: ['userBooks', 'allSorted'] as const,
    byStatus: (status: string) => ['userBooks', 'byStatus', status] as const,
    byEdition: (editionId: string) => ['userBooks', 'byEdition', editionId] as const,
    detail: (userBookId: string) => ['userBooks', 'detail', userBookId] as const,
  },
  shelves: {
    all: ['shelves'] as const,
    detail: (shelfId: string) => ['shelves', 'detail', shelfId] as const,
    forUserBook: (userBookId: string) => ['shelves', 'forUserBook', userBookId] as const,
  },
  ownedBooks: {
    byEdition: (editionId: string) => ['ownedBooks', 'byEdition', editionId] as const,
  },
  series: {
    detail: (seriesId: string) => ['series', 'detail', seriesId] as const,
  },
  sessions: {
    active: ['sessions', 'active'] as const,
    detail: (sessionId: string) => ['sessions', 'detail', sessionId] as const,
    history: (userBookId: string) => ['sessions', 'history', userBookId] as const,
    // POLYTSIA V1.5, Фаза 8 (READING CONTINUITY) — остання завершена сесія на кожну книгу зі
    // списку "Зараз читаєш" (Home), пакетно. `[...userBookIds].sort()` — порядок книг у списку
    // вже детермінований (`useLibraryByStatus`), але сортування тут прибирає будь-яку залежність
    // ключа кешу від порядку викликів. Інвалідується за префіксом `['sessions','continuity']`
    // (`useSessionMutations.ts`/`journalInvalidation.ts`), не за цим повним ключем — те саме
    // рішення, що й `journal.feed` (Фаза 4): склад/порядок `userBookIds` не повинен впливати на
    // те, чи інвалідація "влучає".
    continuity: (userBookIds: string[]) => ['sessions', 'continuity', [...userBookIds].sort()] as const,
  },
  notes: {
    byUserBook: (userBookId: string) => ['notes', 'byUserBook', userBookId] as const,
  },
  noteCategories: {
    // Milestone 11 (доповнення) — власні категорії нотаток користувача, під конкретну книгу.
    // Окремий ключ для активних (чипи вибору) і всіх включно з видаленими (резолв назви на
    // старих нотатках, `resolveEntryTypeLabel`) — обидва читаються з тієї самої таблиці, але
    // різними запитами (`NoteCategoryRepository.listActiveByUserBookId`/`listAllByUserBookId`),
    // тож кешуються окремо.
    active: (userBookId: string) => ['noteCategories', 'active', userBookId] as const,
    all: (userBookId: string) => ['noteCategories', 'all', userBookId] as const,
  },
  quotes: {
    byUserBook: (userBookId: string) => ['quotes', 'byUserBook', userBookId] as const,
  },
  journal: {
    // Milestone 11 (Мій щоденник) — union-читання note+quote (`JournalRepository`).
    // Мутації notes/quotes (favorite/reaction/create/remove) інвалідують і власний ключ, і
    // цей, щоб глобальна стрічка/бейдж лишались синхронними без окремого дублювання логіки.
    byUserBook: (userBookId: string) => ['journal', 'byUserBook', userBookId] as const,
    favoritesByUserBook: (userBookId: string) => ['journal', 'favoritesByUserBook', userBookId] as const,
    // POLYTSIA V1.5, Фаза 11 («ПОВЕРНУТИСЯ ПІЗНІШЕ») — той самий "малий список по одній книзі"
    // ключ, що й `favoritesByUserBook` вище.
    revisitLaterByUserBook: (userBookId: string) => ['journal', 'revisitLaterByUserBook', userBookId] as const,
    countByUserBook: (userBookId: string) => ['journal', 'countByUserBook', userBookId] as const,
    bySession: (sessionId: string) => ['journal', 'bySession', sessionId] as const,
    // Параметризований фільтрами (Фаза 4; розширено пошуковими фільтрами — Фаза 7) — щоб
    // кожна комбінація тип/обране/текст/реакція/книга/дата кешувалась окремо. Інвалідація йде
    // за спільним префіксом `['journal', 'feed']` (`journalInvalidation.ts`), а не за цим
    // повним ключем — так одна мутація нотатки/цитати змиває стрічку одразу для БУДЬ-ЯКОГО
    // набору фільтрів, не лише поточного.
    feed: (filters: {
      favoriteOnly: boolean;
      // POLYTSIA V1.5, Фаза 11 — той самий "лише позначені" фільтр, що й `favoriteOnly`.
      revisitLaterOnly: boolean;
      types: string[] | null;
      query?: string | null;
      reaction?: string | null;
      workId?: string | null;
      dateFrom?: string | null;
      dateTo?: string | null;
    }) => ['journal', 'feed', filters] as const,
    countAll: ['journal', 'countAll'] as const,
    draft: (userBookId: string) => ['journal', 'draft', userBookId] as const,
    // Milestone 11, доповнення (реакції) — агрегована статистика "N смішних моментів..." на
    // екрані щоденника (`app/journal/index.tsx`). Без параметрів, той самий сенс, що й
    // `countAll` — рахується по всій бібліотеці одразу.
    reactionCounts: ['journal', 'reactionCounts'] as const,
  },
  ratings: {
    byUserBook: (userBookId: string) => ['ratings', 'byUserBook', userBookId] as const,
  },
  bookMemory: {
    byUserBook: (userBookId: string) => ['bookMemory', 'byUserBook', userBookId] as const,
  },
  genres: {
    all: ['genres', 'all'] as const,
    byWork: (workId: string) => ['genres', 'byWork', workId] as const,
  },
  tags: {
    byWork: (workId: string) => ['tags', 'byWork', workId] as const,
  },
  calendar: {
    month: (monthKey: string) => ['calendar', 'month', monthKey] as const,
    day: (dayKey: string) => ['calendar', 'day', dayKey] as const,
  },
  goals: {
    all: ['goals', 'all'] as const,
  },
  reminders: {
    all: ['reminders', 'all'] as const,
  },
  statistics: {
    overall: ['statistics', 'overall'] as const,
  },
  activityHistory: {
    // POLYTSIA V1.5, Фаза 12 (READING ACTIVITY HISTORY) — без параметрів, той самий сенс, що й
    // `statistics.overall`: один запит на всю похідну стрічку подій користувача.
    recent: ['activityHistory', 'recent'] as const,
  },
  tbr: {
    reality: ['tbr', 'reality'] as const,
  },
  wrapped: {
    year: (year: number) => ['wrapped', 'year', year] as const,
  },
  autoBackup: {
    settings: ['autoBackup', 'settings'] as const,
  },
  trends: {
    // «Тренди» (Milestone 11, доповнення) — топ-N за кількістю пристроїв, що зберегли книгу
    // (`catalog_top_books`, `SharedCatalogClient.topBooks`). Без параметрів у ключі: єдиний
    // список на весь застосунок (не залежить від пошукового запиту користувача).
    top: ['trends', 'top'] as const,
  },
  search: {
    // POLYTSIA V1.5, Фаза 6 — Global Personal Search: окремий концепт від зовнішнього
    // `providerSearch` нижче — шукає лише по вже наявних даних користувача (книги/автори,
    // серії, полиці, щоденник, цитати), повністю офлайн.
    personal: (query: string) => ['search', 'personal', query] as const,
  },
  providerSearch: {
    byProvider: (providerId: string, query: string) => ['providerSearch', providerId, query] as const,
    // Префікс (без тексту запиту) — навмисно окремий ключ, а не похідне зрізання
    // `byProvider(...)`: React Query інвалідовує за префіксом масиву, тож
    // `invalidateQueries({ queryKey: providerSearch.sharedCatalogAll })` зносить кеш ВСІХ
    // раніше виконаних пошукових запитів по спільному каталогу одразу, незалежно від тексту
    // (Milestone 8.3 — після публікації/позначки "додано" в каталог, `staleTime` 5 хв у
    // `useProviderSearch` інакше й далі показував би застарілий, "порожній" результат для
    // того самого тексту пошуку).
    sharedCatalogAll: ['providerSearch', 'shared_catalog'] as const,
  },
};
