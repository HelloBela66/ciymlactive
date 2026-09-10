# DATABASE.md — «Полиця»: локальна схема даних (SQLite)

## Навіщо цей документ

SQLite — це джерело правди (source of truth) для першого релізу. Supabase з'явиться пізніше як
sync/catalog backend, але жодна читацька дія (старт сесії, прогрес, нотатка) не повинна залежати
від мережі. Тому схема спроєктована так, щоб:

1. коректно розрізняти **твір** (Work) і **видання** (Edition) — це наскрізна вимога специфікації;
2. кожен рядок мав стабільний **глобально унікальний** ідентифікатор (`TEXT` UUID, а не
   autoincrement `INTEGER`) — це потрібно вже зараз, бо autoincrement ID неможливо безболісно
   синхronizувати з Supabase пізніше (конфлікти ID між пристроями). Ціна — трохи більший розмір
   індексів, вигода — синхронізація без переписування схеми;
3. кожна таблиця, що колись піде в sync, мала `created_at`, `updated_at`, `deleted_at`
   (soft delete) і `dirty`/`synced_at` поля — заготовка під майбутній sync engine (`LOCAL_FIRST.md`);
4. `ReadingSession` була **immutable historical record**: session, once completed, не
   перезаписується перерахунком прогресу — прогрес книги є похідною (derived view) від сесій,
   а не окремим лічильником, який можна розсинхронізувати.

## Технічна реалізація

- `expo-sqlite` (~57.x), асинхронне API (`openDatabaseAsync`, `withTransactionAsync`,
  `runAsync`, `getAllAsync`).
- Міграції керуються через `PRAGMA user_version` (офіційний рекомендований Expo патерн):
  кожна міграція — це файл `NNN_description.ts`, що експортує `up(db): Promise<void>`.
  Раннер застосовує міграції послідовно від поточного `user_version` до останньої.
  Жодних "ручних" ALTER TABLE поза цим механізмом (вимога специфікації, п. 42).
  Міграція може додатково експортувати `manualTransaction = true`, якщо їй потрібно самій
  керувати транзакцією/`PRAGMA foreign_keys` (раннер тоді не обгортає її автоматично) — той
  самий rebuild-патерн (нова таблиця з потрібним CHECK-обмеженням → копія даних → видалення
  старої → перейменування) використовують `002_book_source_isbndb.ts` і
  `007_book_source_curated.ts` — обидва перебудовують `book_source`, на який посилаються FK з
  інших таблиць.
- `curated_book` (кураторська добірка, Milestone 11, доповнення) НЕ частина цієї локальної
  схеми — вона живе виключно в Supabase (`supabase/schema.sql`), той самий бекенд, що й
  спільний каталог (`docs/SHARED_CATALOG.md`). Локально від неї лишається тільки те, що вже
  описано вище: `book_source.source_type = 'curated'` (міграція 007) і `book_key` у
  `book_recommendation_shown`, коли показана книга прийшла з добірки.

### Історія міграцій

1. **001_base_schema** — уся базова схема нижче.
2. **002_book_source_isbndb** — додає `'isbndb'` до CHECK-обмеження `book_source.source_type`
   (пропущено в 001, коли з'явився платний ISBNdb-провайдер у Milestone 7 — Zod-схема
   `BookSourceTypeSchema` у `src/types/bookDraft.ts` це значення вже мала, а SQLite-схема
   ні, що спричиняло `CHECK constraint failed` при збереженні книг з ISBNdb). SQLite не
   підтримує зміну CHECK напряму — таблицю перебудовано (create new → copy → drop → rename)
   з `PRAGMA foreign_keys = OFF` навколо цього кроку, щоб DROP TABLE не обнулив
   `edition.source_id`/`field_provenance.source_id` через їхній `ON DELETE SET NULL`.
