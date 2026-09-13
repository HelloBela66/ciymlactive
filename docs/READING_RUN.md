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

## Свідомо ПОЗА межами Фази 9

Підключення інших сутностей до `reading_run` (Capsule, DNF, порівняння прочитань) лишається
окремими наступними фазами:

| Фаза | Що підключається |
| --- | --- |
| 10 | Capsule/Recall — `canCreateCapsule` більше не блокує `rereading`, кожен run може мати власну капсулу |
| 11 | DNF — `dnf_reflection` прив'язується до конкретного run, що не дочитали |
| 12 | Rereading UX + порівняння прочитань — агрегований показ "як читалося цього разу vs минулого разу", використовуючи `run_number`; тут з'явиться екран історії спогадів/нотаток "До" по всіх run книги |
