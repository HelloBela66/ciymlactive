# TESTING.md

## Що тестуємо в першу чергу (п.44)

Уся логіка в `src/domain/*` — чиста (без React, без SQL, без Date.now() напряму — час
передається як параметр для детермінізму) — і тому тестується в Node через `jest`, без
емулятора/симулятора:

- `readingPace.ts` — розрахунок сторінок/хв та хв/сторінку з масиву сесій.
- `finishPrediction.ts` — rolling-average (не lifetime pace!) → залишок годин, дата.
- `tbrEstimate.ts` — оцінка часу на TBR за 15/30/60 хв на день, книги без pageCount виключені
  з precise-суми й повертаються окремим списком.
- `streaks.ts` — послідовні дні з ≥1 валідною сесією; межові випадки: сесія що перетинає
  північ, часовий пояс, ручне редагування історії заднім числом.
- `seriesOrdering.ts` — сортування за publication/chronological/recommended order, коли вони
  розходяться; дробові `position` (новели).
- `backupSerializer.ts` — серіалізація/десеріалізація round-trip, `schemaVersion` guard.
- Обчислення таймера сесії (`elapsedFromTimestamps`) — з урахуванням `paused_intervals`.
- `bookStats.ts` (Milestone 11) — підсумкова статистика прочитаної книги (сумарний час,
  кількість сесій, сторінок, календарних днів старт→фініш); межові випадки: сесія без
  `durationSeconds`, `pageCount` пріоритетніший за `currentPage`, старт і фініш у той самий
  день → мінімум 1 день, а не 0.
- `journalInvalidation.ts` (Milestone 11) — спільна інвалідація React Query після будь-якої
  мутації нотатки/цитати; перевіряється точний список інвалідованих ключів, включно з умовною
  гілкою `bySession` і префіксною (не параметризованою) інвалідацією стрічки `journal/feed`.
- `memoryCardMood.ts` (Milestone 11) — вибір "вайбу" водяного знаку картки-спогаду за
  жанрами книги (пріоритет, коли жанрів кілька) або детермінований хеш-фолбек, коли жанр
  не впізнаний/відсутній; окремо — `moodSeedValues` (детермінований розкид, діапазон [0,1)).
- `tomorrowRecommendation.ts` (Milestone 11, доповнення — «Що почитати завтра?») —
  побудова пошукових запитів (жанр + варіанти ключових слів мети), ключ книги для
  дедуплікації/трекінгу показів (пріоритет isbn13 → isbn10 → сам `externalId`, без
  прив'язки до конкретного джерела — з появою кураторської добірки поруч із Google Books
  кандидат уже не завжди з одного джерела), ранжування кандидатів за близькістю `pageCount`
  до бюджету часу (включно з "помірним штрафом", а не виключенням, коли `pageCount`
  відсутній), `pickCandidate` з ін'єктованим `rng` для детермінованої перевірки навмисно
  НЕ-детермінованого в бойовому коді вибору, і `pickLanguageTier` — каскад "перший непорожній
  рівень перемагає" для мовної фільтрації Google Books-гілки (`confirmed`/`unverified`,
  докладніше — `useTomorrowRecommendation.ts`; кураторська гілка цей каскад не використовує
  взагалі, `languageConfidence: 'confirmed'` завжди).

## Repository-тести (інтеграційні)

Проти реальної SQLite (не in-memory мок): `:memory:`-БД, схема на якій піднята тим самим
`migrateDbIfNeeded`, що й на пристрої користувача. Мінімум: створення сутності → читання →
migration runner застосовує всі міграції на порожній БД без помилок → застосування нової
міграції на seed-БД попередньої версії.

**Драйвер — вирішено емпірично (Фаза 3):** відкрита розвилка вище ("Jest + `expo` preset, чи
окремий Node-SQLite драйвер — обираємо на етапі M0 залежно від того, що стабільно
піднімається без емулятора") закрита реальним прогоном на GitHub Actions. Перша спроба —
напряму `expo-sqlite` (`SQLite.openDatabaseAsync(':memory:')`) під `jest-expo` — впала:
`TypeError: _ExpoSQLite.default.NativeDatabase is not a constructor`
(`node_modules/expo-sqlite/src/SQLiteDatabase.ts:584`). Нативний модуль `expo-sqlite` не
конструюється в headless Node-середовищі GitHub Actions runner'а (без емулятора/симулятора),
попри те що `jest-expo` в принципі надає нативний шар для деяких інших Expo-модулів.

Тести відкривають БД через `openTestDatabase()` (`src/data/db/testDb.ts`) — тонкий адаптер
над `better-sqlite3` (синхронний нативний SQLite-драйвер для Node з прекомпільованими
бінарниками під linux-x64/win32-x64/darwin, без компілятора/node-gyp), що реалізує рівно ті
5 асинхронних методів, які реально викликають `migrationRunner.ts`/репозиторії
(`execAsync`/`runAsync`/`getFirstAsync`/`getAllAsync`/`withTransactionAsync`) — той самий
SQL-діалект і PRAGMA-інтерфейс, тож жоден рядок продакшн-коду не знає, що під капотом тесту
інший рушій виконання. Докладне обґрунтування й код адаптера — сам `testDb.ts`.

## Що НЕ покривається юніт-тестами (свідомо)

Верстка/анімації/жести — перевіряються вручну (single-user MVP, немає бюджету на E2E у V1);
натомість критичний шлях (`core loop`) проходить через error boundary + defensive checks,
щоб UI-баг ніколи не призвів до втрати даних сесії (дані вже в SQLite до того, як UI встиг
відрендерити помилку).

## Структура

Тест лежить поруч із файлом: `readingPace.ts` + `readingPace.test.ts`. Немає окремого
дзеркального дерева `__tests__/`.

## CI (GitHub Actions) — POLYTSIA V1.5, Фаза 2

До цієї фази в репозиторії не було ні `.github/`, ні самого git-репозиторію (Фаза 0, повний
аудит) — тести/типи/лінт існували лише як команди, які власник продукту запускав вручну на
своїй машині, ніхто/ніщо не перевіряло їх автоматично на кожен push/PR.

`.github/workflows/ci.yml` — запускається на `push`/`pull_request` у `main` (заміни на назву
своєї гілки, якщо ініціалізуєш репозиторій з іншою default-гілкою — GitHub сьогодні створює
`main` за замовчуванням, звідси припущення). Кроки, у порядку:

1. **`npm ci`** — не `npm install`: строго відтворюваний install точно за `package-lock.json`
   (`lockfileVersion: 3`), тому падає (навмисно, `EUSAGE`), якщо lock-файл і `package.json`
   розійшлись, замість тихо це виправити. **Перевірено реальним запуском** на GitHub Actions
   runner'і (перший реальний прогін цього workflow виявив саме таке розходження —
   `react-native-view-shot` було зафіксовано на `5.1.0` при вимозі `^5.1.1` — виправлено
   `npm install` локально й комітом оновленого lock-файлу).
