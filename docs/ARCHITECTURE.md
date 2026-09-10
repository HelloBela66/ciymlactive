# ARCHITECTURE.md — «Полиця»

## 1. Технологічний стек і чому саме він

| Шар | Вибір | Чому |
|---|---|---|
| Runtime | React Native 0.86 через **Expo SDK 57** (стабільний реліз, червень 2026) | Не потрібен bare workflow: EAS Build закриває нативну збірку, Expo модулі закривають камеру/нотифікації/сховище без ручного linking. |
| Мова | TypeScript, `strict: true` | Каталог книг — це складна доменна модель (Work≠Edition≠Series...); типи ловлять помилки моделювання на етапі компіляції, а не в рантаймі на реальних даних користувача. |
| Навігація | **Expo Router** (file-based, поверх React Navigation) | Дає typed routes з коробки, і структура `app/` сама документує screen map — не потрібен окремий навігаційний граф, який розходиться з кодом. |
| Локальні дані | **expo-sqlite** (async API) + власний migration runner на `PRAGMA user_version` | Єдине джерело правди, що працює офлайн; SQL дає нам JOIN для звітів (статистика, TBR) без ручного агрегування в JS. |
| Server state | **TanStack Query** | Готова інфраструктура кешування/retry для мережевих запитів пошуку книг (Milestone 7) і спільного каталогу (Milestone 8.2, `SharedCatalogProvider`) — жоден з них не на критичному шляху UI (core loop лишається офлайн-first). Повний Supabase-sync (розділ 8) і далі майбутній, не реалізований. |
| Клієнтський стан | **Zustand**, точково | Тільки для UI-стану, що переживає навігацію в межах сесії (напр. активний reading timer, поточний фільтр бібліотеки). НЕ для доменних даних — ті завжди йдуть через репозиторії з SQLite. |
| Валідація | **Zod** | Кожен зовнішній вхід (Google Books/ISBNdb JSON, JSON backup при restore) проганяється через Zod-схему → внутрішню доменну модель. Ніколи не довіряємо `any` з мережі. |
| Дати | **date-fns** (+ `date-fns-tz` за потреби) | Легкий, tree-shakeable, без мутабельності Moment.js; потрібен для pace/calendar обчислень. |
| Нотифікації | **expo-notifications** (локальні) | П. 28 специфікації — лише локальні нагадування, без push/сервера. |
| Обкладинки | **expo-image** | Кешування на диску, placeholder/blurhash, критично для швидкої Library-сітки при 1000+ книг. |
| Секрети | **expo-secure-store** | Наразі не містить чутливих даних (немає auth), але шар закладений під майбутній Supabase access token. |
| Камера/сканер | **expo-camera** (`CameraView` з `barcodeScannerSettings`) | `expo-barcode-scanner` deprecated і злитий в `expo-camera` — використовуємо актуальний API одразу, щоб не мігрувати пізніше. |
| Білди | **EAS Build**, профілі development/preview/production | П. 49 — потрібні лише development/preview зараз. |

Свідомо **не** використовуємо: Firebase (заборонено умовою), Redux (Zustand+SQLite покривають
потреби без boilerplate), GraphQL (Supabase REST/PostgREST достатньо для майбутнього sync),
watermelonDB/RxDB (додатковий шар абстракції над SQLite, який ми не потребуємо — прямий SQL
з тонким repository-шаром простіший для одного розробника і легше дебажиться).

## 2. Шарувата архітектура (feature-based + layers)

