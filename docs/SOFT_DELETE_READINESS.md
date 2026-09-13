# SOFT_DELETE_READINESS.md — soft-delete readiness + Data Doctor extension (Фаза 26)

POLYTSIA V1.6.1, Фаза 26. Той самий "фіксує рішення, яке інакше довелось би пояснювати заново"
документ, що й `docs/PERFORMANCE_AUDIT.md`/`docs/EDGE_FUNCTION_CI.md`.

## Завдання (буквально)

"Soft-delete для user-authored personal entities що синхронізуватимуться (BookCapsule/
BookMemory/Rating/Shelf/ReadingGoal/Reminder за потребою). ReadingRun обов'язково
UUID+createdAt+updatedAt+deletedAt. Data Doctor: session without run, multiple active runs,
finished run without finishedAt, invalid sequence, capsule/memory/reflection without valid run,
legacy contradictory status, run/session mismatch — без destructive auto-fix."

Три незалежні частини.

## 1. Soft-delete для BookCapsule/BookMemory/Rating

### Звідки ця прогалина

`docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 54 (готовність до V2/auth/sync), CODE VERIFIED знахідка:
схема БД уже має явний, свідомий soft-delete + timestamp-дизайн на `user_book`/`edition`/`work`/
`note`/`quote`/`note_category`/`lore_entity`/`reading_session`/`reading_run` — але БЕЗ
`book_capsule`/`book_memory`/`rating`, трьох таблиць, що зберігають так само незамінний,
написаний користувачем текст (лишаючу думку, речення-спогад, вільний текст про персонажа,
рефлексію, рецензію в оцінці), які `BookCapsuleRepository.remove`/`BookMemoryRepository.remove`/
`RatingRepository.remove` до цієї фази стирали фізично (`DELETE FROM ...`) без жодної можливості
відновлення. Розділ 90 і пункт 10 списку рекомендацій прямо називають це прогалиною, яку варто
закрити "перед тим, як ускладнювати модель синхронізацією" — точно те, що робить ця фаза.

### Чому саме ці три, а не всі шість названих у ТЗ

ТЗ явно каже "за потребою" — не "усі шість без винятку". Рішення для кожної із решти трьох:

- **Shelf** — `ShelfRepository.remove` лишається жорстким. У самому репозиторії вже є явний,
  добре обґрунтований коментар (написаний задовго до цієї фази): "полиця сама по собі не несе
  історичних даних, які варто було б зберігати після видалення". Полиця — контейнер/ярлик, не
  контент: видалення полиці не втрачає жодного написаного користувачем тексту (самі книги на
  полиці лишаються в бібліотеці незалежно).
- **ReadingGoal** — `ReadingGoalRepository.remove` лишається жорстким. Той самий клас рішення,
  теж уже задокументований у репозиторії: ціль читання — структуроване число (тип+таргет+період),
  без вільного тексту; "закрити ціль без виконання" — окремий статус `abandoned`
  (`updateStatus`), не видалення. Видалення тут завжди означає "ця ціль була помилкою", не
  "приховати без втрати даних".
- **Reminder** — `ReminderRepository.remove` лишається жорстким. На відміну від п'яти інших,
  нагадування прив'язане до `notification_identifier` — конкретного, локального,
  пристрій-специфічного OS-розкладу (`expo-notifications`), не до синхронізовного контенту:
  soft-delete тут не захищав би жодних даних, які мають сенс поза цим самим пристроєм.

Спільний принцип: soft-delete у цій фазі отримують сутності з написаним користувачем ВІЛЬНИМ
ТЕКСТОМ, який синхронізація (коли з'явиться) мала б передавати між пристроями і який неможливо
відновити, якщо стерти фізично. Структурні/конфігураційні сутності (полиця-ярлик, ціль-число,
локальний розклад сповіщень) — ні.

### Механіка (`027_soft_delete_readiness.ts`)

Просте `ALTER TABLE ... ADD COLUMN deleted_at TEXT` на всіх трьох таблицях — без `rebuild`, на
відміну від `021`/`022`/`023`/`024`/`025` (ті мали справу з UNIQUE-обмеженнями, яких SQLite не
дає змінити без rebuild; тут лише додається nullable-колонка, яку SQLite підтримує напряму).
Жодного backfill: для всіх наявних рядків нове значення `NULL` (== "не видалено"), той самий
сенс, що вже встановлений для кожної іншої `deleted_at`-колонки в цій схемі.

`remove()` кожного з трьох репозиторіїв тепер `UPDATE ... SET deleted_at = ?` замість `DELETE`.
Усі read-методи (`getById`/`getCurrent`/`listByUserBookId`/`listAll`/`getDue`/
`listWithFutureReminder` тощо) фільтрують `deleted_at IS NULL` — видалений запис зникає з
кожного звичного шляху читання так само, як і до цієї фази, різниця лише в тому, що дані
фізично лишаються в базі.

### `UNIQUE(reading_run_id)` і "revive on upsert" (BookMemory/Rating)

`book_memory`/`rating` мають `UNIQUE(reading_run_id)` (Фази 8/12, `021_book_memory_run.ts`/
`025_rating_run.ts`) — це обмеження діє НЕЗАЛЕЖНО від `deleted_at`. Наївний soft-delete (просто
додати `deleted_at IS NULL` до `getForBookAndRun`, яку `upsertCurrent` використовує для
визначення "чи вже є рядок для цього run") зламав би повторний запис: після `remove()` наступний
`upsertCurrent()` для ТОГО САМОГО run намагався б `INSERT` у слот `reading_run_id`, уже зайнятий
м'яко видаленим рядком, — порушення UNIQUE.

Рішення: внутрішній `getForBookAndRun` лишається НЕВІДФІЛЬТРОВАНИМ (бачить і м'яко видалені
рядки), і `upsertCurrent` завжди робить `UPDATE ... SET ..., deleted_at = NULL` для знайденого
рядка — і коли він живий (звичайний upsert, `deleted_at = NULL` — безпечний no-op), і коли він
був м'яко видалений (тоді той самий UPDATE його ВІДРОДЖУЄ з новим контентом). Публічні
read-методи (`getCurrent`, `getByReadingRunId`, `listByUserBookId`) фільтрують `deletedAt`
самі, окремо від цього внутрішнього пошуку — видалений спогад/оцінка виглядає для UI як "ще
немає", доки користувач не напише новий, і саме цей запис новий контент і відроджує. Тестами
підтверджено (`BookMemoryRepository.test.ts`/`RatingRepository.test.ts`, розділ "SOFT-DELETE
READINESS"): `upsertCurrent` після `remove()` для того самого run не падає й не дублює рядок.

`BookCapsuleRepository` цієї проблеми не має — капсула НЕ `upsert`-иться (`user_book_id` без
UNIQUE, `012_book_capsule.ts`), `create` завжди створює новий рядок незалежно від того, чи є вже
капсула для цього run.

### Побічний ефект: `capsule_recall` ON DELETE CASCADE більше не спрацьовує

`capsule_recall.book_capsule_id REFERENCES book_capsule(id) ON DELETE CASCADE`
(`013_capsule_recall.ts`) досі фізично видаляв усю recall-історію капсули разом із самою
капсулою. Тепер, коли `BookCapsuleRepository.remove` більше не робить фізичний `DELETE`, рядок
`book_capsule` лишається — CASCADE НЕ спрацьовує, і recall-історія (теж написаний користувачем
текст — "що ти пам'ятаєш зараз") зберігається фізично разом з капсулою, а не знищується
безповоротно.

Це — навмисний, бажаний наслідок (точно той принцип, заради якого й існує ця фаза), не
недогляд: `CapsuleRecallRepository.test.ts` оновлено (тест раніше називався "видалення капсули
каскадно видаляє її recall-історію" — тепер називається й перевіряє протилежне: історія
зберігається). Той самий клас ефекту вже задокументований для
`book_capsule.user_book_id ON DELETE CASCADE` проти м'яко видаленого `user_book` (коментар у
`012_book_capsule.ts`) — CASCADE проти soft-deleted батька в цій схемі й раніше ніколи не
спрацьовував по-справжньому; тепер той самий принцип поширюється й на саму капсулу як батька.

### `BackupRepository` — жодних змін не потрібно

`BackupRepository.ts` читає/пише кожну таблицю через generic `SELECT *`/динамічний `INSERT`
(колонково-агностичний, `docs/DATABASE.md`) — нова колонка `deleted_at` на всіх трьох таблицях
автоматично проходить крізь export/import без жодної зміни коду бекапу, той самий шлях, яким уже
проходять усі інші `deleted_at`-колонки схеми.

## 2. ReadingRun: гарантія UUID + createdAt + updatedAt + deletedAt

### Що вже було

`reading_run` (Фаза 6, `019_reading_run.ts`) мала всі чотири колонки в SQLite з самого початку:
`id TEXT PRIMARY KEY` (заповнюється `generateId()` — `uuid.v4()`, `src/lib/uuid.ts`, той самий
UUID-генератор, що й УСІ інші сутності схеми), `created_at`, `updated_at`, `deleted_at`
(`ReadingRunRepository.discard` уже писав у неї).

### Що бракувало

Домен-тип `ReadingRun` (`src/types/readingRun.ts`, Zod-схема) і `ReadingRunRepository.mapRow`
НІКОЛИ не проносили `deleted_at` рядка далі за межі репозиторія — код, якому потрібно було б
знати, чи саме цей run скасовано (а не просто відфільтрований геть читанням, яке й так фільтрує
`deleted_at IS NULL`), не мав такої можливості. Найяскравіший практичний приклад — сам новий
`DataIntegrityRepository.collectSnapshot` цієї фази: перевірка "капсула/спогад посилається на
скасований (не лише неіснуючий) run" (§3 нижче) потребує НЕВІДФІЛЬТРОВАНОГО читання
`reading_run`, включно з `deleted_at`, — без цього поля в домен-типі такий запит довелось би
читати повз `ReadingRunRepository` напряму, дублюючи Row/mapRow-логіку.

### Виправлення

`ReadingRunSchema` (`readingRun.ts`) отримала `deletedAt: z.string().nullable()`.
`ReadingRunRepository.mapRow` тепер мапить `row.deleted_at`, і `start()` явно повертає
`deletedAt: null` для щойно створеного run. Усі публічні read-методи (`getById`/
`listByUserBookId`/`getActiveByUserBookId`/`getLatestByUserBookId`/`listByIds`) і далі
фільтрують `deleted_at IS NULL`, тож на практиці це поле для будь-якого рядка, що доходить до
звичайного UI, завжди `null` — воно існує заради чесності домен-типу (ТЗ буквально вимагає
"обов'язково") і заради невідфільтрованих читань (`DataIntegrityRepository`, майбутній sync).
Жодної нової міграції не знадобилось — увесь потрібний SQL уже існував із Фази 6, прогалина була
виключно на рівні TypeScript-типу/мапінгу.

## 3. Data Doctor — сім нових перевірок (REREADING DATA DOCTOR)

### Чому БЕЗ нової категорії й БЕЗ нового типу посилання

`app/data-doctor.tsx` ітерує фіксований `DATA_INTEGRITY_CATEGORIES` (шість — `books`/`sessions`/
`progress`/`journal`/`shelves`/`series`, зафіксовані ще ТЗ Фази 5) і для кожної читає обов'язковий
переклад з `dataIntegrityCategoryLabels` (`src/design/i18n-labels.ts`); `DataIntegrityLink` —
закритий union чотирьох типів (`work`/`session`/`shelf`/`series`), і `navigateToLink`
(`app/data-doctor.tsx`) явно обробляє рівно ці чотири. Нова категорія чи новий тип посилання
("run") означали б зміни в UI-шарі та в i18n-таблиці лейблів заради однієї фази — цього ТЗ не
просить, і той самий вибір уже був зроблений для капсул книги (Фаза 4+): усі capsule-перевірки
пішли в наявні `books`/`journal`, а не в нову категорію "капсули". Сім нових перевірок цієї фази
йдуть тим самим шляхом — `books` (стан книги/прочитання) або `sessions` (сесія), лінк — завжди
`workLink(userBookId)` або `{ type: 'session', sessionId }`, обидва вже наявні.

### Сім перевірок

1. **`session_without_run`** (`sessions`) — `reading_session.reading_run_id IS NULL`. Легітимно
   лише для сесій, записаних ДО REREADING MODEL Фаза 7 (`ReadingSessionRepository.start`
   гарантує: "нова сесія ЗАВЖДИ належить якомусь ReadingRun", коментар у самому репозиторії) —
   `020_reading_run_backfill.ts` міг не знайти відповідного run для кожної старої сесії. Для
   будь-якого запису, створеного вже після Фази 7, `NULL` тут — аномалія.
2. **`run_session_mismatch`** (`sessions`) — `reading_session.reading_run_id` вказує на run
   ІНШОЇ книги (`run.userBookId !== session.userBookId`). Той самий клас перевірки, що вже є для
   note/quote проти сесії (`note_session_mismatch`/`quote_session_mismatch`, Фаза 5), тепер
   симетрично для самого run.
3. **`multiple_active_runs`** (`books`) — більш ніж одна `in_progress` (і не м'яко скасована) run
   на одну книгу одночасно. `019_reading_run.ts` (п.4) СВІДОМО не забороняє це на рівні схеми
   (UNIQUE) — "активний" визначається запитом (найновіший за `run_number`), а не констрейнтом —
   тож це можливий, хоч і аномальний, стан даних, а не гарантовано неможливий структурно.
4. **`run_finished_without_finished_at`** (`books`) — `status IN ('finished','did_not_finish')`,
   але `finished_at IS NULL`. Той самий дисбаланс, що `finished_without_finished_at` уже
   перевіряє для `user_book` (Фаза 5), тепер симетрично для самого `reading_run`.
5. **`run_invalid_sequence`** (`books`) — серед не скасованих run однієї книги, відсортованих за
   `run_number`, пізніший (`run_number` більший) розпочався РАНІШЕ за попередній
   (`started_at` менший). `run_number` призначається монотонно (`MAX(run_number)+1`,
   `ReadingRunRepository.start`), але сам хронологічний порядок подій ніде явно не звіряється з
   цим числовим порядком — ручне редагування дати заднім числом чи помилка бекфілу можуть їх
   розсинхронізувати.
6. **`legacy_contradictory_status`** (`books`) — найновіший run книги суперечить
   `user_book.status`: run ще `in_progress`, а книга вже `finished`/`did_not_finish`/
   `want_to_read` — АБО run уже `finished`/`did_not_finish`, а книга досі `reading`/`rereading`.
   Назва "legacy" — той самий клас, що й уже наявна `dnf_with_finished_at`-перевірка (Фаза 1):
   можливий лише в даних, записаних до того, як REREADING MODEL Фаза 7 реально прив'язала зміну
   `user_book.status` до `ReadingRunRepository.start`/`finish`.
7. **`capsule_references_invalid_run`/`memory_references_invalid_run`/
   `pre_reading_reflection_references_invalid_run`/`dnf_reflection_references_invalid_run`**
   (усі — `books`) — "capsule/memory/reflection without valid run" ТЗ буквально: `reading_run_id`
   вказує на run, якого немає в базі ВЗАГАЛІ, або який Є, але м'яко скасований (`discard`) —
   обидва випадки означають "більше не валідне прочитання". Той самий клас перевірки, що вже є
   для видаленого `user_book`/`edition`/категорії нотатки, тепер поширений на `ReadingRun`.
   Пропускається, коли сама дитяча сутність (капсула/спогад) уже м'яко видалена (§1) — той самий
   принцип, що й наявний `if (userBook.deletedAt) continue;` на початку файлу: немає сенсу
   репортувати "невалідне посилання" запису, який сам уже видалений.

### Без destructive auto-fix

Той самий принцип, що встановлений ще в ТЗ Фази 5 і повторений буквально в ТЗ цієї фази: усі сім
перевірок лише ЗНАХОДЯТЬ і, де є сенс, дають `link` для навігації до проблемного запису — жодна
з них нічого не виправляє й не видаляє сама.

### Снепшот — чотири нові необов'язкові поля

`DataIntegritySnapshot` отримала `readingRuns?`/`bookMemories?`/`preReadingReflections?`/
`dnfReflections?` — усі необов'язкові (`?? []` у самих перевірках), той самий підхід, що вже
встановлений для `bookCapsules?` (Фаза 4): існуючі тестові фікстури, написані до цієї фази, не
зобов'язані знати про ReadingRun узагалі. `DataIntegrityRepository.collectSnapshot` читає всі
чотири нові джерела одним додатковим `Promise.all`-блоком, той самий "лише потрібні колонки, не
`SELECT *`" підхід, що й решта файлу.

## Свідомо НЕ зроблено

- **Soft-delete для Shelf/ReadingGoal/Reminder** — докладно §1 вище.
- **Нова категорія Data Doctor "прочитання" чи новий `DataIntegrityLink` тип "run"** — докладно
  §3 вище: сім нових перевірок навмисно вписані в наявні `books`/`sessions`, без змін у
  `app/data-doctor.tsx`/`i18n-labels.ts`.
- **Індекс на нових `deleted_at`-колонках** (`book_capsule`/`book_memory`/`rating`) —
  `docs/V1_6_FULL_AUDIT_REPORT.md` (розділ 29) уже назвав це низьким пріоритетом для будь-якої з
  наявних `deleted_at`-колонок (один користувач, завжди мало видалених рядків відносно живих);
  той самий висновок застосовний і до цих трьох нових колонок, тим паче на маленьких таблицях
  (капсул/спогадів/оцінок завжди на порядки менше, ніж сесій чи нотаток).
- **Перевірка "run без жодної сесії"** (протилежність `session_without_run`) — НЕ входить у
  буквальний список ТЗ цієї фази, і легітимна сама по собі (книга щойно почала читання, `start()`
  створив run, перша сесія ще не записана) — додавання цієї перевірки означало б постійний
  false-positive на нормальному, ще не завершеному стані.
