# READING_RUN.md — REREADING MODEL, Фаза 6 (POLYTSIA V1.6.1)

Цей документ фіксує архітектурне рішення `reading_run` і дорожню карту фаз, які його
підключають — той самий підхід, що й `docs/SPOILER_SAFE.md`/`docs/DNF_IMPROVEMENT.md`/
`docs/BEFORE_AFTER.md`: зафіксувати рішення один раз, а не пояснювати заново в кожній наступній
фазі.

## Проблема (`docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 23)

Аудит V1.6 назвав це "критичним розділом": застосунок технічно **не розрізняє** перше читання
від перечитування як дві окремі події. Єдине, що існує, — `user_book.status` може приймати
значення `'rereading'` (мутабельний прапорець UI-стану, не подія й не запис історії). Наслідки,
підтверджені CODE VERIFIED (не гіпотези):

- `user_book.started_at`/`finished_at` фіксуються лише один раз і ніколи не оновлюються при
  перечитуванні — дата другого завершення не фіксується ніде.
- `reading_session` не має жодного маркера "якого це прочитання" — уся історія сесій книги
  (перше читання + будь-яка кількість перечитувань) лежить в одній плоскій, нерозділеній
  послідовності.
- Статистика й Wrapped **реально недораховують** книги: перехід `'finished'` → `'rereading'`
  прибирає книгу з `booksFinishedAllTime`/Wrapped за рік першого прочитання, хоча `finished_at`
  фізично й досі в базі (обидва запити фільтрують за поточним `status`, не за наявністю дати).
- Book Memory й Before/After (`UNIQUE(user_book_id)`) **втрачають** дані попереднього
  прочитання при повторному збереженні — другий `upsert` затирає перший безповоротно.
- Capsule свідомо НЕ пропонується для перечитування — задокументована прогалина UX
  (`src/lib/bookCapsule.ts`, `canCreateCapsule`), а не баг, саме через відсутність цієї сутності.

Мінімум 4 різних міграції/lib-файли (`012_book_capsule.ts`, `014_pre_reading_reflection.ts`,
`004_book_memory.ts`, `src/lib/bookCapsule.ts`) прямим текстом посилаються одне на одне як на
"те саме задокументоване обмеження" — очікуючи саме цю сутність.

## Рішення: `reading_run`

Одне конкретне "проходження" книги — перше читання, перечитування №2, №3... Кожен запис
`reading_session` (у майбутньому) належатиме РІВНО одному `reading_run`; `user_book.status`
лишається "поточним станом бібліотечної картки" й НЕ дублюється тут.

### Схема (`019_reading_run.ts`)

```sql
CREATE TABLE reading_run (
  id TEXT PRIMARY KEY,
  user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
  run_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','finished','did_not_finish')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  is_legacy_backfill INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (user_book_id, run_number)
);

CREATE INDEX idx_reading_run_user_book ON reading_run(user_book_id);
```

### Ключові рішення

1. **`status` свідомо НЕ дублює `UserBookStatus`** (пряма вимога ТЗ Фази 6). Лише термінальний
   результат самого прочитання: `in_progress` / `finished` / `did_not_finish`.
   `user_book.status = 'paused'` — пауза в межах того самого `in_progress` run, не нова
   сутність і не привід додавати четверте значення сюди.
2. **`run_number`** — 1, 2, 3... у межах одного `user_book_id`, монотонно зростає і ніколи не
   перевикористовується (навіть крізь `discard`), щоб бути однозначним, стабільним посиланням
   назавжди для будь-якого майбутнього FK з інших таблиць (Book Memory, Before/After, Capsule,
   DNF — Фази 8-11).
3. **Немає жорсткого DB-обмеження "лише один `in_progress` run на книгу".** Свідома
   відповідність тому самому підходу, що вже перевірено тестами
   `ReadingSessionRepository.getActiveSession` (Фаза 5): "активний" визначається запитом
   (найновіший `run_number`), а не UNIQUE-індексом на рівні схеми — стійко до накопичення
   кількох незавершених рядків, без ризику заблокувати легітимний сценарій, якого ця фаза ще
   не передбачає.
4. **`is_legacy_backfill`** — зарезервовано для Фази 6b: `true` означає, що run створено заднім
   числом із наявних `started_at`/`finished_at`/сесій/статусу, а не зафіксовано в реальний
   момент дії користувача. Ця фаза (6) стовпець лише додає — нічого ним не заповнює.
5. **`deleted_at`** — м'яке видалення, той самий сенс, що й `reading_session.deleted_at`:
   скасувати помилково розпочатий run.

### `ReadingRunRepository`