```
UI (app/ routes, feature screens, components)
   │  викликає хуки, ніколи не SQL напряму
   ▼
Feature hooks (src/features/*/hooks) — useReadingSession(), useLibraryFilters()...
   │  оркеструють кілька repositories/services, тримають React Query cache для майбутнього sync
   ▼
Domain services (src/domain/*) — чиста логіка без React і без SQL:
   readingPace.ts, streaks.ts, finishPrediction.ts, tbrEstimate.ts, seriesOrdering.ts,
   backupSerializer.ts
   │  отримують прості дані, повертають прості дані → 100% юніт-тестовані без моків БД
   ▼
Repositories (src/data/repositories/*) — єдине місце, що знає SQL:
   WorkRepository, EditionRepository, UserBookRepository, ReadingSessionRepository, ...
   │
   ▼
DB layer (src/data/db) — connection, migration runner, query helpers
   ▼
SQLite (пристрій)
```

Правило: **компонент екрана ніколи не імпортує `src/data/db` напряму** і не містить бізнес-
логіки (розрахунок pace, побудова прогнозу) — це вимога п. 43 ("не допускай business logic
всередині presentation components"). Domain-сервіси не імпортують React/Expo — це і є межа,
що робить `TESTING.md`-стратегію можливою (домен тестується в Node, без емулятора).

## 3. Sync-заготовка (детально в `LOCAL_FIRST.md`)

Кожна таблиця, що піде в sync (усі, крім `app_settings`), матиме в майбутній міграції
`server_id TEXT`, `dirty INTEGER DEFAULT 0`, `synced_at TEXT`. У V1 ці стовпці **не додаються**
(YAGNI — специфікація explicитно забороняє sync engine зараз), але repository-інтерфейси вже
спроєктовані так, щоб `create/update` проходили через єдину точку (`markDirty()` no-op зараз),
щоб додавання sync пізніше не вимагало переписування викликів у фічах. Детальніше — розділ
"Майбутній Supabase" нижче та `LOCAL_FIRST.md`.

## 4. Route / screen map (Expo Router, `app/`)

Нижче — записана на Milestone 0 ЗАДУМАНА структура, лишена як історичний контекст рішення
"file-based routing без окремого навігаційного графа". **Реальна, актуальна структура `app/`
істотно розійшлась із нею за 11 milestone'ів** (нові екрани, інші назви сегментів, дещо з
задуманого об'єднано/не знадобилось) — повний і актуальний перелік усіх 30 екранів, звірений
станом на зараз, веди в `docs/V2_READINESS.md`, розділ 3 ("Route map — фактичний"), а не тут.

```
app/
├── _layout.tsx                     # Root: ThemeProvider, DB init gate, QueryClientProvider
├── (tabs)/
│   ├── _layout.tsx                 # Bottom tabs: Головна · Бібліотека · Календар · Пошук · Профіль
│   ├── index.tsx                   # ГОЛОВНА (Home)
│   ├── library/
│   │   ├── index.tsx               # БІБЛІОТЕКА: search+tabs+filters+grid/list
│   │   └── shelves/[shelfId].tsx   # Вміст конкретної полиці
│   ├── calendar.tsx                # КАЛЕНДАР: місячна сітка
│   ├── search.tsx                  # ПОШУК: unified (локальна БД + провайдери), ISBN scan CTA
│   └── profile/
│       ├── index.tsx               # ПРОФІЛЬ: статистика summary + вхід у settings/goals
│       ├── statistics.tsx          # Повний statistics dashboard
│       ├── goals.tsx               # Reading goals CRUD
│       ├── wrapped/[year].tsx      # Річний Wrapped
│       ├── owned-library.tsx       # Фізична бібліотека
│       ├── loans.tsx               # Позичені книги
│       └── settings/
│           ├── index.tsx
│           ├── backup.tsx
│           └── about.tsx
├── book/
│   └── [userBookId].tsx            # Book Details (для книги в бібліотеці користувача)
├── work/
│   └── [workId]/
│       ├── index.tsx               # Картка твору до додавання в бібліотеку (з пошуку)
│       └── add-edition.tsx         # Ручне створення/вибір видання
├── series/
│   └── [seriesId].tsx              # Series Screen
├── session/
│   ├── setup.tsx                   # Модалка "почати сесію" (сторінка, ціль)
│   └── active.tsx                  # Активний таймер (full-screen, persistent)
├── day/
│   └── [date].tsx                  # Day Details з календаря
├── note/
│   └── editor.tsx                  # Створення/редагування нотатки (modal)
├── quote/
│   └── editor.tsx                  # Створення/редагування цитати (modal)
├── isbn-scan.tsx                   # Camera modal
└── onboarding/
    └── index.tsx                   # Порожній стан при першому запуску (не auth — просто welcome)
```

Дизайн-принцип п. 52 ("мінімум тапів, без modal-after-modal") лишається чинним і в реальній
структурі: старт читання — один tap з Home, завершення сесії — один екран з summary та
необов'язковими полями, без ланцюжка модалок (докладніше про фактичний екран сесії —
`app/session/[sessionId].tsx`, `docs/V2_READINESS.md` розділ 3).

