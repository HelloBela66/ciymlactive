# PERFORMANCE_AUDIT.md — Performance / index audit (Фаза 24)

POLYTSIA V1.6.1, Фаза 24 (PERFORMANCE / INDEX AUDIT). Той самий "фіксує рішення, яке інакше
довелось би пояснювати заново" документ, що й `docs/A11Y_LARGE_TEXT_AUDIT.md`/
`docs/HAPTICS_CLEANUP.md`/`docs/BACKUP_PRIVACY_UX.md`.

## Завдання (буквально)

"Deterministic fixture (1000 books/5000 sessions/10000 journal/1000 lore/500 capsules-runs).
Benchmark ключових queries. EXPLAIN QUERY PLAN для hot queries. Індекси лише за реальним
обґрунтуванням (edition.isbn10, note/quote(user_book_id, created_at), user_book(status,
updated_at) тощо)."

## Звідки взялись саме ці три кандидати

Це не довільний вибір — три названі в ТЗ кандидати дослівно взяті з
`docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 30.3, п.1-3, де вони вже точно позначені як реальні
розбіжності зі схемою, застосованою для `reading_progress`/`shelf_book`, але з явною
позначкою **"NOT BENCHMARKED"** (п.3) — аудит свідомо зупинився на рівні "схема каже, що тут
бракує композитного індексу", не стверджуючи, що це справді вимірна проблема продуктивності
(висновок 30 аудиту: "Жодна з прогалин НЕ підтверджена як реальна проблема продуктивності —
лише як розбіжність зі шаблоном"). Ця фаза — саме той бенчмарк, якого тоді бракувало.

## Методологія: чому справжні 26 міграцій, а не переписана вручну схема

Бенчмарк-скрипт (не входить у сам застосунок — інструмент розробки, `scripts/perf-audit/` не
створювався в репозиторії продукту навмисно, щоб не тягнути `node:sqlite`/бенчмарк-код у
production-залежності; сам скрипт і його вивід — нижче й у цьому документі) робить наступне:

1. Компілює всі 25 (на момент запуску) файлів `src/data/db/migrations/*.ts` через `tsc`
   (стандартний CLI, вже встановлений у dev-оточенні) у CommonJS — БЕЗ переписування SQL
   вручну. Єдина зміна — два рантайм-імпорти в `020_reading_run_backfill.ts`
   (`@/lib/uuid`/`@/lib/dateUtils`) підмінені локальними стабами (`crypto.randomUUID`/
   `new Date().toISOString()` — та сама логіка, що й оригінали, лише без залежності від
   Metro/`@`-аліасу поза Expo-рантаймом).
2. Виконує їх проти СПРАВЖНЬОГО SQLite (`node:sqlite`, вбудований у Node.js 22+, той самий
   рушій SQLite, що стоїть і за `expo-sqlite`, і за `better-sqlite3`, який уже використовує
   `testDb.ts` для repository-тестів проєкту) через тонкий адаптер, що відтворює рівно ту
   підмножину `expo-sqlite` API, яку реально використовують міграції
   (`execAsync`/`runAsync`/`getAllAsync`/`getFirstAsync`/`withTransactionAsync`), і дослівно
   повторює оркестрацію `applyMigrations()` з `migrationRunner.ts` (кожна міграція — власна
   транзакція, крім `manualTransaction`).
3. Результат — БД версії `PRAGMA user_version = 25` (до Фази 24), пройдена ЧЕРЕЗ ті самі
   `PRAGMA foreign_keys = OFF/ON`-перемикання й rebuild-ідіоми, що й на реальному пристрої,
   з нульовою кількістю порушень `PRAGMA foreign_key_check` на кожному кроці.

Це дає бенчмарку те, чого не дав би "уявний" SQL, написаний окремо від коду: гарантію, що
`EXPLAIN QUERY PLAN` перевіряє дослівно той самий запит і ту саму схему, які підуть на
пристрій користувача.

## Фікстура — точні обсяги й детермінізм

Мала маленький seeded PRNG (Mulberry32, seed `424242`) — НЕ крипто-якості, навмисно: той самий
seed завжди дає той самий датасет, тож `EXPLAIN QUERY PLAN`/час "до" і "після" порівнюються на
ідентичних даних, а результат відтворюваний будь-ким, хто запустить той самий скрипт (jest у
цьому проєкті теж не мокає `Math.random` для нових repository-тестів, але тут детермінізм
важливий ІНАКШЕ — щоб порівняння "до/після" не залежало від того, які саме рядки випадково
потрапили у вибірку).

Обсяги — рівно ті, що названі в ТЗ:

| Сутність | Обсяг | Розподіл |
|---|---|---|
| `work`/`edition`/`user_book` ("книги") | 1000 | 1 видання на роботу; `status` рівномірно з 6 значень CHECK; ISBN: ~55% лише `isbn13`, ~25% обидва, ~20% ЛИШЕ `isbn10` (найгірший випадок для `getByIsbn` без індексу на `isbn10` — реалістичний розподіл: старіші видання/ручний ввід без `isbn13`, `EditionRepository.ts:191-196` сам це визнає в іншому контексті) |
| `reading_session` | 5000 | рівномірно по 1000 книгах (~5/книгу в середньому, нерівномірно — `pick()` не гарантує рівний розподіл, той самий реалізм, що й у реальній бібліотеці) |
| `note` + `quote` ("журнал") | 10000 | 50/50 note/quote, рівномірно по 1000 книгах (та сама термінологія "10к+ записів", що вже вживана в коментарі `003_journal_entry_extensions.ts`) |
| `lore_entity` | 1000 | рівномірно по `work` |
| `book_capsule` + `reading_run` ("капсули-прочитання") | 500 | по одній парі capsule+run на перші 500 книг, `status='finished'` |

## Результати — EXPLAIN QUERY PLAN і час, до/після (3000 викликів на запит)

### 1. `EditionRepository.getByIsbn` → `idx_edition_isbn10`

```sql
SELECT * FROM edition WHERE (isbn10 = ? OR isbn13 = ?) AND deleted_at IS NULL LIMIT 1
```

- **ДО:** `SCAN edition` — повне сканування ВСІЄЇ таблиці, незалежно від того, що `isbn13`
  індексований: SQLite використовує `MULTI-INDEX OR`-оптимізацію лише тоді, коли ОБИДВІ
  гілки `OR` мають власний індекс; без індексу на `isbn10` вся умова падає до повного скану.
  0.0346 мс/запит.
- **ПІСЛЯ:** `MULTI-INDEX OR | SEARCH edition USING INDEX idx_edition_isbn10 (isbn10=?) |
  SEARCH edition USING INDEX idx_edition_isbn13 (isbn13=?)`. 0.0056 мс/запит.
- **Прискорення: ~6.1x**, і, на відміну від решти трьох кандидатів, це ЯКІСНА відмінність
  (SCAN проти SEARCH, не лише прибраний крок сортування) — погіршується ЛІНІЙНО з ростом
  бібліотеки, а не залишається сталим накладним видатком.

### 2. `UserBookRepository.listByStatus`/`listStatusOnly` → `idx_user_book_status_updated_at`

```sql
SELECT * FROM user_book WHERE status = ? AND deleted_at IS NULL ORDER BY updated_at DESC
```

- **ДО:** `SEARCH user_book USING INDEX idx_user_book_status (status=?) | USE TEMP B-TREE FOR
  ORDER BY`. 0.2553 мс/запит (сама повільна з перевірених — бо в середньому найбільше рядків
  на статус із фікстури: 1000 книг / 6 статусів ≈ 167/статус).
- **ПІСЛЯ:** `SEARCH user_book USING INDEX idx_user_book_status_updated_at (status=?)` — крок
  сортування прибрано повністю. 0.2139 мс/запит.
- **Прискорення: ~1.19x** на 1000 книгах. Аудит (розділ 30.3, п.3) сам називає це
  "найгарячішим запитом усього застосунку" (виконується на кожному відкритті Home І Library,
  для 4+ статусів окремими викликами) — навіть скромне прискорення тут множиться на частоту
  виклику.

### 3. `NoteRepository.listByUserBook` → `idx_note_user_book_created_at`

```sql
SELECT * FROM note WHERE user_book_id = ? AND deleted_at IS NULL ORDER BY created_at DESC
```

- **ДО:** `SEARCH note USING INDEX idx_note_user_book (user_book_id=?) | USE TEMP B-TREE FOR
  ORDER BY`. 0.0131 мс/запит.
- **ПІСЛЯ:** `SEARCH note USING INDEX idx_note_user_book_created_at (user_book_id=?)`.
  0.0111 мс/запит.
- **Прискорення: ~1.18x.**

### 4. `QuoteRepository.listByUserBook` → `idx_quote_user_book_created_at`

```sql
SELECT * FROM quote WHERE user_book_id = ? AND deleted_at IS NULL ORDER BY created_at DESC
```

- **ДО:** `SEARCH quote USING INDEX idx_quote_user_book (user_book_id=?) | USE TEMP B-TREE FOR
  ORDER BY`. 0.0129 мс/запит.
- **ПІСЛЯ:** `SEARCH quote USING INDEX idx_quote_user_book_created_at (user_book_id=?)`.
  0.0111 мс/запит.
- **Прискорення: ~1.17x.** Найменша абсолютна різниця з чотирьох (мало рядків на книгу в
  середньому — 10000 записів на 1000 книг, і лише половина з них `quote`), але
  `EXPLAIN QUERY PLAN` однозначно підтверджує той самий клас виправлення (прибраний
  TEMP B-TREE), і за задумом ТЗ `note`/`quote` — одна логічна пара, яка отримує однакове
  ставлення.

### 5. `ReadingSessionRepository.listByUserBookId` → `idx_session_user_book_started_at`
   (НОВА знахідка цієї фази, не з аудиту)

```sql
SELECT * FROM reading_session
WHERE user_book_id = ? AND deleted_at IS NULL AND ended_at IS NOT NULL
ORDER BY started_at DESC
```

Виявлено тим самим методом, що й решта (прямий grep реальних repository-запитів, не з
аудиту — розділ 30.3, п.4 аудиту обговорював лише окремий, гіпотетичний індекс на `ended_at`
для `getActiveSession`/`listAllCompleted`, не цю композитну пару для Book Details). Той самий
шаблон "фільтр за FK + ORDER BY по даті", що й п.3/4, лише інша таблиця й колонка дати
(`started_at`, не `created_at`) — Book Details показує історію сесій конкретної книги,
найновіші зверху.

- **ДО:** `SEARCH reading_session USING INDEX idx_session_user_book (user_book_id=?) | USE
  TEMP B-TREE FOR ORDER BY`. 0.0132 мс/запит.
- **ПІСЛЯ:** `SEARCH reading_session USING INDEX idx_session_user_book_started_at
  (user_book_id=?)`. 0.0113 мс/запит.
- **Прискорення: ~1.16x.**

## Перевірено й СВІДОМО НЕ додано (бенчмарком, а не припущенням)

- **`reading_session.ended_at` окремо** (аудит, розділ 30.3, п.4) — `getActiveSession`
  (щонайбільше 1 активна сесія, висока вибірковість і без індексу — індекс на булевій-подібній
  умові тут нічого не пришвидшить) і `listAllCompleted` (свідомо БЕЗ `LIMIT`, розділ 29.1
  аудиту — сканує все незалежно від індексів, індекс на `ended_at` не рятує від матеріалізації
  всього набору перед сортуванням) — жоден реальний виграш.
- **`deleted_at` (soft-delete) на жодній таблиці** (аудит, розділ 30.3, п.5) — низька
  вибірковість (видалених рядків завжди мало відносно живих), overhead на запис не виправданий
  для одного користувача. Свідомо НЕ перевірено бенчмарком окремо — сам аудит уже дав достатнє
  обґрунтування "не варто" без потреби емпіричної перевірки очевидного.
- **Глобальна стрічка щоденника** (`JournalRepository`, `UNION ALL ... ORDER BY created_at
  DESC, id DESC LIMIT ?`) — перевірено `EXPLAIN QUERY PLAN` окремо:

  ```
  MERGE (UNION ALL)
  LEFT   SCAN note USING INDEX idx_note_created_at
  RIGHT  SCAN quote USING INDEX idx_quote_created_at
  ```

  Уже оптимально — обидва боки читають у порядку `created_at` через наявні одноколонкові
  індекси (003) і зливаються (`MERGE`) без окремого кроку сортування. Композитні індекси на
  `(user_book_id, created_at)` вище тут ні до чого (запит без `WHERE user_book_id`).
- **`book_capsule`/`lore_entity` та інші таблиці Реread-моделі** — перевірено відповідні
  репозиторії (`BookCapsuleRepository`, `LoreEntityRepository`): жодного реального query use
  case з `ORDER BY` по неіндексованій колонці не знайдено — фільтрація там завжди лише за вже
  індексованим `user_book_id`/`work_id`, без додаткового сортування, яке потребувало б
  композиту.

## Видалення надлишкових старих індексів

Разом із чотирма новими композитними/недостатнім старим `idx_edition_isbn10` міграція
`026_hot_query_indexes.ts` ВИДАЛЯЄ чотири одноколонкові індекси, які нові композити
повністю замінюють: `idx_user_book_status`, `idx_note_user_book`, `idx_quote_user_book`,
`idx_session_user_book`.

Це не довільне прибирання — SQLite composite index покриває будь-який запит на самій лише
провідній колонці так само добре, як окремий одноколонковий індекс на ній (leftmost-prefix
rule). Перевірено `EXPLAIN QUERY PLAN` окремо для запитів БЕЗ `ORDER BY` (типу
`UserBookRepository.getByEditionId`-подібних, `SELECT COUNT(*) WHERE user_book_id = ?`) ПІСЛЯ
видалення старих індексів — усі й далі використовують новий композитний індекс, в одному
випадку (`COUNT(*)`) навіть отримуючи `COVERING INDEX` (ще краще, ніж раніше). Тримати обидва
одночасно означало б подвійний overhead на запис (кожен `INSERT`/`UPDATE` підтримує обидва
індекси) без жодної користі на читання — той самий принцип "не додавай індекс без query use
case", але у зворотному напрямку: не тримай той, що вже замінений.

`idx_edition_isbn13` — НЕ видалений. На відміну від решти, для `MULTI-INDEX OR` потрібні ОБИДВА
окремі одноколонкові індекси (`isbn10` і `isbn13`) — композит тут не застосовний, бо це два
різні стовпці в диз'юнкції (`OR`), а не пара "фільтр за одним стовпцем + сортування за іншим"
на одній таблиці.

## Свідомо НЕ зроблено

- **Не написано окремий production-скрипт бенчмарку в репозиторії застосунку** — інструмент
  розробки (`tsc`-компіляція міграцій + `node:sqlite` + сидер) існував лише для підготовки цієї
  фази, не є частиною застосунку чи CI, і не додає нових production-залежностей
  (`node:sqlite` — вбудований у Node.js, не в Expo/React Native рантайм; ужитий лише
  локально, для розробки).
- **Не змінено `better-sqlite3`-based `testDb.ts`, який уже використовують repository-тести**
  — той самий SQLite-рушій під капотом, окремий бенчмарк-інструмент не мав дублювати цю вже
  наявну інфраструктуру, лише перевірити РЕАЛЬНІ файли міграцій без мокової схеми.
- **Не додано індекс на `deleted_at` в жодній таблиці** — детальніше вище, §"Перевірено й
  свідомо НЕ додано".
- **Не переглянуто UNION-запити `ActivityHistoryRepository`/`OnThisDayRepository`** — аудит
  (розділи 29.1-29.3, вже процитовані вище) детально пояснює, чому індекси на FK-колонках там
  прискорюють лише самі `JOIN`, а не рятують від матеріалізації всього об'єднаного набору перед
  фінальним `ORDER BY`+`LIMIT` — це архітектурна властивість самого UNION ALL-підходу, не
  прогалина в індексах, і поза межами "додай індекс" рішення цієї фази.