3. **003_journal_entry_extensions** — фундамент «Мій щоденник» / «Спогад про книгу»
   (Milestone 11). Рішення Фази 1 аналізу (узгоджено з користувачем): `note`/`quote`
   лишаються окремими таблицями (не переносяться в одну) — концепція "JournalEntry"
   реалізована як union НА РІВНІ ЧИТАННЯ (`JournalRepository.ts`), не як нова таблиця.
   Додає до `note`: `'moment'` у CHECK `type` (перебудова таблиці — та сама причина, що й
   у 002), `is_favorite`, `reaction`. Додає до `quote` (простий `ALTER TABLE ADD COLUMN`,
   без CHECK — rebuild не потрібен): `progress_percent`, `tags`, `is_favorite`, `reaction` —
   ті самі поля, що вже були лише в `note`, для симетричного читання. Додає нову таблицю
   `journal_draft` — чернетка незбереженого запису композера, один слот на книгу
   (`user_book_id` як PRIMARY KEY), навмисно поза бекапом (§Backup-формат нижче).
4. **004_book_memory** — «Спогад про книгу» (Milestone 11, Фаза 7). Нова таблиця
   `book_memory`: власна текстова рефлексія користувача (`reflection`) + вибрані записи
   щоденника (`entry_refs`, JSON-масив `{id, kind}` — посилання на `note`/`quote` за id, не
   копія тексту). Щонайбільше один спогад на книгу (`UNIQUE(user_book_id)`, той самий патерн,
   що й `rating`). Навмисно без жодних полів про вигляд картки (шаблон/колір/зображення) —
   вони прийдуть окремою адитивною міграцією у Фазі 8, коли з'явиться сам конструктор картки.
   На відміну від `journal_draft`, ця таблиця Є в бекапі (§Backup-формат нижче) — це свідомо
   збережені дані користувача, а не тимчасовий чернетковий стан пристрою.
5. **005_book_memory_template** — шаблон картки-спогаду (Milestone 11, Фаза 8). Додає до
   `book_memory` одну колонку `template_id TEXT NOT NULL DEFAULT 'classic'` (простий
   `ALTER TABLE ADD COLUMN`, БЕЗ CHECK на список значень — той самий свідомий вибір, що й для
   `note.reaction` у 003: список шаблонів реалістично поповниться, а зміна CHECK завжди
   вимагає rebuild-міграції; набір значень фіксується лише TypeScript-типом
   `MemoryCardTemplateId`, `src/types/bookMemory.ts`). Існуючі рядки `book_memory` з Фази 7
   отримують `'classic'` заднім числом.
6. **006_recommendation_shown** — «Що почитати завтра?» (Milestone 11, доповнення). Нова
   таблиця `book_recommendation_shown`: локальна історія книг, уже запропонованих для
   конкретної пари "жанр + мета читання" (`genre_id`, `purpose`, `book_key` — ISBN або, коли
   ISBN немає, сам `externalId` кандидата, `recommendationBookKey`,
   `src/lib/tomorrowRecommendation.ts`), щоб та сама книга не пропонувалась повторно на той
   самий запит. `genre_id` — FK на `genre`, `ON DELETE CASCADE`. БЕЗ CHECK на `purpose` (той
   самий свідомий вибір, що й 003/005 — enum лишається лише в TypeScript,
   `RecommendationPurpose`, `src/lib/tomorrowRecommendation.ts`). Індекс на
   `(genre_id, purpose)` — саме за цією парою читає й пише `RecommendationRepository`.
7. **007_book_source_curated** — той самий rebuild-патерн, що й 002 (`manualTransaction`,
   `PRAGMA foreign_keys` OFF/ON навколо перестворення `book_source`): додає `'curated'` до
   CHECK-обмеження `book_source.source_type` — `CuratedCatalogProvider.ts` (Milestone 11,
   доповнення, розділ нижче) отримав нове значення в `BookSourceTypeSchema`
   (`src/types/bookDraft.ts`), і без цієї міграції збереження книги з кураторської добірки
   падало б з `CHECK constraint failed`.