2. **`npm run typecheck`** (`tsc --noEmit`) — TypeScript `strict: true` (`tsconfig.json`).
   `tsconfig.json` явно виключає `supabase/functions` (`exclude`) — ці файли виконуються в
   Deno runtime (Supabase Edge Functions), не в Node/React Native застосунку, і мають інший
   синтаксис (глобал `Deno`, імпорти з явним `.ts`), невалідний для звичайного tsc-проєкту
   застосунку; перевіряються ОКРЕМИМ job (п. "Edge Functions (Deno)" нижче), не тут.
3. **`npm run lint`** (`eslint . --max-warnings=0`) — `eslint.config.js` виключає
   `supabase/functions/**` (`ignores`) з тієї ж причини, що й `tsconfig.json` вище (Deno
   runtime, не Node/React Native застосунок).
4. **`npm test -- --ci`** (Jest, `jest-expo` preset) — увесь домен/lib (список вище) плюс
   repository-інтеграційні тести (`src/data/repositories/*.test.ts`,
   `src/data/db/migrationRunner.test.ts` — `better-sqlite3` як тестовий SQLite-рушій замість
   `expo-sqlite`, який не конструюється headless; `openTestDatabase()` /
   `__applyMigrationsForTests(db, version)` — див. розділ вище).
5. **`npx expo-doctor`** — "Expo health check", `continue-on-error: true` (advisory, не валить
   пайплайн): `expo-doctor` частково звертається в мережу, і нестабільність мережі
   GitHub-раннера — не те саме, що реальна помилка в коді репозиторію. Результат усе одно
   видно в кожному запуску.
6. **`npm audit --audit-level=high`** (POLYTSIA V1.6.1, Фаза 25, `docs/EDGE_FUNCTION_CI.md`) —
   `continue-on-error: true`, той самий advisory-підхід, що й `expo-doctor`. До цієї фази
   такого кроку не було, і саму перевірку жодного разу не запускали в середовищі з мережевим
   доступом до npm registry — `V1_6_FULL_AUDIT_REPORT.md`, розділ 34.

**Edge Functions (Deno)** — POLYTSIA V1.6.1, Фаза 25 (`docs/EDGE_FUNCTION_CI.md`) додала
ОКРЕМИЙ job `edge-functions` у тому самому `.github/workflows/ci.yml`, паралельний до `ci`
вище (інший рантайм — `denoland/setup-deno`, не Node): `deno check supabase/functions` +
`deno lint supabase/functions`. До цієї фази 5 файлів `supabase/functions/**` не перевірялись
ЖОДНИМ автоматичним інструментом на жодному push/PR узагалі (CODE VERIFIED знахідка
`V1_6_FULL_AUDIT_REPORT.md`, розділ 32 — і `tsconfig.json`, і `eslint.config.js` свідомо
виключають цю теку, п.2/3 вище) — тепер перевіряються обидва: типи (`deno check`) і лінт
(`deno lint`), блокуючим (не advisory) кроком, той самий рівень суворості, що й для
Node-частини застосунку. `deno test` СВІДОМО не додано — жодного `*.test.ts` у
`supabase/functions/**` ще не існує (написання таких тестів — поза межами цієї фази ТЗ, яке
називає лише "typecheck, lint, shared modules").

**⚠️ OWNER ACTION REQUIRED.** Сам `git init` і перший `push` на GitHub — з цієї (хмарної)
сесії неможливо виконати: немає shell-доступу до машини власника продукту (пов'язаний
робочий стіл не підтримує виконання команд, лише читання/запис файлів). Мінімальні кроки
власника продукту:

```bash
cd C:\polytsya-m11
git init
git add .
git commit -m "Initial commit"
# створити порожній репозиторій на github.com, потім:
git remote add origin <URL нового репозиторію>
git branch -M main
git push -u origin main
```

Після першого push CI запуститься автоматично на GitHub Actions (workflow уже в
`.github/workflows/ci.yml`, нічого додатково вмикати не треба — GitHub підхоплює будь-який
`.yml` у цій теці сам).
