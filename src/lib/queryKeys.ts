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
    // REREADING MODEL, Фаза 12 (`025_rating_run.ts`) — ключ НЕ перейменований разом з
    // репозиторієм (`RatingRepository.getCurrent`) — сам ключ і досі про "запит по
    // userBookId", лише те, ЩО він повертає, тепер прив'язане до поточного run, а не до книги
    // взагалі (`rating.reading_run_id` — тепер UNIQUE, більше не `user_book_id`).
    byUserBook: (userBookId: string) => ['ratings', 'byUserBook', userBookId] as const,
  },
  bookMemory: {
    byUserBook: (userBookId: string) => ['bookMemory', 'byUserBook', userBookId] as const,
  },
  bookCapsule: {
    // POLYTSIA V1.6, Фаза 4 («Капсула книги») — найновіша капсула КНИГИ ЗАГАЛОМ, той самий
    // "малий запит по одній книзі" сенс, що й `bookMemory.byUserBook` вище, навіть попри те,
    // що `book_capsule.user_book_id` НЕ унікальний (`012_book_capsule.ts`) —
    // `BookCapsuleRepository.getByUserBookId` сама бере найновішу.
    byUserBook: (userBookId: string) => ['bookCapsule', 'byUserBook', userBookId] as const,
    // REREADING MODEL, Фаза 10 (`docs/READING_RUN.md`) — капсула САМЕ поточного (найновішого)
    // run книги, окремий ключ від `byUserBook` вище: вони можуть розходитись (стара капсула
    // попереднього прочитання ще існує, а поточний run своєї ще не має) —
    // `BookCapsuleRepository.getCurrent`.
    currentByUserBook: (userBookId: string) => ['bookCapsule', 'currentByUserBook', userBookId] as const,
  },
  capsuleRecall: {
    // Фаза 13 (Book Memory ungating + consolidation, `docs/READING_RUN.md` — "Recall = дія над
    // Capsule") — історія "спроб згадати" конкретної капсули (`capsule_recall`,
    // `013_capsule_recall.ts`, POLYTSIA V1.6 Фаза 5). `CapsuleRecallRepository.listByBookCapsuleId`
    // існував з самої Фази 5 як заготовка для майбутнього UI (`docs/RECALL.md`) — цей ключ і
    // хук (`useCapsuleRecallHistory`, `useCapsuleRecall.ts`) і є тим UI: новий розділ
    // "Пригадування" на Book Memory. Параметризований `bookCapsuleId` (НЕ `userBookId`) — той
    // самий рівень, що й сама таблиця.
    byBookCapsule: (bookCapsuleId: string) => ['capsuleRecall', 'byBookCapsule', bookCapsuleId] as const,
  },
  preReadingReflection: {
    // POLYTSIA V1.6, Фаза 6 («До/Після») — той самий "малий запит по одній книзі" сенс, що й
    // `ratings.byUserBook`/`bookCapsule.byUserBook` вище (`pre_reading_reflection.user_book_id`
    // — UNIQUE, `014_pre_reading_reflection.ts`).
    byUserBook: (userBookId: string) => ['preReadingReflection', 'byUserBook', userBookId] as const,
  },
  dnfReflection: {
    // POLYTSIA V1.6, Фаза 12 (DNF IMPROVEMENT); REREADING MODEL, Фаза 11
    // (`024_dnf_reflection_run.ts`) — той самий "малий запит по одній книзі" сенс, що й
    // `preReadingReflection.byUserBook` вище: ключ НЕ перейменований разом з репозиторієм
    // (`DnfReflectionRepository.getCurrent`, Фаза 11) — сам ключ і досі про "запит по
    // userBookId", лише те, ЩО він повертає, тепер прив'язане до поточного run, а не до книги
    // взагалі (`dnf_reflection.reading_run_id` — тепер UNIQUE, більше не `user_book_id`).
    byUserBook: (userBookId: string) => ['dnfReflection', 'byUserBook', userBookId] as const,
  },
  readingRuns: {
    // REREADING MODEL, Фаза 12 (`docs/READING_RUN.md` §"Фаза 12") — ВСІ run'и книги разом з
    // повними даними по кожному (оцінка/спогад/До-Після/капсула/DNF/статистика сесій),
    // РІВНО ОДИН запит на ВСІ UI-споживачі: "Історія прочитань" на Book Details й на Book
    // Memory (спільний `ReadingRunsHistorySection`, `src/components/reading-runs/`, Фаза 13)
    // і екран порівняння (`app/reread-comparison/[workId].tsx`) — той самий "один хук,
    // спільний кеш" принцип, що й `sessions`/`FinishPredictionSection` вище
    // (`ReadingHistorySection`). Порівняння сáме фільтрує лише `status === 'finished'`
    // зі спільного результату, а не робить власний запит.
    detailByUserBook: (userBookId: string) => ['readingRuns', 'detailByUserBook', userBookId] as const,
  },
  bookHistory: {
    // POLYTSIA V1.7, Phase 2 («Моя історія з цією книгою», `docs/V1_7_READING_LIFE.md`) — лише
    // те, чого НЕМАЄ в `readingRuns.detailByUserBook` вище: картка книги, сесії та
    // spoiler-фільтрований журнал. Оцінка/спогад/капсула на кожен прохід свідомо НЕ
    // перезапитуються — хронологія збирається над уже закешованим результатом
    // `useReadingRunsDetail`, щоб не мати двох джерел правди про прохід (той самий "один хук,
    // спільний кеш" принцип, що й у `readingRuns` вище).
    sources: (userBookId: string) => ['bookHistory', 'sources', userBookId] as const,
  },
  readingLife: {
    // POLYTSIA V1.7, Phase 4 («Моя читацька історія», `docs/V1_7_READING_LIFE.md`) — БЕЗ
    // параметрів, і це головне архітектурне рішення цієї фази: екран року й екран місяця НЕ
    // мають власних ключів. Обидва читають цей один кеш-запис і беруть із нього свій зріз
    // (`findReadingLifeYear`/`findReadingLifeMonth`, `src/lib/readingLife.ts`).
    //
    // Альтернатива (`year(2026)`/`month('2026-06')` з власним `queryFn` на кожен) означала б
    // рівно те, що ТЗ V1.7 називає головним антипатерном: кілька незалежних обчислень однієї й
    // тієї самої історичної правди, здатних розійтись. Той самий "один хук, спільний кеш"
    // принцип, що й `readingRuns.detailByUserBook`, лише на рівні всієї історії.
    all: ['readingLife', 'all'] as const,
    // Книги конкретного місяця (обкладинки/назви для «Що я дочитав») — окремий, ВУЗЬКИЙ
    // діапазонний запит: назви й обкладинки потрібні лише відкритому місяцю, тягнути їх у
    // загальний `all` для всієї історії одразу було б марно.
    monthBooks: (monthKey: string) => ['readingLife', 'monthBooks', monthKey] as const,
  },
  loreEntities: {
    // POLYTSIA V1.6, Фаза 9-10 («Персонажі» → PERSONAL LORE) — той самий рівень, що й
    // `genres.byWork`/`tags.byWork` нижче: `lore_entity.work_id`, не `user_book_id`
    // (`015_lore_entity.ts`).
    byWork: (workId: string) => ['loreEntities', 'byWork', workId] as const,
    // Персонажі, пов'язані з конкретним записом щоденника (`journal_lore_link`) — той самий
    // "малий запит по одному запису" сенс, що й `journal.bySession`.
    linkedEntries: (loreEntityId: string) => ['loreEntities', 'linkedEntries', loreEntityId] as const,
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
    // Календар 2.0 (Фаза 19) — підсумок КАЛЕНДАРНОГО місяця (не сітки з паддінгом сусідніх
    // місяців, на відміну від `month` вище) — окремий ключ, бо межі діапазону інші.
    monthSummary: (monthKey: string) => ['calendar', 'monthSummary', monthKey] as const,
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
  onThisDay: {
    // POLYTSIA V1.6, Фаза 3 («Цей день у твоєму читанні») — ключ параметризований місяцем+днем
    // (`'MM-dd'`), а не датою включно з роком: сама суть запиту — "усі роки за цю календарну
    // дату", тож природний кеш-запис один на календарний день (сьогодні і рівно через рік —
    // той самий ключ, і мають повертати той самий набір минулих спогадів, доки нічого не
    // змінилось).
    forMonthDay: (monthDay: string) => ['onThisDay', monthDay] as const,
  },
  tbr: {
    reality: ['tbr', 'reality'] as const,
  },
  home: {
    // ТЗ Фази 18 (HOME REDESIGN) — "сирі" дані для вибору ЄДИНОЇ контекстної картки Home
    // (`useHomeContextCard.ts`, `src/lib/homeContext.ts`), без параметрів — той самий "один
    // запит на весь застосунок" сенс, що й `statistics.overall`/`tbr.reality`.
    contextCard: ['home', 'contextCard'] as const,
    // POLYTSIA V1.6.2, #169 (HOME CONTEXT SUPPRESSION) — окремий ключ від `contextCard` вище:
    // приглушені ключі (`homeContextSuppressionStorage.ts`) читаються з `SecureStore`, не з БД,
    // і інвалідуються окремо (на дію "приховати", а не на будь-яку зміну "сирих" даних картки).
    contextCardSuppression: ['home', 'contextCardSuppression'] as const,
  },
  memoryIndex: {
    // ТЗ Фази 18 (HOME REDESIGN §HOME SHORTCUTS, «Моя пам'ять») — той самий "без параметрів"
    // сенс, що й `home.contextCard` вище: один список капсул на весь застосунок.
    all: ['memoryIndex', 'all'] as const,
  },
  memoryHub: {
    // MEMORY HUB HIERARCHY, Фаза 16 (`docs/MEMORY_HUB.md`) — окремий ключ від `memoryIndex.all`
    // вище: той самий екран (`app/memory/index.tsx`), але два НОВІ розділи ("Час згадати"/
    // "Перечитання"), з іншим `queryFn`, тож окремий кеш-запис, той самий принцип, що й
    // `userBooks.all` vs `userBooks.allSorted` (різні `queryFn` — ніколи один спільний ключ).
    all: ['memoryHub', 'all'] as const,
  },
  wrapped: {
    year: (year: number) => ['wrapped', 'year', year] as const,
  },
  seasons: {
    // ТЗ Фази 13 (READING SEASONS) — той самий "один рядок ключа на екран" сенс, що й
    // `wrapped.year` вище, лише параметризований стабільним рядком сезону (`formatSeasonKey`,
    // `src/lib/season.ts`) замість голого числа року.
    bySeasonKey: (seasonKey: string) => ['seasons', 'bySeasonKey', seasonKey] as const,
  },
  readingProfile: {
    // ТЗ Фази 14 (READING PROFILE) — той самий "без параметрів" сенс, що й
    // `statistics.overall`: усі insight'и рахуються за весь час, без року/сезону.
    overall: ['readingProfile', 'overall'] as const,
  },
  fingerprint: {
    // ТЗ Фази 15 (READING FINGERPRINT) — той самий "без параметрів, за весь час" сенс, що й
    // `readingProfile.overall` вище.
    overall: ['fingerprint', 'overall'] as const,
  },
  autoBackup: {
    settings: ['autoBackup', 'settings'] as const,
  },
  backupHealth: {
    // ТЗ Фази 13 (BACKUP HEALTH UX) — без параметрів, той самий сенс, що й
    // `activityHistory.recent`/`statistics.overall`: один запит на весь стан копіювання.
    status: ['backupHealth', 'status'] as const,
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
