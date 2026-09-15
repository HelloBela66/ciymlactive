# FOUNDATION FINAL POLISH — Calendar Historical Consistency + Search Provider Error UX + Regression Coverage

**Дата:** 2026-09-15
**Тип роботи:** короткий, точковий implementation-pass після
`docs/POST_V1_6_2_FINAL_AUDIT_REPORT.md` — НЕ V1.7, НЕ новий milestone, НЕ redesign.

## 1. Executive Summary

Мандат цього пасу — рівно три речі: (A) закрити два конкретні Calendar-геп історичної
узгодженості, знайдені попереднім аудитом (монадна "Найчастіше цього місяця" і
start/finish-мітки `ReadingRun`, обидва — наслідок того, що м'яке видалення книги з бібліотеки
приховувало легітимну історію читання); (B) зробити помилки зовнішніх пошукових провайдерів
(Google Books, ISBNdb) видимими для UI окремо від "нічого не знайдено", без поломки
мультипровайдерного пошуку при частковому збої; (C) довести регресійним тестом, що різні
Calendar-проекції (місяць-сітка, Деталі Дня, місячний підсумок, топ книг, start/finish-мітки) не
розходяться для одного й того самого історичного набору активності.

Усі три завдання виконано. Обидва Calendar-геп підтверджено в живому коді ПЕРЕД виправленням
(не припущено зі слів попереднього аудиту), і обидва виправлено точково — по одному рядку/одній
умові на геп, без нової моделі даних, без CASCADE, без зміни ReadingRun-архітектури. Search
Provider Error Transparency реалізовано через новий дискримінований `ProviderSearchOutcome`-тип,
що проходить крізь усі шари (проксі-клієнти → провайдери → React Query `select` → UI), із
навмисно "книжковим", не тривожним UI для часткового й повного збою джерел. Під час
реалізації Task B до деплою знайдено й виправлено дві незалежні регресії власним ручним
рев'ю — `GoogleBooksProvider.lookupByISBN` і відсутній реекспорт типів із
`src/data/providers/index.ts`.

**Оновлення після першого деплою (той самий день, 2026-09-15):** власник продукту фізично
виконав усі три quality-gate команди на реальній машині (`C:\polytsya-m11`) і надіслав повний
термінальний вивід. `npm test` пройшов повністю зелений з першого разу (88 suites / 1214 tests,
0 falls, включно з усіма 57 новими/переписаними тестами цього пасу). `npx tsc --noEmit` та
`npx eslint . --max-warnings=0` натомість знайшли РЕАЛЬНІ проблеми — 5 помилок компілятора в 3
файлах і 6 ESLint-попереджень у 3 файлах — усі в коді, який не був особисто вичитаний під час
початкової реалізації (два виробничі виклики `provider.searchBooks(...)`, написані до цього пасу
й зламані зміною контракту повернення на `ProviderSearchOutcome`, плюс дві дрібні
`noUncheckedIndexedAccess`-помилки у власному новому тесті, плюс `require()` у трьох нових
тестових файлах, заборонений лінтом проєкту). Розділ 12 нижче описує ці знахідки й фікси чесно, а
не заднім числом як "усе було чисто одразу" — саме так і мало бути: це і є та причина, чому
розділ 12 явно вимагав `OWNER ACTION REQUIRED`, а не стверджував CI VERIFIED без реального прогону.

**Друге оновлення (той самий день, 2026-09-15):** власник виконав ПОВТОРНИЙ прогін
`npx tsc --noEmit` і `npx eslint . --max-warnings=0` після деплою всіх фіксів — обидві команди
завершились без жодного рядка виводу, тобто **0 помилок компілятора, 0 ESLint-попереджень**,
підтверджено реальним інструментом, а не лише ручним вичитуванням. Усі три доступні поза CI
quality gates (`jest`/`tsc`/`eslint`) тепер мають статус PASSED, підтверджений фактичним
виконанням на машині власника.