`getById`, `listByUserBookId` (найстаріший перший), `getActiveByUserBookId` (найновіший
`in_progress`, той самий "graceful" підхід, що й `getActiveSession`), `start` (обчислює
наступний `run_number`), `finish` (ідемпотентний — повторний виклик не перезаписує вже
зафіксований результат, той самий підхід, що й `ReadingSessionRepository.finish`), `discard`
(м'яке видалення).

## Backfill (Фаза 6b, `020_reading_run_backfill.ts`)

Друга частина REREADING MODEL: `reading_session.reading_run_id` (nullable — свідомо БЕЗ SQL
`REFERENCES`/`ON DELETE`, той самий вже задокументований у цьому проєкті урок, що й
`note.category_id`, `008_note_category.ts`, — FK з `ON DELETE SET NULL`, доданий через `ALTER
TABLE`, спрацював би й мовчки обнулив би значення в усіх сесіях, якби `reading_run` колись
пройшов rebuild-міграцію) і backfill: для кожного наявного `user_book` (незалежно від
`deleted_at`) — щонайбільше ОДИН legacy `reading_run` (`run_number = 1`, `is_legacy_backfill =
1`), best-effort з наявних даних.

### Коли run НЕ створюється

Якщо `started_at` не визначається (ні з `user_book.started_at`, ні з найранішої сесії книги) —
книга ніколи не була розпочата, і run не створюється взагалі. Вигадувати дату старту означало б
вигадувати історію, якої не було.

### Правило вибору `status`/`finished_at`

| Поточний `user_book.status` | `reading_run.status` | `finished_at` — у порядку пріоритету |
| --- | --- | --- |
| `reading` / `rereading` / `paused` | `in_progress` | `NULL` завжди — навіть якщо `user_book.finished_at` містить дату ПЕРШОГО завершення (заморожену, `docs/V1_6_FULL_AUDIT_REPORT.md` розділ 23, п.1), вона НЕ переноситься |
| `finished` | `finished` | `user_book.finished_at` → найпізніший `reading_session.ended_at` цієї книги → `user_book.updated_at` |
| `did_not_finish` | `did_not_finish` | `dnf_reflection.created_at` цієї книги → `user_book.updated_at` |
| `want_to_read` (лише якщо `started_at` усе ж визначився — аномалія даних) | `in_progress` | `NULL` |

### Задокументована втрата інформації

Для книги, що ЗАРАЗ перечитується (`status = 'rereading'`), backfill СВІДОМО не намагається
відновити, коли саме закінчилось перше прочитання: `user_book.finished_at` (стара, заморожена
дата) не переноситься нікуди — увесь проміжок від оригінального `started_at` до поточного
моменту стає ОДНИМ `in_progress` run. Це пряме, свідоме виконання вимоги ТЗ Фази 6b "без
вигадування кількох старих перечитувань" — дані не дозволяють надійно відновити, скільки разів
книгу реально перечитували раніше і коли саме закінчувався кожен прохід. Власник продукту, який
хоче точну історію своїх перечитувань, отримає її природно вперед: НАСТУПНЕ перечитування (з
Фази 7, коли реальний старт нового run підключиться до переходу статусу) вже буде власним
окремим, точним run.

### Чому JS-цикл, а не чистий SQL

На відміну від УСІХ 19 попередніх міграцій (чистий декларативний SQL) — свідомий виняток:
кожному новому `reading_run` потрібен РЕАЛЬНИЙ `generateId()` (`react-native-uuid`, той самий
формат, що й усі інші рядки застосунку; SQLite не має вбудованої UUID-функції, а
`lower(hex(randomblob(16)))` дав би рядки, що не виглядають як решта UUID бази), і
багаторівнева `status`/`finished_at` логіка вище читалась і перевірялась би в чистому SQL
значно гірше. Уся фаза — одна міграція в одній спільній транзакції (без `manualTransaction` —
жодного `PRAGMA foreign_keys` перемикання не потрібно): або весь backfill застосовується, або
жоден рядок.

## Фаза 7 — run-aware sessions (`UserBookRepository`/`ReadingSessionRepository`)

Третя частина REREADING MODEL: реальний (не заднім числом, як у Фазі 6b) старт/завершення
`reading_run` прив'язано до дій користувача, і нові `reading_session` більше не мають
`reading_run_id = NULL` за замовчуванням. Схема не змінюється — обидва потрібні стовпці
(`reading_run.*`, `reading_session.reading_run_id`) вже існують з Фаз 6/6b; ця фаза лише додає
виклики.

### `UserBookRepository.updateStatus` — джерело правди для старту/завершення run

Єдина точка входу для будь-якої зміни `user_book.status` (`useUpdateUserBookStatus`). "Graceful"
підхід, той самий принцип, що й усюди в цій сутності — запит активного run, а не жорсткий
UNIQUE:

| Перехід | Дія |
| --- | --- |
| → `reading`/`rereading`, активного run НЕМАЄ | `ReadingRunRepository.start` — новий прохід (перший старт або повторний після `finished`/`did_not_finish`) |
| → `reading`/`rereading`, активний run УЖЕ Є | нічого (наприклад `paused` → `reading`: пауза лишається в межах того самого проходу) |
| → `finished`/`did_not_finish`, активний run Є | `ReadingRunRepository.finish` (ідемпотентно) зі статусом, що відповідає новому `user_book.status` |
| → `finished`/`did_not_finish`, активного run НЕМАЄ | нічого — свідомо не вигадується історія (той самий принцип, що й backfill) |
| → `paused`/`want_to_read` | нічого |

Обидва записи (`UPDATE user_book` + можливий старт/завершення run) — в одній транзакції.

### `UserBookRepository.addToLibrary` — СВІДОМО не підключено

На відміну від `updateStatus`, `addToLibrary` (початковий статус при першому додаванні книги) НЕ
створює run. Причина — конкретний конфлікт з `useImportGoodreadsCsv.ts`: цей хук викликає
`addToLibrary`, а одразу ПІСЛЯ нього — `applyImportedDates`, який перезаписує щойно виставлений
`started_at` реальною історичною датою з CSV. Якби `addToLibrary` створював run тут же (із
`startedAt = now`, бо "зараз" — єдина дата, яку функція взагалі знає в момент виклику), той run
лишився б із хибною датою старту (сьогодні замість реальної дати імпорту). Це не прогалина в цілі
Фази 7 ("нові reading sessions завжди належать run"): `addToLibrary` сесій не створює, а
`ReadingSessionRepository.start` (нижче) сама створить run із коректною на той момент датою, якщо
його ще немає — перший реальний старт сесії або перший подальший `updateStatus`.

### `ReadingSessionRepository.start` — гарантія "сесія завжди має run"

Основний шлях (run уже активний завдяки `updateStatus` вище) покриває більшість випадків, але
старт сесії й зміна статусу — свідомо незалежні дії в цьому застосунку:
`ReadingControls`/`SessionLaunchScreen` ніколи не викликають `updateStatus`, тож книгу можна
почати читати, лишаючи `user_book.status = 'want_to_read'`. Без запасного варіанту сесія могла б
лишитись без run у цілком легітимному сценарії. Тому `start()` сама шукає активний run
(`getActiveByUserBookId`) і, якщо його немає, створює новий — в одній транзакції з самою сесією.
Цей фолбек НЕ чіпає `user_book.status`: обсяг цієї фази — гарантія для `reading_session`, а не
UX перемикання статусу.

## Фаза 8 — Book Memory (`021_book_memory_run.ts`, `BookMemoryRepository`)

Четверта частина REREADING MODEL, перша, що торкається НЕ `reading_run`/`reading_session`, а
залежну сутність. Проблема (`docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 23, п.5, CODE VERIFIED):
`book_memory` мала `UNIQUE(user_book_id)` — щонайбільше один спогад на книгу; другий `upsert`
(після перечитування) безповоротно перезаписував перший.

### Схема — rebuild, `UNIQUE(user_book_id)` → `UNIQUE(reading_run_id)`

SQLite не підтримує `ALTER TABLE` для зміни/видалення UNIQUE-обмеження — той самий
`_new`+`INSERT...SELECT`+`DROP`+`RENAME` ідіом, що й `002_book_source_isbndb.ts`/`003`/`007`
(`manualTransaction = true`, `PRAGMA foreign_keys` OFF перед транзакцією, rebuild у ручній
транзакції, `PRAGMA foreign_key_check` одразу після, `foreign_keys` ON у `finally`).
`reading_run_id` — нова колонка, nullable, СВІДОМО БЕЗ `REFERENCES reading_run(id)` (той самий,
уже задокументований у цьому проєкті урок — `008_note_category.ts`/`020_reading_run_backfill.ts`).
`user_book_id` лишається (більше не `UNIQUE`) — досі корисний для "чи має ця книга взагалі
якийсь спогад" без join через run.

### Backfill наявних рядків

JS-цикл (другий виняток із чистого декларативного SQL у цьому проєкті, після `020`): для кожного
наявного `book_memory` (до rebuild — щонайбільше ОДИН на книгу, тож жодного ризику конфлікту з
новим `UNIQUE(reading_run_id)`) — найновіший `finished`/`did_not_finish` run цієї книги; якщо
такого немає — найновіший run узагалі (навіть `in_progress`); якщо книга взагалі не має жодного
run — `reading_run_id` лишається `NULL` (той самий принцип "не вигадувати історію", що й у
Фазі 6b).

### `BookMemoryRepository.getCurrent`/`upsertCurrent` — новий публічний API, стара форма виклику

`ReadingRunRepository.getLatestByUserBookId` (нова, Фаза 8) — найновіший run книги НЕЗАЛЕЖНО
від статусу (не лише `in_progress`, на відміну від `getActiveByUserBookId`): спогад пишеться вже
ПІСЛЯ того, як `updateStatus` (Фаза 7) завершив run переходом у `finished`/`did_not_finish`, тож
на момент запису run уже не "активний". `getCurrent`/`upsertCurrent` самі визначають цей
"поточний" run і працюють із прив'язаним до нього спогадом; книга без жодного run (Фаза 7
`addToLibrary`, свідомо не підключена) і далі отримує "книжковий" спогад без прив'язки
(`reading_run_id IS NULL`) — той самий фолбек, що діяв для ВСІХ спогадів до цієї фази.

Виклики з UI (`useBookMemory.ts` → `app/completion/[workId].tsx`, `app/memory/[workId].tsx`)
лишаються НЕЗМІННИМИ за формою — той самий `userBookId`, жодного нового параметра. Перечитування
книги тепер природно починає НОВИЙ, порожній спогад для нового run замість затирання старого;
спогад(и) попередніх run НЕ видаляються, лишаються в базі (`listByUserBookId`/`getByReadingRunId`
вже готові для майбутньої історії спогадів), просто ще не мають власного екрана перегляду —
свідомо поза межами цієї фази, той самий UI, що й Фаза 12 нижче.

## Фаза 9 — Before/After (`022_pre_reading_reflection_run.ts`, `PreReadingReflectionRepository`)

П'ята частина REREADING MODEL, дзеркалить Фазу 8 майже один-в-один — та сама проблема, те саме
рішення, інша таблиця. Проблема (`docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 23, п.6, CODE
VERIFIED): `pre_reading_reflection` мала `UNIQUE(user_book_id)` — щонайбільше одна нотатка "До"
на книгу; перечитування не мало власної нотатки "До", а форма її запису була взагалі недоступна
повторно (`canEditPreReadingReflection` дозволяла лише `status === 'reading'`).

### Схема — rebuild, `UNIQUE(user_book_id)` → `UNIQUE(reading_run_id)`

Той самий rebuild-ідіом, що й Фаза 8. `reading_run_id` — нова колонка, nullable, СВІДОМО БЕЗ
`REFERENCES reading_run(id)` (той самий задокументований урок). `user_book_id` лишається
(більше не `UNIQUE`).

### Backfill наявних рядків

JS-цикл, ТОЙ САМИЙ пріоритет, що й у Фазі 8 (не "найстаріший run", як можна було б очікувати від
нотатки, що пишеться рано): для кожної наявної нотатки — найновіший `finished`/`did_not_finish`
run цієї книги; якщо такого немає — найновіший run узагалі; якщо книга взагалі не має жодного
run — `reading_run_id` лишається `NULL`. Причина того самого пріоритету, що й для Book Memory —
дивись нижче, чому `getCurrent` читає саме через `getLatestByUserBookId`, а не
`getActiveByUserBookId`: backfill мусить лінкувати нотатку на run, який ця функція справді
знайде, інакше вона "зникне" з порівняння До/Після.

### `PreReadingReflectionRepository.getCurrent`/`upsertCurrent` — `getLatestByUserBookId`, НЕ `getActiveByUserBookId`

Важливе уточнення, що відрізняється від початкового припущення: хоча нотатка "До" пишеться РАНО
(поки книга ще читається, run `in_progress`), резолвиться вона через
`ReadingRunRepository.getLatestByUserBookId` — той самий вибір, що й `BookMemoryRepository`
(Фаза 8), а НЕ `getActiveByUserBookId` (лише `in_progress`). Причина: `getCurrent` читає і Book
Details (`app/work/[workId].tsx`, ПІД ЧАС читання — там найновіший run і є активний, той самий
run) і екран порівняння До/Після на Book Memory (`app/memory/[workId].tsx`, ПІСЛЯ завершення
читання — там run уже `finished`, і `getActiveByUserBookId` повернув би `null`, а разом з ним і
"До" зникло б із порівняння). `getLatestByUserBookId` коректний в обох випадках.

Виклики з UI (`usePreReadingReflection.ts`) лишаються НЕЗМІННИМИ за формою — той самий
`userBookId`. Перечитування книги тепер природно починає НОВУ, порожню нотатку "До" для нового
run замість затирання старої; нотатка(и) попередніх run НЕ видаляються (`listByUserBookId`/
`getByReadingRunId`), просто ще не мають власного екрана перегляду — той самий "поза межами
фази" UI, що й Фаза 8/12.

### `canEditPreReadingReflection` — розширено на `'rereading'`

Єдина зміна поведінки UI цієї фази (`src/lib/beforeAfter.ts`): ДО Фази 9 форма була доступна
лише за `status === 'reading'` — дозволити її й при `'rereading'` до цієї фази означало б
затерти нотатку "До" першого прочитання (стара `UNIQUE(user_book_id)`). Тепер, коли кожен run
має власну нотатку (`UNIQUE(reading_run_id)`), блокувати `'rereading'` більше немає підстави —
саме це й закриває задокументоване обмеження "перечитування мають окремі До/Після"
(`docs/BEFORE_AFTER.md` §"Відоме обмеження").

## Фаза 10 — Capsule/Recall (`023_book_capsule_run.ts`, `BookCapsuleRepository`)

Шоста частина REREADING MODEL. Проблема (`docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 23, пп.7-8,
CODE VERIFIED): `book_capsule` навмисно БЕЗ `UNIQUE(user_book_id)` (`012_book_capsule.ts`) —
саме тому, що не було способу прив'язати капсулу до конкретного прочитання; "поточна" капсула
визначалась лише найновішою за `created_at`. Наслідок: після перечитування й повторного
завершення книги UI (`BookCapsuleSection`) бачив, що капсула ВЖЕ Є (стара, з першого
прочитання), і НІКОЛИ не пропонував залишити нову для щойно завершеного повторного прочитання.
`capsule_recall` (п.8) успадковує ту саму неоднозначність транзитивно — через `book_capsule_id`.

### Схема — ПРОСТА `ADD COLUMN`, не rebuild

На відміну від Фаз 8/9 (де UNIQUE-обмеження МІНЯЛОСЬ з "на книгу" на "на run", що вимагало
`_new`+`DROP`+`RENAME`), `book_capsule` ніколи не мала `UNIQUE(user_book_id)` — множинність
капсул на книгу вже була дозволена. Міграція лише додає nullable `reading_run_id TEXT` — БЕЗ
`UNIQUE` (кілька капсул на один run технічно можливі, той самий "не забороняй того, що вже було
дозволено" принцип) і БЕЗ SQL `REFERENCES reading_run(id)` (той самий задокументований урок).
Жодне існуюче обмеження не знімається — не потрібен ані rebuild-ідіом, ані `manualTransaction`.

### Капсула фіксує run РАЗ І НАЗАВЖДИ — НЕ "найновіший = поточний" (відмінність від Фаз 8/9)

Ключова архітектурна відмінність цієї фази: `BookMemoryRepository`/`PreReadingReflectionRepository`
— `upsert`-репозиторії, де `getCurrent` РЕЗОЛЬВИТЬ run наново при КОЖНОМУ читанні через
`getLatestByUserBookId`, бо той самий рядок редагується повторно. `BookCapsuleRepository` — НЕ
upsert: `create` викликається РІВНО ОДИН РАЗ на капсулу, і САМЕ ТОДІ (і тільки тоді)
`reading_run_id` резолвиться через `ReadingRunRepository.getLatestByUserBookId` і записується
назавжди — капсула є знімком ОДНОГО моменту завершення, а не "живим", постійно синхронізованим
записом. Звідси й ДВА окремі способи читання, свідомо не об'єднані в один:

- `getByUserBookId` (незмінний з Фази 4) — найновіша капсула КНИГИ ЗАГАЛОМ, незалежно від run —
  те, що `app/capsule/[workId].tsx`/`app/recall/[workId].tsx` показують "у будь-який момент";
- `getCurrent` (нова, Фаза 10) — капсула САМЕ поточного (найновішого) run; `null`, якщо для
  поточного run капсули ще нема, НАВІТЬ якщо старіші капсули існують.

### Backfill наявних рядків — за НАЙБЛИЖЧИМ у часі, не "найновіший finished"

На відміну від Фаз 8/9 (де книга технічно мала щонайбільше ОДИН legacy-рядок), `book_capsule`
могла накопичити КІЛЬКА рядків на книгу вже ДО цієї міграції. "Найновіший finished run для всіх
капсул книги" зламав би множинність — кілька різних капсул отримали б ОДИН і той самий run.
Натомість для КОЖНОЇ капсули окремо: найновіший `finished`/`did_not_finish` run, чий
`finished_at` НЕ ПІЗНІШЕ за `created_at` цієї конкретної капсули (капсула завжди створюється
ПІСЛЯ моменту завершення — `canCreateCapsule` вимагає `status === 'finished'` вже на момент
створення). Якщо жодного такого run немає — `reading_run_id` лишається `NULL`, той самий
принцип "не вигадувати історію", що й у Фазах 6b/8/9.

### UI — `BookCapsuleSection` (`app/completion/[workId].tsx`/`app/memory/[workId].tsx`)

Обидва звіряють `capsule` (`useBookCapsule`, найновіша ЗАГАЛОМ — незмінно) з `currentCapsule`
(новий `useCurrentBookCapsule`): коли вони розходяться (стара капсула існує, а поточний run
своєї ще не має) і `canCreateCapsule(status)` — з'являється ДОДАТКОВЕ запрошення "Залишити
капсулу для цього прочитання", яке НЕ ховає стару (кнопки "Згадати книгу"/"Переглянути деталі"
для неї лишаються на місці). Це навмисно АДИТИВНА зміна — жодна раніше доступна дія не зникає,
лише додається нова, коли вона доречна.

Create/Edit screen (`app/capsule/[workId]/edit.tsx`) відповідно приймає необов'язковий параметр
маршруту `newRun` — БЕЗ нього (як і раніше, з `app/capsule/[workId].tsx`'s "Редагувати") форма
працює з `useBookCapsule` (та сама капсула, що й переглядали); З `newRun=1` (нова кнопка вище) —
з `useCurrentBookCapsule`, тож відкривається саме режим СТВОРЕННЯ нової капсули для поточного
run, а не редагування старої.

`canCreateCapsule` (`src/lib/bookCapsule.ts`) — БЕЗ зміни коду: `status === 'finished'` і так
ніколи не "блокувала" `rereading" саму по собі (капсулу й раніше не можна було створити ПІД ЧАС
активного перечитування — це лишається коректним і зараз, run має спершу завершитись). Справжнім
"блокером" було саме поєднання `!capsule && !canCreateCapsule(status)` у `BookCapsuleSection` —
воно й виправлене вище.

### Recall (`capsule_recall`) — БЕЗ змін схеми

`capsule_recall.book_capsule_id` лишається як є — Recall належить Capsule, Capsule належить
`reading_run`, тож Recall отримує зв'язок із run ТРАНЗИТИВНО через свою капсулу, без потреби у
власній колонці. `app/recall/[workId].tsx` і далі working з `useBookCapsule` (та сама капсула,
що й показує `BookCapsuleSection`'s "Згадати книгу") — узгоджено з тим, що Recall, як і перегляд
капсули, навмисно доступний "у будь-який момент", не лише для поточного run.

## Фаза 11 — DNF (`024_dnf_reflection_run.ts`, `DnfReflectionRepository`)

**Проблема** (задача: "Run #1 abandoned і Run #2 started пізніше — дві різні історії, старий
DNF snapshot не перезаписується"): `dnf_reflection` мала `UNIQUE(user_book_id)`
(`017_dnf_reflection.ts`) — щонайбільше ОДИН знімок "Не дочитав" на книгу.
`DnfReflectionRepository.captureIfMissing` (викликається з `useUpdateUserBookStatus`,
`src/features/library/useUpdateUserBook.ts`, одразу ПІСЛЯ того, як `UserBookRepository.
updateStatus` уже завершив run через `ReadingRunRepository.finish`) перевіряв наявність рядка
ПО КНИЗІ й нічого не робив, якщо він уже був — тож книга, яку покинули, потім знову почали
читати й покинули ВДРУГЕ, НЕ отримувала другого знімка: перше покинуте прочитання назавжди
"маскувало" друге.

### Schema (`024_dnf_reflection_run.ts`) — rebuild, не ADD COLUMN

На відміну від `023_book_capsule_run.ts` (проста `ALTER TABLE ADD COLUMN`, бо `book_capsule`
НІКОЛИ не мала `UNIQUE(user_book_id)`), `dnf_reflection` цю UNIQUE МАЛА — SQLite не підтримує
`ALTER TABLE` для зміни/видалення UNIQUE, тож знадобився той самий rebuild-ідіом, що й у
`021`/`022` (`_new` + `INSERT ... SELECT` + `DROP` + `RENAME`, `manualTransaction = true`,
`PRAGMA foreign_keys` OFF/ON навколо, `foreign_key_check` одразу після): обмеження міняється з
`UNIQUE(user_book_id)` на `UNIQUE(reading_run_id)`. `reading_run_id` — nullable, СВІДОМО без
SQL `REFERENCES` (той самий урок, що й у `020`-`023`).

### Backfill — інша логіка, ніж `021`/`022`, з двох причин

1. **`dnf_reflection` може належати ЛИШЕ `did_not_finish`-run'у.** На відміну від `021`/`022`
   (пріоритет "найновіший `finished` АБО `did_not_finish`, інакше найновіший run узагалі"), тут
   НЕМАЄ фолбеку на "найновіший run узагалі" — прив'язка знімка DNF до `finished`- чи
   `in_progress`-run'у була б архітектурно хибною. Якщо жодного `did_not_finish`-run немає —
   `reading_run_id` лишається `NULL` (той самий принцип "не вигадувати історію").
2. **Найближчий ЗА ЧАСОМ, не "найновіший".** Той самий прийом, що й у `023` (капсула): до Фази
   11 `captureIfMissing` спрацьовував ЩОНАЙБІЛЬШЕ ОДИН РАЗ на все життя книги, тож легасі-рядок
   міг зафіксувати ПЕРШИЙ епізод "Не дочитав" книги, навіть якщо найновіший
   `did_not_finish`-run — зовсім інший, пізніший. Тому backfill шукає `did_not_finish`-run із
   `finished_at <= created_at` рядка, найновіший серед таких (нижня межа за часом) — а не
   просто "найновіший `did_not_finish`-run книги". Фолбек, якщо такого нема: найновіший
   `did_not_finish`-run книги (краще прив'язати до правильного за ТИПОМ run'у з неідеальним
   часом, ніж лишити без прив'язки книгу, що точно мала бодай один такий run).

### `DnfReflectionRepository` — динамічна ре-резолюція, НЕ фіксація-при-створенні

На відміну від капсули (Фаза 10 — `reading_run_id` фіксується ОДИН РАЗ назавжди в `create()`),
DNF-знімок ближчий за духом до Book Memory/Before-After (Фази 8-9): `getCurrent`/
`captureIfMissing`/`updateDetails` САМІ резолвлять "поточний" run книги через
`ReadingRunRepository.getLatestByUserBookId` ЩОРАЗУ. Це коректно, бо `captureIfMissing`
викликається ОДРАЗУ ПІСЛЯ того, як той самий `updateStatus` уже завершив run — "найновіший run
книги" на цю мить і є той самий, щойно завершений `did_not_finish`-run; жодної потреби у
"фіксації один раз назавжди" немає, бо тут нема сценарію на кшталт капсули, де користувач може
СТВОРИТИ запис пізніше, коли поточний run уже змінився. `getByReadingRunId`/`listByUserBookId`
— поруч, той самий "заготовка для майбутньої історії" (Фаза 12) підхід, що й у Фазах 8-9.

### UI — БЕЗ змін, на відміну від Фази 10

`DnfReflectionSection` (`app/work/[workId].tsx`), `useDnfReflection`/`useSaveDnfReflectionDetails`
не отримали жодного нового блоку чи параметра — лише `useDnfReflection` перейшов з
`getByUserBookId` на `getCurrent`. На відміну від капсули (де старий запис МАСКУВАВ пропозицію
нового, тож знадобився адитивний UI-блок), тут немає "маскування": `getCurrent` сама завжди
повертає знімок АКТУАЛЬНОГО run, тож коли перечитану книгу покидають вдруге, секція автоматично
починає показувати новий знімок замість старого — стара `page`/`reason`/`note` не втрачені
(лишаються в БД, доступні через `getByReadingRunId`/`listByUserBookId`), просто більше не
показані як "поточні". `canEditDnfReflection` не змінювалась — вона й так залежить лише від
`status`, а не від того, який саме запис зараз показаний.

## Фаза 12 — Rereading UX + порівняння прочитань

Остання фаза REREADING MODEL (POLYTSIA V1.6.1): три частини — (1) `rating` приєднується до
`reading_run` (архітектурна прогалина, виявлена лише зараз — див. нижче), (2) явний CTA
"Перечитати" на Book Details, (3) два нові UI-екрани, що зводять докупи все, що зробили Фази
6-11: "Історія прочитань" (accordion на Book Details) і "Як змінилася книга для тебе"
(порівняння ≥2 завершених прочитань).

### `rating` — прогалина, якої не було в жодній попередній фазі

`rating` мала `UNIQUE(user_book_id)` (щонайбільше ОДНА оцінка на книгу) від самого початку
(Milestone 1) і НЕ була навіть згадана в жодній із Фаз 6-11 чи в `docs/V1_6_FULL_AUDIT_REPORT.md`
— прогалину виявлено лише при проєктуванні порівняння прочитань (ТЗ прямо вимагає оцінку як
одну з осей порівняння: без прив'язки до run порівнювати НІЧЕГО, оцінка завжди лише
найновіша). `025_rating_run.ts` — той самий rebuild-ідіом, що й `021`/`022`/`024`:
`UNIQUE(user_book_id)` → `UNIQUE(reading_run_id)`. Backfill дзеркалить `021`/`022` (НЕ `024`):
найновіший `finished`/`did_not_finish` run, інакше найновіший run узагалі, інакше `NULL` —
рейтинг, на відміну від DNF-знімка, цілком може стосуватись і `finished`, і `did_not_finish`
run (книгу можна оцінити навіть не дочитавши).

`RatingRepository.getCurrent`/`upsertCurrent` (перейменовані з `getByUserBookId`/`upsert`) —
той самий "динамічна ре-резолюція щоразу" підхід, що й `BookMemoryRepository`/
`PreReadingReflectionRepository`/`DnfReflectionRepository` (Фази 8-9, 11): єдиний реальний
споживач — `useRating.ts` (Book Details `RatingSection`). Батч-метод `listByUserBookIds`
(Wrapped/Сезони/Профіль читача/"Цього дня" — 4 зовнішні споживачі, що покладаються на "рівно
один рядок на книгу" для агрегатної статистики) НАВМИСНО НЕ перейменований — лишається під тією
самою назвою, лише SQL/логіка оновлені підбирати НАЙНОВІШИЙ рядок на книгу (той самий принцип,
що й `BookCapsuleRepository.getByUserBookId`, Фаза 10) замість покладатись на стару гарантію
"щонайбільше один".

### CTA "Перечитати" на Book Details

Раніше єдиний спосіб почати нове прочитання завершеної книги — загальний чип зміни статусу
(`STATUS_OPTIONS`), який і так уже запускає `useUpdateUserBookStatus` → `ReadingRunRepository.start`
(підключено в Фазі 7). Фаза 12 додає ЯВНУ, пояснювальну кнопку "Перечитати" в `LibrarySection`
(`app/work/[workId].tsx`), видиму лише для `status === 'finished'`, яка викликає ТОЙ САМИЙ
`handleStatusChange('rereading')` — жодного нового шляху мутації, лише додатковий, зрозуміліший
вхід до вже наявної механіки (той самий "additive UI" принцип, що й Фаза 10).

### "Історія прочитань" — accordion на Book Details

`ReadingRunsHistorySection` (`app/work/[workId].tsx`) — НОВИЙ розділ, ОКРЕМИЙ від наявної
"Історія читання" (`ReadingHistorySection`, плаский список СЕСІЙ): групує за `reading_run` —
один рядок на прочитання (статус, дати, оцінка ЦЬОГО прочитання, дні/час читання). Дані —
`useReadingRunsDetail` (`src/features/reading-runs/`) — ОДИН хук на ОБИДВА нові UI-екрани Фази
12 (той самий "один запит, спільний кеш" принцип, що й підйом `useReadingHistory` у Фазі 2):
для кожного `reading_run` книги паралельно (`Promise.all`) підтягує оцінку/спогад/нотатку
"До"/капсулу/DNF-знімок за `getByReadingRunId` кожного відповідного репозиторію, плюс
статистику сесій цього run (`computeRunReadingStats`, `src/lib/rereadComparison.ts` — чиста
функція: сума тривалості, кількість унікальних днів, домінантний `readingExperience`).

### "Як змінилася книга для тебе" — порівняння прочитань

`app/reread-comparison/[workId].tsx` — новий екран, доступний кнопкою в "Історії прочитань"
лише коли є ≥2 run зі `status === 'finished'` (`selectComparableRuns`,
`useReadingRunsDetail.ts` — капсулу, як і решту рефлексій, свідомо не порівнюємо для
`did_not_finish`/`in_progress`: `canCreateCapsule` і так дозволяє капсулу лише для `finished`).
Показує кожне завершене прочитання окремою карткою (оцінка, відгук, очікувана оцінка "До" vs
факт, спогад, капсула, дні/час читання, домінантний reading experience) у хронологічному
порядку, з карткою "Δ" між сусідніми прочитаннями (`computeNumericDelta`,
`src/lib/rereadComparison.ts` — `null`, якщо нема з чим порівнювати, а не вигадане число).
ВИКЛЮЧНО дані, які користувач уже сам зберіг раніше — жодної AI-генерації (пряма вимога ТЗ
Фази 12).

## Усі фази REREADING MODEL завершено

Фази 6-12 (POLYTSIA V1.6.1) підключили `reading_run` до всього ланцюга: сесії читання (Фаза
6-7), Book Memory (8), Before/After (9), Book Capsule (10), DNF-знімок (11), Rating + UI
історії/порівняння (12). Нових запланованих фаз REREADING MODEL немає.

## Фаза 13 — "Історія прочитань" стає спільним компонентом (Book Memory ungating)

Фаза 13 — НЕ нова фаза REREADING MODEL (модель і так завершена Фазою 12 вище), а окрема фаза
ТЗ V1.6.1 ("Book Memory ungating + consolidation"), яка робить `ReadingRunsHistorySection`
(до цього — приватна функція лише всередині `app/work/[workId].tsx`, Фаза 12) спільним
компонентом (`src/components/reading-runs/ReadingRunsHistorySection.tsx`) з ДРУГИМ
UI-споживачем — Book Memory (`app/memory/[workId].tsx`, розділ "Історія прочитань" у новій IA
хаба). Дані й кеш лишаються ТИМИ САМИМИ: обидва екрани викликають той самий
`useReadingRunsDetail(userBookId)` (`src/features/reading-runs/useReadingRunsDetail.ts`,
незмінений з Фази 12) — React Query дедуплікує однаковий ключ (`readingRuns.detailByUserBook`),
тож відкриття обох екранів для однієї книги не подвоює запит до БД. Компонент і його поведінка
(групування за run, кнопка "Порівняти прочитання" лише при ≥2 завершених) не змінились —
змінилось лише місце, де він живе, і хто його імпортує.

Ширший контекст Фази 13 (ungating усього екрана Book Memory, нова секція "Пригадування",
консолідація "Капсула = тип рефлексії, Recall = дія над капсулою") — поза межами цього файлу,
який документує лише REREADING MODEL; див. коментарі безпосередньо в
`app/memory/[workId].tsx` і `CHANGELOG.md`.