## 5. Компонентна ієрархія (ключові spots)

```
<RootLayout>
 └ <DatabaseProvider>            # гейтить рендер до готовності міграцій, показує splash
    └ <QueryClientProvider>
       └ <ThemeProvider>          # tokens за system/light/dark
          └ <TabsLayout>
             ├ HomeScreen
             │  ├ CurrentlyReadingCard        # cover, autor, progress, ETA, CTA
             │  ├ TodayStatsRow               # час/сторінки сьогодні, streak
             │  ├ NextInSeriesRow
             │  └ RecentNotesList
             ├ LibraryScreen
             │  ├ LibrarySearchBar
             │  ├ StatusTabs
             │  ├ FilterSheet                 # bottom sheet, не modal-стек
             │  └ BookGrid | BookList         # virtualized (FlashList)
             │     └ BookCover                # спільний з усіма екранами компонент
             ├ CalendarScreen
             │  ├ MonthGrid
             │  │  └ DayCell (indicator-крапка/книжка за інтенсивністю)
             │  └ DaySummarySheet
             ├ SearchScreen
             │  ├ SearchInput
             │  ├ ProviderResultsList
             │  └ ManualCreateCTA
             └ ProfileScreen
                ├ StatsSummaryCard
                └ MenuList → (settings/goals/wrapped/owned/loans)

BookDetailsScreen
 ├ BookHeader (cover + title + author + rating)
 ├ StatusActionBar (start/continue + status picker)
 ├ ProgressSection
 ├ DescriptionSection (collapsible)
 ├ EditionInfoCard
 ├ SeriesLinkCard
 ├ NotesPreviewList
 └ StatsForBookCard

ActiveSessionScreen
 ├ SessionTimerDisplay          # обчислює elapsed з timestamps, не з setInterval-стану
 ├ SessionControls (pause/resume/finish)
 ├ QuickAddNoteButton
 └ QuickAddQuoteButton
```

Спільні низькорівневі компоненти (`src/components/ui`): `Button`, `Card`, `Sheet` (bottom
sheet), `ProgressBar`, `Chip`, `EmptyState`, `ErrorState`, `SegmentedControl`, `Avatar`,
`BookCover` (обгортка над `expo-image` з fallback-кольором з `Work.coverFallback`).

## 6. Design tokens (`src/design/tokens.ts`)

Принцип розділу 36-37: спокійний, преміальний, без вінтажних/неонових мотивів; обкладинки —
головний колірний акцент, UI — нейтральний.