**Третє оновлення (той самий день, 2026-09-15) — власник задеплоїв (git push) і CI ЗНАЙШОВ
РЕАЛЬНУ регресію, яку жоден локальний прогін не ловив:** GitHub Actions job `Typecheck, lint,
tests` упав — `Jest`: 3 suites / 29 tests failed із `TypeError: A dynamic import callback was
invoked without --experimental-vm-modules` у всіх трьох нових тестових файлах
(`GoogleBooksProvider.test.ts`, `googleBooksProxyClient.test.ts`, `isbndbProxyClient.test.ts`).
Причина: другий раунд ESLint-фіксів (вище) перевів `loadClient()`/`loadProvider()` з `require()`
на `jest.resetModules()` + динамічний `import()` — це пройшло ЛОКАЛЬНИЙ `npm test` власника (де
цей код фізично ще не виконувався в жодному з двох попередніх прогонів, лише вичитувався вручну),
але `jest-expo`/`babel-preset-expo` (`babel.config.js`) не транспілює динамічний `import()` у
`require()`-обгортку — Jest намагається виконати справжній ESM-`import()` і падає без
`--experimental-vm-modules`, якого в конфігурації проєкту немає. Виправлено поверненням до
`require()` у всіх трьох файлах, цього разу з ПРАВИЛЬНО названим `eslint-disable-next-line
@typescript-eslint/no-require-imports` (а не помилковим `no-var-requires`, як у першій версії) —
задеплойовано на `C:\polytsya-m11`, byte-verified. **Це третя регресія, спричинена самим цим
пасом, знайдена ПІСЛЯ деплою** (перші дві — `lookupByISBN`/реекспорт, знайдені до деплою; ще три —
знайдені першим `tsc`-прогоном власника; ця — перша й поки єдина, знайдена реальним CI, а не
локальним інструментом), і найпряміший доказ того, чому цей звіт послідовно вимагав
OWNER ACTION REQUIRED на кожному кроці замість припущення "все одно правильно".

**Четверте оновлення (той самий день, 2026-09-15) — власник запушив фікс регресії №6, і CI знайшов
не нову регресію, а МОЮ ВЛАСНУ помилку в тому самому фіксі:** `npx eslint . --max-warnings=0`
знову впав — той самий текст попередження ("A `require()` style import is forbidden") на трьох
файлах, ЩЕ й "Unused eslint-disable directive" на сусідньому рядку. Причина — не концептуальна, а
буквальна: `eslint-disable-next-line` вимикає правило РІВНО для наступного рядка, а мій
багаторядковий коментар-пояснення був розташований МІЖ директивою й фактичним `require(...)` —
директива вимикала попередження на порожньому (коментарному) рядку, а не на рядку з `require()`.
Виправлено переміщенням `eslint-disable-next-line` на рядок, що йде БЕЗПОСЕРЕДНЬО перед
`return require(...)` (пояснювальні коментарі — вище директиви, не між нею й кодом), в усіх трьох
файлах. Задеплойовано, byte-verified. Це не сьома регресія в коді застосунку — це помилка самого
редагування в межах фіксу регресії №6, знайдена тим самим CI, що й регресію №6 саму.

**П'яте оновлення (той самий день, 2026-09-15) — власник запушив фікс вище (commit `17dabdb`), і
CI пройшов ПОВНІСТЮ ЗЕЛЕНИМ:** job #102, обидва job'и — `Typecheck, lint, tests` і
`Edge Functions (Deno)` — **Success**, 1m 29s загалом (`Typecheck, lint, tests` — 1m 25s,
включно з `tsc`, `eslint --max-warnings=0` і повним `jest` разом). Це перший ПОВНІСТЮ зелений
CI-прогін для роботи цього пасу — жодного відкритого пункту в розділі 12 (Quality Gates) не
лишилось.

**Verdict: FOUNDATION CLOSED** (розділ 17) — жодного Critical/High дефекту не залишено відкритим
у коді; увесь ланцюжок знахідок цього пасу (два самостійні ручні рев'ю, два реальні
`tsc`/`eslint`-прогони власника, і три реальні CI-прогони — два провальні, один остаточно
зелений) призвів до п'яти виправлених регресій коду плюс одну виправлену помилку в самому фіксі
(неправильне розташування `eslint-disable-next-line`). Усі quality gates, доступні цій сесії
(`jest`/`tsc`/`eslint`/CI), тепер підтверджені РЕАЛЬНИМ ВИКОНАННЯМ із зеленим результатом —
жоден більше не позначений "NOT VERIFIED" чи "pending".

## 2. Pre-Implementation Verification

