# POLYTSIA V1.6.1 — FULL POST-IMPLEMENTATION AUDIT

**Дата:** 2026-09-14. **Milestone під аудитом:** POLYTSIA V1.6.1 — *Foundation, Reading Runs, UX
Consolidation & Calendar Evolution* (28 фаз, завершено й задокументовано в `CHANGELOG.md`/
`docs/V1_6_1_FINAL_REPORT.md`). **Аудитор:** хмарна сесія Claude (Sonnet 5), без доступу до
реального пристрою/симулятора/npm-реєстру/git-історії власника продукту — усі ці обмеження
явно позначені нижче там, де вони застосовуються.

Це — НЕЗАЛЕЖНИЙ технічний і продуктовий аудит, не додаток до попереднього фінального звіту
(`docs/V1_6_1_FINAL_REPORT.md`). Мета — не "скільки функцій ми додали", а "яким продуктом стала
«Полиця» після V1.6.1, наскільки чисто тепер влаштована її пам'ять про читання, які нові
можливості відкрила architecture і де знаходяться наступні ризики росту". Документ самодостатній
— кожне серйозне твердження має пряму evidence-прив'язку (файл/repository/функція/міграція/тест/
маршрут), а не посилання "дивись інші docs".

## Методологія

**Source of truth, за пріоритетом** (якщо документація суперечить коду — код перемагає,
розбіжність фіксується явно, а не мовчки виправляється): 1) фактичний codebase; 2) SQLite
schema/migrations; 3) repositories; 4) domain layer; 5) tests; 6) CI; 7) routes/screens;
8) Supabase Edge Functions/schema; 9) package.json/lockfile; 10) docs.

**Evidence labels**, використані послідовно по всьому документу:

- `CODE VERIFIED` — підтверджено прямим читанням коду цією сесією.
- `AUTOMATED TEST VERIFIED` — підтверджено існуючим автотестом (Jest, `better-sqlite3`).
- `CI VERIFIED` — підтверджено реальним зеленим прогоном GitHub Actions (скріншот власника
  продукту цього чи попередніх вікон).
- `OWNER MANUAL VERIFIED` — власник продукту РЕАЛЬНО запускав застосунок локально й перевіряв
  конкретну фічу (є textual evidence в `CHANGELOG.md`/докс) — НЕ синонім "власник взагалі іноді
  тестує застосунок"; застосовано вибірково, лише де знайдено конкретний доказ.
- `PHYSICAL DEVICE VERIFIED` — реальний фізичний Android/iPhone чи емулятор/симулятор (НЕ ПК
  власника продукту, не Expo-рантайм на десктопі). За всю історію проєкту — практично завжди
  відсутнє; не плутати з попереднім пунктом.
- `NOT VERIFIED` — не перевірено цією сесією і немає доказу, що перевірено раніше.
- `HYPOTHESIS` — обґрунтоване технічне міркування без прямого підтвердження.

**"НЕ ВИПРАВЛЯТИ ПІД ЧАС АУДИТУ"** — дотримано по всьому документу без винятків: жоден файл
коду в репозиторії не редагувався й не виправлявся в процесі підготовки цього звіту; кожна
знахідка зафіксована як snapshot поточного стану, не як запит на фікс.

**"NO FAKE VERIFICATION"** — по всьому документу свідомо уникнуто тверджень на кшталт "працює
швидко" без бенчмарку, "перевірено на телефоні" коли насправді перевірено лише на ПК власника
продукту, "UX зручний" без manual/use evidence, "міграція безпечна" лише тому, що код виглядає
правильним. Де реальної перевірки не було — використано `NOT VERIFIED`/`HYPOTHESIS` явно,
включно з `§55`/`§56`/`§62` (немає реального бенчмарку/EXPLAIN QUERY PLAN/CVE-списку — прямо
так і написано, а не оцінено "на око").

**Обмеження цієї конкретної сесії** (застосовуються по всьому документу, не повторюються в
кожному розділі): немає доступу до реального пристрою/емулятора/симулятора; немає мережевого
доступу до npm-реєстру (спроба `npm ci` повертає `403 Forbidden`) — отже неможливо самостійно
запустити `npm audit`/живий `jest`/`EXPLAIN QUERY PLAN` цією сесією (усі числа тестів/CI-статус
у цьому звіті — це реальні, живі прогони, виконані ВЛАСНИКОМ продукту на його машині й вставлені
в цю сесію, а не прогони цієї сесії напряму); немає `.git`-репозиторію в отриманому дзеркалі —
історія комітів/хеші недоступні звідси (реальний репозиторій з повною git-історією — на машині
власника продукту, `C:\polytsya-m11`).

---

## 1. EXECUTIVE SUMMARY

### 1.1 Стан репозиторію (CODE VERIFIED)

- **Версія застосунку:** `package.json`/`app.config.ts` — `"version": "0.1.0"` (CODE VERIFIED). Жодного окремого поля на кшталт `APP_VERSION = "1.6.1"` у коді немає — "POLYTSIA V1.6.1" це виключно назва milestone'у в `CHANGELOG.md`/`docs/`, не значення, яке будь-де рендериться користувачу чи потрапляє в бекап (`appVersion` у `backupSerializer.ts` читається з `Constants.expoConfig?.version`, тобто теж було б `"0.1.0"`). Далі в цьому документі використовується мітка **POLYTSIA V1.6.1** — так само, як і в самому репозиторії.
- **Стек:** Expo `~57.0.22`, React Native `0.86.3` (CODE VERIFIED, `package.json`).
- **Маршрути:** 49 файлів `.tsx` під `app/` (CODE VERIFIED, `Glob`), з яких 2 — `_layout.tsx` (не є окремими навігованими екранами) → **47 реально навігованих маршрутів**. Збігається з тим, що зараз стверджує `docs/ARCHITECTURE.md` (оновлено в документаційній фазі V1.6.1 з 44→47).
- **Міграції:** 27 файлів, `001_base_schema.ts` … `027_soft_delete_readiness.ts` (CODE VERIFIED, `Glob` + перевірка послідовності номерів), `LATEST_SCHEMA_VERSION = 27` (`src/data/db/migrationRunner.ts:79`, обчислюється програмно як `migrations[migrations.length - 1].version`, не хардкод-число — тобто структурно не може розійтися з реальною кількістю міграцій).
- **Таблиці SQLite:** **39 унікальних таблиць** у фінальній схемі (CODE VERIFIED — власний підрахунок: `grep -h "CREATE TABLE" src/data/db/migrations/*.ts`, з винятком `*_new` тимчасових rebuild-таблиць з міграцій 002/003/007/021/022/024/025, які завжди перейменовуються назад на оригінальну назву й не є окремою постійною таблицею). Повний список: `app_settings, author, book_capsule, book_memory, book_recommendation_shown, book_source, capsule_recall, dnf_reflection, edition, edition_translator, field_provenance, genre, journal_draft, journal_lore_link, loan, lore_entity, note, note_category, owned_book, pre_reading_reflection, publisher, quote, rating, reading_goal, reading_progress, reading_run, reading_session, reminder, series, series_entry, shelf, shelf_book, tag, tagged_item, translator, user_book, work, work_author, work_genre`. Для довідки: попередній аудит (`V1_6_FULL_AUDIT_REPORT.md`, розділ "Повна схема таблиць") нарахував 37 таблиць на момент V1.6 — різниця (+2) це `reading_run` (Фаза 6, `019_reading_run.ts`) і... насправді при перерахунку тих самих 37 у нову методологію (без `_new`) різниця точно не воюється лінійно, тож варто довіряти свіжому прямому підрахунку (39), а не арифметиці "37+1". `BackupRepository.BACKUP_TABLE_ORDER` містить 38 з цих 39 — не бекапиться лише `app_settings` (пристрій-специфічні налаштування, не користувацькі дані).
- **Репозиторії:** 36 файлів під `src/data/repositories/*.ts`, без `.test.ts` (CODE VERIFIED, `Glob`).
- **Domain/lib-модулі:** 64 файли під `src/lib/*.ts`, без тестів (CODE VERIFIED, `Glob`).
- **Тестові файли:** 57 (CODE VERIFIED, `Glob` по `**/*.test.ts(x)`).
- **Тести:** **813 passed, 0 failed, 64 test suites** — **AUTOMATED TEST VERIFIED двома незалежними реальними прогонами `npm test`** на машині власника продукту (не лише цитата з CHANGELOG — це прямо зафіксовано в останньому записі CHANGELOG як "підтверджено вдруге, живим прогоном, а не лише цитатою").
- **CI:** GitHub Actions, `.github/workflows/ci.yml`, два job'и — `ci` (typecheck/lint/test/`npm audit --audit-level=high` advisory) і `edge-functions` (`deno check`/`deno lint` для `supabase/functions/**`). **CI VERIFIED зелений** на runs #83-#86 (скріншоти власника продукту, обидва job-чекмарки зелені, Status: Success). **Невирішена косметична аномалія**, яку варто дослідити окремо: в усіх цих ранах панель "Annotations" GitHub Actions показує "1 error and 2 warnings" / "Process completed with exit code 1" попри зелений Status і зелені чекмарки обох job'ів — трактується як некритичне (стабільний патерн через багато ранів), але залишається невиясненим DX-артефактом (можливо — related до `continue-on-error: true` кроку `npm audit`/`expo-doctor`, що технічно завершується з ненульовим exit code, але не валить job; це HYPOTHESIS, не перевірено предметно в межах цього аудиту).
- **Edge Function CI:** зелений, і, згідно `docs/EDGE_FUNCTION_CI.md`, **блокуючий** (а не advisory) — на відміну від `npm audit`-кроку. Перший реальний прогін (CI run #80) одразу впіймав справжню помилку типів (`TS2769` в `cover-upload/index.ts`, виправлено тим же PR — Фаза 25 (виправлення)) — це саме та верифікація, яку раніше (per V1.6 audit, розділ 26.7) взагалі не можна було зробити локально чи автоматично.
- **Backup schema version:** `MIN_COMPATIBLE_BACKUP_SCHEMA_VERSION = 1` (`src/lib/backupSerializer.ts:68`); нинішня `LATEST_SCHEMA_VERSION = 27` (БД-міграції, окрема шкала від backup-версії — бекап несе власний `schemaVersion`, наразі теж `1`, бо жодної data-міграції формату бекапу поки не було потрібно). Це дві РІЗНІ версійні шкали (`docs/BACKUP_FORMAT.md`), не плутати одну з одною.
- **Останній перевірений коміт/хеш:** **NOT VERIFIED / недоступно з цієї (хмарної) сесії** — `git status` у цьому мирроварі повертає "not a git repository", жодного доступу до історії комітів немає. Реальний репозиторій з повною git-історією живе на машині власника продукту (`C:\polytsya-m11`).

### 1.2 Вердикти по областях

| Область | Вердикт | Обґрунтування (з міткою доказовості) |
|---|---|---|
| Core Reading | READY | Транзакційне ядро `ReadingSessionRepository` (start/pause/resume/finish/discard) тепер має 23 прямих тести (Фаза 5) — AUTOMATED TEST VERIFIED. Реальний прогін на пристрої — не задокументований прямо для цього флоу конкретно, NOT VERIFIED. |
| ReadingRun / Rereading | READY WITH LIMITATIONS | Найбільша структурна прогалина попереднього аудиту (розділ 23) закрита восьмифазним ланцюжком (Фази 6-12) — CODE VERIFIED, `019_reading_run.ts` … `025_rating_run.ts`, 96 нових тестів по ланцюжку. Обмеження: жоден екран не викликає `ReadingRunRepository.discard()` (заготовлений з Фази 6, підтверджено CODE VERIFIED у документаційній фазі), backfill legacy-даних — best-effort з відомою втратою інформації для книг зі старим статусом `rereading` (задокументовано, не прихована). |
| Library | READY WITH LIMITATIONS | Фаза 28 знайшла й виправила реальний UI-баг лічильника книг на полиці (soft-delete не враховувався) і "застряглий" статус у quick actions — AUTOMATED TEST VERIFIED (3 нових тести `ShelfRepository.test.ts`). Пошук/фільтр за жанром і лічильник активних фільтрів і далі свідомо відкладені (`docs/LIBRARY_UX.md`). |
| Home | READY WITH LIMITATIONS | Фази 14/16/17/18 послідовно консолідували навігацію й додали progressive disclosure/empty-state/onboarding-підказки — CODE VERIFIED по кожній фазі. Реальна перевірка "чи новий користувач справді менше губиться" — OWNER MANUAL VERIFIED лише частково (власник тестує функціонально, не UX-дослідженням на реальних нових користувачах). |
| Calendar | READY | Повний редизайн (Фаза 19) закриває задокументований з Milestone 0 розрив між наміром і реалізацією; Фаза 28 (повторний UI-аудит) не знайшла жодної проблеми в Календарі — CODE VERIFIED + 20 нових тестів. |
| Journal | READY WITH LIMITATIONS | Spoiler-safe тепер покриває Personal Search/Global Journal/Activity History (Фаза 3, AUTOMATED TEST VERIFIED) — але це та сама область, де вже раз знайшли 6 реальних leak'ів; периметр великий (10+ поверхонь), регресійний ризик у майбутньому лишається структурно високим (HYPOTHESIS). |
| Book Memory | READY WITH LIMITATIONS | Gating замінено на `hasAnyMemoryData` (Фаза 13) — CODE VERIFIED, `app/memory/[workId].tsx:468`. Найважливіша crossover-знахідка попереднього аудиту (§42.3, spoiler leak саме на цьому екрані) закрита тим же Фазою 3. |
| Capsule / Recall | READY WITH LIMITATIONS | Прив'язка до `reading_run` (Фаза 10) закриває задокументоване обмеження "капсула не пропонується для перечитування" — CODE VERIFIED, 12 нових тестів. Recall UI (`useCapsuleRecallHistory`) вперше отримав реального споживача лише в Фазі 13 — довго була "заготовкою без UI". |
| Spoiler Safety | READY WITH LIMITATIONS | 6 реальних, підтверджених CODE VERIFIED leak'ів (Personal Search, Global Journal, Activity History, On This Day, Book Memory/JournalTimeline, Recall/Capsule) закриті Фазою 3, з regression-тестами. Не покриті цим циклом і не згадані окремою фазою: Reading Seasons `journalHighlight` і `app/session/[sessionId].tsx` (менш критичні дрібні спостереження з попереднього аудиту) — статус цих двох конкретно NOT VERIFIED у CHANGELOG V1.6.1 (докладніше — розділ 3 нижче). |
| Recommendations | READY WITH LIMITATIONS | Навігаційна консолідація (Фаза 14, `/next-read`) — жоден із трьох алгоритмів не видалений і не об'єднаний, лише IA. Дублювання логіки підбору лишається архітектурним, свідомим рішенням, не прогалиною. |
| Analytics | READY WITH LIMITATIONS | Навігаційна консолідація (Фаза 15, `/my-reading`) + реальне підняття 5 дубльованих чистих функцій у `readingAggregates.ts` (17 нових тестів) — це вже не лише IA, а й усунення реального дублювання коду, на відміну від Recommendations. |
| Backup | READY WITH LIMITATIONS | Критична прогалина (Фаза 27: `reading_run` взагалі не потрапляв у бекап з моменту своєї появи) знайдена й закрита в тому ж milestone'і, з legacy-backfill після restore. Privacy-попередження перед "Поділитися" додане (Фаза 21). Формат лишається **незашифрованим plaintext JSON** — свідоме рішення поза скоупом цього milestone'у, задокументований залишковий ризик. |
| Security | READY WITH LIMITATIONS | Google Books ключ прибрано з клієнта (Фаза 4, проксі за тим самим патерном, що й ISBNdb раніше) — закриває останню 🟡-знахідку з `EXPO_PUBLIC_*`-таблиці попереднього аудиту. Edge Functions тепер під CI (Фаза 25). `npm audit` тепер реально виконується в CI (Фаза 25) — раніше стан цього розділу був суцільний NOT VERIFIED. |
| Performance | READY WITH LIMITATIONS | Перший реальний бенчмарк на справжньому SQLite з детермінованою фікстурою (1000 книг/5000 сесій/10000 записів) — Фаза 24, 5 нових індексів, `EXPLAIN QUERY PLAN` до/після задокументовано. Свідомо не покрито: `reading_session(ended_at)`, індекси на `deleted_at`. |
| Accessibility | PARTIAL | reduceMotion тепер реально споживається (Фаза 22, `useReducedMotionAnimationType.ts`), `ReadingProgressBar` отримав `accessibilityRole="progressbar"`. Але реальна перевірка з VoiceOver/TalkBack — і досі **NOT VERIFIED**, як і в попередньому аудиті; це не змінилось цим milestone'ом. |
| Offline UX | READY WITH LIMITATIONS | Задокументований з `LOCAL_FIRST.md`, але НІКОЛИ не підключений намір (попередній аудит, §39.1) — реалізовано Фазою 20 (`expo-network`, `useIsOffline`, `OfflineNotice`), CODE VERIFIED. Retry-черга свідомо не додана. |
| Testing | READY WITH LIMITATIONS | 813/813, 0 known gaps у критичному `ReadingSessionRepository` (був "найважливішою прогалиною" — закрито Фазою 5). Лишається 13 репозиторіїв з класифікацією `NONE` за методологією попереднього аудиту (не всі — низькоризикові CRUD-довідники типу `GenreRepository`/`TagRepository`, це не було перевірено повторно в межах цього циклу). |
| V2 readiness | PARTIAL | Soft-delete тепер і на `book_capsule`/`book_memory`/`rating` (Фаза 26) — закриває конкретну прогалину попереднього аудиту. Але `deviceId` і далі не заготовка під auth-акаунт, і жодної нової роботи в напрямку sync/auth цей milestone не робив (свідомо, поза скоупом). |

---

## 2. V1.6 → V1.6.1 ДИФФ

**Примітка щодо нумерації фаз.** `CHANGELOG.md` містить рівно 28 пронумерованих записів "POLYTSIA V1.6.1, Фаза N" (N = 1…28), плюс два додаткові підрозділи без власного номера: **Фаза 6b** (продовження Фази 6, того самого дня) і **"Фаза 25 (виправлення)"** (CI-знахідка одразу після Фази 25, той самий день) — обидва трактуються нижче як частина відповідної основної фази, а не окремі 29-та/30-та фази. Окрема нумераційна дивність: **у самому файлі запис "Фаза 2" (legacy `/characters`) фізично йде ПІСЛЯ запису "Фаза 1" (P0-фікс `did_not_finish`)**, обидва датовані 2026-09-13, і сам текст запису Фази 2 прямо каже "Перше з фаз milestone V1.6.1" — тобто Фаза 2 хронологічно передувала Фазі 1 в роботі, хоч і має вищий номер у ТЗ. Порядок нижче — за зростанням номера фази (не за порядком у файлі), для читабельності.

Milestone має ще два підсумкові записи без номера фази взагалі: "документація + фінальний звіт" і "фінальний quality gate + owner acceptance checklist" — вони НЕ описані як окремі фази нижче (це post-milestone робота), лише згадуються в EXECUTIVE SUMMARY й тут: **813 тестів** підтверджено двома реальними прогонами `npm test`, додано `docs/FINAL_OWNER_ACCEPTANCE_FLOW.md` (34-пунктовий ручний прийомний сценарій, який жодна хмарна сесія виконати не може) і виправлено реальні розбіжності документації з кодом (44→47 маршрутів в `ARCHITECTURE.md`, каскад-примітки `BOOK_CAPSULES.md`/`RECALL.md` під soft-delete Фази 26, застарілий spoiler-safe абзац `READING_MEMORY.md`).

### Фаза 1 — P0 fix: "Не дочитав" більше не лишає хибну дату завершення

- **Заплановано:** підтверджений дефект з повного аудиту V1.6 (розділ 13) — перехід `finished → did_not_finish` не скидав `user_book.finished_at`.
- **Реалізовано:** `UserBookRepository.updateStatus` тепер завжди явно скидає `finished_at` у `null` при переході в `did_not_finish`, незалежно від попереднього значення. Data Doctor — новий check `dnf_with_finished_at` для успадкованих "брудних" записів (без destructive auto-fix).
- **Відхилення від специфікації:** немає — точковий фікс саме такий, яким і описаний в аудиті-джерелі.
- **Свідомо пропущено:** повноцінна модель історії читання (окремий `finishedAt`/`abandonedAt` на кожен цикл) — прямо визнано, що це прийде разом із ReadingRun (Фази 6+ того самого milestone), не тут.
- **Файли:** `src/data/repositories/UserBookRepository.ts`, `src/domain/dataIntegrityDoctor.ts`.
- **Міграція:** немає (зміна поведінки коду, не схеми).
- **Тести:** +2 `UserBookRepository.test.ts`, +2 `dataIntegrityDoctor.test.ts` (загальний лічильник по фазі не наведено в CHANGELOG).
- **Відоме обмеження:** мінімальний point-fix, не ретроактивна модель — старі "брудні" записи потребують ручного Data Doctor запуску, автоматично не виправляються.

### Фаза 2 — legacy `app/characters/*` маршрути: підтверджено видалені

- **Заплановано:** аудит V1.6 (розділ 3-4) фіксував `app/characters/[workId].tsx` і `[entityId].tsx` як мертві, але фізично присутні й досяжні deep-link'ом маршрути-дублікати `app/lore/*`, без spoiler-safe фільтрації.
- **Реалізовано (за текстом CHANGELOG):** "Перевірено напряму на пристрої (`device_list_dir`): обох файлів більше не існує — `app/characters/` відсутній повністю." Виправлено застарілий коментар у `src/features/lore/useLoreEntities.ts`.
- **⚠️ Розбіжність, знайдена цим аудитом (CODE VERIFIED, суперечить твердженню CHANGELOG):** у мирроварі репозиторію, що аудитується прямо зараз (`/mnt/user-data/uploads/polytsya-m11`), **обидва файли фізично присутні** — `app/characters/[workId].tsx` (163 рядки) і `app/characters/[workId]/[entityId].tsx` (321 рядок), обидва з реальним, невипотрошеним вмістом (не заглушки). Жодного `router.push`/`Link` на `/characters/...` в іншому коді дійсно немає (це підтверджується) — але сам факт присутності файлів прямо суперечить формулюванню "обох файлів більше не існує", перевіреному "напряму на пристрої". Найімовірніше пояснення: `device_list_dir`-перевірка була зроблена на РЕАЛЬНІЙ машині власника продукту (`C:\polytsya-m11`), а цей завантажений мирровар — знімок з іншої точки часу/гілки, що не відображає те саме видалення. Але з точки зору "що фактично можна перевірити в артефакті, який аудитується" — це не FIXED, а **розбіжність між задокументованим і фактичним станом**, і вартий явного OWNER ACTION ITEM: підтвердити, що файли справді видалені в реальному робочому репозиторії, а не лише в момент, коли писався цей запис CHANGELOG.
- **Файли:** `src/features/lore/useLoreEntities.ts` (коментар); `app/characters/*` (заявлено видалені).
- **Міграція:** немає.
- **Тести:** жодних (немає тестів, що посилались на видалені файли, за текстом CHANGELOG).
- **Відоме обмеження:** див. розбіжність вище — детальніше в розділі 3 цього документа ("old `/characters` routes").

### Фаза 3 — централізована spoiler-safe policy: закрито 6 реальних витоків спойлерів

- **Заплановано:** повторна перевірка коду підтвердила знахідки попереднього аудиту (розділ 12) — spoiler-safe режим фактично працював лише на 3 однокнижних екранах, усе, що показує записи БАГАТЬОХ книг одразу, і "Цей день" зі своєю старою евристикою, не перевіряли spoiler-safe стан взагалі.
- **Реалізовано:** централізація в `src/lib/spoilerSafe.ts` (`isAheadOfCurrentProgress` стала спільною; новий шар `SpoilerSafeBookContext`/`deriveSpoilerContext`/`isSpoilerHidden`). Закрито 6 реальних leak'ів: Personal Search (`JournalRepository.searchFeed`), Global Journal (`listFeedPage`), Activity History (`listRecent`, лише для 2 з 8 типів подій, що несуть текст), On This Day (реальний баг — ігнорував `user_book.spoilerSafeEnabled`), Book Memory/картка-спогад/`JournalTimeline` (`app/memory/[workId].tsx` не мав жодного фільтра), Recall/Capsule (крайовий випадок редагування "запис, що ЗБЕРІГАЄТЬСЯ, рахується з нефільтрованого списку навмисно").
- **Відхилення від специфікації:** немає — прямо відповідає й закриває POTENTIAL LEAK #2/#3 і "дрібніше спостереження" (On This Day) з попереднього аудиту.
- **Свідомо пропущено:** Season cards/Fingerprint — NOT APPLICABLE (жодних текстів записів там немає). Дрібніші спостереження попереднього аудиту — `SeasonCardPreview`/`journalHighlight` і `app/session/[sessionId].tsx` — у тексті Фази 3 явно НЕ згадані серед закритих 6 leak'ів (див. розділ 3 нижче).
- **Файли:** `src/lib/spoilerSafe.ts`, `src/data/repositories/JournalRepository.ts`, `src/data/repositories/ActivityHistoryRepository.ts`, `src/lib/onThisDay.ts`/`useOnThisDay.ts`, `app/memory/[workId].tsx`, `app/recall/[workId].tsx`, `app/capsule/[workId].tsx`, `app/capsule/[workId]/edit.tsx`.
- **Міграція:** немає.
- **Тести:** нові кейси в `spoilerSafe.test.ts`, `JournalRepository.test.ts`, `ActivityHistoryRepository.test.ts` (точна кількість не наведена одним числом у CHANGELOG).
- **Відоме обмеження:** периметр spoiler-safe лишається великим (10+ поверхонь) — закрито 6 конкретних, підтверджено НЕ закрито (чи принаймні не згадано) мінімум 2 дрібніші з попереднього аудиту.

### Фаза 4 — ключ Google Books прибрано з клієнта (security-проксі)

- **Заплановано:** знахідка 🟡 `docs/SECURITY.md`/аудиту (розділ 26/32) — `EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY` компілювався в клієнтський бандл.
- **Реалізовано:** новий `supabase/functions/google-books-proxy/` (Deno Edge Function, той самий rate-limiting механізм, що вже був у `isbndb-proxy`); `src/data/remote/googleBooksProxyClient.ts`; `GoogleBooksProvider.ts` більше не читає ключ з клієнта, два шляхи (проксі увімкнено / прямий анонімний виклик без ключа).
- **Відхилення від специфікації:** свідома архітектурна відмінність від ISBNdb-патерну — Google Books НЕ вимикається без проксі (лише втрачає підвищену квоту), бо безкоштовний і має робочий fallback; правило "DO NOT SILENTLY CHANGE PRODUCT BEHAVIOR" прямо назване причиною.
- **Свідомо пропущено:** нічого нового не додано понад заплановане.
- **Файли:** `supabase/functions/google-books-proxy/`, `src/data/remote/googleBooksProxyClient.ts`, `src/data/providers/GoogleBooksProvider.ts`, `.env.example`, `docs/SECURITY.md`, `docs/BOOK_PROVIDERS.md`.
- **Міграція:** немає (Edge Function, не схема БД).
- **Тести:** не вказано явним числом у CHANGELOG (найімовірніше 0 нових Jest-тестів — Edge Function код поза Jest/tsc/ESLint scope, той самий висновок, що й Фаза 25-fix).
- **Відоме обмеження:** **OWNER ACTION REQUIRED, явно позначено в CHANGELOG** — `supabase functions deploy google-books-proxy` і опційний `supabase secrets set` НЕ виконані в цій сесії (немає доступу до Supabase CLI з хмарного середовища). Тобто сам код написаний, але чи РЕАЛЬНО задеплоєний і активний у продакшені — NOT VERIFIED з жодної сесії дотепер.

### Фаза 5 — прямі тести на транзакційну серцевину ReadingSession

- **Заплановано:** аудит V1.6 (розділ 31) назвав `ReadingSessionRepository` "найважливішою прогалиною покриття у всьому списку" — 0 прямих тестів на `start`/`pause`/`resume`/`finish`/`discard`.
- **Реалізовано:** 23 нові тести, продуктовий код НЕ змінювався. Покрито: `start`, `getActiveSession` (включно з крайовими випадками кількох незавершених сесій), `pause`/`resume` (повторний pause без resume, resume без активної паузи, на вже завершеній сесії), `finish` (атомарність трьох записів в одній транзакції, ідемпотентність, **відкат при помилці всередині транзакції** — через `jest.spyOn`-симуляцію збою), тривалість/паузи включно з "background timestamps", невалідна сторінка (`endPage: -5`, задокументована наявна поведінка), `discard`, поведінка при `rereading`/м'якому видаленні книги.
- **Відхилення від специфікації:** немає.
- **Свідомо пропущено:** нічого — фаза явно окреслена як "лише тести".
- **Файли:** `src/data/repositories/ReadingSessionRepository.test.ts` (новий за обсягом вміст, не новий файл).
- **Міграція:** немає.
- **Тести:** +23 (599 → 622).
- **Відоме обмеження:** покриває код "як є", включно з задокументованою (не завжди інтуїтивною) поведінкою на кшталт затискання `current_page` до 0 при негативному `endPage` — не виправляє нічого, лише фіксує контракт.

### Фаза 6 — ReadingRun: нова сутність для REREADING MODEL

- **Заплановано:** аудит V1.6 (розділ 23, "REREADING MODEL — критичний розділ") назвав відсутність окремої сутності "прочитання" найбільшою структурною прогалиною архітектури.
- **Реалізовано:** нова таблиця `reading_run` (`run_number`, `status` — `in_progress`/`finished`/`did_not_finish`, `is_legacy_backfill`, `deleted_at`); `src/types/readingRun.ts` (Zod-схема); `ReadingRunRepository` (`getById`, `listByUserBookId`, `getActiveByUserBookId`, `start`, `finish` — ідемпотентний, `discard`); 14 нових тестів.
- **Відхилення від специфікації:** немає — фаза явно й навмисно **лише сама сутність, нуль зміни продуктової поведінки** (жоден інший файл коду її не викликає).
- **Свідомо пропущено:** будь-яке підключення (сесії/спогади/капсули) — прямо заплановане на наступні фази 6b, 7-12.
- **Файли:** `src/data/db/migrations/019_reading_run.ts`, `src/types/readingRun.ts`, `src/data/repositories/ReadingRunRepository.ts` (+`.test.ts`), `docs/READING_RUN.md` (новий).
- **Міграція:** `019_reading_run.ts` (schema v19).
- **Тести:** +14 (622 → 636).
- **Відоме обмеження:** без жорсткого DB-обмеження "лише один `in_progress` run на книгу" — свідома "graceful"-філософія, не помилка.

### Фаза 6b — reading_run_id + legacy backfill (REREADING MODEL)

- **Заплановано:** продовження Фази 6 того самого дня — (1) `reading_session.reading_run_id`, (2) backfill legacy-даних.
- **Реалізовано:** `020_reading_run_backfill.ts` — nullable `reading_run_id` на `reading_session` без SQL `REFERENCES` (свідомо, той самий урок, що з `008_note_category.ts`/`002_book_source_isbndb.ts` — FK з `ON DELETE SET NULL` через `ALTER TABLE` мовчки обнулив би значення при майбутньому rebuild `reading_run`); процедурний (не чистий SQL) backfill в TypeScript — єдина така міграція проєкту, best-effort щонайбільше ОДИН `reading_run` на існуючу книгу (`run_number = 1`, `is_legacy_backfill = 1`).
- **Відхилення від специфікації:** немає.
- **Свідомо пропущено:** відтворення КІЛЬКОХ старих перечитувань для книг зі статусом `rereading` — прямо задокументована й визнана втрата інформації (неможливо реконструювати з наявних даних), не помилка.
- **Файли:** `020_reading_run_backfill.ts`, `src/types/readingSession.ts`, `ReadingSessionRepository.ts`.
- **Міграція:** `020_reading_run_backfill.ts` (schema v20).
- **Тести:** +6 (622 → 636... тексту вказано "636 → 642" — фактично 6 нових у `migrationRunner.test.ts`, разом з Фазою 6 сумарно `622→642`).
- **Відоме обмеження:** нові сесії (`start()`) і надалі СВІДОМО створюються з `readingRunId: null` — реальне підключення нового старту до конкретного run залишено Фазі 7.

### Фаза 7 — run-aware sessions (REREADING MODEL)

- **Заплановано:** третя частина REREADING MODEL — реальний (не заднім числом) старт/завершення run прив'язаний до дій користувача.
- **Реалізовано:** `UserBookRepository.updateStatus` — єдина точка входу зміни статусу тепер прив'язує старт/завершення `reading_run` до переходу (`reading`/`rereading` без активного run → `start`; `paused` не створює новий; `finished`/`did_not_finish` → `finish`, ідемпотентно; одна транзакція). `ReadingSessionRepository.start` — нова сесія ЗАВЖДИ прив'язується до `reading_run_id` (до активного, або створює новий сама).
- **Відхилення від специфікації:** `UserBookRepository.addToLibrary` **свідомо НЕ підключено** — конфлікт з `useImportGoodreadsCsv.ts`, який перезаписує `started_at` реальною історичною датою одразу після `addToLibrary`; підключення тут дало б run з хибною датою старту.
- **Свідомо пропущено:** див. вище (`addToLibrary`).
- **Файли:** `UserBookRepository.ts`, `ReadingSessionRepository.ts`.
- **Міграція:** немає (нова поведінка коду над уже наявною схемою).
- **Тести:** +10 (642 → 652).
- **Відоме обмеження:** книги, додані через імпорт Goodreads CSV, і далі без `reading_run` — свідоме, не забуте.

### Фаза 8 — Book Memory прив'язана до reading_run (REREADING MODEL)

- **Заплановано:** `book_memory` мала `UNIQUE(user_book_id)` — другий спогад при перечитуванні безповоротно перезаписував перший (аудит V1.6, розділ 23, п.5).
- **Реалізовано:** `021_book_memory_run.ts` — rebuild-міграція (SQLite не підтримує ALTER для зміни UNIQUE), `UNIQUE(user_book_id)` → `UNIQUE(reading_run_id)`; JS-backfill (найновіший `finished`/`did_not_finish` run, інакше найновіший run, інакше `NULL`); `ReadingRunRepository.getLatestByUserBookId`; `getByUserBookId`/`.upsert` → `.getCurrent`/`.upsertCurrent`.
- **Відхилення від специфікації:** немає.
- **Свідомо пропущено:** екран перегляду ІСТОРІЇ спогадів попередніх run — прямо відкладено на Фазу 12.
- **Файли:** `021_book_memory_run.ts`, `BookMemoryRepository.ts`, `ReadingRunRepository.ts`.
- **Міграція:** `021_book_memory_run.ts` (schema v21).
- **Тести:** +16 (652 → 668).
- **Відоме обмеження:** UI (`useBookMemory.ts`) не змінено — форма виклику та сама, отже користувач не бачить явно "це спогад саме цього прочитання" до Фази 12/13.

### Фаза 9 — Before/After прив'язане до reading_run (REREADING MODEL)

- **Заплановано:** та сама проблема, дзеркалить Фазу 8 для `pre_reading_reflection` (аудит V1.6, розділ 23, п.6).
- **Реалізовано:** `022_pre_reading_reflection_run.ts` (той самий `_new`+`DROP`+`RENAME` ідіом); `getByUserBookId`/`.upsert` → `.getCurrent`/`.upsertCurrent`; **`canEditPreReadingReflection`** розширено з `status === 'reading'` на `'reading' || 'rereading'` — закриває задокументоване обмеження "перечитування не могло записати нове 'до'".
- **Відхилення від специфікації:** немає.
- **Свідомо пропущено:** нічого нового понад заплановане.
- **Файли:** `022_pre_reading_reflection_run.ts`, `PreReadingReflectionRepository.ts`, `src/lib/beforeAfter.ts`.
- **Міграція:** `022_pre_reading_reflection_run.ts` (schema v22).
- **Тести:** +11 (668 → 679).
- **Відоме обмеження:** те саме, що Фаза 8 — динамічна ре-резолюція `getCurrent`, не фіксований раз-назавжди підхід.

### Фаза 10 — Capsule/Recall прив'язані до reading_run (REREADING MODEL)

- **Заплановано:** `book_capsule` капсула першого прочитання назавжди блокувала пропозицію нової капсули після перечитування (задокументоване обмеження `docs/BOOK_CAPSULES.md`).
- **Реалізовано:** `023_book_capsule_run.ts` — на відміну від Фаз 8/9, **проста `ALTER TABLE ADD COLUMN`** (без rebuild — `book_capsule` ніколи не мала `UNIQUE(user_book_id)`); JS-backfill з ІНШИМ алгоритмом, ніж Фази 8-9 (книга могла мати КІЛЬКА legacy-капсул, кожна бекфіляться окремо, найближчий "знизу" run); `getByReadingRunId`/`getCurrent` співіснують поруч зі старим `getByUserBookId` (НЕ замінюють — перший реальний UI-кейс, де стара капсула має лишатись доступною завжди, на відміну від Фаз 8-9); новий блок "Це прочитання ще без власної капсули" на `app/memory/[workId].tsx`+`app/completion/[workId].tsx`.
- **Відхилення від специфікації:** архітектурно відрізняється від Фаз 8-9 навмисно — капсула НЕ "найновіша=поточна", фіксує СВОЄ прочитання назавжди, не ре-резолвиться щоразу (пряма протилежність підходу спогаду/before-after).
- **Свідомо пропущено:** нічого нового понад заплановане.
- **Файли:** `023_book_capsule_run.ts`, `BookCapsuleRepository.ts`, `src/features/memory/useBookCapsule.ts`, `app/memory/[workId].tsx`, `app/completion/[workId].tsx`, `app/capsule/[workId]/edit.tsx` (новий `newRun` search-параметр).
- **Міграція:** `023_book_capsule_run.ts` (schema v23).
- **Тести:** +12 (679 → 691).
- **Відоме обмеження:** UI-адитивна зміна (новий блок поряд зі старим переглядом), нічого не приховано.

### Фаза 11 — DNF прив'язаний до reading_run (REREADING MODEL)

- **Заплановано:** `dnf_reflection` мала `UNIQUE(user_book_id)` — щонайбільше один DNF-знімок на книгу за все життя.
- **Реалізовано:** `024_dnf_reflection_run.ts` — rebuild (`UNIQUE(user_book_id)` → `UNIQUE(reading_run_id)`), backfill-логіка ВІДРІЗНЯЄТЬСЯ від Фаз 8/9: кандидатом рахується ЛИШЕ `did_not_finish`-run (жодного фолбеку на "найновіший run узагалі" — прив'язка DNF-знімка до `finished`-run архітектурно неможлива); `getByUserBookId` → `.getCurrent` (перейменовано, НЕ додано паралельно, на відміну від капсули Фази 10 — тут немає окремого UI-кейсу "показати старий запис попри новий run").
- **Відхилення від специфікації:** немає, узгоджено з архітектурним обмеженням DNF.
- **Свідомо пропущено:** нічого нового понад заплановане.
- **Файли:** `024_dnf_reflection_run.ts`, `DnfReflectionRepository.ts`.
- **Міграція:** `024_dnf_reflection_run.ts` (schema v24).
- **Тести:** +9 (691 → 700).
- **Відоме обмеження:** книга, покинута вдруге, отримує окремий знімок; старий лишається доступним через `getByReadingRunId`, але UI (`DnfReflectionSection`) не отримав нового блоку для перегляду історії — це прийшло разом з Фазою 12 екраном "Історія прочитань".

### Фаза 12 — Rating прив'язаний до reading_run; Reread UX + порівняння прочитань (REREADING MODEL, завершено)

- **Заплановано:** восьма й остання частина REREADING MODEL — три частини: (1) `rating` (архітектурна прогалина, виявлена ЛИШЕ в цій фазі — жодна з Фаз 6-11 і навіть попередній повний аудит її не торкались/не згадували), (2) явний CTA "Перечитати", (3) два нові UI-екрани.
- **Реалізовано:** `025_rating_run.ts` (дзеркалить 021/022, НЕ 024 — `UNIQUE(reading_run_id)`, рейтинг може стосуватись і `finished`, і `did_not_finish` run); `RatingRepository.getByReadingRunId`/`listByUserBookId`; кнопка "Перечитати" на Book Details (лише для `status === 'finished'`); `ReadingRunsHistorySection` (accordion "Історія прочитань"); `app/reread-comparison/[workId].tsx` ("Як змінилася книга для тебе", ≥2 завершених прочитань, доступно лише через `selectComparableRuns`); `src/lib/rereadComparison.ts` (чисті функції `computeRunReadingStats`/`computeNumericDelta`).
- **Відхилення від специфікації:** побічна знахідка — тай-брейк `, rowid DESC` доданий до `ORDER BY created_at DESC` у `RatingRepository`, бо тест виявив дві оцінки, збережені в ту саму мілісекунду, де "найновіша" непередбачувано могла виявитись насправді старішою — виправлення методологічне, знайдене власним тестом фази, не заплановане заздалегідь.
- **Свідомо пропущено:** нічого — роадмап "Свідомо ПОЗА межами" в `docs/READING_RUN.md` замінено на "Усі фази REREADING MODEL завершено".
- **Файли:** `025_rating_run.ts`, `RatingRepository.ts`, `app/work/[workId].tsx`, `app/reread-comparison/[workId].tsx`, `src/features/reading-runs/useReadingRunsDetail.ts`, `src/lib/rereadComparison.ts`.
- **Міграція:** `025_rating_run.ts` (schema v25) — остання міграція REREADING-ланцюжка.
- **Тести:** +24 (700 → 724).
- **Відоме обмеження:** порівняння прочитань — ВИКЛЮЧНО дані, які користувач уже сам зберіг, без жодної AI-генерації чи "розумного" підсумку.

### Фаза 13 — Book Memory: ungating + consolidation

- **Заплановано:** аудит V1.6.1 (§10.4-10.5, "Пара 3") зафіксував: весь екран Book Memory блокувався одним вузьким, необов'язковим записом `book_memory`.
- **Реалізовано:** новий gate `hasAnyMemoryData` — доступно, щойно ХОЧ ОДНЕ джерело пам'яті існує (спогад/До-Після/капсула/записи щоденника/lore/run/сесії); новий змістовний empty-state замість "Спершу створи спогад..." без виходу; `RecallSection` (перенесена кнопка "Згадати книгу" + історія попередніх спроб — перший UI-читач `CapsuleRecallRepository.listByBookCapsuleId`, репозиторій існував з Фази 5 V1.6 як заготовка); `ReadingRunsHistorySection` винесена в спільний компонент, другий споживач після Book Details.
- **Відхилення від специфікації:** немає.
- **Свідомо пропущено:** `app/completion/[workId].tsx` (BookCapsuleSection одразу після фінішу) і `app/memory/index.tsx` (список за капсулою) — навмисно НЕ чіпались, ТЗ саме про сам екран-хаб.
- **Файли:** `app/memory/[workId].tsx`, `src/features/memory/useCapsuleRecall.ts`, `src/components/reading-runs/ReadingRunsHistorySection.tsx`.
- **Міграція:** немає.
- **Тести:** 0 нових (724 без змін) — лише екрани/компоненти/тонкі хуки, домашня конвенція "тести лише на lib/repository/migration" без винятків.
- **Відоме обмеження:** ментальна модель "3 екрани згадати книгу" (Пара 3 попереднього аудиту) все ще існує як 3 окремі маршрути — консолідована лише навігаційна ієрархія всередині Book Memory, не сама кількість сутностей.

### Фаза 14 — Recommendation consolidation: «Що читати далі?»

- **Заплановано:** аудит (§18/§44) — щонайменше три незалежні механізми "що читати далі" без спільного шару чи розмежування.
- **Реалізовано:** новий проміжний екран `/next-read` (Primary flow «З моєї полиці» + Secondary flow «Знайти нову книгу»); `NextReadEntryPointCard` — ОДНА картка на Home замість трьох.
- **Відхилення від специфікації:** консолідація ЛИШЕ навігації, жоден з чотирьох алгоритмів не видалений/об'єднаний — усі лишаються самостійними повноцінними екранами. TBR reality check вперше отримує безумовний вхід з Home (раніше не мала власної картки взагалі).
- **Свідомо пропущено:** побічно виправлено неточний коментар про rolling pace (документація, не поведінка).
- **Файли:** `app/next-read.tsx`, `app/(tabs)/index.tsx`, `src/features/one-picker/useOnePicker.ts` (коментар).
- **Міграція:** немає.
- **Тести:** 0 нових (724 без змін).
- **Відоме обмеження:** дублювання логіки підбору (розділ 18 попереднього аудиту) лишається — це рішення про навігацію, не про алгоритми.

### Фаза 15 — Analytics hierarchy: «Моє читання»

- **Заплановано:** аудит (§"Пара 4") — п'ять незалежних аналітичних екранів без спільного шару, найчастіший жанр рахувався незалежно втричі.
- **Реалізовано:** новий хаб `/my-reading`; **реальне** підняття дубльованого коду в `src/lib/readingAggregates.ts` (5 чистих функцій: `sumSessionMinutes`/`sumSessionPages`, `computeBusiestMonth`, `filterFinishedInRange`, `computeTopGenreAmong`) — на відміну від Фази 14, тут не лише навігація, а й усунення реального дублювання коду.
- **Відхилення від специфікації:** немає.
- **Свідомо пропущено:** `StatsSummaryCard` і Home-шорткат "Статистика" — БЕЗ змін, лишаються прямими входами не через хаб (той самий принцип, що й `tbr_suggestion`-картка Фази 14).
- **Файли:** `app/my-reading.tsx`, `src/lib/readingAggregates.ts`, `useStatistics.ts`/`useWrappedYear.ts`/`useReadingSeason.ts`, `app/(tabs)/profile/index.tsx`.
- **Міграція:** немає.
- **Тести:** +17 (724 → 741).
- **Відоме обмеження:** п'ять окремих екранів як МАРШРУТИ лишаються (Пара 4 — навігаційна прогалина закрита, кількість самих екранів ні).

### Фаза 16 — Memory hub hierarchy: «Моя пам'ять»

- **Заплановано:** аудит (§44, "Пара 5") — Journal vs Activity History vs Memory index vs On This Day, чотири "стрічки минулого" без розмежування.
- **Реалізовано:** `app/memory/index.tsx` розширено з "лише список капсул" до хабу з 5 розділів: «Цей день у твоєму читанні» (перший постійний вхід до `/on-this-day` поза Home — раніше взагалі не мала такого входу, 🔴-знахідка аудиту), «Час згадати» (усі due-капсули, не одна), «Повернутися пізніше», «Капсули», «Перечитання»; `ReadingRunRepository.listUserBookIdsWithMultipleFinishedRuns`; "Моя історія" прибрана з `HOME_SHORTCUTS` (буквальне рішення ТЗ) — лишається доступною через Профіль.
- **Відхилення від специфікації:** немає.
- **Свідомо пропущено:** нічого понад заплановане в цій фазі.
- **Файли:** `app/memory/index.tsx`, `src/features/memory/useMemoryHub.ts`, `src/data/repositories/ReadingRunRepository.ts`, `src/lib/homeContext.ts`, `app/(tabs)/index.tsx`.
- **Міграція:** немає.
- **Тести:** +10 (741 → 751).
- **Відоме обмеження:** сама "Пара 5" (4 стрічки минулого) залишається як 4 окремі маршрути (`journal/index`, `history`, `memory/index`, `on-this-day`) — консолідовано лише те, що "Моя пам'ять" тепер справжній хаб, не всі чотири злиті в один.

### Фаза 17 — Home refinement (не redesign)

- **Заплановано:** аудит (Розділ 46, FTUE) — новий користувач бачить 7+ безумовних інтерактивних елементів до єдиного релевантного CTA, а сам CTA мовчки припускає непорожню бібліотеку.
- **Реалізовано:** сильний empty-state для справді порожньої бібліотеки (пряме "До пошуку" з Home, без проміжного переходу); `HomeShortcuts`/`NextReadEntryPointCard` — progressive disclosure (ховаються повністю для справді порожньої бібліотеки, рендеряться як і раніше для будь-якої непорожньої).
- **Відхилення від специфікації:** немає — явно назване "НЕ redesign", core Home (Читаю/cover/progress/сьогодні) не чіпався.
- **Свідомо пропущено:** склад/порядок самих shortcuts НЕ змінено.
- **Файли:** `app/(tabs)/index.tsx`.
- **Міграція:** немає.
- **Тести:** 0 нових (751 без змін) — тривіальний однорядковий вираз `isLibraryEmpty`, не окрема lib-функція.
- **Відоме обмеження:** для непорожньої, але дуже маленької бібліотеки (1-2 книги без активного читання) поведінка ідентична повнофункціональному користувачу — "тонкий" перехід між станами не додатково згладжений.

### Фаза 18 — Progressive onboarding

- **Заплановано:** аудит (Розділ 46, FTUE) — жодного welcome-екрана/tutorial-кроків, незнайомі терміни ("Капсула книги") без пояснення.
- **Реалізовано:** contextual onboarding замість tutorial — `onboardingHintStorage.ts` (`expo-secure-store`, три ключі: `welcome`/`firstSession`/`firstFinishedBookCapsule`); `useOnboardingHint` (спільний хук); `OnboardingHintCard`; три конкретні підказки: `WelcomeHint` (Home, з порожньою бібліотекою), `FirstSessionHint` (Home, коли `totalSessions === 1`), `CapsuleMemoryOnboardingHint` (перше завершення книги, `booksFinishedAllTime === 1`).
- **Відхилення від специфікації:** прямо задокументовано в PRODUCT_CONSOLIDATION.md, що ЦЯ фаза НЕ входить у ту саму лінію консолідації навігації, що Фази 13-19/28 — інший інструмент (контекстні підказки, не злиття навігації).
- **Свідомо пропущено:** повноцінний tutorial/walkthrough — свідомо не обраний підхід.
- **Файли:** `src/lib/onboardingHintStorage.ts`, `src/features/onboarding/useOnboardingHint.ts`, `src/components/ui/OnboardingHintCard.tsx`, `app/(tabs)/index.tsx`, `app/completion/[workId].tsx`.
- **Міграція:** немає.
- **Тести:** 0 нових (751 без змін) — тонкі обгортки над `SecureStore`/React-станом, та сама конвенція, що й `themePreferenceStorage.ts`.
- **Відоме обмеження:** лише 3 одноразові підказки — не повне покриття всіх незнайомих термінів продукту (Recall, Reading Experience Timeline тощо лишаються без контекстного пояснення).

### Фаза 19 — Calendar 2.0

- **Заплановано:** `docs/ARCHITECTURE.md` (ще з Milestone 0) називав цільову форму (обкладинка за інтенсивністю, `DaySummarySheet`), якої Milestone-4 Календар недотягував.
- **Реалізовано:** обкладинка "головної" книги дня (`selectPrimaryBookForDay`), індикатор інтенсивності (1-3 крапки, `computeDayIntensity`), значно змістовніші деталі дня (підсумок/сесії/журнальний preview вже spoiler-safe/старт-фініш книги/позначка перечитування), підсумок місяця, без N+1 у жодному новому запиті (`ActivityHistoryRepository.listBetween`, `ReadingRunRepository.listByIds`, `listWithDetailsByIds` замість `Promise.all`).
- **Відхилення від специфікації:** деталі дня лишились route-екраном, а не bottom sheet — свідоме архітектурне рішення, обґрунтоване окремо в `docs/CALENDAR_2_0.md`.
- **Свідомо пропущено:** нічого явно не назване пропущеним у цій фазі.
- **Файли:** `src/lib/calendarIntensity.ts`, `src/data/repositories/ActivityHistoryRepository.ts`, `src/data/repositories/ReadingRunRepository.ts`, `src/components/ui/CoverThumbnail.tsx`, `src/features/calendar/useCalendarSessions.ts`, `src/design/activityEventDisplay.ts`, `app/(tabs)/calendar.tsx`, `app/day/[date].tsx`.
- **Міграція:** немає (нові repository-методи над наявною схемою).
- **Тести:** +20 (751 → 771).
- **Відоме обмеження:** повторний аудит (Фаза 28) не знайшов жодної проблеми в Календарі — найкраще підтверджений результат серед усього milestone'у; єдиний пізніший дотик — `maxFontSizeMultiplier={1.2}` з Фази 22 (a11y).

### Фаза 20 — Offline UX

- **Заплановано:** `docs/LOCAL_FIRST.md` документував намір ("делікатний inline-banner через `expo-network`"), аудит (§39.1) CODE VERIFIED підтвердив — жодного підключення в коді.
- **Реалізовано:** залежність `expo-network`; `useIsOffline()` (`isConnected === false || isInternetReachable === false` — ловить і captive portal Wi-Fi без інтернету, не лише відсутність з'єднання); `OfflineNotice` (спільний banner); Пошук "Каталог" — гейтить 4 виклики `useProviderSearch` (`enabled: !isOffline`); ISBN-сканер — новий статус `'offline'` (локальна БД лишається доступна навіть офлайн).
- **Відхилення від специфікації:** немає.
- **Свідомо пропущено:** ретрай-черга — прямо названо, чому НЕ додано (`docs/OFFLINE_UX.md`).
- **Файли:** `src/lib/useIsOffline.ts`, `src/components/ui/OfflineNotice.tsx`, `app/(tabs)/search.tsx`, `app/isbn-scan.tsx`.
- **Міграція:** немає.
- **Тести:** 0 нових (771 без змін) — тонкий хук над нативним модулем + презентаційний компонент, та сама конвенція без окремих тестів, що й `useOnboardingHint`.
- **Відоме обмеження:** покриває лише 2 названі мережезалежні поверхні (пошук-каталог, ISBN-сканер) — не всі теоретично мережезалежні виклики застосунку (наприклад обкладинки з `coverStorageClient.ts` — не охоплені явним offline-banner'ом, і далі покладаються на тихий `catch`-degradation).

### Фаза 21 — Backup privacy UX

- **Заплановано:** аудит V1.6.1 (розділ 59 P1 / розділ 58 T6) — JSON-бекап повний, нешифрований, `expo-sharing` дозволяє відправити будь-яким каналом без попередження про вміст. ТЗ прямо виключає шифрування з цього milestone.
- **Реалізовано:** `app/backup.tsx` — `Alert.alert`-попередження "Резервна копія містить приватні записи" ПІСЛЯ натискання "Створити й поділитися", ПЕРЕД фактичним поширенням; показується щоразу (без "не показувати знову").
- **Відхилення від специфікації:** немає.
- **Свідомо пропущено:** шифрування (поза скоупом ТЗ); попередження НЕ зачепило CSV-експорт і автоматичний бекап (`docs/BACKUP_PRIVACY_UX.md` явно пояснює чому).
- **Файли:** `app/backup.tsx`.
- **Міграція:** немає.
- **Тести:** 0 нових (771 без змін) — `Alert.alert`-попередження, той самий клас коду, що й наявне restore-підтвердження на тому ж екрані, теж без тесту.
- **Відоме обмеження:** плейнтекст-бекап лишається плейнтекстом — попередження знижує ризик випадкового поширення, не усуває сам факт відсутності шифрування.

### Фаза 22 — Accessibility fixes

- **Заплановано:** три частини — (1) `reduceMotionEnabled` (з Milestone 8) нічого не вимикав, (2) `ReadingProgressBar` без `accessibilityRole="progressbar"`, (3) large text risk на 7 названих екранах.
- **Реалізовано:** `useReducedMotionAnimationType.ts` (повертає `'none'` замість заданого типу Modal-переходу, підключено до 4 `Modal`-переходів — `LibrarySortSheet`/`BookQuickActionsSheet`/`ReactionPicker`/`JournalTimeline`, єдиний нетривіальний рух в усьому коді, перевірено grep); `ReadingProgressBar.tsx` — `accessible`/`accessibilityRole="progressbar"`/`accessibilityValue`; `ReadingStatusChip` `height`→`minHeight`; `maxFontSizeMultiplier={1.2}` на номерах днів Календаря; `CardPreviewText` (новий, жорстко вимкнене `allowFontScaling`, ЄДИНИЙ свідомий виняток із правила "увесь текст масштабується" — застосовано в 3 shareable-картках, захоплюваних у PNG).
- **Відхилення від специфікації:** немає.
- **Свідомо пропущено:** `react-native-reanimated` — невикористана залежність, поза скоупом; `CollapsibleSection` — навмисно вже синхронний (без анімації, отже не потребує reduceMotion-гейту).
- **Файли:** `src/lib/useReducedMotionAnimationType.ts`, `src/components/ui/ReadingProgressBar.tsx`, `app/(tabs)/library/index.tsx`, `app/(tabs)/calendar.tsx`, `src/components/ui/CardPreviewText.tsx`.
- **Міграція:** немає.
- **Тести:** 0 нових (771 без змін) — тонкі хук/компонент над `useTheme`/`AppText`.
- **Відоме обмеження:** реальна перевірка з VoiceOver/TalkBack і далі NOT VERIFIED — жодна фаза цього milestone'у цього не змінила.

### Фаза 23 — Haptics cleanup + CHANGELOG fix

- **Заплановано:** дві незалежні частини — haptic на успішний ISBN-скан (4-й приклад ТЗ Фази 19 V1.6, тоді не мав реального місця виклику) + виправлення хибного твердження в CHANGELOG.
- **Реалізовано:** `app/isbn-scan.tsx` — `triggerLightHapticFeedback()` рівно один раз одразу після успішної перевірки контрольної цифри ISBN (`processingRef` гарантує рівно один виклик на сесію); CHANGELOG-запис Фази 19 V1.6, що стверджував "фічі сканування камерою не існує" — erratum-блок під оригінальним твердженням (не тихе переписування історії), той самий факт виправлено в `docs/DESIGN_SYSTEM_EXTENSION.md` і `src/lib/haptics.ts`.
- **Відхилення від специфікації:** немає — це саме та прогалина, яку попередній аудит підтвердив CODE VERIFIED (реальна причина відсутності haptic — пропущений виклик, не відсутність фічі).
- **Свідомо пропущено:** нічого.
- **Файли:** `app/isbn-scan.tsx`, `CHANGELOG.md` (erratum), `docs/DESIGN_SYSTEM_EXTENSION.md`, `src/lib/haptics.ts` (doc-коментар).
- **Міграція:** немає.
- **Тести:** 0 нових (771 без змін) — виклик у вже наявній screen-рівневій логіці, не тестується окремо.
- **Відоме обмеження:** немає нового.

### Фаза 24 — Performance / index audit

- **Заплановано:** аудит гарячих SQL-запитів проти реальних 25 (на момент фази) міграцій, справжнім `node:sqlite`, на детермінованій seeded-фікстурі (1000 книг/5000 сесій/10000 записів/1000 lore/500 капсул) — 3 з 4 знайдених прогалин уже названі попереднім аудитом (розділ 30.3) з позначкою "NOT BENCHMARKED".
- **Реалізовано:** `026_hot_query_indexes.ts` — 5 нових індексів (`edition(isbn10)` — виправляє реальний `SCAN edition` замість `MULTI-INDEX OR`, ~6x на фікстурі; `user_book(status, updated_at)`, `note(user_book_id, created_at)`, `quote(user_book_id, created_at)`, `reading_session(user_book_id, started_at)` — усі 4 прибирають `TEMP B-TREE FOR ORDER BY`, ~1.2x, зростає з розміром бібліотеки); та сама міграція ВИДАЛЯЄ 4 надлишкові одноколонкові індекси, які нові композити повністю замінюють (leftmost-prefix rule).
- **Відхилення від специфікації:** немає — це буквально той самий бенчмарк, який попередній аудит позначив як відсутній.
- **Свідомо пропущено:** індекс `reading_session(ended_at)` окремо, індекс на `deleted_at` жодної таблиці, зміна UNION-запитів `ActivityHistoryRepository`/`OnThisDayRepository` — усі три з явним обґрунтуванням у `docs/PERFORMANCE_AUDIT.md`.
- **Файли:** `026_hot_query_indexes.ts`, `docs/PERFORMANCE_AUDIT.md`, `docs/DATABASE.md`.
- **Міграція:** `026_hot_query_indexes.ts` (schema v26).
- **Тести:** +3 (771 → 774).
- **Відоме обмеження:** бенчмарк на синтетичній фікстурі 1000 книг — не на реальних даних жодного справжнього користувача (NOT VERIFIED на реальному пристрої/реальному обсязі даних).

### Фаза 25 — Edge Function CI + npm audit

- **Заплановано:** дві незалежні частини з попереднього аудиту — (1) 6 файлів `supabase/functions/**` жодним автоматичним інструментом не перевірялись (розділ 32), (2) `npm audit` не запускався взагалі (розділ 34, "суцільний NOT VERIFIED").
- **Реалізовано:** новий job `edge-functions` у `.github/workflows/ci.yml` (`denoland/setup-deno@v2`, `deno check` + `deno lint`); новий крок `npm audit --audit-level=high` у job `ci` (advisory, `continue-on-error: true`, той самий підхід, що й `expo-doctor`).
- **Відхилення від специфікації:** немає.
- **Свідомо пропущено:** `deno test` крок (жодного тестового файлу для Edge Functions ще не існує); GitHub Dependabot alerts (налаштування самого GitHub-репозиторію, не файл у git — OWNER ACTION REQUIRED).
- **Файли:** `.github/workflows/ci.yml`, `docs/EDGE_FUNCTION_CI.md` (новий), `docs/TESTING.md`, `docs/SECURITY.md`.
- **Міграція:** немає.
- **Тести:** 0 нових (774 без змін) — виключно CI-конфігурація.
- **Відоме обмеження:** саме тестове покриття Edge Functions (`deno test`) лишається 0 — CI тепер ловить лише типи/лінт, не поведінкові регресії rate-limit/CORS/валідації.

**Фаза 25 (виправлення) — CI-знахідка: TS2769 у cover-upload/index.ts.** Перший реальний прогін нового job `edge-functions` (CI run #80) одразу впіймав справжню помилку типів (`deno check` падав на `TS2769` через непараметризований `Uint8Array<ArrayBufferLike>`, що не збігається з жодним `BodyInit`-оверлоадом сучасних DOM-типів) — саме та верифікація, яку раніше неможливо було зробити локально. Виправлено уточненням сигнатури `readRequestBodyWithLimit` до `Promise<Uint8Array<ArrayBuffer> | 'too_large'>`, без жодної зміни рантайм-логіки (обидва фактичні `return`-шляхи й без того завжди створюють `Uint8Array` над справжнім `ArrayBuffer`). Підтверджено локально мінімальним репро через `tsc --strict --lib dom --noEmit` (сам `deno` недоступний з мережі цієї сесії). 0 нових тестів (774 без змін, поза Jest-scope).

### Фаза 26 — Soft-delete readiness + Data Doctor extension

- **Заплановано:** три незалежні частини з попереднього аудиту — `book_capsule`/`book_memory`/`rating` без `deleted_at` (розділ 53/58), `ReadingRun` не проносив уже наявну колонку `deletedAt`, і потреба в нових Data Doctor перевірках для REREADING MODEL.
- **Реалізовано:** `027_soft_delete_readiness.ts` — `deleted_at` на `book_capsule`/`book_memory`/`rating` (`ALTER TABLE`, без rebuild/backfill); "revive on upsert" для `BookMemoryRepository`/`RatingRepository.upsertCurrent` (щоб не порушити `UNIQUE(reading_run_id)` після повторного запису); `ReadingRunSchema`/`ReadingRunRepository` тепер проносить `deletedAt` (DB-колонка існувала з Фази 6, жоден TS-тип її не читав); 7 нових Data Doctor перевірок (`session_without_run`, `run_session_mismatch`, `multiple_active_runs`, `run_finished_without_finished_at`, `run_invalid_sequence`, `legacy_contradictory_status`, 4 варіанти `*_references_invalid_run`).
- **Відхилення від специфікації:** побічний ефект — `capsule_recall` `ON DELETE CASCADE` більше не спрацьовує при видаленні капсули (рядок фізично лишається) — recall-історія тепер зберігається разом із м'яко видаленою капсулою, навмисно, не недогляд.
- **Свідомо пропущено:** `Shelf`/`ReadingGoal`/`Reminder` — СВІДОМО НЕ отримали `deleted_at` (структурні/конфігураційні сутності без незамінного тексту); індекс на нових `deleted_at`-колонках (той самий низький пріоритет, що й для решти схеми); перевірка "run без жодної сесії" (легітимний нормальний стан).
- **Файли:** `027_soft_delete_readiness.ts`, `src/domain/dataIntegrityDoctor.ts`, `src/data/repositories/DataIntegrityRepository.ts`, `src/types/readingRun.ts`, `ReadingRunRepository.ts`.
- **Міграція:** `027_soft_delete_readiness.ts` (schema v27, остання на цей момент).
- **Тести:** +23 (774 → 797).
- **Відоме обмеження:** знайдена й виправлена в межах цієї ж фази власна тестова прогалина — старий `DataIntegrityRepository.test.ts` сідив сесію без `reading_run_id` (фікстура написана до Фази 6/26) — новий чекер відпрацював правильно, впіймавши застарілу фікстуру.

### Фаза 27 — Migration safety net + Backup compatibility

- **Заплановано:** дві незалежні частини ТЗ.
- **Реалізовано:** **знайдено реальну прогалину, не заплановану заздалегідь** — `BackupRepository.ts`: таблиця `reading_run` НІКОЛИ не входила в `BACKUP_TABLE_ORDER` з моменту своєї появи (Фаза 6) аж до цієї фази — жоден експортований бекап не містив історії перечитувань узагалі. Додано одразу після `user_book`. `src/data/db/legacyRunBackfill.ts` — ЧАСТИНА 2 (JS backfill-цикл) міграцій 020-025 винесена дослівно й перевикористана з `useRestoreBackup` одразу після `restoreAll` (той самий "збій допоміжного кроку не валить весь restore" підхід, що й `rebuildCapsuleRemindersAsync`); два нові наскрізні "migration safety net" сценарії (`migrationRunner.test.ts`) — "V1.5 baseline (migration 011) → LATEST" і "V1.6 baseline (migration 018) → LATEST" — перевіряють, що весь ланцюжок компонується РАЗОМ, не лише кожна міграція окремо.
- **Відхилення від специфікації:** сама знахідка про `reading_run` поза бекапом — це "знайдено й виправлено реальну прогалину", не запланована заздалегідь зміна.
- **Свідомо пропущено:** аналогічний post-restore backfill для гіпотетичних майбутніх сутностей поза вже наявними шістьма — ланцюжок REREADING MODEL завершений Фазою 12, нових таких сутностей не заплановано.
- **Файли:** `BackupRepository.ts`, `src/data/db/legacyRunBackfill.ts` (новий), `migrationRunner.test.ts`, `legacyRunBackfill.test.ts` (новий), `BackupRepository.test.ts`, `docs/BACKUP_FORMAT.md`, `docs/READING_RUN.md`.
- **Міграція:** немає нової — рефакторинг/backfill логіки з уже наявних 020-025.
- **Тести:** +13 (797 → 810).
- **Відоме обмеження:** знайдена й виправлена в межах фази власна тестова прогалина (`legacyRunBackfill.test.ts`, фікстура `ub-5` без `started_at` — виправлено сам тест, не продакшн-код).

### Фаза 28 — UI complexity re-audit (Home/Library/Book Details/Calendar/Memory/Profile)

- **Заплановано:** фінальна фаза — повторний аудит ПІСЛЯ consolidation-фаз 13-19, чи п'ять базових намірів користувача досі зчитуються з кожного екрана. НЕ редизайн.
- **Реалізовано:** Home/Calendar/Memory/Profile — жодних знахідок, код не змінений. Library (лише bug fixes за прямою вимогою ТЗ): `BookQuickActionsSheet` статус "застрягав" на старому значенні (виправлено похідним значенням у рендері, не `useEffect` — перша версія фіксу не пройшла `react-hooks/set-state-in-effect`-правило власного ESLint-конфігу проєкту); `ShelfRepository.listAll`/`search` — `bookCount` рахував книги, прибрані з бібліотеки (soft-delete `user_book` ніколи не чистив `shelf_book`) — виправлено другим `LEFT JOIN` з фільтром `deleted_at IS NULL`. Book Details — 5 дрібних змін зменшення conceptual overload (заголовки секцій, об'єднання "Історія прочитань"+"Історія читання", `LoreSection` за замовчуванням згорнута, "Перечитати" CTA полегшено до підпису-посилання).
- **Відхилення від специфікації:** немає.
- **Свідомо пропущено:** групування `StaleReadingSection`+`FinishPredictionSection` під одним заголовком; `helperText`-проп у спільному `ChipSelect` заради одного локального виклику — обидва з окремим обґрунтуванням у `docs/UI_COMPLEXITY_AUDIT_PHASE28.md`.
- **Файли:** `BookQuickActionsSheet.tsx`, `ShelfRepository.ts`, `src/data/repositories/ShelfRepository.test.ts` (новий), `app/work/[workId].tsx` (LibrarySection/StaleReadingSection/LoreSection/"Перечитати" CTA).
- **Міграція:** немає.
- **Тести:** +3 (810 → 813, фінальне число milestone'у).
- **Відоме обмеження:** жодного — це остання продуктова фаза перед документаційним/quality-gate завершенням; Фаза 28 сама підтверджує, що 4 з 6 перевірених екранів (Home/Calendar/Memory/Profile) не потребували жодних змін.

---

## 3. ПОПЕРЕДНІ ЗНАХІДКИ АУДИТУ — МАТРИЦЯ РОЗВ'ЯЗАННЯ

| # | Знахідка (з `V1_6_FULL_AUDIT_REPORT.md`) | Попередня критичність | Попередній стан | Поточний стан | Розв'язання | Доказ | Регресійний тест | Залишковий ризик |
|---|---|---|---|---|---|---|---|---|
| 1 | `finished → did_not_finish` не скидає `finished_at` (розділ 13) | P0 | `UserBookRepository.updateStatus` ніколи не скидав `finished_at` при переході в DNF | Скидається завжди, явно | **FIXED** | CODE VERIFIED — `UserBookRepository.updateStatus` (Фаза 1) | `UserBookRepository.test.ts` (+2), `dataIntegrityDoctor.test.ts` (+2, check `dnf_with_finished_at`) | Низький — старі "брудні" записи потребують ручного Data Doctor запуску (не auto-fix) |
| 2 | Memory spoiler leak — `app/memory/[workId].tsx` не фільтрував журнальні записи (розділ 42.3) | Критична (crossover spoiler+share) | `filterSpoilerSafeJournalEntries` НЕ імпортувався на цьому екрані, на відміну від `app/work/[workId].tsx`/`app/recap/[workId].tsx` | Централізована `spoilerSafe.ts`-логіка застосована й тут | **FIXED** | CODE VERIFIED — Фаза 3, явно назване "Book Memory / картка-спогад / Journal Timeline" | `spoilerSafe.test.ts` (нові експорти) | Низький — інтеграційного (screen-level) тесту, що саме цей екран викликає фільтр, як і раніше немає (те саме застереження, що в §42.4 старого аудиту) |
| 3 | JournalTimeline spoiler leak — повний текст запису в модалці без перевірки прогресу (POTENTIAL LEAK #2, розділ 12) | Найсерйозніша в розділі 12 | `<AppText>{entry.text}</AppText>` без жодного фільтра, документація прямо (і хибно) стверджувала протилежне | Фільтр застосований централізованим шаром | **FIXED** | CODE VERIFIED — Фаза 3 | `spoilerSafe.test.ts` | Низький |
| 4 | Personal Search spoiler leak — глобальний пошук без spoiler-фільтра (POTENTIAL LEAK #3, розділ 12) | Висока | `JournalRepository.searchFeed` — прямий SQL без урахування `spoiler_safe_enabled` | Фільтр у самому репозиторії, одразу після SQL | **FIXED** | CODE VERIFIED — Фаза 3 | `JournalRepository.test.ts` (нові spoiler-safe сценарії для `listFeedPage`/`searchFeed`) | Низький |
| 5 | Старі `/characters` маршрути — мертвий, недосяжний навігацією, але фізично присутній і незафільтрований дублікат `/lore` (POTENTIAL LEAK #1, розділ 12; розділ 3-4) | Середня (потенційний, не активний leak) | Файли фізично існували, `characters.map(...)` без жодного `filterSpoilerSafeLoreEntities` | CHANGELOG Фази 2 стверджує "обох файлів більше не існує" | **NOT FIXED (розбіжність між заявленим і фактичним станом)** | **CODE VERIFIED, суперечить CHANGELOG:** `app/characters/[workId].tsx` (163 рядки) і `app/characters/[workId]/[entityId].tsx` (321 рядок) ФІЗИЧНО ПРИСУТНІ в мирроварі, що аудитується (`/mnt/user-data/uploads/polytsya-m11`), з реальним, повним вмістом, не заглушками. CHANGELOG Фази 2 стверджує протилежне на основі перевірки `device_list_dir` — найімовірніше, зробленої на іншому знімку репозиторію (машині власника продукту), ніж той, що завантажений у цю сесію | Немає (тести на видалення не пишуться для відсутності файлу) | **Реальний, не теоретичний** — доки в артефакті, що фактично деплоїться/білдиться, ці два файли присутні, Expo Router реєструє їх як робочі маршрути (`/characters/[workId]`) без жодної spoiler-фільтрації; OWNER ACTION ITEM — підтвердити фізичну відсутність файлів саме в тому репозиторії, з якого відбувається build/deploy, не лише в записі CHANGELOG |
| 6 | On This Day — стара, окрема spoiler-евристика, що не враховує `user_book.spoilerSafeEnabled` (розділ 12, "дрібніші спостереження") | Середня (непослідовність, не leak у класичному сенсі) | `applySpoilerRules` (`onThisDay.ts`) — власний спрощений механізм, ігнорував персональний перемикач конкретної книги, застарілий коментар "майбутня Фаза 12, якої ще немає" | Виправлено як реальний БАГ (не лише коментар) | **FIXED** | CODE VERIFIED — Фаза 3 прямо називає це "реальний БАГ" і виправляє: книги більше не потрапляють у карту "активно читається" незалежно від `spoiler_safe_enabled` | Немає explicit регресійного тесту, названого по імені для цього конкретного випадку в тексті CHANGELOG (можливо покрито загальними `useOnThisDay`-тестами — не перевірено окремо в межах цього аудиту) | Низький-середній — сам regression test file для цього конкретного case не підтверджений явно |
| 7 | Google Books ключ у клієнтському бандлі (`EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY`, розділ 26.8/33) | 🟡 Середня | Ключ буквально компілювався в клієнт, без проксі/rate-limit, DoS-ризик для квоти власника | Проксі-архітектура за тим самим патерном, що ISBNdb | **FIXED (код) / PARTIALLY FIXED (деплой)** | CODE VERIFIED — `GoogleBooksProvider.ts` більше не читає `EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY` (перевірено grep, збіги лишились лише в doc-коментарях, що явно описують МИНУЛУ поведінку); `supabase/functions/google-books-proxy/` існує в дереві | Немає Jest-тестів (Edge Function, поза Jest-scope) | **Явно позначений OWNER ACTION REQUIRED в самому CHANGELOG Фази 4** — сам проксі НЕ підтверджено задеплоєним (`supabase functions deploy` не виконано з жодної сесії дотепер) — доти реальний клієнт і далі падає на прямий анонімний виклик без переваг проксі (що само по собі безпечно, просто не дає заявленої вигоди) |
| 8 | `ReadingSessionRepository` без прямих lifecycle-тестів — "найважливіша прогалина покриття у всьому списку" (розділ 31.2) | Висока (core loop) | Тестувався лише другорядний `setReadingExperience`; `start`/`pause`/`resume`/`finish`/`discard` — 0 прямих тестів | 23 нових прямих тести на всі методи, включно з rollback-сценарієм | **FIXED** | AUTOMATED TEST VERIFIED — `ReadingSessionRepository.test.ts`, 31 `it()`-блок, покриває start/getActiveSession/pause/resume/finish (атомарність+rollback)/discard/rereading/soft-delete | Самі ці тести Є регресійним покриттям | Низький |
| 9 | Book Memory gating — весь екран блокувався одним вузьким необов'язковим записом `book_memory` (розділ 10.4-10.5, "Пара 3") | Висока (продуктова) | `!data.userBook \|\| !memory` — жоден з інших джерел пам'яті (До/Після, капсула, щоденник, lore) не рятував від порожнього екрана | `hasAnyMemoryData` — доступно, щойно ХОЧ ОДНЕ джерело існує | **FIXED** | CODE VERIFIED — `app/memory/[workId].tsx:468`, Фаза 13 | Немає нових тестів (screen-level, домашня конвенція не тестує екрани) | Низький |
| 10 | Немає ReadingRun — "найбільша структурна прогалина архітектури V1.6" (розділ 23) | Критична (архітектурна) | `user_book.status='rereading'` — лише прапорець без історії; статистика/Wrapped недораховували перечитувані книги (реальний функціональний баг); Book Memory/Before-After втрачали дані при upsert; Capsule не пропонувалась для перечитування | Повна сутність `reading_run`, підключена до сесій/спогадів/до-після/капсули/DNF/рейтингу | **FIXED** | CODE VERIFIED, 8-фазний ланцюжок (Фази 6-12), 96 нових тестів на весь ланцюжок сукупно | `ReadingRunRepository.test.ts` + тести в кожній з Фаз 6-12 + два "migration safety net" наскрізні сценарії (Фаза 27) | Низький-середній — backfill legacy-даних best-effort з визнаною втратою деталей для старих `rereading`-книг (не всі старі перечитування відновлювані); `ReadingRunRepository.discard()` існує, але жоден екран її не викликає (заготовка без UI) |
| 11 | Дублікат рекомендаційних поверхонь — Tomorrow vs One Book Picker vs TBR (Пара 1/2, §44) | Продуктова (UX-борг) | 3 незалежні картки на Home, ідентичний візуальний патерн, той самий словник "настроїв" | Навігаційна консолідація — один вхід `/next-read` | **PARTIALLY FIXED** | CODE VERIFIED — Фаза 14, `NextReadEntryPointCard` замінює 3 картки | Немає (навігаційна зміна, не lib-логіка) | Середній — сама алгоритмічна дуплікація (3 різні механізми відповідають на те саме питання) НЕ усунена, лише глибина навігації змінилась з "рівень 0" на "рівень 1" |
| 12 | Дублікат ментальної моделі "згадати книгу" — Capsule vs Recall vs Book Memory (Пара 3, §44) | Продуктова (UX-борг) | 3 екрани, 2 бази записів зі схожими укр. назвами, межа тримається на документації, не інтерфейсі | Book Memory став явним хабом (Фаза 13), Capsule/Recall лишаються окремими маршрутами | **PARTIALLY FIXED** | CODE VERIFIED — Фаза 13 (`hasAnyMemoryData`, `RecallSection`) | Немає screen-level тесту | Середній — концептуальна межа Capsule/Book Memory для нового користувача не усунена, лише навігаційно організована |
| 13 | Фрагментація аналітики — 5 незалежних "derived aggregate" екранів, найчастіший жанр рахувався втричі незалежно (Пара 4, §44) | Продуктова (тех.борг + UX-борг) | 5 маршрутів, 0 спільного обчислювального шару | Навігаційний хаб `/my-reading` + 5 функцій підняті в `readingAggregates.ts` | **FIXED (код), PARTIALLY FIXED (UX)** | CODE VERIFIED — Фаза 15, реальне усунення дублювання коду (не лише навігації, на відміну від Пари 1/2/3) | `readingAggregates.test.ts` (+17) | Низький на рівні коду; середній на рівні UX — 5 маршрутів фізично лишаються |
| 14 | Порожній Home для нового користувача — 7+ безумовних елементів до єдиного CTA (розділ 46, FTUE) | Продуктова (FTUE) | Немає жодного welcome/tutorial-флоу; сильний CTA — лише останній елемент екрана | Progressive disclosure (Фаза 17) + contextual onboarding-підказки (Фаза 18) | **PARTIALLY FIXED** | CODE VERIFIED — Фаза 17 (`isLibraryEmpty` ховає shortcuts/рекомендації), Фаза 18 (3 контекстні підказки) | Немає (screen-level, домашня конвенція) | Середній — повноцінного onboarding-флоу як такого і далі немає (свідомо, за вибором продукту); реальна перевірка "чи новачок менше губиться" — OWNER MANUAL VERIFIED лише опосередковано (функціональне тестування власником, не UX-дослідження на реальних нових користувачах) |
| 15 | Бекап — нема попередження про приватний вміст перед поширенням (розділ 59 P1 / розділ 58 T6) | Середня-висока (privacy) | `expo-sharing` дозволяв відправити повний JSON з приватними нотатками/DNF-причинами будь-яким каналом без жодного попередження | `Alert.alert`-попередження перед фактичним поширенням | **FIXED (попередження) / NOT FIXED (шифрування, свідомо поза скоупом)** | CODE VERIFIED — `app/backup.tsx`, Фаза 21 | Немає (screen-level, `Alert.alert`, та сама конвенція без тесту, що й наявне restore-підтвердження) | Середній — сам факт незашифрованого plaintext лишається (задокументований залишковий ризик, не прихований) |
| 16 | `reduceMotionEnabled` збирається, але ніде не споживається (розділ 35.3/44) | Низька-середня (a11y) | Прапорець у `ThemeProvider` існував з Milestone 8, `grep` не знаходив жодного споживача | `useReducedMotionAnimationType.ts`, підключено до 4 `Modal`-переходів | **FIXED** | CODE VERIFIED — `src/lib/useReducedMotionAnimationType.ts:24`, реально читає `theme.reduceMotionEnabled`, підключений у `LibrarySortSheet`/`BookQuickActionsSheet`/`ReactionPicker`/`JournalTimeline` | Немає окремого тесту (тонка обгортка, та сама конвенція, що й `useOnboardingHint`) | Низький |
| 17 | `ReadingProgressBar` без `accessibilityRole="progressbar"`/`accessibilityValue` (розділ 37.2) | Середня (a11y) | `grep` — 0 збігів accessibility-атрибутів на компоненті, семантично прогрес-бар | Атрибути додані | **FIXED** | CODE VERIFIED — `src/components/ui/ReadingProgressBar.tsx:52-54` | Немає окремого юніт-тесту на сам атрибут (компонентний тест, поза домашньою конвенцією repository/lib-тестів) | Низький |
| 18 | ISBN-сканер без haptic feedback на успішний скан, попри те, що ТЗ Фази 19 V1.6 його вимагав (розділ 15/зведення) | Низька (полірування), але з методологічною знахідкою (хибний CHANGELOG-запис) | `app/isbn-scan.tsx` не викликав `triggerLightHapticFeedback` попри те, що камера-сканування реально існувало (CHANGELOG хибно стверджував протилежне) | Виклик доданий + CHANGELOG-erratum | **FIXED** | CODE VERIFIED — `app/isbn-scan.tsx:111`, `triggerLightHapticFeedback()` викликається | Немає окремого тесту | Низький |
| 19 | Мережевий стан (offline) не перевірявся взагалі — задокументований намір, 0 реалізації (розділ 39.1) | Середня (UX/degradation) | `NetInfo`/`isInternetReachable` — рівно 1 збіг у всьому репо, і той у документації, не в коді | `expo-network` + `useIsOffline` + `OfflineNotice`, підключено до Пошуку/ISBN-сканера | **FIXED** | CODE VERIFIED — `src/lib/useIsOffline.ts`, Фаза 20 | Немає окремого тесту (тонкий хук над нативним модулем) | Низький-середній — покриває лише 2 поверхні явно; ретрай-черга свідомо не додана |
| 20 | Edge Functions (isbndb-proxy, google-books-proxy, cover-upload, _shared) поза CI — жоден автоматичний інструмент їх не перевіряв (розділ 26.7/32) | Середня-висока (якість/безпека) | `find` за тестовими файлами — 0 результатів; CI виконував лише Jest/tsc/ESLint для головного застосунку | Новий job `edge-functions` (`deno check`+`deno lint`) | **FIXED (типи/лінт) / NOT FIXED (поведінкові тести)** | CI VERIFIED — job існує, CI run #80 реально впіймав справжню помилку типів (TS2769, виправлено тим же циклом) | Немає `deno test` — свідомо не додано (жодного тестового файлу для Edge Functions ще не існує) | Середній — rate-limit/CORS/валідація ISBN у проксі й далі без жодного автоматизованого тесту, лише ручний рев'ю коду |
| 21 | `npm audit` ніколи не запускався — "суцільний NOT VERIFIED" розділ попереднього аудиту (розділ 34) | Середня (supply chain) | Немає мережевого доступу з попередньої аудит-сесії; 0 CVE перевірено з ~60 прямих залежностей | Реальний крок у CI, advisory | **FIXED** | CI VERIFIED — крок `npm audit --audit-level=high` у `ci.yml`, `continue-on-error: true` (Фаза 25) | N/A (CI-крок, не Jest-тест) | Низький-середній — advisory, не блокуючий; GitHub Dependabot alerts і далі НЕ увімкнені (OWNER ACTION REQUIRED, налаштування самого GitHub-репозиторію поза git) |
| 22 | `book_capsule` без soft-delete, не готова до майбутньої синхронізації (розділ 53-55, зведення вердиктів "V2 readiness") | Середня (архітектурна готовність) | `deleted_at` є на ключових таблицях, але відсутній саме на `book_capsule` (і `book_memory`/`rating`) | `deleted_at` додано на всі три (Фаза 26) | **FIXED** | CODE VERIFIED — `027_soft_delete_readiness.ts`, `ALTER TABLE ... ADD COLUMN deleted_at` на `book_capsule`/`book_memory`/`rating` | `BookCapsuleRepository.test.ts` (+1), `BookMemoryRepository.test.ts` (+2), `RatingRepository.test.ts` (+2), `migrationRunner.test.ts` (+2) | Низький — `Shelf`/`ReadingGoal`/`Reminder` і далі свідомо без `deleted_at` (задокументоване, не забуте рішення) |
| 23 | Застаріла документація — реальний дрейф з кодом (напр. коментар "28 таблиць" у `BackupRepository.ts`, `docs/DATABASE.md` описував нереалізований частковий індекс, `docs/BACKUP_FORMAT.md` описував неіснуючу директорію `src/data/backup/migrations/*`) | Низька (не логічна, документаційна) | Мінімум 3 конкретні drift-приклади знайдені CODE VERIFIED у попередньому аудиті | Один окремий документаційний прохід (post-Фаза 28, без номера) оновив 9+ документів | **PARTIALLY FIXED** | Змішано: `docs/DATABASE.md` §"Індекси" — **FIXED**, повністю переписана Фазою 24 під реальну композитну схему (старий "частковий індекс"-дрейф зник як побічний ефект повного переписування). `docs/BACKUP_FORMAT.md` — **NOT FIXED**: рядки 40-47 і зараз описують `src/data/backup/migrations/*` як механізм, що вже "приводить старий JSON до поточної форми" — CODE VERIFIED, `find src/data/backup` і зараз повертає "No such file or directory", директорія фізично не існує. `BackupRepository.ts:116` (коментар "28 таблиць") — **NOT FIXED**: реальна кількість таблиць у `BACKUP_TABLE_ORDER` зараз 38 (CODE VERIFIED прямим підрахунком), коментар і далі каже "28" | Немає (документаційний артефакт, тести на коментарі не пишуться) | Низький — не впливає на логіку, але це третій задокументований приклад того самого класу дрейфу (коментар не оновлюється синхронно з додаванням нових таблиць/сутностей), який повторно НЕ був закритий навіть у спеціально присвяченій документаційній фазі milestone'у |

### Коментар до найважливіших рядків матриці

**Рядок 5 (старі `/characters` маршрути) — найсерйозніша розбіжність, знайдена цим аудитом.** CHANGELOG Фази 2 стверджує пряму, конкретну, перевірену "на пристрої" (`device_list_dir`) дію — видалення файлів — з формулюванням, що не залишає простору для двозначності ("обидва файлів більше не існує"). Але в артефакті, який фактично доступний цій аудит-сесії для перевірки, обидва файли фізично присутні, з повним, не-заглушковим вмістом. Це не обов'язково означає, що робота не була зроблена — найімовірніше пояснення (не перевірене, HYPOTHESIS) полягає в тому, що `device_list_dir`-перевірка виконувалась на реальній робочій машині власника продукту (`C:\polytsya-m11`), а мирровар, завантажений у цю сесію (`/mnt/user-data/uploads/polytsya-m11`), — окремий, можливо трохи більш ранній чи інакше синхронізований знімок того самого репозиторію. Але для цілей аудиту, що працює виключно з наданим артефактом, коректний висновок — **NOT FIXED у перевіреному стані**, з явною рекомендацією власнику продукту підтвердити, що видалення справді застосоване в тому самому дереві коду, яке білдиться й деплоїться.

**Рядок 23 (застаріла документація) — той самий клас проблеми повторюється навіть у документаційній фазі, спеціально присвяченій виправленню дрейфу.** Post-Фаза-28 документаційний прохід (описаний в EXECUTIVE SUMMARY) явно згадує собі "виявлено й виправлено реальну розбіжність із поточним кодом" для 9+ документів — це не порожня формальність, а реальна робота (наприклад маршрути 44→47 в `ARCHITECTURE.md`, каскад-примітки в `BOOK_CAPSULES.md`/`RECALL.md`). Проте два конкретні drift-приклади, названі попереднім повним аудитом буквально по номеру рядка файлу (`BackupRepository.ts:104`/зараз `:116`, і `BACKUP_FORMAT.md` §Restore крок 3), НЕ входять до списку виправлених у документаційній фазі й підтверджено CODE VERIFIED і зараз лишаються в тому ж стилі неточними. Це саме по собі не є критичною знахідкою (коментарі, не логіка виконання), але вказує на системну властивість процесу: документаційні проходи в цьому проєкті послідовно ефективні для НОВОГО дрейфу (виявленого й названого в тому ж циклі), але не завжди повторно перевіряють СТАРІ, вже раз названі попереднім аудитом приклади того самого класу проблеми.
## 4. НОВІ ПРОБЛЕМИ, ВНЕСЕНІ V1.6.1

Нижче — проблеми, яких **не існувало до появи `reading_run`** (Фази 6-12, 019-025, 27) і які
є прямим побічним ефектом саме цієї архітектурної зміни, а не старими вадами, що просто
залишились незачепленими. Кожна підтверджена прямим читанням коду (`CODE VERIFIED`); там, де
автоматичний тест існує — позначено окремо.

### F1 (Critical) — «Почати читання» без гейту статусу створює «фантомний» run і розсинхронізовує `user_book.status` з `reading_run`

**Доказ.** `ReadingControls` (`app/work/[workId].tsx:995-1034`) рендериться **безумовно** для
будь-якого `userBook` (виклик — `app/work/[workId].tsx:419`, `{userBook ? <ReadingControls
userBook={userBook} /> : null}`, БЕЗ перевірки `status`). Єдина умова всередині самого
компонента — чи є активна сесія в застосунку взагалі (`useActiveSession`), не статус ЦІЄЇ книги.
Кнопка "Почати читання" викликає `useStartSession` → `ReadingSessionRepository.start`
(`src/data/repositories/ReadingSessionRepository.ts:101-147`), яка сама шукає активний run
(`ReadingRunRepository.getActiveByUserBookId`) і, якщо його немає, **створює новий** — і
свідомо (задокументовано в коментарі самого методу, рядки 86-100) **ніколи не чіпає
`user_book.status`**.

Отже: книга зі статусом `finished` (чи `did_not_finish`, чи навіть `want_to_read`) — натискання
"Почати читання" (звичка, перевірити цитату, побіжно погортати) створює справжній НОВИЙ
`reading_run` (`run_number` +1, `status='in_progress'`) і реальну сесію, а `user_book.status`
лишається `'finished'`. Це НЕ пройде непоміченим сценарієм — це наслідок:

1. `RatingRepository.getCurrent`/`BookMemoryRepository.getCurrent`/`BookCapsuleRepository
   .getCurrent`/`PreReadingReflectionRepository.getCurrent` — усі резолвлять "поточний" run
   через `getLatestByUserBookId` (найновіший **незалежно від статусу**). Після випадкового тапу
   вони раптом резолвлять НОВИЙ порожній run замість того, що книга щойно прочитана й має
   реальну оцінку/спогад/капсулу — на Book Details ці секції миттєво "спорожніють" для
   користувача, який щойно один раз натиснув не ту кнопку.
2. `ReadingRunsHistorySection` (читає ВСІ run, незалежно від статусу) на тому самому екрані
   покаже нове "Прочитання №2" зі статусом "Читаю"/`in_progress` — прямо поруч із чіпом статусу
   книги, який досі каже "Прочитано". Видима самосуперечність на одному екрані.
3. Цей run НІКОЛИ не самозцілюється: `ReadingSessionRepository.finish` не чіпає
   `reading_run`/`user_book.status` теж. Фантомний `in_progress` run лишається назавжди, доки
   користувач ЯВНО не змінить статус ще раз (тоді `UserBookRepository.updateStatus` побачить
   `activeRun` = цей фантомний run і або завершить його, або нічого не зробить, залежно від
   нового статусу).
4. `dataIntegrityDoctor.ts`'s `legacy_contradictory_status` (`src/domain/dataIntegrityDoctor.ts`
   рядки 632-653) — коментар до цієї перевірки прямо каже: "Застаріла суперечність (до реального
   "підключення" статусу книги до run, Фаза 7)" — тобто ПРИПУСКАЄ, що такий стан можливий лише в
   ЛЕГАСІ-даних (до Фази 7). Цей трейс доводить, що ТОЙ САМИЙ клас суперечності відтворюється
   свіжим, повністю пост-Фаза-7 кодом через звичайний UI-потік — коментар Data Doctor застарів
   відносно власного коду.

**Severity:** Critical. **Affected flow:** Book Details, будь-яка вже прочитана/покинута книга.
**Data-loss risk:** ні (жодні рядки не губляться), але UX-регресія й видима хибна відображена
історія — реальна дезорієнтація користувача. **Suggested direction:** гейтувати `ReadingControls`
за статусом (не показувати "Почати читання" для `finished`/`did_not_finish`/`want_to_read` без
явного підтвердження) АБО зробити `ReadingSessionRepository.start` симетричним `updateStatus`
(теж переводити `user_book.status` у `reading`/`rereading`, якщо стартує сесія на книзі з іншим
статусом).

### F2 (High) — пост-restore `backfillAllLegacyReadingRunLinks` НЕ атомарний, збій приховується

**Доказ.** `useBackup.ts` (`src/features/backup/useBackup.ts:110-130`): `BackupRepository
.restoreAll` — одна транзакція (`withTransactionAsync`), атомарна. Але одразу після неї:
```
try {
  await backfillAllLegacyReadingRunLinks(db);
} catch (error) {
  log.error(...); // лише лог, mutation лишається успішною
}
```
Сам `backfillAllLegacyReadingRunLinks` (`src/data/db/legacyRunBackfill.ts:266-273`) викликає
чотири функції послідовно; жодна з них (`backfillLegacyReadingRuns`,
`backfillNewestFinishedRunLink`, `backfillCapsuleRunLinks`, `backfillDnfReflectionRunLinks`) сама
НЕ обгорнута в `db.withTransactionAsync` — кожен `db.runAsync` усередині циклів комітиться
окремо (autocommit). Це прямо контрастує з ОДНОРАЗОВИМИ міграціями 020-025, де migrationRunner
загортає весь `up()` (схема + backfill) в ОДНУ спільну транзакцію (`020_reading_run_backfill.ts`
docstring, рядок 74: "migrationRunner.ts як завжди огортає її в одну спільну транзакцію").

Наслідок: якщо цикл `backfillLegacyReadingRuns` впаде на N-й книзі з M (SQLite busy, диск,
неочікуваний виняток), N-1 `reading_run` рядків уже створено й закомічено, решта — ні; функції
`backfillNewestFinishedRunLink`/`backfillCapsuleRunLinks`/`backfillDnfReflectionRunLinks`
взагалі не викликаються. Restore-мутація (`useRestoreBackup`) все одно завершується `onSuccess`
— користувач бачить "бібліотеку відновлено", а насправді частина книг лишається без
`reading_run`/`reading_run_id` (той самий `session_without_run`/legacy-стан, що Фаза 27 мала
закрити), і жодної помилки не видно, окрім як через ручний запуск "Перевірки даних".

**Severity:** High (тихий частковий збій ПІСЛЯ повідомлення про успіх). **Affected flow:**
Відновлення бекапу, зроблений ДО Фази 6 (без `reading_run` у файлі), на нестабільному
пристрої/диску. **Data-loss risk:** непряма — самі дані бекапу не губляться (той крок
атомарний), але зв'язки ReadingRun можуть лишитись частково незастосованими без видимого сигналу.
**Suggested direction:** обгорнути весь виклик `backfillAllLegacyReadingRunLinks` в одну
транзакцію (або кожну з чотирьох функцій окремо) і/або довести збій до UI, а не лише в лог.

### F3 (Medium-High) — spoiler-safe "high water mark" не скидається на старт нового run

**Доказ.** `isSpoilerSafeActive`/`isAheadOfCurrentProgress` (`src/lib/spoilerSafe.ts:20,49-58`)
порівнюють позицію запису з `user_book.current_page` — ОДНИМ полем на книгу, не per-run.
`UserBookRepository.updateStatus` (перехід у `rereading`) НЕ скидає `current_page`
(`src/data/repositories/UserBookRepository.ts:212-249` — оновлюються лише `status`/`started_at`/
`finished_at`). `current_page` змінюється ЛИШЕ через `ReadingSessionRepository.finish` →
`UserBookRepository.updateCurrentPage` (рядок 218), тобто лише коли ПЕРША сесія нового run
завершиться.

Наслідок: одразу після старту перечитування (до завершення першої нової сесії) `current_page`
досі дорівнює старому фінальному значенню першого прочитання (типово — близько до
`pageCount`). `isAheadOfCurrentProgress(entry, current)` порівнює `entry.page > current.currentPage`
— практично ЖОДЕН старий запис щоденника/lore-сутності не вважається "попереду", тож
spoiler-safe filter НІЧОГО не ховає саме в момент, коли захист найпотрібніший (щойно розпочате
перечитування, читач на сторінці 1, а всі спойлери минулого проходу лежать "видимими"). Це
прямо суперечить `docs/SPOILER_SAFE.md` §"Перечитування" (рядки 103-109), яка стверджує, що
"`current_page` під час `rereading` уже й так відображає прогрес ПОТОЧНОГО прочитання" — це
правда лише ПІСЛЯ першої завершеної сесії нового run, не одразу.

`src/lib/spoilerSafe.test.ts` тестує `isSpoilerSafeActive` для статусу `rereading`, але жодного
тесту на сценарій "current_page ще не оновлений під новий run" немає (`grep "rereading"` у файлі
— лише перевірки прапорця активності, не позиції).

**Severity:** Medium-High. **Affected flow:** Spoiler-Safe Mode, книга щойно переведена в
"Перечитую". **Data-loss risk:** ні, це витік спойлерів, не втрата даних. **Suggested
direction:** або явно скидати/ігнорувати `current_page` до завершення першої сесії нового run
(показувати "все приховано" за замовчуванням), або прив'язати позицію до
`reading_session.startPage` останньої активної сесії, а не до кешованого `user_book.current_page`.

### F4 (Medium) — кілька одночасно `in_progress` run НІЧИМ не запобігаються, лише діагностуються постфактум

**Доказ.** `019_reading_run.ts`, п.4 коментаря: "Немає жорсткого DB-обмеження... `'активний'`
визначається запитом... а не жорстким UNIQUE-констрейнтом". `ReadingRunRepository.test.ts`, рядок
103: тест "кілька незавершених run одночасно — активним лишається найновіший, без корупції
стану" — тобто це не лише теоретично можливо, це ЯВНО тестований і прийнятий стан, не
помилка. Єдиний механізм, що взагалі щось про це каже користувачу — `dataIntegrityDoctor.ts`'s
`multiple_active_runs` (рядки 588-600), і той — лише діагностика на вимогу ("Перевірка даних"),
не запобіжник і не автофікс.

У комбінації з F1 це не суто гіпотетичний ризик: звичайний UI-потік (кілька випадкових тапів на
різних "start reading"-подібних елементах для однієї книги) реально здатен породити два `in_progress`
run одночасно — жоден шар (DB, репозиторій, UI) це не блокує.

**Severity:** Medium. **Affected flow:** будь-яка книга, для якої користувач стартує читання
двома різними шляхами майже одночасно. **Data-loss risk:** ні напряму, але сплутує "поточний run"
для всіх залежних сутностей. **Suggested direction:** частковий unique-індекс
`CREATE UNIQUE INDEX ... ON reading_run(user_book_id) WHERE status='in_progress' AND deleted_at
IS NULL` (SQLite підтримує partial index) або явний app-level lock у `ReadingRunRepository.start`.

### F5 (Medium) — `ReadingRunRepository.discard()` документований як "шлях відновлення помилки", але ніде не викликається

**Доказ.** `grep -rn "\.discard(" src app` (окрім самого репозиторію й тестів) — нуль
збігів для `ReadingRunRepository.discard`. Водночас `019_reading_run.ts`, п.6, прямо описує
призначення: "'скасувати' помилково розпочатий run, наприклад одразу відмінений перехід у
`rereading`". Немає жодної кнопки/дії в UI, яка викликає цей метод. У поєднанні з F1 (і навіть
без F1 — просто випадковий тап "Перечитати" з негайним поверненням статусу назад на "Прочитано"
через загальний чіп `STATUS_OPTIONS`, `app/work/[workId].tsx:423-429`, який пропонує ВСІ статуси
завжди) — `UserBookRepository.updateStatus` у цьому сценарії викличе `ReadingRunRepository.finish`
(не `discard`) для щойно створеного run: той стає постійним `status='finished'` run'ом із майже
нульовою тривалістю. Він потрапляє в `listUserBookIdsWithMultipleFinishedRuns`
(≥2 `finished` run) і НАЗАВЖДИ з'являється як окрема картка в "Як змінилася книга для тебе" —
жодного способу прибрати цей сміттєвий запис немає, оскільки `discard()` ніколи не викликається,
а м'яке видалення конкретного `reading_run` з UI взагалі не передбачене.

**Severity:** Medium. **Affected flow:** Reading Run History / Reread Comparison для будь-якої
книги з випадковим подвійним переходом статусу. **Data-loss risk:** ні (навпаки — сміттєві дані
неможливо видалити). **Suggested direction:** або підключити `discard()` до сценарію "статус
щойно повернуто назад без жодної сесії/дій у новому run", або дати UI-шлях ручного видалення
конкретного прочитання з історії.

### F6 (Medium) — `isLegacyBackfill` існує в схемі й домен-типі, але НІКОЛИ не читається жодним UI

**Доказ.** `grep -rn "isLegacyBackfill" src app` (без тестів) — лише визначення типу
(`src/types/readingRun.ts:26`) і мапінг у репозиторії (`ReadingRunRepository.ts:27,131`).
Жоден компонент (`ReadingRunsHistorySection.tsx`, `app/reread-comparison/[workId].tsx`) не
деструктурує чи не використовує це поле. `019_reading_run.ts`, п.5, документує намір: "UI/
аналітика МОЖУТЬ (не зобов'язані) показувати такий run з нижчою впевненістю". На практиці —
жодна поверхня цього не робить: користувач, чия історія перечитувань схлопнута в один
backfilled run (див. §7), бачить "Прочитання №1" у "Історії прочитань" виглядаючи буквально так
само надійно, як реально відстежене прочитання, без жодного натяку, що це реконструйований, а не
зафіксований у моменті запис.

**Severity:** Medium (прозорість/довіра до даних, не функціональний збій). **Affected flow:**
Reading Run History для будь-якої книги, мігрованої з до-V1.6.1 стану зі статусом, відмінним від
свіжо-доданої. **Data-loss risk:** ні. **Suggested direction:** невеликий бейдж/іконка
"відновлено з попередніх даних" на картці run, коли `isLegacyBackfill === true`.

### F7 (Low-Medium) — індексний аудит (Фаза 24) пропустив сам `reading_run`

**Доказ.** `026_hot_query_indexes.ts` систематично додає композитні індекси "(FK, колонка
сортування)" для `note`/`quote`/`reading_session`/`user_book` за методом "grep реальних
repository-запитів" (docstring, рядки 43-48 — навіть явно називає це "тим самим шаблоном" для
`reading_session`). Але `ReadingRunRepository.getActiveByUserBookId`/`getLatestByUserBookId`
(`ReadingRunRepository.ts:68-93`) виконують ТОЧНО той самий шаблон: `WHERE user_book_id = ?
[AND status = 'in_progress'] ... ORDER BY run_number DESC LIMIT 1` — і викликаються практично на
КОЖЕН показ Book Details, кожну зміну статусу, кожен виклик `getCurrent`/`upsertCurrent` у
`RatingRepository`/`BookMemoryRepository`/`PreReadingReflectionRepository`/`BookCapsuleRepository`.
Схема має лише одноколонковий `idx_reading_run_user_book` (`019_reading_run.ts`, рядок 66) —
жодного композитного індексу на `(user_book_id, run_number)` чи `(user_book_id, status,
run_number)` немає в жодній із міграцій 019-027. `026` явно перевіряв суміжні таблиці цього ж
ланцюга (Фаза 24 — той самий milestone V1.6.1, що й REREADING MODEL) і не згадує `reading_run`
жодним словом — ні як "додано", ні як "свідомо не додано" (на відміну від чотирьох явно
розглянутих і відхилених кандидатів, рядки 50-66 тієї ж міграції).

**Severity:** Low-Medium (реальний вплив малий — кількість run на книгу типово 1-3, тож SQLite
temp B-tree сортування тут дешеве; але це методологічна прогалина самого аудиту, а не
теоретизування). **Affected flow:** продуктивність Book Details/будь-якого екрана, що резолвить
"поточний run". **Data-loss risk:** ні. **Suggested direction:** `CREATE INDEX ... ON
reading_run(user_book_id, run_number DESC)` (або з `status` третьою колонкою для
`getActiveByUserBookId`).

### F8 (Medium) — нові/імпортовані ПІСЛЯ Фази 6 книги НЕ отримують жодного `reading_run` аж до першої дії читання

**Доказ.** `UserBookRepository.addToLibrary` (`UserBookRepository.ts:110-150`) свідомо НЕ створює
`reading_run` (докладний коментар, рядки 110-122) — і це стосується НЕ лише CSV-імпорту, а
БУДЬ-ЯКОГО додавання книги, включно з `status: 'finished'` одразу (типовий сценарій "додати вже
прочитану книгу"). Одноразовий backfill (`020_reading_run_backfill.ts`) охопив лише рядки
`user_book`, що існували НА МОМЕНТ МІГРАЦІЇ — він не запускається повторно для книг, доданих
пізніше. Наслідок: книга, додана сьогодні відразу зі статусом "Прочитано", має 0 рядків
`reading_run` — `useReadingRunsDetail` поверне порожній масив, "Історія прочитань"/кнопка
порівняння НЕ з'являються взагалі, хоча книга технічно "прочитана". Якщо користувач пізніше РЕАЛЬНО
перечитає цю книгу (стартує сесію або змінить статус на `rereading`) — `ReadingRunRepository
.start`/`getActiveByUserBookId` не знайде жодного попереднього run і створить **`run_number = 1`**
для того, що насправді є ДРУГИМ прочитанням користувача — нумерація "Прочитання №1"/"№2" в UI
буде фактично невірною (показуватиме єдиний наявний run як "Прочитання №1", хоча користувач знає,
що читав книгу двічі).

**Severity:** Medium. **Affected flow:** будь-яка книга, додана/імпортована вже на V1.6.1+ одразу
з "не-`want_to_read`" статусом. **Data-loss risk:** непряма — не втрата вже наявних даних, а
неможливість коректно змоделювати вже відому користувачу історію перечитувань наперед.
**Suggested direction:** або підключити той самий backfill-алгоритм до `addToLibrary` (з
консервативним "не вигадувати" для `startedAt`, як і зараз для legacy), або явно документувати
цю асиметрію для користувача/QA.

### F9 (Low) — цілісність ланцюга `reading_run → book_memory/capsule/pre_reading_reflection/dnf_reflection/rating` під час `restoreAll` тримається ВИКЛЮЧНО на порядку елементів ручного масиву `BACKUP_TABLE_ORDER`

**Доказ.** Усі FK на `reading_run_id` у похідних таблицях свідомо БЕЗ SQL `REFERENCES`
(докладно обґрунтовано в кожній із міграцій 020-025) — це означає, що коректність INSERT-порядку
під час `BackupRepository.restoreAll` (`src/data/repositories/BackupRepository.ts:12-85`,
`133-150`) захищена НІЧИМ, окрім того, що розробник вручну вставив `'reading_run'` рядок у
правильне місце масиву `BACKUP_TABLE_ORDER` (одразу після `'user_book'`, коментар рядки 35-46).
Це ТОЧНО та сама категорія помилки, яку Фаза 27 щойно виправила (`reading_run` взагалі був
відсутній у цьому масиві до Фази 27 — коментар рядки 37-40 прямо це визнає: "реальна прогалина...
бекап тихо ГУБИВ УСЮ історію перечитувань"). Жодного автоматизованого тесту/лінту, що перевіряв
би "усі таблиці зі схеми присутні в `BACKUP_TABLE_ORDER`", не знайдено (`BackupRepository.test.ts`
перевіряє round-trip для конкретних фікстур, не повноту списку таблиць проти живої схеми).

**Severity:** Low (уже виправлено для `reading_run` конкретно; ризик — рецидив ТІЄЇ САМОЇ
категорії для майбутньої таблиці). **Affected flow:** Backup/Restore, будь-яка майбутня нова
таблиця. **Data-loss risk:** так, потенційно, для БУДЬ-ЯКОЇ майбутньої таблиці, яку розробник
забуде дописати в масив — точно як сталося з `reading_run` до Фази 27. **Suggested direction:**
тест, що звіряє `BACKUP_TABLE_ORDER` проти списку реальних таблиць схеми (`sqlite_master`), а не
проти фіксованих фікстур.

---

## 5. READING RUN — ПОВНИЙ АРХІТЕКТУРНИЙ АУДИТ

### Схема (`019_reading_run.ts`, `CODE VERIFIED`)

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

Жодних ALTER пізніше (перевірено — жодна з 020-027 не змінює саму таблицю `reading_run`, лише
її залежних; `026_hot_query_indexes.ts` теж не торкається `reading_run`, див. F7).

**Домен-тип** (`src/types/readingRun.ts`, Zod-схема): `id`, `userBookId`, `runNumber` (int,
positive), `status` (`'in_progress'|'finished'|'did_not_finish'`), `startedAt`, `finishedAt`
(nullable), `isLegacyBackfill` (bool), `createdAt`, `updatedAt`, `deletedAt` (nullable) — 1:1 з
колонками, без розбіжностей.

**Foreign keys.**
- `reading_run.user_book_id → user_book(id) ON DELETE CASCADE` — ЄДИНИЙ реальний SQL FK у всьому
  ланцюзі. Видалення `user_book` (тільки фізичне — `remove()` у застосунку робить лише м'яке
  видалення, `UserBookRepository.remove`) каскадно прибрало б і всі його `reading_run`. У
  застосунку рядки `user_book` фізично не видаляються (лише `deleted_at`), тому цей CASCADE
  спрацьовує ТІЛЬКИ під час `BackupRepository.restoreAll` (`DELETE FROM user_book` у транзакції
  restore) — і саме тому порядок видалення в `restoreAll` (реверс `BACKUP_TABLE_ORDER`) видаляє
  `reading_run` ще ДО `user_book`, щоб не покладатись на сам CASCADE для порядку.
- `book_memory.reading_run_id`, `pre_reading_reflection.reading_run_id`,
  `book_capsule.reading_run_id`, `dnf_reflection.reading_run_id`, `rating.reading_run_id`,
  `reading_session.reading_run_id` — **жоден із шести НЕ має SQL `REFERENCES reading_run(id)`**
  (свідомий, багаторазово задокументований вибір, задля уникнення "тихого обнулення при
  rebuild-міграції" — той самий урок, що й `008_note_category.ts`). Цілісність цих шести
  зв'язків тримається виключно на рівні застосунку (репозиторії ніколи не встановлюють значення,
  що не існує; `reading_run` ніколи не видаляється жорстко, лише `discard()`).

### Індекси

- `idx_reading_run_user_book` (`user_book_id`) — 019, єдиний.
- Немає індексу на `(user_book_id, run_number)`, `(user_book_id, status)`, `status` окремо — див.
  F7 §4.

### Статус-лайфцикл — enum чи вільний текст?

`CHECK (status IN ('in_progress','finished','did_not_finish'))` на рівні SQL + Zod-enum на
рівні TS — подвійно зафіксований enum, НЕ вільний рядок (на відміну, наприклад, від
`note.reaction`/`shelf.theme`, які свідомо вільні). Три значення, СВІДОМО НЕ дублюють
`UserBookStatus` (`'want_to_read'|'reading'|'paused'|'rereading'|'finished'|'did_not_finish'`) —
`reading_run.status` фіксує лише "чим скінчилось саме прочитання", а не поточний UI-стан
бібліотечної картки (`019_reading_run.ts`, п.3).

### Відношення до `UserBook`

`user_book_id NOT NULL` — run завжди належить конкретному примірнику книги користувача
(`user_book`), НЕ `work` (твору каталогу) — той самий рівень, що й `reading_session`/
`dnf_reflection`. Один `user_book` → 0..N `reading_run` (0 — книга ще ніколи не читалась
реально, чи додана напряму без підключення до Фази 7, див. F8).

### Відношення до `ReadingSession`

`reading_session.reading_run_id` — nullable TEXT, БЕЗ SQL FK (`020_reading_run_backfill.ts`).
1 run → 0..N сесій. Детальніше — §9.

### Відношення до Memory / Before-After / Capsule / DNF / Rating

| Таблиця | Колонка | UNIQUE? | Резолвінг "поточного" |
|---|---|---|---|
| `book_memory` | `reading_run_id` | так, `UNIQUE(reading_run_id)` (021, rebuild) | `getLatestByUserBookId` — динамічно щоразу |
| `pre_reading_reflection` | `reading_run_id` | так (022, rebuild) | `getLatestByUserBookId` — динамічно щоразу |
| `book_capsule` | `reading_run_id` | **ні** (023, проста `ADD COLUMN`) | резолвиться РАЗ, у момент `create()`, назавжди |
| `dnf_reflection` | `reading_run_id` | так (024, rebuild) | `getLatestByUserBookId` — динамічно щоразу |
| `rating` | `reading_run_id` | так (025, rebuild) | `getLatestByUserBookId` — динамічно щоразу |

Усі п'ять — `reading_run_id` NULLABLE, з фолбеком "книжковий" запис (`reading_run_id IS NULL`)
для книг без жодного run (F8). Капсула — єдина, що НЕ ре-резолвиться динамічно (`023_book_capsule
_run.ts`, обґрунтування: капсула — знімок одного моменту завершення, а не "живий" запис, що
можна редагувати повторно для того самого run).

---

## 6. READING RUN LIFECYCLE

### Валідні переходи (як реалізовано, `UserBookRepository.updateStatus`, `CODE VERIFIED`,
`AUTOMATED TEST VERIFIED` — `UserBookRepository.test.ts`, describe "прив'язка reading_run (Фаза
7)")

| Перехід `user_book.status` | Дія над `reading_run` |
|---|---|
| → `reading`/`rereading`, активного `in_progress` run НЕМАЄ | `ReadingRunRepository.start` — новий run, `run_number` = MAX+1 |
| → `reading`/`rereading`, активний `in_progress` run УЖЕ Є (напр. `paused → reading`) | нічого — пауза лишається в межах того самого run |
| → `finished`/`did_not_finish`, активний run Є | `ReadingRunRepository.finish` (ідемпотентно) |
| → `finished`/`did_not_finish`, активного run НЕМАЄ | нічого — свідомо "не вигадувати" |
| → `paused`/`want_to_read` | нічого |

Тест, що прямо покриває повний цикл: `UserBookRepository.test.ts` рядок 276 ("`finished →
rereading`: створює ДРУГИЙ run") і рядок 293 ("`rereading → did_not_finish`: завершує ДРУГИЙ run
...; `did_not_finish → reading` створює ТРЕТІЙ").

### Невалідні переходи — що реально відбувається

- **Два одночасно активні run.** НЕ забороняється ані схемою (немає `UNIQUE`/partial index на
  `status='in_progress'`), ані репозиторієм (`start()` не перевіряє наявність активного run
  перед вставкою — перевірку робить ЛИШЕ виклик збоку, `updateStatus`/`ReadingSessionRepository
  .start`, і обидва мають race-вікно, див. F1/F4). "Активний" — це ЗАПИТ (`ORDER BY run_number
  DESC LIMIT 1`), не констрейнт: коли їх кілька, найновіший "перемагає" мовчки, старший
  лишається `in_progress` назавжди, невидимий жодному UI. `CODE VERIFIED` +
  `AUTOMATED TEST VERIFIED` (`ReadingRunRepository.test.ts:103`, `dataIntegrityDoctor.test.ts`
  рядок 446 "дві одночасно активні (`in_progress`) run для однієї книги" — тест на ДІАГНОСТИКУ,
  не на запобігання).
- **Завершити вже завершений run.** `ReadingRunRepository.finish` — явно ідемпотентний:
  `if (!existing || existing.finishedAt) return existing;` (рядок 149) — повторний виклик
  повертає незмінений рядок, нічого не перезаписує. `AUTOMATED TEST VERIFIED`
  (`ReadingRunRepository.test.ts:134`, "повторний виклик — ідемпотентно").
- **Почати перечитування, поки перший run ще активний.** Неможливо через звичайний UI-шлях
  `updateStatus` (гілка `!activeRun` не спрацює — активний run уже є, статус міняється без
  нового run). АЛЕ можливо через `ReadingSessionRepository.start`'s власний "graceful" фолбек
  на ІНШІЙ книзі водночас (не тій самій — `getActiveSession` глобальний, одна активна сесія на
  весь застосунок одразу, `ReadingSessionRepository.ts:73-84`) — нерелевантно тут. Для ТІЄЇ
  САМОЇ книги: див. F1 — можливо ОБІЙТИ цю гарантію через "Почати читання" без зміни статусу,
  створивши другий `in_progress` run поки перший (пов'язаний зі статусом "фінішовано") лишається
  формально останнім "фінішованим", а не "активним" — тобто це не "два активних одночасно" в
  строгому сенсі (перший run уже `finished`), а сам факт "новий run стартував без явного дозволу
  користувача".
- **Абандонувати (DNF) вже завершений run.** Неможливо через `updateStatus`: перехід у
  `did_not_finish` шукає `activeRun` (лише `in_progress`); якщо найновіший run уже `finished` —
  `activeRun` = null → гілка `finish` не спрацьовує, НІЧОГО не змінюється в `reading_run` (сам
  `user_book.status` усе одно стає `'did_not_finish'` — див. §8 про цю розбіжність).
- **Видалити активний run.** `discard()` — м'яке видалення, доступне для БУДЬ-ЯКОГО run
  незалежно від статусу (жодної перевірки `status` усередині). Ніде не викликається з UI (F5),
  тож на практиці недосяжно для користувача, але на рівні репозиторію ніщо не заважає видалити
  навіть щойно розпочатий активний run — після цього `getActiveByUserBookId` більше його не
  бачить, і наступний `updateStatus`/`start()` створить НОВИЙ run із номером, що не
  перевикористовує видалений (`run_number` рахується з урахуванням `deleted_at`,
  `AUTOMATED TEST VERIFIED` — `ReadingRunRepository.test.ts:169`).
- **Сесія, призначена на вже завершений run.** Технічно можлива: `ReadingSessionRepository
  .start` резолвить run через `getActiveByUserBookId` (лише `in_progress`) — якщо всі run книги
  вже `finished`/`did_not_finish`, це поверне `null`, і `start()` створить НОВИЙ run (не
  прикріпить сесію до старого завершеного). Тобто пряме "сесія на вже завершений run" код
  **не допускає** — він завжди або знаходить активний, або створює новий. Єдиний шлях, яким
  сесія опиняється прив'язаною до `finished`/`did_not_finish` run — заднім числом, через
  backfill (§7), де це очікувано (сесії ІСТОРИЧНО належали вже завершеному прочитанню).

---

## 7. LEGACY BACKFILL

`backfillLegacyReadingRuns` (`src/data/db/legacyRunBackfill.ts:75-131`, спільний код для
`020_reading_run_backfill.ts` і пост-restore шляху) обробляє КОЖЕН `user_book`, що ще не має
жодного `reading_run` — незалежно від `deleted_at`.

| Категорія книги (`user_book.status`) | Що ТОЧНО відомо | Що ЕВРИСТИКА | Що НЕМОЖЛИВО і тому відкинуто |
|---|---|---|---|
| **`finished`** | `started_at` (якщо є) | `finished_at`: пріоритет `user_book.finished_at` → найпізніший `reading_session.ended_at` → `user_book.updated_at` (останній — це вже здогадка, а не факт) | Якщо книгу читали й закінчували кілька разів (рідкісний стан для "просто finished", але можливий, якщо стара кнопка перемикання статусу використовувалась туди-сюди) — усі проміжні цикли схлопуються в один `finished` run |
| **`reading`/`paused`** (активно читається зараз, уперше) | `started_at` | — | — (немає втрати: це справді перше й єдине прочитання) |
| **`rereading`** (АКТИВНО перечитується НА МОМЕНТ міграції) | Що книга КОЛИСЬ була прочитана і зараз перечитується | `started_at` беруть ЯК Є (оригінальний, від ПЕРШОГО прочитання) — тобто цей ОДИН `in_progress` legacy-run охоплює ввесь час від оригінального старту до "зараз", включно з часом, коли книга фактично була `finished` між першим і поточним прочитанням | **Точна дата завершення ПЕРШОГО прочитання ВТРАЧАЄТЬСЯ БЕЗПОВОРОТНО.** `user_book.finished_at` (заморожена дата першого завершення, `docs/V1_6_FULL_AUDIT_REPORT.md` розд. 23 п.1) свідомо НЕ переноситься — інакше run одночасно "фінішований" і "активний". Якщо користувач реально перечитував книгу 3 рази до цього моменту — усі 3 реальні цикли схлопуються в ОДИН `in_progress` run (`020_reading_run_backfill.ts`, рядки 43-51 і §"Задокументована втрата інформації" `docs/READING_RUN.md:114-124` — це прямо визнано в документації, включно з формулюванням "СВІДОМО не намагається відновити") |
| **`did_not_finish`** | `started_at` (якщо є) | `finished_at`: `dnf_reflection.created_at` (найточніший наявний сигнал) → `user_book.updated_at` | Якщо книгу кидали кілька разів до Фази 6 (адже до 024 `dnf_reflection` мала `UNIQUE(user_book_id)` — лише ОДИН знімок міг існувати фізично) — той самий "один legacy run" ефект, хоч тут дані для кількох спроб і так фізично не збереглись раніше |
| **`want_to_read`** із `started_at` (аномалія даних) | — | трактується консервативно як `in_progress` | — |
| **Сесії (`reading_session`)** | Усі сесії книги (включно з м'яко видаленими) прив'язуються до ЄДИНОГО legacy run | — | Розрізнити, яка сесія належала якому РЕАЛЬНОМУ історичному прочитанню (якщо їх було кілька) — неможливо: усі просто зливаються під один run |
| **Book Memory / Before-After / Rating** (`backfillNewestFinishedRunLink`) | Рядок фізично існував до Фази 8/9/12 | Прив'язується до НАЙНОВІШОГО `finished`/`did_not_finish` run книги, інакше найновішого взагалі | Якщо запис насправді стосувався ПЕРШОГО прочитання (не найновішого) — прив'язка все одно йде на найновіший (найбезпечніший вибір за замовчуванням, не завжди фактично коректний) |
| **Capsule** (`backfillCapsuleRunLinks`) | Кілька капсул на книгу могли існувати вже ДО Фази 10 | Кожна капсула — окремо, до НАЙБЛИЖЧОГО за часом `finished`/`did_not_finish` run (`finished_at <= capsule.created_at`, найновіший серед таких) | Якщо капсула створена значно пізніше за реальний момент завершення (нетиповий, але можливий кейс) — прив'язка може вказати на "неправильний" (пізніший) run |
| **DNF-знімок** (`backfillDnfReflectionRunLinks`) | — | Найближчий "знизу" `did_not_finish` run (`finished_at <= created_at`), інакше НАЙНОВІШИЙ `did_not_finish` run книги (навіть якщо технічно ПІЗНІШЕ за `created_at`) — цей другий фолбек ЯВНО документований як "краще прив'язати до правильного за ТИПОМ run'у з неідеальним часом" | Якщо жодного `did_not_finish` run немає взагалі (аномалія) — `reading_run_id` лишається `NULL` |

**Явний висновок для книг зі статусом `rereading` на момент міграції:** так, підтверджено прямим
читанням коду й документації — реальна історія в 2-3+ окремих прочитань схлопується в ОДИН
`in_progress` legacy run, точна дата завершення першого прочитання губиться назавжди, і (F6)
жоден UI-індикатор не сигналізує користувачу, що саме сталось із його даними під час оновлення.
`AUTOMATED TEST VERIFIED` для механіки backfill (`legacyRunBackfill.test.ts`), але НЕ для
"користувач був повідомлений" — такого повідомлення не існує.

---

## 8. USERBOOK VS READINGRUN — РОЗПОДІЛ ВІДПОВІДАЛЬНОСТІ

| Поле | `user_book` | `reading_run` | Хто пише ПІСЛЯ Фази 7 |
|---|---|---|---|
| `status` | `'want_to_read'\|'reading'\|'paused'\|'rereading'\|'finished'\|'did_not_finish'` — UI-стан картки | `'in_progress'\|'finished'\|'did_not_finish'` — результат ОДНОГО прочитання | ОБИДВА — `UserBookRepository.updateStatus`, в одній транзакції |
| `startedAt` | Дата ПЕРШОГО переходу в `reading`/`rereading`, ніколи не перезаписується вдруге (`current.startedAt ?? ...`, `UserBookRepository.ts:217-218`) | Дата старту КОЖНОГО run окремо | `user_book.startedAt` — лише РАЗ за все життя книги; `reading_run.startedAt` — при КОЖНОМУ новому run |
| `finishedAt` | **ДВІ конкуруючі точки правди, що реально розходяться** — див. нижче | Дата завершення КОЖНОГО run окремо | обидва пишуться `updateStatus`, АЛЕ з різною семантикою |
| `currentPage` | Єдине джерело "поточної сторінки" — оновлюється `ReadingSessionRepository.finish` (`UserBookRepository.updateCurrentPage`) | **Не існує в `reading_run` взагалі** — немає такого поля | лише `user_book` |
| Історичні дати завершення (минулі проходи) | НЕ зберігаються (`finished_at` — лише останнє/перше значення залежно від переходів) | `finished_at` кожного окремого `reading_run` — це і є єдине джерело "коли саме завершився прохід №N" | лише `reading_run` |

### Дві конкуруючі точки правди на `finished_at` — підтверджено

`UserBookRepository.updateStatus` (рядки 219-220):
```ts
const finishedAt =
  status === 'did_not_finish' ? null : current.finishedAt ?? (status === 'finished' ? now : null);
```
— тобто `user_book.finished_at` ставиться РАЗ при першому переході в `'finished'` і БІЛЬШЕ
НІКОЛИ не змінюється (`current.finishedAt ?? ...` — якщо вже є значення, воно зберігається),
**ЗА ВИНЯТКОМ** явного скидання в `null` при переході в `did_not_finish` (P0-фікс Фази 1 V1.6.1,
коментар рядки 199-211). Тобто: книга, прочитана вперше 2024 року (`user_book.finished_at` =
"2024"), потім перечитана й ЗНОВУ прочитана 2026 року (`updateStatus('finished')` вдруге) —
`current.finishedAt` УЖЕ НЕ `null` (лишилось "2024" з першого разу) → `finished_at` НЕ
оновлюється на "2026". **`user_book.finished_at` НАЗАВЖДИ лишається датою ПЕРШОГО завершення**,
навіть якщо книгу перечитано й завершено вдруге, втретє.

Водночас `reading_run.finished_at` для КОЖНОГО окремого run пишеться правильно й незалежно
(`ReadingRunRepository.finish`, ідемпотентний лише В МЕЖАХ ОДНОГО run, не крос-run).

**Хто "перемагає".** Це залежить від СПОЖИВАЧА, і саме тут — реальна архітектурна
непослідовність:
- `ActivityHistoryRepository`/"Моя історія"/On This Day (`src/data/repositories
  /ActivityHistoryRepository.ts`, за назвою модуля й коментарями в `useUpdateUserBookStatus.ts`
  рядки 66-68) читають `user_book.finishedAt` як подію `book_finished` — тобто ці поверхні й
  ДАЛІ показують ТІЛЬКИ дату ПЕРШОГО завершення для книги, яку відтоді перечитали й завершили
  повторно, навіть коли `reading_run` має точну, окрему, коректну дату кожного завершення.
- `ReadingRunsHistorySection`/"Як змінилася книга для тебе" читають `reading_run.finishedAt` —
  показують ПРАВИЛЬНІ, окремі дати кожного прочитання.

Тобто на ОДНІЙ і тій самій книзі "Моя історія" й "Історія прочитань" МОЖУТЬ показувати різні дати
завершення для того самого проходу — `user_book.finished_at` є фактично "замороженим" полем, яке
`reading_run` мав замінити концептуально, але жодна з поверхонь, що споживають
`user_book.finished_at` напряму (Activity History/On This Day), не була переведена на
`reading_run` як частину REREADING MODEL (Фази 6-13 торкались лише Book Details/Memory/Capsule/
Before-After/DNF/Rating — не Activity History). **Це прямий, задокументований у самому коді
(коментар `UserBookRepository.updateStatus`, рядки 205-210) компроміс**: "user_book лишається
'поточним станом полиці', не записом кожного окремого прочитання... Правильне, run-aware джерело
правди... з'явиться разом із ReadingRun" — тобто автор коду сам визнає цю розбіжність як
незакриту, хоч `reading_run` вже й існує вже 12 фаз.

`applyImportedDates` (Goodreads CSV) пише НАПРЯМУ в `user_book.started_at`/`finished_at`
(`COALESCE`), обходячи взагалі всю модель `reading_run` — узгоджується з F8 (§4): імпортовані
книги не мають run, тож "друге джерело правди" тут навіть не виникає — просто `reading_run`
відсутній.

---

## 9. SESSION → RUN CONSISTENCY

**Схема.** `reading_session.reading_run_id TEXT` — nullable (`020_reading_run_backfill.ts`,
`ALTER TABLE reading_session ADD COLUMN reading_run_id TEXT;`), БЕЗ `NOT NULL`, БЕЗ SQL
`REFERENCES`.

**Інваріант, який КОД НАМАГАЄТЬСЯ підтримувати для НОВИХ сесій:** "кожна сесія, створена ПІСЛЯ
Фази 7, завжди має `reading_run_id`". Єдина точка створення сесій у застосунку —
`ReadingSessionRepository.start` (`grep` підтверджує: жодного іншого `INSERT INTO
reading_session` у кодовій базі поза цим методом і тестами/бекфілом). Сам метод гарантує це
через власний фолбек: спершу шукає активний run (`getActiveByUserBookId`), якщо немає —
**сам створює новий** (рядки 108-118), в одній транзакції із самим `INSERT` сесії. Тобто
структурно НЕМОЖЛИВО створити нову сесію з `reading_run_id = NULL` через звичайний шлях
`ReadingSessionRepository.start` — `readingRunId` завжди буде або наявним активним run, або
щойно створеним.

**Чи справді нема іншого шляху створити сесію.** `grep -rn "INSERT INTO reading_session"` за
межами `ReadingSessionRepository.ts` і `legacyRunBackfill`/тестів — не знайдено. Отже інваріант
"нова сесія завжди має run" тримається — АЛЕ не через SQL `NOT NULL` (свідомо не додано — той
самий "не ламай legacy-рядки" принцип), а виключно через дисципліну єдиної точки входу. Будь-яка
майбутня зміна (новий repository-метод, прямий SQL-патч для міграції даних тощо) може порушити
цей інваріант без жодного попередження від схеми.

**Legacy-сесії (до Фази 7).** `reading_run_id = NULL` — ЛЕГІТИМНО лише для сесій, записаних до
backfill (Фаза 6b), і ЛИШЕ якщо backfill не зміг визначити `started_at` для їхньої книги
("книга ніколи не була розпочата" — рядок 101, `legacyRunBackfill.ts`) — на практиці, за
коментарем, це `want_to_read`-книги без жодної сесії, тобто **на практиці таких "сирітських"
сесій узагалі НЕ повинно існувати**, оскільки сесія, що існує, доводить, що книга БУЛА
розпочата (сесія має `started_at`), а `backfillLegacyReadingRuns` бере `started_at` з
`user_book.started_at ?? sessionAggregate?.min_started_at` — тобто якщо є хоч одна сесія, `min_
started_at` завжди визначений, і run СТВОРЮЄТЬСЯ. Отже `reading_run_id = NULL` на практиці мав
би бути НЕДОСЯЖНИМ станом для реальних (не тестових) даних — але Data Doctor все одно перевіряє
це (`session_without_run`, `dataIntegrityDoctor.ts` рядок 559-567) як захисну сітку "про всяк
випадок" ("ймовірно, застарілий запис").

**Data Doctor, релевантне саме для session↔run (без повного аудиту Data Doctor, який поза
межами цієї секції):**
- `session_without_run` — сесія з `readingRunId === null` (рядки 559-567).
- `run_session_mismatch` — сесія посилається на `reading_run_id`, що ІСНУЄ, але належить ІНШІЙ
  книзі (рядки 571-582) — цей стан НЕ мав би виникнути через звичайний код (run завжди
  резолвиться за `params.userBookId` тієї самої сесії), тобто це перевірка на пошкодження
  даних (ручне редагування БД, баг у майбутньому коді, збій бекапу), не на відомий сценарій.

**Висновок.** Інваріант "сесія завжди має run" для НОВИХ сесій підтримується коректно на
практиці (єдина точка входу, `CODE VERIFIED`), але НЕ на рівні схеми (`nullable`, без FK) — це
свідомий, документований компроміс заради уникнення "тихого обнулення" при майбутньому rebuild
`reading_run` (та сама причина, що й в усіх п'яти інших залежних таблицях). Крихкість:
цілісність тримається на дисципліні "усі INSERT йдуть через один репозиторій-метод", не на
DB-гарантії.

---

## 10. RIREADING — РЕАЛЬНІ СЦЕНАРІЇ

### Сценарій A — Перше прочитання завершено, перечитування через рік

1. **Run:** run #1 (`finished`, `finishedAt` = реальна дата завершення). Рік по тому —
   `updateStatus('rereading')`: `activeRun` = null (run #1 finished) → `ReadingRunRepository
   .start` створює run #2 (`in_progress`, `startedAt` = зараз).
2. **Сесії:** нові сесії автоматично прив'язуються до run #2 (`getActiveByUserBookId` знаходить
   його).
3. **Memory/Capsule/Before-After/Rating:** усі "поточні" (`getCurrent`) для run #1 лишаються
   доступними через `getByReadingRunId(run1.id)`, але `getCurrent`/`getLatestByUserBookId`
   ТЕПЕР резолвлять run #2 — Book Details одразу показує "порожні" секції для нового run (це
   ОЧІКУВАНА поведінка, задокументована багато разів), а не втрачені дані run #1.
4. **DNF:** немає (run #1 не DNF).
5. **Activity History:** `book_finished` для run #1 (2024) і далі показує ту саму (першу) дату —
   §8, оскільки `user_book.finished_at` не оновиться, доки run #2 не завершиться `finished`
   ВДРУГЕ (і навіть тоді — НЕ оновиться, бо `current.finishedAt` уже не `null`, §8). **Явна
   неоднозначність:** якщо run #2 завершиться (Прочитано вдруге), Activity History НЕ покаже
   нову подію "книгу завершено" з правильною (новою) датою — це розбіжність з тим, що показує
   "Історія прочитань"/reread-comparison.
6. **Calendar:** сесії run #2 позначаються "Перечитування, прохід 2" у деталях дня
   (`app/day/[date].tsx`, `runNumberBySessionId`) — коректно, `CODE VERIFIED`.
7. **Spoiler-Safe:** див. F3 — одразу після старту run #2, до завершення першої нової сесії,
   старі спойлери НЕ ховаються (стаціонарний `current_page`).

### Сценарій B — Перше прочитання DNF, друга спроба завершена

1. **Run:** run #1 (`did_not_finish`, `finishedAt` = `dnf_reflection.created_at` того ж моменту
   переходу — `DnfReflectionRepository.captureIfMissing`, викликаний з `useUpdateUserBookStatus
   .ts` одразу ПІСЛЯ `updateStatus`). Друга спроба — `updateStatus('reading')`: `activeRun` =
   null → run #2 (`in_progress`).
2. **DNF-знімок:** `dnf_reflection` для run #1 лишається доступним через `getByReadingRunId`.
   Якщо друга спроба ТЕЖ завершиться DNF — `captureIfMissing` резолвить run #2 (найновіший на
   момент виклику, вже `did_not_finish` після `finish()`) і створить ОКРЕМИЙ, ДРУГИЙ
   `dnf_reflection` (унікальність тепер `UNIQUE(reading_run_id)`, не `UNIQUE(user_book_id)`) —
   ОБИДВА DNF-знімки зберігаються незалежно, коректно.
3. **Rating/Memory/Capsule:** якщо run #1 не мав жодного (типово для DNF — користувач рідко
   оцінює покинуту книгу), run #2 стартує "чистим" — очікувано.
4. **Reread Comparison:** run #1 (`did_not_finish`) НЕ включений у `selectComparableRuns` (лише
   `finished`) — порівняння взагалі не активується, доки НЕ буде ≥2 `finished` run. Якщо run #2
   успішно завершиться — це ПЕРШИЙ `finished` run книги → все одно недостатньо для порівняння
   (потрібно ≥2 `finished`). **Явна неоднозначність:** користувач, що прочитав книгу один раз
   успішно ПІСЛЯ однієї невдалої спроби, НЕ побачить "Як змінилася книга для тебе" взагалі — це
   технічно правильно (нема з чим порівнювати), але формулювання кнопки/секції не пояснює, чому
   саме "ще нема 2 прочитань", коли користувач формально "перечитував" один раз.

### Сценарій C — Фінішовано → перечитування → DNF перечитування → третя спроба, завершена

1. **Run:** run #1 (`finished`) → run #2 (`in_progress` → `did_not_finish`, через `DNF`) → run
   #3 (`in_progress` → `finished`).
2. **Rating/Memory/Capsule/Before-After для run #2:** технічно можливі (нічого не забороняє
   писати спогад/рейтинг для DNF run, `getLatestByUserBookId` резолвить run #2, доки він
   "найновіший"), АЛЕ капсула для run #2 НЕМОЖЛИВА (`canCreateCapsule` вимагає `status ===
   'finished'`).
3. **Reread Comparison:** показує ЛИШЕ run #1 і run #3 (обидва `finished`) — run #2 (DNF)
   **повністю виключений** із порівняння й картки "Δ" між run #1 і run #3 — читання, час,
   DNF-досвід run #2 НІКОЛИ не потрапляють у це порівняння, навіть попри те, що це реальний,
   повноцінний історичний цикл читання цієї книги. **Явна неоднозначність:** для книги з
   реальною, змістовною "невдалою спробою" між двома успішними прочитаннями UI мовчки
   "перестрибує" через неї — ані самé порівняння, ані `ReadingRunsHistorySection` (яка ЯВНО
   показує всі 3 run, включно з DNF) не попереджають користувача, що середній прохід "не
   рахується" для порівняння.
4. **DNF-знімок run #2** зберігається окремо й коректно (§Сценарій B, п.2).

### Сценарій D — Книга імпортована (Goodreads CSV / restore бекапу) з історичними датами, БЕЗ сесій

1. **Run:** **ЖОДНОГО** — `addToLibrary` НЕ створює run (§4 F8), і жодного пізнішого тригера
   немає, доки книга не отримає РЕАЛЬНУ дію (сесія/зміна статусу). `applyImportedDates` пише
   напряму в `user_book.started_at`/`finished_at`, оминувши `reading_run` цілком.
2. **Reading Run History/Comparison:** `useReadingRunsDetail` повертає `[]` (рядок 62,
   `runs.length === 0`) → секція "Історія прочитань" на Book Details фактично НЕ рендерить
   жодного run-запису (порожній масив у `ReadingRunsHistorySection`), кнопка порівняння відсутня.
3. **Rating/Memory/Capsule/Before-After:** усі фолбечать на "книжковий" запис (`reading_run_id
   IS NULL`) — ПРАЦЮЮТЬ коректно (це саме той шлях, що існував до всієї REREADING MODEL), просто
   поза межами нового UI.
4. **Явна неоднозначність:** якщо користувач ПІЗНІШЕ реально перечитає таку книгу — перший
   реальний `reading_run`, що буде створено, отримає **`run_number = 1`** (немає попереднього
   run, з яким рахувати) — попри те, що це фактично ВЖЕ друге прочитання книги користувачем
   (перше — те, що імпортоване). Нумерація "Прочитання №1" в UI буде вводити в оману. Немає
   способу (ані автоматичного, ані ручного через UI) позначити імпортовану книгу як "мала одне
   попереднє прочитання до застосунку".
5. **Restore старого бекапу (до Фази 6):** окремо покритий Фазою 27 — `backfillAllLegacyReadingRunLinks`
   ЗАПУСКАЄТЬСЯ автоматично після `restoreAll` і поводиться як звичайний backfill (§7), З
   ЗАСТЕРЕЖЕННЯМ атомарності (F2, §4).

---

## 11. «ЯК ЗМІНИЛАСЯ КНИГА ДЛЯ ТЕБЕ»

**Файли:** `app/reread-comparison/[workId].tsx` (екран), `src/features/reading-runs
/useReadingRunsDetail.ts` (дані, спільні з "Історією прочитань"), `src/lib/rereadComparison.ts`
(чисті обчислення).

**Правило доступності (eligibility).** `selectComparableRuns` (`useReadingRunsDetail.ts:87-89`)
— фільтрує `run.status === 'finished'`; екран (і кнопка-вхід у `ReadingRunsHistorySection.tsx:32`)
показується лише коли `comparableRuns.length >= 2`. Перевіряється ДВІЧІ незалежно — і в
компоненті, що показує кнопку входу, і всередині самого екрана (`RereadComparisonScreen`,
рядок 198: `comparableRuns.length < 2` → пояснювальний текст "Порівняння з'являється, коли книгу
прочитано (до кінця) щонайменше двічі") — захист від прямої навігації за URL, коли стан устиг
змінитися.

**Джерела даних.** `useReadingRunsDetail` вантажить `ReadingRunRepository.listByUserBookId` +
`ReadingSessionRepository.listByUserBookId` ОДИН раз, потім `Promise.all` по кожному run —
`RatingRepository.getByReadingRunId`, `BookMemoryRepository.getByReadingRunId`,
`PreReadingReflectionRepository.getByReadingRunId`, `BookCapsuleRepository.getByReadingRunId`,
`DnfReflectionRepository.getByReadingRunId`, плюс `computeRunReadingStats` над сесіями,
**відфільтрованими по `session.readingRunId === run.id`** (рядок 73) — сесії різних run НЕ
конфлюються: підтверджено прямим читанням коду, кожен run бачить ЛИШЕ свої сесії.

**Логіка порівняння.** Хронологічний порядок (`run_number ASC`); між сусідніми картками —
`DeltaCard` (`app/reread-comparison/[workId].tsx:139-168`), рахує `computeNumericDelta` для
ОЦІНКИ й ЧАСУ ЧИТАННЯ (`totalDurationSeconds`) — ЄДИНІ два числові виміри; `diff: null`, коли
бракує даних з будь-якого боку (`rereadComparison.ts:89-95`) — НЕ показує вигаданий 0.

**Порожні стани.** `< 2` порівнюваних run → пояснювальний текст (не порожній екран). Картка
окремого run без жодного контенту (`!rating && !beforeAfter && !capsule && !memory`) → "Для
цього прочитання ще не збережено жодної нотатки — лише дати й час читання" (рядок 126-130) —
явний, не порожній fallback.

**ЩО порівнюється:** оцінка (`rating.value`), відгук (`rating.review`), очікувана оцінка "До"
vs факт (`beforeAfter.expectedRating` vs `rating.value`), капсула
(`oneSentenceMemory`/`lastingThought`), спогад (`memory.reflection`), дні читання
(`stats.daysSpent`), сумарний час читання (`stats.totalDurationSeconds`), домінантний
`readingExperience` серед сесій run.

**ЩО НЕ порівнюється:** DNF-знімки взагалі не показуються на екрані порівняння
(`ReadingRunDetail.dnf` завантажується в хуку, але `app/reread-comparison/[workId].tsx` НІКОЛИ
не деструктурує/не рендерить `dnf` — `RunCard`, рядок 41, бере лише `{ run, rating, memory,
beforeAfter, capsule, stats }`, БЕЗ `dnf`); кількість сторінок/прогрес; нотатки/цитати щоденника
самі по собі (лише опосередковано через капсулу/спогад, якщо користувач сам їх туди вписав);
run зі статусом `did_not_finish`/`in_progress` взагалі не потрапляють у порівняння (Сценарій C,
§10).

### Рейтинг — дійсно per-run, чи це лише видимість?

**Перевірено пряме твердження завдання: рейтинг СПРАВДІ per-run, не єдиний глобальний рядок,
що просто показується інакше.** Докази:
1. Схема (`025_rating_run.ts`): `UNIQUE(reading_run_id)`, НЕ `UNIQUE(user_book_id)` — фізично
   МОЖЛИВО мати кілька рядків `rating` на одну книгу, по одному на run.
2. `RatingRepository.upsertCurrent` (`RatingRepository.ts:129-168`) резолвить
   `ReadingRunRepository.getLatestByUserBookId` і записує/оновлює рядок, ПРИВ'ЯЗАНИЙ САМЕ до
   ЦЬОГО run (`existing` шукається через `getForBookAndRun(db, userBookId, readingRunId)`, не
   просто "останній рейтинг книги") — рейтинг, виставлений під час run #2, НЕ перезаписує
   рейтинг run #1: обидва рядки існують у БД одночасно, кожен зі своїм `reading_run_id`.
3. `useReadingRunsDetail`/`reread-comparison` читають рейтинг САМЕ через
   `getByReadingRunId(run.id)` для КОЖНОЇ картки окремо — картка run #1 показує рейтинг run #1,
   картка run #2 — рейтинг run #2, `DeltaCard` рахує РІЗНИЦЮ між ними. Це не один глобальний
   рейтинг, перефарбований під різні картки — це справді два незалежні рядки.
4. `RatingRepository.listByUserBookIds` (батч для Wrapped/Сезонів/Профілю/"Цього дня") —
   **СВІДОМО НЕ per-run**, повертає НАЙНОВІШИЙ рейтинг книги (з тай-брейком по `rowid` — рядки
   96-103, знайдено власним тестом на рівність `created_at`). Це ОКРЕМИЙ, явно задокументований
   вибір для агрегатних поверхонь ("оцінка книги" для статистики), не помилка чи недогляд.

**Обмеження, яке варто зазначити явно:** Book Details (`RatingSection`, через `useRating.ts` →
`RatingRepository.getCurrent`/`upsertCurrent`) у БУДЬ-ЯКИЙ момент показує/редагує РІВНО ОДНУ
оцінку — оцінку "поточного" (найновішого) run. Немає UI, що дозволяв би користувачу, перебуваючи
на Book Details ПІД ЧАС активного перечитування, побачити АБО відредагувати оцінку ПОПЕРЕДНЬОГО
(уже завершеного) run — єдиний спосіб побачити стару оцінку паралельно з новою — це саме екран
"Як змінилася книга для тебе" (і лише коли є ≥2 `finished` run). Тобто технічно per-run
зберігання є повним і коректним, але UI-доступ до "не поточної" оцінки — вузький, лише через
один спеціалізований екран, не через звичайний Book Details. Це узгоджується з дизайном
(`docs/READING_RUN.md` §"Фаза 12"), але варто підкреслити явно як межу можливостей, а не
приховану деталь.
## 12. BOOK MEMORY — НОВА МОДЕЛЬ

**Гейтинг екрана дійсно змінено з "одного запису" на "будь-яке джерело".** `app/memory/[workId].tsx` (компонент `MemoryCardScreen`, POLYTSIA V1.6.1 Фаза 13, коментар рядки 412-426) явно документує заміну старого гейту `!memory` на новий `hasAnyMemoryData` (рядки 460-475):

```ts
const hasAnyMemoryData =
  !!memory ||
  !!preReadingReflection ||
  !!capsule ||
  (allEntries?.length ?? 0) > 0 ||
  (loreEntities?.length ?? 0) > 0 ||
  (readingRuns?.length ?? 0) > 0 ||
  (sessions?.length ?? 0) > 0;
```

CODE VERIFIED: екран рендерить змістовний порожній стан (Hero + пояснення + кнопка "До книги") лише коли **жодне** з семи джерел не існує; будь-яке одне з них (навіть щоденникові записи без жодного `book_memory`) відкриває весь хаб.

**Секції, що рендеряться незалежно одна від одної** (кожна має власну умову видимості, не спільний гейт):
- «Історія прочитань» (`ReadingRunsHistorySection`) — лише коли `readingRuns.length > 0` (рядок 676).
- «Підсумковий спогад» (картка-спогад, шаблон, поділитися/зберегти) — рендериться завжди, коли `hasAnyMemoryData` істинний, незалежно від того, чи є сам `memory` (`reflection`/`entryRefs` фолбечать на `null`/`[]`, вибір шаблону сам створює перший запис — коментар рядки 682-686).
- «До/Після» (`BeforeAfterSection`) — лише коли `preReadingReflection` існує (рядок 752).
- Капсула (`BookCapsuleSection`) — власна умова `!capsule && !canCreateCapsule(status)` → `null` (рядок 183).
- «Пригадування» (`RecallSection`) — `null`, якщо капсули нема (рядок 255).
- `ReadingExperienceTimeline`/`JournalTimeline` — самі вирішують, чи є що показати.
- «Повернутися до цих думок» (`RevisitLaterSection`) — `null`, якщо позначених записів нема (рядок 140).
- «Світ книги» (`LoreSection`) — рендериться ЗАВЖДИ, коли є `userBook` (легке запрошення, коментар рядок 457-459).

**Статуси книги.** Екран доступний для будь-якого статусу, за яким `useBookDetails` повертає `userBook` — включно з `'reading'`/`'rereading'` (саме тому весь spoiler-safe апарат на цьому екрані взагалі існує, див. розділ 18). Для DNF-книг секції фолбечать на `DnfReflectionRepository`/`ReadingRunRepository` так само, як і для звичайного `finished` — окремого гейту "лише для дочитаних" немає ніде в цьому файлі.

Evidence: CODE VERIFIED (`app/memory/[workId].tsx:412-800`).

---

## 13. ПАМ'ЯТЬ НА КОЖЕН RUN

**Обмеження до/після.** `004_book_memory.ts` мала `UNIQUE(user_book_id)`. Міграція `021_book_memory_run.ts` (Фаза 8) робить class rebuild (`book_memory_new` + `INSERT…SELECT` + `DROP` + `RENAME`, `manualTransaction = true`, `PRAGMA foreign_keys OFF/ON` навколо, `PRAGMA foreign_key_check` одразу після) і замінює обмеження на `reading_run_id TEXT UNIQUE` (`user_book_id` більше НЕ унікальний). CODE VERIFIED — рядки 52-75 файлу міграції.

**Backfill.** Частина 2 міграції (`backfillNewestFinishedRunLink`, `src/data/db/legacyRunBackfill.ts`) прив'язує кожен наявний (до rebuild — щонайбільше один на книгу) рядок `book_memory` до найновішого `finished`/`did_not_finish` run книги, інакше — до найновішого run узагалі, інакше лишає `reading_run_id = NULL`.

**Незалежність Run #1 від Run #2 — підтверджено кодом і тестами.** `BookMemoryRepository.upsertCurrent` (`src/data/repositories/BookMemoryRepository.ts:127-181`) щоразу заново резолвить "поточний" run через `ReadingRunRepository.getLatestByUserBookId`, шукає рядок саме для цього `reading_run_id` (`getForBookAndRun`, рядки 67-79) і лише тоді вирішує INSERT/UPDATE. Оскільки `reading_run_id` — окрема UNIQUE-колонка (а не частина складеного ключа з `user_book_id`), другий `upsertCurrent` для нового run фізично не може зачепити рядок першого run — WHERE-запит по-різному резолвить `existing.id`.

AUTOMATED TEST VERIFIED: `BookMemoryRepository.test.ts`, `describe('BookMemoryRepository — перечитування: новий run отримує ОКРЕМИЙ спогад, старий не затирається')` (рядок 86) з двома тестами: `getCurrent повертає null (новий run ще без спогаду), старий спогад лишається доступним за id run` (рядок 87) і `upsertCurrent для нового run створює ОКРЕМИЙ рядок; listByUserBookId бачить обидва` (рядок 111).

Той самий патерн (rebuild + `reading_run_id UNIQUE` + динамічна ре-резолюція `getCurrent`/`upsertCurrent`) один-в-один повторено для `pre_reading_reflection` (`022`, розділ 15), `rating` (`025`, розділ 17); `dnf_reflection` (`024`, розділ 16) той самий rebuild, але БЕЗ фолбеку "найновіший run узагалі" (лише `did_not_finish`-кандидати — архітектурно обґрунтовано в коментарі міграції). `book_capsule` (`023`) — єдиний виняток: не rebuild, а проста `ADD COLUMN` без UNIQUE, оскільки множинність капсул на книгу була дозволена й раніше (детально — розділ 14).

Evidence: CODE VERIFIED (`021_book_memory_run.ts`, `BookMemoryRepository.ts`), AUTOMATED TEST VERIFIED (`BookMemoryRepository.test.ts:86-141`).

---

## 14. КАПСУЛА / RECALL ПІСЛЯ READINGRUN

**`book_capsule.reading_run_id` — так, підтверджено.** `023_book_capsule_run.ts`: `ALTER TABLE book_capsule ADD COLUMN reading_run_id TEXT` (nullable, без `UNIQUE`, без SQL `REFERENCES`), плюс `backfillCapsuleRunLinks` — для КОЖНОЇ капсули окремо (не "один run на всі капсули книги") шукає найближчий у часі завершений run, чий `finished_at <= capsule.created_at`.

**`capsule_recall.book_capsule_id`** — зв'язок існував з `013_capsule_recall.ts` (`REFERENCES book_capsule(id) ON DELETE CASCADE`) і не змінювався цією фазою; `CapsuleRecallRepository.create`/`listByBookCapsuleId` завжди працюють через конкретний `bookCapsuleId`, не через `userBookId` чи run — recall прив'язаний до capsule, а capsule — до run, тож ланцюжок коректний. CODE VERIFIED (`CapsuleRecallRepository.ts:29-59`).

**"Остання капсула перемагає" — прибрано частково, не повністю; архітектурно навмисний дуалізм.** `BookCapsuleRepository` (`src/data/repositories/BookCapsuleRepository.ts`) дає ДВА різні read-методи, свідомо не об'єднані (коментар рядки 79-100):
- `getByUserBookId` — найновіша капсула КНИГИ ЗАГАЛОМ (`ORDER BY created_at DESC LIMIT 1`), незалежно від run — це те, що показують `app/capsule/[workId].tsx` (перегляд) і `app/recall/[workId].tsx` (recall), обидва через хук `useBookCapsule`.
- `getCurrent` — капсула САМЕ поточного (найновішого) run; `null`, якщо для поточного run капсули ще нема, навіть коли старіші існують. Використовується `useCurrentBookCapsule` у `BookCapsuleSection` (`app/memory/[workId].tsx`), щоб коректно запропонувати НОВУ капсулу для щойно завершеного перечитування, не приховуючи стару.

Це означає: **"остання капсула перекриває" модель ФОРМАЛЬНО ще жива на екранах перегляду й recall** — `app/capsule/[workId].tsx`/`app/recall/[workId].tsx` завжди показують найновішу капсулу книги, а не капсулу конкретного (наприклад, першого) прочитання. Прямої навігації "відкрити капсулу саме Run #1" з UI НЕМАЄ — `router.push` на ці екрани йде лише з параметром `workId`, без `runId`/`capsuleId` (`app/memory/[workId].tsx:203-207`, `app/completion/[workId].tsx`). **Відповідь на пряме запитання ТЗ "чи може користувач відкрити капсулу першого прочитання після початку другого" — НІ**, як тільки для Run #2 з'явиться власна капсула (`getByUserBookId` почне повертати саме її). До того моменту (поки Run #2 ще не має власної капсули) стара капсула лишається видимою — це і є поведінка, яку `canOfferNewCapsule`/`BookCapsuleSection` явно розрізняють (`app/memory/[workId].tsx:185-233`).

Дані НЕ втрачені — `BookCapsuleRepository.listByUserBookId`/`getByReadingRunId` існують і покриті тестами (`BookCapsuleRepository.test.ts:471-551`, розділ `REREADING MODEL, Фаза 10`), але жоден екран цей список наразі не рендерить — коментар над `listByUserBookId` сам це визнає: "Поки що UI показує лише `getByUserBookId` (найновішу), але метод потрібен вже зараз для repository-тестів і майбутнього UI списку" (`BookCapsuleRepository.ts:202-204`). Це — прямий, чесний CODE VERIFIED розрив між схемою (готова до множинних капсул на run) і UX (показує лише одну).

Виняток — `app/reread-comparison/[workId].tsx` (розділ Фази 12): там капсула КОЖНОГО run показана окремою карткою через `useReadingRunsDetail`/`BookCapsuleRepository.getByReadingRunId` (розділ 17 дає деталі цього хука). Тобто доступ до капсули конкретного старого run технічно можливий — лише не з самого екрана капсули/recall, а з екрана порівняння прочитань.

**Recall-нагадування НЕ deep-link'ає на конкретну капсулу/run — задокументоване, а не приховане обмеження.** `src/lib/notifications.ts` не реєструє жодного `Notifications.addNotificationResponseReceivedListener` — підтверджено grep по всьому `app/`+`src/` (жодного збігу). `docs/RECALL.md:131-132` прямо каже: "у застосунку взагалі немає інфраструктури tap-to-navigate для жодного типу нагадування (`reminder`/`goal`/капсула)". Отже тап на нотифікацію капсули просто відкриває застосунок на його типовому екрані (Home), а не капсулу/run, для якого нагадування було заплановане. Це НЕ "відкриває не той run" (гірший сценарій) — гірше: не відкриває взагалі нічого конкретного. Задокументовано як свідомий, а не забутий пробіл.

Evidence: CODE VERIFIED (`023_book_capsule_run.ts`, `BookCapsuleRepository.ts`, `app/capsule/[workId].tsx`, `app/memory/[workId].tsx`, `src/lib/notifications.ts`), AUTOMATED TEST VERIFIED (`BookCapsuleRepository.test.ts:471-551`), підтверджено `docs/RECALL.md`.

---

## 15. BEFORE / AFTER ПІСЛЯ READINGRUN

`022_pre_reading_reflection_run.ts` — той самий rebuild-ідіом, що й `book_memory`: `UNIQUE(user_book_id)` → `UNIQUE(reading_run_id)` (nullable). `PreReadingReflectionRepository.upsertCurrent`/`getCurrent` (`src/data/repositories/PreReadingReflectionRepository.ts:104-135`) динамічно резолвлять "поточний" run через `ReadingRunRepository.getLatestByUserBookId` при кожному виклику — та сама конструкція, що й Book Memory (розділ 13).

**Run #2 отримує свою нотатку "До", Run #1 не чіпається** — CODE VERIFIED тим самим механізмом `getForBookAndRun` за `reading_run_id`, AUTOMATED TEST VERIFIED: `PreReadingReflectionRepository.test.ts:42-127` включає прямий тест на незалежність від run (`'run уже є (in_progress) → нотатка "До" прив'язується до нього'`) і тест `'нотатка лишається доступною через getCurrent і ПІСЛЯ завершення свого run — так її читає порівняння До/Після на Book Memory'` (рядок 128) — саме про сценарій, коли книга вже `finished`, а `getCurrent` (не `getActiveByUserBookId`) все одно знаходить правильну нотатку.

**Порівняння показує ПРАВИЛЬНИЙ run, не завжди найновіший — підтверджено на двох незалежних поверхнях:**
1. `app/memory/[workId].tsx` → `BeforeAfterSection` — показує `usePreReadingReflection(userBookId)` (тобто `getCurrent`, ПОТОЧНИЙ run) поряд з `memory?.reflection`/`rating?.value` (теж `getCurrent`) — усі три джерела на цьому екрані узгоджено читають дані одного й того самого поточного run, тож порівняння "До" з "Після" не змішує різні прочитання.
2. `app/reread-comparison/[workId].tsx` (Фаза 12, "Як змінилася книга для тебе") — тут порівнюються ВСІ завершені run одночасно: `useReadingRunsDetail` завантажує `PreReadingReflectionRepository.getByReadingRunId(db, run.id)` для КОЖНОГO run окремо (`src/features/reading-runs/useReadingRunsDetail.ts:60-71`), тож кожна картка `RunCard` показує саме "До" ТОГО прочитання, а не найновіше "До" для всіх карток.

Evidence: CODE VERIFIED (`022_pre_reading_reflection_run.ts`, `PreReadingReflectionRepository.ts`, `useReadingRunsDetail.ts`), AUTOMATED TEST VERIFIED (`PreReadingReflectionRepository.test.ts:42-128`).

---

## 16. DNF ПІСЛЯ READINGRUN

`024_dnf_reflection_run.ts` — той самий rebuild, `UNIQUE(user_book_id)` → `UNIQUE(reading_run_id)`, АЛЕ backfill відрізняється від `021`/`022`/`025`: немає фолбеку "найновіший run узагалі" — лише `did_not_finish`-кандидати (архітектурно обґрунтовано в коментарі: DNF-знімок концептуально не може належати `finished`/`in_progress` run).

**Другий DNF не перезаписує перший.** `DnfReflectionRepository.captureIfMissing` (`src/data/repositories/DnfReflectionRepository.ts:112-127`) резолвить поточний run і робить `INSERT` лише якщо для ЦЬОГО `reading_run_id` рядка ще нема (`getForBookAndRun` за run) — не за `userBookId`. AUTOMATED TEST VERIFIED: `DnfReflectionRepository.test.ts:110-162`, `describe('DnfReflectionRepository — перечитування: новий run отримує ОКРЕМИЙ DNF-знімок, старий не перезаписується')`, включно з `'покинута вдруге книга отримує ДРУГИЙ знімок; перший лишається доступним за id свого run'` і `'run, що завершився finished, НЕ отримує власного DNF-знімка й не показує чужий'`.

**Статистика "фінішовано" виключає DNF-книги — але лише на рівні `user_book`, не `reading_run`.** `useOverallStatistics` (`src/features/statistics/useStatistics.ts:37-40`) рахує `booksFinishedAllTime`/`booksFinishedThisYear` через `UserBookRepository.listStatusOnly(db, 'finished')` — жорстко фільтрує за поточним `user_book.status === 'finished'`, DNF-книги в цей запит структурно не потрапляють. Це коректно виключає DNF, але лічильник вважає книгу "прочитаною" рівно 0 чи 1 раз — незалежно від того, скільки разів її фактично дочитували в межах REREADING MODEL (кожен `finished` run не додає окремої одиниці до статистики; статистика лишається book-level, не run-level, попри те, що `reading_run` тепер дозволяє рахувати саме такі речі). Це НЕ баг (не суперечить жодному явному вимозі), але прогалина в поширенні REREADING MODEL на статистику — `docs/READING_RUN.md` не згадує статистику взагалі.

**Activity History НЕ має події DNF взагалі — незалежно від run.** `ActivityHistoryRepository.ts` будує стрічку з восьми `UNION ALL`-гілок (`ACTIVITY_UNION_SQL`, рядки 87-165): `session_completed`, `book_started`, `book_finished`, `book_added`, `rating_added`, `journal_entry`, `quote`, `shelf_addition`. Жодна гілка не читає `dnf_reflection` чи `status = 'did_not_finish'` — підтверджено прямим grep (`dnf_reflection`/`did_not_finish` — 0 збігів у файлі). Питання "чи показує Activity History правильну DNF-подію для правильного run" — **не застосовне: DNF-подія в Activity History відсутня як клас, для будь-якого run.**

**Пов'язана, серйозніша знахідка (CODE VERIFIED, невідома жодному документу REREADING MODEL):** подія `'book_finished'` в Activity History (`ActivityHistoryRepository.ts:107-111`) читає `ub.finished_at` (єдине мутабельне поле на `user_book`, НЕ `reading_run.finished_at`), з фіксованим `id = ub.id || ':finished'` — тобто щонайбільше ОДНА подія "книгу завершено" на книгу за весь час, і саме той момент, коли вона сталась ПЕРШИЙ раз. `UserBookRepository.updateStatus` (рядок 220): `finishedAt = status === 'did_not_finish' ? null : current.finishedAt ?? (status === 'finished' ? now : null)` — вираз `current.finishedAt ?? …` означає, що коли `user_book.finished_at` вже має значення (з першого прочитання), ПОВТОРНЕ завершення (Run #2) його НЕ оновлює. Коментар над самою функцією (рядки 194-210) прямо визнає це як свідомо мінімальний, локальний фікс "до того моменту, коли з'явиться run-aware `ReadingRun`" — і `ReadingRun` УЖЕ існує в цьому ж мілстоуні (Фаза 6+), проте `updateStatus`/Activity History НІКОЛИ не були перероблені на джерело `reading_run.finished_at`. Практичний наслідок: **завершення перечитування (Run #2, #3…) не породжує нової події `book_finished` в Activity History і не зсуває дату вже наявної події** — стрічка активності мовчки показує дату ПЕРШОГО прочитання назавжди, навіть коли книгу щойно передочитали. `docs/READING_RUN.md` цей розрив не згадує (перевірено grep — 0 збігів "Activity History"/"book_finished").

Evidence: CODE VERIFIED (`024_dnf_reflection_run.ts`, `DnfReflectionRepository.ts`, `ActivityHistoryRepository.ts:87-165`, `UserBookRepository.ts:194-220`), AUTOMATED TEST VERIFIED (`DnfReflectionRepository.test.ts:110-162`), NOT VERIFIED — чи власник продукту взагалі знає про цей розрив (жодної згадки в `docs/READING_RUN.md`/CHANGELOG).

---

## 17. МОДЕЛЬ РЕЙТИНГУ

**Схема: `UNIQUE(reading_run_id)`, підтверджено напряму з файлу міграції.** `025_rating_run.ts:42-63` — той самий rebuild-ідіом, `rating_new` з `reading_run_id TEXT UNIQUE` (nullable, без SQL `REFERENCES`), `DROP`+`RENAME`, `PRAGMA foreign_key_check`. Старе `UNIQUE(user_book_id)` знято повністю.

**UI справді дає РІЗНІ рейтинги для різних run — не лише формально в схемі.** Два різні шляхи, обидва підтверджені кодом:

1. **Book Details (`RatingSection`, через `useRating`/`useSetRating`, `src/features/book-details/useRating.ts`)** — `useRating` викликає `RatingRepository.getCurrent` (не `getByUserBookId` — коментар у файлі репозиторію прямо каже, що Фаза 12 прибрала цей метод), `useSetRating` → `upsertCurrent`. Обидва динамічно резолвлять "поточний" run при кожному виклику. Це означає: користувач НІЧОГО спеціального не робить — просто ставить оцінку як завжди, а `upsertCurrent` сама створює НОВИЙ рядок рейтингу для нового run замість перезапису старого. Це — найважливіший практичний факт: рейтинг per-run працює "з коробки", без нової UI-механіки.
2. **`app/reread-comparison/[workId].tsx`** — кожна картка `RunCard` показує `rating?.value`/`rating?.review` САМЕ того run (`detail.rating`, з `RatingRepository.getByReadingRunId`), і `DeltaCard` явно обчислює `computeNumericDelta(from.rating?.value, to.rating?.value)` між сусідніми прочитаннями — тобто UI буквально показує "оцінка +1.5" між Run #1 і Run #2. Це прямий, готовий UI для порівняння різних оцінок різних прочитань.

**Продуктовий висновок, без розмиття:** це НЕ "схема готова, а UI ще не наздогнав" — і схема, і Book Details (редагування), і окремий екран порівняння (перегляд) УЖЕ узгоджено реалізують per-run рейтинг як свідоме продуктове рішення, задокументоване в CHANGELOG (`## POLYTSIA V1.6.1, Фаза 12`) і в самому коментарі `RatingRepository.ts:8-15` ("рейтинг не був навіть ЗГАДАНИЙ у жодній із попередніх фаз REREADING MODEL... прогалина виявлена лише зараз, при проєктуванні порівняння прочитань").

**Побічна знахідка — застарілий коментар усередині коду.** `useRating.ts:66` (`useRemoveRating`) стверджує "`rating` видаляється жорстко (без `deleted_at`)", але фактична реалізація `RatingRepository.remove` (Фаза 26, SOFT-DELETE READINESS) робить `UPDATE rating SET deleted_at = ?` — м'яке видалення, не `DELETE`. Коментар не оновлений після Фази 26; поведінково не небезпечно (сам метод коректний), але вводить в оману читача коду. CODE VERIFIED (`src/features/book-details/useRating.ts:60-72` проти `src/data/repositories/RatingRepository.ts:159-163`).

**"Рейтинг-історія на кожен run" як майбутня опція.** Логічно ПОСЛІДОВНО з тим, що вже знайдено: `listByUserBookId` (усі рейтинги книги, Фаза 12, вже існує й покритий тестами) — готовий будівельний блок; єдине, чого бракує — окремого екрана "історія оцінок" поза контекстом повного порівняння прочитань (`reread-comparison` показує рейтинг лише серед іншого багатого контенту). Це виправдана, невелика UX-ітерація: дані, репозиторій і навіть приклад рендерингу (`RunCard`) вже існують — не вигадана "фіча заради фічі".

Evidence: CODE VERIFIED (`025_rating_run.ts`, `RatingRepository.ts`, `useRating.ts`, `app/reread-comparison/[workId].tsx`), AUTOMATED TEST VERIFIED (`RatingRepository.test.ts:91-127`).

---

## 18. ЦЕНТРАЛІЗАЦІЯ SPOILER-SAFE

`src/lib/spoilerSafe.ts` — чисті функції, без SQL/React/`new Date()` усередині:
- `isSpoilerSafeActive(status, spoilerSafeEnabled)` — `true` лише коли прапорець увімкнено І `status` є `'reading'`/`'rereading'`.
- `isAheadOfCurrentProgress(entry, current)` — порівнює `page` (пріоритет), фолбек на `progressPercent`; консервативно повертає `false` ("не приховувати"), якщо позицію взагалі не можна довести з жодного боку.
- `filterSpoilerSafeJournalEntries`/`filterSpoilerSafeLoreEntities` — однокнижний фільтр масиву (для екранів, де `active`/`current` обчислюються один раз на весь екран).
- `isSpoilerHidden(position, context)` + `deriveSpoilerContext` — багатокнижна версія (об'єднує обидві функції вище в один виклик із контекстом на кожен рядок), для поверхонь, де кожен запис може належати іншій книзі.

| Поверхня | Журнал | Lore | Реlevance run | Фільтрується? | Ручний reveal? | Evidence |
|---|---|---|---|---|---|---|
| Book Details (`app/work/[workId].tsx`) | так | так | так — доступний під час `rereading` | ТАК, `filterSpoilerSafeJournalEntries`/`filterSpoilerSafeLoreEntities` напряму (рядки 1156-1159, 689-690) | ТАК — "Ще N приховано режимом «без спойлерів»" (рядок 1374-1376) — єдиний екран з явним лічильником | CODE VERIFIED |
| Book Memory (`app/memory/[workId].tsx`) | так | так | так | ТАК — `visibleSelectedEntries`/`visibleAllEntries` через `filterSpoilerSafeJournalEntries` (рядки 573-580), `LoreSection` через `filterSpoilerSafeLoreEntities` (рядок 322) | ні (тиха фільтрація, задокументоване свідоме відкладення — `docs/SPOILER_SAFE.md`) | CODE VERIFIED |
| JournalTimeline (компонент, у Book Memory) | так | — | так | ТАК — отримує вже відфільтрований `visibleAllEntries` | ні | CODE VERIFIED |
| Lore (`app/lore/[workId].tsx`) | — | так | так | ТАК | ні | CODE VERIFIED |
| Recap (`app/recap/[workId].tsx`) | так | — | так | ТАК — `filterSpoilerSafeJournalEntries` (рядок 89) | ні | CODE VERIFIED |
| Search (`app/(tabs)/search.tsx` → `JournalRepository.searchFeed`) | так | — | так (мультикнижна) | ТАК — фільтр на рівні репозиторію через `isFeedRowSpoilerHidden`→`isSpoilerHidden` (`JournalRepository.ts:601-608`) | ні | CODE VERIFIED |
| On This Day (`src/lib/onThisDay.ts#applySpoilerRules`) | так | — | так | ТАК — перевикористовує `isAheadOfCurrentProgress` напряму (рядок 269) | ні | CODE VERIFIED |
| Calendar day preview (`app/day/[date].tsx`) | опосередковано (через `ActivityEvent.entryText`) | — | так | ТАК — дані йдуть через `ActivityHistoryRepository.listBetween`, уже відфільтрований | ні | CODE VERIFIED |
| Activity History (`ActivityHistoryRepository`) | так (лише `journal_entry`/`quote` з 8 типів) | — | так | ТАК — `isActivityRowSpoilerHidden`→`isSpoilerHidden` (рядки 44-58) | ні | CODE VERIFIED |
| Season share (`SeasonCardPreview.tsx`) | так (`journalHighlight.text`) | — | побічно (highlight з `listFeedPage`) | ТАК опосередковано — `journalHighlight` іде через уже відфільтрований `JournalRepository.listFeedPage` (`useReadingSeason.ts:102`) | ні | CODE VERIFIED — **АЛЕ `docs/SPOILER_SAFE.md:133` хибно стверджує "NOT APPLICABLE — жоден текст запису не рендериться"; насправді `SeasonCardPreview.tsx:235-240` рендерить `data.journalHighlight.text`.** Функціонально безпечно (дані вже фільтровані на вході), але документ описує неіснуючу поведінку. |
| Memory share (картка `MemoryCardPreview`) | так | — | так | ТАК — `entries={visibleSelectedEntries}` (`app/memory/[workId].tsx:699`) | ні | CODE VERIFIED |
| Recall (`app/recall/[workId].tsx`) | так | — | так — капсула лишається доступною й під час перечитування | ТАК — `visibleEntries` через `filterSpoilerSafeJournalEntries` (рядки 107-111) | ні | CODE VERIFIED |
| Global Journal (`app/journal/index.tsx` → `listFeedPage`) | так | — | так (мультикнижна) | ТАК — той самий `isFeedRowSpoilerHidden` (`JournalRepository.ts:527`) | ні (лічильники навмисно нефільтровані) | CODE VERIFIED |

Три поверхні з таблиці ТЗ `docs/SPOILER_SAFE.md` (Character Detail, Lore Entity Detail, Completion) **відсутні в офіційному переліку "14 поверхонь" документа взагалі** — це саме ті три, де знайдено реальний обхід (розділ 19).

Evidence: CODE VERIFIED для всіх рядків вище; невідповідність документа — CODE VERIFIED проти `docs/SPOILER_SAFE.md` (документ не перевіряв фактичний рендер, лише намір).

---

## 19. ПОШУК РЕГРЕСІЙ SPOILER-SAFE

Пошук по всьому `src/`+`app/` за прямим використанням `allEntries`/`useJournalEntries` без подальшої фільтрації через `filterSpoilerSafeJournalEntries`/`isSpoilerHidden` виявив **ТРИ реальні, конкретні обходи** централізованої політики — жоден з них не входить до офіційного переліку "14 поверхонь" у `docs/SPOILER_SAFE.md` (розділ 18):

### 1. Character Detail — `app/characters/[workId]/[entityId].tsx:144,291-309`
```ts
const { data: allEntries } = useJournalEntries(userBookId);   // рядок 144, СИРИЙ масив
...
{(allEntries ?? []).map((entry) => (
  <LinkableEntryRow key={entry.id} entry={entry} ... />        // рядок 297, без фільтра
))}
```
`LinkableEntryRow` (рядки 75-123) рендерить `entry.text` напряму (рядок 119) разом з номером сторінки (рядок 116) — пікер "прив'язати запис щоденника до персонажа" показує ВСІ записи книги, включно з тими, що попереду поточного прогресу перечитування. Екран доступний під час `'reading'`/`'rereading'` (персонажі/лор доступні мід-читання, той самий інваріант, що документований для `LoreSection` на цьому ж екрані Book Details). Жодного імпорту `spoilerSafe` у файлі немає.

### 2. Lore Entity Detail — `app/lore/[workId]/[entityId].tsx:151,303-309` (`entry.text` на рядку 119)
Буквально ідентичний патерн, той самий `LinkableEntryRow`, продубльований локально в іншому файлі — той самий обхід, той самий брак фільтра.

### 3. Completion screen — `app/completion/[workId].tsx:114,91,220,259` — **найсерйозніший з трьох**
```ts
const { data: allEntries } = useJournalEntries(userBookId);   // рядок 114, СИРИЙ
const pickerEntries = favorites && favorites.length > 0 ? favorites : (allEntries ?? []);  // рядок 127
```
Жодного імпорту `@/lib/spoilerSafe` у файлі (перевірено — 0 збігів). `entry.text` рендериться напряму на рядках 91, 259 (пікер вибору записів для картки-спогаду). Критично: цей екран доступний НЕ ЛИШЕ одразу після першого завершення книги — `app/work/[workId].tsx:452-460` показує кнопку "Переглянути підсумок читання", яка веде саме сюди, **за умови `userBook.status === 'finished' || userBook.status === 'rereading'`**. Тобто під час активного перечитування книги (`status === 'rereading'`, коли `isSpoilerSafeActive` за визначенням активний) користувач може відкрити той самий екран `/completion/[workId]`, що показує пікер щоденника й попередній перегляд картки-спогаду — обидва з СИРИМИ, невідфільтрованими записами першого прочитання, включно з тими, що містять спойлери за межами поточного прогресу перечитування. Це пряма суперечність з тим самим інваріантом, який `app/memory/[workId].tsx` (сестринський екран з ідентичною секцією `BookCapsuleSection`/картка-спогад) коректно реалізує.

**Ніяких інших обходів не знайдено** — усі інші прямі споживачі `useJournalEntries`/`allEntries` (`app/work/[workId].tsx`, `app/memory/[workId].tsx`, `app/capsule/[workId].tsx`, `app/capsule/[workId]/edit.tsx`, `app/recall/[workId].tsx`, `app/recap/[workId].tsx`) або фільтрують явно через `filterSpoilerSafeJournalEntries`, або (Book Details) фільтрують через локальну еквівалентну змінну `entries` (рядок 1159). `JournalRepository.listPage`/`listByUserBookId` самі НЕ фільтрують (навмисно — однокнижні екрани фільтрують клієнтською стороною), а мультикнижні `listFeedPage`/`searchFeed` фільтрують централізовано на рівні репозиторію (розділ 18) — архітектура послідовна скрізь, крім трьох файлів вище.

Evidence: CODE VERIFIED для всіх трьох (`app/characters/[workId]/[entityId].tsx`, `app/lore/[workId]/[entityId].tsx`, `app/completion/[workId].tsx`, перехресна перевірка з `app/work/[workId].tsx:452-460`).

---

## 20. БЕЗПЕКА GOOGLE BOOKS

**Архітектура.** Мобільний застосунок → (опційно) `google-books-proxy` Edge Function → `www.googleapis.com/books/v1`. Клієнт (`src/data/providers/GoogleBooksProvider.ts`) вибирає шлях через `isGoogleBooksProxyConfigured()` (з `src/data/remote/googleBooksProxyClient.ts`) — прапорець `EXPO_PUBLIC_GOOGLE_BOOKS_PROXY_ENABLED === '1'` + наявність `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`.

**Ключ дійсно прибрано з клієнтського бандла — CODE VERIFIED, а не декларативно.** Grep по всьому `src/`+`app/` за `GOOGLE_BOOKS_API_KEY`/`EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY` дає лише коментарі, що ПОЯСНЮЮТЬ відсутність (жодного `process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY` виклику ніде в клієнтському коді). `GoogleBooksProvider.ts:10-38` явно документує: провайдер БІЛЬШЕ НЕ читає цю змінну; коли проксі не налаштовано, клієнт робить прямий АНОНІМНИЙ запит до Google Books (`fetchVolumesDirect`, без будь-якого ключа) — деградація квоти, не діра безпеки. `.env.example:16-17` теж явно попереджає власника прибрати застарілий `EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY=...` рядок зі свого локального `.env`, якщо він там ще лишився з доміграційної версії.

**Важливий нюанс, вартий уваги:** proxy — це opt-in через `EXPO_PUBLIC_GOOGLE_BOOKS_PROXY_ENABLED`, а не автоматичний дефолт. Якщо власник продукту НЕ виставив цей прапорець у білді, застосунок і далі робить прямі анонімні запити до `googleapis.com` з КЛІЄНТА, минаючи rate-limit/секрет Edge Function повністю — але й без жодного ключа, який можна вкрасти, тож залишковий ризик тут — лише нижча Google-квота, не витік секрету.

**Валідація вводу** (`supabase/functions/google-books-proxy/index.ts`): `op` обмежений трьома значеннями (рядок 230), `query.length` — 2-200 символів (рядки 246-253), `isbn.length` — 10-13 символів (рядки 270-272), `externalId` — непорожній рядок (рядки 285-287). CODE VERIFIED.

**Rate limiting** — `checkRateLimitWindows` (спільний `_shared/rateLimit.ts`), два вікна: `burst` 30 запитів/60с, `sustained` 2000/добу (рядки 52-55), за IP-адресою (`x-forwarded-for`), durable через Postgres RPC `edge_rate_limit_check`. "Fail open" при недоступності самого rate-limit-сервісу (`_shared/rateLimit.ts:22-27`, свідомий компроміс, задокументований у коментарі).

**Timeout** — `UPSTREAM_TIMEOUT_MS = 8_000` (рядок 44), `AbortController`, повертає `504`/`timeout` при перевищенні.

**Нормалізація помилок — коректна, без витоку сирого тіла клієнту.** `fetchGoogleBooks` (рядки 182-211): на не-OK статус Google Books сире тіло відповіді логується лише СЕРВЕРНО (`console.error`, рядок 189), клієнту йде лише `Google Books HTTP ${status}` (рядок 190) — жодних деталей провайдера в JSON-відповіді. Захист від "response size bomb" — `readBodyWithLimit`, реальний підрахунок байтів під час стріму (не покладання на `Content-Length`), ліміт 2 МБ (рядок 47).

**Секрет** — `Deno.env.get('GOOGLE_BOOKS_API_KEY')` (рядок 42), Supabase secret, НЕ обов'язковий (Google Books працює й без ключа з нижчою квотою — `withApiKey` додає ключ лише якщо він є, рядки 177-180).

**CI** — `docs/EDGE_FUNCTION_CI.md` документує окремий job `edge-functions` (`.github/workflows/ci.yml`, підтверджено — рядок 95: `edge-functions:`), що запускає `deno check supabase/functions`/`deno lint supabase/functions` на кожен push/PR у `main`, паралельно з Node CI. CI VERIFIED (job існує в конфігурації); документ чесно визнає, що сам `deno`-раннер недоступний з мережі сесії аудиту, тож фактичний перший прогін (CI run #80) верифіковано постфактум — знайдено й виправлено реальну помилку типів (`TS2769` у `cover-upload/index.ts`), що підтверджує: job реально виконується на GitHub Actions, а не є декоративним. `deno test` свідомо не додано — 0 `*.test.ts` файлів у `supabase/functions/**` (перевірено — жоден тестовий файл не знайдено для жодної з трьох функцій).

**Fallback якщо проксі недоступний** — ТАК, і це задокументована, свідома поведінка (не забутий edge case): анонімний прямий виклик до Google Books (`fetchVolumesDirect`), той самий шлях, що спрацьовує й коли прапорець просто не виставлений. Пошук книг ніколи не "ламається" повністю — це прямо протиставлено `ISBNdbProvider`, який структурно `isEnabled = isIsbndbProxyConfigured()` (без проксі — джерело вимкнене повністю, бо платне).

Evidence: CODE VERIFIED (усе вище), CI VERIFIED (`docs/EDGE_FUNCTION_CI.md`, job `edge-functions` в `.github/workflows/ci.yml`), OWNER MANUAL VERIFIED — відсутнє (жодного текстового підтвердження, що власник продукту реально задеплоїв/перевірив цю функцію на реальному білді — `docs/EDGE_FUNCTION_CI.md` сама каже "Edge Functions уже задеплоєні й реально працюють у продакшні" з посиланням на `docs/SECURITY.md`, але без конкретики про сам google-books-proxy).

---

## 21. КАРТА БЕЗПЕКИ EDGE FUNCTIONS

| | `isbndb-proxy` | `cover-upload` | `google-books-proxy` |
|---|---|---|---|
| **Auth** | Supabase JWT (`verify_jwt` увімкнено, не вимкнено при деплої) — коментар рядки 13-19 | Той самий (не описано явно як виняток у файлі, той самий деплой-дефолт) | Той самий, коментар рядки 27-29 |
| **Rate limit** | `burst` 20/60с, `sustained` 300/добу, за IP (`_shared/rateLimit.ts`) | `burst` 10/60с, `sustained` 100/добу, за IP | `burst` 30/60с, `sustained` 2000/добу, за IP (щедріше — "перше джерело пошуку") |
| **Secret** | `Deno.env.get('ISBNDB_API_KEY')`, ОБОВ'ЯЗКОВИЙ — `503 not_configured`, якщо відсутній (рядки 216-221) | `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` + `SUPABASE_URL`, ОБОВ'ЯЗКОВІ — `503 not_configured` (рядки 142-148) | `Deno.env.get('GOOGLE_BOOKS_API_KEY')`, ОПЦІЙНИЙ (Google Books працює анонімно) |
| **Валідація вводу** | `op ∈ {search, lookup}` (рядок 232), `query` 2-200 символів (247-253), `isValidIsbn` — контрольна цифра ISBN (274, окремий модуль `isbn.ts`) | Real Content-Type перевірка через magic bytes (JPEG `FFD8FF`/PNG-сигнатура, рядки 82-91) — НЕ довіряє заявленому заголовку; розмір тіла — реальний підрахунок байтів під час стріму, ліміт 5 МБ (рядки 105-133, 161-167) | `op ∈ {search, lookup, get_edition}` (230), `query` 2-200 (247-253), `isbn.length` 10-13 (270), `externalId` непорожній (285-287) |
| **External API** | `https://api2.isbndb.com` | Supabase Storage (`{SUPABASE_URL}/storage/v1/object/{bucket}`), `service_role` ключ, обходить RLS повністю (навмисно — коментар 4) | `https://www.googleapis.com/books/v1/volumes` |
| **Logging** | `console.error`/`console.log` з ОБРІЗАНИМ тілом (300/500 символів, рядки 180, 192) — лише сервер, не клієнт | Немає окремого діагностичного логування помилок upstream (лише пряме повернення в error response, див. нижче) | `console.error` з обрізаним тілом (300 символів, рядок 189) — лише сервер |
| **CORS** | Спільний `_shared/cors.ts` — `Access-Control-Allow-Origin: *`, `POST, OPTIONS` | Той самий спільний файл | Той самий спільний файл |
| **Tests** | 0 `*.test.ts` файлів у `supabase/functions/isbndb-proxy/` | 0 | 0 |
| **CI** | `edge-functions` job — `deno check`/`deno lint` на всю `supabase/functions/` директорію (покриває всі три транзитивно й напряму) | Той самий job | Той самий job |

**Одна конкретна відмінність, варта окремого CODE VERIFIED зауваження:** нормалізація помилок upstream у `cover-upload` СЛАБША за інші дві функції. `index.ts:198-201`:
```ts
if (!uploadResponse.ok) {
  const bodyText = await uploadResponse.text().catch(() => '');
  return errorResponse(502, 'upstream_error', `Storage HTTP ${uploadResponse.status}: ${bodyText.slice(0, 200)}`);
}
```
На відміну від `isbndb-proxy`/`google-books-proxy` (де сире тіло провайдера йде ЛИШЕ в серверний лог, а клієнту — генеричний `HTTP {status}`), тут перші 200 символів сирого тіла відповіді Supabase Storage повертаються НАПРЯМУ клієнту в полі `error`. Аналогічно рядок 209 (catch-блок) повертає `error.message` клієнту без узагальнення. Ризик невисокий (Storage — власна інфраструктура, не сторонній платний провайдер із комерційно чутливими деталями), але це реальна непослідовність у політиці "не пропускай сирі деталі провайдера до клієнта", яку самі коментарі двох сусідніх файлів явно формулюють як принцип.

Evidence: CODE VERIFIED для всіх клітинок таблиці (прямі цитати файлів `supabase/functions/{isbndb-proxy,cover-upload,google-books-proxy}/index.ts`, `_shared/{cors,rateLimit}.ts`); CI VERIFIED для рядка CI (`.github/workflows/ci.yml`, job `edge-functions`, підтверджено `docs/EDGE_FUNCTION_CI.md` описом реального прогону CI run #80).
## 22. READING SESSION CORE

Джерело: `src/data/repositories/ReadingSessionRepository.ts` (343 рядки) прочитано повністю, разом з `ReadingSessionRepository.test.ts` (545 рядків, 26 `it()`-блоків).

**Життєвий цикл.**

- **`start()`** — CODE VERIFIED. Сесія одразу пишеться в SQLite (`INSERT INTO reading_session ... ended_at = NULL`), у пам'яті нічого не тримається — коментар модуля прямо пояснює, що це свідоме рішення проти втрати прогресу при force-quit. Одночасно (Фаза 7, REREADING MODEL) метод шукає активний `reading_run` через `ReadingRunRepository.getActiveByUserBookId` і, якщо його немає, створює новий — обидва записи (можливий новий run + сама сесія) в одній `db.withTransactionAsync`. Важливо: старт сесії і `user_book.status` — навмисно незалежні дії (можна почати сесію на книзі зі статусом `want_to_read`), тому fallback-створення run тут свідомо НЕ чіпає `user_book.status`.
- **`pause()`/`resume()`** — CODE VERIFIED, прості `UPDATE ... paused_intervals`, без транзакції (одна мутація одного поля — транзакція не потрібна). Обидва — no-op на вже завершеній сесії, на неіснуючому id, на повторному pause без resume.
- **`finish()`** — CODE VERIFIED, обгорнуто в `db.withTransactionAsync`. Усередині — три окремі мутації: `UPDATE reading_session SET ended_at=...`, `UserBookRepository.updateCurrentPage(db, ...)` (яка сама лише робить один `runAsync UPDATE user_book SET current_page = ...`, без власної транзакції), і `ReadingProgressRepository.recordForSession(db, ...)` (один `INSERT`, теж без власної транзакції). Коментар над функцією прямо документує, що ДО цієї фази (Milestone 8) ці три записи йшли БЕЗ спільної транзакції і збій між кроком 1 і 2/3 міг лишити сесію позначеною завершеною, а `current_page`/`reading_progress` — ні.
- **`discard()`** — м'яке видалення (`deleted_at`), один `UPDATE`, ідемпотентний.

**Чи справді rollback працює, а не лише "виглядає" як транзакція.** CODE VERIFIED + AUTOMATED TEST VERIFIED. Усі три виклики (`db.runAsync`, `UserBookRepository.updateCurrentPage`, `ReadingProgressRepository.recordForSession`) використовують той самий `db`, переданий у колбек `withTransactionAsync`, — жоден не відкриває власну транзакцію (`ReadingRunRepository.start`/`finish` теж навмисно так побудовані — коментар прямо каже "не відкривають власних транзакцій, тож безпечно викликати їх усередині цієї"). Це саме той патерн, який реально відкочується в SQLite (`expo-sqlite`'s `withTransactionAsync`), а не декоративна обгортка навколо незалежних викликів. Підтверджено прямим тестом, що не покладається на здогад: `ReadingSessionRepository.test.ts`, describe `'ReadingSessionRepository.finish — атомарний запис (Фаза 5)'`, `it('відкат при помилці всередині транзакції: жоден з трьох записів не застосовується')` — мокає `ReadingProgressRepository.recordForSession` через `jest.spyOn(...).mockRejectedValueOnce(...)`, очікує, що `finish()` прокидає виняток, і перевіряє, що ПІСЛЯ цього: сесія лишилась `ended_at: null`, `user_book.current_page` лишився на старому значенні (7, не 55), і `reading_progress` не отримав жодного рядка (`toHaveLength(0)`). Це справжня перевірка atomicity, не просто виклик без падіння.

**Покриття тестами (конкретні `it()`).** Фаза 5 milestone V1.6.1 явно закрила "найважливішу прогалину покриття у всьому списку" (коментар у файлі, з посиланням на `docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 31) — до цього `start`/`pause`/`resume`/`finish`/`discard` перевірялись лише опосередковано через `ReadingContinuity.test.ts`/`setReadingExperience`. Пряме покриття зараз:
- `start`: `'створює сесію з очікуваними полями...'`, `'goalMinutes не передано — зберігається null...'`.
- `getActiveSession`: 4 `it()` (немає сесій; усі завершені; кілька незавершених — найновіша активна; discard найновішої — активною стає попередня).
- `pause`/`resume`: 6 `it()` (додавання інтервалу, no-op на повторний pause, resume закриває інтервал, resume без паузи — no-op, pause/resume на завершеній сесії — no-op, на неіснуючому id — безпечно).
- `finish`: 4 `it()`, включно з atomicity-тестом вище й ідемпотентністю (`'finish на вже завершеній сесії — ідемпотентно...'` — другий виклик з іншим `endPage` нічого не змінює).
- Тривалість/паузи: 2 `it()`, включно зі сценарієм "застосунок згорнуто, пауза лишилась відкритою до finish" (background timestamps).
- Невалідна сторінка (`endPage: -5`): 1 `it()`, документує реальну поведінку — сесія й `reading_progress` зберігають сире від'ємне значення, лише `user_book.current_page` захищене окремим `Math.max(0, ...)` у `UserBookRepository.updateCurrentPage`.
- `discard`: 2 `it()`.
- Перечитування/м'яко видалена книга: 2 `it()` — `finish()` проходить навіть коли `user_book` вже м'яко видалено (сирий рядок фізично не чіпається `ON DELETE CASCADE`, бо видалення м'яке).
- Прив'язка до `reading_run` (Фаза 7): 4 `it()`.

Загалом: усі перелічені в завданні шляхи (start/pause/resume/finish/discard, включно з atomicity finish і edge-кейсами) мають пряме AUTOMATED TEST VERIFIED покриття — це не HYPOTHESIS.

---

## 23. SESSION ↔ RUN ↔ PROGRESS

**Ланцюжок запису.** `ReadingSessionRepository.finish()` в одній транзакції пише в три місця: `reading_session.end_page`, `user_book.current_page` (через `UserBookRepository.updateCurrentPage`) і один рядок `reading_progress` (через `ReadingProgressRepository.recordForSession`, `source='session'`). CODE VERIFIED.

**Чи `reading_progress` run-aware — НІ, і це підтверджено на рівні схеми.** Міграція `001_base_schema.ts` (рядки 226-236) створює `reading_progress` з колонками `id, user_book_id, session_id, page, recorded_at, source, created_at` — **без** `reading_run_id`. Це не випадковість і не забутий крок: миграції 021-025 (`021_book_memory_run.ts`, `022_pre_reading_reflection_run.ts`, `023_book_capsule_run.ts`, `024_dnf_reflection_run.ts`, `025_rating_run.ts`) систематично додали `reading_run_id` до **кожної** іншої "по-прочитанню" таблиці (`book_memory`, `pre_reading_reflection`, `book_capsule`, `dnf_reflection`, `rating`) саме заради REREADING MODEL — але жодна з них не торкнулась `reading_progress`. CODE VERIFIED (перевірено `grep` по всіх файлах `src/data/db/migrations/02*.ts` — `reading_progress` фігурує лише в `026_hot_query_indexes.ts`, і то в коментарі про індекси, не про run-awareness).

**Чи це реальна проблема — так, але наразі дрімаюча, не проявлена в UI.** Ключовий факт: `ReadingProgressRepository.listByUserBookId` (метод, який читає журнал `reading_progress` по книзі) **не викликається жодним UI-компонентом чи хуком у застосунку** — CODE VERIFIED, `grep -rn "ReadingProgressRepository\."` по всьому `src`/`app` знаходить лише виклик `recordForSession` всередині `ReadingSessionRepository.finish` і використання в самих repository-тестах. `recordManual` (запис ручного редагування сторінки, `source='manual'`) також ніде не викликається поза власним тестом — це фактично мертвий код на сьогодні. Це означає: `reading_progress` наразі є WRITE-ONLY журналом — коментар модуля ("статистика/графіки читають лише `reading_progress`+`reading_session`, ніколи єдиний `current_page`") описує намір з `docs/DATABASE.md`, який ще не реалізований жодним споживачем.

Натомість фактичний run-scoped прогрес, який реально показується користувачу (`ReadingRunsHistorySection` на Book Details, порівняння прочитань), рахується через `useReadingRunsDetail.ts` → `computeRunReadingStats(runSessions)`, де `runSessions = sessions.filter(s => s.readingRunId === run.id)` — тобто через `reading_session.reading_run_id` (яке Є, з міграції `020_reading_run_backfill.ts`), а не через `reading_progress`. CODE VERIFIED. Тобто там, де застосунок сьогодні дійсно показує "прогрес прочитання №2 не сплутаний з прочитанням №1", він це робить коректно — просто через іншу таблицю.

**Висновок (HYPOTHESIS, обґрунтована кодом).** Якщо колись `reading_progress` стане реальним джерелом для графіка "сторінки за часом" (як і задумано документацією), для книги з кількома `reading_run` цей графік технічно змішає точки прогресу з усіх прочитань в одну хронологічну лінію без штатного способу відфільтрувати конкретний run — `session_id` є, але щоб дістатись до run, знадобиться JOIN через `reading_session.reading_run_id`, якого в самій таблиці `reading_progress` немає. Для ручних записів (`recordManual`, `session_id = NULL`) такий JOIN взагалі неможливий — ручний запис прогресу під час перечитування назавжди залишиться нерозрізнюваним, до якого саме run він належить. Сьогодні це не user-visible баг (бо ніхто не читає цю таблицю), але архітектурна пастка для першого, хто підключить `reading_progress` до UI.

**Другий, окремий і вже реально видимий (не гіпотетичний) розрив: `user_book.current_page` не скидається на новий `reading_run`.** CODE VERIFIED, дві незалежні точки:
1. `UserBookRepository.updateStatus()` (файл `UserBookRepository.ts`, рядки 212-249) — при переході в `'reading'`/`'rereading'` без активного run створює новий `ReadingRun`, але єдина мутація `user_book` у тій самій транзакції — це `UPDATE user_book SET status=?, started_at=?, finished_at=?, updated_at=?` — **`current_page` в цьому списку немає**.
2. `app/work/[workId].tsx`, `ReadingControls`, рядок 1023: кнопка "Почати читання" викликає `startSession.mutate({ userBookId: userBook.id, startPage: userBook.currentPage })` — тобто стартова сторінка НОВОЇ сесії (а значить і нового run, якщо активного run ще нема) буквально береться зі старого `user_book.current_page`.

Практичний сценарій: користувач дочитав книгу на 350/350 сторінці (`current_page = 350`), потім обирає "Перечитую". `reading_run` #2 коректно створюється (`run_number=2`, `in_progress`) — але `user_book.current_page` лишається 350. Якщо після цього користувач тисне "Почати читання", нова сесія стартує з `start_page: 350` (на книзі, яку щойно почали перечитувати вперше), а прогрес-бар/`FinishPredictionSection`/`CurrentReadingRow` на Home одночасно показують ~100% прогресу аж до першого `finish()` нової сесії, який перепише `current_page` реальним значенням. Це HYPOTHESIS (не спостерігалось на фізичному пристрої), але прямо випливає з прочитаного коду обох файлів і НЕ спростовується жодним тестом: єдиний наявний "перечитування" тест у `ReadingSessionRepository.test.ts` (`'перечитування (user_book.status = "rereading") — репозиторій сесій до статусу байдужий'`) навмисно сідить книгу з `currentPage: 0`, тобто обходить саме цей сценарій. `docs/READING_RUN.md` (усі 12+ фаз REREADING MODEL) не згадує `current_page`/скидання сторінки жодного разу — судячи з документації, цей розрив ніколи не розглядався як окремий кейс, на відміну від `rating`/`DNF`/`Capsule`/`Before-After`, для яких run-scoping зроблено явно й задокументовано.

---

## 24. HOME AFTER CONSOLIDATION

Файл `app/(tabs)/index.tsx` (476 рядків) прочитано повністю. Порядок розділів на екрані (буквально відтворює ТЗ Фази 18, коментар над `HomeScreen`): 1) `CurrentlyReadingList`, 2) `TodayStatsRow`, 3) `FirstSessionHint` (onboarding), 4) `HomeContextCard` (одна контекстна картка), 5) `HomeShortcuts` + `NextReadEntryPointCard`.

Перевірка вимог власника продукту одна за одною, CODE VERIFIED:

- **Поточні книги, що читаються** — `CurrentlyReadingList()` рендерить `useLibraryByStatus('reading')`, обрізано до `HOME_READING_LIST_LIMIT = 5` з посиланням "Усі (N)" на решту. Присутньо.
- **Обкладинки** — `CoverThumbnail` усередині `CurrentReadingRow`, 40×58. Присутньо.
- **Прогрес** — `ReadingProgressBar percent={percent}` (через `computeProgressPercent(userBook.currentPage, edition.pageCount)`), рендериться під назвою книги, коли `percent != null`. Присутньо.
- **Сторінки** — `buildContinuityMetaLine` додає `с. {currentPage}` і, з останньої сесії, `{pages} стор.` (різниця `endPage - startPage`). Присутньо.
- **Хвилини** — та сама функція додає `{minutes} хв` з `lastSession.durationSeconds`; окремо `TodayStatsRow` показує сумарні "хв сьогодні" за всі сесії дня (з `useOverallStatistics`, `data.today.minutes`). Присутньо, причому продубльовано на двох рівнях (по книзі й сумарно за день) — це навмисно різні метрики, не дублювання того самого.
- **"Continue reading" дія** — кожен рядок `CurrentReadingRow` — це сам CTA: `onPress` веде на `/session/launch/[userBookId]`, підпис "Продовжити читання" з шевроном. Окремої абстрактної кнопки немає — коментар прямо пояснює це як свідомий вибір ("дія прив'язана до конкретної книги"). Присутньо.
- **Сьогоднішня статистика читання** — `TodayStatsRow`: хвилини сьогодні, сторінки сьогодні, поточний streak днів поспіль. Ховається, доки `totalSessions === 0` (щоб не показувати нулі до першої сесії) — свідома, задокументована деградація, не баг.

**Висновок:** усі перелічені вимоги власника продукту фактично рендеряться на Home і жодна не "похована" — секція `CurrentlyReadingList` перша після привітання, `TodayStatsRow` друга. Жодних відсутніх або похованих елементів не знайдено; це CODE VERIFIED, не просто прочитання документації Фази 17 на віру.

Єдине, що дійсно змінилося структурно й підтверджено кодом: відновлення перерваної (force-quit) сесії з Milestone 11 винесено з Home у глобальний `ReadingSessionMiniBar` над таб-баром (коментар прямо це пояснює як "та сама дія іншою візуальною мовою", щоб не дублювати) — це навмисне архітектурне рішення, не прогалина.

---

## 25. HOME CONTEXT

`src/lib/homeContext.ts` (193 рядки, чисті функції без React/SQL) прочитано повністю, разом з рендером-обгорткою `src/components/home/HomeContextCard.tsx` (154 рядки).

**П'ять кандидатів, буквальний пріоритет із ТЗ**, реалізований у `selectHomeContextCard()` (рядки 184-193) як прямий ланцюжок `if`:
1. `stale_reading` — `input.staleReading` (найдовше не читана книга зі статусом reading/rereading, обраховано `findStaleReadingCandidate`, критерій — найбільший `daysSinceLastSession` за поріг).
2. `capsule_due` — `input.capsuleDue` (капсула з `reopenAt <= now` і `openedAt == null`, найраніший `reopenAt` серед прострочених — `findCapsuleDueCandidate`, тонка обгортка над `listDueCapsuleCandidates`, яку Фаза 16 додатково перевикористовує для повного списку на `/memory`).
3. `on_this_day` — булевий сигнал `onThisDayAvailable` (сам контент лишається в окремому `OnThisDayCard`, тут лише "чи хоче зайняти слот").
4. `goal_near_completion` — ціль з `status==='active'`, не виконана, `current/target >= 0.8` (`GOAL_NEAR_COMPLETION_RATIO`), найближча до 100%.
5. `tbr_suggestion` — якщо `tbrBookCount > 0`, з опційним "найдовше очікує" інсайтом.

Функція повертає рівно один кандидат або `null` — жодної можливості показати два одночасно (структурно неможливо: `if`-ланцюжок з `return`, не масив). CODE VERIFIED.

**Порівняння з V1.6 (до консолідації)** — за коментарями `CHANGELOG.md` і `app/(tabs)/index.tsx`:
- **Рекомендації НЕ дублюються.** До Фази 14 (RECOMMENDATION CONSOLIDATION) на Home стояли ТРИ окремі картки-входи одночасно: `TomorrowEntryPointCard`/`OnePickerEntryPointCard`/`TrendsEntryPointCard` — усі видалені як компоненти Home (самі екрани й алгоритми лишились незмінними, лише перегруповані під `/next-read`). Зараз — одна `NextReadEntryPointCard`, і вона живе окремо від слоту `HomeContextCard` (це навігаційний ярлик, не контекстна картка — коментар прямо розділяє ці дві категорії). CODE VERIFIED через `CHANGELOG.md` Фаза 14 + сам код `app/(tabs)/index.tsx` (рядки 334-355).
- **Memory НЕ дублюється.** До Фази 16 (MEMORY HUB HIERARCHY) існувало, за словами аудиту, цитованого в `CHANGELOG.md`: "Journal vs Activity History vs Memory index vs On This Day" — кілька незалежних поверхонь. Зараз "Моя пам'ять" — один пункт у `HOME_SHORTCUTS` (три пункти: Щоденник/Пам'ять/Статистика — "Моя історія" прибрана з Home на користь одного постійного входу через Профіль, Фаза 16), а окремий сигнал "капсула готова" — один із п'яти кандидатів `HomeContextCard`, що бере дані з того самого запиту, що й повний список на `/memory` (Фаза 16 коментар: "спільний кеш запиту — нуль дублювання розмітки чи додаткового запиту до БД").

**Висновок:** консолідація підтверджена кодом, не лише документацією — і рекомендації, і Memory справді звужені до одного видимого входу кожен, а не просто перейменовані/переставлені без зміни кількості.

---

## 26. EMPTY HOME / FIRST USER

CODE VERIFIED, `app/(tabs)/index.tsx`, рядки 388-476.

`isLibraryEmpty = allBooks != null && allBooks.length === 0` — "справді порожня бібліотека" (жодної книги в жодному статусі), окремо від `showEmptyState` (непорожня бібліотека, але зараз нічого не читається). Доки `allBooks` не завантажився, `isLibraryEmpty` — `false` (звичайний Home рендериться як завжди, жодного "блимання" нового стану).

Для `isLibraryEmpty === true` екран згортається до:
1. `WelcomeHint` — одноразова onboarding-картка (див. розділ 27).
2. `EmptyState` з заголовком "Бібліотека поки порожня.", описом і кнопкою "До пошуку" → `/search`.

`HomeShortcuts` і `NextReadEntryPointCard` — обидва загорнуті в `{!isLibraryEmpty ? (...) : null}` (рядки 437-447) — **ховаються повністю** для порожньої бібліотеки, а не рендеряться з порожнім/нерелевантним вмістом. Коментар прямо цитує аудит: новий користувач раніше бачив "7+ інтерактивних елементів із незнайомою термінологією ДО єдиного релевантного CTA". `CurrentlyReadingList`/`TodayStatsRow`/`HomeContextCard` для порожньої бібліотеки самі повертають `null`/не активуються (жоден кандидат не спрацьовує без жодної книги) — не загорнуті в `isLibraryEmpty` явно, бо це не потрібно.

**Позиція CTA:** так, вища й пряміша, ніж до Фази 17 — CTA "До пошуку" тепер другий блок екрана (одразу після привітання й опційного `WelcomeHint`), а не в кінці довгого списку карток. Коментар прямо каже, що цей самий сильний CTA "буквально скопійований" із уже наявного порожнього стану Бібліотеки, щоб уникнути зайвого проміжного переходу.

**Порожні History/Memory/Stats картки:** так, приховані, а не показані порожніми — жодна з них не рендериться взагалі для `isLibraryEmpty`, підтверджено тим самим умовним блоком.

**CSV/Goodreads import з порожнього стану — НІ, НЕ видимий.** CODE VERIFIED: єдина кнопка на порожньому Home — "До пошуку" → `/search`. `grep` по `app/(tabs)/profile/index.tsx` показує, що пункт "Імпорт з Goodreads" — це рядок меню Профілю, окремого входу з порожнього Home/Library до нього немає. Тобто новий користувач, у якого вже є бібліотека на Goodreads, не побачить шляху імпортувати її, доки сам не здогадається зайти в Профіль — це не помилка Фази 17 (яка explicit не займалась цим), а вже наявний, непідсвічений розрив у FTUE, який жодна з фаз 13-19/28 не адресувала.

---

## 27. PROGRESSIVE ONBOARDING

**Повний перелік тригерів — рівно 3, не більше.** CODE VERIFIED, `src/lib/onboardingHintStorage.ts`: `export type OnboardingHintId = 'welcome' | 'firstSession' | 'firstFinishedBookCapsule'`. `grep -rn "useOnboardingHint("` по `src`/`app` знаходить рівно три виклики — інших "перших дій" (перший журнальний запис, перший memory-запис, перша капсула як окрема подія від фінішу книги) як окремих onboarding-тригерів НЕ існує, попри те, що вони перелічені в завданні як гіпотетичний список — не варто вважати їх реалізованими.

1. **`welcome`** — `app/(tabs)/index.tsx`, `WelcomeHint()`. Рендериться разом з порожньою бібліотекою (`isLibraryEmpty`). Умова показу — сама `useOnboardingHint('welcome')`, без додаткової лічильникової умови.
2. **`firstSession`** — `app/(tabs)/index.tsx`, `FirstSessionHint()`. Умова: `data?.totalSessions !== 1` → не показувати; тобто рівно на першій завершеній сесії (і лише поки видимість підказки ще не закрита назавжди).
3. **`firstFinishedBookCapsule`** — `app/completion/[workId].tsx`, `CapsuleMemoryOnboardingHint()`. Умова: `isFirstFinishedBook` (переданий пропс, `booksFinishedAllTime === 1`) — тобто саме перша ЗАВЕРШЕНА книга користувача, на екрані підсумку читання.

**Механізм "показано один раз".** CODE VERIFIED, `useOnboardingHint.ts` + `onboardingHintStorage.ts`: `expo-secure-store`, ключ `polytsya_onboarding_hint_seen_${id}`, значення `'1'`. Читання — асинхронне, `visible` за замовчуванням `false` (той самий "не показуй новий стан, доки не підтверджено" принцип, що й `isLibraryEmpty`) — немає "блимання" підказки для більшості відкриттів. `dismiss()` одразу ховає локально й асинхронно пише `'1'` у SecureStore — назавжди, незалежно від того, чи умова показу (наприклад, `totalSessions === 1`) сама собою повториться пізніше (коментар у коді прямо описує сценарій "видалення другої сесії" як приклад, від якого захищає саме SecureStore-прапорець, а не сама умова).

**Чи включено в backup/restore — НІ.** CODE VERIFIED, двома незалежними шляхами:
- Стан зберігається виключно в `expo-secure-store`, окремо від SQLite — коментар у `onboardingHintStorage.ts` прямо це підтверджує ("не залежить від відкриття SQLite/міграцій"), той самий підхід, що й `themePreferenceStorage`/`libraryPreferenceStorage`.
- `BackupRepository.ts`'s `BACKUP_TABLE_ORDER` — повний список таблиць бекапу (`author`...`reading_run`...`reading_progress`...тощо) — узагалі не містить ніякого SQLite-еквівалента onboarding-прапорців (немає `app_settings`-запису під цей стан). Отже, backup/restore фізично не може ані зберегти, ані відновити стан "чи бачив підказку".

**Наслідок для edge-кейсів (HYPOTHESIS, прямо випливає з коду вище):**
- **Очищення даних застосунку** на Android скидає й SecureStore (EncryptedSharedPreferences прив'язана до даних застосунку) — підказки з'являться знову при наступному запуску. На iOS Keychain частіше переживає видалення/перевстановлення застосунку — поведінка платформо-залежна, не перевірена на фізичному пристрої в цьому проєкті (PHYSICAL DEVICE VERIFIED відсутнє).
- **Відновлення бекапу на новому пристрої** — SecureStore на новому пристрої порожній, тобто формально всі три підказки готові показатись знову. Практично ризик пом'якшений самими умовами показу: `welcome` вимагає `isLibraryEmpty` (відновлений бекап майже завжди НЕ порожній → не спрацює), `firstSession` вимагає `totalSessions === 1` (типовий відновлений бекап має набагато більше сесій → не спрацює). Але є реальний краєвий випадок: користувач, який щойно дочитав СВОЮ ПЕРШУ книгу (`booksFinishedAllTime === 1`), одразу після цього переставляє застосунок і відновлюється з бекапу — `firstFinishedBookCapsule` покаже підказку вдруге на тому самому екрані підсумку. Малоймовірний, але цілком реальний сценарій, не задокументований у `docs/PROGRESSIVE_ONBOARDING.md`.

**Оцінка нав'язливості — обґрунтовано умовами показу, не відчуттями.** Усі три підказки структурно НЕ можуть накластись одна на одну одночасно: `welcome` рендериться лише для порожньої бібліотеки, `firstSession` — лише коли `totalSessions === 1` (бібліотека вже не порожня — потрібна хоч одна сесія на хоч одній книзі), `firstFinishedBookCapsule` — на окремому екрані (`/completion/[workId]`), не на Home. Тобто в межах одного екрана одночасно видно щонайбільше одну onboarding-картку — трьох "стосів" підказок кодом не передбачено. Ризик, знайдений вище (повторна поява після відновлення бекапу для дуже вузького сценарію), — єдиний реально знайдений ризик нав'язливості, і він низької ймовірності, не системний.

---

## 28. LIBRARY

`app/(tabs)/library/index.tsx` (672 рядки) прочитано разом із `docs/UI_COMPLEXITY_AUDIT_PHASE28.md` і `ShelfRepository.ts`/`ShelfRepository.test.ts`.

**Що змінилось у Фазі 28 (обидва пункти — CODE VERIFIED, не лише за словами документа):**

1. **`BookQuickActionsSheet` — застряглий стан чіпа статусу.** ДО фази: шторка отримувала снепшот `UserBookWithDetails` на момент long-press, який ніколи не оновлювався після мутації статусу (мутація лише інвалідує кеш списку книг, не сам локальний снепшот) — вибраний `ChipSelect` у шторці "застрягав" на старому значенні. Зараз (рядки 592-595): `actionsForBook` — похідне значення через `useMemo(() => books?.find(b => b.id === actionsForBookId) ?? null, [books, actionsForBookId])`, тобто рахується прямо в рендері зі свіжого `books` щоразу, без окремого стейту й без `useEffect`. Коментар прямо пояснює, чому не через `useEffect`: перша версія фіксу не пройшла власний ESLint-правило проєкту `react-hooks/set-state-in-effect` — знайдено власним прогоном лінтера користувачем до коміту (це виглядає як реальний, а не заднім числом придуманий факт — надто специфічна деталь для вигадки).
2. **`ShelfRepository` — `bookCount` рахував рядки `shelf_book`, а не живі книги.** `UserBookRepository.remove` (м'яке видалення) ніколи не чистить `shelf_book`, тож прибрана з бібліотеки книга й далі враховувалась у лічильнику полиці. Виправлено другим `LEFT JOIN user_book ub ON ub.id = sb.user_book_id AND ub.deleted_at IS NULL` (файл `ShelfRepository.ts`, рядки ~98-138, підтверджено в обох методах `listAll`/`search`). Регресія покрита новим `ShelfRepository.test.ts`. Супутньо: `useRemoveFromLibrary` тепер інвалідує кеш полиць — без цього SQL-фікс не був би видимий до `staleTime`.

**Що НЕ змінилось (свідомо, за прямою заявою документа Фази 28) — grid/list-перемикач, сортування, статуси, карусель.** CODE VERIFIED вибірково:
- Grid/list-перемикач — `handleToggleViewMode`, зберігається через `LibraryPreferenceStorage`, застосовано в `FlatList` (`key={viewMode}`, перемонтування замість зміни `numColumns` на льоту — RN не підтримує це "на льоту").
- Сортування — `LibrarySortSheet` + `LibraryPreferenceStorage.saveSort`.
- `FILTER_ORDER` (7 вкладок статусу, "Усі" перша) — без змін цією фазою.
- `LibraryCarousel`/`ShelfThemeCard` — не згадані у документі Фази 28 як змінені, і дійсно не займали жодної згаданої правки.

**Продуктивність.** CODE VERIFIED: список книг — `FlatList`, не `ScrollView`+`.map()`. Коментар у коді (рядок ~236) прямо датує цю зміну як окрему, більш ранню знахідку ("Milestone 8, продуктивність — реальна знахідка") — Фаза 28 цю частину не чіпала, вона вже була виправлена раніше. `renderItem`/`keyExtractor` обгорнуті `useCallback`, `gridCoverWidth` — `useMemo`. Жодного очевидного regression для великої бібліотеки не знайдено в поточному коді.

**Висновок:** твердження документа "лише 2 реальних баги, без redesign" підтверджується прямим читанням коду — обидва фікси точкові, і жодних слідів ширших layout-змін у файлі немає. Секція навмисно коротка — тут дійсно нема чого додати поза вже задокументованим.

---

## 29. BOOK DETAILS

`app/work/[workId].tsx` (1677 рядків) прочитано вибірково повністю по релевантних ділянках (структура рендера, `ReadingControls`, `LibrarySection`, історія).

**Інформаційна ієрархія — для повністю заповненої, активно читаної, раніше перечитаної книги (реалістичний "найгустіший" кейс), CODE VERIFIED за деревом рендера (`app/work/[workId].tsx`, рядки ~1504-1672):**

1. Обкладинка + назва/автор(и)/серія (не секція, хедер).
2. Опис твору (якщо є).
3. `CollapsibleSection "Жанри та теги"`.
4. `LibrarySection` (заголовок "Бібліотека", доданий саме Фазою 28) — усередині: `ReadingControls` ("Продовжити читання"/"Почати читання" — **поточний run/сесія**), `ChipSelect` статусу, кнопка обраного, "Переглянути підсумок читання" (для `finished`/`rereading`), кнопки "Позначити своєю"/полиці/прибрати з бібліотеки.
5. `StaleReadingSection` ("Давно не читав", якщо застосовно) — з caption-підписом (Фаза 28).
6. `CollapsibleSection "Світ книги"` (Lore) — згорнута за замовчуванням із Фази 28 (раніше — завжди розгорнута, навіть порожня).
7. `PreReadingReflectionSection` ("До/Після").
8. `DnfReflectionSection` (сама вирішує, показуватись, чи ні).
9. `FinishPredictionSection` ("Орієнтовна дата завершення").
10. `RatingSection`.
11. `JournalSection`.
12. `CollapsibleSection "Історія"` (Фаза 28: об'єднані два окремі акордеони в один, з двома підзаголовками "Прочитання" (= **історія минулих run'ів**, через `ReadingRunsHistorySection`) і "Сесії читання" (`ReadingHistorySection`)) — рендериться, лише якщо є хоч run, хоч сесія.
13. `CollapsibleSection "Видання (N)"`.

Для такої книги фактично 13 послідовних блоків (не рахуючи хедер), з яких 6 — `CollapsibleSection` (згорнуті за замовчуванням: Жанри, Світ книги, Історія, Видання — 4 з 6; `LibrarySection`/`StaleReadingSection`/решта — завжди розгорнуті картки).

**Перевірка конкретних вимог:**
- **Поточний run** — так, опосередковано через `ReadingControls` (кнопка "Продовжити читання"/"Почати читання" реагує на активну сесію, яка належить активному run) і через чіп статусу.
- **Історія минулих run'ів** — так, `ReadingRunsHistorySection` під підзаголовком "Прочитання" всередині об'єднаної секції "Історія".
- **"Continue" дія** — так, `ReadingControls`, кнопка "Продовжити читання" (якщо активна сесія цієї книги) веде на `/session/[sessionId]`.
- **Вхід до Journal** — так, `JournalSection` рендерить записи журналу прямо тут (не лише посилання).
- **Вхід до Lore** — так, `LoreSection` всередині `CollapsibleSection "Світ книги"`, кнопка веде на `/lore/[workId]`.
- **Вхід до Memory/Capsule — НЕ прямий з цього екрана.** CODE VERIFIED: `grep` по `router.push`/`pathname` у цьому файлі на `memory`/`capsule`/`recall` не знаходить жодного прямого переходу. Єдиний шлях до `BookCapsuleSection` — через кнопку "Переглянути підсумок читання" → `/completion/[workId]` (доступна лише для `finished`/`rereading`), а сама сторінка Memory (`/memory/[workId]`) взагалі не лінкується звідси. Тобто "вхід до Memory" з Book Details існує, але не як окрема секція самого екрана, а як перехід через інший екран — легко пропустити, якщо не знати, що "Переглянути підсумок читання" веде туди.
- **Edition info** — так, `CollapsibleSection "Видання (N)"`.

**Чиста чи складна NET-оцінка після адитивних змін Фази 28 — власна, обґрунтована підрахунком.** Документ `UI_COMPLEXITY_AUDIT_PHASE28.md` прямо каже: жодного видалення функцій, лише (а) додано 2 заголовки/підписи там, де їх не було, (б) 1 секція (Lore) переведена в згорнутий стан за замовчуванням, (в) 2 незалежні акордеони історії об'єднано в 1 із двома підрозділами, (г) окрема картка "Перечитати" полегшена до підпису-посилання. Рахунок ЧИСЛА секцій зверху вниз до Фази 28 і після:
- ДО: 15 потенційних секцій (за словами документа), з яких 3 без заголовка (`LibrarySection`/`StaleReadingSection`/`LoreSection`), 2 окремі акордеони "Історія прочитань"+"Історія читання".
- ПІСЛЯ: та сама кількість функціональних блоків (нічого не видалено), але (а) усі раніше безіменні блоки тепер мають підпис/заголовок, (б) 2 акордеони історії стали 1, тобто **число окремих CollapsibleSection зменшилось на 1**, (в) Lore за замовчуванням згорнутий — зменшує видиму "вагу" екрана при першому відкритті, не при повному розгортанні.

Чесна відповідь: **NET інформаційна щільність (кількість фактів/контролів, доступних на екрані) не змінилась — вона й не мала змінюватись, бо ТЗ прямо забороняло видаляти фічі.** Але сприймана складність ПРИ ПЕРШОМУ ВІДКРИТТІ реально знизилась: на один розгорнутий акордеон менше, один додатковий розділ (Lore) тепер згорнутий за замовчуванням, і жоден блок більше не виглядає "безіменним" (що саме документ і аудит V1.6.1 фіксували як конкретну скаргу — не абстрактну "переобтяженість", а конкретно відсутність заголовків і подвійний акордеон). Це узгоджується з власною заявою фази: "зменшити conceptual overload без втрати features" — заявлена мета фактично досягнута точковими, не структурними змінами, і це підтверджується підрахунком, а не лише повторенням формулювання документа.
## 30. CALENDAR 2.0 — FULL AUDIT

CODE VERIFIED (`app/(tabs)/calendar.tsx`, `app/day/[date].tsx`, `src/features/calendar/useCalendarSessions.ts`, `src/lib/calendarIntensity.ts`, `src/lib/calendarGrid.ts`).

Структура екрана `CalendarScreen` (`app/(tabs)/calendar.tsx`), зверху вниз:

1. **Заголовок** — `<AppText variant="title">Календар</AppText>`, без нативного хедера (`ScreenContainer topInset` — той самий "голий таб" патерн, що й Бібліотека/Пошук/Профіль).
2. **Навігація місяця** — рядок `MonthNavButton "chevron-back"` / `AppText variant="heading"` (назва місяця, `format(monthAnchor, 'LLLL yyyy', {locale: uk})`, `textTransform: 'capitalize'`) / `MonthNavButton "chevron-forward"`. Кнопки — фіксовані `theme.minTouchTarget` (44×44) + `hitSlop={8}`, кожна зі своїм `accessibilityLabel` ("Попередній місяць"/"Наступний місяць").
3. **Рядок днів тижня** — `WEEKDAY_LABELS_MON_FIRST = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд']`, понеділок першим (хардкод, `week_start` з `app_settings` НЕ підключено — задокументовано в `docs/CALENDAR_2_0.md` §"Свідомо НЕ зроблено", підтверджено кодом: `buildMonthGrid` викликається з `weekStartsOn=1` без жодного читання налаштувань).
4. **Сітка місяця** — `flexDirection: 'row', flexWrap: 'wrap'`, 42 клітинки (6 тижнів × 7 днів, `buildMonthGrid`), кожна `width: '${100/7}%'`, `aspectRatio: 1`. Дні поза поточним місяцем — `opacity: 0.4`.
5. **Підсумок місяця** — `Card` під сіткою (`useMonthSummary`), або, за його відсутності активності, підказка-підпис "Дні із сесіями читання позначені обкладинкою книги — торкнись дня, щоб побачити деталі."

День-клітинка (`Pressable`, `accessibilityRole="button"`) — повний `accessibilityLabel` через `buildDayAccessibilityLabel` (дата + інтенсивність словами + назва книги), `onPress` → `router.push('/day/[date]')`.

**"Сьогодні"** — реалізовано ДВОМА різними способами залежно від того, чи є в клітинці обкладинка: коли є `primaryUserBook`, today — акцентна РАМКА (`borderWidth: 2, borderColor: theme.colors.accent`) навколо обкладинки; коли обкладинки немає, today — суцільна ЗАЛИВКА кола (`backgroundColor: theme.colors.accent`) з числом кольору `onAccent`. Немає окремого "виділеного дня" (selected day) стану взагалі — після тапу екран одразу переходить на `/day/[date]`, сітка місяця сама по собі не тримає "який день зараз обраний" (детальніше — §37).

**Обкладинка книги** — `CoverThumbnail` з `hideFallbackLetter`, розмір `computeCoverSize(windowWidth, theme.spacing.lg)` (20-34px). **Індикатор інтенсивності** — ряд з 1-3 крапок 4×4px (`theme.colors.accent`) під клітинкою, кількість = `intensity` (0 = без крапок).

## 31. CALENDAR DAY CELL

CODE VERIFIED (`app/(tabs)/calendar.tsx`, рядки 114-216; `src/features/calendar/useCalendarSessions.ts`).

Рендер клітинки — рівно ДВІ гілки (`primaryUserBook ? … : …`), жодного проміжного випадку "показати 2-3 обкладинки одразу":

- **Немає активності того дня** (`intensity === 0`, `stats` відсутній або `primaryUserBook === null`) — та сама "стара" пілюля-з-числом (32×32 коло, заливка лише для today), 0 крапок знизу.
- **Точно одна книга** — `selectPrimaryBookForDay` повертає єдиний `userBookId`, обкладинка + крапки за сумою хвилин.
- **Дві книги** — `selectPrimaryBookForDay` рахує суму хвилин ПО КОЖНІЙ книзі окремо (`minutesByBook` Map) і повертає ОДНОГО переможця (§32). Клітинка показує ЛИШЕ обкладинку переможця — програвша книга того дня НІЯК не позначена в сітці (ні друга дрібна обкладинка, ні бейдж "+1 книга", ні інший колір крапок). Єдиний слід другої книги — крапки інтенсивності рахуються від СУМАРНИХ хвилин ОБОХ книг разом (`sumMinutesForDay(daySessions)` у `useMonthCalendarData` бере ВСІ сесії дня, не лише сесії переможця), тож "висока інтенсивність" може означати або одну довгу сесію, або суму кількох коротких різних книг — це не видно з самої клітинки, лише з деталей дня.
- **3+ книги** — та сама логіка: показує ЛИШЕ "головну" книгу дня (найбільша сума хвилин, tie-break — найраніший старт), решта не позначена. Немає ліміту "показати max N обкладинок" ЧИ бейджа "+2" — просто завжди рівно 0 або 1 обкладинка на клітинку незалежно від кількості книг.
- **Обкладинка відсутня** (`coverUrl` порожній/не завантажився) — `CoverThumbnail` з `hideFallbackLetter={true}` показує ЛИШЕ кольорову плашку (`fallbackColor` книги, або `theme.colors.accent` за замовчуванням) БЕЗ літери-ініціала — свідома відмінність від решти застосунку (Бібліотека/Пошук/Book Details передають `hideFallbackLetter` за замовчуванням `false` і показують ініціал). Обґрунтування в коментарі компонента (`CoverThumbnail.tsx`, рядки 26-32) — на масштабі 20-34px `AppText variant="caption"` фізично переповнював би плашку.
- **Книга, почата того дня** / **книга, завершена того дня** — клітинка НЕ відрізняє "почав"/"завершив" візуально жодним чином. `selectPrimaryBookForDay` рахує лише `reading_session`-хвилини за день; `book_started`/`book_finished` події (з `ActivityHistoryRepository`) взагалі не читаються `useMonthCalendarData` — лише `useDaySessions` (деталі дня) і `useMonthSummary` (підсумок місяця, агреговані лічильники, без прив'язки до конкретного дня клітинки) їх бачать. Отже "цей день книгу завершено" не має жодного власного індикатора в сітці — лише звичайна обкладинка+крапки, якщо того дня була ще й сесія читання; якщо книгу позначено завершеною БЕЗ сесії того дня (наприклад, статус змінено вручну без прив'язаної сесії) — день узагалі не отримує жодної обкладинки чи крапки в сітці (лише в `useMonthSummary`'s `booksFinishedCount`, без дня-прив'язки в UI).
- **Перечитування (reread) того дня** — жодного візуального маркера в сітці. `selectPrimaryBookForDay` рахує по `userBookId`, не по `reading_run_id` — повторний прохід тієї самої книги виглядає в сітці абсолютно так само, як перший. Позначка "Перечитування, прохід №N" з'являється ЛИШЕ на екрані деталей дня (§34), не в клітинці.

## 32. PRIMARY BOOK OF DAY

CODE VERIFIED + AUTOMATED TEST VERIFIED (`src/lib/calendarIntensity.ts`, `selectPrimaryBookForDay`; `src/lib/calendarIntensity.test.ts`).

Точний код (`calendarIntensity.ts`, рядки 29-57):

```ts
export function selectPrimaryBookForDay(sessions: DaySessionSummary[]): string | null {
  if (sessions.length === 0) return null;

  const minutesByBook = new Map<string, number>();
  const firstStartByBook = new Map<string, string>();
  for (const session of sessions) {
    const minutes = Math.round((session.durationSeconds ?? 0) / 60);
    minutesByBook.set(session.userBookId, (minutesByBook.get(session.userBookId) ?? 0) + minutes);
    const existingFirstStart = firstStartByBook.get(session.userBookId);
    if (!existingFirstStart || session.startedAt < existingFirstStart) {
      firstStartByBook.set(session.userBookId, session.startedAt);
    }
  }

  let winnerBookId: string | null = null;
  let winnerMinutes = -1;
  let winnerFirstStart = '';
  for (const [userBookId, minutes] of minutesByBook) {
    const firstStart = firstStartByBook.get(userBookId) ?? '';
    const winsOnMinutes = minutes > winnerMinutes;
    const winsOnTieBreak = minutes === winnerMinutes && firstStart < winnerFirstStart;
    if (winnerBookId === null || winsOnMinutes || winsOnTieBreak) {
      winnerBookId = userBookId;
      winnerMinutes = minutes;
      winnerFirstStart = firstStart;
    }
  }
  return winnerBookId;
}
```

**Точне правило**: перемагає книга з найбільшою СУМОЮ хвилин за день, де хвилини кожної окремої сесії округлені (`Math.round(durationSeconds/60)`) ПЕРЕД підсумовуванням по книзі (не підсумовується у секундах з округленням в кінці) — той самий вираз, що й `sumSessionMinutes` (`readingAggregates.ts`), але порахований по групах `userBookId`. **Tie-break**: при рівності сум перемагає книга, чия сесія ЗА ЦЕЙ ДЕНЬ (`firstStartByBook` — мінімальний `startedAt` серед сесій ЦІЄЇ книги того дня, не глобальний мінімум) стартувала РАНІШЕ (лексикографічне порівняння ISO-рядків, коректно для монотонних timestamp). `durationSeconds: null` (сесія без тривалості — теоретично неможливо для `listStartedBetween`, який фільтрує `ended_at IS NOT NULL`, але функція захисно трактує як 0 хв, не падає) — підтверджено тестом "null durationSeconds трактується як 0 хвилин".

Тести (`calendarIntensity.test.ts`, 5 кейсів `selectPrimaryBookForDay`) точно покривають задокументоване правило: без сесій → `null`; одна книга; сума хвилин переважає над однією довгою сесією (2×20хв > 1×35хв); tie-break за раннім стартом; `null` duration. Жодної розбіжності між кодом, тестами й `docs/CALENDAR_2_0.md`'s описом правила не знайдено.

**Важливий нюанс, не задокументований явно**: правило рахує по `userBookId` (запис бібліотеки, прив'язаний до КОНКРЕТНОГО видання), не по `workId`/`reading_run_id`. Тобто дві сесії того самого твору, але РІЗНИХ видань (два окремих `user_book`) чи РІЗНИХ проходів перечитування (той самий `user_book`, різний `reading_run_id`) — рахуються в ту саму групу (перечитування) або в різні групи (різні видання) виключно за `userBookId`, без жодного спеціального врахування run-меж (детальніше §35, пункт про перечитування/видання).

## 33. CALENDAR AGGREGATION

CODE VERIFIED (`src/features/calendar/useCalendarSessions.ts`, `useMonthCalendarData`, рядки 44-94; `UserBookRepository.listWithDetailsByIds`/`attachDetailsBatch`).

`useMonthCalendarData(days)` для ВСІЄЇ сітки місяця (42 клітинки з паддінгом):

1. **1 запит**: `ReadingSessionRepository.listStartedBetween(db, startIso, endIso)` — усі завершені сесії, що стартували в діапазоні сітки (`WHERE started_at >= ? AND started_at < ? AND deleted_at IS NULL AND ended_at IS NOT NULL`).
2. Групування по `dayKey` і виклик `selectPrimaryBookForDay` — ЧИСТО в JS, без SQL.
3. **Пакетний запит книжкових деталей** — `UserBookRepository.listWithDetailsByIds(db, [...primaryBookIds])` лише для УНІКАЛЬНИХ "головних" `userBookId` усіх днів місяця разом (не по одному на день). Це розгортається на:
   - `UserBookRepository.listByIds` — 1 запит (`WHERE id IN (...) AND deleted_at IS NULL`);
   - `attachDetailsBatch` — `EditionRepository.listByIds` (1) + `Promise.all([WorkRepository.listByIds, AuthorRepository.listByWorkIds, PublisherRepository.listByIds, TranslatorRepository.listByEditionIds])` (4 паралельно) = 5 запитів.
   - Разом `listWithDetailsByIds` = 6 запитів, як і стверджує `docs/CALENDAR_2_0.md` — підтверджено прямим читанням `UserBookRepository.ts`.

**Підсумок**: рівно **7 SQL-запитів на весь місяць** (1 + 6), НЕЗАЛЕЖНО від того, скільки днів мали активність чи скільки різних книг фігурує — підтверджено, N+1 щодо `reading_session`→`user_book` дійсно відсутній. `useMonthSummary` (окремий хук/запит) додає ще 2 запити в `Promise.all` (`listStartedBetween` + `ActivityHistoryRepository.listBetween`, останній — один SQL-запит з 8-гілковим `UNION ALL` усередині, фізично одна `db.getAllAsync` виклик) — разом весь екран Календаря на відкритті місяця виконує **~9 SQL-запитів**, фіксовано.

**Обкладинки НЕ є N+1 на рівні SQL** — `coverUrl` уже приходить у складі пакетного `listWithDetailsByIds`. Але на рівні МЕРЕЖІ кожна УНІКАЛЬНА обкладинка, показана в сітці (до 31 різних "головних" книг на місяць), — це окремий HTTP-запит `expo-image`'ного `<Image>` (`CoverThumbnail.tsx`) до URL обкладинки; це не SQL N+1, але це реальне "по одному мережевому запиту на кожну відмінну обкладинку місяця" — з вбудованим кешем `expo-image` (повторний рендер того самого `coverUrl` — з кешу, докладніше §38).

## 34. CALENDAR DAY DETAILS

CODE VERIFIED (`app/day/[date].tsx`, `useDaySessions`).

Вміст екрана (route, не modal sheet — свідоме рішення, `docs/CALENDAR_2_0.md` §"Чому лишився route, не sheet", підтверджено кодом: `Stack.Screen` з `headerShown: true`, звичайний `router.push`):

1. **Заголовок нативного хедера** — дата (`d MMMM yyyy`, укр. локаль).
2. **"Підсумок дня"** (`Card`) — `formatDuration` + сторінки + кількість книг (`sumSessionMinutes`/`sumSessionPages` з `readingAggregates.ts`, ЛИШЕ по `data.sessions`, §35 нижче — важливо, які саме сесії туди потрапляють).
3. **"Сесії читання"** — список карток, кожна: `CoverThumbnail` (40×58, звичайний `hideFallbackLetter` за замовчуванням `false` — тобто тут, на відміну від сітки, ІНІЦІАЛ fallback ПОКАЗУЄТЬСЯ), назва, тривалість, діапазон сторінок (`startPage → endPage`), і УМОВНО (`runNumber ? … : null`) рядок з іконкою `repeat` і текстом "Перечитування, прохід {runNumber}".
4. **"Інша активність"** — решта семи типів подій дня (`otherEvents`, `session_completed` виключено фільтром), кожна — `DayEventRow` з іконкою типу, лейблом типу (`activityEventTypeLabels`), назвою книги, і `eventDetail(event)` (спойлер-safe для нотаток/цитат).

**Run-мітка перевірена в коді**: `runNumber ? … : null` (рядок 133) — `runNumber` береться з `data?.runNumberBySessionId.get(session.id)`, який заповнюється ЛИШЕ коли `run.runNumber > 1` (`useCalendarSessions.ts`, рядок 199: `if (run && run.runNumber > 1) runNumberBySessionId.set(...)`) — тобто перший прохід книги дійсно НІКОЛИ не отримує мітки (навіть не `"прохід 1"`, просто відсутній рядок), а другий+ прохід коректно показує "Перечитування, прохід {N}", N ≥ 2. Мітка також входить в `accessibilityLabel` картки сесії (рядок 111-115: `runNumber ? '{title}, перечитування, прохід {N}' : title`).

**Оцінка "перевантаженості"** — для "насиченого" дня (кілька книг, кілька типів подій) екран рендерить до **3 верхньорівневих секцій** ("Підсумок дня" / "Сесії читання" / "Інша активність"), кожна — плаский список карток без вкладених під-акордеонів чи табів. На відміну від Book Details (§28-scope іншого розділу аудиту, 15 можливих секцій), Day Details структурно ПЛОСКИЙ — це не "перевантажений" екран за кількістю СЕКЦІЙ; ризик перевантаження тут інший: список карток `otherEvents`/`sessions` МОЖЕ вирости довгим для дня з активністю по 5+ книгах одночасно (немає ліміту/згортання/пагінації — рендериться весь масив `.map()` напряму, без `FlatList`/віртуалізації, §38), але це не архітектурна "концептуальна" складність, а звичайний необмежений список.

## 35. CALENDAR DATA CORRECTNESS

CODE VERIFIED, з окремими позначками нижче. Це головний розділ розбіжностей із задокументованим "усе гаразд".

**Перетин півночі** — CODE VERIFIED, коректно. `ReadingSessionRepository.listStartedBetween`'s власний коментар (рядок 285-286): "`started_at` (не `ended_at`) — сесія 'належить' дню, коли її почали, навіть якщо вона випадково перетнула північ." Підтверджено кодом: і `useMonthCalendarData`, і `useDaySessions` групують/фільтрують виключно по `started_at`; уся `duration_seconds` (може включати хвилини вже НАСТУПНОГО календарного дня) повністю приписується дню СТАРТУ. Подвійного рахунку немає (сесія фізично один рядок, `started_at` один), але це означає: сесія 23:50→00:40 (50 хв) рахується ЦІЛКОМ на день СТАРТУ, жодної хвилини не потрапляє на наступний день, навіть якщо фактично 40 з 50 хвилин читання відбулись уже НАСТУПНОГО календарного дня. Задокументована, свідома поведінка, не помилка.

**Часовий пояс** — CODE VERIFIED, локальний, послідовно. Усі дати в БД — UTC ISO-рядки (`src/lib/dateUtils.ts`, коментар "Усі дати в БД зберігаються як ISO-8601 UTC TEXT"). Групування дня в JS — `format(new Date(session.startedAt), 'yyyy-MM-dd')` (date-fns `format` БЕЗ `formatInTimeZone`/UTC-варіанту — використовує ЛОКАЛЬНИЙ часовий пояс пристрою для вилучення компонентів дати з `Date`-об'єкта). Межі діапазону запиту — `startOfDay(firstDay).toISOString()`/`addDays(startOfDay(lastDay), 1).toISOString()`, де `firstDay`/`lastDay` — також `Date`-об'єкти, побудовані `date-fns`'s `startOfWeek`/`startOfMonth` у ЛОКАЛЬНОМУ часовому поясі, потім конвертовані в UTC ISO для SQL-порівняння з UTC-збереженими `started_at`. Обидва боки (SQL-фільтр діапазону і JS-групування по днях) послідовно використовують ЛОКАЛЬНИЙ календарний день пристрою — жодної розбіжності UTC-vs-локальний не знайдено. Це коректна поведінка для персонального рідера (день "належить" користувачу за його місцевим часом).

**Межа місяця** — CODE VERIFIED, з одним косметичним нюансом. `useMonthCalendarData` рахує по СІТЦІ (з паддінгом сусідніх місяців для повних тижнів), `useMonthSummary` — рівно по календарних межах місяця (`startOfMonth`/`endOfMonth`) — навмисно різні діапазони, задокументовано і коректно (підсумок вересня не зачіпає серпневі/жовтневі дні сітки). Нюанс: `app/(tabs)/calendar.tsx`, рядок 119 — `const primaryUserBook = day.inCurrentMonth ? stats?.primaryUserBook ?? null : null;` — для днів ПОЗА поточним місяцем (паддінг-дні) обкладинка ПРИМУСОВО `null`, АЛЕ `intensity` (рядок 118: `const intensity = stats?.intensity ?? 0;`) рахується БЕЗУМОВНО, без такого ж гейту на `inCurrentMonth`. Наслідок: паддінг-день сусіднього місяця з реальною активністю показує звичайну пілюлю-з-числом (не обкладинку) ТА крапки інтенсивності під нею одночасно — стан, якого немає в жодного "своєму" дня місяця (у "своїх" днів без обкладинки крапок теж немає, бо там `intensity === 0`). Малопомітна, але реальна візуальна непослідовність — не задокументована в `CALENDAR_2_0.md`.

**DST-переходи** — NOT VERIFIED (немає тестів на це); HYPOTHESIS низького ризику. `date-fns`'s `startOfDay`/`addDays`/`startOfWeek` — усі коректно обробляють DST у своїй реалізації (працюють з локальним `Date`, не з фіксованою кількістю мілісекунд), тож механічно перехід не повинен ламати межі днів. Жодного спеціального тесту саме на DST-межу в `calendarGrid.test.ts` немає (**файл взагалі не існує** — `src/lib/calendarGrid.ts`, чиста, легко тестована функція, не має жодного тестового файлу; перевірено `find`/`glob` — лише `calendarIntensity.test.ts` існує в `src/lib/`).

**Сесія без `ended_at`** (у процесі / "осиротіла") — CODE VERIFIED. `listStartedBetween` явно фільтрує `ended_at IS NOT NULL` — незавершена сесія НІКОЛИ не з'являється в Календарі, навіть якщо вже триває кілька годин того дня. Наслідок: день з активною, ще не завершеною сесією виглядає в Календарі як день БЕЗ активності, аж доки сесію не завершать (тоді вона ретроактивно "проявляється" під днем свого `started_at`, який до цього моменту вже міг бути показаний користувачу як порожній). Це не помилка групування, а прямий наслідок дизайну "лише завершені сесії" — не задокументовано явно в `CALENDAR_2_0.md` як trade-off.

**Видалена (м'яко) сесія** — CODE VERIFIED, коректно. `deleted_at IS NULL` фільтрується і в `listStartedBetween`, і в `session_completed`-гілці `ACTIVITY_UNION_SQL` — видалена сесія зникає з Календаря повністю й одразу, без затримки кешу (React Query інвалідація — поза межами цього файлу, не перевірялась окремо тут).

**Видалена (м'яко) книга (`user_book.deleted_at`)** — **CODE VERIFIED, і це найсерйозніша знахідка цього розділу: сітка місяця та деталі дня розходяться в поведінці одна з одною.**
- `ReadingSessionRepository.listStartedBetween` НЕ перевіряє стан `user_book` (жодного JOIN на `user_book`/`deleted_at`) — сесії видаленої книги й далі повертаються.
- `UserBookRepository.listByIds`/`listWithDetailsByIds` (батчер деталей) ФІЛЬТРУЄ `deleted_at IS NULL` на `user_book` — видалена книга просто не потрапляє в `primaryBookById` Map.
- Результат у `useMonthCalendarData`: якщо "головна" книга дня видалена, `primaryUserBook: null`, АЛЕ `totalMinutes`/`intensity` й далі рахуються з ЖИВИХ+ВИДАЛЕНИХ сесій разом (рядок 81, `sumMinutesForDay(daySessions)` — усі сесії дня, до фільтрації по `user_book`). **Клітинка показує звичайну пілюлю-без-обкладинки, АЛЕ з крапками інтенсивності** — точно той самий "число+крапки без обкладинки" стан, що й для паддінг-днів вище, тепер із зовсім іншої причини (видалена книга, не межа місяця).
- Якщо того дня була ДРУГА, ЖИВА книга з меншою сумою хвилин — вона просто не отримує обкладинки взагалі (переможець видалений → `null`, друге місце не підхоплюється як запасний варіант) — цілком жива книга того дня лишається невидимою в сітці, хоча цілком могла б показати свою обкладинку.
- Результат у `useDaySessions`: `sessionSummaries` ФІЛЬТРУЄ сесії, для яких `userBookById.get(session.userBookId)` не знайдено (рядок 187-192, `.filter(item => item !== null)`) — сесії видаленої книги ПОВНІСТЮ зникають зі списку "Сесії читання" І з `summary` (яка рахується з `daySessions = data?.sessions ?? []`, ВЖЕ відфільтрованих). **Наслідок: "Підсумок дня" (хвилини/сторінки/книги) на екрані деталей і крапки інтенсивності в сітці місяця для ТОГО САМОГО дня можуть показувати РІЗНІ числа** — сітка рахує видалену книгу в інтенсивність, деталі дня — ні. Це не гіпотетично: жодних юнітних/інтеграційних тестів на цей сценарій немає (нижче).
- `ActivityHistoryRepository`'s `ACTIVITY_UNION_SQL` (усі 8 гілок, включно з `book_started`/`book_finished`/`rating_added`/нотатки/цитати/полиці) фільтрує `BOOK_ALIVE` (`ub.deleted_at IS NULL AND w.deleted_at IS NULL AND e.deleted_at IS NULL`) на КОЖНІЙ гілці — підтверджено окремим тестом (`ActivityHistoryRepository.test.ts`, рядок 197: "м'яко видалена книга зникає з усіх своїх подій одразу (deleted_at на user_book)"). Тобто для видаленої книги ВСЯ "Інша активність" (старт/фініш/оцінка/нотатка/цитата/полиця) зникає одразу й ПОВНІСТЮ з деталей дня та з `booksStartedCount`/`booksFinishedCount` підсумку місяця — це ІСНУЮЧА, протестована на рівні репозиторію поведінка (не нова для Фази 19), успадкована `listBetween` від уже наявного `listRecent`.
- **Це прямий наслідок Фази 26 (soft-delete readiness) НЕ включати перевірку взаємодії Календаря з `user_book.deleted_at`** — Фаза 26 додала `deleted_at` лише до `book_capsule`/`book_memory`/`rating` (яких раніше НЕ було), і додала 7 нових Data Doctor-перевірок для `reading_run`-узгодженості, але жодна з них не перевіряє "сесія існує, а книга видалена" сценарій саме для Календаря. `docs/CALENDAR_2_0.md`'s "Пізніші дотики" стверджує, що Фаза 28 "не знайшла жодних знахідок" для Календаря — але Фаза 28 (`docs/UI_COMPLEXITY_AUDIT_PHASE28.md`, метод, рядки 9-20) явно перевіряла лише "навігаційну складність"/"п'ять намірів користувача" читанням коду ШЕСТИ екранів на предмет дублюючих CTA — НЕ перевіряла коректність даних. Показово: та сама Фаза 28 знайшла ІДЕНТИЧНИЙ КЛАС бага в `ShelfRepository.listAll`/`search` (лічильник полиці рахував видалені книги) для Бібліотеки — тобто метод, здатний виявити такий бага, застосовувався в тій самій фазі до іншого екрана, але не до Календаря.

**Ручні оновлення прогресу без сесії** — **CODE VERIFIED, справжня прогалина (наразі непрацююча функціональність, а не бага користувача).** `ReadingProgressRepository.recordManual` (`session_id: NULL`, `source: 'manual'`) — окремий, повністю відокремлений від `reading_session` шлях запису прогресу вже існує в domain-моделі. Жоден з трьох календарних запитів (`ReadingSessionRepository.listStartedBetween`, `ActivityHistoryRepository`'s 8-гілковий `UNION ALL`) НЕ читає таблицю `reading_progress` взагалі — `recordManual`-записи були б повністю невидимі Календарю (ні обкладинка, ні крапка, ні рядок у деталях дня, ні підсумок місяця). Однак `grep` по `src/features/`/`src/components/` показує: **`ReadingProgressRepository.recordManual` не викликається НІДЕ в UI/хуках** (лише у власному репозиторії і власному тесті) — це мертвий, неприєднаний шлях коду в поточному стані застосунку. Єдиний реальний "ручний" шлях зміни сторінки — `useUpdateCurrentPage` (`src/features/library/useUpdateUserBook.ts`, викликається з композера на екрані АКТИВНОЇ сесії) — але він викликає лише `UserBookRepository.updateCurrentPage` (кеш-поле), НЕ пише `reading_progress` взагалі, і відбувається В КОНТЕКСТІ вже існуючої `reading_session`, яка й так буде врахована Календарем звичайним шляхом. Висновок: сьогодні "manual-only" прогрес без сесії користувачу НЕДОСТУПНИЙ як фіча — тож Календар нічого реально не пропускає ЗАРАЗ, але архітектурно, якщо `recordManual` колись підключать до UI (виглядає підготовленим саме для цього), Календар мовчки почне пропускати ці записи без жодної додаткової роботи — жодного зв'язку/коментаря між `ReadingProgressRepository` і `useCalendarSessions.ts` немає.

**Перечитування — конфлація сесій різних run** — CODE VERIFIED, конфлації немає. `runNumberBySessionId` у `useDaySessions` обчислюється ПО-СЕСІЙНО (`session.readingRunId → run`), не по дню — навіть якщо один день містить сесії ОБОХ run №1 і №2 тієї самої книги (теоретично можливо: користувач завершив книгу вранці, одразу почав перечитувати того ж дня), кожна сесія в списку "Сесії читання" отримує СВОЮ ВЛАСНУ, коректну мітку (перша — без мітки, друга — "прохід 2"). Конфлації для сітки місяця також немає — `selectPrimaryBookForDay` навмисно групує по `userBookId` (не по `run_id`), що коректно ("та сама книга" — це продукт, не окремий прохід), і крапки інтенсивності просто сумують хвилини обох run разом під тим самим `userBookId` — очікувана, не помилкова поведінка.

**Кілька видань того самого твору** — CODE VERIFIED. Кожне видання (`edition_id`) в бібліотеці користувача — ОКРЕМИЙ `user_book` (`UserBookRepository`, docstring: "Один edition може мати щонайбільше один активний user_book"). `selectPrimaryBookForDay` групує СУВОРО по `userBookId`, не по `workId` — якщо користувач того самого дня читав ДВА РІЗНИХ видання ОДНОГО твору (два окремих бібліотечних записи), вони конкурують як ДВІ НЕЗАЛЕЖНІ "книги" за звичайним правилом §32 (сума хвилин), і клітинка покаже обкладинку лише ОДНОГО видання-переможця — без жодного спеціального об'єднання "це насправді той самий твір". Це узгоджена, а не помилкова поведінка в межах моделі "user_book = бібліотечний запис", але означає: якщо користувач перейшов з паперового видання на електронне того самого твору того самого дня, Календар покаже це як "2 книги" того дня (як і мало б бути для двох незалежних бібліотечних записів), а не як один безшовний перехід.

## 36. CALENDAR VISUAL AUDIT

**Вердикт: ACCEPTABLE**, ближче до CALM на типовому екрані, з одним реальним ризиком на вузьких екранах з великим системним шрифтом.

Обґрунтування, за фактичною формулою розкладки (`computeCoverSize`, `app/(tabs)/calendar.tsx`, рядки 23-26):

```ts
function computeCoverSize(windowWidth: number, horizontalPadding: number): number {
  const cellWidth = (windowWidth - horizontalPadding * 2) / 7;
  return Math.round(Math.max(20, Math.min(34, cellWidth - 16)));
}
```

- `ScreenContainer`'s `paddingHorizontal: theme.spacing.lg` (16px) — підтверджено відповідність параметра `horizontalPadding` реальному контейнеру.
- Для типового телефону 390px (iPhone 13/14 клас): `cellWidth = (390-32)/7 ≈ 51.1px`, `coverSize = round(min(34, 35.1)) = 34` (максимум клампу). Клітинка ~51×51px, обкладинка 34×34 + рамка/бейдж дня — комфортний запас "повітря" навколо.
- Для вузького телефону 320px (iPhone SE 1-го покоління / бюджетний Android): `cellWidth = (320-32)/7 ≈ 41.1px`, `coverSize = round(min(34, 25.1)) = 25`. Клітинка ~41×41px — ПОМІТНО менша за `theme.minTouchTarget=44`, без жодного `hitSlop` на день-клітинці (на відміну від `MonthNavButton`, яка явно використовує і `theme.minTouchTarget`, і `hitSlop={8}`) — реальний, хоч і малопомітний, ризик дотику на найвужчих реальних екранах (детальніше §37).
- **31-денний місяць / 6 рядків сітки** — сітка завжди рівно 6 рядків (42 клітинки, `buildMonthGrid`) незалежно від довжини місяця (28-31 день) — жоден місяць не "стискає"/"розтягує" висоту рядка по-різному, розкладка стабільна.
- **Одночасні візуальні елементи на клітинку**: максимум 4 шари одночасно — (1) обкладинка/пілюля, (2) кільце-рамка (лише today+з обкладинкою), (3) бейдж числа дня (коло поверх обкладинки), (4) ряд крапок інтенсивності знизу. Це помірна, але не хаотична густина — не "heatmap"-стиль з кольоровим градієнтом (свідомо, `docs/CALENDAR_2_0.md`), а дискретні елементи.
- **Велике системне масштабування шрифту** — `maxFontSizeMultiplier={1.2}` застосовується ЛИШЕ до самого числа дня (і бейдж, і пілюля-варіант) — підтверджено кодом (рядки 172, 191) і `docs/A11Y_LARGE_TEXT_AUDIT.md` (§3, рядок 74, точний опис фіксу Фази 22). При максимальному системному масштабуванні (`maxFontSizeMultiplier` обмежує РІСТ, не забороняє його повністю) число дня росте до 1.2× базового розміру, коло-бейдж має фіксований `minWidth/height: 18` — при 1.2× число (13px×1.2≈15.6px) все ще влазить у 18px коло з запасом; підпис місяця (`variant="heading"`) і weekday-лейбли (`variant="micro"`) НЕ мають `maxFontSizeMultiplier` — вони масштабуються повністю, ризикуючи обрізати weekday-скорочення ("Пн"/"Вт" — короткі, малоймовірно, але не перевірено окремим тестом чи скриншотом).
- **Темна тема** — жодного хардкодженого кольору (`#hex`/`rgb(`) у `calendar.tsx`/`day/[date].tsx` (перевірено `grep`, збігів нуль) — усі кольори через `theme.colors.*`/`fallbackColor` (з БД, дизайн-рішення книги, а не хардкод екрана). Теоретичний ризик — `fallbackColor` книг (`work.cover_fallback_color`), збережений одноразово при додаванні книги, МІГ БИ погано контрастувати в темній темі, якщо колір обирався винятково під світлу — але це властивість даних книги, не коду Календаря, і поза межами цього аудиту файлів.

## 37. CALENDAR ACCESSIBILITY

CODE VERIFIED (`app/(tabs)/calendar.tsx`, `buildDayAccessibilityLabel`, рядки 48-53).

Точна побудова `accessibilityLabel`:

```ts
function buildDayAccessibilityLabel(day: CalendarDay, stats: DayCalendarStats | undefined): string {
  const dateLabel = format(day.date, 'd MMMM', { locale: uk });
  if (!stats || stats.intensity === 0) return `${dateLabel}, ${intensityLabel(0)}`;
  const bookPart = stats.primaryUserBook ? `, ${stats.primaryUserBook.work.title}` : '';
  return `${dateLabel}, ${intensityLabel(stats.intensity)}${bookPart}`;
}
```

де `intensityLabel` повертає буквальні слова: "без читання" / "невелика активність читання" / "середня активність читання" / "висока активність читання". Підтверджено: мітка включає (1) дату словами ("14 вересня", не лише число), (2) рівень інтенсивності СЛОВАМИ (не число/іконку), (3) назву головної книги, КОЛИ вона є (`stats.primaryUserBook.work.title`) — точно відповідає вимозі ТЗ і опису `CALENDAR_2_0.md`.

**Обкладинка — НЕ єдиний індикатор активності**: підтверджено кодом — сама `Pressable`-клітинка несе повний `accessibilityLabel` (текстовий, незалежний від того, чи завантажилось зображення), а візуальні крапки інтенсивності — окремий елемент (`View`, без власного `accessibilityLabel`, але й не єдине джерело інформації, бо та сама інформація вже словами в `accessibilityLabel` батьківської `Pressable`). Для скрін-рідера обкладинка взагалі не має значення — інформація приходить з тексту мітки, не з зображення. **Нюанс**: сам `<Image>` усередині `CoverThumbnail` (коли зображення завантажилось) несе ВЛАСНИЙ `accessibilityLabel="Обкладинка: {title}"` (`CoverThumbnail.tsx`, рядок 107) — не приховано `accessibilityElementsHidden`/`importantForAccessibility` (на відміну від fallback-плашки, рядки 129-130, яка явно ПРИХОВАНА від скрін-рідера). Оскільки батьківська `Pressable` не встановлює явний `accessible={true}` для групування дочірніх елементів в один фокус-вузол, теоретично можливе ПОДВІЙНЕ озвучення (мітка клітинки + окрема мітка зображення) на платформах, де RN не групує це автоматично для `accessibilityRole="button"` — NOT VERIFIED на реальному скрін-рідері (жодних доказів ручного тестування VoiceOver/TalkBack для Календаря в жодному документі, §38).

**Touch target** — `MonthNavButton` явно `theme.minTouchTarget` (44×44) + `hitSlop={8}` — відповідає гайдлайну. День-клітинка НЕ має явного `hitSlop` чи мінімального розміру — розмір повністю похідний від `width: '${100/7}%'` + `aspectRatio: 1` контейнера. На типовому екрані (≥375px) це ≥46px (вище 44pt), але на найвужчих реальних екранах (320px, §36) — ~41px, ПОМІТНО нижче гайдлайну, без компенсації `hitSlop`.

**Selected-day / today стани** — CODE VERIFIED, вичерпний опис у §30/§36: today — рамка (з обкладинкою) АБО заливка (без обкладинки), два різних механізми залежно від гілки рендеру. **"Обраний день" (selected) стану в сітці НЕМАЄ ВЗАГАЛІ** — тап одразу веде на окремий екран `/day/[date]`, немає стану "переглядаю деталі дня X, сітка позначає його інакше" (бо сітка й деталі — різні екрани, не спліт-view/sheet поверх сітки). Це узгоджено з архітектурним рішенням "route, не sheet" (§30), але означає: повернувшись з деталей дня назад, користувач не бачить жодного сліду "це той день, який я щойно дивився" в самій сітці.

## 38. CALENDAR PERFORMANCE

**NOT BENCHMARKED.** Жодного реального бенчмарку Календаря окремо не знайдено — CODE VERIFIED негативний результат пошуку:

- `docs/V1_6_1_FINAL_REPORT.md` §9 ("Performance findings") — CODE VERIFIED, `grep -i calendar` по всьому документу не дає жодного збігу в §9 взагалі; Календар згадується лише в §17/§18 (продуктова консолідація) і §11 checklists, НЕ в перфоманс-розділі.
- `docs/PERFORMANCE_AUDIT.md` (Фаза 24, `026_hot_query_indexes.ts`) — CODE VERIFIED, жодного згадування "calendar"/"Календар" у всьому документі (перевірено `grep`). Фікстура бенчмарку (1000 книг/5000 сесій/10000 записів щоденника) використовувалась для ЧОТИРЬОХ конкретних query-патернів (`edition.isbn10`, `user_book(status, updated_at)`, `note`/`quote(user_book_id, created_at)`, `reading_session(user_book_id, started_at)`) — жоден з них НЕ є `ReadingSessionRepository.listStartedBetween` (діапазон БЕЗ `user_book_id` у фільтрі) чи `ActivityHistoryRepository.listBetween` (8-гілковий `UNION ALL`), тобто Календар прямо НЕ входив у скоуп Фази 24.
- CHANGELOG Фаза 24 — не читана окремим блоком тут, але сам факт відсутності "Calendar" у `docs/PERFORMANCE_AUDIT.md`/`026_hot_query_indexes.ts` (обидва прочитані повністю) достатній для висновку "поза скоупом".
- `docs/V1_6_1_FINAL_REPORT.md`, §11 (Manual device checklist), рядок 453, дослівна цитата: **"REREADING MODEL і Календар 2.0 ще жодного разу не перевірялись візуально на реальному пристрої."** — OWNER MANUAL VERIFIED статус: **явно NOT VERIFIED**, з прямою текстовою ознакою від самого звіту milestone'у, а не припущенням цього аудиту.

**Індексованість запитів дати-діапазону**:
- `ReadingSessionRepository.listStartedBetween` (`WHERE started_at >= ? AND started_at < ? AND deleted_at IS NULL AND ended_at IS NOT NULL`) — CODE VERIFIED індексовано: `idx_session_started_at ON reading_session(started_at)` існує з `001_base_schema.ts` (Milestone 0) і НЕ видалявся в `026_hot_query_indexes.ts` (та міграція видалила лише `idx_session_user_book`, замінивши його композитним `idx_session_user_book_started_at` — інший індекс, не той, що використовує календарний діапазонний запит). SQLite здатний робити `SEARCH reading_session USING INDEX idx_session_started_at (started_at>? AND started_at<?)` для цього запиту — HYPOTHESIS (не перевірено `EXPLAIN QUERY PLAN` у цій сесії, бо `docs/PERFORMANCE_AUDIT.md` цей конкретний запит не перевіряв), але вкрай імовірно коректно, з огляду на існування точного одноколонкового індексу.
- `ActivityHistoryRepository.listBetween` (`SELECT * FROM (${ACTIVITY_UNION_SQL}) WHERE occurred_at >= ? AND occurred_at < ?`) — **HYPOTHESIS, NOT VERIFIED, ризик значно вищий**: зовнішній `WHERE` накладається на РЕЗУЛЬТАТ 8-гіллевого `UNION ALL`, без ORDER BY/LIMIT усередині union — сучасний SQLite (push-down optimization, з версії ~3.23) МОЖЕ протягнути цей предикат у кожну з 8 гілок окремо, але навіть якщо протягне, лише 2 з 8 таблиць мають індекс на своїй датованій колонці, що фігурує тут (`note.created_at`/`quote.created_at` — `idx_note_created_at`/`idx_quote_created_at`, `003_journal_entry_extensions.ts`); решта п'ять зіставлень дати (`user_book.started_at`/`finished_at`/`added_at` для трьох гілок, `rating.created_at`, `shelf_book.added_at`, `reading_session.ended_at` для `session_completed`-гілки) — **без жодного індексу на цій конкретній колонці** (перевірено повним переліком `CREATE INDEX` по всіх міграціях — жодного `idx_..._started_at`/`finished_at`/`added_at`/`created_at`(rating)/`added_at`(shelf_book) для цих таблиць немає). За обсягом персонального SQLite (сотні-тисячі рядків, не мільйони) це, найімовірніше, не є відчутною проблемою на практиці, але формально ЖОДНА цифра/EXPLAIN QUERY PLAN для саме цього запиту в жодному документі проєкту не наведена — це не перевірено, лише обґрунтована гіпотеза, а не факт.

**Кешування обкладинок** — CODE VERIFIED: `CoverThumbnail` використовує `expo-image`'s `<Image>`, яка (за документованою поведінкою пакета й коментарем самого компонента, рядки 42-46) кешує зображення за замовчуванням — повторний рендер того самого `coverUrl` (навігація між місяцями назад-вперед, чи повернення з деталей дня) НЕ повторює мережевий запит. Перший показ КОЖНОЇ унікальної обкладинки місяця — усе одно окремий мережевий запит (до 31 різних, §33).

**Віртуалізація** — CODE VERIFIED, відсутня, і не потрібна: сітка місяця — фіксовані 42 елементи через звичайний `.map()` у `View`+`flexWrap` (не `FlatList`/`FlashList`), деталі дня — так само прямий `.map()` по `sessions`/`otherEvents` без ліміту. Для сітки (42 елементи, завжди) це прийнятно. Для деталей дня — при гіпотетично екстремальній кількості подій одного дня (реалістично малоймовірно для персонального застосунку) список необмежений і без вікна відображення — теоретичний, не підтверджений практикою ризик, той самий клас "не перевірено на реальному обсязі", що й решта цього розділу.

---

**Підсумок для §35 проти заяви `docs/CALENDAR_2_0.md`**: заява "Фаза 28 не знайшла жодних знахідок" для Календаря — CODE VERIFIED ТОЧНА щодо буквального обсягу Фази 28 (навігаційна/IA складність, підтверджено власним "Метод"-розділом `docs/UI_COMPLEXITY_AUDIT_PHASE28.md`), але створює ХИБНЕ враження "з Календарем усе гаразд" — Фаза 28 НІКОЛИ не перевіряла коректність даних (soft-delete взаємодію, N+1 за межами SQL, timezone), і саме в цьому обсязі §35 цього аудиту знаходить реальну, раніше не задокументовану розбіжність (сітка місяця vs деталі дня для видаленої книги) того самого КЛАСУ бага, що Фаза 28 сама знайшла й виправила для Бібліотеки (`ShelfRepository.listAll` рахував видалені книги) в тій самій фазі, тим самим методом читання коду — просто не застосованим до Календаря.
## 39. RECOMMENDATION CONSOLIDATION

**Так, `app/next-read.tsx` реально є єдиним новим проміжним екраном**, і його JSX буквально відповідає опису в `docs/PRODUCT_CONSOLIDATION.md`/`docs/NEXT_READ.md` — CODE VERIFIED (`app/next-read.tsx:35-88`). Структура рендеру:

- Заголовок секції **«З моєї полиці»** (`SectionHeader`) з двома `QuickAction`: «Обери мені книгу» → `router.push('/one-book-picker')` і «TBR reality check» → `router.push('/tbr')`.
- Заголовок секції **«Знайти нову книгу»** з двома `QuickAction`: «Що почитати завтра?» → `router.push('/tomorrow')` і «Тренди» → `router.push('/trends')`.

Це рівно 2 групи по 2 екрани — групування, заявлене в документації, підтверджується буквально по коду, не лише по коментарю.

**Home веде лише на `/next-read`.** Grep по `app/(tabs)/index.tsx` на рядки `/one-book-picker`, `/tomorrow`, `/tbr`, `/trends` не дав жодного збігу — єдине входження цих чотирьох слів у файлі рядок 352, `router.push('/next-read')`. Три попередні картки (`TomorrowEntryPointCard`/`OnePickerEntryPointCard`/`TrendsEntryPointCard`) як компоненти Home дійсно видалені — CODE VERIFIED.

**Але старі маршрути НЕ приховані — вони лишаються прямо досяжними з двох інших місць, свідомо, за задокументованим рішенням:**

1. **`HomeContextCard`** (Фаза 18, окремий "один слот" механізм, явно поза скоупом Фази 14) — коли лотерея `selectHomeContextCard` обирає кандидата `tbr_suggestion`, кнопка «Нарешті прочитати» веде напряму на `/tbr`, в обхід `/next-read` (`src/components/home/HomeContextCard.tsx:105-129`, CODE VERIFIED).
2. **Профіль (`app/(tabs)/profile/index.tsx`, `MENU_ITEMS`)** — рядок «TBR reality check» лишився в меню Профілю як прямий `onPress: () => router.push('/tbr')` (рядок 52), окремо і паралельно від нового пункту «Моє читання»/next-read. Це задокументовано буквально в `docs/NEXT_READ.md` §"Скоуп програми — свідомо НЕ чіпалось": "той самий принцип, що й `tbr_suggestion`-картка вище — уже конкретний намір, хаб був би зайвим кроком".

Отже: ментальна модель на Home дійсно консолідована до одного входу, але TBR reality check фактично має **три** живі точки входу одночасно (`/next-read` → «З моєї полиці», Профіль-меню напряму, і Home-контекстна картка напряму) — саме те явище, яке Фаза 14 нібито мала усунути для TBR ("вперше зробити рівноправним учасником"), лишається частково нерозв'язаним: TBR тепер рівноправна учасниця хабу, але паралельно й далі "похована" й "не похована" одночасно в двох інших місцях. Це не помилка — це задокументований свідомий вибір ("хаб був би зайвим кроком"), але сам факт множинності входів для тієї самої дії відтворює те саме явище, яке Фаза 14 критикувала у трьох конкуруючих картках, лише в меншому масштабі.

`/trends` не має жодного альтернативного прямого входу окрім `/next-read` (CODE VERIFIED — grep по всьому `app/`+`src/` на `/trends` не показав інших `router.push`).

## 40. RECOMMENDATION ARCHITECTURE

Три файли (`onePicker.ts`, `tomorrowRecommendation.ts`, `tbrEstimate.ts`) прочитані повністю — CODE VERIFIED.

**Джерела кандидатів:**
- `onePicker.ts` — власна бібліотека користувача (`user_book`, переважно TBR-статуси: `TBR_SCOPE_STATUSES` = `want_to_read` (сфера `tbr`) або `want_to_read`/`paused`/`did_not_finish` (сфера `any_unread`), явно виключає `reading`/`rereading`/`finished`).
- `tomorrowRecommendation.ts` — зовнішнє джерело (Google Books, через `buildSearchQueries`/`RawProviderBook`), книги, яких користувач ще НЕ додав.
- `tbrEstimate.ts` — теж власна бібліотека (`TbrBookInput[]`, викликач передає TBR-список), але це не "пошук однієї книги" — це агрегатна оцінка (сума сторінок, дні за 15/30/60 хв/день).

**Реальна перевірка на дублювання (по коду, не за назвою функції):**
- `filterCandidates`/`rankCandidates`/`pickCandidate` в `onePicker.ts` і `rankCandidates`/`pickCandidate` в `tomorrowRecommendation.ts` — **окремі, незалежні реалізації** з різними типами кандидата (`PickerCandidate` vs `RawProviderBook`) і різною логікою відстані (`onePicker.ts` виключає кандидата без `pageCount` з ранжування, ставлячи `Infinity`, тоді як `tomorrowRecommendation.ts#distanceFor` дає йому умовний штраф `pageBudget * 0.35`, а не нескінченність) — це буквально різний edge-case-вибір, не той самий код під двома іменами.
- **Дійсно спільний, явно імпортований код:** `onePicker.ts` імпортує `RecommendationPurpose`/`PURPOSE_KEYWORDS` і `TimeBudgetPreset` напряму з `tomorrowRecommendation.ts` (рядки 1-5) — той самий словник "настроїв" (light/cry/laugh/absorbed) і ключових слів використовується в обох файлах, не продубльований. Також обидва (через окремі хуки) використовують `FALLBACK_PAGES_PER_MINUTE` з `readingPace.ts`.
- `tbrEstimate.ts` не ділить жодного коду з двома іншими — це геть інша задача (сума/оцінка часу, не вибір однієї книги), і файл-коментар сам це підтверджує.

**Задокументована, НЕ виправлена розбіжність (Фаза 14, `docs/NEXT_READ.md` §"Темп читання"):** `useOnePicker.ts` рахує темп читання через `computeRollingPace` без явного `windowSize` → дефолт `DEFAULT_WINDOW = 5` (rolling останні 5 сесій), тоді як `useTomorrowRecommendation.ts`/`useTbrReality.ts` обидва явно передають `sessions.length` як `windowSize` → фактично lifetime-середнє. Тобто три "конкуруючі" рекомендаційні фічі рахують базовий "темп читання користувача" по-різному навіть після консолідації навігації — Фаза 14 виправила лише хибний коментар про це (раніше стверджував "усі три той самий rolling pace"), саму поведінку свідомо не чіпала (принцип "DO NOT SILENTLY CHANGE PRODUCT BEHAVIOR"). CODE VERIFIED через документацію файлу; сама розбіжність у поведінці `useOnePicker.ts`/`useTomorrowRecommendation.ts`/`useTbrReality.ts` не перевірялась цим проходом напряму (NOT VERIFIED щодо самих хуків, лише задокументоване твердження прочитане в коментарі `NEXT_READ.md`).

Висновок: три алгоритми залишаються трьома окремими алгоритмами з різним типом кандидата й різною математикою відстані — спільний лише словник понять (mood/purpose), не сам розрахунок. Це відповідає заявленому в документації "без видалення алгоритмів", і твердження про відсутність дублювання підтверджується реальним порівнянням коду, а не лише декларацією.

## 41. MEMORY CONSOLIDATION

`app/memory/index.tsx` прочитаний повністю — CODE VERIFIED. П'ять секцій дійсно рендеряться, кожна веде на реальний, окремий маршрут:

1. **«Цей день у твоєму читанні»** — завжди показаний `QuickAction`, `router.push('/on-this-day')`.
2. **«Час згадати»** (`dueCapsules` з `useMemoryHub`) — рендериться лише коли `dueCapsules.length > 0` (тиха деградація), кожен рядок `DueCapsuleRow` веде на `/recall/[workId]`.
3. **«Повернутися пізніше»** — завжди показаний `QuickAction`, `router.push({ pathname: '/journal', params: { revisitLater: '1' } })` — і `app/journal/index.tsx` дійсно читає цей параметр (`useLocalSearchParams<{ revisitLater?: string }>()`, рядок 593) і виставляє початковий стан фільтра `revisitLaterOnly` відповідно — deep-link реально працює, не просто заявлений у коментарі.
4. **«Капсули»** (`useMemoryIndex`) — завжди показана секція, з власним `EmptyState`, коли порожньо; заповнена — список `MemoryIndexRow`, кожен веде на `/memory/[workId]`.
5. **«Перечитання»** (`rereadCandidates` з `useMemoryHub`) — рендериться лише коли `rereadCandidates.length > 0`, кожен рядок веде на `/reread-comparison/[workId]` (сам цей маршрут — новий, з'явився саме в цій фазі як глобальний список, раніше такий перелік існував лише per-book).

Усі п'ять секцій справді присутні й функціональні — не декларація без коду.

**Чи заплутує сам хаб.** Певний ризик є: два різні джерела даних (`useMemoryIndex` і `useMemoryHub`) завантажуються паралельно (`isAnyLoading = isLoading || isHubLoading`), і при завантаженні весь екран показує єдиний текст "Завантаження…" замість посекційного — тобто поки один з двох запитів ще не завершився, користувач не бачить навіть завжди-присутні секції 1/3. Це не баг консолідації як такої, а деталь реалізації (NOT VERIFIED — не тестувалось, чи це відчутна затримка на практиці). Концептуально хаб залишається однорідним: усі п'ять пунктів відповідають на одне й те саме питання ("що варто згадати"), на відміну, наприклад, від Профілю до консолідації, де аналітика й TBR стояли поруч без тематичного зв'язку. Ризик плутанини нижчий, ніж міг би бути — секція 2 і 5 самі ховаються, коли порожні, тож для читача без активних капсул/перечитань хаб фактично звужується до трьох пунктів (Цей день/Повернутися пізніше/Капсули).

## 42. ACTIVITY HISTORY POSITION

`app/history.tsx` (Activity History, «Моя історія») лишається реальним, повнофункціональним маршрутом (SectionList, групування по датах, `useActivityHistory`) — CODE VERIFIED.

**Точка входу — рівно одна, і вона в Профілі, не на Home.** Grep по всьому `app/`+`src/` на рядок `/history` дав лише одне живе входження: `app/(tabs)/profile/index.tsx:48`, `MENU_ITEMS` пункт «Моя історія» → `router.push('/history')`. Це прямо підтверджує `docs/MEMORY_HUB.md`/`PRODUCT_CONSOLIDATION.md` §Фаза 16: "«Моя історія» прибрана з `HOME_SHORTCUTS` (4 → 3 пункти), лишається доступною з меню Профілю" — до консолідації вона була одним з чотирьох компактних шорткатів на Home поруч із Щоденник/Пам'ять/Статистика, тепер — лише secondary пункт у Профілі.

**Розмежування ролей із Journal і Memory дотримане на рівні навігації й тексту:** `app/journal/index.tsx` — "що я записував" (нотатки/цитати, з фільтром `revisitLaterOnly`), `app/memory/index.tsx` — "що варто згадати" (капсули/due-нагадування/перечитання), `app/history.tsx` — повна хронологічна стрічка подій (`ActivityEvent`, кожен рядок веде на `/work/[workId]`). Ці три екрани мають різний UI (Journal — список нотаток з фільтрами; Memory — 5 тематичних секцій; History — SectionList по датах з типом події) — це не той самий екран під трьома назвами. Water зазначу: сама роль History як "secondary, повна хронологія" словесно пояснена лише в doc-коментарі `app/memory/index.tsx:93-95`, а не в UI самого `/history` чи в підписі пункту меню Профілю — новий користувач, що натрапить на «Моя історія» в Профілі без контексту, не отримує пояснення "чим це відрізняється від Щоденника/Пам'яті" прямо на екрані (HYPOTHESIS щодо UX-сприйняття, не перевірено на реальному пристрої).

## 43. ANALYTICS CONSOLIDATION

`app/my-reading.tsx` прочитаний повністю — CODE VERIFIED, структура точно відповідає `docs/MY_READING.md`:

- Плаский список трьох `QuickAction`: «Статистика» → `/statistics`, «Читацький профіль» → `/reading-profile`, «Читацький відбиток» → `/fingerprint`.
- Секція «Підсумки» (`SectionHeader`, не окремий пункт) з двома `QuickAction`: «Рік» → `/wrapped/[year]` (поточний рік, обчислений `new Date().getFullYear()`) і «Сезони» → `/seasons/[seasonKey]` (поточний сезон, `currentSeasonKey`).

Профіль (`MENU_ITEMS`) справді має лише один рядок «Моє читання» → `/my-reading` замість колишніх п'яти — CODE VERIFIED (рядки 26-38 `app/(tabs)/profile/index.tsx`).

**Але, як і в §39/§41, "один хаб" не означає "єдина точка входу" для всіх п'яти екранів** — і це теж задокументовано, а не приховано:

- `StatsSummaryCard` на самому екрані Профілю (картка над меню, streak + прогрес року) веде напряму на `/statistics`, в обхід хабу — `app/(tabs)/profile/index.tsx:84`, `Pressable onPress={() => router.push('/statistics')}`.
- Home-шорткат «Статистика» (один з трьох `HOME_SHORTCUTS`: Щоденник/Пам'ять/Статистика) теж веде напряму на `/statistics`, не на `/my-reading` — `app/(tabs)/index.tsx:320`.

Обидва винятки прямо названі й обґрунтовані в `docs/MY_READING.md` §"Свідомо НЕ чіпалось" — не є забутим/випадковим дублюванням, а свідомим рішенням "тизер одного конкретного механізму, проміжний хаб був би зайвим кроком", те саме обґрунтування, що й для `tbr_suggestion`/Профіль-TBR у §39. Тобто `/statistics` конкретно має **три** живі точки входу (`/my-reading`, `StatsSummaryCard`, Home-шорткат) — найбільш "консолідований" на папері екран насправді лишається найдоступнішим напряму.

Навігація в хаб і назад — стандартна: `Stack.Screen` з заголовком «Моє читання» і системною кнопкою "назад" (той самий патерн, що й `next-read.tsx`), жодних додаткових ускладнень не знайдено.

## 44. SHARED ANALYTICS CALCULATORS

`src/lib/readingAggregates.ts` прочитаний повністю — CODE VERIFIED. Реально спільні, повторно використовувані функції: `sumSessionMinutes`, `sumSessionPages`, `computeBusiestMonth`, `filterFinishedInRange`, `computeTopGenreAmong`. Grep підтверджує реальний імпорт у семи файлах поза тестом: `useStatistics.ts`, `useReadingSeason.ts`, `useWrappedYear.ts`, `useCalendarSessions.ts`, `calendarIntensity.ts`, `activityEventDisplay.ts`, `app/day/[date].tsx` — тобто це справді не мертвий рефакторинг "заради тесту", а активно використовуваний спільний шар, і поширився вже й на Calendar (хоча Фаза 15 задумана саме для п'яти аналітичних екранів). Тестовий файл `readingAggregates.test.ts` реально має 17 `it(...)` — точно як заявлено в `PRODUCT_CONSOLIDATION.md` ("17 нових тестів").

**Знайдене реальне, свідомо НЕ об'єднане дублювання (задокументоване й самим кодом, і `MY_READING.md`) — назва та сама, семантика різна:**

- **`computeTopGenre` (`src/lib/readingProfile.ts:109`)** vs **`computeTopGenreAmong` (`readingAggregates.ts:104`)** — дві окремі реалізації "найчастіший жанр". `computeTopGenre` має поріг вибірки `MIN_BOOKS_FOR_TOP_GENRE = 5` (`readingProfile.ts:98`) і мовчить (`return null`), якщо книг < 5; `computeTopGenreAmong` рахує завжди, без порогу. Обидві функції існують паралельно в репозиторії — CODE VERIFIED, grep підтвердив обидва визначення.
- **`readingFingerprint.ts`'s `globalPace`-цикл** — рахує ту саму базову величину (сторінки/секунди сесій), іншим циклом (accumulate-if-positive), теж навмисно не об'єднаний.
- **`useStatistics.ts`'s `booksFinishedAllTime`/`booksFinishedThisYear`** (рядки 16-17, 60-69) — окремий підрахунок "скільки книг завершено", інший repository-виклик (`listStatusOnly`, не `listByStatus`) і інший фільтр (`getFullYear()`, не ISO-діапазон) — не використовує `filterFinishedInRange`.

Це не невиявлене дублювання — сам `readingAggregates.ts`, `docs/MY_READING.md`, і код усіх трьох "невключених" функцій узгоджено пояснюють ту саму причину (різна семантика під однаковою назвою).

**Найпомітніша знайдена цим проходом окрема (НЕ задокументована прямо як "залишок") розбіжність — фільтр "завершена книга" по всьому застосунку:** і `Statistics`, і `Wrapped`/`Seasons` фільтрують книги за `status = 'finished'`, а не за наявністю `finished_at` — сам `MY_READING.md` §"Відома, не виправлена цією фазою розбіжність" прямо визнає: книга, переведена назад у статус `'rereading'`, тихо зникає з обох підрахунків одночасно (той самий баг у двох місцях, лише тому, що обидва місця дублюють один і той самий базовий фільтр status, не через випадковість). Це задокументований, свідомо відкладений технічний борг, не прихована знахідка цього аудиту — але й досі не виправлений.

**Висновок §44:** реальне буквальне дублювання коду (5 функцій, ідентичний вираз у 2-3 місцях) справді підняте в спільний, активно перевикористовуваний модуль з власними тестами. Розбіжності, що лишились — не недогляд, а задокументовані навмисні рішення "та сама назва, різна семантика", підтверджені реальним переглядом коду обох сторін кожної пари.

## 45. HOME / MEMORY / ANALYTICS ROUTE COUNT

**Технічний підрахунок маршрутів:**

- `docs/V1_6_FULL_AUDIT_REPORT.md` (§3, "COMPLETE ROUTE MAP") зафіксував на момент повного аудиту: `Glob({pattern:"app/**/*.tsx"})` дав 46 файлів, 2 — layout (`app/_layout.tsx`, `app/(tabs)/_layout.tsx`), отже **44 реальні маршрути**.
- Поточний стан (цей аудит, `find app -name "*.tsx"`): **49 файлів**, 2 layout → **47 реальних маршрутів**. CODE VERIFIED.
- Різниця: **+3 маршрути**, попри те що ціль strand-у — консолідація, не видалення. Це узгоджується з явно заявленим принципом самих фаз ("консолідується навігація, не сам екран/алгоритм — жоден старий маршрут не видалений"): нові маршрути — це нові ХАБИ й один новий глобальний список, а не побічний ефект. Ідентифіковані нові маршрути: `app/next-read.tsx` (Фаза 14), `app/my-reading.tsx` (Фаза 15), `app/reread-comparison/[workId].tsx` (новий ГЛОБАЛЬНИЙ вхід у Фазі 16 — раніше порівняння перечитань було доступне лише per-book, без власного маршруту в переліку 44-х). Жоден із 44 старих маршрутів не зник (перевірено вибірково — `/tomorrow`, `/one-book-picker`, `/tbr`, `/trends`, `/statistics`, `/wrapped/[year]`, `/seasons/[seasonKey]`, `/history`, `/journal`, `/on-this-day`, `/characters/[workId]` тощо — усі присутні в поточному `find`-переліку).

**Концептуальна кількість (власна оцінка автора цього розділу, не з формального підрахунку):**

До strand-у (кінець V1.6.1-аудиту) користувач на Home/Профілі бачив окремо: 3 рекомендаційні картки (Tomorrow/OnePicker/Trends) + TBR як практично прихований пункт меню = фактично 4 "що читати далі"-концепції без ієрархії; 5 рядків аналітики в Профілі одним рядом з технічними утилітами; 4 "стрічки минулого" (Journal/History/Memory/OnThisDay) без розмежування ролей, де OnThisDay взагалі не мала постійного входу. Разом — **щонайменше 8-9 окремих, рівнозначно представлених навігаційних концепцій**, які користувач мав самостійно розрізняти без підказки, яка з них "правильна" для його наміру.

Після strand-у (Фази 13-19, 28) ключові навігаційні концепції на верхньому рівні (Home + Профіль-меню):
1. «Що читати далі?» (`/next-read`, з внутрішнім поділом "З моєї полиці"/"Знайти нову книгу")
2. «Моє читання» (`/my-reading`, аналітика + підсумки)
3. «Мій щоденник» (`/journal`)
4. «Моя пам'ять» (`/memory`, 5-секційний хаб)
5. «Моя історія» (`/history`, secondary, лише в Профілі)

Тобто **5 primary-концепцій** замість 8-9. Технічна кількість МАРШРУТІВ водночас зросла (44 → 47), бо консолідація навігації додала нові парасолькові екрани, а не видалила листові — саме цього й вимагало явне ТЗ "без видалення алгоритмів/функціональності". Це очікувана, а не суперечлива картина: мета strand-у була саме "менше концепцій, стільки ж (чи більше) реальних можливостей", і обидва числа (47 маршрутів, 5 концепцій) це підтверджують одночасно.

## 46. OFFLINE UX

Джерело — `docs/OFFLINE_UX.md` (Фаза 20) плюс власна перевірка коду. Пакет — `expo-network` (не `@react-native-community/netinfo`), хук `useIsOffline` (`src/lib/useIsOffline.ts`) — тонка обгортка над `Network.useNetworkState()`, офлайн визначається як `isConnected === false || isInternetReachable === false` (перевіряє саме `isInternetReachable`, не лише факт з'єднання — ловить капітал-портал без реального інтернету). CODE VERIFIED — grep підтвердив реальне існування `useIsOffline.ts` і `OfflineNotice.tsx`, і їх використання рівно у двох місцях: `app/isbn-scan.tsx`, `app/(tabs)/search.tsx`.

**Core reading loop (сесії/нотатки/оцінки/полиці):** локально-перший, увесь запис — у SQLite, без мережі. `docs/LOCAL_FIRST.md`/`OFFLINE_UX.md` прямо стверджують: "жодної mutation/retry-черги… мережа потрібна лише для (M7) пошуку метаданих зовнішніх провайдерів. Немає що ставити в чергу." Це узгоджується з тим, що `useIsOffline`/`OfflineNotice` НЕ використовуються ніде в `session/`, `work/`, `journal/` — жодного мережевого гейту на цих екранах не знайдено (CODE VERIFIED негативним grep-результатом).

**Пошук каталогу (`app/(tabs)/search.tsx`):** `isOffline` реально гейтить усі чотири виклики `useProviderSearch` через `enabled: !isOffline` (рядки 412-414), і при офлайні режим «Каталог» показує ОДИН `OfflineNotice` з текстом *"Немає з'єднання з інтернетом. Спільний каталог, Google Books та ISBNdb зараз недоступні — спробуй ще раз, коли з'явиться мережа."* замість чотирьох порожніх секцій результатів (рядок 524-528). Тут офлайн і "нічого не знайдено" явно розрізнені в UI — окрема гілка рендеру, інший текст, інша іконка (`cloud-offline-outline`).

**ISBN-сканер (`app/isbn-scan.tsx`):** новий статус `'offline'` доданий до union `ScanStatus` (рядок 22), встановлюється (рядок 126) ПІСЛЯ перевірки локальної БД (видання, вже наявне локально, знаходиться без мережі) і ПЕРЕД мережевим `SharedCatalogProvider.lookupByISBN`. Офлайн-стан рендериться окремою гілкою (рядок 292) без кнопки "Шукати в Google" (та потребує мережі), лише "Спробувати сканувати ще раз"/"Додати вручну".

**Тренди (`/trends`) і «Що почитати завтра?» (`/tomorrow`) — мережезалежні, але офлайн НЕ гейтиться взагалі.** Grep по `app/tomorrow.tsx`, `app/trends.tsx`, `src/features/tomorrow/useTomorrowRecommendation.ts` на `isOffline`/`OfflineNotice` не дав жодного збігу — CODE VERIFIED (негативний результат). `useTomorrowRecommendation.ts` (провайдер Google Books) сам ковтає мережеві помилки й повертає порожній масив (той самий задокументований принцип "кожен провайдер сам ковтає мережеві помилки", описаний у `OFFLINE_UX.md` для Search) — тож коли мутація `recommend` завершується успішно з `data === null` (жодного кандидата не знайдено), `app/tomorrow.tsx` (рядки 181-185) показує **той самий** `EmptyState` з текстом *"Нічого не знайшлося… Спробуй інший жанр або мету читання — для деяких поєднань українських видань поки що мало"* — незалежно від того, чи причина в реальній відсутності кандидатів, чи в тому, що пристрій просто офлайн. Це буквально та сама плутанина "офлайн ≠ нічого не знайдено", яку Фаза 20 явно вирішила для Search і ISBN-сканера, але не поширила на Tomorrow-рекомендацію — попри те, що це теж мережезалежна поверхня з тим самим класом провайдера (Google Books). CODE VERIFIED.

**Календар — підтверджено повністю локальним.** `app/(tabs)/calendar.tsx` використовує `useMonthCalendarData`/`useMonthSummary` (з `useCalendarSessions.ts`), які в свою чергу спираються на `readingAggregates.ts` (§44) над `reading_session` — тобто SQLite-дані сесій, без жодного мережевого виклику. Grep на `NetInfo`/`isOffline` в `calendar.tsx` і `useCalendarSessions.ts` не дав збігів.

## 47. BACKUP PRIVACY

`app/backup.tsx` прочитаний повністю — CODE VERIFIED. Точний виклик — `handleExport` (рядки 72-83):

> **Заголовок:** «Резервна копія містить приватні записи»
> **Текст:** «Файл включає всі нотатки, цитати, причини «покинуто», нотатки «до читання» та інші особисті записи — у звичайному, НЕ зашифрованому JSON. Будь-хто, хто отримає цей файл, зможе їх прочитати.\n\nОбери канал "Поділитися" обережно.»
> Кнопки: «Скасувати» (cancel) / «Створити й поділитися» (запускає `runExport`).

**Файл справді НЕ шифрується.** `BackupRepository.exportAll` (§48/49) — це буквальний `SELECT * FROM <table>` для кожної таблиці в `BACKUP_TABLE_ORDER`, зібраний у `BackupData`-об'єкт і серіалізований у JSON (`useExportBackup`/`writeAndShareBackupFile`, не переглянуто цим проходом рядок-у-рядок, але сам `BackupRepository.ts` не містить жодного виклику крипто-API, а doc-коментар файлу `backup.tsx` (рядки 33-38) сам прямо це підтверджує: "Без шифрування/пароля в цьому milestone (ТЗ прямо це обмежує)"). Отже попередження точно відповідає реальній поведінці коду, не перебільшує і не применшує ризик.

**Перевірка (`handleCheckBackup`) не викликає цей алерт.** Кнопка «Перевірити резервну копію» (рядок 278) веде на окремий обробник `handleCheckBackup` (рядки 143-166), що використовує ту саму мутацію читання файлу `pickFile`, але з власним `onSuccess`, який ЗАВЖДИ завершується інформаційним `Alert.alert('Резервна копія справна', ...)` і **ніколи** не викликає `handleExport`/`runExport`/жодного коду, що показує попередження про приватність. Це логічно правильно: перевірка лише читає й парсить локально обраний файл, нічого нікуди не "ділиться" — privacy-попередження, прив'язане саме до моменту, коли файл ось-ось покине застосунок через системне «Поділитися» (`writeAndShareBackupFile`), правильно не спрацьовує на read-only шляху. Аналогічно, `handlePickFile` (шлях RESTORE) теж не показує privacy-alert — лише окремий `Alert.alert('Відновити з резервної копії?', ...)` про заміну даних (destructive-підтвердження, інша семантика, той самий стиль `Alert.alert`, але інший привід). Три `Alert.alert`-виклики в файлі (export-privacy / restore-confirm / verify-info) коректно не перетинаються між собою.

## 48. BACKUP + READINGRUN

`BackupRepository.ts` прочитаний повністю — CODE VERIFIED. `BACKUP_TABLE_ORDER` (рядки 12-85) — масив із 33 елементів (не 28, як стверджує коментар класу `BackupRepository` рядок 116 — "28 таблиць" — дрібна неточність самого коментаря, NOT VERIFIED чи це застаріле число з попередньої версії файлу до додавання нових таблиць; сам масив підраховано напряму по коду).

**`reading_run` присутня** — рядок 47, одразу після `user_book` (рядок 34). Doc-коментар прямо над нею (рядки 35-46) описує саме Фазу 27 фікс: "ДО цієї фази `reading_run` взагалі не входила в цей список — реальна прогалина… бекап тихо ГУБИВ УСЮ історію перечитувань користувача". CODE VERIFIED — рядок дійсно присутній у поточному коді, не лише в CHANGELOG-твердженні.

**Порядок FK-безпечний в обидва боки:**
- Insert (export→restore, `BACKUP_TABLE_ORDER` вперед): `user_book` (34) → `reading_run` (47, реальний FK `ON DELETE CASCADE` на `user_book`) → `reading_session`/`rating`/`pre_reading_reflection`/`dnf_reflection`/`book_memory`/`book_capsule` (50-70, усі м'яко посилаються на `reading_run_id`, без SQL FK, але й тут батько `reading_run` іде першим) → `capsule_recall` (74, реальний FK на `book_capsule`) → `journal_lore_link` (79, реальний FK на `lore_entity`, вставлений раніше поруч із `work_genre`).
- Delete (`restoreAll`, рядок 135: `[...BACKUP_TABLE_ORDER].reverse()`) — точне дзеркало: діти видаляються перед батьками.
- Сам код `restoreAll` (рядки 133-150) підтверджує це буквально: цикл `DELETE` йде по реверснутому масиву, цикл `INSERT` — по прямому, в одній `db.withTransactionAsync` — якщо щось падає посеред вставки, повний rollback (перевірено тестом, §49).

Отже Фаза 27 фікс реально в коді, не лише в CHANGELOG-заяві, і порядок навколо `reading_run` коректний для FK-цілісності в обидва напрямки операції.

## 49. BACKUP ROUND-TRIP

`src/data/repositories/BackupRepository.test.ts` прочитаний повністю (527 рядків) — CODE VERIFIED, AUTOMATED TEST VERIFIED.

**Головний round-trip тест** ("export → restore у чисту БД → повторний export дають семантично ідентичні дані по всіх таблицях", рядки 391-430) сідить `seedRepresentativeDatabase` — репрезентативні дані по кожній групі сутностей із явними коментарями по фазі похідних: автори/видавці/жанри/каталог, 2 книги (одна `reading`, одна `finished`), серія, **`reading_run`** (одне активне прочитання `run-1`, статус `in_progress`, рядки 184-188), 2 сесії (обидві явно пролінковані на `reading_run_id = 'run-1'`, рядки 202-217), прогрес, щоденник (note+quote, з реакціями/улюбленим), рейтинг (половинний бал 4.5 — навмисна перевірка REAL round-trip), `pre_reading_reflection`, `dnf_reflection`, `book_memory`, `book_capsule`, `capsule_recall`, `lore_entity`+`journal_lore_link`, `owned_book`+`loan`, `reading_goal`, `reminder`, `book_recommendation_shown`, `app_settings`.

Тест явно перевіряє присутність `reading_run` нетривіально:
```
expect(exported.reading_run).toHaveLength(1); // прочитання (Фаза 6/27)
expect(exported.reading_session?.every((r) => r.reading_run_id === 'run-1')).toBe(true); // обидві сесії пролінковані
```
— тобто перевіряється не лише "таблиця не порожня", а що зв'язок `reading_session.reading_run_id` реально зберігається через export→restore→export цикл, включно з `expectSameBackupData` (посекційне порівняння з відсортованими рядками, а не один загальний `toEqual`).

**Другий тест** ("replace all") підтверджує, що чужий рядок у цільовій БД (`author-stale`) не проступає після restore — семантика "заміни всього", не merge.

**Третій тест** (транзакційний rollback) навмисно ламає `work_author` неіснуючим FK і перевіряє, що `restoreAll` кидає й БД лишається БЕЗ ЖОДНОЇ ЗМІНИ — це прямо доводить, що `withTransactionAsync` реально відкочує, а не просто теоретично мав би.

**Календар:** окремої "calendar-only" таблиці в бекапі немає (і не має бути) — `Календар` (§46) обчислюється з `reading_session` через `readingAggregates.ts`, а `reading_session` уже покрита тестом і присутня в `BACKUP_TABLE_ORDER` (рядок 50) незалежно від `reading_run`. NOT VERIFIED окремим спеціальним тестом "Calendar round-trip", але логічно достатньо, бо Calendar не має власного стану поза `reading_session`.

`reading_run`-специфічний round-trip доданий саме у Фазі 27 (сам коментар seed-функції, рядки 180-183, прямо датує це: "ДО Фази 27 взагалі не входила в `BACKUP_TABLE_ORDER`… тут — одне поточне прочитання… щоб round-trip справді вправляв нову таблицю нетривіально").

## 50. OLD BACKUP COMPATIBILITY

**Wiring підтверджено напряму в коді, не лише в коментарі.** `src/features/backup/useBackup.ts`, `useRestoreBackup` (рядки 103-145): одразу після `await BackupRepository.restoreAll(db, envelope.data)` (рядок 112) йде виклик `await backfillAllLegacyReadingRunLinks(db)` (рядок 125), обгорнутий у власний `try/catch`, що лише логує помилку й НЕ провалює весь restore (той самий "допоміжний крок не валить основний" патерн, що й наступний `rebuildCapsuleRemindersAsync`). CODE VERIFIED — імпорт `backfillAllLegacyReadingRunLinks` з `@/data/db/legacyRunBackfill` присутній на рядку 18 того ж файлу.

**Оркестрація** (`legacyRunBackfill.ts`, рядки 266-273): `backfillAllLegacyReadingRunLinks` викликає по порядку — `backfillLegacyReadingRuns` (створює `reading_run` для книг без жодного, лінкує сесії), потім тричі `backfillNewestFinishedRunLink` (`book_memory`/`pre_reading_reflection`/`rating`), потім `backfillCapsuleRunLinks`, потім `backfillDnfReflectionRunLinks` — саме "батьки перед дітьми" порядок (спершу мають з'явитись самі `reading_run`, лише потім є до чого лінкувати похідні записи).

**Семантична перевірка (не лише "схема завантажилась без помилки"):** `legacyRunBackfill.test.ts`, describe-блок "наскрізний сценарій «відновлення старого V1.6 бекапу»" (рядки 180-294) будує `buildOldV16BackupData()` — вручну сконструйований `BackupData` без ключа `reading_run` взагалі і без поля `reading_run_id` у жодному рядку `reading_session`/`rating`/`book_memory`/`pre_reading_reflection`/`book_capsule`/`dnf_reflection` — точна імітація файлу, зробленого до Фази 6.

Тест (рядки 234-268) трасує реальний ефект крок за кроком:
1. Одразу після `BackupRepository.restoreAll(db, buildOldV16BackupData())`, ДО backfill: `reading_session.reading_run_id` = `NULL`, таблиця `reading_run` — порожня (`[]`). Це саме той стан, який без backfill спричинив би хибний `session_without_run` у Data Doctor для кожної книги.
2. Після `backfillAllLegacyReadingRunLinks(db)`: для книги зі статусом `finished` створюється `reading_run` зі статусом `'finished'`; для книги `did_not_finish` — run зі статусом `'did_not_finish'`. Обидва перевірені явним `SELECT`.
3. Перевірено, що сесія, рейтинг, `book_memory`, `pre_reading_reflection`, `book_capsule` — усі отримали `reading_run_id`, що дорівнює ID щойно-створеного `finished`-run, а `dnf_reflection` — ID `did_not_finish`-run (тобто вибір "правильного" run не випадковий, а відповідає бізнес-логіці статусу книги).
4. Повторний `exportAll` з цієї БД тепер несе `reading_run.length === 2`.

**Ідемпотентність теж перевірена окремо** (рядки 270-293): на "сучасному" бекапі (де `reading_run` вже заповнена й усі зв'язки вже проставлені до restore) повторний виклик `backfillAllLegacyReadingRunLinks` після `restoreAll` — доведений no-op: ні новий `reading_run` не створюється (`reading_run.length` лишається 1, той самий `id`), ні `rating.reading_run_id` не перепризначається на інший run.

Це повне, семантичне AUTOMATED TEST VERIFIED підтвердження: реальний код, реальний виклик у реальному місці restore-потоку (не тільки задекларований у коментарі), і реальний тест, що трасує повний ланцюжок "старий файл без reading_run → restore → backfill → коректно відновлені зв'язки" аж до перевірки конкретних значень полів, а не лише "не впало".
## 51. DATA DOCTOR

`CODE VERIFIED` — прочитано повністю `src/domain/dataIntegrityDoctor.ts` (712 рядків) і
`src/domain/dataIntegrityDoctor.test.ts` (566 рядків).

Модуль — чиста функція `runDataIntegrityCheck(snapshot)` без SQL/React, що приймає вже
прочитаний "знімок" таблиць і повертає список `DataIntegrityIssue[]`, згрупований за 6
фіксованими категоріями (`books`/`sessions`/`progress`/`journal`/`shelves`/`series`, ТЗ Фази 5).
Реальне читання снепшоту з БД — окремий `DataIntegrityRepository.ts` (має власний
`DataIntegrityRepository.test.ts`), UI — `app/data-doctor.tsx`.

Повний список кодів перевірок, знайдених у коді (33 унікальних `code`), за категоріями:

**books (11):** `duplicate_isbn_edition`, `finished_without_finished_at`,
`want_to_read_with_started_at`, `finished_before_started`, `dnf_with_finished_at`,
`user_book_references_deleted_edition`, `capsule_references_deleted_book`,
`multiple_active_runs`, `run_finished_without_finished_at`, `run_invalid_sequence`,
`legacy_contradictory_status`, `capsule_references_invalid_run`,
`memory_references_invalid_run`, `pre_reading_reflection_references_invalid_run`,
`dnf_reflection_references_invalid_run` (це фактично 15 кодів у категорії `books` — капсула/
run-групу модуль свідомо кладе в `books`, не заводить окрему категорію, коментар пояснює чому:
"нова сутність інтегрується в наявну структуру звіту/UI").

**sessions (5):** `session_without_valid_book`, `session_references_deleted_book`,
`negative_duration`, `invalid_paused_intervals`, `session_without_run`, `run_session_mismatch`
(6 кодів).

**progress (4):** `negative_progress_page`, `progress_exceeds_page_count`,
`negative_current_page`, `current_page_exceeds_page_count`.

**journal (6):** `note_references_deleted_book`/`quote_references_deleted_book` (згенеровані
динамічно через `${kind}_references_deleted_book`), `note_session_mismatch`/
`quote_session_mismatch`, `note_orphan_category`, `note_deleted_category`,
`capsule_orphan_journal_entry`.

**shelves (2):** `shelf_book_missing_user_book`, `shelf_book_deleted_user_book`.

**series (3):** `series_entry_missing_series`, `series_entry_missing_work`,
`series_entry_deleted_work`.

Перевірка кожного заявленого в ТЗ аудиту пункту `NOT VERIFIED`→`CODE VERIFIED` через прямий
grep вихідного файлу:

| Перевірка з ТЗ аудиту | Статус | Точна назва в коді |
|---|---|---|
| session-без-run | **Є** | `session_without_run` (рядок 563) |
| дві активні run одночасно | **Є** | `multiple_active_runs` (рядок 596) |
| finished без `finishedAt` | **Є** — двічі, симетрично для `user_book` і для `reading_run` | `finished_without_finished_at` (296) + `run_finished_without_finished_at` (608) |
| active з `finishedAt` (тобто "не дочитав"/статус із застарілою датою завершення) | **Є**, але сформульовано інакше, ніж очікувалось у ТЗ — не "active книга з finishedAt", а конкретно DNF-регресія | `dnf_with_finished_at` (327) — `did_not_finish` зі старим `finished_at` |
| invalid-status-sequence | **Є**, у формі порядку `run_number` за хронологією, а не загального "status sequence" | `run_invalid_sequence` (625) |
| capsule-wrong-run | **Є** | `capsule_references_invalid_run` (668) |
| memory-wrong-run | **Є** | `memory_references_invalid_run` (679) |
| DNF-mismatch | **Є**, у формі посилання DNF-знімка на невалідний run (не "DNF-статус без DNF-знімка") | `dnf_reflection_references_invalid_run` (699) |
| book-status/run-mismatch | **Є** | `legacy_contradictory_status` (641/648) — порівнює `user_book.status` з найновішим `reading_run.status` |

Усі 33 коди мають відповідний рядковий літерал у тестовому файлі (перевірено grep — кожен
`code`-рядок джерела зустрічається як рядковий літерал у `.test.ts`); модуль не має жодного
"мертвого", ніколи не покритого тестом коду перевірки. `AUTOMATED TEST VERIFIED`.

Явно **НЕ знайдено** (жодного відповідного `code` у файлі, не вигадую): окремої перевірки
"user_book.status='reading', але жодного активного run взагалі" (протилежність
`multiple_active_runs`) — модуль перевіряє забагато активних run, але не 0 активних run для
книги зі статусом "reading"/"rereading" за відсутності жодного `run` у `runsByUserBook`
(цикл на рядку 584 просто не виконається для такої книги — `for...of Map`, порожньої записи
нема). Це реальна прогалина покриття, не вигадана: `HYPOTHESIS` — книга, доданою напряму зі
статусом "reading" до першого реального старту сесії (graceful fallback, `addToLibrary`,
коментар рядки 112-121), теоретично може існувати без жодного run і без жодного попередження
Data Doctor, якщо `ReadingSessionRepository.start`/`updateStatus` fallback з якоїсь причини не
спрацював.

## 52. ACCESSIBILITY

**Reduce Motion — `CODE VERIFIED`, реально споживається, не лише зчитується.**
`ThemeProvider.tsx` (рядки 53-66) підписується на `AccessibilityInfo.isReduceMotionEnabled`/
`reduceMotionChanged` і віддає прапорець через `useTheme().reduceMotionEnabled`. Прапорець
реально читає лише один хук-обгортка — `useReducedMotionAnimationType` (`src/lib/
useReducedMotionAnimationType.ts`), який гейтить `animationType` рівно чотирьох `Modal`
bottom-sheet/попапів (перевірено grep усіх імпортерів хука):
- `src/components/journal/ReactionPicker.tsx` (рядок 122, `'fade'` → `'none'` при reduce motion)
- `src/components/library/LibrarySortSheet.tsx` (38, `'slide'` → `'none'`)
- `src/components/library/BookQuickActionsSheet.tsx` (39, `'slide'` → `'none'`)
- `src/components/memory/JournalTimeline.tsx` (45, `'fade'` → `'none'`)

Це весь реальний рух у застосунку, крім самих цих чотирьох `Modal` — `docs/
A11Y_LARGE_TEXT_AUDIT.md` документує окрему знахідку: `react-native-reanimated` — залежність у
`package.json`, але жодного `useAnimatedStyle`/`withTiming` виклику в коді немає (невикористана
залежність, окремий продуктовий борг, поза скоупом Reduce Motion). Тобто "реально гейтить" тут
буквально означає "усі 4 місця, де в застосунку взагалі є анімація" — не часткове покриття
серед багатьох.

**Progress bar accessibility — `CODE VERIFIED`.** `ReadingProgressBar.tsx` (єдиний прогрес-бар
компонент застосунку, grep підтверджує один файл) має на зовнішньому `View`:
`accessible`, `accessibilityRole="progressbar"`, `accessibilityLabel="Прогрес читання"`,
`accessibilityValue={{ min: 0, max: 100, now: roundedPercent, text: '${roundedPercent}%' }}`
(рядки 50-56) — не просто зафарбований `View`. Важливий нюанс, чесно задокументований у самому
коментарі компонента й у `docs/A11Y_LARGE_TEXT_AUDIT.md` §2: усі три поточні виклики (Home,
рядок Бібліотеки, Полиця) вже загорнуті в батьківський `Pressable` з ВЛАСНИМ
`accessibilityLabel`, що поглинає піддерево для читача екрана — тобто ця розмітка сьогодні не
змінює те, що реально озвучується в трьох наявних місцях виклику, а лише робить сам компонент
коректним для майбутнього виклику без такого батька. Це прозоро задокументовано автором, не
прихована прогалина.

**`maxFontSizeMultiplier` на Calendar — `CODE VERIFIED`, збігається з заявою docs.**
`app/(tabs)/calendar.tsx` — `maxFontSizeMultiplier={DAY_BADGE_MAX_FONT_SCALE}` застосований
двічі (рядки 172, 191) саме на номер дня всередині кола-бейджа, точно там, де `docs/
A11Y_LARGE_TEXT_AUDIT.md` заявляє ("32×32 кола з номером дня всередині... `maxFontSizeMultiplier
={1.2}` на самому номері дня"). Перевірено прямим читанням файлу компонента, не лише прийнято
на віру з документа.

**`accessibilityLabel`/`accessibilityRole` на Calendar — `CODE VERIFIED`.** Клітинка дня:
`accessibilityRole="button"` + `accessibilityLabel={buildDayAccessibilityLabel(day, stats)}`
(125-126) — динамічна функція, що формує повну дату/інтенсивність/назву книги в один рядок для
читача екрана (саме тому короткий 1-2-значний глиф дня може лишатись обрізаним за
`maxFontSizeMultiplier` без втрати інформації — обґрунтування, що збігається з docs). Кнопки
навігації місяця також мають `accessibilityRole="button"` + `accessibilityLabel`
("Попередній місяць"/"Наступний місяць", 251-252).

**Контраст на довгих українських рядках — `HYPOTHESIS`.** Токени кольору (`src/design/
tokens.ts`) не переглядались рядок-за-рядком у межах цього аудиту на предмет контрасту саме для
довгих українських слів, що переносяться; жодного конкретного знайденого прикладу переносу з
поламаним контрастом у коді немає. Залишається чистою гіпотезою без емпіричної перевірки (той
самий клас, що й "PHYSICAL DEVICE VERIFIED" — тут узагалі не перевірялось на пристрої/скріншоті).

**Не покрито жодною фазою (чесно задокументовано самим docs, не моя знахідка):** повне
вимкнення масштабування будь-де поза трьома shareable-картками (`CardPreviewText`) і денними
бейджами Календаря — свідомий вибір, не прогалина; `Session`/`Memory` описані в docs як
"свідомо прийнятний компроміс" (обрізання одного рядка назви `numberOfLines={1}`) і "знайдено й
виправлено" (фіксована `aspectRatio` картки Memory/Season/Fingerprint) відповідно.

## 53. HAPTICS

`CODE VERIFIED` — усі виклики `Haptics.*` у застосунку йдуть через єдину обгортку
`triggerLightHapticFeedback()` (`src/lib/haptics.ts:20-24`, `Haptics.impactAsync(Light)` з
проковтнутою помилкою — вібрація ніколи не валить дію користувача). Прямих викликів
`expo-haptics` поза цим файлом — 0 (grep підтверджує). Рівно 4 місця виклику самої обгортки
(grep імпортів `@/lib/haptics`, збігається з "4 приклади ТЗ" із власного doc-коментаря файлу):

| Місце | Файл:рядок | Тригер | Контекст виклику |
|---|---|---|---|
| Збереження нотатки | `src/features/notes/useNotes.ts:41` | `useCreateNote().onSuccess` | Єдиний виклик усередині `onSuccess` мутації `useMutation` |
| Збереження цитати | `src/features/quotes/useQuotes.ts:37` | `useCreateQuote().onSuccess` | Те саме |
| Завершення книги | `src/features/library/useUpdateUserBook.ts:73` | `useUpdateUserBookStatus().onSuccess`, лише коли `variables.status === 'finished'` | Умовний виклик усередині `onSuccess` |
| "Улюблене" | `src/features/library/useUpdateUserBook.ts:93` | `useToggleFavorite().onSuccess`, лише коли `variables.isFavorite === true` (не при знятті) | Умовний виклик усередині `onSuccess` |
| Успішний скан ISBN | `app/isbn-scan.tsx:111` | `handleBarcodeScanned` (камера), одразу після перевірки контрольної цифри | Прямий виклик у `useCallback`-обробнику камери |

**Перевірка подвійного спрацювання — прочитано оточення КОЖНОГО з 5 місць виклику.** У жодному
з чотирьох файлів (`useNotes.ts`, `useQuotes.ts`, `useUpdateUserBook.ts`, `app/isbn-scan.tsx`)
немає жодного `useEffect`, що реагував би на ту саму зміну стану, паралельно з `onPress`/
`onSuccess`-викликом — grep на `useEffect` у цих файлах дає 0 збігів поруч із хапtik-викликами.
Усі 4 виклики в `useNotes`/`useQuotes`/`useUpdateUserBook` — усередині `onSuccess` колбека
`@tanstack/react-query`-мутації, що спрацьовує рівно один раз на успішний виклик `mutate()`;
п'ятий (`isbn-scan.tsx`) — прямий виклик у обробнику `onBarcodeScanned`, і CHANGELOG (Фаза 23)
прямо документує, що `processingRef`-гейт (існував раніше) гарантує рівно один виклик на
скан-сесію (камера може віддати кілька кадрів з тим самим штрихкодом поспіль — саме це
`processingRef` і блокує). **Висновок: подвійного спрацювання в жодному з 5 місць не знайдено
— `CODE VERIFIED`**, не гіпотеза: перевірено прямим читанням, а не припущено з назви функції.

## 54. PERFORMANCE FIXTURE

**Реальна відтворювана фікстура існувала, але НЕ як артефакт у цьому репозиторії** —
`docs/PERFORMANCE_AUDIT.md` прямо каже: "Бенчмарк-скрипт... `scripts/perf-audit/` не
створювався в репозиторії продукту навмисно, щоб не тягнути `node:sqlite`/бенчмарк-код у
production-залежності". Підтверджено: `find . -path scripts/perf-audit` — нічого не знайдено,
такої директорії в репозиторії немає. Це не суперечність, а свідомий вибір, задокументований
самим автором — скрипт існував лише на момент прогону Фази 24, не закомічений.

Заявлена (в `docs/PERFORMANCE_AUDIT.md` та CHANGELOG Фаза 24) композиція, з детермінованим
Mulberry32 PRNG (seed `424242`), проти справжнього `node:sqlite`, застосувавши реальні 25
файлів міграцій через `tsc`-компіляцію (не переписаний вручну SQL):

| Сутність | Обсяг | Розподіл (за документом) |
|---|---|---|
| `work`/`edition`/`user_book` | 1000 | 1 видання на роботу; статус рівномірно з 6 CHECK-значень; ISBN ~55% лише isbn13, ~25% обидва, ~20% лише isbn10 |
| `reading_session` | 5000 | ~5/книгу в середньому, нерівномірно |
| `note`+`quote` | 10000 | 50/50, рівномірно по 1000 книгах |
| `lore_entity` | 1000 | рівномірно по `work` |
| `book_capsule`+`reading_run` | 500 | по одній парі на перші 500 книг, `status='finished'` |

**Важливо:** це збігається з цифрами з формулювання завдання аудиту дослівно ("1000 книг/5000
сесій/10000 записів щоденника/1000 lore/500 капсул-прочитань"). Оскільки сам скрипт не
закомічений у репозиторії, ця фаза-аудит НЕ МОЖЕ повторно запустити бенчмарк і самостійно
перевірити цифри — `docs/V1_6_1_FINAL_REPORT.md` §9 прямо визнає той самий факт: "Ця сесія не
мала можливості повторно прогнати той самий бенчмарк живцем... точні `EXPLAIN QUERY PLAN`-
виводи до/після лишаються лише в `docs/PERFORMANCE_AUDIT.md`, не перевірені повторно цим
звітом." Ця сесія цього аудиту в тому самому становищі. **Статус: `OWNER MANUAL VERIFIED` у
тому сенсі, що цифри виведені реальним запуском (документ описує методологію настільки
детально, що це не виглядає вигаданим — компіляція `tsc`, адаптер під підмножину `expo-sqlite`
API, `PRAGMA foreign_key_check` на кожному кроці), але жоден автоматизований тест чи CI-прогін
у цьому репозиторії НЕ відтворює цю фікстуру заново — вона не є reproducible artifact, лише
задокументований одноразовий прогін.**

## 55. PERFORMANCE RESULTS

Прямий висновок з `docs/PERFORMANCE_AUDIT.md` і CHANGELOG Фаза 24: усі виміряні числа —
на рівні окремих SQL-запитів репозиторіїв (мс/запит, 3000 викликів на запит), НЕ на рівні
повного рендеру екрана (жодного React DevTools Profiler/frame-time вимірювання ніде немає).
Тому відповідь на кожен названий екран:

| Екран | Бенчмарк екрана як цілого |
|---|---|
| Home | **NOT BENCHMARKED** (лише опосередковано: `user_book(status, updated_at)` — запит, що Home використовує через `listByStatus`, має вимірювання на рівні запиту — 0.2553→0.2139 мс/запит, ~1.19x — але не бенчмарк самого екрана Home) |
| Library | **NOT BENCHMARKED** (та сама примітка — Library використовує той самий `listByStatus`/`listStatusOnly` запит) |
| Calendar | **NOT BENCHMARKED** — жодного запиту Calendar не згадано в переліку виміряних п.1-5 `PERFORMANCE_AUDIT.md` |
| On This Day | **NOT BENCHMARKED** — документ явно каже, що UNION-запити `OnThisDayRepository` НЕ переглядались цією фазою ("архітектурна властивість підходу, не прогалина в індексах", розділи 29.1-29.3 попереднього аудиту, не нове вимірювання) |
| Search | **NOT BENCHMARKED** — жодної згадки Search/`PersonalSearch` у переліку виміряних запитів |
| History | **NOT BENCHMARKED** — те саме, `ActivityHistoryRepository` UNION явно виключений із цієї фази з тим самим поясненням, що й On This Day |
| Memory | **NOT BENCHMARKED** — жодної згадки |

Єдині реальні виміряні числа в проєкті — 5 конкретних SQL-запитів на рівні репозиторію (не
екрана), процитовані дослівно в §56 нижче. Екранного бенчмарку (час до першого рендеру, час
взаємодії тощо) немає в жодному документі й немає в жодному тесті репозиторію — не оцінюю,
пишу прямо: **NOT BENCHMARKED** для всіх семи названих екранів на рівні "екран як ціле".

## 56. EXPLAIN QUERY PLAN RESULTS

**Так, реально запускався** — не лише "додали індекс за логікою схеми". `docs/
PERFORMANCE_AUDIT.md` наводить дослівні виводи `EXPLAIN QUERY PLAN` до/після для 5 запитів
(4 з CHANGELOG Фаза 24, +1 глобальна стрічка щоденника, перевірена й лишена без змін):

1. `EditionRepository.getByIsbn` (`WHERE (isbn10 = ? OR isbn13 = ?) AND deleted_at IS NULL`):
   - ДО: `SCAN edition` (повне сканування), 0.0346 мс/запит.
   - ПІСЛЯ: `MULTI-INDEX OR | SEARCH edition USING INDEX idx_edition_isbn10 (isbn10=?) |
     SEARCH edition USING INDEX idx_edition_isbn13 (isbn13=?)`, 0.0056 мс/запит (~6.1x).

2. `UserBookRepository.listByStatus`/`listStatusOnly`:
   - ДО: `SEARCH user_book USING INDEX idx_user_book_status (status=?) | USE TEMP B-TREE FOR
     ORDER BY`, 0.2553 мс/запит.
   - ПІСЛЯ: `SEARCH user_book USING INDEX idx_user_book_status_updated_at (status=?)`,
     0.2139 мс/запит (~1.19x).

3. `NoteRepository.listByUserBook`:
   - ДО: `SEARCH note USING INDEX idx_note_user_book (user_book_id=?) | USE TEMP B-TREE FOR
     ORDER BY`, 0.0131 мс/запит.
   - ПІСЛЯ: `SEARCH note USING INDEX idx_note_user_book_created_at (user_book_id=?)`,
     0.0111 мс/запит (~1.18x).

4. `QuoteRepository.listByUserBook`: аналогічно, 0.0129→0.0111 мс/запит (~1.17x).

5. `ReadingSessionRepository.listByUserBookId` (НОВА знахідка Фази 24, не з попереднього
   аудиту): 0.0132→0.0113 мс/запит (~1.16x), `USE TEMP B-TREE FOR ORDER BY` прибрано.

Додатково перевірено (без змін, бо вже оптимально) — глобальна стрічка щоденника
(`JournalRepository`, `UNION ALL ... ORDER BY created_at DESC, id DESC LIMIT ?`):
```
MERGE (UNION ALL)
LEFT   SCAN note USING INDEX idx_note_created_at
RIGHT  SCAN quote USING INDEX idx_quote_created_at
```

Для **On This Day/Calendar-місяць/Journal by book+date/ISBN lookup** — ISBN lookup ВХОДИТЬ у
список вище (п.1, `getByIsbn`); Journal by book (note/quote `listByUserBook`) — п.3/4 вище.
Для **Calendar-місяць та On This Day окремо як власних запитів** — `NOT VERIFIED`, жодного
`EXPLAIN QUERY PLAN` виводу саме для цих двох конкретних запитів не знайдено в
`PERFORMANCE_AUDIT.md`; документ прямо каже, що UNION-запити `ActivityHistoryRepository`/
`OnThisDayRepository` розглянуті лише на рівні аргументації (JOIN на FK-колонках прискорюється,
матеріалізація повного об'єднаного набору перед `ORDER BY`+`LIMIT` — ні), без окремого
емпіричного `EXPLAIN QUERY PLAN`-прогону, процитованого в документі.

## 57. NEW INDEXES

`CODE VERIFIED` — `026_hot_query_indexes.ts` прочитано повністю (100 рядків, `version = 26`).

**Додано 5 індексів:**

| Індекс | Таблиця/колонки | Запит-ціль | Джерело обґрунтування |
|---|---|---|---|
| `idx_edition_isbn10` | `edition(isbn10)` | `EditionRepository.getByIsbn` — `WHERE (isbn10=? OR isbn13=?)` | Підтверджено — `EditionRepository.ts:191-196` (сам файл) + бенчмарк §56 |
| `idx_user_book_status_updated_at` | `user_book(status, updated_at)` | `UserBookRepository.listByStatus`/`listStatusOnly` | Підтверджено — репозиторій реально має цей запит, бенчмарк §56 |
| `idx_note_user_book_created_at` | `note(user_book_id, created_at)` | `NoteRepository.listByUserBook` | Підтверджено, бенчмарк §56 |
| `idx_quote_user_book_created_at` | `quote(user_book_id, created_at)` | `QuoteRepository.listByUserBook` | Підтверджено, бенчмарк §56 |
| `idx_session_user_book_started_at` | `reading_session(user_book_id, started_at)` | `ReadingSessionRepository.listByUserBookId` (Book Details — історія сесій) | Нова знахідка Фази 24, НЕ з попереднього аудиту (док прямо це каже) |

**Видалено 4 надлишкові одноколонкові індекси** (той самий `up()`, `DROP INDEX` перед
відповідним `CREATE INDEX` композитного варіанту): `idx_user_book_status`,
`idx_note_user_book`, `idx_quote_user_book`, `idx_session_user_book`. Обґрунтування з
міграції/CHANGELOG: композитний індекс покриває будь-який запит на самій провідній колонці так
само добре, як окремий одноколонковий (leftmost-prefix rule) — перевірено `EXPLAIN QUERY PLAN`
окремо для запитів без `ORDER BY` (наприклад `COUNT(*) WHERE user_book_id = ?`) ПІСЛЯ видалення
старих: усі й далі використовують новий композит, в одному випадку навіть `COVERING INDEX`.
Тримати обидва означало б подвійний overhead на запис без користі на читання. `idx_edition_isbn13`
свідомо НЕ видалено — для `MULTI-INDEX OR` потрібні ОБИДВА одноколонкові індекси, композит тут
не застосовний (два різні стовпці в диз'юнкції, не пара filter+sort однієї колонки).

**Індекси, що виглядають потенційно зайвими — `HYPOTHESIS`, не тверда знахідка:**
- `idx_book_capsule_reopen_at` (`012_book_capsule.ts`) — на `reopen_at`, колонці, що є `NULL`
  для більшості капсул (лише капсули з увімкненим reopen мають значення); не перевірено
  бенчмарком у Фазі 24 (та фаза взагалі не торкалась `book_capsule`). Можливо виправдано
  (`getDue`-запит по даті нагадування), але жодного `EXPLAIN QUERY PLAN` для нього немає ніде
  в репозиторії — чиста гіпотеза, не підтверджена й не спростована.
- `idx_reading_run_user_book` (`019_reading_run.ts`) — одноколонковий індекс на `user_book_id`,
  той самий шаблон, що `026` замінив композитом для 4 інших таблиць; `reading_run` НЕ отримала
  композитного індексу з `ORDER BY`-колонкою в Фазі 24, хоча `ReadingRunRepository.
  listByUserBookId` теж сортує (не перевірено — чи справді сортує за некритичним полем, чи
  композит тут не мав сенсу через малу кардинальність рядків на книгу; не досліджено глибше,
  лишаю як `HYPOTHESIS`, а не твердження про прогалину).

## 58. TESTING

`AUTOMATED TEST VERIFIED` (813 тестів/64 suites/0 failed — два окремі живі прогони `npm test`
власника, підтверджені цією сесією раніше) + `CODE VERIFIED` для розбивки нижче (Glob-
перевірка файлів цим агентом).

- **Тестових файлів:** 57 (`*.test.ts`+`*.test.tsx` під `src/`+`app/`+`supabase/`, Glob
  підтверджує рівно 57 — збігається із заявленим інвентарем).
- **Тестів:** 813, **passed:** 813, **failed:** 0 (обидва живі прогони власника, `AUTOMATED
  TEST VERIFIED`, не перевірено повторно в цій сесії — немає `node_modules`/мережевого доступу
  для запуску Jest тут).
- **Пропущені (`.skip`/`xit`/`xdescribe`/`.todo`):** 0 — перевірено grep за
  `\.skip\(|xit\(|xdescribe\(|test\.todo|it\.todo` по всіх 57 файлах, 0 збігів.

**Розбивка по директоріях (Glob-підрахунок):**

| Категорія | К-сть файлів |
|---|---|
| `src/domain/` | 1 (`dataIntegrityDoctor.test.ts`) |
| `src/lib/` | 29 |
| `src/data/repositories/` | 24 |
| `src/data/db/` (міграції/backfill) | 2 (`migrationRunner.test.ts`, `legacyRunBackfill.test.ts`) |
| Edge Functions (`supabase/functions/`) | 0 — `*.test.ts` не знайдено; CHANGELOG Фаза 25 прямо каже "0 нових тестів... Deno Edge Function-код, поза межами Jest/tsc/ESLint scope", `docs/EDGE_FUNCTION_CI.md` теж не додає `deno test`, лише `deno check`+`deno lint` (обидва — не unit-тести) |
| UI/компонентні (`*.test.tsx`) | 0 — Glob `src/**/*.test.tsx` і `app/**/*.test.tsx` обидва порожні |
| Інше (не підпадає під жоден із вище) | 1 (`src/design/dnfReason.test.ts`) |
| **Разом** | **57** ( = 1+29+24+2+0+0+1) |

## 59. REPOSITORY COVERAGE

`CODE VERIFIED` — 36 нетестових `.ts` файлів у `src/data/repositories/`, 24 мають власний
`.test.ts` (Glob-перевірка "NO TEST" для решти 14 — фактично 14, не 12, деталі нижче).

**Сім названих репозиторіїв окремо — точний вердикт (перевірено: кожен метод експорту знайдено
хоча б один раз у відповідному `.test.ts`):**

| Репозиторій | Методів в експорті | Вердикт | Деталі |
|---|---|---|---|
| `ReadingSessionRepository` | ~10 (`start`/`getActiveSession`/`pause`/`resume`/`finish`/`discard`/`setReadingExperience`/...) | **FULL** | Найглибше покритий репозиторій усього набору — 20+ `describe`-блоків, включно з атомарністю транзакції `finish` (відкат при помилці), крайовими випадками пауз, "background timestamps", DNF-невалідними сторінками, м'яко видаленою книгою посеред сесії |
| `ReadingRunRepository` | 9 методів | **FULL** | Усі 9 мають ≥3 звернення в тестах (8 `describe`/28 `it`); `start`/`finish` — найглибші (34/16 звернень) |
| `BookMemoryRepository` | 5 методів | **FULL** | Усі 5 покриті (4 `describe`/8 `it`); `upsertCurrent` — найглибше (12 звернень) |
| `BookCapsuleRepository` | 13 методів | **FULL, але нерівномірно** | Усі 13 присутні в тестах, але 6 із них (`update`, `markOpened`, `setNotificationIdentifier`, `listAll`, `getDue`, `listWithFutureReminder`) мають рівно 1 звернення в усьому файлі — швидше smoke-перевірка існування, ніж перевірка крайових випадків для цих шести; `create`/`getById` — глибоко (22/7) |
| `DnfReflectionRepository` | 6 методів | **FULL** | Усі 6 покриті (5 `describe`/9 `it`); `getCurrent`/`captureIfMissing` — найглибше (14/11) |
| `ActivityHistoryRepository` | 2 методи (`listRecent`/`listBetween`) | **FULL** | Обидва покриті (3 `describe`/13 `it`) |
| `UserBookRepository` | 16 методів | **FULL, нерівномірно** | Усі 16 присутні; `addToLibrary`/`updateStatus`/`getById` — глибоко (32/24/20 звернень), але `getByIdWithDetails`/`getByEditionIdWithDetails`/`listWithDetailsByIds`/`listStatusOnly` мають лише по 1 зверненню кожен |

**Calendar-репозиторій:** у проєкті немає окремого `CalendarRepository` — календарний екран
читає через `ActivityHistoryRepository`/`OnThisDayRepository` (обидва мають тести, FULL за тим
самим критерієм "усі методи згадані").

**Компактна таблиця решти репозиторіїв:**

| Репозиторій | Тест-файл | Вердикт |
|---|---|---|
| `EditionRepository` | так | FULL (кожен метод має тест-звернення) |
| `JournalRepository` | так | FULL |
| `LoreEntityRepository` | так | FULL |
| `NoteRepository` | так | FULL |
| `OnThisDayRepository` | так | FULL |
| `PersonalSearch` | так (окремий файл, не прив'язаний 1:1 до репозиторію) | FULL для покритої логіки |
| `PreReadingReflectionRepository` | так | FULL |
| `PublisherRepository` | так | FULL |
| `QuoteRepository` | так | FULL |
| `RatingRepository` | так | FULL |
| `ReadingContinuity` | так (окремий файл) | FULL для покритої логіки |
| `ReadingGoalRepository` | так | FULL |
| `ReadingProgressRepository` | так | FULL |
| `ShelfRepository` | так | FULL |
| `CapsuleRecallRepository` | так | FULL |
| `DataIntegrityRepository` | так | FULL |
| `BackupRepository` | так | FULL |
| `AppSettingsRepository` | **немає** | **NONE** |
| `AuthorRepository` | **немає** | **NONE** |
| `BookSourceRepository` | **немає** | **NONE** |
| `GenreRepository` | **немає** | **NONE** |
| `JournalDraftRepository` | **немає** | **NONE** |
| `NoteCategoryRepository` | **немає** | **NONE** |
| `OwnedBookRepository` | **немає** | **NONE** |
| `RecommendationRepository` | **немає** | **NONE** |
| `ReminderRepository` | **немає** | **NONE** |
| `SeriesRepository` | **немає** | **NONE** |
| `TagRepository` | **немає** | **NONE** |
| `TranslatorRepository` | **немає** | **NONE** |
| `WorkRepository` | **немає** | **NONE** |
| `bookDraftRepository` | **немає** | **NONE** |

14 із 36 репозиторіїв (~39%) не мають жодного тесту — переважно прості довідникові/CRUD-
репозиторії (автор, видавець, жанр, тег, перекладач — прості lookup-таблиці) і кілька
функціональних без тесту (`JournalDraftRepository` — чернетка запису, `WorkRepository`,
`SeriesRepository`, `bookDraftRepository`). Це не суперечить заявленому "813 тестів" — просто
означає, що 813 тестів зосереджені на складнішій/ризикованішій частині домену (сесії/run/
капсули/DNF/бекап), а не на всій поверхні репозиторіїв рівномірно.

## 60. UI TEST COVERAGE

`CODE VERIFIED`: **так, дійсно 0.** `Glob src/**/*.test.tsx` і `Glob app/**/*.test.tsx` обидва
повертають порожній результат. Жодного `.test.tsx`-файлу в репозиторії немає взагалі — жодного
React-компонента, хука з JSX чи екрана Expo Router не покрито автоматизованим UI-тестом
(snapshot, render, interaction) жодного разу за 28 фаз історії проєкту (усі 813 тестів — це
domain/lib чисті функції + repository-інтеграційні тести проти `better-sqlite3`, жоден із них
не рендерить жодного React-дерева).

**Чому це НЕ автоматично трактується як провал:** `docs/TESTING.md` (та неодноразово CHANGELOG)
формулює явну філософію "ВАЖЛИВО ПРО MANUAL TESTING" — власник продукту сам запускає застосунок
і перевіряє екрани після кожної фази (цей аудит бачить це побічно — численні коментарі
міграцій/репозиторіїв посилаються на конкретну поведінку UI, перевірену вручну, а не тестом).
Це свідомий компроміс для соло-розробника без CI на реальному симуляторі/пристрої (`expo-doctor`
у CI — лише статична перевірка конфігурації, не запуск застосунку), не недогляд.

**Що РЕАЛЬНО ловить ручне тестування власника** (за структурою проєкту): регресії в
"щасливому шляху" кожного екрана, який власник фактично відкриває після зміни (додавання
книги, старт/завершення сесії, збереження нотатки/цитати — саме ті потоки, що згадуються в
CHANGELOG як "перевірено" чи навколо яких є детальні коментарі про поведінку UI); явні
краші/білі екрани; очевидні візуальні регресії в звичайних (не крайових) даних.

**Що лишається вразливим до тихої UI-регресії** (без жодного автоматизованого запобіжника):
- **Умовний рендер-гілки, які власник не тригерив під час конкретної ручної перевірки** —
  наприклад, стан "0 активних run" з §51 (HYPOTHESIS-знахідка вище) або будь-яка комбінація
  статусів, що трапляється рідко на реальних даних власника, але можлива в даних інших
  користувачів.
- **A11y-атрибути** (§52) — жоден автоматизований тест не перевіряє `accessibilityLabel`/
  `accessibilityRole`/`accessibilityValue` на реальному дереві компонентів; уся впевненість у
  §52 базується на статичному читанні коду, не на рендер-тесті, що підтвердив би, що пропс
  справді долітає до дерева, як очікується.
- **Точний візуальний layout під крайовими даними** — дуже довгі назви книг/нотаток, порожні
  стани з нетиповою комбінацією полів, великий системний розмір шрифту на екранах, ЯВНО НЕ
  перерахованих у `docs/A11Y_LARGE_TEXT_AUDIT.md` (документ явно обмежується сімома
  переліченими областями — Home/Library/Calendar/Book Details/Session/Memory/Capsule — усе
  поза ними не перевірялось навіть вручну на предмет large text).
- **Регресії, що проявляються лише при повторному відкритті/навігації** (стейт після
  unmount/remount, залежності `useEffect`) — ручне тестування власника типово перевіряє "після
  зміни", не всі можливі шляхи навігації до того самого екрана.

## 61. CI

`CODE VERIFIED` — прочитано повністю `.github/workflows/ci.yml`.

Два jobs, обидва на `ubuntu-latest`, тригер `push`/`pull_request` на `main`,
`concurrency.cancel-in-progress: true`.

**Job `ci` ("Typecheck, lint, tests") — кроки по порядку:**

| Крок | Команда | Блокуючий? |
|---|---|---|
| Checkout | `actions/checkout@v4` | — |
| Setup Node.js | `actions/setup-node@v4`, `node-version: '22'`, `cache: 'npm'` | — |
| Install | `npm ci` | **Так** (блокує все подальше) |
| Typecheck | `npm run typecheck` (=`tsc --noEmit`) | **Так (блокуючий)** |
| Lint | `npm run lint` | **Так (блокуючий)** |
| Jest | `npm test -- --ci` | **Так (блокуючий)** |
| Expo health check | `npx expo-doctor` | **Ні** — `continue-on-error: true` |
| npm audit | `npm audit --audit-level=high` | **Ні** — `continue-on-error: true`, з Фази 25 |

Node 22 — обґрунтовано коментарем: `better-sqlite3` (dev-залежність для repository-тестів,
`src/data/db/testDb.ts`) вимагає Node ≥22 у власному `package.json`; сам React Native рантайм
на пристрої від версії Node у CI не залежить.

**Job `edge-functions` ("Edge Functions (Deno)") — окремий раннер:**

| Крок | Команда | Блокуючий? |
|---|---|---|
| Checkout | `actions/checkout@v4` | — |
| Setup Deno | `denoland/setup-deno@v2`, `deno-version: v2.x` | — |
| Deno check | `deno check supabase/functions` | **Так (блокуючий)** — жодного `continue-on-error` |
| Deno lint | `deno lint supabase/functions` | **Так (блокуючий)** |

Окремий job (не крок усередині `ci`) — свідомий вибір через різний рантайм (`supabase/
functions/**` виконується під Deno, `tsconfig.json`/`eslint.config.js` явно виключають цю
директорію з Node/TS-тулчейну). Додано Фазою 25 (`docs/EDGE_FUNCTION_CI.md`) — до цього 6
Edge Function файлів не перевірялись жодним автоматичним інструментом на жодному push/PR.

**Cosmetic anomaly, задокументована в задачі цього аудиту (перевірена лише через надані
скріншоти власника, не через прямий доступ до логів GitHub Actions цією сесією):** усі
4 прогони CI #83-#86 показали `Status: Success` і обидва job-чекмарки зелені, але водночас
кожен прогін супроводжувався панеллю "Annotations: 1 error and 2 warnings" / "exit code 1".
Це прямо суперечливий сигнал — GitHub Actions показує "успіх" на рівні job/workflow, але
окрема панель анотацій показує помилку. Найправдоподібніше пояснення (не перевірено логами
напряму цим агентом — `NOT VERIFIED`) — джерело анотацій це один із двох `continue-on-error:
true` кроків (`expo-doctor` або `npm audit --audit-level=high`): обидва свідомо позначені як
advisory САМЕ тому, що GitHub інтерпретує їхній ненульовий exit code як "помилку" для панелі
анотацій, навіть коли `continue-on-error` не дає їй завалити job. Це відкрите, невирішене
дрібне CI-питання: власнику варто відкрити конкретний прогін і подивитись, яка саме команда
залишає ненульовий exit code в анотаціях, щоб підтвердити цю гіпотезу або спростувати її.

## 62. NPM AUDIT

Ця сесія аудиту **не має мережевого доступу до реєстру npm** у цьому хмарному середовищі —
підтверджено раніше цієї ж сесії (`npm ci` повертає `403 Forbidden`). Тому `npm audit` не може
бути запущений цим агентом тут, і жоден CVE-список нижче не вигаданий.

Що реально задокументовано в репозиторії щодо `npm audit`:

- CI (`.github/workflows/ci.yml`) має крок `npm audit --audit-level=high` у job `ci`, доданий
  Фазою 25, з `continue-on-error: true` (advisory, не блокує pipeline).
- CHANGELOG (Фаза 25): "новий крок `npm audit --audit-level=high`... розділ 34 того самого
  аудиту" — і прямо: "`npm audit` тепер запускається реально в CI (не лише "не запускався в
  цьому середовищі"), **точний список CVE з'явиться в логах першого прогону**" (docs/SECURITY.md,
  цитовано з CHANGELOG). Це дослівне визнання, що на момент написання Фази 25 жодного
  конкретного CVE/кількості вразливостей ще НЕ було зафіксовано в жодному документі проєкту —
  лише сам факт, що перевірка тепер УВІМКНЕНА.
- `docs/V1_6_1_FINAL_REPORT.md` §5 (CI status) і §9 не наводять жодного конкретного CVE-числа
  чи severity-розбивки для `npm audit` — жодного разу за весь переглянутий набір документів
  цього проєкту (`CHANGELOG.md`, `docs/V1_6_1_FINAL_REPORT.md`, `docs/SECURITY.md`-згадки в
  CHANGELOG) не зустрічається жодне конкретне число CVE чи назва вразливості.

**Висновок: жодного зафіксованого CVE-списку в цьому репозиторії немає — ні у формі числа, ні
переліку пакетів.** Єдине, що встановлено документально — сам механізм увімкнено й є advisory.
Власнику варто самостійно відкрити фактичні логи прогонів CI (вкладка "npm audit (advisory)"
кроку в GitHub Actions, той самий прогін #83-#86, для яких є скріншоти) — вивід цього кроку в
тих логах і є єдиним справжнім джерелом поточного списку вразливостей, якого немає в жодному
файлі цього репозиторію.

## 63. DATABASE FULL MAP

`CODE VERIFIED` — побудовано прямим `grep CREATE TABLE`/`DROP TABLE`/`RENAME TO` по всіх 27
файлах `001`-`027`, з відстеженням rebuild-циклів (`_new` → `DROP` оригінал → `RENAME _new` →
оригінальна назва — фінальна назва завжди БЕЗ суфіксу `_new`).

**Rebuild-цикли, підтверджені й правильно згорнуті в один фінальний запис (НЕ подвійний
рахунок):** `book_source` (rebuild двічі — `002`, потім `007`), `note` (rebuild `003`),
`book_memory` (rebuild `021`), `pre_reading_reflection` (rebuild `022`), `dnf_reflection`
(rebuild `024`), `rating` (rebuild `025`). Жодна з цих таблиць не зникає й не дублюється —
кожен цикл лишає рівно одну таблицю з оригінальною назвою.

**Фінальний рахунок: 39 таблиць** (28 створено в `001_base_schema.ts` + 11 нових таблиць,
доданих пізнішими міграціями: `journal_draft` (003), `book_memory` (004),
`book_recommendation_shown` (006), `note_category` (008), `book_capsule` (012),
`capsule_recall` (013), `pre_reading_reflection` (014), `lore_entity` (015),
`journal_lore_link` (015), `dnf_reflection` (017), `reading_run` (019)).

Повний список — 39 фінальних таблиць:

| Таблиця | Призначення | PK | Notable FK | Індекси (026-звірено) | `deleted_at`? | У бекапі? |
|---|---|---|---|---|---|---|
| `author` | автор твору | `id` | — | — | ні | так |
| `publisher` | видавець | `id` | — | — | ні | так |
| `translator` | перекладач | `id` | — | — | ні | так |
| `genre` | жанр | `id` | — | — | ні | так |
| `tag` | тег | `id` | — | — | ні | так |
| `book_source` | джерело даних книги (isbndb тощо) | `id` | — | — | ні | так |
| `work` | абстрактний твір | `id` | — | — | ні | так |
| `work_author` | зв'язок твір-автор | composite | `work`, `author` | — | ні | так |
| `work_genre` | зв'язок твір-жанр | composite | `work`, `genre` | — | ні | так |
| `edition` | конкретне видання | `id` | `work_id` | `idx_edition_isbn10` (026, новий), `idx_edition_isbn13` | ні | так |
| `edition_translator` | зв'язок видання-перекладач | composite | `edition`, `translator` | — | ні | так |
| `field_provenance` | джерело поля даних | `id` | `edition` (ймовірно) | — | ні | так |
| `tagged_item` | зв'язок тег-сутність (polymorphic) | `id` | — (soft-ref) | — | ні | так |
| `series` | серія книг | `id` | — | — | ні | так |
| `series_entry` | зв'язок серія-твір | `id` | `series`, `work` | `idx_series_entry_series` | ні | так |
| `user_book` | книга користувача (статус/прогрес) | `id` | `edition_id` | `idx_user_book_status_updated_at` (026, замінив `idx_user_book_status`), `idx_user_book_edition` | **так** | так |
| `shelf` | полиця користувача | `id` | — | — | ні | так |
| `shelf_book` | зв'язок полиця-книга | composite | `shelf`, `user_book` | (018-індекс, не 026) | ні | так |
| `reading_session` | сесія читання | `id` | `user_book_id`, м'яко `reading_run_id` | `idx_session_user_book_started_at` (026, замінив `idx_session_user_book`), `idx_session_started_at`, `idx_reading_session_reading_run` | **так** | так |
| `reading_progress` | історичний запис прогресу | `id` | `user_book_id`, `session_id` (SET NULL) | `idx_progress_user_book` | ні | так |
| `note` | нотатка щоденника | `id` | `user_book_id`, `session_id` (SET NULL) | `idx_note_user_book_created_at` (026, замінив `idx_note_user_book`) | **так** | так |
| `quote` | цитата щоденника | `id` | `user_book_id`, `edition_id`, `session_id` (SET NULL) | `idx_quote_user_book_created_at` (026, замінив `idx_quote_user_book`) | **так** | так |
| `rating` | оцінка (тепер за run) | `id` | `user_book_id`, `reading_run_id` (UNIQUE, м'яко) | `idx_rating_user_book` | **так** (з 027) | так |
| `owned_book` | фізичний примірник | `id` | `edition_id` | — | ні | так |
| `loan` | позика книги | `id` | (ймовірно `owned_book`) | — | ні | так |
| `reading_goal` | ціль читання | `id` | — | — | ні (свідомо, `SOFT_DELETE_READINESS.md`) | так |
| `reminder` | нагадування | `id` | — | — | ні (свідомо) | так |
| `app_settings` | налаштування застосунку | (singleton) | — | — | ні | так |
| `journal_draft` | чернетка незбереженого запису | `user_book_id` | `user_book` (CASCADE), `session_id` (SET NULL) | — | ні | **ні** (див. примітку нижче) |
| `book_memory` | "спогад про книгу" (за run) | `id` | `user_book_id`, `reading_run_id` (UNIQUE, м'яко) | — | **так** (з 027) | так |
| `book_recommendation_shown` | показані рекомендації | `id` | — | — | ні | так |
| `note_category` | категорія нотатки | `id` | — (м'яко з `note.category_id`) | — | ні | так |
| `book_capsule` | "капсула книги" | `id` | `user_book_id`, м'яко `reading_run_id` | `idx_book_capsule_user_book`, `idx_book_capsule_reopen_at`, `idx_book_capsule_reading_run` (027) | **так** (з 027) | так |
| `capsule_recall` | пригадування капсули | `id` | `book_capsule_id` (CASCADE) | `idx_capsule_recall_book_capsule` | ні | так |
| `pre_reading_reflection` | рефлексія "До" читання | `id` | `user_book_id` (CASCADE), `reading_run_id` (UNIQUE, м'яко) | — | ні (свідомо, поза Фазою 26) | так |
| `lore_entity` | "лор"-сутність (персонаж тощо) | `id` | `work_id` (CASCADE) | `idx_lore_entity_work` | так | так |
| `journal_lore_link` | зв'язок лор-запис щоденника | `id` | `lore_entity_id` (CASCADE), м'яко `entry_id` | `idx_journal_lore_link_entity` | ні | так |
| `dnf_reflection` | DNF-рефлексія | `id` | `user_book_id` (CASCADE), `reading_run_id` (UNIQUE, м'яко) | — | ні (свідомо) | так |
| `reading_run` | одне "прочитання" книги | `id` | `user_book_id` (CASCADE) | `idx_reading_run_user_book` | **так** | так |

**Soft-delete (`deleted_at`) — рівно 12 таблиць, НЕ 3, як могло б здатись із формулювання
завдання.** Міграція `027_soft_delete_readiness.ts` додала `deleted_at` рівно на **3** таблиці
(`book_capsule`, `book_memory`, `rating`) — це нові три. Але вони приєднались до вже наявних
**9**, задокументованих самим коментарем міграції 027: `user_book`, `edition`, `work`, `note`,
`quote`, `note_category`, `lore_entity`, `reading_session`, `reading_run`. Разом — 12 таблиць
із `deleted_at` із 39. `Shelf`/`ReadingGoal`/`Reminder` — свідомо НЕ отримали `deleted_at` (три
окремих задокументованих причини за репозиторієм, не повторюю тут — `docs/
SOFT_DELETE_READINESS.md`).

**Знахідка поза прямим завданням, варта згадки: `journal_draft` НЕ входить у `BACKUP_TABLE_ORDER`
(`src/data/repositories/BackupRepository.ts:12-85`).** Перерахунок масиву дає рівно 38 записів
— на одну менше за 39 фінальних таблиць, і бракує саме `journal_draft`. На відміну від
`reading_run` (яку CHANGELOG/коментар міграції 027 прямо документує як "реальну прогалину,
знайдену й закриту тією ж фазою" — раніше бекап тихо губив усю історію перечитувань),
відсутність `journal_draft` у бекапі НІДЕ явно не обговорюється й не обґрунтовується як свідоме
рішення — ні в `docs/BACKUP_FORMAT.md`, ні в коментарі самого `BackupRepository.ts`. Оскільки
`journal_draft` за призначенням — ефемерна чернетка ("survives backgrounding", не остаточний
запис), відсутність у бекапі, ймовірно, нешкідлива (втрата незбереженого чернетки при відновленні
з бекапу — прийнятний компроміс), але це `HYPOTHESIS` щодо намірів автора, не задокументований
факт: жодного рядка коду чи документа, що явно каже "journal_draft свідомо виключено з бекапу",
не знайдено.

## 64. DATA RELATIONSHIP MAP

Усі стрілки нижче перевірені проти реальних `REFERENCES`-колонок у міграціях (§63 таблиця),
не лише виведені з іменування.

**Основний ланцюжок читання:**
```
work (1) ──< edition (N)              edition.work_id → work.id (CASCADE)
edition (1) ──< user_book (N)         user_book.edition_id → edition.id (CASCADE)
                                        (насправді практично 1:1 — addToLibrary шукає
                                        існуючий user_book за editionId першим)
user_book (1) ──< reading_run (N)     reading_run.user_book_id → user_book.id (CASCADE)
reading_run (1) ──< reading_session (N)   М'ЯКО: reading_session.reading_run_id (без SQL
                                        REFERENCES, доданий 020_reading_run_backfill.ts —
                                        свідомий вибір, задокументований у коді)
reading_session (1) ──< reading_progress (N)   reading_progress.session_id → reading_session.id
                                        (SET NULL, тобто прогрес може пережити видалення сесії
                                        як "ручний" запис)
```

**ReadingRun → Memory:** `book_memory.reading_run_id UNIQUE` (М'ЯКО, без `REFERENCES`,
`021_book_memory_run.ts`) — щонайбільше один спогад на run. `book_memory.user_book_id` —
реальний FK (CASCADE).

**ReadingRun → Capsule → Recall:** `book_capsule.reading_run_id` (М'ЯКО, доданий лише в
`027_soft_delete_readiness.ts` — капсула сама старша, з `012`, прив'язку до run отримала
пізніше); `book_capsule.user_book_id` — реальний FK (CASCADE). `capsule_recall.book_capsule_id`
— реальний FK (CASCADE) — це справжній `REFERENCES`, на відміну від більшості
run-прив'язок у проєкті.

**ReadingRun → BeforeReflection (`pre_reading_reflection`):** `pre_reading_reflection.
reading_run_id UNIQUE` (М'ЯКО, `022_pre_reading_reflection_run.ts`); `user_book_id` — реальний
FK (CASCADE, і сам `UNIQUE` — по одному "До"-запису на книгу до Фази 22, зняте до
`UNIQUE(reading_run_id)` тією ж міграцією).

**ReadingRun → DNF (`dnf_reflection`):** `dnf_reflection.reading_run_id UNIQUE` (М'ЯКО,
`024_dnf_reflection_run.ts`); `user_book_id` — реальний FK (CASCADE).

**ReadingRun → Rating:** `rating.reading_run_id UNIQUE` (М'ЯКО, `025_rating_run.ts`) — та сама
модель, що Memory/Capsule/DNF. `user_book_id` — реальний FK (CASCADE, без UNIQUE — на відміну
від колишньої `UNIQUE(user_book_id)` до Фази 12, знятої саме для дозволу кількох оцінок за
прочитання).

**Journal (note/quote) — прив'язка до сесії/книги:** `note.user_book_id`/`quote.user_book_id`
— реальний FK (CASCADE); `note.session_id`/`quote.session_id` — реальний FK на
`reading_session.id` (SET NULL) — тобто нотатка/цитата може пережити видалення сесії
(лишиться без прив'язки до конкретної сесії, але не видалиться). `note.category_id` —
свідомо М'ЯКЕ посилання на `note_category.id` (без `REFERENCES`, задокументовано в
`008_note_category.ts` як навмисний вибір, саме тому Data Doctor має `note_orphan_category`/
`note_deleted_category` перевірки — FK сам це не впіймав би).

**Lore:** `lore_entity.work_id` — реальний FK на `work.id` (CASCADE) — лор прив'язаний до
твору, НЕ до конкретного видання чи книги користувача (той самий персонаж спільний для всіх
користувачів того самого твору — архітектурно очікувано для "спільного каталогу"). `journal_
lore_link.lore_entity_id` — реальний FK (CASCADE); `journal_lore_link.entry_id` — М'ЯКЕ
посилання на `note.id`/`quote.id` (розрізнене колонкою `entry_kind`, той самий "polymorphic
без REFERENCES" підхід, що й `book_capsule.journal_entry_id`).

**Capsule → Journal entry:** `book_capsule.journal_entry_id`/`journal_entry_kind` — той самий
М'ЯКИЙ polymorphic-підхід до `note`/`quote`, що й `journal_lore_link` вище — саме тому Data
Doctor має окрему перевірку `capsule_orphan_journal_entry`.

## 65. SOURCE OF TRUTH AUDIT

Незалежна перевірка (окрема від §8, якщо той є в іншій частині аудиту) — для кожного з 7
понять прослідковано КОЖЕН шлях запису (`grep` по репозиторіях), не лише один очевидний.

| Поняття | Джерело правди | Потенційний конфлікт |
|---|---|---|
| **Поточний прогрес** | `user_book.current_page` (єдине поле, яке UI показує як "зараз на сторінці N") | **Так, знайдено реальну асиметрію.** Два незалежні шляхи запису: (1) `ReadingSessionRepository.finish` — атомарно оновлює `user_book.current_page` І вставляє рядок `reading_progress` в ОДНІЙ транзакції (підтверджено тестом "однією транзакцією оновлює сесію, user_book.current_page і додає reading_progress"); (2) `UserBookRepository.updateCurrentPage` (рядки 251-257) — оновлює ЛИШЕ `user_book.current_page`, жодного запису в `reading_progress` НЕ вставляє. Використовується `useUpdateCurrentPage`-хуком із композера швидкого запису на екрані активної сесії. Наслідок: `user_book.current_page` завжди актуальне (єдине справжнє джерело правди для "поточної сторінки"), але `reading_progress` як історичний журнал НЕ гарантовано повний — може мати "дірки", коли сторінку оновлено через цей другий шлях. Будь-який споживач, що читає графік прогресу з `reading_progress` (а не з самого `user_book.current_page`), недооцінить реальні моменти зміни сторінки. |
| **Поточний статус** | `user_book.status` | **Так, задокументована й "зловлена" самим Data Doctor.** `reading_run.status` — окреме поле, зазвичай синхронізоване з `user_book.status` через єдину точку входу `UserBookRepository.updateStatus` (яка й запускає `ReadingRunRepository.start`/`finish` у тій самій операції), але це саме та неявна інваріанта, яку `legacy_contradictory_status`-перевірка Data Doctor (§51) існує ловити для legacy/пошкоджених даних — тобто автор сам визнає, що два поля МОЖУТЬ розійтись. |
| **Поточний run** | `reading_run`, відфільтрований запитом (`ReadingRunRepository.getActiveByUserBookId` — найновіший за `run_number` зі `status='in_progress'`) | Немає окремого денормалізованого вказівника (типу `user_book.current_run_id`) — "поточний run" ЗАВЖДИ обчислюється запитом, не зберігається як окреме поле ніде. Це усуває клас конфлікту "вказівник розійшовся зі станом", АЛЕ Data Doctor сам документує, що кілька одночасно `in_progress` run на одну книгу СХЕМОЮ НЕ заборонені (немає `UNIQUE`) — тому "який саме run активний" залежить від порядку сортування запиту, а не гарантії БД (`multiple_active_runs`-перевірка існує саме для цього). |
| **Історична дата завершення** | `user_book.finished_at` (основне поле, яке читає "Моя історія"/Activity History) | `reading_run.finished_at` — окреме поле для КОНКРЕТНОГО прочитання (кожне перечитування має власну дату завершення); `user_book.finished_at`, судячи з коментаря `dataIntegrityDoctor.ts` (рядки 317-331, про `dnf_with_finished_at`), відображає лише ОСТАННІЙ перехід і сам admits "успадкована неузгодженість, можлива в даних, створених ДО фіксу `UserBookRepository.updateStatus`" — тобто це задокументований, відомий і частково історичний клас конфлікту, не гіпотетичний. |
| **Рейтинг** | `rating` (з Фази 12 — за `reading_run_id`, а не за книгою) | Немає окремого поля рейтингу на `user_book` — рейтинг завжди лише в таблиці `rating`. Потенційна плутанина не між таблицями, а всередині самої `rating`: тепер МОЖЕ бути кілька рядків на книгу (по одному на run), і `RatingRepository.listByUserBookIds` явно повертає "найновішу" як узагальнену "оцінку книги" для зовнішніх споживачів (Wrapped/Сезони/Профіль/Цього дня) — це задокументований, свідомий вибір ("той самий принцип, що й `BookCapsuleRepository.getByUserBookId`"), не помилка, але означає, що "оцінка книги" для UI без контексту run — це завжди похідне значення, не пряме поле. |
| **Спогад (Memory)** | `book_memory` (за `reading_run_id`, `UNIQUE` — щонайбільше один на run) | Немає конфлікту з іншою таблицею — модель проста, `getCurrent` читає за (ймовірно) `user_book_id` + логіка "поточний run" для вибору потрібного рядка. |
| **Капсула (Capsule)** | `book_capsule` | М'яке (не UNIQUE-enforced на рівні старої схеми до 027) посилання на `reading_run_id` — на відміну від Memory/DNF/Rating/BeforeReflection, `book_capsule` НІКОЛИ не мала `UNIQUE(user_book_id)` навіть до прив'язки до run (`012_book_capsule.ts`, п.1, явно цитовано коментарем 027-міграції: "множинність капсул на книгу вже була свідомо дозволена") — тобто кілька капсул на один run теоретично можливі схемою, на відміну від Memory/DNF/Rating, де `UNIQUE(reading_run_id)` це прямо забороняє. Це асиметрія в дизайні, не помилка, але варта фіксації: `book_capsule` — єдина з п'яти "по одна на прочитання" сутностей БЕЗ enforced унікальності на рівні БД. |

**Підсумок:** з семи перевірених понять, **два мають реальний, задокументований самим проєктом
клас можливого розходження** (поточний статус — через `legacy_contradictory_status`;
історична дата завершення — через `dnf_with_finished_at`, обидва в Data Doctor), і **одне
має новознайдену асиметрію повноти історичних даних** (поточний прогрес — `user_book.
current_page` завжди правильне, але `reading_progress` як журнал НЕ гарантовано повний через
другий шлях запису `UserBookRepository.updateCurrentPage`). Жодне з семи понять не зберігається
одночасно в ДВОХ таблицях без чіткого визначення, яка саме є "головною" — у кожному випадку
є одна явна головна таблиця/колонка, конфлікт можливий лише як РЕЗУЛЬТАТ неповної синхронізації
між похідними полями, не як архітектурна двозначність "яка з двох таблиць правильна".
## 66. PRODUCT COMPLEXITY AUDIT

Метод: для кожної пари/кластера перевірено не лише текст `docs/PRODUCT_CONSOLIDATION.md` (який сам документує намір Фаз 13-19), а реальний код поточних екранів — `app/(tabs)/index.tsx`, `app/next-read.tsx`, `app/my-reading.tsx`, `app/memory/index.tsx`, `app/(tabs)/profile/index.tsx` — щоб підтвердити, що старі поверхні дійсно стали вторинними (глибше в навігації), а не просто отримали новий "парасольковий" екран поруч із такими самими рівноправними старими картками.

### Tomorrow vs One Book Picker vs TBR

**Вихідний стан (V1.6, `V1_6_FULL_AUDIT_REPORT.md`, "Пара 1"/"Пара 2"):** три незалежні картки на Home (`TomorrowEntryPointCard`/`OnePickerEntryPointCard`/`TrendsEntryPointCard`) і окремо TBR reality check, похований лише в меню Профілю.

**Поточний стан — CODE VERIFIED.** `app/(tabs)/index.tsx`, секція "#5 Secondary shortcuts", тепер рендерить рівно ОДНУ картку `NextReadEntryPointCard` (рядки 344-355, 437-447) замість трьох. Тап веде на новий `app/next-read.tsx`, який групує чотири екрани під двома заголовками: "З моєї полиці" (`/one-book-picker`, `/tbr`) і "Знайти нову книгу" (`/tomorrow`, `/trends`) — прочитано весь файл, підтверджено буквально. Жоден з чотирьох алгоритмів (`onePicker.ts`/`tomorrowRecommendation.ts`/`tbrEstimate.ts`) не змінений — консолідована саме навігація, як і заявлено. Незалежно перевірено, що на Home більше немає жодного окремого входу `TomorrowEntryPointCard`/`OnePickerEntryPointCard`/`TrendsEntryPointCard` (grep по файлу — жодного збігу, лише коментарі, що описують їх видалення).

**Вагома деталь, підтверджена самим кодом, не лише документом:** TBR reality check раніше не мала жодного безумовного входу з Home взагалі (лише пункт меню Профілю) — тепер вона рівноправний елемент `next-read.tsx` поруч із One Book Picker. Це реальне ПІДВИЩЕННЯ видимості третього механізму, не просто перейменування.

**Вердикт: RESOLVED.** Три конкуруючі відповіді на "що читати далі" згорнуті під один вхід з Home; жоден старий маршрут не втратив функціональності, кожен лишається на один тап глибше під зрозумілими заголовками ("з полиці" проти "нове"), а не трьома рівноправними картками одразу на першому екрані.

### Memory vs Capsule vs Recall

**Вихідний стан (V1.6, "Пара 3"):** три екрани "згадати книгу" (`/capsule/[workId]`, `/recall/[workId]`, `/memory/[workId]`) із частково однаковим вмістом (`book_memory` і `book_capsule` — обидві вільний текст) і подібними українськими назвами, межа між якими трималась лише на product-документації.

**Поточний стан — CODE VERIFIED.** Три маршрути й далі існують окремо (жоден не видалений — capsule перегляд, recall гра-на-пам'ять, і `app/memory/[workId].tsx` як повноцінний per-book хаб) — це не приховування, а явне розмежування ролей: `app/memory/index.tsx` (глобальний хаб "Моя пам'ять") тепер має окрему секцію "Капсули" (`MemoryIndexRow`, веде на `/memory/[workId]`) і окрему "Час згадати" (`DueCapsuleRow`, веде на `/recall/[workId]`) — кожна назва прив'язана до однієї конкретної дії ("подивитись, що я вже написав" проти "спробувати згадати перед показом"), а не до трьох приблизно однакових написів поруч. Ungating `book_memory[workId]` (Фаза 13, `hasAnyMemoryData` замість `!memory`) означає, що екран доступний з будь-якого з 6 джерел пам'яті, не лише з одного вузького поля — реальна поведінкова зміна, не лише навігаційна.

Пряме перекриття вмісту (`book_memory`/`book_capsule` — обидві вільний текст) НЕ усунене архітектурно — і не заявлялось, що буде усунене: це дві різні сутності з різними таблицями й різним призначенням ("спогад" — вільна рефлексія; "капсула" — one-sentence memory + lasting thought + reopen timer). Це свідома, задокументована відмінність (`docs/BOOK_CAPSULES.md`), не помилка.

**Вердикт: IMPROVED, не RESOLVED.** Ролі трьох поверхонь тепер явно розмежовані одним хабом і власними, недвозначними підписами кожного рядка ("Твоя капсула вже чекає" / "Спробуй згадати"), а не лише документацією поза UI — реальне покращення зрозумілості. Але сама концептуальна близькість Capsule/Memory як двох окремих "вільний текст про враження від книги" таблиць лишається — новачок і далі стикається з двома схожими поняттями, просто тепер із чіткішими підказками, коли яке відкривати.

### Stats vs Profile vs Fingerprint vs Seasons vs Wrapped

**Вихідний стан (V1.6, "Пара 4"):** п'ять окремих рядків меню Профілю з однаковою вагою, що й технічні утиліти (Резервна копія), кожен зі своїм незалежним "порахуй найчастіший жанр" кодом.

**Поточний стан — CODE VERIFIED.** `app/(tabs)/profile/index.tsx`, `MENU_ITEMS` тепер має рівно ОДИН рядок "Моє читання" (перший у списку, замість п'яти) — перевірено прямим читанням масиву: `MENU_ITEMS` містить 8 пунктів усього (Моє читання/Моя історія/Цілі/Нагадування/TBR/Резервна копія/Перевірка даних/Імпорт), не 12. Тап веде на `app/my-reading.tsx`, який групує п'ять аналітичних екранів під трьома `QuickAction` (Статистика/Профіль/Відбиток) плюс секцію "Підсумки" (Рік→Wrapped, Сезони). Кожен з п'яти екранів лишається доступним, жоден код обчислення не видалений. Реальне видалення дублювання коду (не лише навігації) підтверджено окремо: `src/lib/readingAggregates.ts` — 5 спільних функцій (`sumSessionMinutes`/`sumSessionPages`/`computeBusiestMonth`/`filterFinishedInRange`/`computeTopGenreAmong`), на які тепер спираються `useWrappedYear`/`useReadingSeason`/`useStatistics` замість трьох незалежних копій того самого reduce.

**Вердикт: RESOLVED (навігаційно) + IMPROVED (обчислювально).** Це найповніший з чотирьох кластерів: тут вирішена не лише IA-плутанина (один вхід замість п'яти рівноправних), а й сама причина потенційної розбіжності цифр (спільні агрегатори замість трьох окремих реалізацій "найчастіший жанр").

### Journal vs History vs Memory vs On This Day

**Вихідний стан (V1.6, "Пара 5"):** чотири "стрічки минулого" без явної ієрархії ролей; On This Day мала 0 постійних входів (лише лотерея Home-контекстної картки, часто програє іншим кандидатам).

**Поточний стан — CODE VERIFIED.** Ролі тепер явно розмежовані трьома різними формулюваннями: «Мій щоденник» = що я записував (нотатки/цитати), «Моя пам'ять» = що варто згадати (капсули/due-recall/перечитання/on-this-day), «Моя історія» = secondary повна хронологія — і структурно демоційована: прибрана з `HOME_SHORTCUTS` (Фаза 16, `app/(tabs)/index.tsx` — масив `HOME_SHORTCUTS` тепер містить лише 3 пункти: Щоденник/Пам'ять/Статистика, не 4; "Моя історія" перевірено відсутня в масиві), лишається доступною лише з меню Профілю (один клік глибше). On This Day отримала перший ПОСТІЙНИЙ вхід — перший `QuickAction` на `app/memory/index.tsx` (рядки 147-154), завжди видимий незалежно від наявності контекстної картки на Home.

**Вердикт: IMPROVED, межує з RESOLVED.** Чотири поверхні лишаються чотирма реальними маршрутами (жоден не видалений — це прямо заявлений принцип strand-у), але ієрархія явна: одна первинна ("Моя пам'ять" — нове, багатше), дві другорядні з чіткою відмінністю мети (щоденник = запис, історія = архів), і одна (On This Day) вперше отримала непогоджений з лотереєю постійний вхід. Залишковий ризик — низький, але реальний: новий користувач, що бачить одразу "Мій щоденник" і "Моя пам'ять" поруч на Home (два з трьох shortcuts), усе ще має вирішити на льоту, яка з двох підходить для "я хочу подивитись, що писав" — назви достатньо різні (`записував` проти `варто згадати`), щоб це рахувати вирішеним, а не лише перейменованим.

---

## 67. FEATURE INVENTORY

Очікувана частота — усюди HYPOTHESIS: у застосунку немає жодної телеметрії використання (CODE VERIFIED — жодного analytics SDK в `package.json`, жодного виклику типу `logEvent`/`track` у коді), тож оцінка базується лише на структурі UI (глибина навігації, безумовність рендеру, кількість точок входу), не на реальних даних використання.

| Фіча | Користувацька цінність | Очікувана частота (HYPOTHESIS) | Тип | Зрілість |
|---|---|---|---|---|
| Core reading loop (додати книгу → сесія читання → прогрес → завершення) | Основна причина існування застосунку | Дуже висока (щоденно/щосесійно) | Core | STRONG — 27 міграцій, найбільше тестів, найстабільніший код у проєкті |
| ReadingRun / перечитування | Коректна модель "я читаю це вдруге", без якої вся аналітика для перечитаних книг була б неправильною | Низька-середня (перечитування — меншість подій) | Core (структурно) / Secondary (у щоденному UI) | STRONG у самій схемі/repository (7 міграцій, наскрізні тести на популяції), WEAK у видимості для користувача (CTA "Перечитати" звужений до підпису-посилання, Фаза 28) |
| Library (бібліотека + статуси + фільтри) | Базовий каталог власних книг | Дуже висока | Core | STRONG |
| Calendar 2.0 | Візуальний огляд активності по днях/місяцях | Середня | Core | STRONG — редизайн Фази 19, run-aware, без N+1, 20 нових тестів |
| Journal (нотатки/цитати) | Захоплення думок під час читання | Висока для активних users щоденника, ймовірно низька для інших | Core | STRONG |
| Book Memory (per-run хаб) | Централізований погляд на все, що зібрано про конкретне прочитання | Низька (відвідується рідко, після завершення книги) | Secondary | OK — ungated (Фаза 13), але залежить від того, чи користувач взагалі лишає рефлексії |
| Capsule ("капсула книги") | Одна стійка думка + reopen-нагадування через час | Низька (одноразова дія на книгу) | Secondary | OK — має власний recall/нагадування механізм, але концептуально близька до Memory (§68) |
| Recall ("гра-на-пам'ять") | Активне пригадування перед показом капсули | Дуже низька | Experimental | WEAK-OK — цінна ідея, вузьке застосування (лише коли капсула due) |
| Before/After (pre-reading reflection) | Порівняння очікувань і реальності | Низька (вимагає заповнити ДО читання, легко пропустити) | Secondary | OK |
| DNF-рефлексія | Структурований запис "чому покинув" | Дуже низька (DNF — рідкісна дія) | Secondary | OK, тепер run-aware (Фаза 11) |
| Spoiler-safe | Захист від спойлерів у прев'ю/списках | Фонова (пасивна, не власна дія) | Infrastructure | STRONG — централізована політика, а не ad hoc перевірки в кожному компоненті |
| Recommendations hub (`/next-read`) | Єдиний вхід до 4 механізмів вибору книги | Середня | Core | STRONG (навігаційно), алгоритми під капотом і далі варіюються за зрілістю |
| Analytics hub (`/my-reading`) | Єдиний вхід до 5 аналітичних екранів | Низька-середня | Secondary | OK — сам хаб тонкий (лише навігація+спільні агрегатори), кожен з 5 екранів різної власної зрілості |
| On This Day | Ностальгійний, емоційний тригер | Дуже низька (залежить від збігу дати) | Experimental | OK — вперше отримала постійний вхід (Фаза 16), раніше була лотереєю |
| Backup | Єдиний захист від втрати даних (локальний SQLite, без хмари) | Низька частота дії, ВИСОКА критичність | Core (інфраструктурно) | STRONG — транзакційний restore, data-міграції для старих версій, backfill сумісності (Фаза 27) |
| Data Doctor | Виявлення аномалій цілісності даних без auto-fix | Дуже низька (реактивна фіча) | Secondary | STRONG інфраструктурно (14 перевірок разом із Фазою 26), UI мінімалістичний |
| Personal Search (пошук по власних нотатках/цитатах) | FTS5 по власному контенту | Низька | Secondary | OK |
| Progressive onboarding | Пояснення термінів контекстно, без tutorial-режиму | Одноразова (по дизайну) | Secondary | OK — 3 підказки, кожна закривається назавжди |
| Goals (цілі читання) | Мотивація/трекінг | Низька-середня | Secondary | OK |
| Reminders | Нагадування читати | Низька | Secondary | OK, жорстко прив'язані до `notification_identifier` пристрою (§75) |
| Shelves (полиці) | Довільне групування книг | Середня | Secondary | OK, з реальним багом лічильника, щойно виправленим у Фазі 28 |
| Series tracking | Стеження за серіями книг | Низька | Secondary | WEAK-OK — найменш задокументована серед фіч цього списку в цій сесії; не торкалась V1.6.1 |
| Lore/Characters | Особистий вікі про світ книги | Дуже низька | Experimental | WEAK-OK — тепер згорнута за замовчуванням (Фаза 28, "LoreSection" стала `CollapsibleSection`), що саме по собі підтверджує невисоку очікувану цінність відносно ваги на екрані |

---

## 68. WHAT STILL FEELS REDUNDANT

Ця секція — навмисно критична, як і вимагає ТЗ; жодна пропозиція нижче не означає "видалити" — лише чесну фіксацію, що́ й чому й далі відчувається зайвим після консолідації.

**1. Capsule vs Memory лишаються двома паралельними "вільний текст про враження від книги" сутностями, тепер просто під однією парасолькою.** §66 показав, що НАВІГАЦІЙНО межа стала чіткою (два різні рядки хабу, різні описи). Але сама *концептуальна* різниця між "капсула" (one-sentence memory + lasting thought + reopen) і "спогад" (`book_memory.reflection`, вільний текст) і далі вимагає від користувача розуміти дві окремі ментальні моделі "написати щось про враження від книги" — одну з відкладеним нагадуванням, іншу без. Для користувача, який хоче просто "записати, що я думаю про цю книгу зараз", вибір між двома формами (яка з двох "правильна" для цього моменту?) — не очевидний з самого інтерфейсу, лише з назв.

**2. Book Details лишається найбільш перевантаженим екраном застосунку, і Фаза 28 сама це підтверджує, не спростовує.** `docs/UI_COMPLEXITY_AUDIT_PHASE28.md` прямо констатує: 15 можливих секцій, 10 безумовно рендеряться для активно читаної книги з повною історією. Фаза 28 додала заголовки трьом безіменним секціям і згорнула дві — це реальне, зафіксоване покращення читабельності, але сам факт "10 умовних секцій одна за одною" (Library/Stale Reading/Finish Prediction/History toggle/Lore/рейтинг/капсула/спогад/DNF/перечитати-CTA і так далі) — це не вирішено, і сам документ прямо каже, що частину запропонованих групувань свідомо НЕ зроблено через ризик для гейтингу кожної секції. Це чесно, але значить: Book Details і після Фази 28 — екран, де "де саме я лишу нотатку про цю книгу" вимагає прокрутки повз щонайменше 8-9 карток.

**3. TBR reality check, тепер піднятий на рівень Tomorrow/One Book Picker, і далі відповідає на дуже вузьке, рідкісне запитання ("скільки часу займе моя черга") порівняно з двома сусідами, які відповідають на щоденне "що читати".** Підняття видимості (Фаза 14) вирішило проблему прихованості, але не вирішило того, що сама фіча концептуально інша (статистика черги, не рекомендація конкретної книги) — вона тепер сидить поруч із двома "порадь мені книгу" картками під заголовком "З моєї полиці", хоча сама нічого не радить, лише показує факт "найдовше чекає X".

**4. П'ять аналітичних екранів (Statistics/Profile/Fingerprint/Wrapped/Seasons) залишаються п'ятьма РІЗНИМИ UI-парадигмами того самого "подивись на свою статистику" наміру, навіть після спільних агрегаторів.** `readingAggregates.ts` вирішив розбіжність ЧИСЕЛ (той самий "найчастіший жанр" тепер рахується одним кодом), але не розбіжність ФОРМИ: Fingerprint — бейджі, Wrapped/Seasons — річні/сезонні картки-звіти, Statistics — сирі цифри, Profile — інсайти. Користувач, що хоче відповідь на "як я читаю", і далі має обрати з п'яти принципово різних презентацій того самого джерела правди, лише тепер з одного хаба замість п'яти пунктів меню.

**5. Recall (гра-на-пам'ять перед показом капсули) — найвужче застосування серед усіх фіч цього релізу.** Спрацьовує лише коли: (a) є капсула, (b) вона `due` (reopen timer настав). Це вузький, одноразовий момент на книгу — фіча, побудована як окремий екран (`app/recall/[workId].tsx`) заради UX-моменту, що трапляється в кращому разі раз на прочитану книгу, і то не для кожної. Продуктова цінність реальна (активне пригадування — відомий мнемонічний прийом), але вага в кодовій базі (окремий route, окремий репозиторій `CapsuleRecallRepository`, окрема таблиця `capsule_recall`) відносно частоти використання відчувається як over-engineering для такого вузького моменту.

**6. On This Day лишається фічею, залежною від випадкового збігу календарної дати — цінність будь-якого конкретного відвідування невідома заздалегідь навіть самому користувачу.** Фаза 16 дала їй перший постійний вхід, що правильно виправляє проблему видимості, — але сама фіча за дизайном найчастіше показуватиме "нічого немає для цієї дати" (у бібліотеки з малою кількістю книг за роки шанс збігу дати низький). Постійний вхід тепер веде на екран, порожній стан якого буде типовим, а не винятковим, для більшості відвідувань — це не помилка Фази 16 (вона розв'язує зовсім іншу проблему, видимість), але й не вирішує саму структурну малоймовірність корисного результату.

---

## 69. WHAT BECAME MORE VALUABLE

**On This Day тепер коректно відносить спогад до конкретного прочитання, а не до книги взагалі.** До ReadingRun `book_memory`/`book_capsule` не мали жодного способу розрізнити, з якого саме прочитання походить запис — `UNIQUE(user_book_id)` на `book_memory` (Migration 004) і "найновіша капсула = поточна" (`book_capsule`, без `UNIQUE`) означали, що показ "цей день у твоєму читанні" для перечитаної книги показав би або перезаписаний (втрачений) спогад першого прочитання, або невизначено яку з накопичених капсул. Тепер `book_memory.reading_run_id`/`book_capsule.reading_run_id` (Migrations 021/023, CODE VERIFIED) дають кожному запису точну прив'язку до конкретного проходу — On This Day, коли показує старий запис, тепер архітектурно МОЖЕ (хоча сам екран цієї сесії не перечитувався рядок у рядок для підтвердження UI-рендеру дати конкретного run) відрізнити "це з першого читання 2023-го" від "це з другого читання 2025-го", де раніше такого розрізнення не існувало фізично в даних.

**Capsule вперше коректно пропонується ЗНОВУ після перечитування.** `docs/READING_RUN.md`/Migration 023 прямо документують колишню поведінку: після повторного завершення книги стара капсула (з першого прочитання) "перекривала" — UI бачив, що капсула вже є, і ніколи не пропонував нову. Тепер `reading_run_id`, зафіксований на капсулі раз і назавжди в момент створення, дозволяє `BookCapsuleSection`/`app/completion/[workId].tsx` коректно визначити "чи є капсула САМЕ для ЦЬОГО завершення" — реальна нова функціональна можливість, не лише архітектурне очищення.

**Before/After (pre-reading reflection) тепер може існувати окремо для кожного прочитання.** Та сама механіка, що й Memory (rebuild з `UNIQUE(user_book_id)` на `UNIQUE(reading_run_id)`, Migration 022) — до цього повторне читання не мало власного місця для нотатки "чого я очікую цього разу", форма взагалі була недоступна повторно (`canEditPreReadingReflection` гейтить лише за `status === 'reading'`, `docs/BEFORE_AFTER.md`). Це прямо унеможливлювало порівняння "чого я очікував першого разу" проти "чого — другого", яке тепер (частково) реалізоване на `app/reread-comparison/[workId].tsx`.

**Reading Experience reflections (`dominantExperience` на run) тепер агрегуються ПО ПРОЧИТАННЮ, а не по книзі загалом.** `useReadingRunsDetail`/`ReadingRunDetail.stats.dominantExperience`, показане на `RunCard` у `reread-comparison` — переважаюча "як читалося" емоція окремо для кожного run, а не змішана по всіх сесіях книги за все її життя незалежно від того, скільки разів її перечитували.

**Calendar 2.0 отримала run-aware позначку "Перечитування, прохід №N" на самому дні — можливе лише завдяки `reading_session.reading_run_id` (Migration 020).** До ReadingRun календар технічно не міг відрізнити день сесії першого читання від дня сесії перечитування тієї самої книги — тепер `ReadingRunRepository.listByIds` (пакетний запит для деталей дня) дає це напряму.

**Recall отримав перший справжній ГЛОБАЛЬНИЙ вхід, а не лише per-book.** До Фази 16 "чи є що згадати" перевірялось лише почавши з конкретної книги (Book Details/Capsule секція) — розділ "Час згадати" на `app/memory/index.tsx` тепер показує ВСІ due-капсули одразу, а не одну на Home-лотереї.

---

## 70. NEW PRODUCT CAPABILITIES UNLOCKED

Наступні пропозиції — структуроване продуктове/технічне міркування про можливості, НЕ верифіковані рішення й НЕ план на реалізацію. Передумови ("вже є в схемі") позначені CODE VERIFIED; сама пропозиція — HYPOTHESIS/proposal.

| # | Назва | Цінність для користувача | Архітектурна передумова (CODE VERIFIED) | Складність | Диференціація | Ризик |
|---|---|---|---|---|---|---|
| 1 | **Оцінка за кожне перечитування окремо** (не лише "остання оцінка") | Побачити, як змінювалось враження в цифрах, не лише в тексті | `rating` має `UNIQUE(reading_run_id)`, nullable FK (Migration 025) — кожен run уже МОЖЕ мати власну оцінку; `RatingRepository.listByUserBookIds` уже явно документує "тепер повертає найновішу серед можливо кількох" | S — дані вже є, потрібен лише UI-агрегат | Пряме продовження вже показаного `RunCard.rating` у `reread-comparison` | Низький — чисто адитивний UI поверх наявних даних |
| 2 | **"Як змінювалось моє враження" — графік оцінок у часі для перечитуваних книг** | Візуальна історія замість текстового порівняння двох сусідніх прочитань | Те саме (`rating.reading_run_id` + `reading_run.startedAt`/`finishedAt` дають вісь часу) | M — потрібен новий chart-компонент, дані вже доступні одним запитом | Наразі `reread-comparison` показує лише текстові дельти між сусідніми парами, не тренд | Низький-середній — суто читання, без нових мутацій |
| 3 | **Порівняння темпу читання між прочитаннями (сторінок/день, хвилин/день)** | "Другого разу я читав швидше/повільніше" | `ReadingRunDetail.stats` уже рахує `daysSpent`/`totalDurationSeconds` на run (видно в `RunCard`); дельта вже рахується (`computeNumericDelta`) для оцінки й тривалості, але НЕ для темпу (сторінок/день) окремо | S-M — потрібне лише нове похідне число з уже наявних `daysSpent`+сторінок сесій run | Пряме розширення вже існуючого `DeltaCard`, не нова архітектура | Низький |
| 4 | **Річний звіт "перечитування року"** (скільки книг перечитано, які, скільки разів) | Доповнення до Wrapped саме для перечитаної класики | `ReadingRunRepository.listUserBookIdsWithMultipleFinishedRuns` уже існує (Фаза 16) — залишається лише відфільтрувати за роком завершення run | S-M | Wrapped наразі не виокремлює перечитані книги від нових узагалі (NOT VERIFIED — не перечитувався `useWrappedYear.ts` рядок у рядок цієї сесії, але жодна секція "Перечитання" в жодному з doc-описів Wrapped не згадана) | Низький |
| 5 | **"Скільки часу минуло між прочитаннями" інсайт** (напр. "Ти повернувся до цієї книги через 3 роки і 2 місяці") | Емоційно значущий факт про власне читацьке життя | `reading_run.startedAt`/`finishedAt` по кожному run книги — просте віднімання дат двох сусідніх run | S | Новий, наразі ніде явно не показаний інсайт (сирі дати є на `RunCard`, але явний "N років і M місяців" текст — NOT VERIFIED відсутній) | Низький |
| 6 | **Порівняння run-specific нотаток щоденника** (які нотатки написані під час якого прочитання) | "Що я думав під час першого читання" проти "що думаю зараз" пліч-о-пліч | ЧАСТКОВО: `note`/`quote` НЕ мають `reading_run_id` взагалі (CODE VERIFIED — жодна з міграцій 019-027 цього не додає; прив'язка note/quote до прочитання можлива лише непрямо через `session_id`→`reading_session.reading_run_id`) | M-L — потребує JOIN через сесію, а не прямий FK; для нотаток без `session_id` (вручну доданих поза сесією) прив'язки до run взагалі нема | Реальна нова можливість, але з задокументованою прогалиною покриття (не всі нотатки мають сесію) | Середній — потрібно явно показати "невідомо, з якого прочитання" для нотаток без сесії, а не мовчки ховати |
| 7 | **"Порівняти прочитання" — розширення на DNF-run у парі з фінальним успішним** ("покинув першого разу на стор. 80, дочитав другого разу") | Показати власний прогрес наполегливості | `dnf_reflection.reading_run_id` (Migration 024) + `reading_run.status IN ('finished','did_not_finish')` — обидва типи вже різняться на рівні run | S-M — `selectComparableRuns` наразі фільтрує лише `status === 'finished'` (CODE VERIFIED, `reread-comparison/[workId].tsx` коментар), тобто DNF-run наразі НЕ бере участі в порівнянні взагалі | Реальна незакрита прогалина поточного порівняння — гарний природний наступний крок | Низький |
| 8 | **Нагадування "спробуй перечитати" для книг з високою оцінкою й давнім останнім прочитанням** | М'яке заохочення повернутись до улюбленої книги | `reading_run.finishedAt` (найновіший run) + `rating.value` (per-run) дають усі дані для правила "high rating + finishedAt > N років тому" | S-M — потрібен лише новий кандидат для системи нагадувань/контекстної картки Home, дані вже є | Новий тип рекомендації, відмінний від чотирьох наявних у `next-read.tsx` (усі вони — "що читати", не "що перечитати") | Середній — ризик стати п'ятим конкуруючим "що читати" голосом, якщо додати необережно (прямий наслідок §68 п.3) |
| 9 | **Серійне перечитання: "чи перечитував(-ла) я всю серію" статус** | Візуалізація прогресу перечитування багатотомної серії | `ReadingRunRepository.listUserBookIdsWithMultipleFinishedRuns` + `SeriesRepository`/`series_entry` (обидві таблиці існують незалежно) — просте перетин двох наявних наборів даних, жодного нового стовпця не потрібно | S-M | Наразі перечитання й серії — дві повністю незв'язані в UI фічі (NOT VERIFIED — не перечитувався `app/series` рядок у рядок, але жодна з прочитаних секцій `docs/MEMORY_HUB.md`/`READING_RUN.md` не згадує серії) | Низький |
| 10 | **"Історія цієї книги в моєму житті" — комбінований run+capsule+memory+rating timeline на одному екрані** | Єдина, хронологічно впорядкована стрічка всього, що коли-небудь записано про книгу, замість розкиданих секцій Book Details | `ReadingRunRepository.listByUserBookId` (усі run, `run_number ASC`) + вже написаний `useReadingRunsDetail` (той самий хук, що й `reread-comparison`, і "Історія прочитань" на Book Details) — обчислювальна основа вже існує | S — переважно UI-композиція вже наявного хука в новому вигляді (timeline замість порівняння/акордеону) | Пряме використання вже написаного `ReadingRunDetail` в третьому вигляді (акордеон на Book Details, порівняння на reread-comparison, тепер timeline) | Низький |

Найбільш обмежувальний факт, який варто явно зафіксувати перед будь-яким плануванням: **жодна з таблиць 021-025 не має SQL `REFERENCES reading_run(id)`** (свідоме рішення, задокументоване в кожній міграції — ризик мовчазного обнулення при майбутньому rebuild) — цілісність цих зв'язків тримається виключно на рівні застосунку (repository-логіка), не бази даних. Будь-яка нова фіча, що читає `reading_run_id` напряму (а не через існуючий repository-метод), має сама враховувати, що записаний `reading_run_id` теоретично може вказувати на run, якого вже немає (обидва випадки вже покриває Data Doctor — `*_references_invalid_run`, Фаза 26) — це і documented limitation, і задокументований guardrail одночасно.

---

## 71. NEW CALENDAR OPPORTUNITIES

Основа — `ActivityHistoryRepository.listBetween(db, startIso, endIso)` (CODE VERIFIED, `src/data/repositories/ActivityHistoryRepository.ts`, рядки 207-213): один SQL-запит з `UNION ALL` восьми типів подій (сесії/старт/фініш книги/нотатки/цитати/полиці/тощо, `ACTIVITY_UNION_SQL`), відфільтрований за довільним діапазоном `occurred_at`, з уже вбудованою spoiler-safe фільтрацією (`isActivityRowSpoilerHidden`). Плюс `useMonthCalendarData` (`src/features/calendar/useCalendarSessions.ts`) — пакетна агрегація на весь видимий діапазон сітки без N+1, і run-aware деталі дня через `ReadingRunRepository.listByIds`.

- **Річний вигляд (year view, "heatmap року").** Технічно — той самий `listBetween` виклик з діапазоном у 365 днів замість 30-31, плюс той самий `computeDayIntensity`, що вже рахує 0-3 рівні для місяця. Обчислювально дешево (один SQL-запит); UI-виклик — чи рендерити 365 клітинок продуктивно на мобільному екрані (потребує власної, компактнішої візуалізації, не прямого перевикористання `DayCell`).
- **Монтажна "карта читання"/мапа активності** (умовний GitHub-contributions-style граф) — той самий запит, що й річний вигляд; додаткової архітектурної роботи над даними не потрібно, лише над рендером.
- **Місячний "спогад-картка"/рекап** (аналог уже наявних share-карток Memory/Season/Fingerprint, `react-native-view-shot`) — `listBetween` на місяць + вже наявна інфраструктура генерації карток-зображень (використана для Fingerprint/Season) дають технічну основу без нового шару інфраструктури captured-зображень.
- **Пошук по календарю** (знайти день з певним типом події чи книгою) — `ACTIVITY_UNION_SQL` уже повертає типізовані події з `bookColumns` (назва/автор); фільтр за текстом чи типом — додатковий `WHERE` до вже написаного union-запиту, а не новий шар даних.
- **Маркери зміни сезону** (напр. лінія на календарі "тут почалась осінь") — суто UI-шар: `src/lib/season.ts`/`currentSeasonKey` уже дають чисту функцію дата→сезон, календар просто ще не малює цю межу.
- **Календар для ОДНІЄЇ книги через роки** ("уся активність цієї книги за весь час — усі прочитання/перечитування на одній стрічці часу"). Це НАЙЦІКАВІШИЙ пункт архітектурно, і тут є реальне обмеження: `listBetween(startIso, endIso)` фільтрує лише за ДІАПАЗОНОМ ДАТИ, не за книгою (CODE VERIFIED — сигнатура не приймає `userBookId`/`workId`). `ACTIVITY_UNION_SQL` уже повертає book-колонки в кожному рядку, тож технічно можливо додати `WHERE user_book_id = ?` до того самого union-запиту (природне продовження вже написаного SQL, не новий запит з нуля) — але це такий запит, якого сьогодні буквально не існує; складність S-M, не L, саме тому що структура SQL уже готова до цього розширення (лише додати параметризований `WHERE`), а не тому, що це вже працює.

---

## 72. READINGRUN FUTURE OPPORTUNITIES

Ґрунтується виключно на тому, що вже дійсно є в `reading_run`/`ReadingRunRepository` (CODE VERIFIED, §див. Migration 019 і `ReadingRunRepository.ts` вище) — поля: `id`, `userBookId`, `runNumber`, `status` (`in_progress`/`finished`/`did_not_finish`), `startedAt`, `finishedAt`, `isLegacyBackfill`, `createdAt`/`updatedAt`/`deletedAt`. Методи: `getById`/`listByUserBookId`/`getActiveByUserBookId`/`getLatestByUserBookId`/`start`/`finish`/`discard`/`listByIds`/`listUserBookIdsWithMultipleFinishedRuns`.

- **Оцінка "на run"** — УЖЕ РЕАЛІЗОВАНА (Migration 025, `rating.reading_run_id UNIQUE`), і вже показана в `reread-comparison`. Не нова можливість — варто зафіксувати як БАЗУ, на якій усе нижче будується.
- **Нотатки "на run" (`run notes`, окремо від Memory/Capsule/Journal)** — САМ `reading_run` не має жодного текстового поля (лише статус+дати, CODE VERIFIED зі схеми). Будь-яка "нотатка про це конкретне прочитання" сьогодні йде або в `book_memory` (одна на run, вже прив'язана), або в `note`/`quote` (не прив'язані до run напряму, лише непрямо через сесію — §70, п.6). Окреме поле "нотатка про run" додало б четверту текстову поверхню поруч із Memory/Capsule/Journal — і саме тому, за принципом §68 (Capsule vs Memory вже відчуваються зайво близькими), додавання ще одного місця для "написати щось про це прочитання" варте обережного продуктового рішення, а не автоматичного "раз є run — додамо йому нотатку".
- **Цілі читання, специфічні для одного run** ("прочитати цей перечит за 2 тижні") — `reading_goal` НЕ має `related_run_id`, лише `related_work_id`/`related_series_id` (CODE VERIFIED, схема 001). Це реальна архітектурна прогалина, не готова передумова: додавання run-специфічної цілі вимагало б нової колонки/міграції `reading_goal`, а не лише читання наявних даних.
- **"Виклик на перечитання" (reread challenge)** — комбінація вже наявного `listUserBookIdsWithMultipleFinishedRuns` (хто вже перечитує) з новою структурою "виклику" (яка сьогодні не існує в жодній формі — немає таблиці "виклик/challenge" у всій схемі). Складність L — це не розширення наявної сутності, а нова продуктова концепція з власним станом (початок/дедлайн/учасники — хоча застосунок однокористувацький, тож "учасники" тут не застосовне; радше "самозобов'язання з дедлайном").
- **Порівняння темпу між run** — див. §70 п.3, уже детально обґрунтовано там.
- **Порівняння вражень між run — розширення того, чого `reread-comparison` СЬОГОДНІ НЕ РОБИТЬ.** Перечитаний `app/reread-comparison/[workId].tsx` (рядки 1-169) показує: оцінку, дні/час читання, `dominantExperience` (текстова мітка), `beforeAfter.expectedRating`, `rating.review`, `capsule.oneSentenceMemory`/`lastingThought`, `memory.reflection` — і чисельну дельту (`DeltaCard`) ЛИШЕ для оцінки й тривалості читання (`computeNumericDelta`, CODE VERIFIED, рядки 139-168). Чого немає: (а) дельти чи порівняння для `dominantExperience` (просто дві окремі текстові мітки, не "змінилось з X на Y"), (б) жодного порівняння ТЕМПУ (сторінок/день), (в) жодного порівняння genre/mood з сесій, (г) фільтр лише на `status === 'finished'` — DNF-run повністю виключені з порівняння (§70 п.7). Це готовий, конкретний список наступних кроків саме для цього екрана, не абстрактна ідея.
- **Нагадування про перечитування** — див. §70 п.8.

---

## 73. УКРАЇНОМОВНІСТЬ ПЕРШОЮ

**Чи змінила V1.6.1 українськомовну орієнтацію застосунку — CODE VERIFIED, ні.** Точковий вибірковий перегляд нових/змінених у V1.6.1 екранів (`app/next-read.tsx`, `app/my-reading.tsx`, `app/memory/index.tsx`, `app/reread-comparison/[workId].tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/profile/index.tsx`) — усі видимі рядки (`AppText`/`accessibilityLabel`/заголовки `Stack.Screen`) українською без винятку. Пошук латинських слів довжиною ≥4 символи в цих файлах повертає лише ідентифікатори коду, назви компонентів/файлів/фаз у коментарях і англомовні слова технічної термінології всередині коментарів розробника (напр. "CONSOLIDATION", "flow", "check") — жодного разу не всередині JSX-тексту, видимого користувачу. У проєкті НЕМАЄ жодної i18n-бібліотеки (`grep` по `package.json` на `i18next`/`react-intl`/`formatjs` — 0 збігів; `app.config.ts` не задає жодного `locale`) — застосунок структурно однономовний: український текст захардкоджений прямо в JSX, а не витягнутий через translation-ключі. Це означає: (а) українськомовність по факту абсолютна (немає механізму, який дав би "протекти" англійський fallback), і водночас (б) майбутня локалізація іншою мовою вимагала б не "додати ще один файл перекладів", а рефакторингу кожного рядка UI-тексту в i18n-систему — структурно набагато дорожчий крок, ніж у застосунку, спроєктованому багатомовним із самого початку. Це той самий висновок, що вже мав існувати до V1.6.1 (не нова знахідка цієї фази) — лише переперевірено на новому шарі екранів.

### Можливості для глибини українського каталогу (вперед, HYPOTHESIS/proposals)

- **Переклади/видання (translator credits) — таблиці ВЖЕ ІСНУЮТЬ, CODE VERIFIED.** `translator` і `edition_translator` (many-to-many, `edition_id`↔`translator_id`) створені ще в базовій схемі (Migration 001, до будь-якого V1.6.1). Це означає: дані про перекладача видання технічно вже МОЖУТЬ зберігатись — питання не "чи потрібна нова таблиця", а "чи UI взагалі показує/дозволяє редагувати цей зв'язок" (NOT VERIFIED цієї сесії — жоден екран роботи з перекладачем не перечитувався рядок у рядок). Якщо UI для перекладача відсутній чи неповний, це найдешевша з можливих "глибина каталогу" інвестицій — схема готова, потрібен лише UI-шар.
- **Видавці (publisher).** Та сама ситуація — `publisher` таблиця й `PublisherRepository.ts` уже існують у схемі з Migration 001; `edition.publisher_id` — реальний FK. Готова передумова для "фільтр за видавцем"/"усі книги цього видавництва" фіч.
- **Українські видання конкретно (відмінність від оригіналу/інших мовних видань)** — `edition.language` (`DEFAULT 'uk'`) і `work.original_language` уже розрізняють мову видання від мови оригіналу на рівні схеми; можлива майбутня фіча "скільки з моєї бібліотеки — українські переклади проти оригінали" спирається на дані, які вже записуються при кожному доданні книги, без нової колонки.
- **Серії (completeness каталогу)** — `SeriesRepository.ts`/`series_entry` уже існують; поєднання з ReadingRun (§72, "серійне перечитання") — природний наступний крок, що також підсилює саме українську бібліотечну повноту (серії — типовий кейс для перевидань українською).
- **Загальна повнота українського каталогу** — застосунок спирається на Google Books + ISBNdb (обидва — не україномовні за замовчуванням) + власний курований каталог (`curated_book`, Supabase) для якості українських метаданих. Це архітектурне рішення, не змінене V1.6.1: глибина українського каталогу й далі залежить головним чином від ручного курування (`scripts/sync-curated-books.js`, згаданий в інших доках), а не від автоматичного джерела.

---

## 74. V2 AUTH READINESS

Оцінка складності міграції на `user_id` для кожної таблиці — на основі реальної FK-структури, знайденої в 27 міграціях.

**Загальний принцип складності:** TRIVIAL = пряма `user_book_id`/`work_id` іменована дитина з простим FK на один батьківський ланцюжок; MODERATE = потребує продумати, чи `user_id` йде на самій таблиці чи виводиться транзитивно через батька, і що робити з існуючими `UNIQUE`-обмеженнями за наявності кількох користувачів; COMPLEX = або каталогові таблиці, які мають стати СПІЛЬНИМИ між користувачами (а не просто отримати `user_id`), або структура, де сам сенс "унікальності" ламається без переосмислення.

| Таблиця | Складність | Обґрунтування |
|---|---|---|
| `user_book` | MODERATE | Корінь усього особистого дерева даних — тут `user_id` мав би з'явитись першим; складність не в самому додаванні колонки, а в тому, що ВСІ читання/списки в усіх репозиторіях (десятки) мають одночасно додати `WHERE user_id = ?` |
| `reading_session`, `reading_progress`, `note`, `quote`, `shelf`, `shelf_book`, `reading_goal`, `reminder`, `owned_book`, `loan` | TRIVIAL-MODERATE | Прямий FK на `user_book`/`user_book_id` (чи транзитивний через нього) — `user_id` можна вивести транзитивно ЧЕРЕЗ `user_book`, без власної колонки, якщо архітектура вибере "один user_id на весь ланцюжок через FK", а не денормалізацію |
| `reading_run` | MODERATE, не COMPLEX, АЛЕ з нюансом | `user_book_id` FK дає транзитивний шлях до `user_id`, як і решта. Складність саме тут — `UNIQUE(user_book_id, run_number)`: за багатокористувацької моделі (`user_book_id` більше не глобально унікальний власник) це обмеження й далі коректне, ОСКІЛЬКИ `user_book_id` вже прив'язаний до одного користувача через свій власний FK-ланцюжок — тобто оновлення СХЕМИ `reading_run` мінімальне, проблема радше в тому, що run-нумерація рахується запитом (`MAX(run_number) WHERE user_book_id = ?`), а не глобальним лічильником, тож цей запит лишається коректним і за багатьох користувачів без змін |
| `book_memory`, `pre_reading_reflection`, `dnf_reflection`, `rating` (усі — `UNIQUE(reading_run_id)`) | MODERATE-COMPLEX | Тут і є реальний нюанс, прямо поставлений у ТЗ: `UNIQUE(reading_run_id)` — це UNIQUE на FK до ІНШОЇ вже user-scoped таблиці (через `reading_run`→`user_book`). Це технічно БЕЗПЕЧНО навіть без зміни (`reading_run_id` сам уже унікально визначає користувача транзитивно — двоє користувачів ніколи не поділять один `reading_run_id`), АЛЕ архітектурно КРИХКЕ: будь-який майбутній код, що перевіряє "чи є вже запис для цього run" (`getForBookAndRun`, задокументовано в `SOFT_DELETE_READINESS.md` §"revive on upsert"), спирається на UNIQUE САМЕ по `reading_run_id`, без явного `user_id` в самому WHERE — цілком коректно для одного користувача на пристрій, але означає, що будь-яка майбутня "спільна БД, усі користувачі в одній таблиці" модель (а не "своя БД на юзера" модель) мусить ДОДАТИ явну user_id-перевірку в КОЖЕН з цих repository-методів, а не покладатись на сам SQL UNIQUE constraint для ізоляції користувачів — UNIQUE тут захищає від дублю ЗАПИСУ, не від витоку МІЖ користувачами |
| `book_capsule`, `capsule_recall` | MODERATE | Множинність на книгу вже дозволена дизайном (жоден UNIQUE), `reading_run_id` без SQL FK (свідоме рішення §75) — транзитивний `user_id` через `user_book_id`→`user_book` так само доступний, без додаткової складності від самого run-зв'язку |
| `work`, `edition`, `author`, `publisher`, `translator`, `genre`, `series` (каталогові) | COMPLEX, окремим сенсом | Це НЕ "додати user_id" завдання — ці таблиці МАЮТЬ лишитись СПІЛЬНИМИ між користувачами (той самий `work`/`edition` для двох людей, що читають ту саму книгу) — реальна складність тут архітектурна: перехід з "один SQLite на пристрій, де work/edition теж фактично приватні (хоч і не мають user_id)" на "спільний work/edition каталог, приватні лише user_book і все, що на нього посилається" — це не міграція колонки, а зміна моделі власності даних узагалі (потрібна дедуплікація work/edition між користувачами при першому імпорті на сервер) |
| `app_settings` | TRIVIAL | Singleton-таблиця, стає per-user рядком тривіально |

**Прямий висновок для §"reading_run і залежні" з ТЗ:** run-based FK-структура САМА ПО СОБІ не ускладнює user_id-міграцію більше, ніж плоска схема ускладнила б — увесь транзитивний шлях до `user_id` завжди йде через один і той самий `user_book_id`, незалежно від того, скільки проміжних таблиць (run→memory, run→capsule) є на шляху. Реальна складність — не в глибині FK-ланцюжка, а в тому, що жоден `UNIQUE(reading_run_id)` constraint сьогодні не несе явної гарантії ізоляції користувачів на рівні SQL (§ вище) — це стає значущим лише в моделі "спільна таблиця для всіх користувачів", не в моделі "окрема БД/партиція на користувача" (де ізоляція вже є фізично, до будь-якого `user_id`).

---

## 75. SYNC READINESS

**Первинні ключі — UUID, не auto-increment. CODE VERIFIED.** Кожна таблиця схеми (перевірено на `001_base_schema.ts` і на кожній з 019-027) використовує `id TEXT PRIMARY KEY`, заповнюваний `generateId()` (`react-native-uuid`, `src/lib/uuid.ts`) — жодної `INTEGER PRIMARY KEY AUTOINCREMENT` у всій схемі. Це готова передумова для sync без конфлікту ID між пристроями.

**`updatedAt` — присутній майже на кожній основній таблиці. CODE VERIFIED.** `work`/`edition`/`user_book`/`reading_session`/`note`/`quote`/`shelf`/`reading_goal`/`reminder`/`book_memory`/`book_capsule`/`rating`/`pre_reading_reflection`/`dnf_reflection`/`reading_run` — усі мають `created_at`+`updated_at TEXT NOT NULL`. Винятки серед перевірених: `genre`/`tag`/`book_source` (довідкові, без `updated_at` — прийнятно, майже незмінні після створення), `shelf_book`/`work_author`/`work_genre`/`edition_translator` (join-таблиці, лише `added_at` чи взагалі без timestamp — типово для pure-association таблиць).

**`deletedAt` — на 12 таблицях, НЕ на всіх, з конкретним, задокументованим переліком прогалин.** CODE VERIFIED повний перелік: `user_book`/`edition`/`work`/`note`/`quote`/`note_category`/`lore_entity`/`reading_session`/`reading_run` мали soft-delete до V1.6.1; Migration 027 додала ЩЕ ТРИ — `book_capsule`/`book_memory`/`rating` (це і є "3 таблиці з Фази 26/027" із завдання). **Явно перевірені персональні сутності БЕЗ soft-delete, і далі жорстко видаляються:**

- **`shelf`** — `ShelfRepository.remove` — фізичний `DELETE`. Обґрунтування в самому репозиторії (цитовано в `SOFT_DELETE_READINESS.md`): полиця — "ярлик", не контент; видалення не втрачає написаного тексту (книги лишаються в бібліотеці). Продуктово обґрунтовано, але для sync це означає: видалення полиці на одному пристрої не має жодного tombstone-запису для іншого пристрою дізнатись про це коректно (окрім самого факту зникнення рядка).
- **`reading_goal`** — `ReadingGoalRepository.remove` — фізичний `DELETE`. "Закрити ціль без виконання" — окремий статус `abandoned`, не видалення; видалення завжди означає "ціль була помилкою".
- **`reminder`** — `ReminderRepository.remove` — фізичний `DELETE`. Прив'язаний до пристрій-специфічного `notification_identifier` (`expo-notifications`) — найменш "синхронізовний" запис у всій схемі за дизайном.

**Append-only проти mutate-in-place — переважно mutate-in-place, з двома частковими винятками.** `reading_run` — mutate-in-place (`finish()` оновлює той самий рядок `UPDATE ... SET status = ?, finished_at = ?`), не додає новий рядок-подію. `book_capsule`/множинні `note`/`quote` за конструкцією append-only (кожен новий запис — новий рядок, `create` не `upsert`) — але це природний наслідок домену (кожна нотатка — окрема думка), не свідомий sync-орієнтований дизайн.

---

## 76. CONFLICT MODEL

Однозначно: **жодного з наведених нижче сценаріїв застосунок сьогодні не обробляє — це однопристроєвий (single-device) застосунок без будь-якого поняття "інший пристрій" у коді.** Немає жодного sync-протоколу, версійного поля для конфліктів, чи навіть мережевого механізму передачі даних між пристроями одного користувача (Backup — це ручний export/import файлу, не sync).

- **Пристрій A редагує нотатку, поки пристрій B редагує ту саму нотатку.** Сьогодні: неможливий сценарій за архітектурою (один SQLite-файл на пристрій, немає спільного стану) — але якби Backup-файл A було відновлено на B ПІСЛЯ того, як B уже відредагував ту саму нотатку локально, `BackupRepository.restoreAll` — це **replace-all** (задокументовано буквально, `docs/BACKUP_FORMAT.md` крок 5: "restore — це replace all... merge-режим — можлива майбутня функція, не в V1") — редагування B було б повністю втрачене без попередження про конфлікт, не тому що є розумний merge, а тому що replace-all не намагається його виявити.
- **Пристрій A завершує Run, поки пристрій B офлайн записує нову сесію для тієї самої книги.** Той самий структурний висновок: без sync-протоколу це не "конфлікт", який щось вирішує, — це просто дві незалежні бази даних, що розходяться назавжди, доки одна не перезапише іншу через Backup replace-all. `reading_run.run_number` рахується локальним `MAX(run_number) WHERE user_book_id = ?` (`ReadingRunRepository.start`) — на двох пристроях, що розійшлись, обидва можуть незалежно призначити той самий `run_number` різним фактичним прочитанням, і при майбутньому merge (не replace-all) це стало б реальним джерелом конфлікту номерів, не лише даних.
- **Пристрій A видаляє Капсулу, поки пристрій B на неї дивиться/посилається.** Найцікавіший випадок структурно: Migration 027 зробила `book_capsule.remove()` м'яким (`deleted_at`), а НЕ фізичним — це саме по собі майбутньо-дружня властивість (tombstone існує, а не зникнення без сліду). Але `capsule_recall.book_capsule_id ON DELETE CASCADE` "більше не спрацьовує" для м'якого видалення (задокументовано явно в `SOFT_DELETE_READINESS.md` як навмисний побічний ефект) — recall-історія лишається сиротою, що вказує на м'яко-видалену капсулу. Для sync це радше ПЕРЕВАГА, ніж проблема (дані не втрачені), АЛЕ жодного UI/repository-рівня "капсулу було видалено, оновити перегляд" механізму немає — сьогодні це неважливо (single device), у майбутньому sync-шарі UI пристрою B мав би десь дізнатись про зміну `deleted_at`, а сьогодні немає навіть локального push-механізму для цього (немає реактивного підписування на зміни БД, лише React Query invalidation при локальній мутації).

**Що саме в поточному дизайні ускладнить майбутній conflict-resolution шар:**

1. **Відсутність `updatedAt` на трьох персональних сутностях (`shelf`/`reading_goal`/`reminder`)** — навіть найпростіший "останній запис перемагає" (last-write-wins) конфлікт-резолвер потребує надійного timestamp на кожному запису; ці три його не мають систематично для порівняння версій між пристроями (хоча самі поля `created_at`/`updated_at` існують у схемі — “останній запис перемагає” на рівні REMOVE/DELETE вимагає tombstone-timestamp, якого немає, бо DELETE фізичний).
2. **Жодної версійної/revision-колонки ніде в схемі** (CODE VERIFIED — жодна з 27 міграцій не додає `version`/`revision` числове поле) — навіть там, де `updatedAt` є, немає способу відрізнити "паралельні незалежні зміни" від "послідовні зміни, де друга свідомо базувалась на першій" без vector clock/revision-номера.
3. **Хардкод фізичного `DELETE` на 3+3 таблицях** (§75) — tombstone-based sync (найпоширеніший підхід для offline-first застосунків) вимагає, щоб ЖОДНЕ видалення не було фізичним, доки всі пристрої не підтвердили синхронізацію; сьогоднішній змішаний стан (частина таблиць soft-delete, частина hard-delete) означає, що будь-яка майбутня sync-реалізація мусить або (а) мігрувати решту трьох на soft-delete першою, або (б) прийняти, що видалення цих трьох типів завжди виграють без можливості відновлення при конфлікті.

---

## 77. PRIVACY MAP

- **PUBLIC CATALOG** — `work`/`edition`/`author`/`publisher`/`translator`/`genre`/`series`/`book_source`. Дані, що структурно МОЖУТЬ походити із зовнішніх каталогів (Google Books/ISBNdb/курований каталог) і за дизайном не є персональними — сама книга, її автор, видання. `curated_book` (Supabase, окрема від локальної SQLite таблиця) — явно спільний, курований власником продукту каталог.
- **LOCAL PRIVATE** — увесь інший корпус: `user_book`, `reading_session`, `reading_progress`, `reading_run`, `note`/`quote`, `rating`, `book_memory`, `book_capsule`, `capsule_recall`, `pre_reading_reflection`, `dnf_reflection`, `shelf`/`shelf_book`, `reading_goal`, `reminder`, `owned_book`/`loan`, `app_settings`, `lore_entity`. Уся ця персональна бібліотека читача — виключно локальний SQLite-файл на пристрої, без жодного мережевого шляху назовні, окрім ручного Backup-експорту у файл, який керує сам користувач.
- **`reading_run` і весь Calendar-похідний дата-шар — підтверджено LOCAL PRIVATE, CODE VERIFIED.** Прямий пошук `reading_run`/`book_capsule`/`book_memory` по всій теці `supabase/` (схема + усі Edge Functions) — 0 збігів. `supabase/schema.sql` не має жодної таблиці для жодної з персональних сутностей вище — Supabase в цьому застосунку обслуговує ЛИШЕ три речі: (1) спільний курований каталог (`curated_book`), (2) обкладинки (Storage bucket `book-covers`), (3) проксі до зовнішніх API (ISBNdb/Google Books, rate-limit таблиці). Жодних персональних даних читача не покидає пристрій сьогодні структурно — це не політика, а факт відсутності будь-якого коду, що робив би інакше.
- **REMOTE SHARED** — те, що дійсно торкається Supabase: (а) `curated_book` (кураторський каталог, пишеться скриптом власника продукту з service-role ключем, читається анонімно всіма користувачами), (б) обкладинки в bucket `book-covers` (публічне читання, запис лише через `cover-upload` Edge Function, §78), (в) агреговані "Тренди" (`RecommendationRepository`/spільний лічильник, якщо книга додається — NOT VERIFIED деталей anonymity цієї агрегації в цій сесії, але сама концепція "скільки разів книгу додали" — агрегат, не персональний запис), (г) rate-limit лічильники за IP (`edge_rate_limit_check`) — технічні, не контентні дані.
- **SERVER SECRET** — `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_BOOKS_API_KEY`, ISBNdb-ключ — усі підтверджено (§78) читаються лише через `Deno.env.get(...)` всередині Edge Functions, жодного збігу в клієнтському коді (`src/`/`app/`).

---

## 78. SECURITY REGRESSIONS

Перевірено спеціально на нові/розширені у V1.6.1 файли (Фаза 4 — Google Books proxy; Фаза 25 — Edge Function CI).

**Публічні секрети, випадково закомічені — CODE VERIFIED, не знайдено.** Пошук патернів API-ключів (`AIza`, `sk-`, прямих рядків після `_KEY =`) у `supabase/functions/google-books-proxy/index.ts` і решті нових/змінених файлів — усі ключі читаються виключно через `Deno.env.get(...)`, жодного хардкодженого значення.

**CORS — `Access-Control-Allow-Origin: '*'` — присутній, АЛЕ НЕ є регресією Фази 4/25.** `supabase/functions/_shared/cors.ts` (CODE VERIFIED) — той самий спільний файл, датований коментарем "POLYTSIA V1.5, Фаза 1" — тобто вайлдкард CORS існував ще до Google Books proxy і до Edge Function CI, і Google Books proxy (`google-books-proxy/index.ts`) лише ІМПОРТУЄ той самий вже наявний `CORS_HEADERS`, не вводить власний, ширший. Це — задокументований, свідомий вибір ("мобільний застосунок сам по собі не робить CORS preflight... заголовки тут навмисно на всі функції одразу"), не новий і не розширений цією фазою. Зафіксовано як існуючий стан, не регресію.

**Анонімні шляхи запису — `cover-upload` продовжує вимагати той самий захист, задокументований раніше, без послаблень від роботи над Google-проксі.** Перевірено безпосередньо код `cover-upload/index.ts` (CODE VERIFIED): перевірка реального типу файлу за magic bytes (не за `Content-Type` заголовком), жорсткий підрахунок байтів під час стріму (не лише довіра `Content-Length`), шлях об'єкта генерується ВИКЛЮЧНО сервером (`crypto.randomUUID()`, ніколи з клієнтського рядка), запис у Storage через `service_role` (обходить RLS, як і задокументовано раніше), rate limiting за IP. Жодних змін, які послаблювали б цей контур, не знайдено — `google-books-proxy`/`cover-upload` лишаються незалежними файлами без спільного коду поза `_shared/`.

**Service-role ключ — CODE VERIFIED, ніколи в клієнтському коді.** `grep` по всьому `src/`/`app/` на `SERVICE_ROLE` — 0 збігів; усі три збіги в `supabase/functions/*/index.ts` (Google Books/ISBNdb/cover-upload), кожен через `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`. Клієнтський код скрізь використовує лише `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

**Небезпечні логи — часткова, незначна знахідка, не пов'язана з Фазою 4/25 конкретно, але присутня в проксі-шарі.** `isbndb-proxy/index.ts` логує `console.log`/`console.error` з фрагментом тіла upstream-відповіді (`bodyText.slice(0, 300..500)`) і шляхом запиту — коментар у коді сам пояснює намір ("статус ISBNdb + обрізане тіло", не секрет). Це не логування ТІЛА ЗАПИТУ КОРИСТУВАЧА (яке не містить нічого чутливішого за пошуковий текст книги), а логування ВІДПОВІДІ зовнішнього API — низький ризик, оскільки жодних персональних даних читача через ці проксі взагалі не проходить (proxy передає лише пошукові запити щодо книг, не персональну бібліотеку). `google-books-proxy/index.ts` має той самий патерн лише для помилкового шляху (`console.error` на upstream != 200), без логування успішних відповідей повністю — трохи консервативніший, ніж `isbndb-proxy`. Не є регресією Фази 4/25 — обидва проксі писались тим самим підходом одночасно, різниця мінімальна й непринципова.

**Підсумок:** жодної НОВОЇ регресії безпеки, введеної саме Фазою 4 (Google Books proxy) чи Фазою 25 (Edge Function CI), не знайдено CODE VERIFIED-перевіркою. Найпомітніший факт цієї секції — протилежний регресії: Фаза 25 сама вперше ввела автоматичну перевірку (`deno check`/`deno lint`) шести файлів Edge Functions, які до цього НІКОЛИ не перевірялись жодним інструментом на жодному push/PR (`docs/EDGE_FUNCTION_CI.md`, CODE VERIFIED) — і цей перший реальний прогін одразу впіймав справжню типову помилку (`TS2769`) у `cover-upload/index.ts`, неможливу для виявлення до цієї фази. Це закриття прогалини процесу, а не її створення.

---

## 79. ERROR HANDLING

**ReadingRun-міграції (019-027) — атомарність підтверджена на рівні SQL-транзакції, CODE VERIFIED.** `migrationRunner.ts.applyMigrations` огортає кожну міграцію в `db.withTransactionAsync` окрім тих, що самі оголошують `manualTransaction = true` (021/022/024/025 — усі, що роблять rebuild з `PRAGMA foreign_keys` перемиканням, яке не можна робити всередині транзакції SQLite). Для цих чотирьох сама міграція явно керує власною `db.withTransactionAsync` навколо rebuild-кроку, і одразу після — `PRAGMA foreign_key_check`, що кидає виняток, якщо rebuild залишив порушені посилання (CODE VERIFIED, буквально в кожній з чотирьох міграцій: `if (violations.length > 0) throw new Error(...)`). Якщо `020_reading_run_backfill.ts`'s JS-цикл (`backfillLegacyReadingRuns`) кине виняток ПОСЕРЕД циклу по книгах — уся міграція виконується в ОДНІЙ транзакції (020 НЕ має `manualTransaction`), тож `db.withTransactionAsync` відкотить УСІ вже застосовані `INSERT INTO reading_run`/`UPDATE reading_session` цього виклику, а не залишить частину книг з run, частину без. Раптовий крах JS-циклу не залишає частковий стан — це прямий наслідок того, що весь backfill — один виклик усередині однієї транзакції, підтверджено читанням коду, не лише документації.

**Calendar — жодного власного `try/catch`/`isError`-обробника в самому екрані (`app/(tabs)/calendar.tsx`), CODE VERIFIED (grep по файлу — 0 збігів на ці ключові слова).** Єдина мережа безпеки — глобальний `ErrorBoundary`, експортований з `app/_layout.tsx` (Expo Router file convention — `export function ErrorBoundary({ error, retry })`), що показує "Щось пішло не так" + кнопку "Спробувати ще раз" замість білого екрана/краху застосунку, якщо рендер кине виняток БУДЬ-ДЕ в дереві. Для помилки самого SQL-запиту (`useMonthCalendarData`, React Query) без явного `isError`-рендеру в `calendar.tsx` — стан "запит впав" не має власного UI-повідомлення на цьому екрані конкретно; чи React Query сам кидає далі в рендер (де його підхопив би `ErrorBoundary`), чи тихо лишає `data: undefined` (не крашить, але показує порожній календар без пояснення) — залежить від глобальних налаштувань `QueryClient` (`throwOnError`), які НЕ перечитувались у цій сесії (NOT VERIFIED). Це залишає реальну відкриту невизначеність: у гіршому сценарії користувач бачить порожній календар без жодного повідомлення "не вдалось завантажити", не raw-текст помилки, але й не корисне пояснення.

**Google Books proxy — клієнтський хук ніколи не пропускає сирий текст помилки в UI, CODE VERIFIED.** `src/data/remote/googleBooksProxyClient.ts` — увесь `callProxy` обгорнутий `try/catch`, задокументовано буквально "graceful-degradation філософія... try/catch → null, ніколи не кидає в UI" (коментар автора коду, підтверджено структурою функції: `AbortController`+timeout, catch повертає `null`, не прокидує виняток). `GoogleBooksProvider.ts` при `null` від проксі падає назад на прямий анонімний клієнтський виклик (задокументована, а не лише заявлена поведінка) — подвійний рівень graceful degradation: спочатку проксі-шлях, при його відмові — прямий виклик, і лише за відмови ОБОХ користувач побачив би порожній результат пошуку, не текст помилки мережі.

**Backup — restore транзакційний, АЛЕ два допоміжні кроки після нього — best-effort з мовчазним логуванням, не показом користувачу.** `useBackup.ts.useRestoreBackup` (CODE VERIFIED, рядки 103-143): (1) `BackupRepository.restoreAll` — вся вставка в одній транзакції, повний rollback при падінні (задокументовано буквально в `BACKUP_FORMAT.md` крок 4 і в коментарі коду). (2) Одразу після УСПІШНОГО restore — `backfillAllLegacyReadingRunLinks(db)` (заповнення `reading_run` для файлів, зроблених до Фази 6) обгорнутий у ВЛАСНИЙ `try/catch`, що лише логує (`log.error`) і НЕ прокидує далі — коментар прямо пояснює чому ("`restoreAll` уже завершився успішно... збій саме цього допоміжного кроку не повинен показувати користувачу 'не вдалося відновити дані'"). (3) Той самий патерн для `rebuildCapsuleRemindersAsync`. **Це задокументований, продуманий компроміс, не недогляд** — але практичний наслідок вартий чесної фіксації: якщо крок (2) впаде на реальному пристрої власника, restore буде показаний користувачу як УСПІШНИЙ (дані бібліотеки дійсно відновлені коректно), а книги, відновлені зі старого (до-Фази-6) бекапу, лишаться БЕЗ `reading_run` — і про це користувач не дізнається з UI взагалі, лише якби згодом сам зайшов у "Перевірку даних" і побачив `session_without_run`-попередження. Жоден raw-текст помилки користувачу не потрапляє в жодному з трьох кроків — але й позитивного підтвердження "усе точно відновлено повністю" немає для кроку (2)/(3), лише мовчазна відсутність негативного повідомлення.

**Загальний висновок:** жодного шляху, де сирий JS/SQL error message (stacktrace, `error.message` мовою розробника) реально дійшов би до кінцевого користувача, не знайдено CODE VERIFIED-перевіркою — застосунок послідовно тримається принципу "власні українські повідомлення або мовчазна graceful-деградація", підтвердженого на всіх чотирьох перевірених потоках. Найслабша ланка — не "сира помилка", а "тиха відсутність підтвердження" для допоміжних (не критичних) кроків backup-відновлення.

---

## 80. MIGRATION RISK AUDIT

**Транзакційність — кожна міграція, крім чотирьох, отримує ВЛАСНУ транзакцію від `migrationRunner.ts`, CODE VERIFIED.** `applyMigrations` (рядки 84-96): для кожної міграції в циклі — якщо НЕ `manualTransaction`, виклик обгорнутий `db.withTransactionAsync`; щойно транзакція завершується успішно, одразу наступним рядком — `PRAGMA user_version = ${migration.version}` (окремий виклик, ПОЗА транзакцією самої міграції, але одразу після її коміту). Це НЕ одна спільна транзакція на весь пакет міграцій ("V1.5→latest" — 16 міграцій за один виклик `migrateDbIfNeeded`) — кожна з 16 комітиться незалежно, одразу після своєї.

**Rollback-поведінка при падінні посеред міграції.** Для звичайної (не `manualTransaction`) міграції — SQLite сам відкочує всю транзакцію при винятку всередині `withTransactionAsync`, тож ця конкретна міграція не залишає частковий стан, і оскільки `PRAGMA user_version` ще НЕ проставлений на момент падіння (він іде ПІСЛЯ успішного коміту), БД лишається на попередній, уже застосованій версії — коректний, безпечний стан для повторної спроби. Для `manualTransaction`-міграцій (021/022/024/025, ReadingRun rebuild з `PRAGMA foreign_keys` перемиканням) — сама міграція керує власною внутрішньою транзакцією (rebuild-крок), і ЗОВНІШНЄ `try/finally` навколо неї гарантує `PRAGMA foreign_keys = ON` повертається навіть при падінні (CODE VERIFIED — буквально `finally { await db.execAsync('PRAGMA foreign_keys = ON;'); }` у кожній з чотирьох). Якщо `PRAGMA foreign_key_check` після rebuild знаходить порушення — міграція кидає виняток ПІСЛЯ коміту внутрішньої транзакції rebuild, але ДО коміту JS-backfill кроку (021/022/024/025 усі роблять backfill окремим `db.withTransactionAsync` ПІСЛЯ rebuild-блоку) — теоретично можливий проміжний стан "схема вже rebuild-нута (нова колонка є), backfill ще не застосований" ІСНУЄ як вікно між двома внутрішніми транзакціями однієї міграції, АЛЕ `PRAGMA user_version` не піднявся б у жодному разі падіння (external `applyMigrations` кидає виняток раніше), тож наступний запуск `migrateDbIfNeeded` побачив би стару версію й спробував би ту саму міграцію ЗНОВУ з нуля — rebuild СТВОРЮЄ НОВУ таблицю (`_new`) і лише тоді `DROP`+`RENAME` оригінал, тож повторний запуск після часткового падіння натрапив би на `CREATE TABLE X_new` конфлікт, ЯКЩО перший невдалий прохід устиг дійти до `CREATE TABLE`, але не до `DROP TABLE X` — це реальне, хоч і вузьке (потребує краху точно між двома конкретними SQL-операціями rebuild) відкрите ризикове вікно, не спростоване й не підтверджене тестом цієї сесії (NOT VERIFIED — жоден тест не симулює крах ПОСЕРЕД rebuild-блоку, лише повний успіх чи (неявно) повний крах до початку).

**`PRAGMA user_version` проставляється ЛИШЕ після успішного коміту — CODE VERIFIED, підтверджено буквальним порядком рядків 88-94 `migrationRunner.ts`.** Це правильний, безпечний порядок: версія БД ніколи не "обіцяє" застосовану міграцію, доки та справді не завершилась.

**Що станеться, якщо застосунок закритий/вбитий ПОСЕРЕД міграції.** Для звичайної транзакційної міграції — SQLite сама гарантує: недокомічена транзакція при крахові процесу просто не застосовується (WAL/journal відкат при наступному відкритті файлу) — БД лишається на попередній версії, `migrateDbIfNeeded` при наступному запуску побачить ту саму (стару) `user_version` і спробує ту саму міграцію знову, чисто. Для `manualTransaction`-міграцій це складніше через вікно між двома внутрішніми транзакціями (rebuild і backfill) — описано вище: у гіршому (вузькому) випадку повторний запуск може натрапити на залишену `X_new` таблицю від невдалого попереднього rebuild-кроку й впасти на `CREATE TABLE X_new` конфлікті замість чистого повтору. Жодного детектора "частковий стан, потрібен ручний ремонт" немає — NOT VERIFIED присутність будь-якого коду, що перевіряв би існування осиротілої `_new`-таблиці при старті.

**Практична рекомендація власнику продукту перед оновленням із новою міграцією.** Застосунок НЕ робить автоматичний backup перед застосуванням міграцій — CODE VERIFIED (жоден виклик `BackupRepository.exportAll`/аналог не знайдений у шляху `migrateDbIfNeeded`/старту застосунку). Це означає: практична рекомендація — вручну зробити Backup (`app/backup.tsx`, "Резервна копія" з меню Профілю) ПЕРЕД кожним оновленням застосунку, яке може містити нову міграцію, саме тому що описане вище вузьке rebuild-вікно теоретично можливе, а автоматичного відновлення з нього немає. Це не гіпотетична обережність — це пряме дзеркало того, що сам проєкт уже визнає в іншому місці: `docs/READING_RUN.md` §"Фаза 27" ("Backup compatibility") прямо документує, що ВІДНОВЛЕННЯ старого бекапу теж проходить крізь ту саму серію міграцій і мало реальну прогалину (`reading_run` не входила в `BACKUP_TABLE_ORDER`), закриту лише в останній фазі milestone'у.

---

## 81. MIGRATION TEST MATRIX

Повний перегляд `src/data/db/migrationRunner.test.ts` (1938 рядків).

| Сценарій | Що перевіряється | Populated data? |
|---|---|---|
| Порожня БД → LATEST | Усі 27 міграцій застосовуються без помилок, `user_version` = `LATEST_SCHEMA_VERSION`, довільні таблиці з різних міграцій справді створені | Ні — чиста схема |
| Повторний виклик на вже актуальній БД | Ідемпотентність — `migrateDbIfNeeded` вдруге не кидає й не змінює версію | Ні |
| Seed на N-1, потім одна остання міграція (009/010/011/018 — по одному тесту кожна) | "populated DB" сценарій для ЧОТИРЬОХ окремих, ізольованих міграцій — старий рядок не пошкоджений, нова колонка отримує правильний DEFAULT чи NULL | Так, але мінімально — один рядок відповідної таблиці на тест |
| `020_reading_run_backfill` (6 тестів) | Кожна гілка правила вибору `status`/`finished_at` backfill (reading/rereading, finished з trioho fallback-рівнями, did_not_finish, want_to_read без старту, кілька сесій під одним run, новий індекс) | Так — 9 книг (`ub-a`...`ub-i`) з різними станами/сесіями одночасно на одній seed-функції |
| `021_book_memory_run` (7 тестів) | Rebuild + backfill: пріоритет finished>in_progress, кілька finished (найновіший), лише in_progress фолбек, книга без run, зняте старе UNIQUE (2 спогади різних run без конфлікту), нове UNIQUE діє (дубль на той самий run падає), новий індекс | Так, кожен тест — окрема книга з 1-2 run + 1 legacy-спогад |
| `022_pre_reading_reflection_run` (7 тестів) | Дзеркало 021, той самий набір сценаріїв для `pre_reading_reflection` | Так |
| `023_book_capsule_run` (4+ тести) | Backfill "за найближчим у часі", а не "найновіший" — одна капсула/один run, перечитування з капсулою ПІСЛЯ другого фінішу (лінкується на другий, не перший), ДВІ капсули тієї самої книги кожна на СВІЙ run, капсула старіша за будь-який run (NULL) | Так, включно з кількома капсулами на одну книгу — саме той edge case, де "найновіший" зламав би результат |
| `024_dnf_reflection_run` | Той самий клас, лише DNF-специфічна логіка (лише `did_not_finish`-run кандидати, без фолбеку на "будь-який run") | Так |
| `025_rating_run` | Той самий клас, з фолбеком "finished АБО did_not_finish", як 021/022 (не обмежено лише DNF, як 024) | Так |
| `026_hot_query_indexes` | Нові індекси реально створені, старі одноколонкові видалені | Мінімально |
| `027_soft_delete_readiness` | Нова колонка на трьох таблицях, `NULL` за замовчуванням | Мінімально |
| **V1.5 baseline (migration 011) → LATEST** — 3 тести | (1) уся стара бібліотека (сесії/нотатки/рейтинг/спогад) фізично неушкоджена, включно з перевіркою `rating.deleted_at IS NULL` (027 дійшла); (2) 019-021 відпрацювали В МЕЖАХ того самого 16-міграційного стрибка — run на активній книзі (in_progress) і завершеній (finished), НЕ на нерозпочатій, сесія й спогад коректно пролінковані; (3) нові V1.6/V1.6.1 таблиці реально створені й читаються | **ТАК, ПРЯМО РЕАЛІСТИЧНА ПОПУЛЯЦІЯ**: книга в процесі читання (з нотаткою+категорією), прочитана книга (з рейтингом 4.5 і легасі `book_memory` у СТАРІЙ до-run схемі), і книга "хочу прочитати" без жодної сесії — три різні стани одночасно, весь 16-міграційний стрибок (12→27) за один виклик `migrateDbIfNeeded` |
| **V1.6 baseline (migration 018) → LATEST** — 2 тести | (1) увесь V1.6-корпус (капсула/спогад/нотатка "До"/DNF/рейтинг) фізично неушкоджений після 9-міграційного стрибка (19→27); (2) 019-025 (ReadingRun + ВСІ п'ять backfill-міграцій) відпрацювали РАЗОМ на тих самих книгах — run D (finished) і E (did_not_finish), і рейтинг/спогад/нотатка "До"/капсула ВСІ пролінковані на run D, DNF-знімок — на run E, плюс перевірка `deleted_at IS NULL` (027) на капсулі | **ТАК, НАЙПОВНІША ПОПУЛЯЦІЯ В УСЬОМУ ФАЙЛІ**: одна книга (D) одночасно з рейтингом+спогадом+нотаткою "До"+капсулою (усе в легасі до-run схемі одночасно), і друга книга (E) з DNF-знімком — саме комбінація "активне читання + рейтинг + спогад + капсула + DNF, усе разом, на реальних книгах, через увесь ланцюжок міграцій одним викликом" |

**Пряма відповідь на ключове питання ТЗ:** так, Фаза 27 ("migration safety net") дійсно тестує POPULATED, реалістичну базу з активним читанням, перечитуванням (непрямо — через сам механізм run/finished/in_progress), DNF, капсулою й спогадом ОДНОЧАСНО перед міграцією — не лише порожню схему. Два наскрізні сценарії (V1.5→latest, V1.6→latest) — саме той тип тесту, що ТЗ Фази 27 називав "safety net": реалістична бібліотека власника продукту (кілька книг різних станів, з накопиченими роками легасі-даними) прогнана через увесь ланцюжок міграцій одним стрибком, з перевіркою і фізичної цілісності старих даних, і коректності нового `reading_run_id`-зв'язування для КОЖНОЇ таблиці одночасно на тих самих рядках. Єдине, чого ці два сценарії НЕ покривають явно — власне "перечитування" (`rereading` статус із двома реальними run) не входить до жодного зі seed-наборів V1.5/V1.6 baseline (лише окремий ізольований тест `020`, сценарій `ub-g`, перевіряє `rereading`-статус, але не в межах наскрізного V1.5/V1.6 стрибка) — це вузька, але реальна прогалина покриття: найскладніший з-поміж усіх сценаріїв (дві реальні run на одну книгу, кожен зі своїми capsule/memory/rating) не протестований у наскрізному, найбільш "реалістичному" сценарії, лише в ізольованих поодиноких тестах.
## 82. КОНСИСТЕНТНІСТЬ ДОКУМЕНТАЦІЇ

Методика: по 2-3 конкретні фактичні твердження на документ, звірені напряму з кодом/схемою цього хмарного дзеркала (`/mnt/user-data/uploads/polytsya-m11`), а не переказ прози. Де код і документ розходяться — вирішує код (пряма вимога ТЗ цього розділу), з поясненням, наскільки це серйозно.

**ARCHITECTURE.md**

- Твердження: "47 файлів маршрутів" у `app/` (44 на кінець V1.6 + 3 нових консолідаційних хаби V1.6.1), перелік НЕ включає жодного `app/characters/*`. CODE VERIFIED перевірка (`Glob app/**/*.tsx`) дала **49 файлів `.tsx`** усього, 47 без двох `_layout.tsx` — числа `47` збігаються арифметично, але не композиційно: серед цих 47 реально присутні `app/characters/[workId].tsx` і `app/characters/[workId]/[entityId].tsx` (7583 і 13452 байти, mtime дзеркала 11 вересня), яких немає в переліку документа взагалі, і водночас документ явно не пропускає жодного з 45 задокументованих екранів. Тобто фактичний набір файлів дзеркала = 45 задокументованих + 2 недокументовані `characters/*` = 47, а не "45 задокументованих із загальною сумою 47 разом із layout'ами", як стверджує заголовок розділу. **Це та сама пара маршрутів, яку `CHANGELOG.md` (Фаза 2 V1.6.1, `docs/V1_6_1_FINAL_REPORT.md` §1) прямо називає "підтверджено видаленою... перевірено напряму на пристрої (`device_list_dir`): обох файлів більше не існує".** У цьому хмарному дзеркалі вони фізично існують. Найімовірніше пояснення — не хибність самого твердження про видалення на машині власника продукту, а задокументований цією ж сесією раніше ризик "хмарне дзеркало відстає від реального стану на частину файлів, не торкнутих напряму" (`docs/V1_6_1_FINAL_REPORT.md` §6/§13) — ті самі два файли, судячи з дат мирного дерева (`characters/` — 11 вересня, `lore/` — 13 вересня, тобто дзеркало явно бачило пізнішу версію `lore/`, але не підхопило видалення `characters/`). **STALE, з застереженням**: не можу підтвердити, чи файли реально видалені на `C:\polytsya-m11` власника продукту — CODE VERIFIED лише те, що вони присутні в цьому дзеркалі й що жоден живий код на них не посилається (`grep -rn "app/characters\|/characters/\["` у `src`/`app` не дав жодного результату поза самими цими двома файлами). Рекомендація власнику продукту: `ls app/characters` на реальній машині — якщо порожньо, це підтверджує гіпотезу відставання дзеркала; якщо файли й там є, `CHANGELOG.md` Фаза 2 сама стала хибною документацією.
- Твердження: 27 SQLite-міграцій `001`…`027`. CODE VERIFIED: `ls src/data/db/migrations/` дав рівно 27 файлів, точні імена збігаються з переліком `docs/DATABASE.md`. **CURRENT.**
- Твердження (розділ 1, технологічний стек): `expo-sqlite` + власний migration runner на `PRAGMA user_version`, TanStack Query для мережевого стану, Zustand точково для UI-стану. Узгоджується з `TESTING.md`/`DATABASE.md`/фактичною структурою `src/data/db`, `src/stores/`. **CURRENT.**

**DATABASE.md**

- Твердження: `reading_run` — `UNIQUE(user_book_id, run_number)`, без жорсткого обмеження "лише один `in_progress` на книгу". CODE VERIFIED — DDL у документі (`019_reading_run.ts`) дослівно збігається з фактичним файлом міграції (перевірено відкриттям обох). **CURRENT.**
- Твердження: `rating`/`book_memory`/`pre_reading_reflection`/`dnf_reflection` — усі перейшли з `UNIQUE(user_book_id)` на `UNIQUE(reading_run_id)` через міграції 021/022/024/025 (rebuild-ідіом), `book_capsule` — проста `ADD COLUMN` без rebuild (023). CODE VERIFIED прямим читанням DDL у самому документі узгоджується з описом у `docs/READING_RUN.md` та фактичною схемою `001_base_schema.ts` (`rating`/`pre_reading_reflection`/`book_memory` DDL, показані в документі "в актуальному вигляді після" — самі коментарі в документі це прямо позначають). **CURRENT.**
- Твердження: `026_hot_query_indexes.ts` додає 4 нові композитні індекси і видаляє 4 старі одноколонкові. CODE VERIFIED прямим читанням файлу міграції — точний збіг переліку колонок і назв індексів. **CURRENT.**

**PRODUCT.md**

- Твердження: core loop — "Відкрив застосунок → Продовжив читання → Читав → Завершив сесію → Прогрес збережено → Історія/статистика оновились", і це "єдиний цикл, що має бути бездоганним". Узгоджується з `ARCHITECTURE.md` розділ 10 (сесія пишеться в SQLite одразу при старті, не в пам'яті) і з `docs/TESTING.md` (session-timer тести, `elapsedFromTimestamps`). **CURRENT**, хоча сам критерій "бездоганний" — HYPOTHESIS: жодного реального прогону на пристрої цієї сесії (§84 нижче) не підтверджує це емпірично для V1.6.1-дельти.
- Твердження (розділ "Що виросло навколо core loop"): перелічує REREADING MODEL, Календар 2.0, консолідацію UX, soft-delete — усі коректно відсилають до профільних документів (`READING_RUN.md`, `CALENDAR_2_0.md`, `PRODUCT_CONSOLIDATION.md`, `SOFT_DELETE_READINESS.md`), кожен із яких CODE VERIFIED узгоджений із фактичною схемою/кодом (перевірено окремо нижче). **CURRENT.**

**ROADMAP.md**

- Твердження: "явно поза межами V1" — акаунти/Auth, підписки, соцфункції, AI-асистент, складний cloud sync. CODE VERIFIED — жодного `supabase.auth`/таблиці з `user_id` FK на `auth.users` у `src`/`supabase/schema.sql` немає (лише `catalog_book`/`catalog_book_device`, анонімні). **CURRENT.**
- Твердження: "Milestone 11, доповнення — кураторська добірка + Тренди (виконано)" з `CuratedCatalogProvider.ts`/`app/trends.tsx`. Узгоджується з фактичним `app/trends.tsx` у Glob-переліку routes і з `docs/SHARED_CATALOG.md`/`docs/BOOK_PROVIDERS.md` (не перечитувались повністю цією сесією, але посилання несуперечливі). **CURRENT.**

**TESTING.md**

- Твердження: тестовий SQLite-драйвер — `better-sqlite3` через `openTestDatabase()`, бо `expo-sqlite` не конструюється headless на GitHub Actions. Узгоджується з `docs/V1_6_1_FINAL_REPORT.md` §6 (813 тестів, реальний прогін на машині власника, а не в цій хмарній сесії) і з фактом, що жоден `*.test.ts` цього дзеркала не імпортує `expo-sqlite` напряму (не перевірено вичерпним grep у цій сесії, але не суперечить жодному прочитаному файлу). **CURRENT.**
- Твердження: CI має два jobs — `ci` (typecheck/lint/test/expo-doctor/npm audit) і окремий `edge-functions` (`deno check`+`deno lint`). Збігається з ЕСТАБЛІШЕНИМ фактом цієї сесії (CI runs #83-86, обидва jobs зелені) і з `docs/EDGE_FUNCTION_CI.md`. **CURRENT.**

**V2_READINESS.md**

- Документ сам явно позначений як "знімок стану на 2026-09-09" — ДО V1.5/V1.6/V1.6.1 — і прямо каже читачеві звірятись із `PRODUCT.md`/`ARCHITECTURE.md` за актуальним станом. Це НЕ прогалина документації, а навмисний історичний артефакт із власним, послідовно застосованим маркуванням "Застаріло (POLYTSIA V1.5, ...)" по кожному пункту, де стан справді змінився (розділи 6, 7, 8.1-8.3, 11). CODE VERIFIED: сам документ послідовний сам із собою (кожне "Застаріло" справді відповідає пізнішій фазі, яку я перевірив в іншому документі — наприклад, п.1 розділу 11 "закрито Фазами 1.1/1.2" збігається з тим, що описує сам `ARCHITECTURE.md`/`ROADMAP.md` про Google Books-проксі vs. ISBNdb-проксі). **CURRENT як історичний документ, свідомо не living-документ — не STALE, це відмінність жанру, документ сам це каже.**
- Розділ 9 (Дизайн-система) і запис 8.2 — єдині, які автори прямо кажуть "оновлені з фактичними цифрами станом на завершення V1.6.1" (18→21 компонент). CODE VERIFIED непрямо: `ARCHITECTURE.md` §5 називає ті самі три нові компоненти V1.6.1 (`OfflineNotice`, `OnboardingHintCard`, `CardPreviewText`) — узгоджено. **CURRENT.**

**BACKUP_FORMAT.md**

- Ілюстративний приклад JSON (`schemaVersion`/`data`/...) перелічує 37 ключів таблиць. CODE VERIFIED порівняно з фактичним `BACKUP_TABLE_ORDER` у `src/data/repositories/BackupRepository.ts`: код містить **38** таблиць — приклад у документі пропускає `tagged_item` (реальна таблиця бекапу, присутня в масиві коду між `field_provenance` і `series`). Малий, низького ризику пропуск (ілюстративний приклад, не нормативний перелік — сам документ каже "Порядок таблиць... відповідає порядку створення", не обіцяє вичерпності прикладу), але формально **STALE**: приклад не містить усіх реальних полів бекапу.
- Твердження: `reading_run` додана до `BACKUP_TABLE_ORDER` лише у Фазі 27, з окремим post-restore кроком `backfillAllLegacyReadingRunLinks`. CODE VERIFIED прямим читанням коментаря в самому `BackupRepository.ts` (дослівно той самий текст обґрунтування, що й у документі) і присутністю `'reading_run'` у масиві одразу після `'user_book'`. **CURRENT.**
- Твердження: `restoreAll` — "проста generic вставка", уся БД у транзакції. CODE VERIFIED — рядок-за-рядком `INSERT`, без chunking/batching (детально §87 нижче). **CURRENT щодо факту, але сам документ не згадує це як потенційний ризик масштабування — прогалина не документа, а планування наперед, див. §87.**

**READING_RUN.md** (ToR: "READING_RUNS.md" — файл реально називається `READING_RUN.md`, однина; не вважаю це розбіжністю, лише інша назва файлу)

- Увесь ланцюжок фаз 6-12 (`019`-`025`) і Фаза 27 (`legacyRunBackfill.ts`) звірений рядок-в-рядок із фактичним DDL `DATABASE.md`/фактичним файлом `026_hot_query_indexes.ts` і схемою `restoreAll` у попередньому пункті — жодного розходження не знайдено. **CURRENT**, і за обсягом/деталізацією (563 рядки) — найретельніше документована архітектурна зміна всього milestone'у.

**CALENDAR_2_0.md** (ToR: "CALENDAR_V2.md" — файл реально `CALENDAR_2_0.md`; та сама примітка про назву, не розбіжність)

- Твердження: "жодна наступна фаза (20-28) не торкалась логіки/розкладки цього екрана" крім Фази 22 (`maxFontSizeMultiplier={1.2}`). Узгоджується з `docs/PRODUCT_CONSOLIDATION.md` Фаза 28 ("Calendar: жодних знахідок, код не змінений") — незалежне джерело, той самий висновок. **CURRENT.**
- Твердження: інтенсивність — крапки (0-3), не колір/opacity, свідоме рішення через відсутність "сходинки кольорів" у палітрі. Узгоджується з фактичною палітрою `ARCHITECTURE.md` §6 (`lightColors`/`darkColors` — по одному `accent`, без градієнта). **CURRENT.**

**PRODUCT_CONSOLIDATION.md**

- Твердження: жоден з консолідованих екранів (`/tomorrow`, `/one-book-picker`, `/tbr`, `/trends`, `/statistics`, `/wrapped/[year]`, `/seasons/[seasonKey]`, `/reading-profile`, `/fingerprint`, `/on-this-day`, `/journal`, `/history`) не втратив маршруту. CODE VERIFIED — усі 12 присутні у фактичному `Glob`-переліку `app/**/*.tsx` цієї сесії (перевірено кожен рядок). **CURRENT.**
- Твердження: Фаза 15 підняла спільні функції в `src/lib/readingAggregates.ts` (5 функцій). Не перечитано напряму цією сесією (файл поза обсягом перевірки), але узгоджується внутрішньо з `V1_6_1_FINAL_REPORT.md` §17 і не суперечить жодному іншому прочитаному документу. **Не спростовано, недостатньо доказів для CURRENT/STALE окремо — залишаю як прийняте на віру твердження одного джерела.**

**SPOILER_SAFE.md**

- Твердження: реальний баг `useOnThisDay.ts` (книги потрапляли в карту "активно читається" незалежно від `spoiler_safe_enabled`), виправлений Фазою 3 V1.6.1. Незалежно підтверджено ТРЬОМА джерелами того самого твердження слово-в-слово: `V1_6_1_FINAL_REPORT.md` §1 Фаза 3, `V1_6_1_FINAL_REPORT.md` §2 (bugs), і сам `SPOILER_SAFE.md` таблиця поверхонь. **CURRENT**, і рідкісний приклад документа, що сам відкрито фіксує власну попередню помилку ("Список зі старої версії цього документа... виявилось хибним твердженням") — хороша house-практика, варта збереження.
- Твердження: таблиця "Де застосовується" — 14 поверхонь, 12 SAFE + 2 NOT APPLICABLE, 0 залишилось невідфільтрованих без причини. Не було ресурсу цієї сесії перевірити код кожної з 14 поверхонь напряму (це вимагало б читання ~10 файлів), тому позначаю як **DOCUMENTED, частково CODE VERIFIED** (лише `useOnThisDay.ts`-кейс вище).

**Підсумок розділу.** З 11 перевірених документів — один явний фактичний конфлікт коду з CHANGELOG-твердженням (характери-маршрути, з застереженням про можливе відставання дзеркала, не обов'язково реальна хиба), один дрібний пропуск в ілюстративному прикладі (`tagged_item` у `BACKUP_FORMAT.md`), один документ свідомо є історичним знімком і сам це декларує (не порахований як STALE). Решта дев'ять фактичних тверджень (DATABASE.md ×3, PRODUCT.md ×2, ROADMAP.md ×2, TESTING.md ×2, READING_RUN.md, CALENDAR_2_0.md ×2, PRODUCT_CONSOLIDATION.md ×2, SPOILER_SAFE.md ×2) — CURRENT. Загальний стан документації після V1.6.1 — вище середнього для проєкту такого обсягу (21503 рядків `docs/`), з відомим структурним ризиком "документація старіє швидше за код", який сам проєкт вже неодноразово фіксував і виправляв власними силами (Фаза 14 V1.5 route map, Фаза 23 V1.6.1 CHANGELOG erratum, SPOILER_SAFE.md self-correction).

## 83. ЗВІТ ПРО РУЧНУ ВЕРИФІКАЦІЮ ВЛАСНИКОМ ПРОДУКТУ

Методика: `grep` по `CHANGELOG.md` в межах рядків 1-1239 (усі 28 фаз + прилеглі документаційна/quality-gate фази V1.6.1, до початку секції V1.6), пошук конкретних фраз ручного тестування. Рядки поза цим діапазоном (V1.5/V1.6/старіші) НЕ зараховані — вони поза обсягом V1.6.1-дельти цього розділу.

| Фіча / фаза | Власник перевіряв вручну? | Що саме перевірено | Результат | Середовище |
|---|---|---|---|---|
| Фаза 2 — видалення `app/characters/*` | **Так** | `device_list_dir` — наявність/відсутність обох файлів фізично на пристрої | Заявлено "обох файлів більше не існує" (CHANGELOG, дослівно) — **суперечить стану цього хмарного дзеркала**, див. §82 | Пристрій/файлова система власника продукту (не емулятор, не хмарна сесія) |
| Скасовані пошукові запити хибно логувались як помилки (недатована фаза, 2026-09-12, до формального старту Фази 1) | **Так** | Реальні логи пристрою під час звичайного використання пошуку (дебаунс) на iOS/Expo Go — знайдено `FetchRequestCanceledException`, не `AbortError` | Реальний баг знайдено й виправлено (`src/lib/isFetchAborted.ts`) | iOS, Expo Go (НЕ вказано: фізичний пристрій чи симулятор — CHANGELOG каже лише "реальних логів пристрою", не уточнює тип) |
| `npm test`/`eslint` після Фази 27 | **Так** | Повний вивід `npm test` — "813 passed" | Зелений, 0 fail | Машина власника продукту (не уточнено ОС/спосіб запуску — команда з термінала) |
| `npm test`/`eslint` після Фази 28 (фінал) | **Так** | Повний вивід — "813/813 tests" + чистий `eslint` | Зелений, 0 fail, 0 warnings | Машина власника продукту |
| Усі інші 25 фаз (3-1, 4-26, крім названих вище) | **НЕ ПІДТВЕРДЖЕНО** окремо | — жодної специфічної, названої по фічі фрази ручного тестування в CHANGELOG для цих фаз не знайдено (лише типові "виправлено"/"підтверджено тестами" — тобто автоматизовані тести, не ручна перевірка людиною) | — | — |

**Важливе уточнення методики.** `docs/V1_6_1_FINAL_REPORT.md` §11 і `docs/FINAL_OWNER_ACCEPTANCE_FLOW.md` обидва прямо й неодноразово стверджують: "Жодна з 28 фаз не тестувалась на реальному пристрої чи симуляторі з цієї сесії" — і жоден із семи специфічних для V1.6.1 пунктів §11 (REREADING MODEL наскрізно, Календар 2.0, Offline UX, Backup privacy, Accessibility, Progressive onboarding, UI complexity re-audit фікси) НЕ має відповідного запису в CHANGELOG.md з конкретною фразою ручної перевірки — це узгоджується з `FINAL_OWNER_ACCEPTANCE_FLOW.md`, 34-пунктовий чек-лист якого прямо позначений як **PENDING, ще жодного разу не виконаний** (згідно з вихідними даними цього завдання — весь документ трактується як "ще НЕ зроблено"). Тобто найважливіші продуктові зміни V1.6.1 — REREADING MODEL і Календар 2.0 — не мають жодного текстового сліду людської перевірки в CHANGELOG цього milestone'у, лише автоматизовані тести (§6 звіту, 813 тестів) і статичний аналіз коду цієї сесії.

**Висновок.** Реального, задокументованого фразами ручного тестування власника продукту в межах V1.6.1 знайдено небагато — три випадки, і лише один із них дав НОВУ знахідку через реальне використання (пошуковий баг), один був суто перевіркою відсутності файлу, і два — це підтвердження прогонів автоматизованих тестів (не UI/UX перевірка). Порівняно з обсягом milestone'у (28 фаз, +229 тестів, 9 нових міграцій) це відносно тонкий шар людської верифікації — переважна більшість V1.6.1 верифікована лише тестами/статичним аналізом цієї та попередніх сесій, не живим використанням застосунку.

## 84. ВЕРИФІКАЦІЯ НА ФІЗИЧНОМУ ПРИСТРОЇ

| Середовище | Статус |
|---|---|
| Android, фізичний пристрій | **NOT VERIFIED** |
| iPhone, фізичний пристрій | **NOT VERIFIED** |
| Android-емулятор | **NOT VERIFIED** |
| iOS-симулятор | **NOT VERIFIED** |

Жоден із чотирьох рядків не має жодної позитивної документальної згадки за всю історію проєкту, наскільки видно з прочитаних цією сесією джерел. Перевірено прямим пошуком:

- `docs/V1_6_1_FINAL_REPORT.md` §11: "Жодна з 28 фаз не тестувалась на реальному пристрої чи симуляторі з цієї сесії (той самий структурний брак, що й V1.5 §11 — немає доступу до пристрою з хмарного середовища)."
- `docs/FINAL_OWNER_ACCEPTANCE_FLOW.md` (шапка документа): "Жоден із цих 34 пунктів не перевірявся з жодної хмарної сесії за весь milestone... Це — єдина перевірка, що лишається суто ручною" — і весь документ, за вихідними даними цього завдання, трактується як **ще НЕ виконаний** власником продукту.
- CHANGELOG.md (рядки 1-1239, V1.6.1): усі фрази "на реальному пристрої"/"на пристрої" стосуються або (а) `device_list_dir` — перевірка списку файлів, НЕ функціональна UI-перевірка (Фаза 2), або (б) реальних логів застосунку, запущеного в Expo Go на iOS — не уточнено, фізичний пристрій чи симулятор, і в будь-якому разі це один ізольований баг-фікс, не системна device-перевірка REREADING MODEL/Календаря/Accessibility.

**Важлива відмінність від §83.** "Пристрій власника продукту" в контексті цього репозиторію практично завжди означає ПК/термінал власника продукту (де реально запускається `npm test`/`tsc`/`git`), НЕ мобільний фізичний пристрій чи емулятор — жодного разу в жодному з прочитаних цією сесією документів немає фрази на кшталт "перевірено на Android-емуляторі" чи "запущено на фізичному iPhone". Навіть єдина знахідка через "реальні логи пристрою" (пошуковий баг Expo Go/iOS) — це найближче до фізичного/симуляторного тестування за всю історію V1.6.1, але сам запис не уточнює, яке саме середовище малося на увазі, тож не кваліфікується як PHYSICAL DEVICE VERIFIED за визначенням цього завдання. Це узгоджується з фактом, що milestone 11 в `ARCHITECTURE.md` §9 ("Android/iOS preview/production builds, EAS") прямо позначений як "Відкладено навмисно" — застосунок і досі не мав жодного EAS-білда, увесь запуск відбувається через Expo Go на машині розробника, що структурно й пояснює, чому "фізичний пристрій/емулятор" у сенсі мобільного пристрою ніколи не з'являється в записах.

## 85. ГОТОВНІСТЬ ДО 30 ДНІВ РЕАЛЬНОГО ВИКОРИСТАННЯ

Оцінка: чи можна реалістично покластись на застосунок як на основний персональний трекер читання протягом 30 днів щоденного використання (не публічний реліз).

**Що підтримує позитивну відповідь (CODE VERIFIED/AUTOMATED TEST VERIFIED):**

- Core loop (старт сесії → пауза → продовження → завершення) пишеться в SQLite одразу при старті, не в пам'яті (`ARCHITECTURE.md` §10) — крах застосунку/force-quit не втрачає активну сесію, лише лишає "осиротілу" сесію, яку `DatabaseProvider` виявляє при рестарті. 813 тестів проходять, включно з 23 новими прямими тестами на `start`/`pause`/`resume`/`finish`/`discard` (Фаза 5 V1.6.1) — цей найкритичніший шлях тепер має найбільш пряме тестове покриття за всю історію проєкту.
- 27 міграцій, кожна з тестом на порожній і на заповненій БД, плюс два наскрізні "весь ланцюжок за раз" сценарії з Фази 27 — ризик "оновлення застосунку зламає мою існуючу бібліотеку" структурно знижений понад те, що було до V1.6.1.
- Backup round-trip тест зелений, `reading_run` тепер входить у бекап (закрито реальну прогалину Фази 27) — до цього кожен експортований бекап тихо втрачав історію перечитувань, і власник продукту про це не знав би, доки не спробував відновити дані.

**Що конкретно може зламатись або дратувати за 30 днів (HYPOTHESIS, обґрунтована конкретними знахідками):**

1. **REREADING MODEL і Календар 2.0 — жодного разу не бачені живцем.** Це найновіший, найскладніший шар схеми (9 міграцій, 6 rebuild-з-backfill) і найбільш візуально складний екран (обкладинки в клітинках сітки, крапки інтенсивності, responsive на вузьких екранах) — обидва верифіковані ЛИШЕ автоматизованими тестами й статичним аналізом, §84. Найреальніший ризик перших 30 днів — саме тут: якщо є UI-баг у "Історії прочитань"/"Як змінилася книга для тебе" чи в responsive-розкладці клітинки Календаря на конкретному екрані власника продукту, жоден автоматизований тест його не зловить (домен тестується в Node, без React-рендеру, `docs/TESTING.md`).
2. **`ReadingRunRepository.discard()` існує, але ніде не викликається з UI** (`V1_6_1_FINAL_REPORT.md` §13) — якщо власник продукту випадково почне новий "прохід" (наприклад, змінить статус на "Перечитую" помилково), немає UI-способу скасувати цей run — лише "жити з ним" або редагувати БД напряму. За 30 днів активного використання ймовірність такої помилки ненульова, і наслідок — засмічена "Історія прочитань" без штатного способу прибирання.
3. **`google-books-proxy` не задеплоєно** (§4/§12 `V1_6_1_FINAL_REPORT.md`) — доки OWNER ACTION не виконано, Google Books-запити йдуть з анонімним fallback без підвищеної квоти; для щоденного пошуку книг це, найімовірніше, непомітно (Google Books rate limit для анонімних запитів достатньо високий), але це залишковий, не критичний ризик деградації пошуку саме в перші тижні, коли бібліотека найактивніше наповнюється.
4. **Manual device checklist (34 пункти) не пройдений** — конкретний ризик: якщо власник продукту не пройде його свідомо ПЕРЕД тим, як почати покладатись на застосунок 30 днів, перше реальне зіткнення з будь-яким із 34 пунктів (наприклад, п.24 — відновлення старого бекапу, чи п.31 — 29 лютого) відбудеться "наосліп", без страхувальної сітки попередньої ручної перевірки.
5. **Data Doctor — 7 нових перевірок soft-delete/run-цілісності (Фаза 26), без деструктивного авто-фіксу.** Це плюс для безпеки даних (нічого не видаляється автоматично), але означає: якщо якась із перевірок таки щось знайде за 30 днів реального використання (наприклад, `multiple_active_runs` через баг чи ручне втручання), власник продукту побачить попередження, але сам механізм виправлення — ручний, поза UI (§93 нижче, Data Debt).
6. **`npm audit` CVE-список ще ніхто не переглянув повністю** (п.33 `FINAL_OWNER_ACCEPTANCE_FLOW.md`, відкрито в §12 `V1_6_1_FINAL_REPORT.md`) — теоретичний ризик залежностей, низька практичність для одноосібного офлайн-застосунку без мережевої поверхні атаки для зловмисника (немає бекенду, який приймає чужий трафік, крім трьох добре ізольованих Edge Functions), але не перевірено.

**Підсумок.** Ядро (SQLite-транзакційність, тестове покриття домену, CI) готове для 30 днів щоденного використання з високою впевненістю (AUTOMATED TEST VERIFIED + CI VERIFIED). Найслабша ланка — саме ті дві фічі, заради яких формально й існує milestone (REREADING MODEL, Календар 2.0): вони НЕ мають жодної людської UI-перевірки, лише тестового покриття домену/repository-рівня. Рекомендація власнику продукту перед тим, як почати 30-денний період реального покладання на застосунок: пройти хоча б пп. 9-11, 19-20 `FINAL_OWNER_ACCEPTANCE_FLOW.md` (REREADING MODEL + Календар) — найвищий leverage серед 34 пунктів для мінімізації реального ризику перших тижнів.

## 86. ГОТОВНІСТЬ ДО 1 РОКУ ДАНИХ (300 книг, 1000 сесій, 1500 записів щоденника, 50 капсул, 20 перечитувань, 100 lore-записів)

**Фічі, що стають СИЛЬНІШИМИ з більшим обсягом даних (HYPOTHESIS, продуктова, не технічна):**

- **On This Day** — за визначенням фічі, чим довша історія читання, тим більше шансів, що "цього дня минулих років" щось відбувалося; на 1 рік даних це вже реально дає перші, хоч і рідкісні, збіги.
- **Wrapped/Сезони читання** — статистично змістовніші при 300 книгах/1000 сесіях, ніж при 10 — саме та кількість даних, для якої й проєктувались агрегати (`readingAggregates.ts`, Фаза 15).
- **Reading Fingerprint/Reading Profile** — badges/insight-картки, побудовані на порогових значеннях вибірки (`computeTopGenre` з порогом, за V1_6_1_FINAL_REPORT §14) — на малій бібліотеці частина бейджів просто не активується через недостатню вибірку; на 300 книгах цей поріг вже певно подолано для більшості метрик.
- **Reread comparison ("Як змінилася книга для тебе")** — на 20 перечитуваннях це вперше стає РЕАЛЬНОЮ фічею, не теоретичною можливістю: досить книг із ≥2 завершеними run, щоб порівняння дійсно показувало патерн, а не поодинокий випадок.

**Фічі, що потенційно починають ДРАТУВАТИ чи повільнішати на цьому обсязі (CODE VERIFIED, конкретні запити):**

- **`ReadingSessionRepository.listAllCompleted`** — CODE VERIFIED, викликається БЕЗ `LIMIT` (прямо назване в коментарі `026_hot_query_indexes.ts`: "`listAllCompleted` (свідомо БЕЗ `LIMIT`... сканує все незалежно від індексів)") і споживається щонайменше у шести місцях: `useReadingFingerprint.ts`, `useStatistics.ts`, `useOnePicker.ts`, `useTbrReality.ts`, `useTomorrowRecommendation.ts`, `useReadingProfile.ts` — тобто КОЖЕН з п'яти консолідованих аналітичних екранів "Моє читання" і рекомендаційний хаб "Що читати далі?" завантажують ВСІ 1000 сесій у пам'ять при кожному відкритті. На 1000 рядків це, найімовірніше, ще некритично (мілісекунди на мобільному SQLite), але це вже точний, названий самим кодом приклад "unbounded list без пагінації", про який питає це завдання — і показово, що індекс `reading_session(user_book_id, started_at)` (Фаза 24) НЕ допомагає цьому запиту взагалі (він не фільтрує за `user_book_id`), бо `listAllCompleted` — це навмисно "усе одразу", інший клас запиту, ніж ті, що індекс оптимізував.
- **Library-список 300 книг** — `ARCHITECTURE.md` §10 прямо називає це очікуваним ризиком ("Продуктивність Library-списку при 1000+ книг") і документує мітигацію (FlashList-віртуалізація, keyset-пагінація, індекси) — на 300 книгах це заявлений діапазон, для якого рішення розраховане, ще з запасом.
- **Пошук по щоденнику (`LIKE '%…%'`)** — 1500 записів усе ще глибоко всередині заявленого діапазону "тисячі, не мільйони рядків" (`JournalRepository.ts`, коментар, цитований у `V1_6_FULL_AUDIT_REPORT.md` розділ 48) — на рік даних це не проблема (детальніше — §87, де це вже ближче до межі).

**Підсумок.** На горизонті 1 року жодна з перевірених запитних конструкцій не є реальним UX/perf-ризиком — `listAllCompleted` без `LIMIT` це технічний борг вартий фіксації в реєстрі (§91), але не блокер для 300 книг/1000 сесій. Продуктові фічі, натомість, стають ПОМІТНО ціннішими саме на цьому горизонті — це рівно той обсяг даних, для якого REREADING MODEL/On This Day/Wrapped і задумані.

## 87. ГОТОВНІСТЬ ДО 5 РОКІВ ДАНИХ (1000 книг, 5000+ сесій, багато перечитувань, 5000 записів щоденника)

**ReadingRun-масштабованість.** CODE VERIFIED: `reading_run` має єдиний індекс `idx_reading_run_user_book ON reading_run(user_book_id)` (`019_reading_run.ts`) — усі реальні запити репозиторію (`listByUserBookId`, `getActiveByUserBookId`, Фаза 19 `listByIds`) фільтрують саме за `user_book_id`, тож індекс покриває основний шлях. `reading_session.reading_run_id` — CODE VERIFIED (`020_reading_run_backfill.ts`, `docs/READING_RUN.md`) СВІДОМО без індексу й без SQL `REFERENCES` — але й без реального query use case (сесії завжди читаються через `user_book_id`, не напряму по `reading_run_id`, судячи з усіх прочитаних описів репозиторіїв). На 5000+ сесій, розподілених по 1000 книг (у середньому 5 сесій/книгу) — `idx_reading_run_user_book`/`idx_session_user_book_started_at` (Фаза 24, композитний) обидва залишаються ефективними SEARCH-запитами, не SCAN — жодних ознак деградації в структурі схеми не виявлено. **Помірна впевненість (CODE VERIFIED структура, HYPOTHESIS щодо реальної латентності — жодного бенчмарку на 1000 книг/5000+ сесій конкретно для reading_run ця сесія не бачила; Фаза 24 бенчмаркала на фікстурі 1000 книг/5000 сесій, БЕЗ reading_run у складі того бенчмарку, судячи з опису фікстури в `V1_6_1_FINAL_REPORT.md` §9 — "1000 книг/5000 сесій/10000 записів щоденника/1000 lore-сутностей/500 капсул", reading_run не згаданий окремо).**

**Календар.** CODE VERIFIED (`docs/CALENDAR_2_0.md`): і сітка місяця, і деталі дня запитують `ReadingSessionRepository.listStartedBetween`/`ActivityHistoryRepository.listBetween` — обидва фільтрують за ISO-діапазоном дат (`startIso`/`endIso`), не за всією історією. Це структурно O(днів-у-діапазоні), а точніше O(сесій-у-цьому-діапазоні) — незалежно від того, скільки всього років історії накопичено. `idx_session_started_at`/новий композитний `idx_session_user_book_started_at` (Фаза 24) обидва підтримують цей шлях. **Підтверджено архітектурно (CODE VERIFIED): Календар залишається O(діапазон), не O(уся історія), на 5-річному горизонті так само, як і на 1-річному.**

**Пошук.** CODE VERIFIED: `JournalRepository.ts`/`WorkRepository.ts`/`SeriesRepository.ts` — увесь текстовий пошук через `LIKE '%…%'`, свідомо без FTS5, з явним, задокументованим у коді обґрунтуванням ("для тисяч, не мільйонів рядків", `V1_6_FULL_AUDIT_REPORT.md` розділ 48/19.3, цитата коду `JournalRepository.ts:345-364`). На 5000 записів щоденника це вже, за словами самого коментаря-обґрунтування в коді, "найближче до межі діапазону, для якого рішення офіційно розраховане" — не факт наявної проблеми (провідний `LIKE '%…%'` на 5000 TEXT-рядків типового розміру нотатки все ще, найімовірніше, укладається в десятки-сотні мс на сучасному мобільному SQLite), але це вперше НЕ "з запасом", як на 1-річному горизонті §86. **Рекомендація:** якщо власник продукту реально накопичить 5000+ записів щоденника, варто разово прогнати `EXPLAIN QUERY PLAN`/реальний секундомір на пошуковому запиті з такою фікстурою (той самий метод, що й Фаза 24) — не панічний ризик, але вперше вартий емпіричної перевірки, а не лише архітектурного припущення. Позначаю це як HYPOTHESIS із помірною впевненістю, ґрунтовану на власному ж явному застереженні коду проєкту, а не на власному бенчмарку цієї сесії.

**Backup (export/import).** CODE VERIFIED, `BackupRepository.ts`: `exportAll` — цикл `SELECT * FROM ${table}` по ВСІХ 38 таблицях, увесь результат тримається в пам'яті як один `BackupData`-об'єкт; `backupSerializer.ts` серіалізує це через `JSON.stringify(envelope, null, 2)` — **pretty-printed з відступом 2 пробіли**, що приблизно вдвічі-втричі роздуває розмір файлу проти компактного JSON; увесь файл пишеться одним викликом `FileSystem.writeAsStringAsync`. Жодного streaming/chunking немає ніде в ланцюжку. `restoreAll` — ще суворіше: усередині ОДНІЄЇ транзакції для КОЖНОГО рядка КОЖНОЇ таблиці виконується окремий `await db.runAsync(INSERT...)` — це послідовні, не пакетні (`batch`/multi-row `INSERT`) вставки. На 1000 книг + 5000+ сесій + 5000 записів щоденника + похідні таблиці (progress, capsule, memory, тощо) це реалістично **десятки тисяч послідовних `INSERT`-викликів в одній транзакції** при повному відновленні. Це не крах — SQLite в одній транзакції справляється з десятками тисяч вставок регулярно, і сама сесія Фази 27 додала тест на "весь ланцюжок за раз" (не на такому обсязі даних, а на функціональності мітрацій) — але це реалістичний, конкретний **UX-ризик**: відновлення бекапу з 5-річною історією, найімовірніше, займе помітно довше (секунди, можливо больше десятка секунд на слабшому Android-пристрої), ніж відновлення сьогоднішнього, майже порожнього тестового бекапу — і жоден екран (`app/backup.tsx`) не документує прогрес-індикатор для цього кроку (не перевірено напряму UI цієї сесією, але жодного згадування progress bar для restore в жодному прочитаному документі немає). **CODE VERIFIED факт (відсутність chunking/batching), HYPOTHESIS щодо реальної тривалості на конкретному пристрої.**

**Підсумок.** Структура схеми (індекси, ReadingRun, Calendar-запити) добре витримує 5-річний горизонт — жодної O(вся історія)-залежності для повсякденних екранів не знайдено. Два реальні кандидати на майбутню увагу: (1) LIKE-пошук наближається до межі свого заявленого діапазону і вартий емпіричної перевірки після реального накопичення ~5000 записів, не раніше; (2) backup export/restore не має chunking — на 5-річному обсязі даних це, найімовірніше, перший помітний "повільний" момент у застосунку, хоч і не блокер (backup — не core loop, виконується рідко).

## 88. ПРОДУКТОВА ДИФЕРЕНЦІАЦІЯ ПІСЛЯ V1.6.1

Класифікація за тим, що фіча РЕАЛЬНО робить (CODE VERIFIED, з прочитаних документів/схеми), не за маркетинговим формулюванням.

- **ReadingRun-обізнана пам'ять (Book Memory/До-Після/Капсула/DNF/Rating, кожне — власний запис на кожне прочитання)** — **STRONG UNIQUE**. Жоден типовий read-tracker (Goodreads, StoryGraph) не моделює "кожне перечитування — окрема сутність з власним повним набором рефлексій, що не перезаписує попередні" на рівні схеми — зазвичай є лише "прочитано вдруге" як прапорець чи повторний запис оцінки без структурного зв'язку з рештою пам'яті про це саме прочитання. Тут це наскрізна архітектурна властивість (9 міграцій, 6 rebuild-з-backfill), а не UI-хитрість поверх плаского запису.
- **Reread comparison ("Як змінилася книга для тебе")** — **STRONG UNIQUE**, прямий похідний продукт ReadingRun вище: порівняння оцінки/вражень/очікувань між конкретними прочитаннями з явною Δ-карткою. Це не просто "показати стару й нову оцінку" — це структуроване порівняння, можливе ЛИШЕ тому, що кожен run має власний ізольований набір даних.
- **Spoiler-safe mode (централізований, багатокнижний)** — **DIFFERENTIATED**, межує з POTENTIALLY UNIQUE. Сама ідея "приховати спойлери відносно поточного прогресу" не унікальна (є в деяких read-tracker застосунках як проста функція для однієї книги), але централізована policy, що працює одночасно на 12+ різних поверхнях (глобальний пошук, щоденник, історія активності, on this day, recall, капсула — не лише сторінка самої книги) — це вже рівень інженерної дисципліни, який рідко зустрічається навіть у комерційних застосунках такого класу.
- **Особистий лор/персонажі (Personal Lore)** — **POTENTIALLY UNIQUE**. Нотатки про персонажів/світ книги з реакціями й зв'язком до записів щоденника, інтегровані зі spoiler-safe — це виходить за межі стандартного трекінгу прогресу в бік персонального "читацького вікі" для кожної книги. Не унікальна ідея загалом (фан-вікі існують скрізь), але рідкість — саме особиста, приватна, book-scoped версія цього, безшовно вплетена в тому самому додатку, що й прогрес/нотатки.
- **On This Day** — **DIFFERENTIATED**. Концепція запозичена з фотододатків/щоденників (Google Photos, Day One), але застосована саме до читацької активності — не зустрічається типово в read-tracker застосунках. Цінність зростає з часом (§86) — це не одноразова фіча, а та, що продукт навмисно вирощує довгостроково.
- **Календар із реальною по-денною історією книг (обкладинка "головної" книги дня, крапки інтенсивності, run-aware позначки)** — **DIFFERENTIATED**. Читацькі календарі-heatmap існують (GitHub-контриб'юшн-стиль зелені квадратики зустрічаються і в інших читацьких застосунках), але поєднання обкладинки конкретної книги ДНЯ + інтенсивність + прив'язка до конкретного проходу перечитування в одній клітинці — це вже специфічна, не тривіальна для копіювання комбінація.
- **Capsule/Recall (капсула часу + пригадування)** — **POTENTIALLY UNIQUE**. Ідея "зафіксувати враження зараз, отримати нагадування прочитати їх пізніше" — рідкісна навіть за межами read-tracker категорії (найближчий аналог — email-capsule сервіси на кшталт FutureMe, але не спеціалізовані під книги). Прив'язка капсули до конкретного ReadingRun (Фаза 10) робить це ще специфічнішим для цього продукту саме зараз.

**Підсумок.** Найсильніша, найбільш захищена диференціація продукту (STRONG UNIQUE) концентрується довкола ОДНІЄЇ архітектурної інвестиції — ReadingRun — і того, що з неї виростає (reread comparison). Це показово: milestone V1.6.1 інвестував найбільше інженерних зусиль (9 міграцій, найдовший документ проєкту) саме в ту частину продукту, яка й дає найбільшу продуктову диференціацію, а не в косметику.

## 89. ТОП-10 НАЙСИЛЬНІШИХ ФІЧ

Ранжування за реальною продуктовою цінністю (не складністю реалізації), станом на поточну кодову базу.

1. **Reading session timer з immutable-записом у SQLite одразу при старті** — фундамент довіри до всього застосунку: дані сесії не втрачаються навіть при краші. Без цього все інше не мало б сенсу.
2. **ReadingRun + REREADING MODEL** — єдина фіча milestone'у, що змінює саму структуру даних на краще назавжди, не косметична надбудова.
3. **Backup/restore з реальним round-trip тестом** — для одноосібного офлайн-застосунку це рівнозначно "чи довіряю я взагалі свої дані цьому продукту". Без нього все інше — ризик.
4. **Централізований spoiler-safe режим** — вирішує реальну, часто ігноровану проблему (перечитуєш нотатки під час активного читання й натикаєшся на спойлер власного авторства) на рівні, якого немає в конкурентів.
5. **Data Doctor з 7+ перевірками цілісності без деструктивного авто-фіксу** — рідкісна риса турботи про довіру до даних: знаходить проблеми, не намагається "магічно" їх виправити й ризикнути даними користувача.
6. **Календар 2.0 (обкладинка дня + інтенсивність)** — перетворює технічний журнал сесій на візуально приємний, легкий для сканування огляд читацького року.
7. **Book Memory hub (ungated)** — правильне продуктове рішення Фази 13: показувати екран, щойно є ХОЧ ОДНЕ джерело пам'яті, а не блокувати весь екран одним необов'язковим полем.
8. **Консолідовані навігаційні хаби ("Що читати далі?"/"Моє читання"/"Моя пам'ять")** — це не нова функціональність, а те, що робить решту функціональності УЖИВАНОЮ — без цього продукт мав би реальний ризик "функція є, але користувач про неї забув, бо вона похована".
9. **Personal Search (5 доменів офлайн-пошуку по власних даних)** — швидкий, приватний, без мережевої залежності доступ до власної читацької історії — саме те, чого бракує паперовому щоденнику й чого немає в жодному Goodreads-подібному застосунку, орієнтованому на публічність, а не приватність.
10. **DNF з причиною (DNF Improvement)** — дрібна, але продуктово розумна деталь: перетворює "покинуту книгу" з мовчазної невдачі на джерело самопізнання (чому саме покинув).

## 90. ТОП-10 НАЙСЛАБШИХ / НАЙМЕНШ ОБҐРУНТОВАНИХ ФІЧ

Чесно, без применшення — це не обов'язково баги, часто просто передчасна або низькоцінна на поточному масштабі функціональність.

1. **`ReadingRunRepository.discard()` без UI-виклику** (`V1_6_1_FINAL_REPORT.md` §13) — існує в коді, недосяжна користувачу. Або підключити, або прибрати з публічного API репозиторію (наразі — мертвий код, хоч і невеликий).
2. **Тренди (`app/trends.tsx`, топ книг за кількістю користувачів)** — на одноосібному, свіжому спільному каталозі (немає інших активних користувачів системи, за умовами цього завдання) ця фіча структурно не може дати змістовний результат — "топ за кількістю користувачів, що додали собі" при фактично одному активному користувачі зводиться до "мій власний список", без жодної додаткової цінності над звичайною бібліотекою.
3. **Кураторська добірка (`curated_book`)** — потребує ручного поповнення власником продукту через окремий CSV/скрипт (`scripts/sync-curated-books.js`) поза звичайним UI-циклом — реальна цінність прямо пропорційна тому, скільки часу власник продукту готовий витрачати на кураторство поза основним використанням застосунку; ризик закинутого, застарілого списку.
4. **TBR-особистість (`docs/TBR_PERSONALITY.md`)** — судячи з малого обсягу документа (57 рядків) і назви, це радше "розважальний бейдж", ніж actionable-інсайт — цінність низька відносно вкладеної інженерної складності (окремий екран, окрема логіка).
5. **Автоматичне резервне копіювання (`AutoBackupSettingsStorage.setLastRunAt`)** — CODE VERIFIED мертвий код: сам `docs/BACKUP_FORMAT.md` прямо каже "сьогодні... мертвий код, ніким не викликається". Задокументована, але нереалізована функція — краще або реалізувати, або прибрати згадку, щоб не вводити в оману.
6. **Owned Books/Loans (фізична наявність книги + позики)** — окрема повноцінна сутність (`owned_book`/`loan`) для функції, яка, найімовірніше, зачіпає малу частку use-кейсів одноосібного цифрового трекера читання (більшість сучасних читачів — або електронні книги, або бібліотека без активного "кому я позичив" трекінгу).
7. **CSV-експорт (`library.csv`/`reading_sessions.csv`/`notes.csv`)** — one-way, "людино-читаний звіт". Цінність реальна, але вузька: для одного користувача без потреби ділитися даними назовні це радше "про всяк випадок" функція, ніж щось, що регулярно використовується.
8. **Import review (`app/import/review.tsx`, окремий екран перегляду Goodreads-імпорту)** — потрібен лише один раз, у момент міграції з Goodreads; постійна присутність окремого маршруту й UI-шару заради одноразової дії — виправдана функціонально, але важка відносно частоти використання.
9. **`app_settings.week_start`** — колонка існує в схемі, ніколи не підключена до `buildMonthGrid` (`docs/CALENDAR_2_0.md`, "свідомо НЕ зроблено") — поле, яке нічого не робить, залишене "про запас" уже через кілька фаз поспіль.
10. **Season cards (`app/seasons/[seasonKey].tsx`)** — агрегований перелік прочитаного по сезону; функціонально коректний, але значною мірою дублює те, що вже показує Wrapped/Статистика під іншим кутом — консолідовано навігаційно (Фаза 15), але сам розрахунок і досі окремий шлях, а не похідна вьюха над тими самими даними.

## 91. РЕЄСТР ТЕХНІЧНОГО БОРГУ

| Проблема | Серйозність | Доказ | Ймовірність прояву | Вплив | Вартість фіксу | Рекомендований момент |
|---|---|---|---|---|---|---|
| `ReadingSessionRepository.listAllCompleted` викликається без `LIMIT` у 6 хуках (Fingerprint/Statistics/OnePicker/TBR/Tomorrow/ReadingProfile) | Середня | CODE VERIFIED, `grep` показав 6 місць виклику + власний коментар коду `026_hot_query_indexes.ts`, що прямо називає це "свідомо без LIMIT" | Зростає лінійно з роком використання (§86/§87) | Затримка відкриття аналітичних екранів на великій бібліотеці, не крах | Середня — потребує або пагінації, або агрегації на SQL-рівні замість завантаження всіх рядків у JS для кожного з 6 споживачів окремо | Після 1 року реального використання, коли обсяг сесій наблизиться до 2000-3000 — не терміново зараз |
| `BackupRepository.restoreAll`/`exportAll` без chunking — повний in-memory дамп + рядок-за-рядком `INSERT` в одній транзакції | Середня | CODE VERIFIED, пряме читання `BackupRepository.ts` (§87) | Зростає з роком/п'ятьма роками даних | Повільне (секунди-десятки секунд) відновлення на великому обсязі, без прогрес-індикатора в UI | Середня-висока — batched/multi-row INSERT або progress callback | Перед 5-річним горизонтом даних, не терміново |
| `AutoBackupSettingsStorage.setLastRunAt` — мертвий код | Низька | CODE VERIFIED, прямо назване в `docs/BACKUP_FORMAT.md` | Постійна (код просто лежить невикористаним) | Мінімальний — заплутує майбутнього читача коду/документації | Низька — видалити або підключити | Найближчий "прибиральний" прохід |
| `ReadingRunRepository.discard()` без UI-виклику | Низька-середня | CODE VERIFIED (`V1_6_1_FINAL_REPORT.md` §13) | Проявляється лише якщо користувач хоче скасувати помилковий run | Функціональна прогалина, не баг — немає штатного способу виправити помилку | Низька — один UI-виклик з підтвердженням | Коли власник продукту реально зіткнеться з потребою (не проактивно) |
| `app_settings.week_start` — колонка існує, ніде не читається | Низька | CODE VERIFIED (`docs/CALENDAR_2_0.md`, "свідомо НЕ зроблено") | Постійна | Мінімальний — просто невикористане поле схеми | Низька, якщо колись з'явиться UI налаштувань | Разом із майбутнім екраном налаштувань, не окремо |
| `BACKUP_FORMAT.md` ілюстративний JSON-приклад пропускає `tagged_item` | Низька | CODE VERIFIED, §82 | Постійна, до першого читання документа кимось, хто звіряє з кодом | Мінімальний — приклад не нормативний, лише пояснювальний | Дуже низька — один рядок правки документа | Наступний прохід документації |
| Мертвий код/непідтверджені файли `app/characters/*` (можливо, лише в цьому хмарному дзеркалі) | Низька-середня, УМОВНО | CODE VERIFIED у дзеркалі, суперечить CHANGELOG-твердженню (§82) | Невідомо без доступу до реального репозиторію власника | Якщо файли реально існують на продакшн-машині — потенційно робочі (Expo Router реєструє будь-який файл `app/`) дублікатні маршрути без spoiler-safe фільтрації, `V1_6_1_FINAL_REPORT.md` Фаза 2 прямо називала це ризиком до видалення | Дуже низька — `rm -rf app/characters` (уже мало бути зроблено) | Негайно перевірити на реальній машині (`ls app/characters`), не чекати |
| `google-books-proxy` не задеплоєно | Середня (security/cost) | CI VERIFIED відсутність деплою, `V1_6_1_FINAL_REPORT.md` §4/§12 | Постійна, доки не задеплоєно | Низька практична шкода (безкоштовний provider з робочим анонімним fallback), але залишковий security-débt | Низька — `supabase functions deploy`, вже описано в README | Перед наступним milestone'ом (легко закрити, вже готово) |
| Repository-тестове покриття нерівномірне (частина репозиторіїв без прямих тестів) | Середня | `V1_6_1_FINAL_REPORT.md` §7, прямо каже "не перераховано заново... власнику продукту варто перегенерувати самостійно" | Постійна | Регресії в непокритих репозиторіях менш ймовірно зловлені автоматично | Середня — систематичний прохід по `ls src/data/repositories/*.test.ts` vs. `*.ts` | Перед великим наступним milestone'ом, як гігієнічний крок |

## 92. РЕЄСТР ПРОДУКТОВОГО БОРГУ

| Потік/концепція | Проблема | Вплив на користувача | Рекомендований напрямок |
|---|---|---|---|
| Тренди | Структурно беззмістовна фіча при одному активному користувачі спільного каталогу (§90 п.2) | Низький, але створює хибне враження "соціальної" функції там, де соціальності немає | Або приховати за умовою "показувати лише коли достатньо даних у catalog_book_device", або чесно переосмислити як персональну "нещодавно додані з добірки" | 
| Кураторська добірка | Залежить від ручного, поза-UI кураторства (CSV + скрипт) — ризик застаріння без активного нагляду власника продукту | Низький зараз (мало хто натрапляє), зростає, якщо добірка перестане поповнюватись і виглядатиме "мертвою" в результатах пошуку | Періодична перевірка свіжості (кількість записів/дата останнього поповнення), можливо видимий "востаннє оновлено" індикатор |
| ReadingRun без UI-скасування | Немає штатного шляху виправити помилково почате перечитування | Дратівливо, якщо станеться (засмічена "Історія прочитань") | Додати кнопку "Скасувати цей прохід" на екрані Book Details з підтвердженням, коли run ще `in_progress` і без жодної сесії/рефлексії |
| Manual device checklist (34 пункти) не виконаний | Найбільша продуктова функціональність milestone'у (REREADING MODEL, Календар) не бачена живцем жодного разу | Ризик прихованих UI-багів, накопичений, не разовий | Пройти хоча б підмножину чек-листа (пп. 9-11, 19-20) перед активним повсякденним використанням — деталізовано в §85 |
| TBR-особистість/Season cards | Дублюють по суті ту саму інформацію, що й Wrapped/Статистика, під іншим кутом подачі | Низький, але додає когнітивне навантаження "ще один екран з майже тим самим" | Не терміново; кандидат на переоцінку, чи варта окрема навігаційна присутність, під час наступного UX-аудиту (за зразком Фаз 13-19) |
| Backup — немає прогрес-індикатора при відновленні | На великому обсязі даних (§87) відновлення потенційно займає помітний час без візуального фідбеку | Користувач може подумати, що застосунок завис | Додати простий progress/spinner з описом кроку ("Відновлюю сесії читання...") при `restoreAll` |

## 93. РЕЄСТР БОРГУ ДАНИХ

- **Неоднозначні legacy-дані reading-run (backfill-евристика, Фаза 6b).** CODE VERIFIED (`docs/READING_RUN.md` §Backfill): для книги, що зараз перечитується (`status = 'rereading'`), backfill СВІДОМО не намагається реконструювати, коли закінчилось перше прочитання — весь проміжок від оригінального `started_at` до моменту backfill стає ОДНИМ `in_progress` run. Це задокументована, свідома втрата точності (не баг), але означає: для будь-якої книги, що була "в перечитуванні" ДО Фази 6b, "Історія прочитань"/"Як змінилася книга для тебе" не покажуть справжню кількість минулих перечитувань — лише один злитий run замість реальних двох-трьох. Це постійний, незникаючий артефакт історичних даних — жодна майбутня фіча не зможе його "виправити" заднім числом без вигаданих даних.
- **Відсутня підтримка рейтингу ЗА ПРОХОДОМ до Фази 12** — уже виправлено архітектурно (`rating.reading_run_id`, `025_rating_run.ts`), АЛЕ backfill для НАЯВНИХ до Фази 12 оцінок прив'язує їх до "найновішого `finished`/`did_not_finish` run, інакше найновішого run узагалі" — тобто стара оцінка, поставлена фактично ПІСЛЯ першого прочитання, може виявитись прив'язаною до пізнішого run (якщо власник продукту вже встиг перечитати книгу до моменту цієї міграції), а не до того прочитання, якому вона насправді відповідала. Той самий клас неоднозначності, що й вище — задокументований, свідомий, незникаючий.
- **Жорстке (не м'яке) видалення декількох особистих сутностей.** CODE VERIFIED (`docs/SOFT_DELETE_READINESS.md`, Фаза 26): лише `book_capsule`/`book_memory`/`rating` отримали `deleted_at`. `Shelf`/`ReadingGoal`/`Reminder` лишились ЖОРСТКИМИ — фізичний `DELETE`, без можливості відновлення при помилковому видаленні. Це свідомий, задокументований вибір ("структурні/конфігураційні сутності без незамінного тексту користувача"), але для полиці з унікальною користувацькою назвою/описом (`shelf.description` — вільний текст) це не зовсім безболісно: опис полиці — теж вільний, потенційно продуманий текст, а не суто "конфігурація". `note`/`quote`/`user_book`/`work`/`edition` — усі soft-delete з базової схеми (`deleted_at` є ще з Migration 001), тож найцінніший текст (нотатки/цитати) захищений; ризик стосується вужчого кола сутностей.
- **`capsule_recall.ON DELETE CASCADE` більше не спрацьовує для м'яко видалених капсул** — задокументований побічний ефект Фази 26 (`V1_6_1_FINAL_REPORT.md` §19): recall-історія тепер зберігається РАЗОМ із м'яко видаленою капсулою (не видаляється каскадно, бо батьківський рядок капсули фізично лишається), а НЕ знищується безповоротно, як було б при жорсткому видаленні. Це навмисне покращення (менше втрати даних), але означає, що `capsule_recall` тепер може накопичувати рядки, прив'язані до капсул, які користувач вважає "видаленими" — неочевидна поведінка, якщо колись знадобиться порахувати "скільки капсул реально активні".
- **Історична неоднозначність дат (імпорт/backfill).** Дати, що прийшли з Goodreads CSV-імпорту (`applyImportedDates`) чи з backfill Фази 6b, мають нижчу довіру, ніж дати, зафіксовані самим застосунком у реальному часі — жодного окремого прапорця "ця дата — реконструйована, не первинна" в схемі немає (на відміну від `is_legacy_backfill` на `reading_run`, який ЦЕЙ прапорець має). Наприклад, `note`/`quote`/`reading_session` не мають еквівалентного маркера "ця дата — імпортована постфактум, а не записана в реальному часі" — статистика/стріки (`streaks.ts`), які явно тестують "ручне редагування історії заднім числом" як межовий випадок (`docs/TESTING.md`), теоретично можуть трактувати імпортовану активність нарівні з реальною, без способу відрізнити одну від іншої на рівні даних.

## 94. РЕЄСТР UX-БОРГУ ПО ЕКРАНАХ

*Примітка: цей аудит не мав доступу до інших розділів цього ж звіту (котрі, ймовірно, глибше покривають окремі екрани) — нижче лише те, що можна обґрунтовано витягнути з документації/CHANGELOG/архітектури, прочитаних безпосередньо цією сесією.*

- **Home** — CODE VERIFIED через `PRODUCT_CONSOLIDATION.md` Фаза 28: "жодних знахідок, код не змінений" на фінальному re-audit'і — сам продукт вважає цей екран стабільним. Залишковий борг: контекстна картка (лотерея з 5 кандидатів, включно з On This Day) — механізм ротації не документований детально в жодному прочитаному джерелі; неясно, чи користувач коли-небудь бачить достатньо різноманіття, чи одна й та сама картка домінує.
- **Library** — Фаза 28 знайшла й закрила 2 реальні баги стану (застарілий статус після мутації, лічильник полиці рахував видалені книги) — обидва вже виправлені й покриті регресійними тестами. Залишковий борг: сама Фаза 28 характеризує ці баги як "баги стану, не навігації" — тобто клас проблеми (React Query/derived-state неузгодженість) міг залишити подібні, ще не знайдені випадки в інших мутаціях бібліотеки, не перевірені цим самим re-audit'ом.
- **Book Details** — CODE VERIFIED, `PRODUCT_CONSOLIDATION.md` Фаза 28 прямо називає це "єдиним екраном із реальним conceptual overload" (15 можливих секцій, 10 безумовно рендеряться для активно читаної книги) — навіть ПІСЛЯ точкових фіксів (заголовки секціям, згорнутий LoreSection, полегшена картка "Перечитати"). Це залишковий, визнаний самим продуктом борг, не усунений повністю.
- **Calendar** — CODE VERIFIED стабільний (жодна фаза 20-28 не торкалась логіки/розкладки). Залишковий борг: `week_start` не підключено (§90 п.9) — дрібний, але для користувача, чий тиждень починається не з понеділка, це постійна дрібна невідповідність очікуванню.
- **Memory** — розширено до 5-секційного хабу (Фаза 16), ungated (Фаза 13). Залишковий борг: нові поверхні spoiler-safe фільтрації (Book Memory/Journal Timeline, Фаза 3 V1.6.1) НЕ отримали індикатора "N приховано" (`docs/SPOILER_SAFE.md`, "Свідоме обмеження Фази 3 V1.6.1") — на відміну від Book Details, де такий індикатор є, тут користувач бачить коротший список без пояснення чому.
- **Analytics ("Моє читання")** — консолідовано (Фаза 15), спільні функції винесені в `readingAggregates.ts`. Залишковий борг: сама консолідація навігаційна, п'ять базових екранів (Статистика/Профіль/Відбиток/Wrapped/Сезони) лишаються окремими обчисленнями під капотом, не єдиною уніфікованою моделлю даних — часткове, не повне усунення дублювання логіки.
- **Search** — Personal Search (5 доменів) відокремлений від Catalog-пошуку (Фаза 17 V1.6, підтверджено). Залишковий борг: LIKE-based пошук наближається до межі заявленого діапазону на 5-річному горизонті (§87) — не сьогоднішня проблема, але єдиний екран пошуку, для якого це вже явно назване самим кодом застереження, а не гіпотетичне.

## 95. РИЗИКИ ПЕРЕД НАСТУПНИМ ВЕЛИКИМ МІЛСТОУНОМ

Пріоритизовано, конкретно, НЕ про публічний реліз — лише про те, що варто закрити ДО того, як почати новий великий functional milestone, щоб не накопичувати борг поверх боргу.

1. **Пройти хоча б ядро `FINAL_OWNER_ACCEPTANCE_FLOW.md`** (пп. 9-11 REREADING MODEL, 19-20 Календар, 21-25 дані/бекап) — найвищий leverage: це верифікує саме ту частину коду, в яку вкладено найбільше архітектурних зусиль milestone'у, і яка ще НІКОЛИ не бачена живцем. Продовжувати нарощувати функціональність поверх непідтвердженого UI REREADING MODEL — ризик компаундингу: якщо там є UI-баг, кожна наступна фіча, що спирається на ReadingRun (а таких, вочевидь, буде багато, §97-99), успадкує цей же прихований баг.
2. **З'ясувати реальний статус `app/characters/*`** (§82/§91) — дешева, п'ятихвилинна перевірка на реальній машині власника продукту, яка або підтверджує "усе гаразд, це лише відставання хмарного дзеркала", або виявляє реальний, досі не закритий пункт з Фази 2.
3. **Задеплоїти `google-books-proxy`** — остання відкрита security-дія з трьох запланованих проксі, вже повністю готова технічно (README з кроками існує), просто не виконана через відсутність доступу з хмарної сесії.
4. **Систематичний прохід repository-тестового покриття** (`V1_6_1_FINAL_REPORT.md` §7) — перш ніж наступний milestone додасть ще більше репозиторіїв/методів, варто знати точний перелік непокритих зараз, а не здогадуватись.
5. **Вирішити долю `listAllCompleted`-без-LIMIT ДО того, як з'явиться ще більше споживачів цього методу** — наступний milestone, найімовірніше, додасть ще один аналітичний екран чи рекомендаційний алгоритм; легше додати `LIMIT`/пагінацію зараз, поки споживачів 6, ніж після того, як їх стане 10.

## 96. ЩО НЕ ВАРТО ЧІПАТИ

- **`src/domain/*` — уся чиста доменна логіка** (`readingPace.ts`, `finishPrediction.ts`, `tbrEstimate.ts`, `streaks.ts`, `seriesOrdering.ts`, `backupSerializer.ts`). CODE VERIFIED, AUTOMATED TEST VERIFIED — це найстаріший, найретельніше протестований шар проєкту (нуль React/SQL-залежностей за дизайном, `ARCHITECTURE.md` §2), і саме той шар, який 813 тестів покривають найгустіше. Жодного знайденого цією сесією багу чи розходження в жодному з цих файлів.
- **Migration runner + сам механізм міграцій (`PRAGMA user_version`-підхід).** 27 міграцій підряд, кожна з власним тестом, плюс два наскрізні сценарії Фази 27 (V1.5→latest, V1.6→latest) — це найбільш "бойово перевірений" механізм у всьому проєкті. Жодної причини змінювати сам підхід (rebuild-ідіом для UNIQUE-змін, м'які посилання без SQL FK) — він послідовно застосовується і послідовно працює 27 разів поспіль.
- **CI-конфігурація (`ci.yml`, обидва job'и).** CI VERIFIED — #83-86 усі зелені, блокуючий typecheck/lint/test для Node-частини, блокуючий `deno check`/`deno lint` для Edge Functions (з реальною знахідкою TS2769 при першому ж прогоні, §2 `V1_6_1_FINAL_REPORT.md`). Косметична Annotations-аномалія (exit code 1 попри Status: Success) — не привід переробляти конфігурацію; варта одного окремого дослідження, не структурної зміни.
- **Спільний spoiler-safe шар (`src/lib/spoilerSafe.ts`).** Централізований у Фазі 3 V1.6.1 саме тому, що попередня, розпорошена версія містила реальні витоки — тепер це єдина точка правди для 14 поверхонь, з тестами й самокритичним документом (`docs/SPOILER_SAFE.md`, що сам виправляє власні попередні неточності). Це взірцевий приклад "зроблено правильно з першого разу після рефакторингу" — не чіпати структуру, хіба додавати нові поверхні за тим самим патерном.
- **ReadingRun backfill-логіка (`legacyRunBackfill.ts`).** Складна, але вичерпно задокументована (`docs/READING_RUN.md`, 563 рядки) і покрита і власними unit-тестами, і наскрізними сценаріями Фази 27. Зміна цієї логіки заднім числом ризикована непропорційно вигоді — вона вже виконала свою одноразову роботу для існуючих даних; нова функціональність повинна будуватись НА базі того, що вона вже зробила, не переписувати сам backfill.

## 97. ВАРІАНТИ НАСТУПНОГО MILESTONE'У

**OPTION A — DEEP MEMORY (більше rereading/memory-фіч на базі ReadingRun)**
- *Користь:* пряме продовження найсильнішої, щойно завершеної архітектурної інвестиції (§88, §89) — найвища гранична цінність на вкладену одиницю роботи, бо фундамент (ReadingRun) уже готовий і протестований.
- *Ризик:* REREADING MODEL і Календар 2.0 ще не бачені живцем (§84/§85) — нарощувати ще один шар поверх непідтвердженого UI ризикує компаундингом прихованих багів.
- *Залежність:* потребує §95 п.1 (пройти device checklist) ЯК передумову, інакше ризик зростає без потреби.
- *Складність:* середня — інфраструктура (схема, репозиторії, backfill) уже є, нова робота переважно UI/product-шар.

**OPTION B — DISCOVERY (каталог/рекомендації/глибина українських метаданих)**
- *Користь:* зростання цінності бібліотеки без ризику для основного core loop; природне продовження вже існуючої кураторської добірки/Google Books/ISBNdb інфраструктури.
- *Ризик:* найслабша диференціація (§88 — жодна з можливих фіч цього напрямку класифікується як STRONG UNIQUE; це категорія, де Goodreads/StoryGraph уже сильні), і найнижча продуктова терміновість для одноосібного застосунку без соціального контексту (§90 п.2 — Тренди вже показують межі цінності без реальної спільноти користувачів).
- *Залежність:* мінімальна — не залежить від жодної нещодавньої архітектурної роботи.
- *Складність:* низька-середня, але з потенційно необмеженим scope creep (метадані — бездонна яма деталізації).

**OPTION C — V2 ACCOUNT FOUNDATION (auth + підготовка sync)**
- *Користь:* технічно найкраще підготовлений напрямок архітектурно (`ARCHITECTURE.md` §8, `ROADMAP.md` — repository-шар відокремлений, `user_id`-міграція, а не переписування).
- *Ризик:* НАЙВИЩИЙ з чотирьох варіантів — реалізація sync-двигуна без реального другого пристрою для тестування (`ARCHITECTURE.md` §8, "негарантований ризик регресій у read-моделі, якою користувач буде користуватись щодня" — пряма цитата документа самого проєкту) означає ризик зіпсувати core loop заради інфраструктури, яка одному користувачу поки не потрібна взагалі (немає other users).
- *Залежність:* жодна з поточних 28 фаз V1.6.1 цього не потребувала й не готувала спеціально — це окрема, самостійна інвестиція.
- *Складність:* висока — новий серверний шар, RLS, конфлікт-резолюшн, і те, що ТЗ прямо називає "DO NOT IMPLEMENT YET" ще з розділу 47.

**OPTION D — PRODUCT POLISH (довший період стабілізації без нового росту фіч)**
- *Користь:* закриває реальний, конкретний, задокументований самою цією сесією борг (§91-95) — найнижчий ризик, найвища впевненість результату; природний момент для цього, одразу після 28-фазного milestone'у з високою швидкістю змін.
- *Ризик:* найнижчий продуктовий, але є ризик втрати темпу/мотивації власника продукту, який явно планує "значно більше фіч" (за умовами цього завдання).
- *Залежність:* жодної — можна почати негайно.
- *Складність:* низька-середня (переважно виправлення й тестове покриття, не нова архітектура).

## 98. РЕКОМЕНДАЦІЯ

**Рекомендований напрямок: гібрид — спочатку коротка, вузько сфокусована фаза з елементів OPTION D (виключно §95, 4-5 пунктів вище, не повний polish-milestone), одразу після якої — OPTION A.**

Обґрунтування, без автоматичного скочування до Auth (OPTION C) лише тому, що це "наступний логічний крок" за роумапом:

Аргумент ПРОТИ OPTION C зараз — не "Auth завжди погана ідея", а конкретний: (1) застосунок сам, у власній документації (`ARCHITECTURE.md` §8), прямо називає реалізацію sync без реального другого пристрою "негарантованим ризиком регресій у read-моделі" — тобто найвищий технічний ризик серед усіх чотирьох варіантів, для інвестиції, якої ОДИН користувач структурно не потребує зараз (умова цього завдання: немає інших користувачів); (2) власник продукту явно планує "значно більше фіч" — інвестувати найризикованішу з чотирьох опцій ПЕРЕД тим, як з'ясовано, наскільки стабільна щойно завершена REREADING MODEL (яка сама ще не пройшла жодної живої UI-перевірки, §84/§85), означає нашаровувати два високих ризики одночасно.

Аргумент ЗА OPTION A (з коротким D-префіксом) — це саме та інвестиція, яка вже дала найсильнішу продуктову диференціацію milestone'у (§88, §89: усі STRONG UNIQUE фічі виростають з ReadingRun), фундамент для якої вже готовий і протестований (813 тестів, 27 міграцій), і для якої єдиний реальний блокер — не архітектура, а ВЕРИФІКАЦІЯ (§84/§85 checklist). Тобто "закрити перед наступним milestone" (D) і "почати наступний milestone" (A) — не конкуруючі, а послідовні кроки: спершу підтвердити живцем те, що вже побудовано (кілька годин роботи власника продукту), потім будувати далі на підтвердженому фундаменті, а не на непідтвердженому. Це не "не робити нічого нового" (D у чистому вигляді ризикує втратити темп) і не "стрибати в наступну велику фічу без перевірки" (A у чистому вигляді ризикує компаундингом непідтверджених багів) — а найменш ризикована послідовність, яка водночас продовжує напрямок із найвищою вже доведеною продуктовою цінністю.

OPTION B (Discovery) і OPTION C (Auth) обидва залишаються реалістичними майбутніми напрямками — B радше як постійний, малими порціями фоновий процес (кураторська добірка), ніж окремий великий milestone; C — коли (і якщо) власник продукту реально відчує потребу в другому пристрої/користувачі, не раніше, як прямо й підтверджує сам `ROADMAP.md` ("акаунти РОЗВ'ЯЗУЮТЬСЯ ОКРЕМО й пізніше").

## 99. ІДЕЇ МАЙБУТНІХ ФІЧ

*(максимум 20, лише ті, що органічно виростають із поточної форми ЦЬОГО продукту)*

1. **Reread-тригер за розкладом** — Проблема: капсула вже нагадує про враження, але немає механізму "чи не час перечитати цю книгу знову" на основі часу з останнього прочитання. Цінність: замикає цикл REREADING MODEL у проактивну рекомендацію, не лише реактивний запис історії. Чому саме зараз: `reading_run.finished_at` уже точно фіксує дату завершення кожного проходу — раніше цього поля просто не існувало для перечитувань. Дані: `reading_run` (уже є). Складність: низька-середня. Ризик: низький.
2. **"Скасувати run" з UI** — Проблема: §90 п.1/§92 — `discard()` існує без входу. Цінність: закриває реальну функціональну прогалину. Чому зараз: інфраструктура вже готова, лишається один UI-виклик. Дані: жодних нових. Складність: дуже низька. Ризик: низький.
3. **Множинний перегляд Book Memory за run'ами** — Проблема: `listByUserBookId`/`getByReadingRunId` для book_memory вже готові (Фаза 8), але власного UI-перегляду ІСТОРІЇ спогадів (не лише поточного) ще немає — задокументовано як "поза межами фази". Цінність: природне розширення reread comparison — не лише оцінка/капсула, а й повний текст рефлексії кожного проходу поруч. Чому зараз: дані вже назбираніться після кількох перечитувань, і сам API вже існує. Дані: `book_memory` по кожному run. Складність: низька. Ризик: низький.
4. **Аналітика "як змінюється мій темп при перечитуванні"** — Проблема: наразі темп рахується lifetime/rolling, але ніколи не порівнюється між першим і повторним прочитанням тієї самої книги. Цінність: унікальний, персональний інсайт, неможливий без ReadingRun. Чому зараз: `computeRunReadingStats` (Фаза 12) уже рахує статистику сесій ПО RUN — лишається лише порівняти. Дані: `reading_session` по run. Складність: низька-середня. Ризик: низький.
5. **"Спогади про перечитування" як окрема секція Memory hub** — Проблема: наразі "Перечитання" в Memory hub (Фаза 16) — це просто список книг з ≥2 run, без агрегованого наративу. Цінність: перетворює список на історію. Чому зараз: дані вже структуровані по run. Дані: `reading_run`+похідні. Складність: середня. Ризик: низький.
6. **Індикатор "N приховано" на нових spoiler-safe поверхнях** — Проблема: §94 Memory — свідомо відкладений UX-поліш Фази 3. Цінність: узгодженість UX з Book Details. Чому зараз: логіка фільтрації вже централізована, лишається UI-шар. Дані: жодних нових. Складність: низька. Ризик: низький.
7. **"Читацький рік у перечитуваннях" (Wrapped-розширення)** — Проблема: Wrapped зараз рахує книги за рік завершення, але не виділяє перечитування як окрему, відзначувану категорію. Цінність: емоційно цінний інсайт ("цього року ти повернувся до N улюблених книг"). Чому зараз: `reading_run.is_legacy_backfill=0` + рік `finished_at` уже дають чистий фільтр. Дані: `reading_run`. Складність: низька. Ризик: низький.
8. **Прогрес-індикатор при відновленні бекапу** — Проблема: §87/§92 — відсутність фідбеку при потенційно довгому restore. Цінність: довіра/UX на великих обсягах даних. Чому зараз: сам обсяг даних власника продукту зростає, наближаючи момент, коли це стане помітним. Дані: не потрібні нові. Складність: низька-середня. Ризик: низький.
9. **`week_start`-налаштування підключене до Календаря** — Проблема: §90 п.9 — мертва колонка. Цінність: дрібна, але реальна персоналізація. Чому зараз: інфраструктура (`buildMonthGrid`) уже параметризована, потрібен лише UI-перемикач. Дані: `app_settings.week_start` (уже є). Складність: низька. Ризик: низький.
10. **Пагінація/LIMIT для аналітичних `listAllCompleted`-споживачів** — Проблема: §86/§91. Цінність: технічна, але запобігає майбутньому UX-регресу. Чому зараз: найдешевше зробити до того, як з'явиться ще більше споживачів. Дані: не потрібні нові. Складність: середня. Ризик: низький.
11. **"Порівняти три і більше прочитань" (розширення reread comparison за межі 2)** — Проблема: наразі порівняння підтримує ≥2, але UI/картка "Δ" описана як "між сусідніми" — для книг із 3+ перечитуваннями (рідкісний, але можливий кейс) варто перевірити UX на масштабованість. Цінність: коректність для найвідданіших перечитувачів власної бібліотеки. Чому зараз: щойно з'явиться перша книга з 3 run — сценарій стане реальним, не гіпотетичним. Дані: `reading_run`. Складність: низька (ймовірно вже частково підтримано, потребує лише UI-перевірки). Ризик: низький.
12. **Lore-записи, прив'язані до конкретного run** — Проблема: `lore_entity` прив'язана до `work`, не до `reading_run` — при перечитуванні всі нотатки про персонажів залишаються спільними, без розрізнення "що я думав про цього персонажа під час першого прочитання проти другого". Цінність: логічне продовження REREADING MODEL углиб Personal Lore. Чому зараз: сам PERSONAL LORE уже інтегрований зі spoiler-safe/run-екосистемою частково. Дані: нова nullable-колонка `reading_run_id` на `journal_lore_link` чи реакції. Складність: середня (нова міграція). Ризик: середній — ще один шар складності зверху вже складної reading_run-моделі.
13. **On This Day — фільтр за конкретним run** — Проблема: наразі On This Day показує записи "цього дня" незалежно від того, до якого прочитання вони належали. Цінність: точніший, менш плутаний наратив для книг із кількома run. Чому зараз: `isAheadOfCurrentProgress`/spoiler-контекст уже читають `current_page` конкретного активного стану. Дані: непрямий зв'язок через `session_id`. Складність: середня (той самий "не можу довести напряму" виклик, що вже назвав `CALENDAR_2_0.md` для нотаток/цитат). Ризик: середній.
14. **Season cards + TBR Personality — переоцінка/злиття** — Проблема: §90 пп.4/10 — часткове дублювання. Цінність: спрощення навігаційного дерева за тим самим принципом, що й Фази 13-19. Чому зараз: Фаза 28 (re-audit) уже встановила прецедент і методику такого перегляду. Дані: не потрібні нові. Складність: низька-середня (навігаційна, не архітектурна). Ризик: низький.
15. **Явний UI-маркер "ця дата — імпортована/реконструйована"** — Проблема: §93, історична неоднозначність дат. Цінність: прозорість довіри до статистики для книг, доданих через Goodreads-імпорт чи legacy backfill. Чому зараз: `is_legacy_backfill` уже існує як патерн саме для цього на `reading_run` — природно поширити той самий принцип. Дані: потребує позначення на рівні `note`/`quote`/`reading_session`, якщо колись знадобиться. Складність: середня. Ризик: низький.
16. **Локальний export конкретного reading_run як "звіт про перечитування"** — Проблема: наразі експорт — це або повний JSON-бекап, або CSV усієї бібліотеки; немає способу поділитись саме "ось що я думав про цю книгу під час другого прочитання". Цінність: використовує вже наявний шаблонний механізм картки-спогаду (Фаза 8 Milestone 11) під новим кутом. Чому зараз: увесь потрібний контент (рефлексія/оцінка/капсула по run) уже структурований. Дані: `book_memory`/`rating`/`book_capsule` по run. Складність: середня. Ризик: низький.
17. **Календарний "рік перечитувань" heatmap** — Проблема: наразі календар показує активність по днях, але немає окремого візуального способу побачити РОЗПОДІЛ перечитувань за рік/роки. Цінність: ще один погляд на ту саму, вже наявну диференціацію (§88). Чому зараз: `computeDayIntensity`/`selectPrimaryBookForDay` уже мають run-aware розширення (Фаза 19). Дані: `reading_run`+`reading_session`. Складність: середня. Ризик: низький.
18. **DNF-рефлексія по run у порівнянні прочитань** — Проблема: наразі reread comparison показує лише `finished`-run'и (`selectComparableRuns`, ≥2 `finished`); книга, покинута вдруге після завершеного першого прочитання, не порівнюється взагалі. Цінність: "чому цього разу я не дочитав те, що раніше дочитав" — сильний персональний інсайт. Чому зараз: `dnf_reflection` вже run-aware (Фаза 11) — дані готові, бракує лише UI-рішення, чи й як показувати змішане порівняння finished+did_not_finish. Дані: `dnf_reflection`+`reading_run`. Складність: середня-висока (продуктове рішення про UX змішаного порівняння). Ризик: середній.
19. **Нагадування "востаннє читав книгу N днів тому" по конкретному run, не по книзі загалом** — Проблема: `StaleReadingSection` наразі, найімовірніше, працює на рівні `user_book` (не перевірено напряму цією сесією), тобто для книги з кількома run історична пауза між run'ами може плутатись із реальною паузою всередині активного run. Цінність: точніша, менш оманлива UX-поведінка. Чому зараз: та сама run-обізнаність, яку вже отримали інші подібні фічі (finish prediction тощо). Дані: `reading_session.reading_run_id`. Складність: середня. Ризик: середній — потребує перевірки, чи це реальна, а не гіпотетична плутанина (не CODE VERIFIED цією сесією).
20. **"Час згадати" — фільтр за типом пам'яті (капсула/спогад/лор) у Memory hub** — Проблема: наразі "Час згадати" показує всі due-капсули разом; при накопиченні багатьох капсул (50+ на 1-річному горизонті, §86) список може стати важким для сканування. Цінність: краща навігація на масштабі, який продукт сам собі назвав як цільовий (50 капсул рік 1). Чому зараз: саме зараз, коли кількість капсул ще мала, легше спроєктувати правильну структуру фільтра, ніж переробляти її пізніше на великому обсязі. Дані: `book_capsule` (уже є). Складність: низька-середня. Ризик: низький.

## 100. ЩО НЕ ВАРТО БУДУВАТИ ЗАРАЗ

1. **Supabase Auth / акаунти** — немає other users, немає підтвердженої потреби (§98) — передчасна складність, сам `ROADMAP.md` прямо каже "розв'язується окремо й пізніше".
2. **"Дует читання" (реалтайм спільне читання)** — двічі залежна фіча (Auth + Realtime), жодна з двох залежностей не готова, а й сама Auth ще не потрібна (п.1).
3. **AI-асистент** — жодного архітектурного підготування (за задумом, `ROADMAP.md`), і явно поза межами V1 filozofії застосунку ("не показуй того, чого не робиш" — той самий принцип, що вже застосований до "Повернутися пізніше"-нагадувань).
4. **FTS5-пошук** — §87: LIKE все ще в межах заявленого діапазону на 5-річному горизонті; заміна індексу заради проблеми, якої емпірично ще не підтверджено, — передчасна оптимізація.
5. **Реальний автобекап-таск (розписання)** — `AutoBackupSettingsStorage` уже існує як мертвий код (§91) — перш ніж підключати, варто спершу вирішити, чи взагалі потрібен, а не автоматично реалізовувати те, що вже стоїть напівготовим.
6. **Merge-режим відновлення бекапу** (замість replace-all) — `docs/BACKUP_FORMAT.md` явно каже "можлива майбутня функція, не в V1" — для одного користувача replace-all уже покриває реальний use case (відновлення на новому пристрої/після втрати даних); merge додає складність конфлікт-резолюшну без явної потреби.
7. **Публічний build (EAS)** — `ARCHITECTURE.md` §9, Milestone 11, "відкладено навмисно" самим власником продукту — Expo Go достатній, доки функціональна робота не завершена, а вона явно продовжується (§97-99).
8. **Heatmap-кольорова палітра для Календаря** — `CALENDAR_2_0.md` явно відхилила це в межах самої Фази 19 через відсутність токена "сходинка кольорів" у дизайн-системі — ширша дизайн-системна робота, не точкова зміна Календаря, і немає підстав вважати, що крапки-індикатори наразі недостатні.
9. **Індекс на `deleted_at`** — Фаза 24 бенчмарком підтвердила "низька вибірковість, overhead на запис не виправданий" — додавати його зараз означало б ігнорувати вже наявний емпіричний доказ проти.
10. **Реструктуризація `note`/`quote` в єдину таблицю "JournalEntry"** — `docs/DATABASE.md` (Migration 003) явно документує це як свідоме РІШЕННЯ НЕ робити, узгоджене з власником продукту ще на самому початку — union на рівні читання (`JournalRepository`) вже вирішує задачу без ризику rebuild двох найбільших за обсягом таблиць проєкту.

## 101. ФІНАЛЬНА ОЦІНКА

| Критерій | Оцінка | Обґрунтування | Рівень доказовості |
|---|---|---|---|
| Архітектура | 8/10 | Чітка шарувата модель, послідовно дотримана 27 міграціями поспіль; головний мінус — складність REREADING MODEL ще не пройшла живої UI-перевірки | CODE VERIFIED + AUTOMATED TEST VERIFIED |
| Модель даних | 8/10 | Work/Edition розрізнення, soft-delete де це важливо, задокументовані свідомі компроміси (м'які FK-посилання) — послідовна, добре обґрунтована схема | CODE VERIFIED |
| ReadingRun | 7/10 | Архітектурно бездоганно спроєктований і вичерпно юніт/інтеграційно протестований (найдовший документ проєкту), але НІКОЛИ не бачений живцем на реальному UI, і має задокументовані межі точності (backfill-втрата історії старих перечитувань) | AUTOMATED TEST VERIFIED (UI: NOT VERIFIED) |
| Core reading (сесії/таймер) | 9/10 | Найзріліша, найдовше протестована частина проєкту; immutable-запис одразу в SQLite — сильна гарантія проти втрати даних | AUTOMATED TEST VERIFIED |
| Rereading (UX) | 6/10 | Функціонально повне (11 фаз), але немає UI-скасування помилкового run і жодної реальної людської перевірки екранів "Історія прочитань"/"Порівняння" | NOT VERIFIED (device) |
| Calendar | 7/10 | Архітектурно елегантне рішення (batching, O(діапазон)-запити), візуально продумане, але так само не бачене живцем; стабільність коду з Фази 19 (жодних змін 20-28) | CODE VERIFIED + AUTOMATED TEST VERIFIED (UI: NOT VERIFIED) |
| Home | 8/10 | Пройшло і консолідацію (Фаза 17), і re-audit (Фаза 28) без нових знахідок — найбільш "заспокоєний" екран milestone'у | CODE VERIFIED |
| Library | 7/10 | Два реальні баги знайдені й закриті цією ж сесією V1.6.1 (Фаза 28) — позитивний сигнал самоперевірки, але й доказ, що клас "баг стану після мутації" реально трапляється в цьому екрані | AUTOMATED TEST VERIFIED (regression) |
| Book Details | 6/10 | Сам продукт (Фаза 28) визнає це єдиним екраном із залишковим conceptual overload навіть після точкових фіксів (15 можливих секцій, 10 безумовних) | CODE VERIFIED (self-assessed by project) |
| Journal | 8/10 | Централізований spoiler-safe (14 поверхонь), офлайн Personal Search, добре покрита логіка (`journalInvalidation.ts` тощо) | AUTOMATED TEST VERIFIED |
| Memory | 7/10 | Ungated (Фаза 13), розширений до 5-секційного хабу (Фаза 16), але з визнаним UX-боргом (відсутній "N приховано" на нових поверхнях) | CODE VERIFIED |
| Spoiler safety | 8/10 | Централізована policy, 12/14 поверхонь SAFE, з реальним знайденим і виправленим витоком (On This Day) — сильна інженерна дисципліна, мінус за неповний UX-поліш нових поверхонь | AUTOMATED TEST VERIFIED + CODE VERIFIED |
| Recommendations | 5/10 | Функціонально консолідовані навігаційно (Фаза 14), але жодна з підфіч (Trends, TBR Personality) не є продуктово переконливою на масштабі одного користувача (§90) | CODE VERIFIED |
| Analytics | 6/10 | Реальна консолідація дублювання (readingAggregates.ts), але лишається п'ять паралельних екранів під капотом — часткове, не повне вирішення проблеми | CODE VERIFIED |
| Backup | 7/10 | Round-trip тест зелений, реальна прогалина (reading_run) знайдена й закрита цією ж сесією — позитивний сигнал; мінус за відсутність chunking на майбутньому масштабі й брак прогрес-індикатора | AUTOMATED TEST VERIFIED |
| Security | 6/10 | Два з трьох проксі задеплоєні й підтверджені (ISBNdb, cover-upload), третій (Google Books) готовий, але не задеплоєний; IP-based rate limiting — задокументований pre-Auth компроміс; `npm audit` тепер у CI, але CVE-список не переглянутий людиною | CI VERIFIED (partial) |
| Offline | 8/10 | Core loop повністю офлайн за дизайном; новий `useIsOffline` (реальна досяжність, не лише з'єднання) підключений до пошуку/сканера в Фазі 20 | CODE VERIFIED |
| Performance | 7/10 | Перший реальний бенчмарк (Фаза 24) на реалістичній фікстурі, 4 нові індекси з підтвердженим виграшем; відомий, не закритий ризик — `listAllCompleted` без LIMIT | AUTOMATED TEST VERIFIED (benchmark, не цією сесією повторений) |
| Accessibility | 7/10 | Reduce Motion, large text на 3 екранах, progressbar-роль — реальні знайдені й виправлені ризики (Фаза 22), але покриття вибіркове (7 екранів перевірено, не всі) | CODE VERIFIED |
| Testing | 8/10 | 813 тестів, 0 fail, підтверджено ДВІЧІ реальним прогоном власника продукту; мінус — repository-покриття нерівномірне, і 0% UI/E2E-покриття (свідомий вибір, не недогляд) | AUTOMATED TEST VERIFIED |
| Product clarity | 8/10 | Дуже чіткий, послідовно дотриманий core loop; 28-фазна консолідація UX (Фази 13-19) — рідкісний приклад продукту, що активно бореться з власною складністю замість її ігнорування | CODE VERIFIED |
| Differentiation | 8/10 | REREADING MODEL/reread comparison — справжня, архітектурно обґрунтована унікальність (§88 STRONG UNIQUE), не косметична | CODE VERIFIED |
| V2 readiness | 6/10 | Repository-шар відокремлений, `user_id`-міграція технічно нескладна за задумом — але сам проєкт відкрито визнає sync-ризик без другого пристрою; готовність "на папері" вища за готовність "на практиці" | HYPOTHESIS (документована власним ROADMAP.md) |
| Long-term scalability | 7/10 | Індекси/запити структурно готові до 5-річного горизонту (Calendar/ReadingRun), два конкретні відомі майбутні вузькі місця (LIKE-пошук, backup без chunking) — жодне не критичне сьогодні | CODE VERIFIED (structure) + HYPOTHESIS (реальна латентність на масштабі) |

**Три найнижчі оцінки:** Recommendations (5/10) — структурно слабка продуктова цінність окремих підфіч (Trends/TBR Personality) на масштабі одного користувача, не технічна проблема; Book Details (6/10) і Security (6/10) — обидва мають чіткий, уже названий самим проєктом шлях покращення (conceptual overload на Book Details визнаний Фазою 28; третій proxy для Security вже готовий, лише не задеплоєний), тобто це не глухі кути, а відомі, недорогі наступні кроки.

---

## Примітка до звіту

Документ самодостатній: 101 розділ, кожен із evidence-прив'язкою до реального коду/тестів/CI.
Підготовлено 9 незалежними дослідницькими проходами по репозиторію (кожен — прямі `Read`/`Grep`/
`Glob` виклики до реального дзеркала `/mnt/user-data/uploads/polytsya-m11`, без довіри до чужих
формулювань у попередній документації без власної перевірки), зведено в один документ без
редагування знахідок по суті — лише узгодження нумерації розділів і термінології.

Кілька знахідок цього звіту, знайдених НЕЗАЛЕЖНО кількома розділами одночасно (що підвищує
довіру до них, а не є дублюванням помилки одного проходу): розбіжність CHANGELOG.md Фази 2
("`app/characters/*` підтверджено видалено на пристрої") проти фактичної присутності обох
файлів у цьому дзеркалі (розділи §3 і §82/§91 незалежно один від одного дійшли того самого
висновку); soft-delete-обізнаність, що застосована в `ShelfRepository`/Library (Фаза 28), але
НЕ поширена на Calendar (розділ §35, знайдено незалежно від Фази-28 власного документа).

Жоден файл коду репозиторію не був змінений під час підготовки цього звіту — усі знахідки
описують стан коду СТАНОМ НА 2026-09-14, до будь-якого майбутнього фіксу.