```ts
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const typography = {
  fontFamily: { base: 'System' }, // system font -> нативна підтримка Dynamic Type з коробки
  scale: {
    display: { size: 32, lineHeight: 40, weight: '700' },
    title:   { size: 22, lineHeight: 28, weight: '600' },
    heading: { size: 17, lineHeight: 22, weight: '600' },
    body:    { size: 15, lineHeight: 22, weight: '400' },
    caption: { size: 13, lineHeight: 18, weight: '400' },
    micro:   { size: 11, lineHeight: 14, weight: '500' },
  },
} as const;

// Light/dark як окремі об'єкти однакової форми — компонент завжди читає лише `theme.colors.*`
export const lightColors = {
  bg: '#FAF9F7', surface: '#FFFFFF', surfaceRaised: '#FFFFFF',
  border: '#E7E4DF', textPrimary: '#1B1B18', textSecondary: '#6B6862', textTertiary: '#9C988F',
  accent: '#2F6F5E',        // приглушений smaragd — нейтральний до кольору обкладинок
  accentSoft: '#E6EFEC',
  success: '#2F6F5E', warning: '#B8863B', danger: '#B4453A',
  overlay: 'rgba(20,18,16,0.45)',
} as const;

export const darkColors = {
  bg: '#15140F', surface: '#1D1B16', surfaceRaised: '#242219',
  border: '#332F26', textPrimary: '#F3F1EC', textSecondary: '#B3AFA5', textTertiary: '#7C786E',
  accent: '#6FBFA6', accentSoft: '#1E332C',
  success: '#6FBFA6', warning: '#D9A85C', danger: '#E07567',
  overlay: 'rgba(0,0,0,0.6)',
} as const;

export const motion = { fast: 120, base: 200, slow: 320 } as const; // ms; вимикається за reduceMotion
```

`radius`: картки/обкладинки — `md`/`lg`, кнопки — `pill` або `md`, ніколи гострі кути на
інтерактивних елементах (доступність touch target п. 37). Тіні — мінімальні (`elevation: 1-2`
на Android, `shadowOpacity: 0.06` на iOS), жодних декоративних градієнтів.

## 7. Folder structure

```
polytsya/
├── app/                       # Expo Router routes (див. розділ 4)
├── src/
│   ├── design/                # tokens, ThemeProvider, i18n-labels.ts (укр. підписи enum'ів)
│   ├── components/ui/         # design-system-агностичні примітиви
│   ├── features/
│   │   ├── home/
│   │   ├── library/
│   │   ├── book-details/
│   │   ├── series/
│   │   ├── reading-session/
│   │   ├── calendar/
│   │   ├── notes/
│   │   ├── quotes/
│   │   ├── goals/
│   │   ├── reminders/
│   │   ├── statistics/
│   │   ├── owned-library/
│   │   ├── search/             # provider abstraction UI
│   │   ├── backup/
│   │   └── settings/
│   │       └── each: components/, hooks/, screens iноді реекспортуються в app/*
│   ├── domain/                 # чиста логіка, 0 React-імпортів (див. TESTING.md)
│   │   ├── readingPace.ts
│   │   ├── finishPrediction.ts
│   │   ├── tbrEstimate.ts
│   │   ├── streaks.ts
│   │   ├── seriesOrdering.ts
│   │   └── backupSerializer.ts
│   ├── data/
│   │   ├── db/                 # client.ts, migrations/, migrationRunner.ts
│   │   ├── repositories/       # один файл на агрегат (WorkRepository.ts, ...)
│   │   ├── providers/          # BookMetadataProvider та реалізації (M7), SharedCatalogProvider (M8.2)
│   │   └── remote/             # sharedCatalogClient.ts, catalogSync.ts (M8.2, поза providers/ —
│   │                           # це не джерело метаданих, а сам HTTP-клієнт + фонові записи)
│   ├── stores/                 # Zustand: activeSessionStore.ts, libraryFiltersStore.ts
│   ├── types/                  # доменні типи + Zod-схеми (single source, з них виводяться типи)
│   └── lib/                    # logger.ts, uuid.ts, dateUtils.ts, notifications.ts, deviceId.ts
├── assets/
├── docs/
├── supabase/
│   └── schema.sql              # M8.2 — спільний каталог, docs/SHARED_CATALOG.md
├── __tests__/ або *.test.ts поруч із файлом (домовляємось у TESTING.md)
├── app.json / app.config.ts
├── eas.json
├── babel.config.js
├── metro.config.js
├── tsconfig.json
└── package.json
```

