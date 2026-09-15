# POLYTSIA — POST-V1.6.2 FOUNDATION CLOSURE: ФІНАЛЬНИЙ АУДИТ ТА ЗВІТ ПРО ПОТОЧНИЙ СТАН

Дата: 2026-09-15
Тип документа: незалежний аудит (НЕ розробка, НЕ V1.7). Цей звіт нічого не виправляє і нічого не додає — лише фіксує реальний поточний стан коду після hotfix-у, описаного в `docs/POST_V1_6_2_FOUNDATION_CLOSURE_REPORT.md`.

---

## 0. ВИКОНАВЧИЙ ВЕРДИКТ

**FOUNDATION CLOSED WITH OWNER ACTIONS**

Обидва цільові дефекти hotfix-у (Calendar soft-delete inconsistency, Restore-success-before-repair) реально виправлені в живому коді й підтверджені автоматичними тестами; жодного шляху коду, де б "Резервну копію відновлено" показувалось при провалі обов'язкового ReadingRun-backfill, не знайдено. Google Books proxy реально задеплоєний і підтверджений живими запитами (англійський і український пошук). Own Catalog import реально застосований у продакшн (2038/2038 рядків), ідемпотентність підтверджена і кодом, і тестом, і реальним повторним прогоном. Жодних критичних регресій безпеки (RLS, service_role, client secrets) не знайдено.

Причини "WITH OWNER ACTIONS", а не чистого "CLOSED":
1. **Фізична перевірка на пристрої відсутня повністю** — жодного запуску на Android/iPhone фізичному пристрої, емуляторі, симуляторі чи навіть локальному Expo на ПК не зафіксовано в `docs/OWNER_MANUAL_TEST_LOG.md` (§10 нижче).
2. **Два задокументовані, свідомо винесені за межі цієї фази прогалини** в Calendar soft-delete консистентності (місячна сводка "найчастіше цього місяця" і мітки старту/фінішу на основі ReadingRun лишаються "живими-only") — не баг цього hotfix-у, а вже раніше задокументований і свідомо відкладений обсяг (§7).
3. **Одна нова знахідка цього аудиту** (не регресія hotfix-у, попередня поведінка): клієнтські обгортки Google Books/ISBNdb proxy ковтають ВСІ мережеві помилки (429/timeout/5xx) як порожній результат, невідрізненний від "нічого не знайдено" (§21).

Жоден із трьох пунктів не є критичним "хребтовим" дефектом (integrity/data-loss/false-success) — усі вони або задокументовані свідомі рішення, або owner-side дії, що не потребують нового коду.

---

## 1. МЕТОДОЛОГІЯ ТА ДЖЕРЕЛА ІСТИНИ

Порядок пріоритету джерел (застосований буквально): живий код репозиторію (staged через device bridge з `C:\polytsya-m11` на пристрої власника) > SQLite-схема + міграції > репозиторії > domain/application-сервіси > тести > routes/screens/components > `package.json`+lockfile > CI > Supabase Edge Functions/конфіг > документація. Там, де документація суперечила коду, перевага віддавалась коду, а розбіжність зафіксована явно (див. §6, рядок 8 — це вже було виправлено раніше цієї сесії, до цього аудиту).

Аудит виконано читанням реального staged коду (жодних припущень "на пам'ять" із попередніх фаз) п'ятьма паралельними дослідницькими проходами, кожен зосереджений на одному кластері питань ТЗ, плюс особисто перечитані: `package.json`, `.github/workflows/ci.yml`, `useReadingRunsDetail.ts`, `useHomeContextCard.ts`, `app/trends.tsx`. Жодного рядка коду не було змінено в рамках цього аудиту.

### Легенда evidence-міток (використовується буквально в усьому документі)

- **CODE VERIFIED** — я особисто або дослідницький прохід прочитали реальний вихідний код і підтвердили твердження.
- **AUTOMATED TEST VERIFIED** — існує реальний тестовий файл/кейс, що перевіряє саме це твердження (процитований).
- **CI VERIFIED** — підтверджено конфігурацією `.github/workflows/ci.yml` (сам конфіг не змінювався цим hotfix-ом).
- **OWNER MANUAL VERIFIED** — власник продукту особисто підтвердив факт (наведено реальний доказ: лог команд, файли звітів на диску, тощо).
- **PHYSICAL DEVICE VERIFIED** — підтверджено реальним запуском на фізичному пристрої. Жодного випадку в цьому аудиті не знайдено.
- **OWNER ACTION REQUIRED** — код готовий/перевірений, але потрібна дія власника (не коду), щоб факт став реальністю.
- **NOT VERIFIED** — я не зміг підтвердити твердження в межах цього аудиту. Використовується явно, а не замовчується.

`code exists` ніде в цьому документі не прирівнюється до `deployed`; `local run` ніде не прирівнюється до `physical-device verification`; `CSV parsed` ніде не прирівнюється до `production catalog imported`.

---

## 2. МЕЖІ ЦЬОГО АУДИТУ

Цей документ — знімок стану, не робочий список. Він НЕ пропонує виправлень, НЕ починає V1.7, НЕ чіпає жодного файлу. Усі "risk"-позначки — це або (а) вже задокументовані в коді свідомі рішення, або (б) речі, які я не мав змоги перевірити в цьому проході (NOT VERIFIED), а не нові баги, вигадані заради звіту.

---

## 3. КОРОТКИЙ ІНВЕНТАР ЖИВОГО РЕПОЗИТОРІЮ

- `package.json`: версія `0.1.0` (не змінена), Expo SDK `~57`, React `19.2.3`, React Native `0.86.3`, `zustand ^5.0.15` присутній (підтверджує, що попередня помилкова спроба видалити zustand у V1.6.2 залишається виправленою), **жодної залежності `@supabase/supabase-js`** — увесь Supabase-трафік іде через власні `fetch()`-обгортки. CODE VERIFIED.
- Рівно **27 міграцій** (`001_base_schema.ts` … `027_soft_delete_readiness.ts`), усі з датами модифікації задовго до цього hotfix-у — **прямий доказ, що hotfix не додав жодної нової міграції**. CODE VERIFIED.
- Рівно **4 директорії** Supabase Edge Functions: `_shared`, `cover-upload`, `google-books-proxy`, `isbndb-proxy`. CODE VERIFIED.
- `.github/workflows/ci.yml` — 8919 байт, дата модифікації не змінювалась із фази V1.6.1 Phase 25 — **hotfix не чіпав CI-конфіг**. CODE VERIFIED. Два job'и: `ci` (typecheck/lint/jest/`expo-doctor`-advisory/`npm audit`-advisory) та `edge-functions` (`deno check`/`deno lint`).

---

## 4. МІЖ ІНШИМ (сектор, чому це аудит, а не звіт закриття)

Звіт `docs/POST_V1_6_2_FOUNDATION_CLOSURE_REPORT.md` уже задокументував сам hotfix. Цей документ — незалежна повторна перевірка того звіту плюс значно ширше охоплення (Google Books/Edge Functions на рівні коду, повний own-catalog pipeline, product-area регресії, симуляції використання). Розбіжностей між закриттям і цим аудитом, які змінювали б вердикт, не знайдено — знайдено лише деталізацію (два calendar-гепи, proxy-error-swallowing), описану вище.

---

## 5. ТОЧНИЙ IMPLEMENTATION DIFF (за кожною зміною hotfix-у)

### 5.1 Calendar soft-delete consistency