| # | Проблема (з аудиту) | Статус |
|---|---|---|
| 1 | Gap A: `useMonthSummary`'s `topBooks` використовує alive-only `listWithDetailsByIds` | **CONFIRMED** — прочитано `src/features/calendar/useCalendarSessions.ts` до правки: рядок `const books = await UserBookRepository.listWithDetailsByIds(db, distinctUserBookIds);` усередині `useMonthSummary`, тоді як `useMonthCalendarData`/`useDaySessions` вже використовували `...IncludingDeleted` (закрито попередньою фазою). |
| 2 | Gap B: `ReadingRunRepository.listStartedOrFinishedBetween` губить start/finish для soft-deleted книги | **CONFIRMED** — прочитано `ReadingRunRepository.ts` до правки: `JOIN user_book ub ON ub.id = rr.user_book_id AND ub.deleted_at IS NULL` у самому SQL цього методу; і підтверджено тестом-доказом БАГА, що вже існував у `ReadingRunRepository.test.ts` (`'run книги, м'яко видаленої з бібліотеки... не потрапляє в результат'` — тест явно стверджував СТАРУ поведінку). |
| 3 | Search: помилка провайдера тихо стає `[]`, невідрізненна від "нічого не знайдено" | **CONFIRMED** — прочитано `googleBooksProxyClient.ts`/`isbndbProxyClient.ts`/`GoogleBooksProvider.ts`/`useProviderSearch.ts`/`search.tsx` до правки: кожен `catch`/`!response.ok` шлях повертав `null` чи `[]`, `ProviderResultsSection` мала лише `data: RawProviderBook[]`, `!isLoading && data.length === 0 → return null` — той самий код-шлях для "провалилось" і "порожньо". |

## 3. Calendar Historical Consistency — зміни

- **Gap A fix** (`src/features/calendar/useCalendarSessions.ts`, `useMonthSummary`): один рядок,
  `UserBookRepository.listWithDetailsByIds` → `listWithDetailsByIdsIncludingDeleted`. Жодних
  інших змін у цій функції — `totalMinutes`/`totalPages`/`activeDaysCount` вже рахувались напряму
  з `sessions`, гепа не мали.
- **Gap B fix** (`src/data/repositories/ReadingRunRepository.ts`, `listStartedOrFinishedBetween`):
  прибрано `AND ub.deleted_at IS NULL` з `JOIN user_book`, `JOIN` як умова приєднання лишився
  (graceful fallback для фізично видаленого `user_book` — рядок просто не приєднається, той
  самий принцип, що й `attachDetailsBatch`). Метод уже використовувався ОБОМА поверхнями
  (`useMonthCalendarData` і `useDaySessions`) до цього фіксу — тож одна зміна SQL одразу закрила
  start/finish-мітки і в місяці-сітці, і в Деталях Дня.