## 8. Майбутній Supabase: схема та sync-стратегія (стисло; повністю — `LOCAL_FIRST.md`)

**Оновлено, Milestone 8.2**: перша, навмисно мінімальна реалізація "спільного каталогу" вже
існує — `docs/SHARED_CATALOG.md`/`supabase/schema.sql` — але це НЕ повний sync-двигун,
описаний нижче: жодного `user_id`/auth/RLS-ізоляції користувача, жодного per-user дзеркала
`user_book`/`reading_session`/... Це вузько одна таблиця метаданих книг (`catalog_book`) +
лічильник анонімних "додав собі" (`catalog_book_device`), доступні лише через 5 конкретних
RPC-функцій — рішення пришвидшити пошук/не дублювати платні ISBNdb-запити, а не крок до
багатокористувацького режиму як такого. План нижче лишається планом.

Коли з'явиться багатокористувацький режим, Supabase Postgres дзеркалить SQLite-схему майже
1:1, з двома відмінностями:

1. Кожна таблиця отримує `user_id UUID REFERENCES auth.users` і RLS policy
   `user_id = auth.uid()` — ізоляція користувачів на рівні БД, а не в коді застосунку.
2. Каталогові таблиці (`work`, `edition`, `author`, `publisher`, `series`, ...) стають
   **спільними** (без `user_id`) — це майбутній модерований український каталог; таблиці
   користувацьких даних (`user_book`, `reading_session`, `note`, `quote`, `shelf`, ...)
   лишаються per-user.

Sync-стратегія (не реалізується зараз, лише архітектурно не блокується):

- **Pull**: `updated_at > last_sync_at` per table, курсором по сторінках.
- **Push**: черга "брудних" локальних записів (`dirty=1`) відправляється в порядку
  створення; конфлікти вирішуються last-write-wins на рівні поля через порівняння
  `updated_at`, окрім `reading_session`, де конфлікт неможливий за дизайном (сесія
  створюється і закривається на одному пристрої, тобто це append-only з боку клієнта).
- Каталогові сутності (`work`/`edition`/...) синхронізуються **тільки pull** з боку клієнта
  для нього-читача; запис у спільний каталог — окремий "запропонувати правку" флоу поза
  межами V1.

Це свідомо залишається текстом-планом, а не кодом: реалізація sync-двигуна без реального
другого пристрою/бекенду для тестування — це негарантований ризик регресій у read-моделі,
якою користувач буде користуватись щодня.

## 9. Milestone-план (без змін по суті відносно ТЗ, з залежностями)

| # | Зміст | Залежить від | Статус |
|---|---|---|---|
| 0 | Архітектура, ініціалізація проєкту, tokens, навігація, DB foundation, docs | — | Готово, перевірено на реальному пристрої |
| 1 | Books/Authors/Works/Editions, manual add, search (лише локальний), book details | 0 | Готово, перевірено на реальному пристрої |
| 2 | User library, статуси, полиці, owned books, серії | 1 | Готово, перевірено на реальному пристрої |
| 3 | Reading timer, sessions, progress, reading history | 1, 2 | Готово, перевірено на реальному пристрої |
| 4 | Calendar, notes, quotes, ratings | 3 | Готово, перевірено на реальному пристрої |
| 5 | Goals, reminders, statistics, streaks | 3, 4 | Готово, перевірено на реальному пристрої |
| 6 | Prediction, TBR reality check, Wrapped, backup/restore | 5 | Готово, перевірено на реальному пристрої |
| 7 | Google Books, Open Library, ISBNdb, ISBN lookup, provider architecture, українська мовна політика | 1 (використовує ту саму normalize-модель) | Готово, перевірено на реальному пристрої (з наступним виправленням: Migration 002, `book_source.source_type` CHECK) |
| 8 | Polish: dark theme, a11y, performance, error states, tests, спільний Supabase-каталог книг (8.1-8.4) | все попереднє | Готово, перевірено на реальному пристрої |
| 9 | Жанри/теги книг, експорт бібліотеки в CSV, автоматичне резервне копіювання, імпорт з Goodreads CSV | 8 | Готово, перевірено на реальному пристрої |
| 10 | Обкладинки книг усюди в застосунку (Home/Бібліотека/Пошук/Book Details/Календар/Полиці/Wrapped), обкладинка в результатах пошуку (локальний каталог + провайдери), "Додати обкладинку" (камера/галерея) для книг без офіційної обкладинки + публікація фото в спільний каталог | 8 (спільний каталог), 9 | Готово, очікує перевірки на реальному пристрої |
| 11 | Android/iOS preview/production builds (EAS) | 10 | Відкладено навмисно — власник продукту вирішив спершу завершити всю функціональну роботу над застосунком і далі тестувати через Expo Go, а вже потім робити перший build (`docs/BUILD_AND_RELEASE.md`: конфігурація `eas.json`/`app.config.ts` вже готова, лишається сам запуск `eas build` під власним Expo/Apple Developer акаунтом) |