- **Проблема**: Month Grid і Day Details розходились для книги, видаленої з бібліотеки.
- **Попередня поведінка**: обидва хуки резолвили деталі книг через `UserBookRepository.listWithDetailsByIds` — "живий-only" запит (`deleted_at IS NULL`); видалена книга зникала з `primaryUserBook`/`secondaryUserBook` і зі списку `books` у Day Details, попри те що самі сесії (`ReadingSessionRepository.listStartedBetween`) не фільтрувались за `user_book.deleted_at`.
- **Корінна причина**: неузгодженість між "живим-only" резолвером деталей книги і "усі, включно з видаленими" резолвером сесій.
- **Змінені файли/модулі**: `src/data/repositories/UserBookRepository.ts` (нові методи `listByIdsIncludingDeleted`, `listWithDetailsByIdsIncludingDeleted`), `src/features/calendar/useCalendarSessions.ts` (два виклики оновлені на нові методи — Month Grid `:153` і Day Details `:361`), `src/data/repositories/UserBookRepository.test.ts` (+7 регресійних тестів).
- **Нова поведінка**: книга, видалена з бібліотеки, залишається видимою в Calendar для сесій/хвилин/обкладинки. CODE VERIFIED.
- **Тести**: AUTOMATED TEST VERIFIED — `UserBookRepository.test.ts:458-470,490-499` прямо тестують, що видалена книга повертається обома новими методами.
- **Evidence-статус**: CODE VERIFIED + AUTOMATED TEST VERIFIED. **Не повністю уніфіковано** — див. §7 (два залишкових, свідомо задокументованих у самому коді геп-и: `useMonthSummary` і `ReadingRunRepository`-запити на старт/фініш все ще "живі-only").

### 5.2 Restore success-before-repair invariant

- **Проблема**: чи міг UI показати "успішно відновлено" до завершення обов'язкового ReadingRun semantic repair.
- **Попередня поведінка**: UNCERTAIN (за формулюванням самого ТЗ hotfix-у) — не було явного розрізнення "backfill провалився" від "усе ок" в UI-повідомленні.
- **Корінна причина**: відсутність окремого прапорця стану провалу backfill, що передавався б аж до UI.
- **Змінені файли/модулі**: `useBackup.ts` (`backfillFailed`-трекінг, тип `RestoreBackupResult`), `app/backup.tsx` (окреме повідомлення "Дані відновлено частково"), `src/data/db/legacyRunBackfill.test.ts` (+тест на ідемпотентність повторного виклику/retry).
- **Нова поведінка**: `backfillAllLegacyReadingRunLinks(db)` очікується (`await`) синхронно всередині тієї самої async-мутації до повернення результату; `backfillFailed=true` перехоплює гілку успіху раніше, ніж вона могла б показати звичайний текст "Дані відновлено". CODE VERIFIED, трасовано по коду до точного `if`/`return`.
- **Тести**: AUTOMATED TEST VERIFIED — `legacyRunBackfill.test.ts:305-324`, "повторний виклик... — безпечний no-op, без дублікатів".
- **Evidence-статус**: CODE VERIFIED + AUTOMATED TEST VERIFIED. Детальний розбір — §12-18.

### 5.3 Google Books proxy deployment

- **Проблема**: клієнтський секрет Google Books API у попередніх версіях; статус деплою на момент початку hotfix-у — OWNER ACTION REQUIRED.
- **Корінна причина** (історична, вже виправлена до цього hotfix-у): пряме звернення клієнта до Google API з ключем у бандлі.
- **Нова поведінка**: Edge Function `google-books-proxy` тримає ключ лише в `Deno.env`, робота і без ключа (нижча квота анонімно), і з ключем.
- **Деплой**: OWNER MANUAL VERIFIED — реальні HTTP-запити власника до продакшн-URL функції повернули коректні дані для запиту "Harry Potter" (англ.) і "Кобзар" (укр., реальна книга "Чигиринський кобзар", 1867).
- **Evidence-статус**: **DEPLOYED & VERIFIED**. Деталі коду — §19-22.

### 5.4 Own Catalog import production state

- **Проблема**: застарілий `docs/OWN_CATALOG_IMPORT_REPORT.md` хибно стверджував, що `--apply` ніколи не запускався.
- **Виправлення** (виконане раніше в цій же сесії, до цього аудиту): документ переписаний із чесною хронологією на основі 6 реальних timestamped звітних файлів на пристрої власника, включно з двома реальними провалами (масовий збій завантаження обкладинок, потім 404 при upsert у БД) перед повністю успішним фінальним прогоном (2038/2038 рядків, 2038/2038 обкладинок у власному Storage, 0 помилок).
- **Evidence-статус**: OWNER MANUAL VERIFIED. Деталі pipeline — §23-36.

---

## 6. МАТРИЦЯ ПОПЕРЕДНІХ ВІДКРИТИХ ПИТАНЬ (10 пунктів)

| # | Попередня проблема | Було | Поточний статус | Evidence | Залишковий ризик |
|---|---|---|---|---|---|
| 1 | Calendar soft-delete inconsistency | Month Grid і Day Details розходились для видаленої книги | PARTIALLY FIXED | CODE VERIFIED + AUTOMATED TEST VERIFIED | LOW-MEDIUM — місячна сводка "найчастіше" і старт/фініш-мітки на основі ReadingRun лишаються alive-only, свідомо задокументована прогалина поза обсягом фази (§7) |
| 2 | Restore success до обов'язкового semantic repair | UNCERTAIN | FIXED | CODE VERIFIED + AUTOMATED TEST VERIFIED | LOW — FK-fail шлях NOT VERIFIED, окремого UI-тексту-тесту немає |
| 3 | Google Books proxy deployment | OWNER ACTION REQUIRED | FIXED | OWNER MANUAL VERIFIED (реальні продакшн-запити) | LOW — помилки proxy/провайдера "ковтаються" клієнтом як порожній результат (§21), не спричинено цим hotfix-ом |
| 4 | Google Books client secret exposure | risk | VERIFIED SAFE | CODE VERIFIED (ключ ніколи не потрапляє у відповідь клієнту) | NONE |
| 5 | Own catalog idempotency | unverified claim | VERIFIED | CODE VERIFIED + AUTOMATED TEST VERIFIED + OWNER MANUAL VERIFIED (реальний повторний прогін: created 0 / updated 2038) | NONE значущого |
| 6 | External cover hotlinking | risk | VERIFIED SAFE (own catalog) | CODE VERIFIED (`cover_url` завжди власний Storage URL, джерело не персистується взагалі для curated_book) | NONE для own catalog; NOT VERIFIED для теоретичного шляху shared-catalog user-submitted книг поза межами перевірених файлів |
| 7 | Raw source URLs у Search | risk | VERIFIED SAFE | CODE VERIFIED (картка результату рендерить лише cover/title/authors/addedCount) | NONE |
| 8 | Catalog production import state | ambiguous (застарілий документ) | FIXED | OWNER MANUAL VERIFIED (реальні файли звітів, 2038/2038, 0 помилок) | NONE нового |
| 9 | Repository coverage, зачеплене hotfix-ом | unknown | VERIFIED | AUTOMATED TEST VERIFIED — UserBookRepository (37 кейсів, FULL), legacyRunBackfill (ідемпотентність) | LOW — немає тесту на крос-узгодженість хуків Month Grid/Day Details (лише репозиторний метод протестований) |
| 10 | Physical-device verification | NOT VERIFIED | STILL OPEN | NOT VERIFIED (жодного пристрою/емулятора/симулятора в середовищі розробки) | MEDIUM — увесь код/тест-рівень сильний, але жодного реального підтвердження на екрані немає |

---

## 7-11. CALENDAR — ГЛИБОКИЙ РОЗБІР