- **`listFinishedBetween` (Reading Seasons, #167) СВІДОМО НЕ зачеплений** — окремий метод, інший
  виклик, задокументована асиметрія (`docs/CALENDAR_2_0.md`, новий розділ "Історична семантика").
  Той самий gap там лишається поза межами мандату цього пасу.
- Жодної нової персистентної моделі, жодного CASCADE, жодної зміни `ReadingRun`-архітектури.

## 4. Historical Query Semantics

Один явний інваріант, сформульований і застосований послідовно: **"жива бібліотека" ≠
"історичний запит"**.

- Історичні поверхні Календаря (місяць-сітка, Деталі Дня, місячний підсумок, топ книг,
  start/finish-мітки) резолвлять книгу через `UserBookRepository.
  listWithDetailsByIdsIncludingDeleted` і `ReadingRunRepository.listStartedOrFinishedBetween` —
  обидва ІГНОРУЮТЬ `user_book.deleted_at`.
- Library-орієнтовані запити (`listAll`, `listByStatus`, `listByIds`, і все, що зрештою через них
  ітерує) — БЕЗ ЗМІН, і далі жорстко `WHERE deleted_at IS NULL`. Жоден із цих методів цим пасом
  не займали.
- Reading Seasons (`listFinishedBetween`) — окремий, навмисно НЕ поширений на цей інваріант цим
  пасом (Seasons — заморожений продуктовий скоуп, `docs/READING_SEASONS.md`).

## 5. Monthly Top Books — статус фіксу

Закрито (Gap A, розділ 3). Книга, прочитана цього місяця й пізніше видалена з бібліотеки, тепер
знову з'являється в "Найчастіше цього місяця" з правильною сумою хвилин, ранжуванням за `workId`
(без змін самого `rankTopBooksOfMonth` — жодної нової логіки ранжування, лише правильні вхідні
дані). Покрито `calendarHistoricalConsistency.test.ts` (соло-книга + "жива + історична в тому
самому місяці").

## 6. ReadingRun Calendar Events (start/finish markers)

Закрито (Gap B, розділ 3). Tiny start/finish-позначка клітинки місяця-сітки і рядок "Початок"/
"Завершення" таймлайну Деталей Дня — обидва читають `ReadingRunRepository.
listStartedOrFinishedBetween`, обидва тепер лишаються видимі після soft-delete книги.
Перечитування (два завершених `ReadingRun`, потім soft-delete) — покрито окремим тестом:
ОБИДВА проходи (обидві пари старт/фініш) лишаються видимі, жоден run не втрачається.

## 7. Search Provider Error Model

Новий `src/lib/providerSearchError.ts`:

```ts
export type ProviderSearchErrorKind =
  'network' | 'timeout' | 'rate_limited' | 'server' | 'invalid_response' | 'unknown';
export interface ProviderSearchError { kind: ProviderSearchErrorKind; }
export type ProviderSearchOutcome<T> =
  | { status: 'success'; items: T[] }
  | { status: 'error'; error: ProviderSearchError };
```

Стани, які тепер розрізняються (мінімум із мандату — виконано з надлишком):
- **success-with-results** — `{status:'success', items: T[]}`, `items.length > 0`.
- **success-with-zero-results** (генуїнне "нічого не знайдено") — той самий статус,
  `items.length === 0`.
- **rate_limited** (HTTP 429), **server** (HTTP 5xx), **network** (fetch reject, не скасування),
  **timeout** (внутрішній клієнтський `AbortController`, 10с), **invalid_response** (JSON не
  парситься / не проходить Zod-схему) — усі `{status:'error', error:{kind}}`.

`classifyHttpStatus` — єдина спільна точка HTTP→kind (429/5xx/решта). Проксі-клієнти
(`googleBooksProxyClient.ts`/`isbndbProxyClient.ts`) і прямий fallback-шлях Google Books
(`fetchVolumesDirect`) — усі троє проходять крізь неї. `describeProviderSearchError` — єдина
точка тексту для користувача, книжковий тон, без HTTP-кодів/stack trace.

## 8. Partial Provider Failure UI

`ProviderResultsSection` (`app/(tabs)/search.tsx`) більше не ховає секцію мовчки при помилці —
показує `ProviderErrorNotice` (inline Card, іконка + `describeProviderSearchError`-текст + кнопка
"Спробувати ще раз" з `accessibilityHint`). Інші секції рендеряться незалежно й одночасно — якщо
Спільний каталог і ISBNdb успішні, а Google Books повернув 503, користувач бачить результати
обох перших ПЛЮС компактне "Google Books зараз недоступний." замість зникнення секції. Retry
кожної секції викликає лише `refetch()` ТІЄЇ секції (React Query, `retry: false` лишається без
змін — жодного автоматичного spam-retry, лише ручний через кнопку).

Якщо УСІ спробувані джерела (ISBNdb рахується лише коли реально увімкнена gate-умовою) завершились
саме помилкою, і жодна книга не потрапила в підсумок — `haveAllProvidersFailed` (нове,
`src/lib/searchProviderCombine.ts`) повертає `true`, і замість чотирьох порожніх/помилкових
секцій показується один `QueryErrorState` з єдиним retry на всі джерела одразу.

## 9. Search UX (empty / error / offline / retry)

- **Справжня порожність** (усі джерела успішно відповіли, книг нема) — незмінно, чесне "нічого не
  знайдено" на рівні кожної секції (`ProviderResultsSection`'s `data.length === 0 → null`,
  секція просто не рендериться — той самий візуальний ефект, що й раніше для генуїнної
  порожності).
- **Часткова помилка** — розділ 8.
- **Повна помилка всіх джерел** — окремий, явно НЕ "нічого не знайдено" стан (розділ 8), бо пошук
  фактично не відбувся.
- **Offline** — `useIsOffline()`/`OfflineNotice`, НЕ зачеплено цим пасом, лишається окремим,
  першим за пріоритетом станом (перевіряється РАНІШЕ за `allCatalogFailed` у JSX-дереві) — офлайн
  ніколи не плутається з "провайдер відповів помилкою", і не перетворює Search на "лише
  мережевий" екран (Особистий пошук — повністю локальний, цього стану взагалі не бачить).
- **Retry** — ручний, за секцією чи за всіма одразу; не створює дублікатів книг (сама дедуплікація
  за ISBN — незмінна чиста функція, перераховується з нуля кожен рендер, не накопичує стан);
  не спамить провайдерів (`retry:false` у `useProviderSearch`, жодного нового автоматичного
  ретраю); не обходить rate limiting (ретрай — це просто новий одиничний запит, той самий шлях,
  що й перший, ніякого спеціального "обходу" 429 немає).

## 10. Security

- **Google Books API-ключ** — не читається й не використовується цим клієнтським кодом узагалі
  (з V1.6.1 Фази 4); Edge Function (`supabase/functions/google-books-proxy/`) НЕ змінена цим
  пасом.
- **ISBNdb API-ключ (платний)** — те саме, живе виключно на сервері
  (`supabase/functions/isbndb-proxy/`), НЕ змінена цим пасом.
- **Supabase anon key** — і далі використовується для автентифікації запиту ДО проксі (це
  публічний, безпечний у бандлі ключ, не секрет постачальника даних) — підтверджено регресійним
  тестом, що серіалізований клієнтський результат (`JSON.stringify(outcome)`) НІКОЛИ не містить
  жодного значення ключа з мокнутого середовища, для success- ТА error-результату.
- **`service_role`** — не використовується жодним клієнтським кодом цього пасу (не торкались).
- Жодної зміни серверного коду Edge Functions цим пасом — лише класифікація ВЖЕ отриманої
  клієнтом HTTP-відповіді.

## 11. Tests Added (exact list)

Нові файли (6), + 56 нових тестів:
- `src/lib/providerSearchError.test.ts` — 6 тестів.
- `src/lib/searchProviderCombine.test.ts` — 18 тестів.
- `src/data/repositories/calendarHistoricalConsistency.test.ts` — 3 тести (соло-книга,
  жива+історична в тому самому місяці, перечитування+видалення).
- `src/data/remote/googleBooksProxyClient.test.ts` — 11 тестів.
- `src/data/remote/isbndbProxyClient.test.ts` — 10 тестів.
- `src/data/providers/GoogleBooksProvider.test.ts` — 8 тестів (включно з регресійним блоком
  `lookupByISBN`).

Модифікований файл: `src/data/repositories/ReadingRunRepository.test.ts` — один існуючий тест
переписано (раніше стверджував баговану поведінку Gap B), додано один новий (CASCADE-контроль):
+1 тест до файлу.

**Разом: 57 нових/перероблених тестів у 7 файлах** (точне число з підрахунку `it(` у
щойно написаних/змінених файлах цієї сесії — не округлено, не екстрапольовано).

## 12. Quality Gates

**Історія по кроках (для чесності — без заднього числа):** перший деплой цього пасу (28 файлів)
пішов на пристрій власника з усіма трьома воротами позначеними `NOT VERIFIED (this session)`,
бо це середовище не мало `device_bash`-доступу до машини власника. Власник продукту сам виконав
усі три команди на `C:\polytsya-m11` і надіслав повний термінальний вивід того самого дня
(2026-09-15) — це і є перший РЕАЛЬНИЙ прогін усіх трьох воріт для роботи цього пасу. Нижче —
підсумок цього прогону та фіксів, застосованих у відповідь.

| Ворота | Статус (перший реальний прогін власника) | Деталі |
|---|---|---|
| `npm test` (Jest) | **AUTOMATED TEST VERIFIED** | 88 suites / 1214 tests, 0 falls, 5.683s. Усі 57 нових/переписаних тестів цього пасу пройшли з ПЕРШОГО реального виконання; жоден із 88 pre-existing suites не зламано жодною зміною (Calendar Gap A/B фікси, Search error model у 10+ файлах). |
| `npx tsc --noEmit` | **CODE VERIFIED — PASSED (re-run confirmed)** | Перший прогін знайшов 5 помилок у 3 файлах — `app/isbn-scan.tsx` (виробничий виклик `provider.searchBooks()`, не приведений до нового `ProviderSearchOutcome`), `src/features/tomorrow/useTomorrowRecommendation.ts` (той самий патерн, інший виробничий виклик), `calendarHistoricalConsistency.test.ts` (дві `noUncheckedIndexedAccess`-помилки в новому тесті). Усі 5 виправлено, повторно задеплойовано на `C:\polytsya-m11`, і власник ПОВТОРНО запустив `npx tsc --noEmit` — вивід порожній, команда завершилась без жодного рядка помилки. **0 помилок підтверджено реальним другим прогоном.** |
| `npx eslint . --max-warnings=0` | **CODE VERIFIED — PASSED locally (re-run confirmed), REGRESSED under CI, RE-FIXED** | Перший прогін знайшов 6 попереджень (`--max-warnings=0` → падіння) у 3 нових тестових файлах — `@typescript-eslint/no-require-imports` на `require()` у helper'ах перезавантаження модуля, плюс 3 "unused eslint-disable directive" (неправильна назва правила в коментарі). Виправлено переходом на `jest.resetModules()` + динамічний `import()`; власник ПОВТОРНО запустив `npx eslint . --max-warnings=0` локально — 0 попереджень. Але `import()` виявився несумісним із `jest-expo` (рядок CI нижче) — довелось повернутись до `require()`, цього разу з ПРАВИЛЬНО названим disable-коментарем. Локальний ESLint-прогін ПІСЛЯ цього повернення ще не перезапускався інструментом власником (мав би дати той самий 0, бо синтаксично ідентичний першому виправленому стану), але `require()` із правильним `no-require-imports`-disable — це рівно той патерн, що вже пройшов реальний локальний ESLint раніше в цій самій сесії (до помилкового переходу на `import()`), тож ризик тут мінімальний. |
| `npm test` (Jest, локально) | **AUTOMATED TEST VERIFIED (pre-regression state only)** | 88 suites / 1214 tests, 0 falls — але цей прогін був ДО переходу на `import()` (третя регресія нижче), тобто не покривав код, який зрештою зламав CI. `jest` із поверненням на `require()` локально в цій сесії не перезапускався (немає `device_bash`) — покладаємось на те, що `require()`-варіант ідентичний тому, що вже реально проходив Jest раніше в цій самій сесії. |
| CI (GitHub Actions), прогін #1 | **RAN — FAILED (dynamic import), FIX DEPLOYED** | Власник задеплоїв (git push, commit `b364eca`) — перший реальний CI-прогін цього пасу, job `Typecheck, lint, tests` (job `Edge Functions (Deno)` пройшов). Провал: 3 suites / 29 tests `Jest`-failed, `TypeError: A dynamic import callback was invoked without --experimental-vm-modules` у трьох нових тестових файлах — `jest-expo`/`babel-preset-expo` не транспілює динамічний `import()`; ЛОКАЛЬНИЙ Jest ніколи фізично не виконував версію з `import()` (власник перезапускав лише `tsc`/`eslint` після цього фіксу), тому лише CI це впіймав. Виправлено поверненням на `require()`. |
| CI (GitHub Actions), прогін #2 | **RAN — FAILED (моя помилка в фіксі), FIX DEPLOYED** | Власник задеплоїв фікс прогону #1 (git push, commit `6a75cc6`) — job `Lint` знову впав: той самий текст "A `require()` style import is forbidden" плюс "Unused eslint-disable directive" на сусідньому рядку, у тих самих трьох файлах. Причина — НЕ нова регресія коду, а моя власна помилка редагування: `eslint-disable-next-line` діє РІВНО на наступний рядок, а я розташував багаторядковий пояснювальний коментар МІЖ директивою й фактичним `require(...)` — директива вимикала попередження на порожньому коментарному рядку, а не на рядку з `require()`. Виправлено переміщенням директиви на рядок безпосередньо перед `return require(...)` в усіх трьох файлах. |
| CI (GitHub Actions), прогін #3 | **RAN — PASSED (обидва job'и)** | Власник задеплоїв фікс прогону #2 (git push, commit `17dabdb`) — job #102: `Typecheck, lint, tests` — **Success** (1m 25s, `tsc` + `eslint --max-warnings=0` + повний `jest`), `Edge Functions (Deno)` — **Success** (9s). Загальна тривалість 1m 29s. **Перший повністю зелений CI-прогін для роботи цього пасу.** |

**Ворота закрито.** `jest`/`tsc`/`eslint` мають реальні локальні PASSED-прогони; три послідовні
реальні CI-прогони пройшли повний цикл "знайдено → виправлено → перевірено" двічі (регресія
динамічного `import()`, потім механічна помилка розташування `eslint-disable-next-line`) і
завершились третім, повністю зеленим прогоном. Усі чотири доступні quality gates
(`jest`/`tsc`/`eslint`/CI) підтверджені реальним виконанням із зеленим результатом. Фізичне
тестування на пристрої (розділ 15, окремий чек-лист) лишається окремо "PENDING OWNER CHECK" —
це ручна UI-валідація власника, не quality gate цього розділу.

## 13. Migrations

**НЕМАЄ.** Обидва Calendar-фікси — зміна одного SQL-виразу існуючого запиту (не схеми таблиці,
не нової колонки), Search-фікс — виключно клієнтський TypeScript-шар. Жодного нового файлу в
`src/data/db/migrations/`.

## 14. Product Surfaces Intentionally Unchanged

- **Home** — жодного файлу під `src/components/home/`/`app/(tabs)/index.tsx` не читано й не
  змінено цим пасом.
- **Library** (крім двох Calendar-репозиторних методів, які й так уже існували з попередньої
  фази) — `UserBookRepository.listAll`/`listByStatus`/`listByIds` (alive-only Library-запити) —
  БЕЗ ЗМІН, підтверджено читанням файлу.
- **Book Details** — не торкались.
- **Seasons** (`docs/READING_SEASONS.md`, `listFinishedBetween`) — СВІДОМО не зачеплений,
  розділ 3/4.
- **Trends/Statistics** — не торкались.
- **ReadingRun-архітектура** — `start`/`finish`/`discard`/схема таблиці — БЕЗ ЗМІН; правки
  торкнулись лише READ-запиту (`listStartedOrFinishedBetween`), не lifecycle.
- **Backup-архітектура** — не торкались.
- **Own Catalog ingestion/дедуп/зберігання/ранжування** — не торкались;
  `SharedCatalogProvider`/`CuratedCatalogProvider` отримали лише structural-обгортку форми
  повернення (`{status:'success', items}`), жодної зміни власної логіки/помилок цих двох джерел.
- **Calendar visual design** (композиція клітинки, cover-стек, spacing, анімації, типографіка) —
  БЕЗ ЖОДНИХ змін — цей пас торкався лише даних/запитів.

## 15. Owner Manual Checks (PENDING OWNER CHECK)

`docs/OWNER_MANUAL_TEST_LOG.md`, новий розділ 7 (`FOUNDATION FINAL POLISH`), групи A-G (Calendar,
7 пунктів) і H-O (Search, 8 пунктів) — жодна клітинка НЕ позначена самим агентом, як і у всьому
решта журналу.

## 16. Remaining Known Issues

**Critical:** немає.

**High:** немає.

**Medium:** немає. CI (розділ 12) пройшов через два провальні прогони (регресія динамічного
`import()`, потім механічна помилка розташування `eslint-disable-next-line`) і завершився третім,
повністю зеленим прогоном (`Typecheck, lint, tests` + `Edge Functions (Deno)`, обидва Success).
Обидві знахідки виправлено й підтверджено тим самим інструментом (CI), що їх знайшов — не лише
задеплойовано й "мало б пройти".

**Найважливіший урок цього циклу (документально, не відкрита проблема):** дві регресії (`app/isbn-scan.tsx`,
  `useTomorrowRecommendation.ts`) — це виробничі виклики `provider.searchBooks(...)`, які
  існували ДО цього пасу й були зламані зміною контракту повернення (`RawProviderBook[]` →
  `ProviderSearchOutcome<RawProviderBook>`), але не потрапили в ручне рев'ю під час реалізації,
  бо `grep`-пошук усіх викликів `.searchBooks(` по всьому дереву `app`/`src` було виконано лише
  ПІСЛЯ отримання реального виводу `tsc`, а не ДО написання фіксів. Це підтверджує: ручне
  вичитування, хоч і знайшло дві інші регресії самостійно, не замінює компілятор — воно ловить
  те, що вичитувач вирішив перевірити, а не гарантовано все дерево викликів.

**Low:**
- `search.tsx`'s комбінаторна логіка (`isProviderSettled`/`haveAllProvidersFailed`) тепер
  юніт-тестована через `searchProviderCombine.ts`, але сам компонент (`ProviderErrorNotice`/
  `ProviderResultsSection`/JSX-дерево) і далі без компонентних тестів — той самий, задокументований
  усталений house-конвент проєкту (жодного `.test.tsx` у всьому репозиторії), верифікується
  ручним тестуванням (розділ 15), не React Testing Library.

**Future (НЕ нові задачі цього пасу, лише спостереження):**
- Той самий Gap B (start/finish-мітки soft-deleted книги) лишається невиправленим для Reading
  Seasons (`listFinishedBetween`) — свідомо поза межами мандату; якщо продукт колись вирішить
  поширити History Preservation на Seasons, це окрема, майбутня задача з власним продуктовим
  рішенням (Seasons — емоційна пам'ять, не голий список фактів, тож рішення там не буде
  автоматичним копіюванням Calendar-підходу).

## 17. Foundation Closure Verdict

**FOUNDATION CLOSED.**

Жодного Critical data-integrity дефекту, жодного High ReadingRun/session дефекту, жодного High
backup/restore дефекту, жодного витоку клієнтського секрету не залишено відкритим у коді. Обидва
Calendar-гепи закрито точково, підтверджено до/після живим читанням коду. Search більше не маскує
збій провайдера як генуїнний порожній результат — новий, наскрізний, тестований дискримінований
тип проходить крізь усі шари. 57 нових/перероблених тестів написано проти реальних сигнатур,
тепер підтверджено ПОВНІСТЮ ЗЕЛЕНИМ CI-прогоном (job #102, `Typecheck, lint, tests` +
`Edge Functions (Deno)`, обидва Success).

**Повний ланцюжок знахідок цього пасу (сім пунктів, кожен знайдений іншим шаром перевірки —
доказ, чому жоден шар не можна пропускати):**
1. `GoogleBooksProvider.lookupByISBN` — власне ручне рев'ю, до деплою.
2. Відсутній реекспорт типів у `src/data/providers/index.ts` — власне ручне рев'ю, до деплою.
3. `app/isbn-scan.tsx` — реальний `tsc`-прогін власника, після деплою.
4. `useTomorrowRecommendation.ts` — той самий `tsc`-прогін.
5. Два `noUncheckedIndexedAccess` у власному тесті — той самий `tsc`-прогін.
6. `import()` несумісний із `jest-expo` у трьох тестових файлах — перший реальний CI-прогін
   власника (`git push`, commit `b364eca`), ПІСЛЯ того, як локальні `tsc`/`eslint` вже
   підтвердили 0/0 на цьому самому коді — бо несумісність `import()` із транспіляцією
   `jest-expo` проявляється лише при фактичному ВИКОНАННІ Jest, чого жоден локальний прогін
   власника після цього конкретного фіксу не зробив.
7. Неправильне розташування `eslint-disable-next-line` (моя власна помилка в фіксі №6, не нова
   регресія коду) — другий реальний CI-прогін (commit `6a75cc6`).

Усі сім виправлено й задеплойовано (byte-verified) в межах цієї ж сесії, і фікс останніх двох
(№6 і №7) підтверджено тим самим інструментом, що їх знайшов — третій CI-прогін (commit
`17dabdb`, job #102) пройшов повністю зелений. `jest`/`tsc`/`eslint`/CI — усі чотири
автоматизовані quality gates цього середовища тепер підтверджені реальним виконанням із зеленим
результатом; жоден більше не позначений "NOT VERIFIED" чи "pending".

Що лишається поза межами цього пасу (дія, яка за визначенням належить власнику поза цим чатом,
не quality gate): фізичний ручний прогін на реальному пристрої (розділ 15,
`docs/OWNER_MANUAL_TEST_LOG.md` групи A-G/H-O) — навмисно "PENDING OWNER CHECK", бо ані ця сесія,
ані попередні не мають доступу до фізичного пристрою власника для UI-тестування.

**Після цього звіту — СТОП.** Жодного нового V1.7/V1.6.3/фічі/redesign/AI/соціальних
функцій/Auth/розширення Own Catalog цим пасом не розпочато й не заплановано.