M7 навмисно після M6, а не одразу після M1: щоб онлайн-пошук не був єдиним шляхом додавання
книги під час перевірки core loop (M1-M6 мають повністю працювати офлайн, з manual entry).

M9 переосмислено відносно початкового ТЗ (де під цим номером був build-крок, тепер M11):
аудит коду під час M8 виявив, що таблиці `genre`/`tag` (+ зв'язкові `work_genre`/
`tagged_item`) існують у схемі ще з Migration 001, але жоден екран їх не використовував —
власник продукту обрав довести цю та суміжні "довести дані до кінця" фічі (CSV-експорт,
автобекап, Goodreads-імпорт) до готовності перед першим реальним білдом, а не раніше.

M10 виник із того самого приводу вже ПІСЛЯ M9: аудит виявив, що `Edition.coverUrl` давно
зберігається в БД і навіть синхронізується в спільний каталог (M8.2), але жоден екран
застосунку його не рендерив — усюди була лише кольорова плашка-заглушка. Власник продукту
прямо попросив довести це до кінця: реальні обкладинки скрізь в UI, обкладинка в результатах
пошуку для візуального підтвердження "та сама книга", і функцію фотографування власної
обкладинки для книг без офіційної — з публікацією фото в спільний каталог, щоб і іншим
користувачам було легше впізнати ту саму книгу.

## 10. Технічні ризики та мітигації