### 7. Корінна причина розходження і поточна узгодженість

CODE VERIFIED. Обидва хуки (`useMonthCalendarData`, `useDaySessions` у `src/features/calendar/useCalendarSessions.ts`) тепер резолвлять деталі книг через новий `UserBookRepository.listWithDetailsByIdsIncludingDeleted` (виклики на рядках `:153` і `:361`) замість старого alive-only `listWithDetailsByIds`.

**Не повністю уніфіковано — два залишкові гепи, обидва самим кодом визнані й задокументовані:**

1. `useMonthSummary` (картка "Найчастіше цього місяця", верх екрана) усе ще використовує старий alive-only `listWithDetailsByIds` (`useCalendarSessions.ts:240`). Видалена книга випадає з `topBooks`/`totalPages` цієї картки (не з самої сітки).
2. `ReadingRunRepository.listStartedOrFinishedBetween`/`listFinishedBetween` (мітки старту/фінішу на клітинках сітки і таймлайн Day Details) досі приєднують `user_book ub ... WHERE ub.deleted_at IS NULL` (`ReadingRunRepository.ts:212-224`). Це **явно задокументовано в коментарі коду** (`ReadingRunRepository.ts:200-207`): "не виправлений цією фазою — поза її обсягом", з посиланням на `docs/CALENDAR_VISUAL_REDESIGN_REPORT.md` §"Відомі обмеження".

Обидва пункти — не приховані баги, а прозоро задокументовані обмеження обсягу.

### 8. Таблиця видимості за 12 станами сутностей

| Стан сутності | Видимо в Calendar? | Доказ |
|---|---|---|
| Активна UserBook | ТАК | `listByIds`/`listWithDetailsByIds*` |
| Завершена UserBook | ТАК | статус не фільтрується |
| Soft-deleted UserBook | ЧАСТКОВО | обкладинка/лічильник сесій — ТАК (`listWithDetailsByIdsIncludingDeleted`); мітка старту/фінішу і "найчастіше цього місяця" — НІ (§7) |
| Валідна ReadingSession | ТАК | `listStartedBetween`, без фільтра за `deleted_at` книги |
| Soft-deleted ReadingSession | НІ | власний `deleted_at IS NULL`-фільтр репозиторію |
| Активний ReadingRun | ТАК | `listStartedOrFinishedBetween` включає `in_progress` |
| Завершений ReadingRun | ТАК | те саме |
| Soft-deleted ReadingRun | НІ | `WHERE rr.deleted_at IS NULL` |
| Відсутній Work | НІ (тихий пропуск) | `attachDetailsBatch`: `if (!work) continue` |
| Відсутнє Edition | НІ (тихий пропуск) | `if (!edition) continue`, підтверджено тестом без throw |
| Відсутня обкладинка | ТАК (книга показується без зображення) | NOT VERIFIED на рівні UI-компонента в цьому проході |
| Видалений запис Journal | NOT VERIFIED | фільтрація `JournalRepository.listFeedPage` не перевірялась у цьому проході |

### 9. Якщо користувач видаляє книгу з бібліотеки після прочитання — чи лишається історична активність у Calendar?