8. **008_note_category** — власні категорії нотаток користувача (Milestone 11, доповнення —
   панель читання). Нова таблиця `note_category` (`user_book_id` → `user_book`, `ON DELETE
   CASCADE`, м'яке видалення через `deleted_at`) і нова nullable-колонка `note.category_id`
   (простий `ALTER TABLE ADD COLUMN`, навмисно БЕЗ `REFERENCES` — той самий ризик rebuild-міграцій
   з FK через `ALTER TABLE`, що й описано у 002). `note.type` лишається як є (`'general'` за
   замовчуванням) навіть коли задана власна категорія — обидва поля співіснують, UI резолвить
   назву через `resolveEntryTypeLabel`.
9. **009_shelf_theme** — тематичне оформлення полиці (Milestone 11, доповнення8). Проста
   `ALTER TABLE ADD COLUMN theme TEXT NOT NULL DEFAULT 'classic'` — той самий свідомий вибір,
   що й 003/005: список тем фіксується лише TypeScript-типом, не CHECK. Існуючі полиці
   отримують `'classic'` заднім числом.
10. **010_reading_experience** — «Як читалося?» (POLYTSIA V1.5, Фаза 9: SESSION REFLECTION).
    Нова nullable-колонка `reading_session.reading_experience TEXT`, простий `ALTER TABLE ADD
    COLUMN`, БЕЗ CHECK і БЕЗ `DEFAULT` (на відміну від 009 — це справді необов'язкове поле, для
    якого NULL і є коректним "не вказано", нейтральний fallback тут не потрібен). Значення
    фіксує лише TypeScript-тип `ReadingExperienceId` (`src/design/readingExperience.ts`) — 5
    фіксованих значень із самого ТЗ. Проставляється ОКРЕМОЮ мутацією
    (`ReadingSessionRepository.setReadingExperience`) вже ПІСЛЯ того, як сесію збережено
    (`finish()`), не є частиною тієї самої транзакції.
11. **011_revisit_later** — «Повернутися пізніше» (POLYTSIA V1.5, Фаза 11). Додає до `note` і
    `quote` по одній колонці `revisit_later INTEGER NOT NULL DEFAULT 0` (простий `ALTER TABLE
    ADD COLUMN` для обох — той самий прапорцевий патерн, що й `is_favorite` у 003: `DEFAULT 0`,
    а не nullable, бо це "так/ні"-прапорець, а не справді необов'язкове поле на кшталт
    `reading_experience` з 010; CHECK не потрібен, rebuild таблиці не знадобився). Індекси
    `idx_note_revisit_later`/`idx_quote_revisit_later` — той самий привід, що й
    `idx_note_favorite`/`idx_quote_favorite`: `JournalRepository` фільтрує за цим полем
    (`revisitLaterOnly`) так само, як за `is_favorite`.
- Усі зовнішні ключі з `PRAGMA foreign_keys = ON`.
- Дати зберігаються як ISO-8601 `TEXT` (UTC), не Unix timestamp — легше дебажити, легше
  експортувати в JSON/CSV без конвертацій.
- Гроші (purchasePrice) — `INTEGER` у мінімальних одиницях (копійки/центи), не `REAL`.
- Перелічувані значення (status, format, entryType, ...) — `TEXT` з CHECK-constraint, а не
  окремі lookup-таблиці: їх мало, вони не локалізуються в БД (локалізація — на рівні UI-шару
  `src/design/i18n-labels.ts`), і CHECK краще захищає від сміттєвих значень, ніж FK на
  довідник із 5 рядків.

## ER-огляд (текстом)

```
Author 1---* WorkAuthor *---1 Work 1---* Edition *---1 Publisher
Work 1---* SeriesEntry *---1 Series
Edition *---* Translator (через EditionTranslator)
Work *---* Genre (через WorkGenre); Work/Edition *---* Tag (через TaggedItem)

UserBook 1---1 Edition            (яке саме видання читає користувач)
UserBook 1---* ReadingSession
UserBook 1---* ReadingProgress    (immutable checkpoints, похідні від сесій + ручних правок)
UserBook 1---* Note
UserBook 1---* Quote
UserBook 1---0..1 Rating
UserBook 1---0..1 BookMemory        (Milestone 11 Фаза 7 — рефлексія + посилання на записи щоденника)
UserBook *---* Shelf (через ShelfBook)

OwnedBook 1---1 Edition
OwnedBook 1---* Loan

ReadingGoal, Reminder — незалежні, посилаються опціонально на Work/Series
AppSettings — singleton-таблиця (одна строка, id='local')
```

## Повна DDL-схема (Migration 001 — base schema)

```sql
PRAGMA foreign_keys = ON;

-- ============ ДОВІДКОВІ / КАТАЛОГ ============

CREATE TABLE author (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  original_name TEXT,
  bio TEXT,
  photo_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE publisher (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT,
  website TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE translator (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE genre (
  id TEXT PRIMARY KEY,
  name_uk TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE tag (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  created_at TEXT NOT NULL
);

-- Твір (абстрактний, мовонезалежний)
CREATE TABLE work (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  original_title TEXT,
  description TEXT,
  original_language TEXT,
  first_published_year INTEGER,
  cover_fallback_color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE work_author (
  work_id TEXT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES author(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'author' CHECK (role IN ('author','co_author','illustrator','editor')),
  PRIMARY KEY (work_id, author_id, role)
);

CREATE TABLE work_genre (
  work_id TEXT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
  genre_id TEXT NOT NULL REFERENCES genre(id) ON DELETE CASCADE,
  PRIMARY KEY (work_id, genre_id)
);

-- Конкретне видання твору
CREATE TABLE edition (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
  title TEXT NOT NULL,               -- може відрізнятись від Work.title (переклад заголовку)
  subtitle TEXT,
  isbn10 TEXT,
  isbn13 TEXT,
  language TEXT NOT NULL DEFAULT 'uk',
  publisher_id TEXT REFERENCES publisher(id) ON DELETE SET NULL,
  publication_date TEXT,             -- ISO date, може бути NULL якщо відомий лише рік
  publication_year INTEGER,
  page_count INTEGER,
  format TEXT NOT NULL DEFAULT 'paperback'
    CHECK (format IN ('hardcover','paperback','ebook','audiobook','other')),
  cover_url TEXT,
  description_override TEXT,
  source_id TEXT REFERENCES book_source(id) ON DELETE SET NULL,
  source_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE edition_translator (
  edition_id TEXT NOT NULL REFERENCES edition(id) ON DELETE CASCADE,
  translator_id TEXT NOT NULL REFERENCES translator(id) ON DELETE CASCADE,
  PRIMARY KEY (edition_id, translator_id)
);

-- Provenance імпортованих метаданих (п.19 специфікації)
-- ПРИМІТКА: `source_type` тут показано в актуальному вигляді ПІСЛЯ Migration 002
-- (`002_book_source_isbndb.ts`), яка додала `'isbndb'` до CHECK-обмеження — сама таблиця
-- в Migration 001 створюється ще без цього значення (наступна міграція перебудовує таблицю,
-- SQLite не підтримує ALTER CHECK напряму). Дивись коментар у файлі міграції: перебудова
-- виконується з `PRAGMA foreign_keys = OFF`, інакше DROP TABLE book_source обнулив би
-- source_id в edition/field_provenance через ON DELETE SET NULL.
CREATE TABLE book_source (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual','google_books','open_library','isbndb','isbn_scan','future_ua_catalog')),
  source_name TEXT NOT NULL,
  source_url TEXT,
  external_id TEXT,
  retrieved_at TEXT NOT NULL
);

-- Provenance на рівні окремого поля (розширювано під модерацію укр. каталогу)
CREATE TABLE field_provenance (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('work','edition')),
  entity_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  source_id TEXT REFERENCES book_source(id) ON DELETE SET NULL,
  is_user_edited INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tagged_item (
  tag_id TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('work','edition','user_book')),
  entity_id TEXT NOT NULL,
  PRIMARY KEY (tag_id, entity_type, entity_id)
);

-- ============ СЕРІЇ ============

CREATE TABLE series (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ongoing' CHECK (status IN ('ongoing','completed','hiatus','unknown')),
  total_known_works INTEGER,
  cover_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE series_entry (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  work_id TEXT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
  position REAL,                      -- REAL, бо бувають "1.5" новели
  publication_order INTEGER,
  chronological_order INTEGER,
  recommended_order INTEGER,
  entry_type TEXT NOT NULL DEFAULT 'main'
    CHECK (entry_type IN ('main','prequel','sequel','novella','spin_off','companion','anthology','other')),
  UNIQUE (series_id, work_id)
);

-- ============ БІБЛІОТЕКА КОРИСТУВАЧА ============

CREATE TABLE user_book (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES edition(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'want_to_read'
    CHECK (status IN ('want_to_read','reading','finished','paused','did_not_finish','rereading')),
  started_at TEXT,
  finished_at TEXT,
  current_page INTEGER NOT NULL DEFAULT 0,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_user_book_status ON user_book(status) WHERE deleted_at IS NULL;

CREATE TABLE shelf (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,  -- системні полиці (напр. "Улюблені") vs. користувацькі
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE shelf_book (
  shelf_id TEXT NOT NULL REFERENCES shelf(id) ON DELETE CASCADE,
  user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL,
  PRIMARY KEY (shelf_id, user_book_id)
);

-- ============ ЧИТАННЯ ============

-- Immutable historical record. НІКОЛИ не редагується автоматично — лише вручну користувачем
-- (edited_at IS NOT NULL позначає ручне редагування, для довіри в статистиці).
CREATE TABLE reading_session (
  id TEXT PRIMARY KEY,
  user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,           -- ISO timestamp
  ended_at TEXT,                      -- NULL, поки сесія триває (активна)
  goal_minutes INTEGER,               -- 15/30/45/60 або NULL ("без цілі")
  paused_intervals TEXT NOT NULL DEFAULT '[]', -- JSON [{start, end}], для точного elapsed
  start_page INTEGER NOT NULL,
  end_page INTEGER,
  duration_seconds INTEGER,           -- обчислюється при завершенні: ended-started мінус паузи
  mood_note TEXT,                     -- коротка думка після сесії
  reading_experience TEXT,            -- "Як читалося?" (Фаза 9): easy/engaging/calm/tense/difficult, без CHECK
  is_edited INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_session_user_book ON reading_session(user_book_id);
CREATE INDEX idx_session_started_at ON reading_session(started_at);

-- Похідні контрольні точки прогресу (для календаря/статистики без перерахунку сесій щоразу).
-- Одна ReadingProgress створюється при завершенні сесії І при ручному редагуванні прогресу.
CREATE TABLE reading_progress (
  id TEXT PRIMARY KEY,
  user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES reading_session(id) ON DELETE SET NULL,
  page INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'session' CHECK (source IN ('session','manual')),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_progress_user_book ON reading_progress(user_book_id, recorded_at);

-- ПРИМІТКА: показано в актуальному вигляді ПІСЛЯ Migration 003 (`003_journal_entry_extensions.ts`,
-- Milestone 11) — `type` CHECK і `is_favorite`/`reaction` з'явились там (перебудова таблиці,
-- та сама причина, що й у 002: SQLite не підтримує ALTER CHECK напряму). Migration 001
-- створює `note` ще без `'moment'`/`is_favorite`/`reaction`. `revisit_later` додано
-- Migration 011 (POLYTSIA V1.5, Фаза 11) — простим `ALTER TABLE ADD COLUMN`.
CREATE TABLE note (
  id TEXT PRIMARY KEY,
  user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES reading_session(id) ON DELETE SET NULL,
  page INTEGER,
  progress_percent REAL,
  type TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('thought','question','theory','general','moment')),
  text TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',    -- JSON string[]
  is_favorite INTEGER NOT NULL DEFAULT 0,
  reaction TEXT,                      -- вільний рядок, без CHECK — список ще узгоджується в UI
  revisit_later INTEGER NOT NULL DEFAULT 0,  -- Migration 011 — «Повернутися пізніше»
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_note_user_book ON note(user_book_id);
CREATE INDEX idx_note_type ON note(type);
CREATE INDEX idx_note_favorite ON note(is_favorite);
CREATE INDEX idx_note_created_at ON note(created_at);
CREATE INDEX idx_note_revisit_later ON note(revisit_later);

-- ПРИМІТКА: `progress_percent`/`tags`/`is_favorite`/`reaction` додані Migration 003 —
-- простим `ALTER TABLE ADD COLUMN` (тут немає CHECK на "тип", тож rebuild не знадобився,
-- на відміну від `note` вище). `revisit_later` додано Migration 011, тим самим способом.
CREATE TABLE quote (
  id TEXT PRIMARY KEY,
  user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
  edition_id TEXT NOT NULL REFERENCES edition(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES reading_session(id) ON DELETE SET NULL,
  page INTEGER,
  text TEXT NOT NULL,
  comment TEXT,
  progress_percent REAL,
  tags TEXT NOT NULL DEFAULT '[]',
  is_favorite INTEGER NOT NULL DEFAULT 0,
  reaction TEXT,
  revisit_later INTEGER NOT NULL DEFAULT 0,  -- Migration 011 — «Повернутися пізніше»
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_quote_user_book ON quote(user_book_id);
CREATE INDEX idx_quote_favorite ON quote(is_favorite);
CREATE INDEX idx_quote_created_at ON quote(created_at);
CREATE INDEX idx_quote_revisit_later ON quote(revisit_later);

CREATE TABLE rating (
  id TEXT PRIMARY KEY,
  user_book_id TEXT NOT NULL UNIQUE REFERENCES user_book(id) ON DELETE CASCADE,
  value REAL NOT NULL CHECK (value >= 0.5 AND value <= 5 AND (value * 2) = CAST(value * 2 AS INTEGER)),
  review TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- «Спогад про книгу» (`004_book_memory.ts` + `005_book_memory_template.ts`, Milestone 11
-- Фаза 7-8) — щонайбільше один на книгу, той самий UNIQUE(user_book_id)-патерн, що й у rating
-- вище. entry_refs — JSON-масив {id, kind} з ПОСИЛАННЯМИ на note/quote (не копія тексту) —
-- note/quote лишаються єдиним джерелом правди; спогад просто фільтрується проти актуального
-- списку записів при читанні. template_id — який із заготовлених шаблонів картки обрав
-- користувач (Фаза 8, `MemoryCardTemplateId`); БЕЗ CHECK — див. коментар у міграції 005.
-- Саме зображення картки (PNG для шерингу/збереження) — Фаза 9, тут його ще немає.
CREATE TABLE book_memory (
  id TEXT PRIMARY KEY,
  user_book_id TEXT NOT NULL UNIQUE REFERENCES user_book(id) ON DELETE CASCADE,
  reflection TEXT,
  entry_refs TEXT NOT NULL DEFAULT '[]',
  template_id TEXT NOT NULL DEFAULT 'classic',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ============ ФІЗИЧНА БІБЛІОТЕКА ============

CREATE TABLE owned_book (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES edition(id) ON DELETE CASCADE,
  condition TEXT CHECK (condition IN ('new','good','worn','damaged') OR condition IS NULL),
  location TEXT,
  purchase_date TEXT,
  purchase_price INTEGER,             -- мінімальні одиниці валюти
  purchase_currency TEXT DEFAULT 'UAH',
  purchase_place TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE loan (
  id TEXT PRIMARY KEY,
  owned_book_id TEXT NOT NULL REFERENCES owned_book(id) ON DELETE CASCADE,
  borrower_name TEXT NOT NULL,
  loan_date TEXT NOT NULL,
  expected_return_date TEXT,
  returned_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_loan_active ON loan(returned_at) WHERE returned_at IS NULL;

-- ============ ЦІЛІ / НАГАДУВАННЯ ============

CREATE TABLE reading_goal (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('books_per_year','pages','minutes','reading_days','finish_book','finish_series')),
  target INTEGER NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  related_work_id TEXT REFERENCES work(id) ON DELETE CASCADE,
  related_series_id TEXT REFERENCES series(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE reminder (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('daily','weekday','loan_return','custom')),
  time_of_day TEXT,                   -- 'HH:mm'
  weekdays TEXT,                      -- JSON int[] 0-6, коли kind='weekday'
  message TEXT NOT NULL,
  related_loan_id TEXT REFERENCES loan(id) ON DELETE CASCADE,
  fire_at TEXT,                       -- для custom одноразових
  is_enabled INTEGER NOT NULL DEFAULT 1,
  notification_identifier TEXT,       -- id, повернутий Expo Notifications, для скасування
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ============ ЩОДЕННИК (Milestone 11) ============

-- Чернетка незбереженого запису композера (`003_journal_entry_extensions.ts`) — один
-- активний слот на книгу (`user_book_id` як PRIMARY KEY = природний upsert). Живе в SQLite,
-- а не в пам'яті/Zustand, щоб пережити закриття застосунку/бекграунд. НЕ входить у
-- `BACKUP_TABLE_ORDER` (§Backup-формат нижче) — це лише локальний незбережений стан.
CREATE TABLE journal_draft (
  user_book_id TEXT PRIMARY KEY REFERENCES user_book(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES reading_session(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('note','quote')),
  type TEXT,
  text TEXT NOT NULL DEFAULT '',
  comment TEXT,
  page INTEGER,
  updated_at TEXT NOT NULL
);

-- ============ НАЛАШТУВАННЯ (singleton) ============

CREATE TABLE app_settings (
  id TEXT PRIMARY KEY DEFAULT 'local',
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system','light','dark')),
  week_start TEXT NOT NULL DEFAULT 'monday' CHECK (week_start IN ('monday','sunday')),
  reading_units TEXT NOT NULL DEFAULT 'pages' CHECK (reading_units IN ('pages','minutes')),
  default_goal_minutes INTEGER DEFAULT 30,
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  last_backup_at TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
```

### Чому `paused_intervals` як JSON, а не окрема таблиця

Пауз у сесії рідко буває більше кількох, вони ніколи не запитуються окремо (лише для
перерахунку `duration_seconds`), і денормалізація в один `TEXT`-стовпець уникає JOIN на
гарячому шляху таймера. Якщо це стане проблемою (наприклад, знадобиться аналітика пауз) —
винесення в окрему таблицю є backward-compatible міграцією.

### Чому `ReadingProgress` окремо від `ReadingSession`

`ReadingSession.end_page` — це те, що сталось під час сесії. `ReadingProgress` — це офіційна
контрольна точка прогресу книги в конкретний момент часу, яка також може виникнути через
**ручне редагування** (source='manual'), без сесії. Календар, графік прогресу і pace-обчислення
читають лише `reading_progress` + `reading_session`, ніколи не єдиний `user_book.current_page`
як історичне джерело — це поле лише "поточний стан" (кеш для швидкого рендеру Home).

## Індекси для продуктивності при 1000+ книг / 10000+ нотаток

- `user_book(status)` — фільтр бібліотеки за статусом (найчастіший запит).
- `reading_session(user_book_id)`, `reading_session(started_at)` — календар та статистика.
- `note(user_book_id)`, `quote(user_book_id)` — сторінка книги.
- `note(type)`, `note(is_favorite)`, `quote(is_favorite)`, `note(created_at)`,
  `quote(created_at)` (Milestone 11) — фільтр/сортування щоденника (по книзі/сесії через
  `JournalRepository.listPage`, глобально через `JournalRepository.listFeedPage`, Фаза 4) на
  боці SQLite, без сканування в JS.
- `note(revisit_later)`, `quote(revisit_later)` (POLYTSIA V1.5, Фаза 11) — той самий привід, що
  й `is_favorite` вище: `revisitLaterOnly` фільтр у тих самих `listPage`/`listFeedPage`.
- Пагінація скрізь через `LIMIT/OFFSET` з `ORDER BY <indexed column>`, для нескінченного
  скролу — keyset pagination на `updated_at, id` там, де OFFSET стає повільним (>2000 рядків).
  `JournalRepository.listPage`/`listFeedPage` уже реалізують keyset на `(created_at, id)` —
  останній ще й з приєднанням `user_book → edition → work` для обкладинки/назви книги в
  глобальному екрані "Мій щоденник" (`app/journal/index.tsx`).

## Backup-формат (докладно в `BACKUP_FORMAT.md`)

Експорт — це послідовний JSON-дамп усіх таблиць вище (крім `book_source`/`field_provenance`,
які експортуються як частина `edition`, і крім `journal_draft` (Milestone 11) — чернетка
композера є лише локальним незбереженим станом пристрою, не даними, які користувач свідомо
зберіг). `book_memory` (Фаза 7), на відміну від `journal_draft`, у бекапі є — це свідомо
збережені дані користувача, а не чернетка. Усе разом обгорнуто у:

```json
{ "schemaVersion": 1, "exportedAt": "...", "app": "polytsya", "data": { "work": [...], "edition": [...], ... } }
```

`schemaVersion` тут — це номер міграції на момент експорту, не version застосунку. Restore
відмовляється імпортувати дамп з `schemaVersion` новішим за поточний застосунок і пропонує
апдейт; дамп зі старішим `schemaVersion` проганяється через ланцюжок міграцій даних (не
плутати зі схемними міграціями SQLite) перед вставкою.