| Ризик | Вплив | Мітигація |
|---|---|---|
| Втрата активної reading session при force-quit/крашу | Висока — прямо суперечить п.12 | Session пишеться в SQLite одразу при старті (не в пам'яті!) з `started_at`; таймер на екрані — це `now - started_at - pausedTotal`, обчислення, а не накопичувальний стан. При relaunch `DatabaseProvider` перевіряє "осиротілу" сесію (`ended_at IS NULL`) і пропонує відновити/закрити її. |
| `expo-camera` barcode API або поведінка дозволів зміняться між SDK-мінорками | Середня, ізольовано | ISBN-сканування — окремий, замінний модуль (`src/features/search/isbn-scan`); UI завжди має manual ISBN input як fallback, тому регресія сканера не блокує core loop. |
| Продуктивність Library-списку при 1000+ книг / 10000+ нотаток | Середня | Віртуалізація (FlashList), keyset-пагінація, індекси з `DATABASE.md`, обкладинки через `expo-image` з розумним `contentFit`+кешем, статистика рахується в фоновій `InteractionManager`-задачі, не блокуючи джест. |
| Розбіжність Work/Edition моделі ускладнює прості сценарії ("просто додати книгу") | Середня, UX-ризик | Manual add — це один екран, що для простого випадку створює Work+Edition одночасно приховано (advanced-поля видання за "Показати деталі видання") — складність моделі не протікає в UI, поки користувач сам не захоче деталей. |
| Google Books/ISBNdb rate limits або зміна API-контракту | Низька для V1 (не критична функція) | `BookMetadataProvider` — інтерфейс; кожен провайдер degradation-safe (при помилці — тихий fallback на порожній результат + повідомлення "Не вдалося отримати дані", manual entry завжди доступний). |
| SQLite-міграції на реальному пристрої з даними користувача, яких немає в CI | Середня (build M8+) | Кожна міграція — чистий forward-only SQL з тестом "застосувати на seed-БД попередньої версії", `TESTING.md` вимагає інтеграційний тест на реальному `expo-sqlite` (не in-memory мок) для міграцій. |
| Немає npm-реєстру в поточному хмарному sandbox під час розробки (операційне обмеження цього середовища) | Висока для процесу перевірки | **Знято під час перевірки M0 на машині користувача.** Прямий `npm install` за раніше написаними версіями впав (`ERESOLVE`, потім `ETARGET`: кілька версій, підібраних вручну без реєстру, реально не існували — напр. `expo-router` виявився вирівняний під номер SDK, `57.x`, а не власну лінійку `7.x`, як очікувалось за старішими даними). Виправлено звіркою кожної версії напряму з `registry.npmjs.org` — п.11 нижче тепер містить перевірені, а не здогадані значення. |

## 11. Native/Expo залежності та сумісність з SDK 57

**Оновлено після першого реального `npm install` на машині користувача** (2026-09-06): усі
версії нижче звірені напряму з `registry.npmjs.org`, а не підібрані за пам'яттю. Виявлено,
що з SDK 57 практично всі офіційні `expo-*`-пакети (включно з `expo-router`,
`babel-preset-expo`, `jest-expo`, `eslint-config-expo`) перейшли на версіонування, синхронне
з номером SDK (`57.x.x`), а не власну незалежну лінійку — це і стало причиною початкових
`ETARGET`-помилок при встановленні. Пакети поза екосистемою Expo (`react`, `react-native`,
`typescript`, `jest`) звірені окремо: для `react-native` обрано dist-tag `0.86-stable`
(`0.86.3`), а не npm `latest` (яким на момент перевірки була вже наступна лінійка RN,
несумісна з SDK 57); для `typescript` — свідомо не `latest` (major 7, надто свіжий і не
підтверджений з тулчейном Metro/Babel), а перевірена стабільна `5.9.2`; для `jest` — `29.7.0`
замість `latest` (30.x), бо `jest-expo@57.0.5` внутрішньо залежить від `babel-jest`/
`jest-snapshot` лінійки `^29.2.1`.

| Пакет | Роль | Перевірена версія |
|---|---|---|
| expo | Core runtime | ^57.0.20 |
| expo-router | File-based navigation | ^57.0.19 |
| expo-sqlite | Локальна БД | ^57.0.2 (async+sync API) |
| expo-image | Обкладинки | ^57.0.0 |
| expo-notifications | Локальні нагадування | ^57.0.15; Android 13+ вимагає runtime permission `POST_NOTIFICATIONS` — врахований у flow дозволів |
| expo-camera | ISBN barcode scan (M7) | ^57.0.3; `CameraView` + `barcodeScannerSettings` (заміна deprecated `expo-barcode-scanner`) |
| expo-image-picker | "Додати обкладинку": камера + галерея (M10) | ^57.0.0 — **НЕ звірено з `registry.npmjs.org`** (на відміну від решти цієї таблиці, додано вже після діагностики M0 у хмарному sandbox без доступу до реєстру). Підібрано за єдиною версійною конвенцією проєкту (усі `expo-*` — `^57.x.x`, той самий SDK-синхронний паттерн, що описаний вище). Якщо після встановлення `tsc`/збірка покажуть невідповідність — `npx expo install --fix` (`docs/BUILD_AND_RELEASE.md`) підбирає правильну версію під SDK 57 автоматично. |
| expo-secure-store | Секрети (заготовка) | ^57.0.2 |
| expo-file-system | Backup export/import у файл | ^57.0.6 |
| expo-sharing | "Поділитися" backup-файлом | ^57.0.16 |
| expo-document-picker | Вибір JSON-файлу backup (M6) / CSV-файлу Goodreads-імпорту (M9) для відновлення/імпорту | ^57.0.0 — **виявлена й закрита лише зараз (Milestone 10 fix2)** прогалина: код (`src/lib/backupFile.ts`, `src/lib/csvFile.ts`) використовував `expo-document-picker` ще з Milestone 6, але пакет жодного разу не потрапляв у `package.json` — ніхто (включно з попередніми ручними рев'ю) цього не помітив, доки в користувача вперше не запрацював повний цикл `npm install` + `npx tsc --noEmit` в оновленій, чистій папці; до цього моменту в хмарному sandbox без `node_modules` для RN-проєкту така прогалина не виявлялась узагалі. |
| expo-constants / expo-linking / expo-font / expo-system-ui / expo-status-bar / expo-splash-screen | Інфраструктурні Expo-модулі | ^57.0.17 / ^57.0.9 / ^57.0.3 / ^57.0.1 / ^57.0.1 / ^57.0.5 |
| babel-preset-expo | Babel-трансформи для RN/TS | ^57.0.10 (був відсутній у першій версії `package.json` — додано) |
| react / react-dom | UI runtime | 19.2.8 (exact) |
| react-native | Core runtime | 0.86.3 (exact, dist-tag `0.86-stable`) |
| react-native-safe-area-context / -screens / -gesture-handler / -reanimated / -worklets | Навігація/жести/анімації під expo-router | ^5.9.1 / ^4.27.0 / ^3.2.1 / ^4.6.0 / ^0.12.1 |
| @react-navigation/native + bottom-tabs | Використовується під капотом expo-router | ^7.3.18 / ^7.18.18 — **прямий `import ... from '@react-navigation/native'` у власному коді застосунку заборонений з SDK 56** (`expo-router` кидає помилку на старті бандла: "As of SDK 56, expo-router is no longer compatible with react-navigation" — виявлено реальним крашем на пристрої, Milestone 10 fix6, `app/work/new.tsx`). Той самий рантайм (хуки `useNavigation`/`usePreventRemove`/`ThemeProvider`/`DarkTheme` тощо) тепер імпортується з `expo-router/react-navigation` — лише шлях модуля змінився, поведінка та сама (докладніше — https://docs.expo.dev/router/migrate/sdk-55-to-56/). |
| @tanstack/react-query | Server state (готово, не активне у V1) | ^5.102.8 |
| zustand | UI/session стан | ^5.0.15 |
| zod | Валідація | ^4.5.4 (мажорний апгрейд відносно початкового плану на v3; ще не використана в жодному файлі M0, тож зворотної сумісності перевіряти не було потреби — врахувати v4-синтаксис у Milestone 1, коли з'являться перші Zod-схеми) |
| date-fns | Дати | ^4.4.0 |
| @shopify/flash-list | Віртуалізовані списки (продуктивність, п.38) | ^2.3.2 |
| jest / jest-expo / @types/jest | Тести | ^29.7.0 / ^57.0.5 / ^29.5.0 (навмисно НЕ jest@30 — див. пояснення вище) |
| eslint / eslint-config-expo | Лінтинг | ^9.0.0 / ^57.0.2 |
| typescript | Типи | ~5.9.2 (навмисно НЕ typescript@7 — див. пояснення вище) |

Ризик несумісності тепер мінімальний не лише в теорії, а й на практиці: усі значення вище —
реальні опубліковані версії, підтверджені через `registry.npmjs.org` під час діагностики
першого запуску M0, а не відтворені з пам'яті.