**ТАК для сесій/хвилин/обкладинки, ЧАСТКОВО для маркерів старту/фінішу.** CODE VERIFIED: `UserBookRepository.remove` лише встановлює `deleted_at` (м'яке видалення), і Calendar-хуки тепер резолвлять такі книги через `listWithDetailsByIdsIncludingDeleted` з явним коментарем у коді: "видалення книги з бібліотеки не повинно стирати легітимну історію читання". AUTOMATED TEST VERIFIED (`UserBookRepository.test.ts:458-470,490-499`). Однак мітка "старт/фініш" на клітинці й таймлайн Day Details НЕ покажуться для такої книги (§7, геп #2) — тому відповідь не чисте "ТАК", а "ТАК з відомим винятком".

### 10. Тест, що доводить рівність Month Grid і Day Details

**NOT VERIFIED.** Тестового файлу для `useCalendarSessions.ts` не знайдено в `src/features/calendar/`. Сім нових тестів живуть у `UserBookRepository.test.ts` і перевіряють лише репозиторний метод ізольовано, не крос-хукову узгодженість.

### 11. Регресійна перевірка: чи не зламано інше

CODE VERIFIED, незмінено: шарові обкладинки/primary+secondary/бейдж "+N" (`calendar.tsx:181-233`, та сама структура полів), хвилини/сторінки (незмінена логіка сумування), позначка повторного прочитання в Day Details (`runNumberBySessionId`, незмінено), spoiler-safe журнал (`hiddenJournalCount`, незмінено). Місячна сводка — **поведінково незмінена в сенсі "не розширена"** (лишилась alive-only, див. §7) — це звіт факту, не судження, що це варто виправити.

---

## 12-18. RESTORE — ГЛИБОКИЙ РОЗБІР

### 12. Реальний потік (з коду `useBackup.ts`/`app/backup.tsx`)

1. Вибір файлу і парсинг — `usePickBackupFile`, `checkSchemaCompatibility`.
2. Підтвердження користувача (`Alert.alert`).
3. `BackupRepository.restoreAll(db, envelope.data, onProgress)` — повна заміна БД, **транзакційно** (`db.withTransactionAsync`).
4. `backfillAllLegacyReadingRunLinks(db)` — семантичний ремонт ReadingRun, обгорнутий у try/catch, **очікується (await) синхронно**.
5. `rebuildCapsuleRemindersAsync(db)` — best-effort, try/catch.
6. `DataIntegrityRepository.runCheck(db)` — advisory-перевірка цілісності, try/catch.
7. Повернення `{ integrityReport, backfillFailed }` → UI розгалужується спочатку за `backfillFailed`, потім за `integrityReport`.

CODE VERIFIED, увесь ланцюжок трасовано за номерами рядків у дослідницькому проході.

### 13. Чи може "успіх" показатись до завершення обов'язкового repair?

**НІ.** CODE VERIFIED: `backfillAllLegacyReadingRunLinks(db)` очікується всередині того самого async `mutationFn` до повернення результату; `onSuccess`-колбек у `app/backup.tsx` викликається лише після резолву проміса мутації — тобто після спроби backfill (успішної чи перехопленої як провал) і після встановлення `backfillFailed`. `backfillFailed` реально змінює показане повідомлення: окрема гілка "Дані відновлено частково" виконує `return` до гілок звичайного успіху.

### 14. Failure-injection аналіз

| Точка провалу | Класифікація | Доказ |
|---|---|---|
| backup-parse-fail | **abort до будь-якого запису** | `parseBackupJson` повертає `{ok:false}` → відновлення не викликається взагалі |
| DB-restore-fail (усередині `restoreAll`) | **rollback** | усередині `db.withTransactionAsync`; мутація кидає помилку → "Бібліотека лишилась незмінною" |
| FK-fail | **NOT VERIFIED** | обмеження зовнішніх ключів у сирих INSERT-ах `restoreAll` не перевірялись окремо в цьому проході |
| ReadingRun-repair-fail / semantic-repair-throws | **warning, не rollback** | перехоплено, `backfillFailed=true`, дані бібліотеки вже закомічені; UI показує "Дані відновлено частково" |
| advisory-integrity-issue | **warning, все ще "успіх"** | `Alert.alert('Дані відновлено', ...)` з посиланням на Data Doctor |

### 15. Атомарність — явна заява

**Поетапно, але відновлювано (staged-but-recoverable), НЕ повністю транзакційно end-to-end.** Основний запис `restoreAll` атомарний (одна SQLite-транзакція). Backfill/repair, перебудова нагадувань капсул і перевірка цілісності виконуються ПІСЛЯ коміту цієї транзакції, кожен незалежно, без додаткової обгортаючої транзакції. Гарантія відновлення: **ретрай-безпечність backfill-кроку** — AUTOMATED TEST VERIFIED, `legacyRunBackfill.test.ts:305-324` — повторний виклик (симуляція retry після збою) є безпечним no-op без дублікатів (ідентичні ID `reading_run`, незмінні FK-зв'язки `rating`/`book_memory`/`dnf_reflection`/`reading_session.reading_run_id`).

### 16. Чи є шлях, де показується "Резервну копію відновлено" при провалі обов'язкової підготовки?

**НІ — не знайдено.** Точна гілка: `if (backfillFailed) { ...; return; }` виконується й виходить (`return`) до досягнення гілок звичайного успіху нижче. `backfillFailed` встановлюється з реального try/catch навколо `await`-виклику `backfillAllLegacyReadingRunLinks(db)`, не з жорстко закодованого значення, і передається без модифікацій крізь повернений об'єкт мутації. Жодного шляху коду, що пропускає встановлення `backfillFailed` або обходить перевірку `if` перед гілками успіху, не знайдено.

Застереження за чесністю evidence-дисципліни: перевірено лише `backup.tsx`/`useBackup.ts`; внутрішня механіка `useMutationErrorHandler` на предмет гіпотетичної гонки `onError`/`onSuccess` не перевірялась окремо, і тесту компонента/знімка на сам показаний UI-текст не знайдено (NOT VERIFIED на цьому вужчому рівні).

### 17. Роль Data Doctor

**Лише advisory, не обов'язкова коректність відновлення.** CODE VERIFIED, `app/data-doctor.tsx`: явний коментар "НАВМИСНО без жодного auto-repair... лише знаходження й навігація до проблемного запису". Read-only (`DataIntegrityRepository.runCheck` виконує лише `SELECT`), запускається вручну, а виклик після відновлення обгорнутий у try/catch, що ніколи не впливає на статус успіху/провалу самого відновлення. Перевіряє (за `collectSnapshot`): user_book/edition/work, reading_session, reading_progress, note, quote, note_category, shelf_book, series/series_entry, book_capsule, reading_run, book_memory, pre_reading_reflection, dnf_reflection. Точна логіка перевірок живе в `src/domain/dataIntegrityDoctor.ts` — NOT VERIFIED у цьому проході (не читався), хоча відомо, що для нього існує окремий 29KB тестовий файл.

### 18. Регресійний чекліст ReadingRun

| Перевірка | Статус | Доказ |
|---|---|---|
| want_to_read→reading створює run | AUTOMATED TEST VERIFIED | `UserBookRepository.test.ts:231-243` |
| finished→reread створює новий run | AUTOMATED TEST VERIFIED | `UserBookRepository.test.ts:276-291` |
| DNF→return/new attempt створює наступний run | AUTOMATED TEST VERIFIED | `UserBookRepository.test.ts:293-313` |
| сесія використовує правильний активний run | NOT VERIFIED | `ReadingSessionRepository.start` не перевірявся в цьому проході |
| не може бути двох активних run одночасно | CODE VERIFIED | лише прикладний guard (немає UNIQUE-обмеження в БД); `getActiveByUserBookId` бере найновіший `in_progress`; `updateStatus` запускає `start` лише коли `!activeRun` |
| скасування порожньої спроби | CODE VERIFIED | `ReadingSessionRepository.discard` — якщо остання жива сесія run видаляється й run ніколи не завершувався, сам run м'яко скасовується |
| попередній run зберігається при створенні нового | AUTOMATED TEST VERIFIED | `UserBookRepository.test.ts:276-291`, run #1 лишається `status:'finished'` |
| зв'язок Book Memory збережений per-run | CODE VERIFIED (на рівні моделі даних) | `book_memory` несе `reading_run_id`, є legacy-linking логіка; момент реального запису NOT VERIFIED |
| зв'язок Capsule збережений per-run | CODE VERIFIED (на рівні моделі даних) | аналогічно, момент реального запису NOT VERIFIED |
| дані порівняння повторних прочитань збережені | CODE VERIFIED | `ReadingRunRepository.listUserBookIdsWithMultipleFinishedRuns` — документоване джерело для екрана порівняння; сам компонент NOT VERIFIED |

---

## 19-22. GOOGLE BOOKS PROXY ТА EDGE FUNCTIONS

### 19. Стан по кожному з трьох Edge Functions

**google-books-proxy**: проксує `search`/`lookup`/`get_edition` до `www.googleapis.com/books/v1/volumes`. Auth: `verify_jwt` лишається увімкненим за коментарем у файлі (deploy-flag-рівень NOT VERIFIED — коментар, не сам конфіг деплою). Rate limit: burst 30/60с, sustained 2000/86400с. Секрети: `GOOGLE_BOOKS_API_KEY` (опційний), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (лише для RPC rate-limit). Таймаут апстріму 8000мс, ліміт відповіді 2MB.

**isbndb-proxy**: проксує `search`/`lookup` до платного `api2.isbndb.com`. Той самий `verify_jwt`-коментар. Rate limit: burst 20/60с, sustained 300/86400с. Секрети: `ISBNDB_API_KEY` (обов'язковий), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Логує тіла відповідей апстріму (до 300-500 символів) у приватні логи Supabase — не повертається клієнту.

**cover-upload**: приймає сирі байти зображення, перевіряє реальний тип файлу через magic-byte sniffing (JPEG/PNG), генерує шлях об'єкта через `crypto.randomUUID()` (ніколи не клієнтський), завантажує в bucket `book-covers` через service-role. Auth-статус `verify_jwt` для цієї функції окремо не задокументований у коментарі (NOT VERIFIED, на відміну від двох інших). Rate limit: burst 10/60с, sustained 100/86400с. Ліміт розміру 5MB, реальний streamed-підрахунок байтів (не лише `Content-Length`).

Усе — CODE VERIFIED.

### 20. Чи надсилається Google Books API key клієнту?

**НІ.** CODE VERIFIED: ключ використовується лише всередині `withApiKey()` для побудови вихідного URL до Google; тип `ProxyBook`, що повертається клієнту, не містить поля ключа; JSON-відповіді клієнту (`{ books }`, `{ book }`) ніколи не містять `API_KEY` чи сиру відповідь апстріму. Ключ ніколи не залишає Deno-рантайм.

### 21. Поведінка клієнта при провалі/таймауті/429/помилці провайдера — НОВА ЗНАХІДКА

**CODE VERIFIED — помилки НЕ відрізняються від порожнього результату в UI.** Ланцюжок: `googleBooksProxyClient.ts`/`isbndbProxyClient.ts` `callProxy()` на будь-якій не-OK HTTP-відповіді (429/500/502/504) чи мережевій помилці логує через `log.warn`/`log.error` і повертає `null`. `GoogleBooksProvider`/`ISBNdbProvider` перетворюють `null` на `[]` (`result?.books ?? []`). `useProviderSearch.ts` має явний коментар: "Провайдер сам ловить мережеві помилки й повертає `[]` — тут `isError` практично ніколи не спрацює" (`retry: false`). `app/(tabs)/search.tsx`'s `ProviderResultsSection` не отримує `isError`/`error`-пропс узагалі — лише `data`/`isLoading`/`show`; при `data.length === 0` повертає `null`, точнісінько як для справжнього "нічого не знайдено".

Це **не регресія цього hotfix-у** — попередня поведінка, вперше виявлена цим аудитом. Єдиний виняток, що обробляється коректно й окремо: офлайн-стан пристрою (`useIsOffline()`) показує явний банер `OfflineNotice` — але це перевірка мережі пристрою, а не провалу самого proxy/провайдера вже онлайн.

### 22. isbndb-proxy hard-fail без ключа

**Підтверджено.** CODE VERIFIED: `isbndb-proxy/index.ts` повертає `503 not_configured`, якщо `ISBNDB_API_KEY` не встановлений — перевірка виконується одразу після методу, до rate-limit і парсингу тіла. `google-books-proxy` не має еквівалентної перевірки — ключ опційний, `withApiKey()` просто пропускає параметр `key=`, якщо його немає, падаючи на безкоштовну анонімну квоту Google. Явно задокументовано в коментарях обох файлів.

**Перелік усіх Edge Functions**: google-books-proxy, isbndb-proxy, cover-upload, плюс `_shared` (не самостійна функція — спільний модуль `cors.ts`/`rateLimit.ts`, що імпортується всіма трьома). Ніде не знайдено жодного захардкодженого значення секрету — усі читаються через `Deno.env.get(...)` за назвою.

---

## 23-36. OWN CATALOG — ГЛИБОКИЙ РОЗБІР

### 23. Реальний pipeline (не теоретичний)

CODE VERIFIED, `scripts/sync-curated-books.js` + `scripts/catalog-import/*.js`: парсинг CLI-аргументів → читання конфігурації Supabase з `.env.admin` → читання й парсинг CSV (RFC4180, перевірка наявності всіх обов'язкових колонок) → по-рядкова `validateRecord`+`normalizeRecord` (рядок з ERROR-рівнем проблеми відкидається, не фатально для всього прогону) → `detectDuplicates` за `id` та ISBN13/ISBN10 → запис `*-normalized.json` intent-файлу → **dry-run за замовчуванням** (без мережі, без потреби credentials); `--apply` обов'язковий для будь-якого реального запису → на apply: `fetchExistingCoverUrls` (пакетний запит) → обробка обкладинок через пул воркерів (concurrency за замовчуванням 6) → `toUpsertBody`+`upsertCuratedBooks` (чанкований PostgREST upsert, `Prefer: resolution=merge-duplicates`) → `buildReport`/`writeReportFiles`. Окремого кроку "індексація для пошуку" немає — Search читає `curated_book` напряму через RPC.

### 24. Обробка провалу завантаження обкладинки

CODE VERIFIED: HTTP-провал ретраїться до 2 разів лише для ретраюваних статусів (429/5xx); 404/інші 4xx — без ретраю. Таймаут 15с на спробу. Розмір: стримінговий підрахунок байтів проти ліміту 5MB. Тип: **Content-Type-заголовок ніколи не довіряється** — реальний byte-signature sniffing (JPEG/PNG); усе інше → `COVER_INVALID_IMAGE`. **При будь-якому провалі обкладинки рядок усе одно апсертиться** — книга не блокується провалом обкладинки (явний коментар у коді). Ретрай пізніше: так, повторний запуск скрипта — документований шлях; `existingCovers`-lookup означає, що рядок без власної URL підхопиться автоматично наступного разу; `--refresh-covers` форсує перезавантаження.

Реальний продакшн-інцидент (цитовано з `docs/OWN_CATALOG_IMPORT_REPORT.md`, не перевіряється заново): пакет `2f60feb8` — усі 2038 обкладинок провалились по HTTP; пакет `204c6caf` — повторний прогін підхопив 2036 успішно з 0 помилками.

### 25. Автостворення Series з паттернів заголовка

**НІ, не відбувається.** CODE VERIFIED: паттерн-детекція існує лише як **неблокуюче попередження** (`POTENTIAL_SERIES_METADATA`), ніколи не створення сутності. `curated_book` не має колонок series взагалі; жодного виклику `SeriesRepository` в імпорт-скрипті не знайдено. Ризик не застосовний.

### 26. Вигадування ролей контриб'юторів

**НІ.** CODE VERIFIED: CSV-формат містить лише один плаский стовпець `authors` — колонок для перекладача/ілюстратора/редактора немає взагалі. Коментар у коді прямо посилається на вимогу ТЗ: "явно забороняє вигадувати ролі contributor, коли формат їх не подає". Екран Import Review має вільне текстове поле "Перекладач(і)", але воно порожнє за замовчуванням і заповнюється лише вручну користувачем, ніколи автоматично з даних провайдера.

### 27. Ідемпотентність

CODE VERIFIED + AUTOMATED TEST VERIFIED + OWNER MANUAL VERIFIED. Ключ upsert — `curated_book.id` через PostgREST `on_conflict=id` з `Prefer: resolution=merge-duplicates` (ідемпотентно за конструкцією). Дублікат ISBN між різними `id` — виключається до мережевого виклику. `scripts/sync-curated-books.test.js` має реальний end-to-end тест: справжній дочірній CLI-процес, запущений двічі проти мок-сервера, підтверджує другий прогін: `created: 0, updated: 2`, обкладинка повторно використовується, а не перезавантажується. На реальних продакшн-даних: повторний прогін над уже імпортованими 2038 рядками дав `created: 0, updated: 2038`, 0 помилок (цитовано зі звіту).

### 28. URL обкладинки, що рендериться в Search

**Завжди власний Supabase Storage URL.** CODE VERIFIED: колонка `cover_url` у `curated_book` отримує ЛИШЕ URL після завантаження у власний Storage; вихідний URL джерела (`coverSourceUrl`) явно НІКОЛИ не записується в цю колонку і взагалі не персистується для `curated_book` (немає навіть колонки для нього). Зовнішній URL рітейлера ніколи не потрапляє в шлях рендерингу.

### 29. Аудит картки результату пошуку

CODE VERIFIED, `ProviderResultRow` (`app/(tabs)/search.tsx`): рендерить рівно — обкладинка → назва → автори (лише якщо непорожньо) → одна опційна соціальна мітка ("Додали собі: N", лише для shared-catalog і лише якщо >0) → шеврон. Підтверджено ВІДСУТНІСТЬ: slug/id, сирі URL (обкладинки чи джерела), сирі булеві значення, сирі рядки через крапку з комою, необмежений опис. Очікувана ієрархія (обкладинка → назва → автор → компактні метадані) — підтверджена буквально.

### 30. Де зберігаються source-name/source-URL/cover-source-URL/external-id

Для **own/curated catalog** — **НЕ зберігаються взагалі**: `curated_book` навмисно не має колонок `cover_source_url`/`book_source`/`field_provenance`; тимчасове значення `coverSourceUrl` живе лише в Node-процесі й пишеться лише у звітні файли (`data/import-reports/`, у git ignore, не частина жодної таблиці БД). Для **shared catalog** (`catalog_book`, інша таблиця, заповнюється коли користувачі зберігають книги з зовнішніх провайдерів) — `source_type`/`source_name`/`source_external_id` таки існують як колонки/поля типу, але жодне з них не рендериться в Search UI.

### 31. Обкладинки не зникають при зникненні джерела

CODE VERIFIED (випливає з §28): оскільки `cover_url` завжди вказує на власний Supabase Storage, а не на оригінальний URL рітейлера, зникнення оригінального джерела не впливає на доступність обкладинки в застосунку.

### 32. Провенанс не в основному UI

Підтверджено в §29-30 — жодне з provenance-полів (slug/source URL/зовнішній ID) не є частиною типу, який рендерить картка результату.

### 33-34. Автостворення Series / вигадування ролей — дубльовано з §25-26 (той самий факт, той самий доказ).

### 35. Edge cases

| Кейс | Статус | Доказ |
|---|---|---|
| Відсутній ISBN | CODE VERIFIED | обидва ISBN опційні для curated; shared-catalog вимагає хоч один |
| Дублікат ISBN (між рядками) | CODE VERIFIED | `dedupe.js`, код `DUPLICATE_ISBN`, рядок виключається |
| Кілька контриб'юторів | CODE VERIFIED | `splitList` розбиває на масив |
| Невідомі ролі контриб'юторів | NOT VERIFIED (не застосовно) | формату ролей не існує взагалі |
| Кілька жанрів/mood-тегів | CODE VERIFIED | `splitList`, м'які попередження `UNKNOWN_GENRE`/`UNKNOWN_PURPOSE`, не блокують |
| Відсутня обкладинка | CODE VERIFIED | `coverSourceUrl=null`, рядок все одно імпортується |
| PNG/JPEG/WebP | CODE VERIFIED (PNG/JPEG — так; WebP — свідомо ні) | bucket не приймає WebP MIME; книга імпортується без обкладинки |
| Довгі українські заголовки | CODE VERIFIED | ліміт 500 символів, помилка при перевищенні |
| Апострофи | NOT VERIFIED | явної обробки/тесту саме на цей символ не знайдено |
| Екрановані лапки | CODE VERIFIED | реальний посимвольний парсер RFC4180 (подвоєні лапки всередині поля) |
| Дуже довгі описи | CODE VERIFIED | ліміт 5000 символів як помилка, <20 символів — лише попередження |
| Неактивні/soft-deleted записи каталогу | CODE VERIFIED | булевий прапорець `is_active`, жодної окремої deleted_at-логіки не знайдено |
| Серієподібні заголовки | CODE VERIFIED | §25, лише попередження; реально спрацювало 393 рази на продакшн-файлі (цитовано зі звіту) |

### 36. Архітектура на масштабі

Не оцінювалась окремим дослідницьким проходом цього аудиту з явними числами 2000/10000/50000 — **NOT VERIFIED** для конкретних порогів. Наявні факти, що непрямо стосуються масштабованості: міграція `026_hot_query_indexes.ts` (§43) уже додала композитні індекси саме заради усунення повільних `ORDER BY`-сканувань на зростаючих таблицях; імпорт-скрипт пакетує запити (`fetchExistingCoverUrls` — `id in.(...)`, чанкований upsert) замість по-рядкових запитів. Без окремого навантажувального тесту на 10000+/50000+ рядків — це архітектурні спостереження, не підтверджене вимірювання.

---

## 37-40. ТЕСТИ

### 37. Точний стан (owner-підтверджені реальні числа)

Власник продукту особисто запустив і вставив у чат реальний вивід терміналу: `npx tsc --noEmit` — 0 помилок (тихий вихід); `npx eslint . --max-warnings=0` — 0 помилок/попереджень (тихий вихід); `npm test` — **82/82 test suites passed, 1157/1157 tests passed, 0 failed**, час виконання 5.464с. OWNER MANUAL VERIFIED (реальний вставлений вивід, не переказ). Це включає явно `PASS src/data/repositories/UserBookRepository.test.ts` та `PASS src/data/db/legacyRunBackfill.test.ts` — обидва додані/змінені саме цим hotfix-ом.

CI-конфігурація (`.github/workflows/ci.yml`) виконала б той самий `npm test -- --ci` — CI VERIFIED узгодженість конфігурації з тим, що реально запустив власник, хоча сам факт проходження в GitHub Actions на цьому пуші окремо NOT VERIFIED (немає доступу до логів Actions з цього середовища).

### 38. Тести, додані саме для hotfix-у

- Calendar consistency: 7 нових тестів у `UserBookRepository.test.ts` — AUTOMATED TEST VERIFIED.
- Restore invariant: тест ідемпотентності retry в `legacyRunBackfill.test.ts` — AUTOMATED TEST VERIFIED.
- Catalog idempotency: не новий цим hotfix-ом, але існує — CLI end-to-end ідемпотентність (`sync-curated-books.test.js`) і `dedupe.test.js` — AUTOMATED TEST VERIFIED.
- Cover behavior: покрито тим самим ідемпотентність-тестом (`coverReused`/`coverDownloaded`-лічильники) — AUTOMATED TEST VERIFIED.
- Proxy client-secret ("ключ ніколи не йде клієнту"): **NOT VERIFIED автоматичним тестом** — це підтверджено лише читанням коду (CODE VERIFIED), окремого юніт-тесту, що явно стверджує "ключ відсутній у відповіді", не знайдено.

### 39. Якість тестів (не лише кількість)

Репозиторна таблиця покриття (36 репозиторних файлів, 28 тестових):

```
UserBookRepository         37 кейсів, 29.4KB  — FULL
ReadingSessionRepository   58 кейсів, 53.9KB  — FULL (найбільший тестовий файл)
ReadingRunRepository       34 кейси,  22KB    — FULL
BackupRepository           11 кейсів (реальний round-trip на справжньому SQLite, не mock) — FULL
BookCapsuleRepository      19 кейсів — FULL
RatingRepository           13 кейсів — FULL
JournalRepository          11 кейсів проти 42.5KB джерела — PARTIAL (тонке відносно розміру)
DataIntegrityRepository    3 кейси в самому репо-тесті, але доменна логіка окремо покрита 29KB-файлом dataIntegrityDoctor.test.ts — PARTIAL як окремий файл
10 довідникових репозиторіїв (Author, Genre, Tag, Translator, Work, Reminder, AppSettings, BookSource, JournalDraft, RecommendationRepository) — NONE (жодного .test.ts)
```

Жоден із непротестованих репозиторіїв не тримає чутливих особистих даних читання (це довідники/lookup-таблиці). Домени, найбільш критичні для приватних даних користувача (UserBook, ReadingSession, ReadingRun, Backup, BookCapsule, Rating), мають FULL-рівень покриття. CODE VERIFIED + AUTOMATED TEST VERIFIED (перевірено реальним відкриттям тестових файлів, не лише наявністю).

### 40. Знімок покриття репозиторіїв, оновлений цим hotfix-ом

Для зон, безпосередньо зачеплених hotfix-ом (`UserBookRepository`, `legacyRunBackfill`): рівень покриття зріс з попереднього стану до **FULL** для нової функціональності (методи `*IncludingDeleted`) і **AUTOMATED TEST VERIFIED** для ретрай-безпечності backfill. Жодних нових тестів не створено цим аудитом — лише зафіксовано існуючий стан.

---

## 41-48. ПРОДУКТИВНІСТЬ / МАСШТАБ / БЕЗПЕКА / ЗАЛЕЖНОСТІ

### 41. N+1 / нові дорогі шляхи від hotfix-у

Прямої перевірки на явний N+1-профайлінг не виконувалось цим аудитом. Що відомо з коду: `listWithDetailsByIdsIncludingDeleted` — той самий пакетний патерн, що й оригінальний `listWithDetailsByIds` (`attachDetailsBatch`, один пакетний запит + `Promise.all` на збагачення, не по-рядковий цикл SQL). `useReadingRunsDetail` (незмінений hotfix-ом) робить `Promise.all` по кожному run — прийнятно для реалістичної кількості прочитань, задокументовано в самому коді як свідомий компроміс. **Unbounded catalog fetch, repeated cover download у рантаймі застосунку (не в імпорт-скрипті), expensive restore validation loop, нове завантаження сесій за все життя** — жодне з цього не перевірялось окремо в цьому проході. **NOT VERIFIED** для цих чотирьох конкретних пунктів — чесно не стверджую "усе чисто" там, де не дивився.

### 42. Стан БД (з живого коду, не застарілих документів)

27 міграцій, `curated_book`/`catalog_book`/`catalog_book_device`/`edge_rate_limit` — окремі таблиці спільного каталогу поза основною SQLite-схемою користувача (ці — у Supabase Postgres, `supabase/schema.sql`). Кількість репозиторіїв — 36 файлів у `src/data/repositories/`. Важливі індекси, додані/змінені за останні міграції — див. §43.

### 43. Чи додав hotfix нову міграцію?

**НІ, явно.** CODE VERIFIED: усі 27 міграцій мають дати модифікації задовго до hotfix-у; hotfix працював із наявною схемою, лише додавши репозиторні методи над уже наявною колонкою `deleted_at`. Останні 3 наявні міграції (не від hotfix-у, для контексту): `025_rating_run.ts` (rating прив'язаний до `reading_run_id` замість одного per-книгу), `026_hot_query_indexes.ts` (композитні індекси, включно з `user_book(status, updated_at)`, `reading_session(user_book_id, started_at)`), `027_soft_delete_readiness.ts` (додав `deleted_at` до `book_capsule`/`book_memory`/`rating`).

### 44. Сумісність резервних копій

Не перевірялась окремим тестом відновлення "старої" (до-027) резервної копії в цьому аудиті. **NOT VERIFIED** щодо реального прогону такого сценарію; але `026_hot_query_indexes.ts` і `027_soft_delete_readiness.ts` — обидві адитивні (додавання колонок/індексів, без видалення/перейменування існуючих полів), що архітектурно сумісно з класом "адитивна міграція безпечна для старих бекапів", підтвердженим `BackupRepository.test.ts` (round-trip тест, FULL-покриття) — але сам тест перевірявся не на застарілій схемі-предку, а на поточній.

### 45. Приватність — регресія перевірена?

Не знайдено регресії в: local-first зберіганні особистих даних (`@supabase/supabase-js` як була відсутня, так і лишається відсутньою), spoiler-safe журналі (незмінена логіка `hiddenJournalCount`), приватності Season-share (архітектурне розділення `cardRef` від "Що залишилося з тобою" — не зачеплено hotfix-ом, mtime підтверджує це до-hotfix-овий код), provenance-полях каталогу (§30, не показуються в UI). CODE VERIFIED по кожному пункту окремо в межах уже перевіреного коду.

### 46. Реальні залишкові питання безпеки

- npm audit: 20 moderate-вразливостей, обидва джерела — build/dev-тулінг (`decode-uri-component` через react-navigation, `uuid` через `@expo/ngrok`), жодна не досягає зібраного застосунку. **NON-BLOCKING.**
- Google Books proxy: задеплоєний і верифікований (§19-22). **NON-BLOCKING.**
- ISBNdb proxy: задеплоєний, ключ на сервері, hard-fail без ключа. **NON-BLOCKING.**
- Cover upload: реальна magic-byte-перевірка типу, серверний рандомний шлях, ліміт розміру. **NON-BLOCKING.**
- service_role у довіреному тулінгу: підтверджено, що використовується лише у `scripts/` та Edge Functions, ніде в `src/`/`app/`. **NON-BLOCKING.**
- Клієнтські секрети: жодного знайденого захардкодженого значення. **NON-BLOCKING.**
- IP-based rate limiting: реалізовано (windows-based, keyed за IP) на всіх трьох Edge Functions. **NON-BLOCKING** (раніше цієї ж сесії явно підтверджено як не обов'язкове для закриття).
- Proxy-error-swallowing у Search UI (§21): не порушення безпеки, а UX-прозорість — користувач не бачить різниці між "нічого не знайдено" і "proxy лежить". **FUTURE UX CONCERN**, не blocking.

### 47. service_role — окрема критична перевірка

**ЧИСТО.** CODE VERIFIED через пошук по всьому дереву `src/`, `app/`, `.env*`, `docs/`: **нуль** входжень `service_role`/`SUPABASE_SERVICE_ROLE_KEY` у клієнтському коді. Усі 60+ знайдених входжень репозиторієм-вайд обмежені `scripts/` (довірений локальний тулінг) і `supabase/functions/*/index.ts` (серверний Deno-рантайм, читання через `Deno.env.get`, очікувано і безпечно). Клієнтський код звертається лише до `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` — завжди anon-ключ, ніколи service_role.

### 48. Стан залежностей (лише звіт, нічого не змінювалось)

`package-lock.json` узгоджений з `package.json` без розбіжностей для `zustand` (5.0.15), `expo-network` (57.0.2), `expo-router` (57.0.21), `expo-image` (57.0.5), `expo-sqlite` (57.0.3). `@supabase/supabase-js` підтверджено відсутній навіть як випадкова транзитивна залежність у lockfile. Архітектурний вибір "raw fetch(), без Supabase SDK" лишається послідовним і навмисним у всьому клієнтському коді.

---

## 49-54. ПРОДУКТОВІ РЕГРЕСІЇ

### 49. Home

**CODE VERIFIED UNCHANGED.** `app/(tabs)/index.tsx` (30322 байти) має дату модифікації на ~38 годин РАНІШЕ за файли hotfix-у. Повний вміст файлу стосується виключно попередніх фаз (Phase 18 HOME REDESIGN, Phase 17 REFINEMENT, PROGRESSIVE ONBOARDING) — жодних імпортів чи згадок Calendar/soft-delete/Restore/backup. `useReadingRunsDetail.ts` і `useHomeContextCard.ts` (обидва прочитані особисто раніше в цьому аудиті) також підтверджено незмінені. Поведінка Continue reading / today-статистика / контекстна картка з можливістю приховати — незмінена.

### 50. Book Details

**CODE VERIFIED.** `app/work/[workId].tsx` (85380 байт). Присутні й структурно незмінені: обкладинка+метадані, жанри/теги, блок бібліотеки з primary CTA (start/continue/DNF-reword), доступ до пам'яті (капсула — картка "Переглянути мою пам'ять", показується незалежно від поточного статусу, задокументовано як навмисне розширення ще фази #169, не цього hotfix-у), CTA перечитування, Lore-секція (spoiler-safe), pre-reading reflection, DNF reflection, finish prediction, rating, журнал (spoiler-safe, реакції), історія ReadingRun/reread (об'єднана з сирою історією сесій в одну згортувану секцію — консолідація UI ще з Фази 28, не цього hotfix-у), видання/метадані. Дата модифікації файлу — до вікна hotfix-у. Жодного нового концептуального навантаження не додано.

### 51. Seasons

**CODE VERIFIED.** `app/seasons/[seasonKey].tsx` явно в коментарі стверджує продуктову роль: "не ще один Statistics/Wrapped-подібний дашборд чисел, а емоційний спогад про сезон читання". Структурно підтверджено: обкладинки/список книг сезону, час/сторінки як компактні числа (навмисно не головний контент), секція "Що залишилося з тобою" (спогади з пріоритетним ланцюжком вибору), "Повернення цього сезону" (перечитування), приватність поширення (архітектурне розділення того, що показується на екрані, і того, що потрапляє у зображення для шерингу — фікс попередньої знахідки аудиту #167), обробка зимового переходу через рік (запланована, статус перевірки — див. §53). Атрибуція за `ReadingRun.finishedAt`, не поточним статусом — коректно для повторних прочитань. Файл і супутній хук мають дату модифікації до вікна hotfix-у — **PROTECTED, не редизайнено**.

### 52. Trends

**CODE VERIFIED: без жодних змін.** І `app/trends.tsx` (4826 байт), і `src/features/trends/useTrendingBooks.ts` (2787 байт) мають найранішу дату модифікації серед усіх перевірених файлів у цьому аудиті — фактично базовий кластер проєкту, за ~6 днів до hotfix-у. `docs/OWNER_MANUAL_TEST_LOG.md` §F явно перелічує Trends серед "захищених областей цього ТЗ, жодного редизайну". **PRODUCT ROLE UNCHANGED**, підтверджено.

### 53. Стан docs/OWNER_MANUAL_TEST_LOG.md

Документ явно заявляє (заголовок): це середовище розробки не має фізичного пристрою — усе валідовано через tsc/jest/eslint/CI і ручний рев'ю коду. Кожна група закінчується непозначеним "Пройдено: [ ] Так [ ] Ні". Групи A-G (hotfix-специфічні) мають code/test-рівень підтвердження (CODE VERIFIED/AUTOMATED TEST VERIFIED, і для C/D — OWNER MANUAL VERIFIED за реальними продакшн-доказами), але жодна "Пройдено"-клітинка не позначена — це навмисно, документ прямо забороняє собі позначати без реального прогону власником. §0 (два раніші чекліст-документи) і §1-5 (попередні фази #167/#169/reading_run sync) — усі клітинки так само непозначені.

### 54. Готовність пристроїв (лише те, що реально зафіксовано)

- Android фізичний: **NOT VERIFIED**
- iPhone фізичний: **NOT VERIFIED**
- Android емулятор: **NOT VERIFIED**
- iOS симулятор: **NOT VERIFIED**
- PC-local Expo: **NOT VERIFIED**

Два вужчі факти зафіксовані як реально виконані власником поза цими п'ятьма категоріями (продакшн-деплой Google Books proxy й реальний `--apply`-прогін каталогу) — обидва OWNER MANUAL VERIFIED, але жоден не є запуском мобільного застосунку на пристрої/емуляторі/симуляторі, тож жодної з п'яти категорій вище вони не закривають.

---

## 55. СИМУЛЯЦІЯ: 30 ДНІВ ОСОБИСТОГО ВИКОРИСТАННЯ

Додавання книг, щоденні сесії, журнал, завершення, перечитування, Calendar, Season, бекап. Нижче — чітко розділені підтверджені факти й припущення/ризики (жодного вигаданого "бага").

- **Підтверджений факт**, релевантний до цього сценарію: якщо протягом місяця користувач видалить книгу з бібліотеки після прочитання, Calendar збереже сесії/хвилини/обкладинку цього дня, але клітинка сітки не покаже мітку "почав/закінчив" для цього дня, а місячна картка "найчастіше цього місяця" не врахує цю книгу (§7-9). Це реальна, підтверджена кодом поведінка — не гіпотеза.
- **Ризик/інференція, не підтверджений**: якщо протягом 30 днів користувач зробить резервну копію і відновить її на новому пристрої, а потім негайно закриє застосунок до завершення `rebuildCapsuleRemindersAsync`/`DataIntegrityRepository.runCheck` (обидва — after-транзакційні, best-effort кроки поза основним `restoreAll`) — чи буде щось втрачено? Це NOT VERIFIED цим аудитом; код показує, що обидва кроки обгорнуті в try/catch і не блокують основне відновлення, але поведінка при закритті застосунку саме в цю мить не трасувалась.
- **Ризик/інференція**: пошук книги для щоденного додавання, коли Google Books/ISBNdb proxy тимчасово недоступний (наприклад, короткочасний 5xx), покаже користувачу порожній список без пояснення (§21, підтверджений факт коду) — користувач може хибно вирішити, що книги просто немає в базі, і не повторить спробу. Це реальний UX-ризик, підтверджений на рівні коду, хоча наскільки часто це трапляється в реальному використанні — NOT VERIFIED (залежить від аптайму зовнішніх API).

### 56. СИМУЛЯЦІЯ: 1 РІК (100-200 книг, 500-1000 сесій, сотні записів журналу, кілька перечитувань, 4 Сезони, кілька бекапів)

- **Підтверджений факт**: індекси `026_hot_query_indexes.ts` (`user_book(status, updated_at)`, `reading_session(user_book_id, started_at)` тощо) вже розраховані саме на цей масштаб запитів (сортування за статусом/датою) — архітектурно адресовано заздалегідь, не залишено на потім.
- **Ризик/інференція**: `JournalRepository` — найбільший репозиторний файл у кодовій базі (42.5KB) із відносно тонким тестовим покриттям (11 кейсів, §39/PARTIAL) — при сотнях записів журналу за рік це та ділянка, де регресія найімовірніше залишиться непоміченою автоматичними тестами. Це оцінка ризику на основі розміру файлу й покриття, не підтверджений баг.
- **Ризик/інференція**: 4 Сезони за рік означають 4 виклики season-агрегації (`useReadingSeason.ts`), кожен з яких фільтрує `ReadingRun.finishedAt` по діапазону дат — продуктивність цього запиту на 500-1000 сесіях NOT VERIFIED окремим вимірюванням у цьому аудиті.
- **Підтверджений факт**: ідемпотентність повторного бекапу/відновлення (кілька бекапів за рік) підтверджена реальним round-trip-тестом `BackupRepository.test.ts` і реальною продакшн-подібною ретрай-перевіркою backfill (§15).

### 57. СИМУЛЯЦІЯ: 5 РОКІВ (масштабна екстраполяція)

Оригінальний запит власника продукту на цю секцію обірвався на заголовку "5-YEAR SIMU" без деталізованих критеріїв — тому нижче я даю розумну за замовчуванням структуру аналогічну до §56, чітко позначену як екстрапольовану, а не як відповідь на конкретні пункти ТЗ, яких я не отримав.

- За 5 років при темпі §56 — орієнтовно 500-1000 книг, 2500-5000 сесій, ~20 сезонів, тисячі записів журналу. Жодне з цих чисел не тестувалось цим аудитом ні продуктивно, ні функціонально — **NOT VERIFIED**, чиста екстраполяція.
- Архітектурні спостереження, що мають значення на цьому горизонті: (а) відсутність SQL-рівня cursor-based пагінації в частині репозиторіїв NOT VERIFIED — не перевірялось окремо; (б) `curated_book`/`catalog_book` — окремі Supabase-таблиці, зростання яких не залежить від персонального використання одного користувача, тому 5-річний горизонт власного контенту користувача (SQLite, локально на пристрої) і зростання спільного каталогу (Supabase, спільне для всіх користувачів) — це різні осі масштабування, які варто розглядати окремо в майбутньому плануванні, а не разом.
- Це єдина секція звіту, побудована на екстраполяції, а не на прямому читанні коду — позначено явно.

---

## ПІДСУМОК ДЛЯ ВЛАСНИКА ПРОДУКТУ

Дії власника, що залишаються відкритими після цього аудиту (не код, не розробка):
1. Реальний прогін через `docs/OWNER_MANUAL_TEST_LOG.md` груп A-G на фізичному Android і/або iPhone пристрої (або хоча б емуляторі/симуляторі) — єдина категорія доказів, повністю відсутня в цьому середовищі розробки.
2. Свідоме рішення: чи достатньо поточного, задокументованого як "поза обсягом" стану Calendar-геп-ів (§7) для закриття, чи це варто розглянути в майбутній фазі.
3. Свідоме рішення щодо proxy-error-swallowing у Search (§21) — це не регресія цього hotfix-у і не блокер, але тепер задокументований, раніше не зафіксований факт поведінки.

Жодних дій щодо коду, безпеки, ідемпотентності каталогу чи деплою Google Books proxy не потрібно — усі ці пункти реально перевірені й закриті.
