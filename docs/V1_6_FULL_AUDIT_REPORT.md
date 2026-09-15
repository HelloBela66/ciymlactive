# «Полиця» (POLYTSIA) — повний чесний аудит стану після V1.6

**Дата звіту:** 2026-09-12
**Автор:** AI-агент (Claude), за дорученням власника продукту, як незалежний технічний/продуктовий аудит для Product/Technical Architect
**Обсяг:** повний знімок коду після завершення 22 фаз V1.6 (поверх 16 фаз V1.5 і 12 milestone'ів V1)

## Як читати цей документ

Це **не** маркетинговий чи "milestone completion" звіт. Мета, поставлена власником продукту прямим текстом:
"Не намагайся довести, що milestone успішний. Мета — показати реальний стан." Кожна знахідка нижче —
позитивна чи негативна — супроводжується тегом доказовості:

- **CODE VERIFIED** — перевірено прямим читанням коду, з точним посиланням на файл/рядок.
- **AUTOMATED TEST VERIFIED** — підтверджено існуючим автоматичним тестом.
- **CI VERIFIED** — підтверджено реальним проходженням CI (в історії проєкту є один задокументований
  такий факт — run #55, зелений, job "Typecheck, lint, tests", 584/584 тестів; докладніше — розділ 32).
- **DEVICE VERIFIED** — підтверджено реальним пристроєм. У цьому аудиті це стосується РІВНО одного
  вузького факту: реальних терміналних логів з Expo Go на iPhone, наданих власником продукту в цій сесії
  (показали помилки скасованих fetch-запитів під час пошуку книг) — і ніде більше.
- **NOT VERIFIED** — найчастіший тег цього звіту. Переважна більшість UX/поведінкових тверджень НЕ
  перевірялась вручну на пристрої в межах цієї сесії.
- **HYPOTHESIS** — обґрунтоване припущення на основі коду, явно позначене як таке, не факт.

**Важлива методологічна примітка, додана під час фінального синтезу цього звіту.** Дослідницькі
під-агенти, що готували розділи цього звіту, працювали не напряму з диском власника продукту, а з
попередньо застейдженим "дзеркалом" застейджених файлів у хмарному робочому середовищі (щоб уникнути
залежності від невизначеної підтримки MCP/device-bridge інструментів у під-агентів). Один раз ця різниця
призвела до хибної знахідки: розділ 40 спочатку стверджував, що `src/design/ErrorToastProvider.tsx`
фізично відсутній і застосунок не компілюється — насправді файл існує на реальному пристрої, а причина
хибної знахідки — вузька маска стейджингу (`design/*.ts`, що пропустила другий `.tsx`-файл у тій самій
директорії) в самому інструментарії цього аудиту, не дефект коду застосунку. Знахідку виявлено, перевірено
напряму на пристрої власника продукту і виправлено в розділі 40.5 перед включенням у цей фінальний
документ — залишена в тексті як пряме визнання, а не прихована. Це саме по собі важливий урок: **будь-яка
"файл відсутній"/"імпорт не резолвиться" знахідка з боку статичного аналізу дзеркала коду має нижчу
апріорну довіру, ніж CODE VERIFIED-знахідка про реальну поведінку чи структуру наявного коду**, і власнику
продукту варто мати це на увазі при читанні решти звіту.

---

## Розділ 1. Executive Summary

### 1.1 Загальний вердикт

«Полиця» після V1.6 — це технічно дисципліноване, архітектурно послідовне персональне рішення
(single-user, local-first, офлайн-first, повністю українською), написане з помітно вищою за типову
"vibe-coding" якістю: CODE VERIFIED нуль `TODO`/`FIXME`-маркерів і нуль використань `any` у всьому `src/`
(розділ 58), послідовна repository-архітектура, реальний домен-шар з чистими функціями (пороги, spoiler-safe
логіка, winter year-ownership), і 584 automated-тести (CI VERIFIED, run #55), що покривають переважно
domain-логіку та repository-шар.

Але це **не** продукт, готовий до публічного релізу чи навіть до впевненої передачі іншій людині для
щоденного використання без застережень. Три категорії причин, кожна з окремим доказом нижче:

1. **Майже нуль реальної перевірки на пристрої.** `docs/MANUAL_UX_TEST_V1_6.md` — чесно порожній чек-лист,
   0 із 17 сценаріїв позначено пройденими (CODE VERIFIED, розділ 38). Єдиний реальний контакт із пристроєм
   у всій робочій історії проєкту — один епізод з мережевими логами пошуку книг. Це означає: увесь UX
   функціонал 22 фаз V1.6 (капсули, recall, spoiler-safe, memory card sharing, fingerprint, seasons,
   before/after) **ніколи не бачив реального екрана**.
2. **Знайдено конкретні, відтворювані в коді дефекти, не гіпотетичні.** Найважливіші: перехід
   `finished → did_not_finish` не скидає `finished_at`, тож Activity History/On This Day назавжди
   показують хибну подію "книгу завершено" (розділ 13, CODE VERIFIED); екран Memory Card
   (`app/memory/[workId].tsx`) не застосовує spoiler-safe фільтрацію журнальних записів, хоча два сусідні
   екрани (`work/[workId]`, `recap/[workId]`) — застосовують (розділ 42.3, CODE VERIFIED); ключ
   `EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY` лежить прямо в клієнтському бандлі без проксування й rate limiting,
   на відміну від ISBNdb-ключа (розділ 26, CODE VERIFIED); `CHANGELOG.md` для "Фази 19" стверджує
   відсутність camera-scan функціоналу як причину не реалізувати haptic feedback, хоча `app/isbn-scan.tsx`
   реально використовує `expo-camera` для сканування (розділ 2, CODE VERIFIED, пряма суперечність
   документації й коду).
3. **Продуктова складність зростає швидше за концептуальну ясність.** Мінімум три незалежні механізми
   відповідають на питання "що читати далі" (Tomorrow-рекомендація, One Book Picker, TBR Reality Check) і
   три — на "згадати книгу" (Book Capsule, Recall, Book Memory), без спільного обчислювального шару чи
   явного розмежування, коли яким користуватись (розділ 44, CODE VERIFIED накладання). П'ять незалежних
   аналітичних екранів (Statistics/Profile/Fingerprint/Wrapped/Seasons) також без спільного шару.

### 1.2 Вердикти по доменах (READY / READY WITH LIMITATIONS / PARTIAL / NOT READY)

| Домен | Вердикт | Обґрунтування (коротко, деталі — у відповідних розділах) |
|---|---|---|
| Архітектура / структура коду | **READY** | Послідовна repository/domain/features-структура, 0 `any`, 0 TODO, design-система реально відповідає документації (розділ 35, рідкісний випадок узгодженості doc↔код). |
| Core reading loop (додати книгу → читати → прогрес → завершити) | **READY WITH LIMITATIONS** | Дані/логіка коректні (CODE VERIFIED), але транзакційна серцевина (`ReadingSessionRepository.start/finish/pause/resume`) майже не покрита тестами (розділ 31), і жодного разу не пройдена вручну на пристрої (розділ 38). |
| Backup / відновлення даних | **READY WITH LIMITATIONS** | Repository-рівень AUTOMATED TEST VERIFIED, але бекапи — незашифрований plaintext JSON (розділ 58), і реальний round-trip на пристрої NOT VERIFIED. |
| Безпека (Edge Functions, ключі) | **PARTIAL** | RLS deny-all + SECURITY DEFINER RPC архітектурно правильні (CODE VERIFIED), rate limiting реальний; але Google Books ключ незахищений у клієнті, `verify_jwt=true` — недокументована в коді deploy-time умова, нуль тестів на Edge Functions і нуль CI-покриття для них (розділ 26, 32). |
| Приватність | **READY WITH LIMITATIONS** | Журнал/нотатки/lore/оцінки CODE VERIFIED залишаються локально; але spoiler-safe leak на Memory Card screen (розділ 42.3) і публічно хостована обкладинка-фото користувача (розділ 27) — конкретні винятки з принципу. |
| Тестування / CI | **PARTIAL** | 584 тести зелені в CI (CI VERIFIED), але покриття нерівномірне: сильне на repository/domain, майже відсутнє на `src/features/**`-хуках і на транзакційній серцевині читання; Deno Edge Functions поза CI повністю (розділ 31-32). |
| Продуктивність | **NOT VERIFIED (HYPOTHESIS з ризиками)** | Жодного профілювання на пристрої не проводилось; знайдено конкретний архітектурний ризик — `strftime()`-запити, що унеможливлюють використання індексів (розділ 29-30). |
| Accessibility | **PARTIAL** | Гарне покриття `accessibilityRole` на інтерактивних елементах (розділ 37.3), але реальна поведінка з VoiceOver/TalkBack NOT VERIFIED, і `reduceMotionEnabled` збирається, але ніде не споживається. |
| Ручне тестування на пристрої (V1.6-функціонал) | **NOT READY** | 0 із 17 сценаріїв `MANUAL_UX_TEST_V1_6.md` пройдено (CODE VERIFIED, документ сам це визнає). |
| Feature scope / складність продукту | **PARTIAL** | Реальні накладання функціоналу (розділ 44), відсутній onboarding (розділ 46) — новий користувач залишається сам на сам з порожньою бібліотекою й десятками концепцій без напрямної. |
| Документація | **READY WITH LIMITATIONS** | Після документаційного проходу цієї сесії (`ARCHITECTURE.md`, `V2_READINESS.md`, `ROADMAP.md`, `PRODUCT.md`, `TESTING.md`, `LIBRARY_UX.md`) розбіжності з кодом переважно усунуто, але `CHANGELOG.md` містить принаймні одну пряму фактичну помилку (Фаза 19, camera-scan, розділ 2). |
| Готовність до V2 (auth/sync/AI) | **PARTIAL** | `deleted_at` soft-delete є на ключових таблицях, але відсутній на `book_capsule`; `deviceId` — не заготовка під auth-акаунт; продуктивна оцінка складності — розділи 53-55. |

### 1.3 Що це означає практично

«Полиця» — сильна технічна основа для персонального проєкту одного розробника з реальним, продуманим
продуктовим баченням (spoiler-safe читання, персональний lore, глибока пам'ять про прочитане — реально
диференційовані ідеї, розділ 50). Але між "код написано і typecheck проходить" і "готово для реального
щоденного використання, тим паче для іншої людини чи публічного релізу" лишається суттєва дистанція,
виміряна не в рядках коду, а в: одному циклі реального ручного тестування на пристрої, закритті трьох
конкретних знайдених дефектів (DNF `finished_at`, spoiler leak на Memory Card, незахищений Google Books
ключ), і продуктовому рішенні щодо трьох дублюючих "що читати далі"/"згадати книгу" механізмів.

Детальні рекомендації — розділ 62 (3 сценарії наступних кроків), розділ 63 (власна критична рекомендація
цього аудиту), розділ 64 (фінальна оцінна картка по 14 вимірах).

---

# Розділ 2 — Пофазний diff V1.5 → V1.6 (22 фази)

**Джерело:** `CHANGELOG.md` (4671 рядків), розділ `## POLYTSIA V1.6, Фаза N — …`, рядки 77–682
(файл впорядкований у зворотному хронологічному порядку — Фаза 22 вгорі, Фаза 0 внизу). Усі 22
фази з очікуваного списку ЗНАЙДЕНО в CHANGELOG.md з ідентичною нумерацією й майже ідентичними
назвами (є кілька відхилень у формулюванні назви — позначено нижче). Додатково є Фаза 0b
(«Критичне repository-тестове покриття») і окремий безномерний запис "POLYTSIA V1.6 —
Документація (доробка після завершення 22 фаз)" від 2026-09-12, який не є окремою фазою ТЗ, а
пост-фактум документаційним проходом.

**Метод верифікації:** для кожної фази звірено 2-5 конкретних тверджень CHANGELOG з реальним
кодом (Read/Grep/Glob по `src/`, `app/`, `src/data/db/migrations/`). Позначки доказів: **CODE
VERIFIED** (сам прочитав відповідний код і підтверджую), **NOT VERIFIED** (лишилось лише на слово
CHANGELOG, не перевірено окремо мною), **DISCREPANCY** (CHANGELOG стверджує одне, код показує
інше).

**Міграції:** застейджено 18 файлів, `001_base_schema.ts` … `018_shelf_book_index.ts` —
відповідає фінальному стану після Фази 20. Нумерація міграцій 012-018 один-в-один відповідає
фазам 4,5,6,9,11,12,20 (нижче звірено індивідуально).

---

## Фаза 0 — Аудит

**Що зроблено (за CHANGELOG.md, 2026-09-11):** повний UX і технічний аудит наявного застосунку
проти ТЗ V1.6, ДО імплементації. Метод — 3 паралельні дослідницькі агенти: (1) UI/UX Home/
Бібліотека/Book Details, (2) доменні типи (`bookMemory`, `journalEntry`, `readingSession`) на
предмет перевикористання, (3) історія міграцій 001-011 — підтверджено адитивність без
конфліктів. Явно перелічені знахідки, свідомо ВІДКЛАДЕНІ до пізніших фаз (не виправлені цією
фазою): Бібліотека/Home невідповідність тапів → Фаза 1; `useWrappedYear` vs Reading Seasons →
Фаза 13; Character vs LoreEntity вибір моделі → Фаза 9/10; DNF-локація → перед Фазою 12.

**Торкнуті файли:** сама фаза не змінює код застосунку — це дослідницький прохід; артефакт —
запис у CHANGELOG.md і сам `docs/V1_6_SPEC.md` (як ТЗ, проти якого звірявся аудит).

**Верифікація:** `docs/V1_6_SPEC.md` існує (CODE VERIFIED — файл присутній). Сам зміст
"3 паралельні дослідницькі агенти" і конкретні знахідки — NOT VERIFIED (це методологічне
твердження про процес, не про код; немає способу верифікувати "що саме досліджували агенти"
постфактум, окрім того, що описані ними напрямки (Бібліотека/Home, DNF, Reading Seasons)
дійсно стали окремими фазами нижче — це непряме підтвердження послідовності, не доказ самого
методу).

---

## Фаза 0b — Критичне repository-тестове покриття

**Що зроблено (за CHANGELOG.md):** quality gate ТЗ вимагав покриття `UserBookRepository`,
`ReadingProgressRepository`, `EditionRepository`, `RatingRepository` ДО фіча-роботи. Жоден з
чотирьох репозиторіїв не мав жодного тесту. Додано 4 нові файли інтеграційних тестів (~20+
кейсів) на `better-sqlite3`-харнессі. Перевірено: `npm test` — 34 suites, 279 тестів (було 229).
CI run #28 — Success, commit `e1dc442`.

**Торкнуті файли:** `src/data/repositories/UserBookRepository.test.ts`,
`ReadingProgressRepository.test.ts`, `EditionRepository.test.ts`, `RatingRepository.test.ts`.

**Верифікація:** CODE VERIFIED — усі 4 файли присутні в дереві (`Glob` підтвердив). Конкретне
твердження про `setSpoilerSafeEnabled`-тест (згадане пізніше, у Фазі 21, як "додано цією фазою
пропуск") НЕ суперечить: сам `setSpoilerSafeEnabled`-тест з'явився пізніше (Фаза 21), Фаза 0b
охоплювала лише базові CRUD/переходи статусу — це узгоджується. Число "279 тестів"/"34 suites" —
NOT VERIFIED (не запускав `npm test` в цьому дослідженні, лише читав файли; кількість testfiles
у Glob на кінець V1.6 = 48, що більше за 34 — очікувано, бо це підсумок ПІСЛЯ Фази 0b, а не
фінальний стан).

---

## Фаза 1 — Library UX (редизайн)

**Що зроблено (за CHANGELOG.md):** реалізовано з навмисним звуженням проти буквального ТЗ.
Список/сітка перемикач (`FlatList` з `key={viewMode}`) з persist через `expo-secure-store`.
Сортування через нижнє вікно `LibrarySortSheet` (дефолт/назва/автор/дата оновлення). Дві
"розумні" горизонтальні стрічки на вкладці "Усі" — "Давно чекають"/"Нещодавно завершені"
(діляться queryKey з відповідною вкладкою статусу — без нового SQL). Long-press швидкі дії
(`BookQuickActionsSheet`): улюблене/зміна статусу/прибрати з бібліотеки. Свідомо НЕ додано:
карусель "Читаю зараз"/"Нещодавно додані" (дублювали б верх списку "Усі"); повноцінна
multi-filter-система (замінена крапкою-індикатором на кнопці сортування); додавання на полицю з
long-press-меню. Перевірено: `npm run typecheck`, `npm test` (34 suites, 279 тестів — без змін),
`eslint --max-warnings=0` (0).

**Торкнуті файли:** нові — `src/lib/libraryPreferenceStorage.ts`,
`src/components/library/{LibrarySortSheet,BookQuickActionsSheet,LibraryCarousel}.tsx`; змінені —
`src/features/library/useLibrary.ts`, `app/(tabs)/library/index.tsx`.

**Верифікація:** CODE VERIFIED — усі 4 нові файли присутні (`ls` підтвердив: `LibrarySortSheet.tsx`,
`BookQuickActionsSheet.tsx`, `LibraryCarousel.tsx`, `libraryPreferenceStorage.ts`). Твердження
про "34 suites, 279 тестів — без змін" — NOT VERIFIED (не запускав тести).

---

## Фаза 2 — Book Details (редизайн)

**Що зроблено (за CHANGELOG.md):** аудит (Фаза 0) назвав `app/work/[workId].tsx` найпроблемнішим
екраном ієрархії — ~10 розділів рендерились одним суцільним списком. Свідомо НЕ обрано повний
редизайн з hero+вкладками (розглядався, відкинутий як непропорційний ризик). Замість цього —
нова перевикористовувана `CollapsibleSection` (той самий "+ toggle" ідіом, що вже був у
`GenreTagsSection`/`JournalSection`). Основний цикл читання лишився завжди розгорнутим;
довідкові розділи ("Жанри та теги", "Історія читання", "Видання") — згорнуті за замовчуванням.
Технічно: `useReadingHistory(userBookId)` раніше викликався двічі незалежно — тепер піднятий
один раз у `BookDetailsScreen` і переданий обом секціям як проп `sessions`.

**Торкнуті файли:** `src/components/ui/CollapsibleSection.tsx` (новий), `app/work/[workId].tsx`.

**Верифікація:** CODE VERIFIED — `CollapsibleSection.tsx` присутній у `src/components/ui/`;
`app/work/[workId].tsx` містить 8 входжень `CollapsibleSection` (Grep підтвердив). Твердження про
"double-hook-call" виправлення (proп `sessions`) — NOT VERIFIED окремо (не звіряв diff до/після,
лише підтверджено, що компонент і секції існують у фінальному стані).

---

## Фаза 3 — «Цей день у твоєму читанні»

**Що зроблено (за CHANGELOG.md):** нова контекстна функція на Home — власні читацькі спогади з
цієї календарної дати в минулі роки. Суцільно похідна (derived) модель — жодної нової таблиці.
Один SQL-запит `OnThisDayRepository.listByMonthDay` (`UNION ALL` через сесії/старт/фініш/
нотатки/цитати) — усі роки одразу. `strftime`-запит зсувається на локальний offset пристрою
перед витягом місяця+дня (тест на межі опівночі). 29 лютого — показується лише 29 лютого у
високосний рік (тест). Spoiler-евристика Фази 3 — свідомо спрощена, самодостатня (окрема
"без спойлерів" — майбутня Фаза 11).

**Торкнуті файли:** `src/data/repositories/OnThisDayRepository.ts`, `src/lib/onThisDay.ts`,
`app/on-this-day.tsx`, `app/day/[date].tsx`.

**Верифікація:** CODE VERIFIED — `OnThisDayRepository.listByMonthDay` реально містить 4 `UNION
ALL` (5 гілок джерел: sessions/started/finished/notes/quotes — Grep підтвердив); `app/on-this-day.tsx`
присутній у дереві routes. Твердження про "priority = 5 фолбек" (нефаворитна нотатка/цитата без
finished/session/started) — CODE VERIFIED окремо через Фазу 21 (там саме цю гілку доповнили
тестом: `onThisDay.ts:158: let priority = 5`, тест `onThisDay.test.ts:172` перевіряє
`summary.groups[0]?.memories[0]?.priority).toBe(5)`).

---

## Фаза 4 — «Капсула книги»

**Що зроблено (за CHANGELOG.md):** приватний snapshot вражень (стійка думка, речення-
формулювання, улюблений персонаж, посилання на момент щоденника, нагадування 3/6/12 міс. або
без). Нова таблиця `book_capsule` навмисно БЕЗ `UNIQUE(user_book_id)` — через відсутність
окремої сутності "прочитання"/reading-run (`user_book.finished_at` = дата ПЕРШОГО завершення,
не оновлюється при перечитуванні). "Поточна" капсула = найновіша за `created_at`. Дата
нагадування рахується від дати СТВОРЕННЯ капсули (не від фінішу книги), той самий якір навіть
при редагуванні. `date-fns#addMonths/addYears`, clamp на кінець місяця й 29 лютого (тести на
обидва). Розширено «Перевірку даних» двома новими перевірками; `book_capsule` у
`BACKUP_TABLE_ORDER`.

**Торкнуті файли:** `src/data/db/migrations/012_book_capsule.ts`, `app/capsule/[workId]/edit.tsx`,
`app/capsule/[workId].tsx`, `docs/BOOK_CAPSULES.md`.

**Верифікація:** CODE VERIFIED — прочитано повний док-коментар `012_book_capsule.ts`: підтверджує
буквально те саме обґрунтування "БЕЗ UNIQUE(user_book_id)" через відсутність reading-run сутності,
слово в слово узгоджується з CHANGELOG. Файли `app/capsule/[workId]/edit.tsx` і
`app/capsule/[workId].tsx` присутні в дереві routes.

---

## Фаза 5 — «Книга через час» (Recall)

**Що зроблено (за CHANGELOG.md):** гра-на-пам'ять над капсулою — спершу "Що ти пам'ятаєш зараз?",
ЛИШЕ ПІСЛЯ відповіді показує записане тоді. Новий екран `app/recall/[workId].tsx`. Нова таблиця
`capsule_recall` — append-only, РЕАЛЬНИЙ SQL FK на `book_capsule` з `ON DELETE CASCADE` (на
відміну від м'яких посилань у самій `book_capsule`). `book_capsule.opened_at` тепер проставляється
ВИКЛЮЧНО завершенням Recall-флоу (зміна поведінки проти тимчасової Фази 4). `src/lib/recall.ts` —
`formatTimeSinceFinished`, calendar-correct через `date-fns`, українська плюралізація.

**Торкнуті файли:** `src/data/db/migrations/013_capsule_recall.ts`, `app/recall/[workId].tsx`,
`src/lib/recall.ts`.

**Верифікація:** CODE VERIFIED — `013_capsule_recall.ts` містить рядок `book_capsule_id TEXT NOT
NULL REFERENCES book_capsule(id) ON DELETE CASCADE` (Grep підтвердив буквально). `app/recall/[workId].tsx`
присутній у дереві routes. `src/lib/recall.test.ts` існує (Glob-список тестів). Саму специфіку
"opened_at проставляється виключно завершенням Recall-флоу" (зміна поведінки проти Фази 4) —
NOT VERIFIED окремо (не звіряв повний код `BookCapsuleRepository`/`useRecall`-мутації на предмет
де саме викликається запис `opened_at`).

---

## Фаза 6 — «До/Після» (Before-After)

**Що зроблено (за CHANGELOG.md):** нова секція «До читання» на Book Details — optional
pre-reading-нотатка, видима лише поки книга "Читаю"; не можна створити/редагувати заднім числом
після фінішу книги. На Book Memory — секція «До / Після», що порівнює цю нотатку з уже наявними
"після"-даними ТОГО Ж екрана (без нового поля для "після"). Новий 5-й шаблон картки-спогаду
«До / Після». Нова таблиця `pre_reading_reflection` (`UNIQUE(user_book_id)`), `expected_rating` —
той самий CHECK/крок 0.5, що й `rating.value`, необов'язковий.

**Торкнуті файли:** `src/data/db/migrations/014_pre_reading_reflection.ts`, `src/lib/beforeAfter.ts`,
`app/work/[workId].tsx`, `app/memory/[workId].tsx`, `src/components/memory/MemoryCardPreview.tsx`.

**Верифікація:** CODE VERIFIED — міграція 014 реально містить `user_book_id TEXT NOT NULL UNIQUE
REFERENCES user_book(id) ON DELETE CASCADE` і `expected_rating REAL CHECK (... >= 0.5 AND <= 5
AND (expected_rating * 2) = CAST(...))` — точно відповідає опису "той самий CHECK/крок 0.5, що й
rating.value" (Grep підтвердив буквальний SQL). `src/lib/beforeAfter.ts` і `beforeAfter.test.ts`
присутні.

---

## Фаза 7 — «Як читалася ця книга» (Reading Experience Timeline)

**Що зроблено (за CHANGELOG.md):** без жодної нової таблиці/колонки — `reading_session.reading_experience`
(з V1.5 Фази 9) тепер зібраний по всій книзі в горизонтальну шкалу на Book Memory. Позиція
маркера — `endPage` сесії відносно `pageCount`, фолбек на хронологічний розподіл якщо `pageCount`
невідомий. Нижче 3 завершених сесій шкала НЕ рендериться. Стан сесії розрізняється ФОРМОЮ іконки,
не кольором.

**Торкнуті файли:** `src/lib/readingExperienceTimeline.ts`,
`src/components/memory/ReadingExperienceTimeline.tsx`, `app/memory/[workId].tsx`.

**Верифікація:** CODE VERIFIED — `src/lib/readingExperienceTimeline.ts` містить `export const
MIN_SESSIONS_FOR_READING_EXPERIENCE_TIMELINE = 3` і `if (sessions.length < MIN_SESSIONS...)
return []` — буквально відповідає "нижче 3 сесій — не рендериться" (Grep підтвердив точну назву
константи й межу). `readingExperienceTimeline.test.ts` присутній.

---

## Фаза 8 — «Давно не читав» / Recap screen (Stale Reading Recap)

**Що зроблено (за CHANGELOG.md):** нова секція «Давно не читав» на Book Details для статусів
"Читаю"/"Перечитую", коли з моменту останньої завершеної сесії минуло 14+ днів
(`STALE_READING_THRESHOLD_DAYS`). CTA веде на новий `app/recap/[workId].tsx` — ТЗ обмежує вміст
лише даними користувача (current page, останні сесії, останні записи щоденника, останній
улюблений момент), без AI-переказу сюжету. Секція персонажів/лору свідомо відсутня (Фази 9-10
ще не реалізовані на момент цієї фази).

**Торкнуті файли:** `src/lib/staleReading.ts`, `app/recap/[workId].tsx`.

**Верифікація:** CODE VERIFIED — `src/lib/staleReading.ts` містить `export const
STALE_READING_THRESHOLD_DAYS = 14` і `if (daysSinceLastSession < STALE_READING_THRESHOLD_DAYS)
return null` (Grep підтвердив точне число 14, як і заявлено). `app/recap/[workId].tsx` реально
оперує лише `currentPage`, `recentSessions`, `recentEntries`, `latestFavorite` (Grep підтвердив
відсутність будь-яких AI/зовнішніх викликів у цих змінних) — узгоджується з твердженням
"обмежений лише даними користувача". Коментар у самому файлі (рядки 58-62) буквально повторює
"characters/lore later if available" — підтверджує, що на момент Фази 8 персонажі дійсно ще не
існували (послідовність із CHANGELOG правдоподібна).

---

## Фаза 9 — «Персонажі» (Characters)

**Що зроблено (за CHANGELOG.md):** приватні нотатки про дійових осіб: ім'я, коротка примітка,
сторінка першої появи, необов'язкова реакція, "обране". Нова таблиця `lore_entity` (Migration 015)
НАВМИСНО уніфікована одразу під майбутню Фазу 10 — одна схема з колонкою `type` замість окремої
`character`-таблиці. Друга нова таблиця `journal_lore_link` — м'який зв'язок персонажа із записом
щоденника. Компактна картка `CharactersSection` на ДВОХ екранах: `app/work/[workId].tsx` і
`app/memory/[workId].tsx`.

**Торкнуті файли:** `src/data/db/migrations/015_lore_entity.ts`, `app/characters/[workId].tsx`,
`app/characters/[workId]/[entityId].tsx`.

**Верифікація:** CODE VERIFIED — `015_lore_entity.ts` реально створює `lore_entity` з колонкою
`type TEXT NOT NULL` (без CHECK, вільний список типів на рівні TypeScript) і окрему
`journal_lore_link` — док-коментар прямо цитує обґрунтування "уніфікована модель, а не окрема
character-таблиця", збігається з CHANGELOG слово-в-слово. **Важливо:** самі файли
`app/characters/[workId].tsx`/`[entityId].tsx` НА МОМЕНТ ФІНАЛЬНОГО СТАНУ (після Фази 10) досі
існують і повністю функціональні (163 і 321 рядок відповідно) — див. DISCREPANCY у Фазі 10 нижче,
де CHANGELOG стверджує, що ці екрани "перенесено", а насправді вони НЕ видалені.

---

## Фаза 10 — «Світ книги» (Personal Lore)

**Що зроблено (за CHANGELOG.md):** без нової міграції — схема `lore_entity` вже підтримувала 4
типи від Фази 9. Секція «Персонажі» перейменована на «Світ книги» (`LoreSection`). Екран
додавання отримав вибір типу — Персонаж/Місце/Термін/Організація. **"Екрани перенесено з
`app/characters/` до `app/lore/` для узгодженості з рештою назв фічі."**

**Торкнуті файли (за CHANGELOG):** `app/lore/[workId].tsx`, `app/lore/[workId]/[entityId].tsx`,
`src/design/loreEntityType.ts`, `docs/PERSONAL_LORE.md`.

**⚠️ DISCREPANCY (CODE VERIFIED):** твердження "екрани ПЕРЕНЕСЕНО з `app/characters/` до
`app/lore/`" — НЕ ВІДПОВІДАЄ реальному стану коду. Обидва набори файлів існують одночасно у
фінальному дереві:
- `app/characters/[workId].tsx` (163 рядки, повнофункціональний екран з формою додавання
  персонажа й списком, ідентичний за логікою новому `app/lore/[workId].tsx`)
- `app/characters/[workId]/[entityId].tsx` (321 рядок)
- `app/lore/[workId].tsx` та `app/lore/[workId]/[entityId].tsx` (333 рядки) — новіші, розширені
  на 4 типи сутностей

Перевірено (Grep) всі виклики навігації з `app/work/[workId].tsx` і `app/memory/[workId].tsx` —
обидва реально ведуть на `/lore/[workId]` (рядки 665 і 219 відповідно), жодного `router.push` на
`/characters/[workId]` в UI-коді НЕ знайдено — тобто старі екрани дійсно більше НЕ використовуються
з UI. Але вони НЕ видалені: `/characters/[workId]/[entityId].tsx` досі містить робочий
`router.push({ pathname: '/characters/[workId]/[entityId]', ... })`-посилання і повний CRUD-код
поверх `useLoreEntities`/`useCreateLoreEntity` — це не заглушка, а дублікат функціональності,
доступний прямим URL/deep-link. Коментар у `src/features/lore/useLoreEntities.ts:18` теж досі
буквально називає `app/characters/[workId].tsx` як точку використання хука — сама документація в
коді не була оновлена після "перенесення". Це реальна, конкретна розбіжність: CHANGELOG описує
чисте прибирання (move), реальний код залишив orphaned-дублікат (~480 рядків мертвого,
непов'язаного, але компільованого коду).

---

## Фаза 11 — режим «без спойлерів» (Spoiler-Safe Mode)

**Що зроблено (за CHANGELOG.md):** book-level перемикач "Приховувати майбутні записи" (Migration
016, `user_book.spoiler_safe_enabled`, DEFAULT ON). Записи щоденника й елементи "Світу книги" за
поточним прогресом ховаються зі списків на Book Details/Memory/Recap — нічого не видаляється,
лише клієнтська фільтрація. Сторінка з пріоритетом, відсоток прогресу як фолбек; запис без
позиції лишається видимим.

**Торкнуті файли:** `src/data/db/migrations/016_spoiler_safe.ts`, `src/lib/spoilerSafe.ts`.

**Верифікація:** CODE VERIFIED — `016_spoiler_safe.ts` містить `ALTER TABLE user_book ADD COLUMN
spoiler_safe_enabled INTEGER NOT NULL DEFAULT 1` (Grep підтвердив точний SQL, DEFAULT 1 = ON за
замовчуванням, як заявлено). `src/lib/spoilerSafe.ts` і `spoilerSafe.test.ts` присутні. Тест
`setSpoilerSafeEnabled` (Фаза 21) підтверджує обидва напрямки перемикача (`UserBookRepository.test.ts:221`).

---

## Фаза 12 — «Не дочитав» (DNF Improvement)

**Що зроблено (за CHANGELOG.md):** автоматична фіксація сторінки й дати при переході в "Не
дочитав" (Migration 017, `dnf_reflection`, `DnfReflectionRepository.captureIfMissing`, той самий
"знімок миті" підхід, що й `started_at`/`finished_at`). Поверх — необов'язкова причина з
фіксованого списку (7 варіантів) і довільна нотатка. Тон нейтральний, без обов'язкових полів.
`dnf_reflection` у бекапі.

**Торкнуті файли:** `src/data/db/migrations/017_dnf_reflection.ts`, `src/design/dnfReason.ts`,
`src/data/repositories/DnfReflectionRepository.ts`.

**Верифікація:** CODE VERIFIED — `017_dnf_reflection.ts` містить `CREATE TABLE dnf_reflection` з
полем `reason TEXT` без CHECK (Grep підтвердив). `DnfReflectionRepository.test.ts` присутній.
Список "сім варіантів" причин — NOT VERIFIED окремо (не рахував елементи `DNF_REASON_ORDER` у
`dnfReason.ts` напряму, хоча сам масив використовується в тестах Фази 21).

---

## Фаза 13 — «Читацькі сезони» (Reading Seasons)

**Що зроблено (за CHANGELOG.md):** персональні сезонні підсумки (Зима/Весна/Літо/Осінь),
повністю похідні, жодної нової таблиці. Метеорологічні межі, зима прив'язана до ПІЗНІШОГО року.
Екран `app/seasons/[seasonKey].tsx` — колаж обкладинок, великі числа, улюблена книга (фолбек на
найвищу оцінку), SHARE TEMPLATE з перемикачем формату 9:16/4:5.

**Торкнуті файли:** `src/lib/season.ts`, `app/seasons/[seasonKey].tsx`, `docs/READING_SEASONS.md`.

**Верифікація:** CODE VERIFIED — `src/lib/season.ts` містить `SEASON_MONTH_RANGE` з
`winter: { startMonth: 12, startYearOffset: -1, endMonth: 3 }` і функцію `currentSeasonKey`, що
буквально робить `if (month === 12) return { seasonId: 'winter', year: year + 1 }` — точно
відповідає твердженню "зима прив'язана до пізнішого року" (Grep підтвердив код і супровідний
коментар "Зима 2026 — грудень 2025 — лютий 2026"). `app/seasons/[seasonKey].tsx` присутній у
дереві routes, `season.test.ts` присутній.

---

## Фаза 14 — «Мій читацький профіль» (Reading Profile)

**Що зроблено (за CHANGELOG.md):** приватна аналітика (PRIVATE, не публічний профіль) — до 6
речень-висновків, кожен з власним мінімальним порогом вибірки: час доби найчастішого читання,
середня тривалість сесії, найчастіший жанр, жанр з найвищою середньою оцінкою, паперові/цифрові
переважання, середня довжина книги. Формат (paper/digital) — окремий випадок: показується лише
при 5+ сесій одночасно на КОЖНОМУ боці (бо `format` майже завжди дефолтний `'paperback'`).

**Торкнуті файли:** `src/lib/readingProfile.ts`, `app/reading-profile.tsx`.

**Верифікація:** CODE VERIFIED — `readingProfile.ts` містить точно 6 іменованих порогів,
кожен відповідає одному з 6 заявлених insight'ів: `MIN_SESSIONS_FOR_TIME_OF_DAY = 10`,
`MIN_SESSIONS_FOR_AVG_DURATION = 5`, `MIN_BOOKS_FOR_TOP_GENRE = 5`,
`MIN_RATED_BOOKS_FOR_GENRE_RATING = 3`, `MIN_SESSIONS_PER_FORMAT_SIDE = 5` (застосовується до
обох боків — `if (physicalCount < N || digitalCount < N) return null` — Grep підтвердив, що
перевіряються ОБИДВА боки, точно як заявлено), `MIN_BOOKS_FOR_AVG_PAGES = 5`. Кожен `guard`
(`if (... < MIN_...) return null`) присутній безпосередньо під відповідною константою — реальна,
а не декларативна перевірка порогу. `app/reading-profile.tsx` присутній у дереві routes.

---

## Фаза 15 — «Мій читацький відбиток» (Reading Fingerprint)

**Що зроблено (за CHANGELOG.md):** до 8 коротких детермінованих бейджів (без AI/LLM), кожен зі
своїм порогом вибірки: Вечірній читач, Марафонський читач, Повільне занурення, Любитель довгих
історій, Читає серіями, Дослідник жанрів, Любить робити нотатки, Колекціонер цитат. SHARE
TEMPLATE — до 6 бейджів на картці.

**Торкнуті файли:** `src/lib/readingFingerprint.ts`, `app/fingerprint.tsx`.

**Верифікація:** CODE VERIFIED — `readingFingerprint.ts` містить `BADGE_META`/`BADGE_ORDER` і
конкретні пороги: `MIN_HOURS_FOR_SLOW_IMMERSION_BADGE = 15`,
`MIN_FINISHED_BOOKS_FOR_SERIES_BADGE = 5`, `MIN_FINISHED_BOOKS_FOR_GENRE_EXPLORER_BADGE = 8`,
`MIN_NOTES_FOR_BADGE = 20`, `MIN_QUOTES_FOR_BADGE = 20`, і `MAX_SHARE_CARD_BADGES = 6` —
буквально відповідає заявленому "до 6 бейджів на картці". `NoteRepository.countAll` і
`QuoteRepository.countAll` — обидва реально присутні (Grep підтвердив точні сигнатури в обох
файлах репозиторіїв). Точну кількість "8" бейджів окремо не перелічував по іменах — NOT VERIFIED
(перевірено структуру й пороги, не повний перелік усіх 8 назв один-в-один).

---

## Фаза 16 — «Обери мені книгу» (One Book Picker)

**Що зроблено (за CHANGELOG.md):** окремий від «Що почитати завтра?» пікер — обирає ОДНУ книгу з
уже наявної бібліотеки (TBR). Фільтри: час, настрій (м'який), максимальна довжина (жорсткий),
серія, статус, володіння (новий пакетний `OwnedBookRepository.listOwnedEditionIds`). Показує ОДНУ
рекомендацію з поясненням.

**Торкнуті файли:** `src/data/repositories/OwnedBookRepository.ts`, `src/lib/onePicker.ts`,
`app/one-book-picker.tsx`.

**Верифікація:** CODE VERIFIED — `OwnedBookRepository.listOwnedEditionIds` реально присутній
(Grep підтвердив сигнатуру `async listOwnedEditionIds(db, editionIds): Promise<Set<string>>`).
`app/one-book-picker.tsx` присутній у дереві routes, `onePicker.test.ts` присутній.

---

## Фаза 17 — TBR Personality / Anti-TBR

**Що зроблено (за CHANGELOG.md):** розширення вже наявного TBR reality check (не нова паралельна
фіча). "N книга/книги/книг чекає/чекають на тебе" — узгодження дієслова з числом за тим самим
mod10/mod100-правилом, що й іменник. `findOldestWaitingBook` — за `addedAt`, не `updatedAt`. CTA
«Нарешті прочитати» веде на Book Details (навігація, не примусова зміна статусу). Жодного порогу
мінімальної вибірки (це опис самого TBR-списку, не статистичний висновок).

**Торкнуті файли:** `src/lib/tbrPersonality.ts`.

**Верифікація:** CODE VERIFIED (частково) — `tbrPersonality.ts` містить коментар, що прямо
підтверджує mod10/mod100-логіку узгодження дієслова: "САМИМ mod10/mod100-правилом, що й іменник
(`pluralizeUk`), а не лише 'однина рівно для 1'" (Grep підтвердив рядок 51). `tbrPersonality.test.ts`
присутній. Саму сигнатуру `findOldestWaitingBook` і сортування за `addedAt` — NOT VERIFIED окремо
(не читав повний код функції рядок-в-рядок, лише підтвердив факт існування модуля й коментар про
плюралізацію).

---

## Фаза 18 — Home Redesign

**Що зроблено (за CHANGELOG.md):** Home наведено до порядку ТЗ: 1. Зараз читаєш; 2. Continue CTA
(кожен рядок — своя дія); 3. Сьогодні; 4. ОДНА контекстна картка; 5. компактні shortcuts. Нова
`selectHomeContextCard` — єдина точка вибору картки з 5 кандидатів, пріоритет: давно не читав →
капсула готова → цей день → ціль майже виконана → TBR suggestion. Нові компактні HOME SHORTCUTS.
Стара повнорозмірна `JournalEntryPointCard` видалена.

**Торкнуті файли:** `src/lib/homeContext.ts`, `app/(tabs)/index.tsx`, `app/memory/index.tsx`.

**Верифікація:** CODE VERIFIED — `homeContext.ts` містить `export type HomeContextCardKind =
'stale_reading' | 'capsule_due' | 'on_this_day' | 'goal_near_completion' | 'tbr_suggestion'`
(рядок 20) — порядок типу буквально збігається з заявленим пріоритетом "давно не читав → капсула
→ цей день → ціль → TBR" (Grep/Read підтвердили точний порядок enum-подібного типу і супровідний
коментар, що прямо цитує "буквальний приклад пріоритету" з ТЗ). `app/memory/index.tsx` присутній
у дереві routes (новий "Моя пам'ять" екран, як заявлено). `homeContext.test.ts` присутній.

---

## Фаза 19 — Design System Extension

**Що зроблено (за CHANGELOG.md):** не редизайн, а консолідація — 6 нових спільних компонентів
(`MemorySection`, `BookHero`, `JournalPreview`, `Timeline`, `SectionHeader`, `QuickAction`, усі
`src/components/ui/`). 4 кандидати ТЗ (`EmptyMemoryState`, `BookCoverStack`, `InsightCard`,
`StatPill`) свідомо НЕ створені. Додано `expo-haptics` — light haptic feedback на 3 з 4 прикладів
ТЗ: збереження запису щоденника, завершення книги, "улюблене". **"Четвертий приклад ТЗ
('successful scan') не має реального місця виклику — у застосунку немає фічі сканування
штрихкоду камерою."**

**Торкнуті файли (за CHANGELOG):** `src/components/ui/{MemorySection,BookHero,JournalPreview,
Timeline,SectionHeader,QuickAction}.tsx`, `src/lib/haptics.ts`, `package.json`.

**Верифікація:** CODE VERIFIED — усі 6 нових компонентів реально присутні у
`src/components/ui/` (поряд із раніше існуючими `CollapsibleSection`/`AppText`/`Card`/тощо — `ls`
підтвердив повний список 18 файлів). `package.json` містить `"expo-haptics": "~57.0.3"`.
`src/lib/haptics.ts` реально визначає `triggerLightHapticFeedback` через
`Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` з graceful catch — і сам доккоментар у
файлі буквально повторює те саме твердження про відсутність "successful scan" фічі.

**⚠️ DISCREPANCY (CODE VERIFIED):** твердження "у застосунку немає фічі сканування штрихкоду
камерою" — ФАКТИЧНО НЕВІРНЕ. `app/isbn-scan.tsx` (279 рядків) реально імпортує `CameraView`,
`useCameraPermissions`, `BarcodeScanningResult` з `expo-camera` (рядок 3), рендерить `<CameraView
... onBarcodeScanned={handleBarcodeScanned}>` (рядок 213/217) — це саме та камера-сканування
штрихкоду ISBN, яку CHANGELOG стверджує, що не існує. Перевірено (Grep) весь файл
`app/isbn-scan.tsx` на предмет `Haptics`/`triggerLightHapticFeedback` — ЖОДНОГО входження немає.
Тобто: реальна причина, чому "successful scan" не отримав haptic feedback (як прямо вимагає ТЗ
Фази 19, за самим текстом CHANGELOG), — НЕ відсутність фічі сканування (вона існує з попереднього
milestone), а пропуск виклику `triggerLightHapticFeedback()` у вже наявному
`handleBarcodeScanned`-обробнику. Це конкретна, підтверджена прогалина: вимога ТЗ ("light haptic
feedback... successful scan") лишилась НЕ виконаною через неправильну діагностику в самій фазі, а
не через свідоме, обґрунтоване рішення, як подає CHANGELOG.

---

## Фаза 20 — Database / Migrations

**Що зроблено (за CHANGELOG.md):** суцільний аудит схеми БД, не нова функціональність.
Перевірено всі 17 попередніх міграцій (001-017) — усі адитивні, крім 002/003/007 (rebuild-патерн,
задокументований раніше, не нова знахідка). Знайдено ОДИН реальний пропуск індексу: `shelf_book`
(`PRIMARY KEY (shelf_id, user_book_id)`) — `ShelfRepository.listShelfIdsForUserBook`/
`listNamesByUserBookIds` фільтрують за ДРУГИМ стовпцем композитного PK, який SQLite не може
використати як індекс (leftmost-prefix rule). Нова міграція `018_shelf_book_index.ts` — один
рядок `CREATE INDEX idx_shelf_book_user_book ON shelf_book(user_book_id)`.

**Торкнуті файли:** `src/data/db/migrations/018_shelf_book_index.ts`.

**Верифікація:** CODE VERIFIED — `018_shelf_book_index.ts` містить точно один SQL-рядок
`CREATE INDEX idx_shelf_book_user_book ON shelf_book(user_book_id);` (Read підтвердив увесь файл
буквально). `ShelfRepository.ts` реально містить обидва методи `listShelfIdsForUserBook`
(`SELECT shelf_id FROM shelf_book WHERE user_book_id = ?`, рядок 156-158) і
`listNamesByUserBookIds` (`WHERE sb.user_book_id IN (...)`, рядок 166-175) — точно ті самі запити,
що описані в доккоментарі самої міграції. Твердження "усього 18 файлів міграцій" узгоджується з
реальним переліком директорії (`001`…`018`, 18 файлів, Bash `ls` підтвердив).

---

## Фаза 21 — Tests

**Що зроблено (за CHANGELOG.md):** аудит покриття тестами, не нова функціональність — перевірено
13 доменних областей і 4 критичні репозиторії читанням повного вихідного файлу проти повного
тестового. Знайдено 4 реальні пропуски: (1) `onThisDay.ts#buildOnThisDaySummary` — гілка-фолбек
`priority = 5`; (2) `dnfReason.ts#isDnfReasonId` — guard-функція без жодного тесту; (3)
`homeContext.ts#findGoalNearCompletionCandidate` — захисна гілка `target <= 0`; (4)
`UserBookRepository.setSpoilerSafeEnabled` — без прямого тесту (на відміну від `setFavorite`).

**Торкнуті файли:** `src/design/dnfReason.test.ts` (новий), доповнення до
`src/lib/onThisDay.test.ts`, `src/lib/homeContext.test.ts`,
`src/data/repositories/UserBookRepository.test.ts`.

**Верифікація: усі 4 пропуски CODE VERIFIED як реально закриті** — найретельніше задокументована
фаза цього аудиту:
1. `onThisDay.ts:158: let priority = 5` і `onThisDay.test.ts:172:
   expect(summary.groups[0]?.memories[0]?.priority).toBe(5)` — гілка реально покрита тестом.
2. `dnfReason.test.ts` — новий файл, `describe('isDnfReasonId', ...)`, коментар прямо каже
   "не мав жодного тесту в усьому кодовому дереві" — файл справді новий і саме про цю функцію.
3. `homeContext.ts:139: if (item.progress.target <= 0) continue` і
   `homeContext.test.ts:136: it('захисно ігнорує target <= 0 (не дає йому "виграти" слот через
   Infinity)', ...)` — гілка реально покрита тестом з назвою, що буквально описує сценарій з
   CHANGELOG.
4. `UserBookRepository.test.ts:221: it('setSpoilerSafeEnabled: за замовчуванням true (DEFAULT
   1), перемикається в обидва боки', ...)` з реальними викликами `setSpoilerSafeEnabled(db, id,
   false)` і `(db, id, true)` — тест реально існує і перевіряє обидва напрямки.

Це найсильніше верифікована фаза цього розділу — усі 4 заявлені конкретні виправлення знайдені
буквально в коді, точними номерами рядків, без жодного розходження.

---

## Фаза 22 — Device UX Check Preparation

**Що зроблено (за CHANGELOG.md):** остання фаза — новий `docs/MANUAL_UX_TEST_V1_6.md`, 17
сценаріїв ручної перевірки на реальному пристрої. **Свідомо ПОРОЖНІЙ чек-лист** — середовище
розробки не має фізичного пристрою, жодна клітинка "Пройдено" НЕ позначена.

**Торкнуті файли:** `docs/MANUAL_UX_TEST_V1_6.md` (новий).

**Верифікація:** CODE VERIFIED — документ реально існує і реально є порожнім шаблоном: перші
розділи ("1. Бібліотека з 1 книгою", "2. Бібліотека 100+ книг", "3. Кілька одночасних 'зараз
читаю'") мають чекбокси `- [ ]` (не позначені) і рядок `**Пройдено:** [ ] Так [ ] Ні —
**Нотатки:** ______` — буквально порожній, як заявлено, жодного фальшивого "пройдено". Це єдина
фаза, де CHANGELOG прямо й вірно визнає межі середовища розробки (device verification
NOT APPLICABLE) — підтверджено, що це чесне визнання, а не прихована спроба видати щось за
пройдену перевірку.

---

## Post-milestone документаційний прохід (без номера фази)

**Що зроблено (за CHANGELOG.md, 2026-09-12, після завершення 22 фаз):** звірка наявних доків з
кодом: новий `docs/LIBRARY_UX.md`; виправлення `docs/TESTING.md` (майбутній час → факт);
`docs/PRODUCT.md` доповнено розділом "Що виросло навколо core loop"; `docs/ROADMAP.md` доповнено
про V1.5/V1.6; `docs/ARCHITECTURE.md` route map оновлено з "32 до 44 файлів маршрутів".

**Верифікація:** CODE VERIFIED (частково) — реальний підрахунок `find app -name "*.tsx"` дав
**рівно 44 файли** маршрутів (Bash `find` підтвердив повний список) — точно збігається з
заявленою цифрою "44 файли" в доробці. `docs/LIBRARY_UX.md` реально присутній у `docs/`.

---

## Зведення по розділу 2

- **22 фази + Фаза 0b + пост-мілстоун документаційна доробка** — усі знайдені в CHANGELOG.md з
  ідентичною нумерацією й назвами, що майже дослівно збігаються з очікуваним списком (єдина
  відмінність формулювання: Фаза 9-10 у CHANGELOG — два окремі заголовки "«Персонажі»
  (CHARACTERS)" і "«Світ книги» (PERSONAL LORE)", а не об'єднане "Фаза 9-10", як у вхідному
  списку — по суті те саме).
- **Кількість реально верифікованих кодом тверджень:** 2-5 на фазу, майже для кожної фази
  знайдено принаймні одне буквально точне текстове/числове збіжне підтвердження в реальному коді
  (константи порогів, SQL DDL, назви файлів, номери рядків тестів).
- **Дві підтверджені кодом розбіжності (DISCREPANCY), обидві суттєві для технічної довіри до
  CHANGELOG:**
  1. **Фаза 10** — заявлене "перенесення" екранів `app/characters/` → `app/lore/` насправді є
     ДУБЛЮВАННЯМ: старі файли (~480 рядків) лишились у репозиторії повністю робочими,
     непов'язаними з UI (orphaned dead code, досяжний лише прямим deep-link).
  2. **Фаза 19** — заявлена причина невиконання вимоги ТЗ ("haptic на successful scan" —
     "фічі сканування камерою не існує") ФАКТИЧНО НЕВІРНА: `app/isbn-scan.tsx` реально
     використовує `expo-camera`/`CameraView` для сканування штрихкоду й ніколи не отримав
     `triggerLightHapticFeedback()`. Вимога ТЗ лишилась не виконаною не через обґрунтоване
     рішення, а через помилкову діагностику в самому CHANGELOG-записі.
- Жодних інших конкретних числових/структурних розбіжностей між CHANGELOG і кодом у межах
  перевірених тверджень не виявлено — переважна більшість перевірених фактів (SQL DDL, назви
  констант, порогові значення, структура файлів) підтвердились буквально.
No universal links configured — only the bare `polytsya://` scheme from Expo defaults. I now have everything needed. Writing the final report.

---

# 3. COMPLETE ROUTE MAP

**Метод:** `Glob({pattern: "app/**/*.tsx"})` на реальному дереві `app/` дав 46 файлів; 2 з них — layout-файли (`app/_layout.tsx`, `app/(tabs)/_layout.tsx`), не маршрути. Отже реальних екранів-маршрутів — 44, точно як заявлено в ТЗ аудиту. Усі 44 прочитані (повністю або — для компактних — за структурою експорту й заголовковим doc-коментарем).

Умовні позначення в колонці «Надлишковість»: 🔴 — реальна проблема (дублікат/мертвий код/погана відкриваність), 🟡 — вартий уваги компроміс, який продукт свідомо прийняв, — — без зауважень.

| Маршрут | Екран | Призначення | Основна точка входу | Додаткові точки входу | Природна доступність | Надлишковість |
|---|---|---|---|---|---|---|
| `(tabs)/index` | Головна | Дашборд: активне читання, сьогоднішні цифри, 1 контекстна картка, 4 шорткати, 3 рекомендаційні картки | Таб-бар (завжди перший таб) | — | Так, це стартовий екран | — |
| `(tabs)/library/index` | Бібліотека | Повний список книг користувача: фільтри статусу, полиці, сітка/список, сортування, long-press дії | Таб-бар | Home «Усі (N)», EmptyState-кнопки з Search/Home | Так | 🟡 сама вкладка виконує роль і каталогу-статусів, і полиць, і 2 «розумних» стрічок одночасно (`app/(tabs)/library/index.tsx`) |
| `(tabs)/calendar` | Календар | Місяць-сітка з позначками днів із сесіями читання | Таб-бар | — | Так | — |
| `(tabs)/search` | Пошук | Два режими: «Особисте» (офлайн-пошук по своїй бібліотеці/щоденнику/серіях/полицях) і «Каталог» (додавання нової книги з 4 зовнішніх/внутрішніх джерел) | Таб-бар | — | Так | 🟡 два концептуально різні пошуки («що в мене вже є» і «що додати») живуть в одному екрані з перемикачем — див. Розділ 4 |
| `(tabs)/profile/index` | Профіль | Меню з 12 пунктів + перемикач теми + статистична картка | Таб-бар | — | Так | 🔴 фактичний «звалищний» (dumping ground) екран — див. Розділ 4 |
| `work/[workId]` | Book Details | Найбільший екран застосунку (1599 рядків): статус, обкладинка, жанри/теги, полиці, оцінка, весь щоденник книги, До/Після, DNF, Lore, історія сесій, видання | Тап на будь-яку картку книги (Бібліотека, Пошук, Полиці, Серії) | Data Doctor (посилання на проблемний запис), Recap/Capsule/Recall (кнопки «Назад до книги») | Так | 🔴 одна з найбільших знахідок аудиту — 13+ незалежних секцій в одному `<ScrollView>`, див. нижче |
| `session/[sessionId]` | Активна сесія читання | Таймер, пауза/резюме, композер щоденника під час читання, форма завершення, «Як читалося?» після завершення | `ReadingControls`/`SessionLaunchScreen` після старту сесії | `ReadingSessionMiniBar` (глобальна панель над таб-баром) з будь-якої вкладки | Так, ключовий цикл | — |
| `session/launch/[userBookId]` | Компактний запуск сесії | Легкий екран «почати читання саме цієї книги» (сторінка старту, ціль у хвилинах) | Тап на книгу в списку «Зараз читаєш» на Home | — | Так, лише з Home | 🟡 дублює частину `ReadingControls` з Book Details навмисно (задокументовано в коді) |
| `backup.tsx` | Резервна копія | Стан бекапу, ручний JSON-експорт, автобекап toggle, CSV-експорт, restore, перевірка файлу | Профіль → «Резервна копія» | — | Так, але глибина 2 (Профіль→Бекап) | — |
| `data-doctor.tsx` | Перевірка даних | Ручний запуск 6-категорійної перевірки цілісності БД, посилання на проблемні записи | Профіль → «Перевірка даних» | — | Так, глибина 2 | 🟡 повністю ручний запуск, ніде не підказується користувачу самостійно — див. Розділ 25 |
| `completion/[workId]` | Підсумок читання | Показується одразу після переходу статусу у «Прочитано»; форма «Спогад про книгу» (`BookMemorySection`), дати | Автоматична навігація з `work/[workId]` при `handleStatusChange('finished')` | «Переглянути підсумок читання» на Book Details (постійна кнопка для finished/rereading) | Так | — |
| `capsule/[workId]` | Капсула книги (перегляд) | Приватний знімок вражень: стійка думка, речення-спогад, улюблений персонаж, посилання на запис щоденника, нагадування | `memory/[workId]` → `BookCapsuleSection` | — | 🔴 **лише через `Моя пам'ять → книга → секція капсули`** — не лінкується прямо з Book Details взагалі | 🔴 3 переходи від старту, немає прямого входу з `work/[workId]` |
| `capsule/[workId]/edit` | Капсула книги (редагування) | Форма створення/редагування капсули | `capsule/[workId]` («Редагувати») або `memory/[workId]` (коли капсули ще нема) | — | Те саме — глибина 3-4 | 🔴 див. вище |
| `recall/[workId]` | Книга через час (Recall) | Reveal-крок: перечитування капсули пізніше, «Що ти пам'ятаєш зараз?» | `HomeContextCard` (коли капсула «due»), `memory/[workId]` (кнопка «Згадати книгу» коли капсула вже є) | — | Залежить від контекстної картки — рідкісний, ситуативний вхід | 🟡 концептуально дуже близько до Recap (нижче) — різні дані, схожа назва |
| `recap/[workId]` | Давно не читав (Recap) | Короткий підсумок «де я зупинився»: останні сесії, останні записи, перед поверненням до книги | `HomeContextCard` (stale reading), `work/[workId]` → `StaleReadingSection` | — | Так, коли є контекст | 🟡 назва «Recap» vs «Recall» — легко переплутати навіть у документації/коді |
| `journal/index` | Мій щоденник (глобальний) | Уся стрічка нотаток/цитат усіх книг: пошук, фільтри (тип/обране/«повернутися пізніше»), реакції | Home → шорткат «Мій щоденник» | — | Так | — |
| `memory/index` | Моя пам'ять (список) | Список книг, що мають Book Memory (спогад) | Home → шорткат «Моя пам'ять» | — | Так | — |
| `memory/[workId]` | Картка пам'яті книги | Book Memory: рефлексія, обрані записи, До/Після порівняння, секції Capsule/Lore/Revisit-later | `memory/index`, `completion/[workId]` | — | Так | — |
| `history.tsx` | Моя історія | Хронологічна стрічка подій (8 типів, UNION ALL) | Home → шорткат «Моя історія», Профіль → «Моя історія» | — | Так (дубльований вхід — навмисно) | — |
| `on-this-day.tsx` | Цього дня | «Цей день N років тому»-стрічка активності | `OnThisDayCard` (Home, коли обрана контекстна картка) | — | 🔴 єдина точка входу — лише коли алгоритм вибору контекстної картки сам вирішить її показати; прямого пункту меню нема | 🔴 непередбачувана доступність |
| `goals/index` | Цілі читання | CRUD цілей + прогрес | Профіль → «Цілі читання» | `HomeContextCard` (goal_near_completion) | Так | — |
| `reminders/index` | Нагадування | CRUD нагадувань (daily/weekday/loan_return/custom) | Профіль → «Нагадування» | — | Так, глибина 2 | — |
| `statistics.tsx` | Статистика | Дашборд загальної статистики читання | Профіль → «Статистика», Home (StatsSummaryCard) | — | Так | — |
| `wrapped/[year]` | Wrapped | Річний підсумок (книги, автор, жанр, streak) з перемиканням року стрілками | Профіль → «Wrapped» | — | Так | 🟡 концептуально перетинається з «Читацькі сезони» нижче — обидва «підсумок за період + shareable картка» |
| `seasons/[seasonKey]` | Читацькі сезони | Той самий підсумок, але по сезону (менший період) + SHARE-картка (захоплення в PNG) | Профіль → «Читацькі сезони» | — | Так | 🟡 див. вище |
| `fingerprint.tsx` | Читацький відбиток | Профіль читацьких звичок (бейджі, share-картка) | Профіль → «Мій читацький відбиток» | — | Так | 🟡 третій «профіль/підсумок»-екран поряд із Wrapped і Reading Profile |
| `reading-profile.tsx` | Читацький профіль | Insight-речення про манеру читання (час доби, темп тощо) | Профіль → «Мій читацький профіль» | — | Так | 🟡 див. вище — 4 різні «про тебе як читача» екрани (Wrapped/Seasons/Fingerprint/Reading Profile) |
| `tbr.tsx` | TBR reality check | «Playful» картка про список очікування (anti-shame тон) | Профіль → «TBR reality check» | `HomeContextCard` (tbr_suggestion) | Так | — |
| `tomorrow.tsx` | Що почитати завтра? | Підбір НОВОЇ книги ззовні (жанр+час+мета) з 2 джерел (curated+Google) | Home → постійна картка | — | Так | 🟡 навмисний, задокументований дуплікат сенсу з One Book Picker |
| `one-book-picker.tsx` | Обери мені книгу | Підбір ОДНІЄЇ книги з уже наявної бібліотеки (час/настрій/довжина) | Home → постійна картка | — | Так | 🟡 див. вище |
| `trends.tsx` | Тренди | Топ-10 книг, які зараз найчастіше додають (спільний каталог) | Home → постійна картка | — | Так | — |
| `series/[seriesId]` | Деталі серії | Список творів серії, впорядкованих за позицією | Book Details (посилання на серію), Пошук («Особисте») | Data Doctor (`series` link) | Так | — |
| `shelf/[shelfId]` | Деталі полиці | Список книг полиці | Бібліотека (картка полиці), Book Details (полиці-чипи), Пошук («Особисте») | Data Doctor (`shelf` link) | Так | — |
| `shelf/new.tsx` | Нова полиця | Форма створення: назва, опис, тема (10 ілюстрацій) | Бібліотека, Book Details | — | Так | 🟡 тема обирається лише тут — редагування теми вже створеної полиці неможливе (свідомий compromise, задокументовано) |
| `journal/index` через фільтр «Полиці» — н/д | — | — | — | — | — | — |
| `lore/[workId]` | Світ книги (список) | Персонажі/місця/терміни/організації твору | Book Details → `LoreSection` | Memory | Так | — |
| `lore/[workId]/[entityId]` | Деталі елемента лору | Опис, реакція, пов'язані записи щоденника | `lore/[workId]` | — | Так | — |
| `characters/[workId]` | (застаріла) Персонажі | Той самий UI, що й `lore/[workId]`, до перейменування у Фазі 10 | **Жоден живий екран на нього не веде** | — | 🔴 Ні | 🔴 **мертвий/сирітський маршрут** — CODE VERIFIED: жодного `router.push` на `/characters` в усьому дереві `app/`+`src/`, лише сам файл посилається сам на себе (`grep -rln "characters"` за межами `app/characters/` знайшов лише коментарі в `useLoreEntities.ts` і `recap/[workId].tsx`) |
| `characters/[workId]/[entityId]` | (застаріла) Деталі персонажа | Дубль `lore/[workId]/[entityId]` | Лише з мертвого `characters/[workId]` | — | 🔴 Ні | 🔴 те саме — сирітський код, файл технічно все ще компілюється й доступний за URL, просто ніхто туди не веде |
| `cover-photo/[editionId]` | Заміна обкладинки | Камера/галерея → зберегти як обкладинку видання | Book Details («Змінити/Додати обкладинку») | — | Так | — |
| `isbn-scan.tsx` | Сканування ISBN | Камера-сканер → пошук по ISBN у Google Books/ISBNdb | Пошук → «Сканувати ISBN» | — | Так | — |
| `import/goodreads.tsx` | Імпорт з Goodreads | 3-кроковий CSV-імпорт (вибір файлу → перегляд → результат) | Профіль → «Імпорт з Goodreads» | — | Так, глибина 2 | — |
| `import/review.tsx` | Підтвердження імпорту однієї книги | Перегляд перед збереженням результату зовнішнього пошуку | Пошук («Каталог») → тап на результат, `isbn-scan.tsx` | — | Так | — |
| `work/new.tsx` | Додати книгу вручну | Повна форма ручного створення Work+Edition | Пошук → «Додати вручну» | — | Так | — |
| `day/[date]` | Деталі дня | Усі сесії читання конкретного дня | Календар (тап на день) | — | Так | — |

**Ключові знахідки цього розділу:**

1. **`characters/[workId].tsx` і `characters/[workId]/[entityId].tsx` — мертвий, недосяжний код.** CODE VERIFIED. Коментар у `app/lore/[workId].tsx:68` прямо каже: «`app/characters/[workId].tsx` перенесений сюди за назвою» — тобто екран Фази 9 «Персонажі» був перейменований/перенесений у Фазі 10 в уніфікований «Світ книги» (`lore/[workId]`), але старі файли не видалені з репозиторію. Вони й далі повністю робочі (компілюються, мають власну логіку) і технічно доступні за прямим URL/deep-link (`polytsya://characters/<id>`), але жоден живий екран на них не веде. Це або: (а) забутий сміттєвий код, який варто видалити, або (б) прихована технічна заборгованість, яку легко випадково знову підключити, продублювавши логіку.

2. **Капсула книги (`capsule/[workId]`) — надто глибоко захована.** CODE VERIFIED (`grep` по `router.push.*'/capsule`). Єдиний шлях: Головна → «Моя пам'ять» (шорткат) → книга → секція «Капсула» → `capsule/[workId]`. Book Details (`work/[workId].tsx`) — головний екран книги, 1599 рядків, 13+ секцій — не містить жодного прямого посилання на капсулу, хоча має прямі посилання на Lore, Recap, DNF, До/Після. Для функції, яку ТЗ V1.6 описує як окрему фазу (Фаза 4), це неприродно непомітно.

3. **`on-this-day.tsx` не має жодного постійного пункту входу** — тільки ситуативна поява як одна з 5 конкуруючих `HomeContextCard`-варіантів (Розділ 4). Функція реально «прихована» — користувач не може її навмисно відкрити, лише натрапити.

4. **Чотири окремі «хто я як читач» екрани** (`wrapped/[year]`, `seasons/[seasonKey]`, `fingerprint.tsx`, `reading-profile.tsx`) — усі підсумовують ту саму статистику сесій/книг під різним кутом і різним дизайном картки. Кожен по собі виправданий, але разом — очевидне накопичення схожих функцій без консолідації (продукт сам це визнає коментарем «pryame prohannya vlasnyka» для кожної фази окремо, без огляду на суму).

5. **`work/[workId].tsx` (Book Details) — перевантажений одним екраном.** 1599 рядків, 15 локальних компонент-секцій (`GenreTagsSection`, `LibrarySection`, `StaleReadingSection`, `LoreSection`, `PreReadingReflectionSection`, `DnfReflectionSection`, `ReadingControls`, `RatingSection`, `JournalSection`, `FinishPredictionSection`, `ReadingHistorySection`, `EditionCard` та інші), кожна зі своїм запитом даних, змонтована в одному `<ScrollView>` без ледачого завантаження чи розбиття на вкладки. Технічно кожна секція вже акуратно ізольована й показує/ховає себе самостійно — але як єдиний UX-обʼєкт екран виконує роль каталогу, бібліотечної картки, щоденника, аналітики прогнозу та центру керування читанням одночасно.

---

# 4. НАВІГАЦІЙНИЙ АУДИТ

## Архітектура навігації

**Нижня навігація** — CODE VERIFIED (`app/(tabs)/_layout.tsx`): рівно 5 вкладок (Головна/Бібліотека/Календар/Пошук/Профіль), без окремої вкладки «Читаю» — це свідоме рішення ТЗ («Головна» несе роль активного читання). Кастомізовано лише одним чином: `tabBar` обгорнутий, щоб над стандартним `BottomTabBar` рендерити `ReadingSessionMiniBar` — панель активної сесії, видиму з будь-якої вкладки.

**Стек-навігація** — увесь інший рух (44 екрани) реалізовано через Expo Router file-based `Stack`, ЗАВЖДИ повноекранним push (`headerShown: true` з нативним заголовком і кнопкою «Назад»). CODE VERIFIED: `grep -rln "presentation:" app` не знайшов жодного вживання — тобто **у застосунку немає жодного модального екрана** (`presentation: 'modal'`). Усе, що концептуально модальне (підтвердження бекапу, форма редагування капсули, форма DNF) реалізовано або як `Alert.alert` (системний діалог), або як повноцінний push-екран із кнопкою «Назад».

**Контекстні меню / long-press** — CODE VERIFIED: у всьому дереві `app/`+`src/components/` є рівно ОДИН компонент з `onLongPress` — `BookQuickActionsSheet` (викликається long-press на рядку/картці Бібліотеки; реалізований як нативний RN `Modal`, не Router-route). Сам код-коментар компонента прямо визнає ризик відкриваності: «для тих, хто про long-press не здогадається, лишається звичний шлях через Book Details» (`src/components/library/BookQuickActionsSheet.tsx`) — тобто автори самі усвідомлюють, що ця дія прихована без візуальної підказки (немає ні «…»-кнопки, ні onboarding-тултипа).

**Back-поведінка** — стандартна нативна (Expo Router Stack), спеціальних перевизначень не знайдено, крім навмисної логіки в `app/session/[sessionId].tsx` (автопауза при відкритті форми завершення й авто-резюм при «Назад» — детально задокументовано в коді, з явним фіксом гонки станів між `pause`/`resume`).

**Deep links** — CODE VERIFIED (`app.config.ts:32`): зареєстровано лише голу URL-схему `scheme: 'polytsya'` (стандартний Expo-дефолт для file-based routing — кожен маршрут автоматично отримує `polytsya://<route>`). Жодних `universalLinks`/`associatedDomains`, жодної кастомної обробки вхідних посилань (сповіщень, шерингу) у коді не знайдено. HYPOTHESIS: deep-link-и практично не використовуються продуктом — вони існують лише як побічний ефект Expo Router, а не як навмисна фіча.

## Конкретні UX-знахідки

**1. Профіль — фактичний «звалищний» екран (dumping ground).** CODE VERIFIED (`app/(tabs)/profile/index.tsx`, масив `MENU_ITEMS`): 12 пунктів меню одним плоским списком без жодної категоризації чи заголовків-розділювачів — Статистика, Моя історія, Цілі читання, Мій читацький профіль, Нагадування, TBR reality check, Wrapped, Читацькі сезони, Мій читацький відбиток, Резервна копія, Перевірка даних, Імпорт з Goodreads. Сам код-коментар над масивом визнає причину: «Statistics/Goals/Reminders — Milestone 5; TBR/Wrapped/Резервна копія — Milestone 6; Перевірка даних — POLYTSIA V1.5 Фаза 5; Моя історія — Фаза 12... ТЗ Фази 12: "Entry point — Profile", "Не створюй нову bottom tab"» — тобто кожна нова фаза за замовчуванням додавала свій пункт у Профіль, бо ТЗ явно забороняло створювати нові вкладки. Результат — Профіль перетворився на єдиний каталог усіх «інших» функцій застосунку без внутрішньої структури (аналітика/дані-і-бекап/налаштування впереміш).

**2. Пошук навмисно змішує два різні поняття, з явним попередженням у самому коді проти цього.** CODE VERIFIED (`app/(tabs)/search.tsx`): doc-коментар прямо каже: «два явно розділені режими, щоб не змішувати "що я вже маю" з "що можна додати"» — і справді реалізовано коректно (перемикач «Особисте»/«Каталог» з різною логікою дедуплікації для каталогу). Проте сам факт, що вимога «не змішуй» узагалі мусила бути явно сформульована в ТЗ і коментарі, свідчить, що концептуальна межа тонка: обидва режими живуть на одній вкладці, з однаковим полем пошуку зверху, і різниця між ними видима лише після того, як користувач звернув увагу на перемикач Особисте/Каталог під полем пошуку. Для нового користувача, що вперше шукає книгу для додавання, немає жодного empty-state підказки «натисни Каталог, якщо шукаєш нову книгу» — лише текст «Шукай серед своїх книг… щойно щось додаси до бібліотеки» в порожньому стані режиму «Особисте».

**3. Часта дія (старт сесії читання) має два різні шляхи з різною глибиною залежно від точки входу.** З Бібліотеки: тап на книгу → Book Details → кнопка «Почати читання» (2 переходи). З Головної: тап на рядок «Зараз читаєш» → `session/launch/[userBookId]` (спрощена форма) → `session/[sessionId]` (2 переходи, але інший проміжний екран). Це навмисний, задокументований компроміс (`app/(tabs)/index.tsx`: «тап тут веде НЕ на повний Book Details… а на компактний екран запуску сесії») — валідний UX-вибір, але означає, що застосунок має ДВА різних UI для «почати читати цю книгу» (`SessionLaunchScreen` і `ReadingControls` на Book Details), з дубльованою логікою активної сесії (сам код це визнає: «Той самий трискладовий стан активної сесії, що й ReadingControls — навмисно продубльований тут»).

**4. Дублюючі назви для схожих, але різних концепцій — Recall vs Recap.** `app/recall/[workId].tsx` («Книга через час» — reveal капсули через задану кількість місяців) і `app/recap/[workId].tsx` («Давно не читав» — короткий підсумок перед поверненням до недочитаної книги) — HYPOTHESIS: дуже схожі англійські назви (recall/recap) для концептуально різних фіч підвищують ризик плутанини навіть у самій команді розробки (наприклад, легко переплутати посилання при рефакторингу), хоча в даних кожен код-шлях коректно ізольований.

**5. Одна контекстна картка Home — правильний принцип, реалізований коректно, але з побічним ефектом «прихованих» фіч.** `HomeContextCard` (`src/components/home/HomeContextCard.tsx`) навмисно показує ЩОНАЙБІЛЬШЕ одну картку з п'яти кандидатів (`stale_reading`, `capsule_due`, `on_this_day`, `goal_near_completion`, `tbr_suggestion`) — дисципліноване рішення проти захаращення Home. Але це означає, що `on-this-day.tsx` і повідомлення про «due» капсулу видимі лише тоді, коли пріоритезаційний алгоритм (`selectHomeContextCard`, не прочитано детально в цьому аудиті) сам їх обере — жодного постійного, навмисного способу відкрити «Цього дня» окремо не існує. NOT VERIFIED: чи це свідомий продуктовий компроміс, чи забутий пункт меню — з коду видно лише сам факт відсутності альтернативного входу.

**6. Немає жодних dead-end екранів у прямому сенсі** — кожен прочитаний екран має `Stack.Screen headerShown: true` з нативною кнопкою «Назад», або явну кнопку «Готово»/«Назад» у власному UI (напр. `SessionReflectionPanel`). CODE VERIFIED відсутність винятків серед 44 файлів.

**7. Полиці — дубльована точка входу в Бібліотеці, навмисно.** Секція «Полиці» на вкладці Бібліотека тепер стоїть ПЕРЕД табами статусу (перенесено з попередньої позиції «за прямим проханням власника продукту» — `app/(tabs)/library/index.tsx`), а сам Book Details має окрему секцію керування полицями. Обидва шляхи ведуть на той самий `shelf/[shelfId]` — коректне дублювання, не проблема.

---

# 21. DATABASE — ПОВНА КАРТА

**Джерело:** 18 файлів у `src/data/db/migrations/001_base_schema.ts` … `018_shelf_book_index.ts`, реєстр `src/data/db/migrationRunner.ts` (`LATEST_SCHEMA_VERSION = 18`), і крос-звірка з `BackupRepository.ts` (`BACKUP_TABLE_ORDER`).

## Повна схема таблиць (37 таблиць у живій БД)

| Таблиця | Призначення | PK | Важливі FK | Важливі індекси | Очікувана кількість рядків | У бекапі |
|---|---|---|---|---|---|---|
| `author` | Автор | `id` TEXT | — | — | Десятки | ТАК |
| `publisher` | Видавництво | `id` | — | — | Десятки | ТАК |
| `translator` | Перекладач | `id` | — | — | Одиниці-десятки | ТАК |
| `genre` | Жанр (куратований) | `id` | — | UNIQUE(`name_uk`), UNIQUE(`slug`) | ~30-50 (сталий довідник) | ТАК |
| `tag` | Тег (вільний) | `id` | — | UNIQUE(`name`) | Десятки | ТАК |
| `book_source` | Джерело метаданих | `id` | — | — | Сотні-тисячі (по одному на кожен імпорт) | ТАК |
| `field_provenance` | Провенанс окремого поля | `id` | `source_id`→book_source SET NULL | `idx_field_provenance_entity` | Помірна | НІ (експортується як частина `edition`, за `DATABASE.md`) |
| `work` | Твір (мовонезалежний) | `id` | — | — (`deleted_at` без індексу) | Сотні-тисячі | ТАК |
| `work_author` | Твір↔Автор | (`work_id`,`author_id`,`role`) | обидва CASCADE | — | ~1-3× work | ТАК |
| `work_genre` | Твір↔Жанр | (`work_id`,`genre_id`) | обидва CASCADE | — | ~1-3× work | ТАК |
| `lore_entity` | 🆕 V1.6 Персонаж/місце/термін/організація | `id` | `work_id`→work CASCADE | `idx_lore_entity_work` | Десятки-сотні | ТАК |
| `edition` | Видання твору | `id` | `work_id` CASCADE, `publisher_id` SET NULL, `source_id` SET NULL | `idx_edition_work`, `idx_edition_isbn13` | ~1.2× work | ТАК |
| `edition_translator` | Видання↔Перекладач | (`edition_id`,`translator_id`) | обидва CASCADE | — | Мала | ТАК |
| `series` | Серія | `id` | — | — | Десятки | ТАК |
| `series_entry` | Твір у серії | `id` | `series_id` CASCADE, `work_id` CASCADE | `idx_series_entry_series`, UNIQUE(series,work) | Сотні | ТАК |
| `tagged_item` | Тег↔(work/edition/user_book) поліморфно | (`tag_id`,`entity_type`,`entity_id`) | `tag_id` CASCADE, `entity_id` БЕЗ FK | — | Мала-помірна | ТАК |
| `user_book` | Книга в бібліотеці користувача | `id` | `edition_id` CASCADE | `idx_user_book_status`, `idx_user_book_edition` | Сотні-тисячі (1 користувач) | ТАК |
| `shelf` | Полиця | `id` | — | — | Десятки | ТАК |
| `shelf_book` | Полиця↔Книга | (`shelf_id`,`user_book_id`) | обидва CASCADE | 🆕 V1.6 `idx_shelf_book_user_book` (Migration 018) | ~2-5× user_book | ТАК |
| `reading_session` | Сесія читання (immutable) | `id` | `user_book_id` CASCADE | `idx_session_user_book`, `idx_session_started_at` | Тисячі+ | ТАК |
| `reading_progress` | Контрольна точка прогресу | `id` | `user_book_id` CASCADE, `session_id` SET NULL | `idx_progress_user_book`(composite) | ≈ reading_session | ТАК |
| `note_category` | Власна категорія нотатки | `id` | `user_book_id` CASCADE | `idx_note_category_user_book` | Десятки | ТАК |
| `note` | Нотатка щоденника | `id` | `user_book_id` CASCADE, `session_id` SET NULL, `category_id` БЕЗ FK (навмисно) | `idx_note_user_book/type/favorite/created_at/revisit_later` (5 індексів) | Тисячі+ | ТАК |
| `quote` | Цитата | `id` | `user_book_id` CASCADE, `edition_id` CASCADE, `session_id` SET NULL | `idx_quote_user_book/favorite/created_at/revisit_later` (4) | Сотні-тисячі | ТАК |
| `rating` | Оцінка+відгук | `id` | `user_book_id` UNIQUE CASCADE | — | ≤ user_book | ТАК |
| `pre_reading_reflection` | 🆕 V1.6 «До читання» | `id` | `user_book_id` UNIQUE CASCADE | — | ≤ user_book | ТАК |
| `dnf_reflection` | 🆕 V1.6 Знімок «Не дочитав» | `id` | `user_book_id` UNIQUE CASCADE | — | ≤ user_book | ТАК |
| `book_memory` | Спогад про книгу | `id` | `user_book_id` UNIQUE CASCADE | — | ≤ user_book | ТАК |
| `book_capsule` | 🆕 V1.6 Капсула книги | `id` | `user_book_id` CASCADE (БЕЗ UNIQUE — навмисно) | `idx_book_capsule_user_book`, `idx_book_capsule_reopen_at` | ≤ user_book (може бути >1 при перечитуванні) | ТАК |
| `capsule_recall` | 🆕 V1.6 Історія спроб згадати | `id` | `book_capsule_id` CASCADE | `idx_capsule_recall_book_capsule` | Мала (кілька на капсулу) | ТАК |
| `journal_lore_link` | 🆕 V1.6 Персонаж↔Запис щоденника | `id` | `lore_entity_id` CASCADE, `entry_id` БЕЗ FK (поліморфний) | `idx_journal_lore_link_entity`, UNIQUE(entity,kind,entry) | Мала | ТАК |
| `owned_book` | Фізичний примірник | `id` | `edition_id` CASCADE | — | ≤ edition | ТАК |
| `loan` | Позика книги | `id` | `owned_book_id` CASCADE | `idx_loan_active` | Мала | ТАК |
| `reading_goal` | Ціль читання | `id` | `related_work_id`/`related_series_id` CASCADE (опційно) | — | Одиниці-десятки | ТАК |
| `reminder` | Нагадування | `id` | `related_loan_id` CASCADE | — | Одиниці | ТАК |
| `book_recommendation_shown` | Історія показів рекомендацій | `id` | `genre_id`→genre CASCADE | `idx_recommendation_shown_lookup` | Помірна, росте необмежено (немає TTL/очищення — NOT VERIFIED чи це проблема на практиці) | ТАК |
| `app_settings` | Налаштування (singleton) | `id`='local' | — | — | 1 рядок завжди | ТАК |
| `journal_draft` | Чернетка композера | `user_book_id` (PK) | `user_book_id` CASCADE, `session_id` SET NULL | — | ≤ 1 на книгу | **НІ — свідомо виключено** |

**Разом: 37 таблиць.** `BackupRepository.ts` включає всі 37, окрім `journal_draft` (свідомо, задокументовано в Migration 003 і `docs/DATABASE.md`: «чернетка є лише локальним незбереженим станом пристрою»).

⚠️ **Документаційний drift #1:** коментар у `BackupRepository.ts:104` пише «28 таблиць» — застаріле число, реальна кількість у `BACKUP_TABLE_ORDER` на момент аудиту — **37**. Не критично (коментар, не логіка), але свідчить, що коментарі не оновлюються синхронно з додаванням нових таблиць V1.6.

## Нові таблиці/колонки V1.6 (Фази 4-20, migrations 012-018)

| Міграція | Що додає |
|---|---|
| 012 `book_capsule` | Нова таблиця — Капсула книги (Фаза 4) |
| 013 `capsule_recall` | Нова таблиця — Recall-спроби (Фаза 5) |
| 014 `pre_reading_reflection` | Нова таблиця — До/Після (Фаза 6) |
| 015 `lore_entity`, `journal_lore_link` | Дві нові таблиці — Personal Lore/Characters (Фази 9-10) |
| 016 `user_book.spoiler_safe_enabled` | Нова колонка — Spoiler-Safe Mode (Фаза 11) |
| 017 `dnf_reflection` | Нова таблиця — DNF Improvement (Фаза 12) |
| 018 `idx_shelf_book_user_book` | Новий індекс (без нових даних) — аудит індексів (Фаза 20) |

## Усі 18 міграцій (одним рядком кожна)

| # | Призначення |
|---|---|
| 001 | Базова схема — 28 початкових таблиць |
| 002 | Rebuild `book_source`: додає `'isbndb'` у CHECK (реальний баг-фікс, `CHECK constraint failed` без цього) |
| 003 | Фундамент щоденника: `note` rebuild (+'moment'/is_favorite/reaction), `quote` +колонки, нова `journal_draft` |
| 004 | Нова `book_memory` (Спогад про книгу — текст+посилання на записи) |
| 005 | `book_memory` +`template_id` (шаблон картки) |
| 006 | Нова `book_recommendation_shown` (антидублікат рекомендацій «Завтра») |
| 007 | Rebuild `book_source`: додає `'curated'` у CHECK |
| 008 | Нова `note_category` + `note.category_id` (власні категорії нотаток) |
| 009 | `shelf` +`theme` (тематичне оформлення полиці) |
| 010 | `reading_session` +`reading_experience` («Як читалося?») |
| 011 | `note`/`quote` +`revisit_later` («Повернутися пізніше») |
| 012 | Нова `book_capsule` (V1.6 Фаза 4) |
| 013 | Нова `capsule_recall` (V1.6 Фаза 5) |
| 014 | Нова `pre_reading_reflection` (V1.6 Фаза 6) |
| 015 | Нові `lore_entity`, `journal_lore_link` (V1.6 Фази 9-10) |
| 016 | `user_book` +`spoiler_safe_enabled` (V1.6 Фаза 11) |
| 017 | Нова `dnf_reflection` (V1.6 Фаза 12) |
| 018 | Новий індекс `idx_shelf_book_user_book` (V1.6 Фаза 20, аудит) |

## Документаційний drift, знайдений у `docs/DATABASE.md`

⚠️ **Drift #2 (SQL DDL-блок не збігається з реальним кодом міграцій), CODE VERIFIED:**

`docs/DATABASE.md` наводить «Повну DDL-схему» з двома розбіжностями проти реального `001_base_schema.ts`:

1. Документ: `CREATE INDEX idx_user_book_status ON user_book(status) WHERE deleted_at IS NULL;` (частковий індекс). Реальний код (`src/data/db/migrations/001_base_schema.ts:184`): `CREATE INDEX idx_user_book_status ON user_book(status);` — **без** `WHERE`-клаузи. Крім того, документ повністю **пропускає** `idx_user_book_edition`, який реально існує в коді (`001_base_schema.ts:185`).
2. Документ: `CREATE INDEX idx_loan_active ON loan(returned_at) WHERE returned_at IS NULL;`. Реальний код (`001_base_schema.ts:307`): `CREATE INDEX idx_loan_active ON loan(returned_at);` — теж без `WHERE`.

Код виграє (`SOURCE OF TRUTH = код`): жодного часткового індексу в застосунку немає, обидва індекси — прості, за одним стовпцем. Документація описує «покращену» версію індексів, яка ніколи не була реалізована — це або застарілий план, який забули втілити, або документ написаний під майбутню, ще не зроблену оптимізацію й помилково виданий за поточний стан.

---

# 22. DATA RELATIONSHIP MAP

## ER-карта (текстом), CODE VERIFIED по 18 міграціях

```
Author 1---* WorkAuthor *---1 Work
Work 1---* Edition *---1 Publisher (SET NULL)
Edition *---* Translator (через EditionTranslator)
Work *---* Genre (через WorkGenre)
Work/Edition/UserBook *---* Tag (через TaggedItem, поліморфно, БЕЗ FK на entity_id)
Work 1---* SeriesEntry *---1 Series
Work 1---* LoreEntity (🆕 V1.6, work-рівень — НЕ user_book-рівень)
LoreEntity 1---* JournalLoreLink *---{note|quote} (поліморфно, БЕЗ FK на entry_id)

UserBook *---1 Edition (NOT NULL, CASCADE)
UserBook 1---* ReadingSession
ReadingSession 1---* ReadingProgress (SET NULL при видаленні сесії)
UserBook 1---* Note, 1---* Quote (обидві — session_id SET NULL)
UserBook 1---0..1 Rating         (UNIQUE)
UserBook 1---0..1 BookMemory     (UNIQUE)
UserBook 1---0..1 PreReadingReflection  (UNIQUE, 🆕 V1.6)
UserBook 1---0..1 DnfReflection  (UNIQUE, 🆕 V1.6)
UserBook 1---* BookCapsule       (БЕЗ UNIQUE — навмисно, 🆕 V1.6)
BookCapsule 1---* CapsuleRecall  (🆕 V1.6)
BookCapsule ~~~1 {note|quote}    (М'ЯКЕ посилання, БЕЗ SQL FK)
BookMemory ~~~* {note|quote}     (М'ЯКЕ посилання через JSON entry_refs, БЕЗ SQL FK)
UserBook *---* Shelf (через ShelfBook)

OwnedBook *---1 Edition
OwnedBook 1---* Loan
ReadingGoal, Reminder — незалежні, опційний FK на Work/Series/Loan
AppSettings — singleton
```

## Поведінка каскадів — «що насправді відбувається при видаленні»

Ключова архітектурна риса всієї БД, задокументована послідовно в кожній міграції: **майже всі «батьківські» сутності застосунку (`work`, `edition`, `user_book`, `reading_session`, `note`) видаляються лише М'ЯКО** (`UPDATE ... SET deleted_at = ?`), тому реальні `ON DELETE CASCADE` у схемі **практично ніколи не спрацьовують** у звичайному використанні застосунку. CODE VERIFIED через `grep -n "SET deleted_at"` по всіх репозиторіях:

| Сутність | Метод видалення | Хто реально викликає | Наслідок для дітей |
|---|---|---|---|
| **Work** | **Жодного методу видалення не існує.** `WorkRepository.ts` не має `remove`. Колонка `deleted_at` у схемі є, але жоден код застосунку її не заповнює (крім тестових фікстур `BackupRepository.test.ts:502`, вручну через сирий SQL). | — | Н/д — Work у застосунку принципово незнищенний з UI |
| **Edition** | Так само — жодного `remove` в `EditionRepository.ts` | — | Н/д |
| **UserBook** | М'яко (`UserBookRepository.remove`, `deleted_at`) | «Прибрати з бібліотеки» на Book Details | FK CASCADE на `reading_session`/`note`/`quote`/`rating`/`book_memory`/`book_capsule`/`pre_reading_reflection`/`dnf_reflection`/`shelf_book` **НЕ спрацьовують** (рядок фізично лишається) — реальний захист від «сирітства» цих дітей — виключно `dataIntegrityDoctor.ts` (перевіряє `*_references_deleted_book` для sessions/note/quote/capsule) |
| **ReadingSession** | М'яко (`ReadingSessionRepository.discard`, `deleted_at`) | «Скасувати сесію» в активному екрані сесії | `reading_progress.session_id`/`note.session_id`/`quote.session_id` мають `ON DELETE SET NULL`, але оскільки видалення м'яке — і це **не спрацьовує**; `note`/`quote`, створені під час сесії, лишаються з живим `session_id`, що вказує на м'яко-видалену сесію. `dataIntegrityDoctor` перевіряє це через `*_session_mismatch`, але НЕ через прямий `session softly deleted` чек (NOT VERIFIED — прогалина: код доктора не має явної перевірки «нотатка посилається на м'яко-видалену сесію», лише на м'яко-видалену книгу) |
| **LoreEntity** | М'яко (`LoreEntityRepository.remove`, `deleted_at`) | «Видалити» на екрані Lore-сутності | Реальний FK `journal_lore_link.lore_entity_id → lore_entity(id) ON DELETE CASCADE` **не спрацьовує** (soft delete) — зв'язки залишаються, хоч і посилаються на «видалену» (у сенсі UI) сутність, яка все ще фізично в таблиці |
| **Journal entry (note/quote)** | М'яко (`NoteRepository.remove`/`QuoteRepository.remove`, `deleted_at`) | «Видалити запис» на Book Details/сесії/щоденнику | `book_capsule.journal_entry_id` (м'яке посилання, БЕЗ FK) і `book_memory.entry_refs` (JSON, БЕЗ FK) продовжують вказувати на м'яко-видалений запис — за задумом («лениве узгодження», задокументовано в Migration 012 — UI просто не знаходить запис і ховає секцію) |
| **BookCapsule** | **Жорстко** (`BookCapsuleRepository.remove`: `DELETE FROM book_capsule`) | «Видалити капсулу» | Реальний CASCADE на `capsule_recall` — уся історія recall-спроб дійсно видаляється фізично разом із капсулою |
| **BookMemory** | Жорстко (`DELETE FROM book_memory`) | Видалення спогаду | Немає дітей |
| **Shelf** | Жорстко (`DELETE FROM shelf WHERE ... AND is_system = 0`) | Видалення користувацької полиці | Реальний CASCADE на `shelf_book` — зв'язки книга↔полиця дійсно видаляються |

**Висновок цього розділу (HYPOTHESIS з опорою на прочитаний код):** SQL-рівень `ON DELETE CASCADE` в цій схемі є переважно декларативною документацією наміру, а не діючим механізмом захисту цілісності — реальний захист повністю покладається на (а) дисципліну «ніколи не хард-делети user_book/work/edition/session/note/lore_entity» і (б) ручний, non-automatic `dataIntegrityDoctor` (Розділ 25). Це задокументований, свідомий вибір команди (сам `dataIntegrityDoctor.ts:13-19` прямо це пояснює), а не недогляд — але означає, що цілісність даних структурно залежить від того, що розробники ніколи не додадуть новий hard-delete без оновлення доктора.

---

# 23. REREADING MODEL (критичний розділ)

## Як зараз розрізняється перше читання від перечитування — стисло: НІЯК на рівні даних

CODE VERIFIED, пошук по всьому дереву (`grep -rli "readingrun\|reading_run\|readingattempt\|reading_attempt"`) не знайшов **жодного** результату. Концепції `ReadingRun`/`ReadingAttempt`/«прочитання №2» **не існує в схемі БД, репозиторіях чи domain-шарі**.

Єдине, що є — `user_book.status` може приймати значення `'rereading'` (`001_base_schema.ts:174`, CHECK-список статусів). Це прапорець стану, а не подія чи запис історії.

## Що конкретно відбувається технічно (CODE VERIFIED)

1. **`user_book.started_at`/`finished_at` — незмінні після першого встановлення.** `UserBookRepository.updateStatus` (рядки 185-198): `startedAt = current.startedAt ?? (...)`, `finishedAt = current.finishedAt ?? (...)` — тобто якщо `started_at`/`finished_at` вже задані (з першого прочитання), вони **ніколи не переписуються**, навіть коли статус переходить у `'rereading'` і потім знову у `'finished'`. Дата другого завершення просто не фіксується ніде.

2. **`reading_session` не має жодного маркера «якого це прочитання».** Усі сесії для книги (перше читання + будь-яка кількість перечитувань) лежать в одній плоскій таблиці, зв'язаній лише через `user_book_id`. `ReadingSessionRepository.listByUserBookId` (яку показує Book Details як «Історія читання») повертає їх усі без розділення на «прочитання 1» / «прочитання 2».

3. **Pace/прогноз завершення не знають про перечитування.** `computeRollingPace(sessions)` і `predictFinish` (використовуються в `FinishPredictionSection`, `app/work/[workId].tsx`) отримують той самий необмежений список сесій — якщо користувач перечитує книгу через рік після першого прочитання, стара сесія все ще потрапляє у «останній темп».

4. **Start/finish dates перечитування взагалі не фіксуються окремо** — підтверджено п.1.

5. **Book Memory (`book_memory`) — `UNIQUE(user_book_id)`.** CODE VERIFIED (`004_book_memory.ts:33`). Другий спогад при перечитуванні **перезаписує** перший (upsert) — старий спогад про перше прочитання втрачається безповоротно, якщо не збережений у бекапі попередньої версії.

6. **Before/After (`pre_reading_reflection`) — так само `UNIQUE(user_book_id)`.** CODE VERIFIED (`014_pre_reading_reflection.ts:45`, і прямо задокументовано в коментарі: «друге проходження `rereading` перезаписало б попередню рефлексію… прийнятно для V1.6, задокументоване обмеження»). Форма доступна лише коли `status === 'reading'` (`canEditPreReadingReflection`, `src/lib/beforeAfter.ts:43`) — цікаво, що вона **НЕ** доступна при `status === 'rereading'`, тобто продукт свідомо заблокував можливість записати нове «до» для перечитування (можлива непослідовність з наміром — старе «до» першого прочитання лишається показаним як актуальне «до» назавжди).

7. **Capsule (`book_capsule`) — навмисно БЕЗ `UNIQUE(user_book_id)`,** саме через відсутність reading-run-концепції. CODE VERIFIED, детально задокументовано в `012_book_capsule.ts:9-15` і повторено в `src/lib/bookCapsule.ts:76-83` (`canCreateCapsule`): нова капсула пропонується лише для `status === 'finished'`, **НЕ** для `'rereading'` — «перечитування поки не має надійного способу прив'язати нову капсулу до нового прочитання, тож нова капсула під час активного перечитування свідомо не пропонується». `BookCapsuleRepository.getByUserBookId` бере **найновішу за `created_at`**, коли капсул кілька — тобто якщо капсули все ж накопичуються (наприклад, через прямий виклик `create`), стара капсула для читача стає непомітною (перекрита новою), хоча фізично не видалена.

8. **Recall (`capsule_recall`)** — прив'язаний до `book_capsule_id`, тобто успадковує ту саму неоднозначність: recall-історія належить капсулі, а не «прочитанню».

9. **Reading Experience** (`reading_session.reading_experience`) — фіксується на рівні сесії, тож технічно коректно розрізняє сесії різних прочитань (кожна сесія — своя мітка), але **немає жодного агрегованого показу** «як читалося цього разу vs минулого разу», бо немає групування сесій за прочитанням.

10. **Journal spoiler progress (Spoiler-Safe Mode) — явно і свідомо покладається на `current_page` як єдиний сигнал прогресу для перечитування.** CODE VERIFIED, doc-коментар прямо в коді (`src/lib/spoilerSafe.ts:53-57`): «ТЗ REREADING: "Spoiler-safe mode може враховувати поточний reread progress." — `current.currentPage` тут завжди `user_book.current_page`, який під час перечитування так само відображає прогрес ПОТОЧНОГО прочитання». Це працює коректно **лише тому**, що `current_page` — це просто «поточна сторінка зараз», незалежно від того, яке це прочитання за рахунком; записи щоденника з першого прочитання (які логічно вже «не спойлер» для того, хто вже читав) знову ховаються при повторному проході, якщо позначені як «попереду» нового `current_page` на момент старту перечитування.

11. **Статистика (`useOverallStatistics`) і Wrapped (`useWrappedYear`) — реальний функціональний баг, а не лише архітектурне обмеження.** CODE VERIFIED:
    - `src/features/statistics/useStatistics.ts:44`: `UserBookRepository.listStatusOnly(db, 'finished')` — фільтрує **точно за поточним `status === 'finished'`**.
    - `src/features/wrapped/useWrappedYear.ts:43`: `UserBookRepository.listByStatus(db, 'finished')` — те саме.
    
    **Наслідок:** щойно користувач переводить книгу зі статусу `'finished'` у `'rereading'` (щоб перечитати), ця книга **зникає** з `booksFinishedAllTime`, `booksFinishedThisYear` (загальна статистика) і з `booksFinished`/`topAuthor`/`topRatedBook`/`topGenre` (Wrapped за той рік, коли книгу вперше дочитали) — попри те, що `finished_at` (дата першого завершення) фізично й досі стоїть у базі й формально «в межах року». Це відбувається, бо обидва запити фільтрують за `status`, а не за наявністю `finished_at`. Це не гіпотетичний edge-case — перечитування є штатним статусом (`'rereading'` — окреме перелічуване значення в CHECK з самого Migration 001), тобто продукт прямо заохочує дію, яка ламає власну статистику. **CODE VERIFIED, не HYPOTHESIS.**

## Підсумок архітектурних обмежень (прямим текстом)

Застосунок технічно **не розрізняє** перше читання від перечитування як дві окремі події — існує лише мутабельний прапорець статусу без історії прочитань. Практичні наслідки:

- **Статистика й Wrapped недораховують** книги, які зараз перечитуються, хоча вони вже були прочитані раніше того самого року (реальний баг).
- **Book Memory і Before/After втрачають** дані попереднього прочитання при повторному збереженні (upsert без версіонування).
- **Capsule** свідомо не пропонується для перечитування (задокументована прогалина в UX, не баг) — і навіть якщо створюється програмно, лише найновіша видима.
- **Pace/прогноз завершення** й «Історія читання» не розрізняють, які сесії належать якому прочитанню — усе змішано в одному хронологічному списку.
- **Journal spoiler-safe** працює коректно лише завдяки тому, що не залежить від концепції «прочитання» взагалі, а лише від живого лічильника сторінки.

HYPOTHESIS: додавання окремої сутності `reading_run`/`reading_attempt` (FK від `reading_session`, `book_memory`, `book_capsule`, `pre_reading_reflection` до конкретного «проходження» книги) — це найбільша структурна прогалина архітектури V1.6 щодо перечитування, і сама команда це явно й неодноразово визнає прямим текстом у коментарях до мінімум 4 різних міграцій/lib-файлів, послідовно посилаючись одне на одне як на «те саме задокументоване обмеження».

---

# 24. BACKUP

## Формат

CODE VERIFIED (`src/lib/backupSerializer.ts`, `src/data/repositories/BackupRepository.ts`, `docs/BACKUP_FORMAT.md`):

```json
{
  "schemaVersion": 18,
  "exportedAt": "ISO-8601",
  "app": "polytsya",
  "appVersion": "з Constants.expoConfig",
  "data": { "<таблиця>": [ {рядок}, ... ], ... }
}
```

- **`schemaVersion`** — це `LATEST_SCHEMA_VERSION` (= номер останньої застосованої SQLite-міграції, зараз **18**), НЕ версія застосунку.
- **Кількість таблиць у файлі — 37** (усі з `BACKUP_TABLE_ORDER`, Розділ 21), крім `journal_draft`.
- Валідація Zod-схемою (`BackupEnvelopeSchema`) при читанні файлу — перевіряє форму конверта і `app === 'polytsya'`, **не** перевіряє форму даних усередині (`data.record(string, array(record(string, unknown)))` — фактично «будь-який об'єкт»).

## Нові дані V1.6 включені в бекап — ТАК, усі

CODE VERIFIED: `book_capsule`, `capsule_recall`, `pre_reading_reflection`, `dnf_reflection`, `lore_entity`, `journal_lore_link` — усі присутні в `BACKUP_TABLE_ORDER` (`BackupRepository.ts:27-66`), з детальними коментарями про порядок вставки відносно батьківських таблиць. Єдина нова V1.6 таблиця/колонка, **не** експортована — жодної немає; V1.6 нічого не додав до списку «свідомо виключеного» (там і досі лише `journal_draft` з Milestone 11).

## Round-trip

CODE VERIFIED архітектурно: `exportAll` — просте `SELECT * FROM <table>` по кожній таблиці в порядку батько→дитина; `restoreAll` — `DELETE FROM` у зворотному порядку (дитина→батько), потім `INSERT` у прямому порядку, обидва без вимкнення `PRAGMA foreign_keys`, оскільки порядок гарантує коректність FK на кожному кроці. Round-trip логічно симетричний і не має проміжного шару трансформації даних — рядки йдуть 1:1 SQLite→JSON→SQLite. AUTOMATED TEST VERIFIED опосередковано: існує `BackupRepository.test.ts` (347+ рядків), що напряму тестує ці сценарії (включно з рядком, що встановлює `last_backup_at` через сирий SQL для фікстур).

## Стара версія / сумісність

- `MIN_COMPATIBLE_BACKUP_SCHEMA_VERSION = 1` (`backupSerializer.ts:68`) — тобто **всі** 18 версій схеми на сьогодні вважаються сумісними напряму, без data-міграцій.
- `checkSchemaCompatibility`: файл новіший за застосунок → `needs_app_update` (відмова); файл старіший за `MIN_COMPATIBLE` → `needs_data_migration`.
- ⚠️ **Документаційний drift #3:** `docs/BACKUP_FORMAT.md` (§Restore, крок 3) описує механізм «data-міграцій» з `src/data/backup/migrations/*`, які мали б приводити старий JSON до поточної форми. CODE VERIFIED: **такої директорії не існує в репозиторії** (`find src/data/backup -type f` — порожньо). Це не баг (шлях `needs_data_migration` наразі недосяжний, бо `MIN_COMPATIBLE_BACKUP_SCHEMA_VERSION = 1` і найстаріший файл — версії 1), але документ описує інфраструктуру, якої фізично не існує в коді, як щось, що вже «керується через» — заготовка видана за реалізовану систему.

## Валідація

Дві незалежні дії, обидві через `usePickBackupFile`/`parseBackupJson`: (1) звичайний Restore — читає файл, парсить, показує `Alert` з деталями і кількостями, підтвердження перед заміною; (2) окрема кнопка «Перевірити резервну копію» (`app/backup.tsx`, Фаза 13) — той самий парсинг, але **гарантовано ніколи** не веде до restore (сам код explicitly розділяє `onSuccess`-гілки).

## Транзакція відновлення

CODE VERIFIED (`BackupRepository.restoreAll`): весь `DELETE`+`INSERT` по всіх 37 таблицях обгорнутий в **одну** `db.withTransactionAsync`. Повний rollback при будь-якій помилці посеред процесу — БД лишається незмінною.

## Часткове відновлення (partial restore)

**Не підтримується і не потрібне** — `restoreAll` завжди «replace all» (задокументовано прямим текстом у `docs/BACKUP_FORMAT.md`: «Наразі restore — це replace all… merge-режим — можлива майбутня функція, не в V1»). Немає можливості відновити лише частину даних (наприклад, лише щоденник) — усе або нічого, за дизайном.

## Невдале відновлення

Транзакція гарантує атомарність на рівні SQL, але окремо є **пост-restore крок поза транзакцією**: `rebuildCapsuleRemindersAsync` (планування `expo-notifications` для капсул із майбутнім `reopenAt`) виконується **після** коміту основної транзакції й **навмисно не позначає весь restore невдалим**, якщо сам він впаде (задокументовано в `docs/BACKUP_FORMAT.md` п.6 і повторено в `docs/BOOK_CAPSULES.md`). NOT VERIFIED напряму в цьому аудиті (файл `useBookCapsule.ts` не прочитаний повністю), але за документацією й патерном коду це узгоджується з рештою продукту (нотифікації ніколи не блокують основний потік даних).

## Файли обкладинок

**Лише референси (URL/URI), не самі файли.** CODE VERIFIED: `edition.cover_url` — це `TEXT`-поле з URL/локальним URI, а `BackupRepository.exportAll` робить `SELECT * FROM edition`, тобто в бекап потрапляє **рядок** із посиланням, а не бінарні дані зображення. HYPOTHESIS з опорою на архітектуру: якщо `cover_url` — це локальний `file://`-шлях (наприклад, після «Змінити обкладинку» через камеру/галерею на `app/cover-photo/[editionId].tsx`), цей шлях **не буде дійсним на іншому пристрої** після відновлення бекапу — фото обкладинки, зроблене користувачем, технічно може «загубитися» при переносі на новий пристрій. Це не перевірено напряму (не читався код `cover-photo/[editionId].tsx` повністю, не встановлено, чи URI копіюється в постійне сховище чи лишається тимчасовим), тому позначаю це як **NOT VERIFIED, вартий окремої перевірки ризик**.

## Локальні розклади сповіщень (`notification_identifier`)

**НЕ переносяться напряму** — `reminder.notification_identifier` і `book_capsule.notification_identifier`, обидва рядки з файлу, посилаються на ID, видані `expo-notifications` **на іншому пристрої/запуску**. Для капсул це явно вирішено (`rebuildCapsuleRemindersAsync` перепланує після restore). Для звичайних `reminder` — NOT VERIFIED у цьому аудиті, чи є еквівалентний rebuild-крок (файл `useReminders`/reminder-репланування не прочитаний).

## Supabase-дані

**Взагалі не в бекапі.** Увесь бекап — це виключно SQLite-дамп; спільний каталог (`SharedCatalogProvider`), кураторська добірка (`CuratedCatalogProvider`), і будь-які дані в Supabase не мають відношення до локального backup/restore-циклу — архітектурно правильно, оскільки Supabase-каталог — спільний ресурс, не персональні дані одного користувача.

## Що НЕ входить у бекап — підсумок

- `journal_draft` (чернетка композера) — свідомо.
- Бінарні файли обкладинок (лише URL-посилання) — за конструкцією формату.
- OS-стан сповіщень (`notification_identifier` як дійсний токен) — переживає лише як текст, семантично мертвий до repланування.
- Будь-які дані Supabase (спільний каталог, кураторська добірка).
- `app_settings.last_backup_at` — технічно ВХОДИТЬ у дамп таблиці `app_settings` (вона в `BACKUP_TABLE_ORDER`), але сам стовпець ніколи не записується жодним кодом застосунку (підтверджено прямим коментарем у `docs/DATABASE.md:709-716` і `src/lib/backupExportStatusStorage.ts:17`) — тобто цей стовпець завжди `NULL` і в живій БД, і, відповідно, у бекапі; реальний «час останнього бекапу» зберігається окремо через `expo-secure-store`, який **сам по собі теж не входить у JSON-бекап** (SecureStore — поза SQLite).

---

# 25. DATA DOCTOR

**Джерело:** `src/domain/dataIntegrityDoctor.ts` (чиста функція, 473 рядки), `src/domain/dataIntegrityDoctor.test.ts`, `app/data-doctor.tsx`.

## Загальна архітектура

Чиста, синхронна функція `runDataIntegrityCheck(snapshot)` без SQL/React — приймає вже прочитаний «знімок» 11 колекцій рядків (`DataIntegritySnapshot`), повертає список проблем, згрупованих по 6 категоріях ТЗ: `books`, `sessions`, `progress`, `journal`, `shelves`, `series`. Запускається **виключно вручну** кнопкою «Перевірити дані» на `app/data-doctor.tsx` — жодного автоматичного сканування при вході в застосунок/Профіль немає (підтверджено doc-коментарем в самому екрані). **Жодного auto-repair** — лише виявлення і, де можливо, посилання (`DataIntegrityLink`: `work`/`session`/`shelf`/`series`) для ручного переходу й виправлення через звичайний UI.

## Повний список перевірок (17 конкретних кодів `issue.code`)

| Категорія | Код | Логіка | Severity (по факту) | Навігація на виправлення |
|---|---|---|---|---|
| books | `duplicate_isbn_edition` | 2+ (не видалених) edition з однаковим ISBN13/10 | Попередження | → Work першого видання |
| books | `finished_without_finished_at` | `status='finished'` без `finished_at` | Попередження (семантична суперечність) | → Work |
| books | `want_to_read_with_started_at` | `status='want_to_read'`, але `started_at` вже задано | Попередження | → Work |
| books | `finished_before_started` | `finished_at < started_at` | Попередження | → Work |
| books | `user_book_references_deleted_edition` | `edition.deleted_at` заданий, а `user_book` активний | Попередження (сирітство) | → Work |
| books | `capsule_references_deleted_book` 🆕V1.6 | `book_capsule` посилається на м'яко-видалений `user_book` | Попередження | → Work |
| sessions | `session_without_valid_book` | `reading_session.user_book_id` не існує взагалі | Помилка (справжнє сирітство) | → Session |
| sessions | `session_references_deleted_book` | Сесія посилається на м'яко-видалений `user_book` | Попередження | → Session |
| sessions | `negative_duration` | `duration_seconds < 0` | Помилка даних | → Session |
| sessions | `invalid_paused_intervals` | JSON `paused_intervals` не парситься / некоректна форма (`isValidPausedIntervals`) | Помилка даних | → Session |
| progress | `negative_progress_page` | `reading_progress.page < 0` | Помилка даних | → Work |
| progress | `progress_exceeds_page_count` | Сторінка прогресу > `edition.pageCount` | Попередження | → Work |
| progress | `negative_current_page` | `user_book.current_page < 0` | Помилка даних | → Work |
| progress | `current_page_exceeds_page_count` | Поточна сторінка > обсяг видання | Попередження | → Work |
| journal | `note_references_deleted_book`/`quote_references_deleted_book` | Запис посилається на м'яко-видалену книгу | Попередження | → Work |
| journal | `note_session_mismatch`/`quote_session_mismatch` | `session_id` запису вказує на сесію **іншої** книги | Помилка логіки | → Work |
| journal | `note_orphan_category` | `note.category_id` не існує в `note_category` | Попередження | → Work |
| journal | `note_deleted_category` | `note.category_id` вказує на м'яко-видалену категорію | Попередження | → Work |
| journal | `capsule_orphan_journal_entry` 🆕V1.6 | `book_capsule.journal_entry_id` не знайдено ні в notes, ні в quotes | Попередження | → Work |
| shelves | `shelf_book_missing_user_book` | `shelf_book.user_book_id` не існує | Помилка | → Shelf |
| shelves | `shelf_book_deleted_user_book` | Полиця містить м'яко-видалену книгу | Попередження | → Shelf |
| series | `series_entry_missing_series` | `series_entry.series_id` не існує в списку `seriesIds` | Помилка | Немає посилання (`link: null`) |
| series | `series_entry_missing_work` | Запис серії посилається на неіснуючий `work` | Помилка | → Series |
| series | `series_entry_deleted_work` | Запис серії посилається на м'яко-видалений `work` | Попередження | → Series |

Усі повідомлення — людською українською мовою з конкретними id сутностей (п. 54 ТЗ). AUTOMATED TEST VERIFIED: `dataIntegrityDoctor.test.ts` покриває принаймні базовий «чистий» сценарій і сценарій дубліката ISBN (прочитано перші 80 рядків тесту — файл продовжується далі, повне покриття всіх 17+ кодів не перевірене в цьому аудиті рядок-в-рядок, але структура тестів системна: один `describe`-блок на категорію).

## UI-обгортка (`app/data-doctor.tsx`)

По одній картці на категорію з чекмарком (✓ зелений / ⚠ жовтий) і лічильником; проблеми в категорії — клікабельні рядки (коли є `link`), що ведуть безпосередньо на сутність через `navigateToLink`.

## Проблеми, які Data Doctor НЕ перевіряє (можливі кандидати на майбутнє — НЕ реалізовувати, лише назвати)

1. **М'яко-видалена `reading_session`, на яку досі посилається живий `note`/`quote`** — доктор перевіряє `*_session_mismatch` (сесія іншої книги) і `session_references_deleted_book`, але **не** перевіряє явно «запис щоденника посилається на м'яко-видалену сесію тієї ж книги» (окрема, вужча перевірка, ніж наявні).
2. **М'яко-видалений `note_category`, на який досі посилається `journal_draft`** — чернетка взагалі не входить до `DataIntegritySnapshot`.
3. **`lore_entity`/`journal_lore_link` цілісність** — жодна з 17 перевірок не покриває нову V1.6-таблицю `lore_entity` чи `journal_lore_link` (наприклад: `journal_lore_link.entry_id` вказує на неіснуючий note/quote; `lore_entity.work_id` вказує на м'яко-видалений work).
4. **`pre_reading_reflection`/`dnf_reflection` проти м'яко-видаленого `user_book`** — на відміну від `book_capsule`, для цих двох нових V1.6-таблиць немає еквівалентної `*_references_deleted_book` перевірки.
5. **`capsule_recall` проти видаленої капсули** — теоретично неможливо через реальний `ON DELETE CASCADE`, але перевірки на «капсула існує, але не має жодного recall, хоча `reopen_at` давно минув» (функціональна аномалія, не FK-порушення) немає.
6. **Дублікат `book_memory`/`pre_reading_reflection`/`rating` на рівні БД** (порушення `UNIQUE`) технічно неможливий через SQL CHECK/UNIQUE — але «застарілий» запис (наприклад, `pre_reading_reflection` лишився від попереднього прочитання, а книга вже давно `'finished'` знову) семантично цікавий кандидат, не перевіряється.
7. **Дата `reading_session.started_at`/`ended_at` у майбутньому** (некоректний годинник пристрою чи баг) — не перевіряється, лише `negative_duration`.
8. **Перекриття інтервалів двох сесій однієї книги** (дві сесії з `started_at`/`ended_at`, що перетинаються в часі) — не перевіряється.
9. **`shelf_book`/`series_entry` дублікати** — неможливі структурно (PRIMARY KEY/UNIQUE), тож не потрібні; але **осиротілий `tagged_item`** (тег посилається на неіснуючий `work`/`edition`/`user_book` — поліморфне поле без FK) взагалі не перевіряється жодною з 6 категорій.
10. **`field_provenance` проти видаленого `work`/`edition`** — таблиця взагалі не входить у `DataIntegritySnapshot`.agentId: aa9f2554ccc211e9e (use SendMessage with to: 'aa9f2554ccc211e9e', summary: '<5-10 word recap>' to continue this agent)
<usage>subagent_tokens: 324232
tool_uses: 79
duration_ms: 523028</usage># 5. HOME SCREEN — ФАКТИЧНИЙ СТАН

CODE VERIFIED, `app/(tabs)/index.tsx`.

## Структура зверху вниз

Порядок у коді буквально відповідає коментарю над `HomeScreen` ("1. Current Reading; 2. Continue CTA; 3. Today summary; 4. одна контекстна картка; 5. secondary shortcuts") — це один з небагатьох випадків у застосунку, де ТЗ-порядок можна перевірити рядок-у-рядок проти реального рендеру.

| # | Блок | Компонент | Коли показується | Джерело даних | CTA |
|---|---|---|---|---|---|
| 0 | Привітання | `getTimeOfDayGreeting()` | завжди | локальний час пристрою | — |
| 1 | «Зараз читаєш» | `CurrentlyReadingList` | лише якщо є хоч одна книга зі статусом `reading` | `useLibraryByStatus('reading')` + `useReadingContinuity` (пакетно: остання завершена сесія + останній запис щоденника на кожну книгу) | тап по картці → `session/launch/[userBookId]` |
| 2 | (окремого CTA нема) | — | кожен рядок п.1 сам є "Continue" | — | — |
| 3 | «Сьогодні» | `TodayStatsRow` | лише якщо `totalSessions > 0` (інакше не показує самі нулі) | `useOverallStatistics` | — (не інтерактивна) |
| 4 | Контекстна картка | `HomeContextCard` | лише одна з п'яти, або жодної | `useHomeContextCard` (`src/lib/homeContext.ts`) | залежить від типу картки |
| 5 | Компактні шорткати | `HomeShortcuts` | завжди, 4 плитки | — | Щоденник / Історія / Пам'ять / Статистика |
| — | Рекомендаційні картки | `TomorrowEntryPointCard`, `OnePickerEntryPointCard`, `TrendsEntryPointCard` | завжди, усі три одночасно, безумовно | — | «Що почитати завтра?», «Обери мені книгу», «Тренди» |
| — | Порожній стан | `EmptyState` | лише коли немає ні активної сесії, ні книг у "reading" | — | «Обрати книгу» → `/library` |

Список "Зараз читаєш" обрізаний до `HOME_READING_LIST_LIMIT = 5` (з коментарем про те, що раніше — до Milestone 8 — монтувалась уся бібліотека зі статусом reading без обмеження; лічильник "Усі (N)" з'являється, лише коли книг більше 5).

Кожен рядок "Зараз читаєш" — це фактично міні-картка Book Details: обкладинка, назва, автори, прогрес-бар, рядок безперервності читання (сторінка / "Останній раз…" / хвилини / сторінки минулої сесії — кожен фрагмент опційний і незалежно ховається), опційний превʼю останнього запису щоденника (1 рядок, курсивом), і напис-CTA "Продовжити читання". Це вже сам по собі досить щільний блок, помножений на потенційно 5 книг підряд.

## Пріоритезація контекстної картки — реальна логіка

Єдина точка вибору — `selectHomeContextCard` (`src/lib/homeContext.ts`), чиста функція без React/SQL:

```
stale_reading → capsule_due → on_this_day → goal_near_completion → tbr_suggestion → null
```

Це жорсткий `if/else`-ланцюжок: перший кандидат, що не `null`/`false`, перемагає беззастережно. AUTOMATED TEST VERIFIED — `src/lib/homeContext.test.ts` покриває всі п'ять гілок пріоритету явно (`'stale reading перекриває всі інші сигнали'`, `'capsule due переважає on this day/goal/TBR'` і т.д.), плюс окремо тестує кожен `find*Candidate`-селектор (вибір "хто саме" серед кандидатів одного типу — найдовше очікування/найраніший `reopenAt`/найближчий до цілі відсоток), включно з захисним кейсом `target <= 0` (ділення на нуль не повинно "виграти" слот через `Infinity`).

Конфліктів між кандидатами в сенсі "два claim одночасно" структурно бути не може — це не пріоритетна черга з вагами, а лінійний ланцюжок з єдиним переможцем. Реальний "конфлікт", який код сам собі проговорює в коментарях — це можливе змістове дублювання з `ReadingSessionMiniBar` (персистентна панель активного читання над таб-баром, видима з будь-якого екрана): і `stale_reading`-картка, і міні-бар можуть теоретично стосуватись тієї самої книги одночасно (одна — "давно не читав", інша — "зараз активна сесія"), але це різні сигнали (є активна сесія / немає активної сесії) і фактично взаємовиключні за станом, тож на практиці не накладаються.

Дані для чотирьох з п'яти кандидатів рахуються в одному `useHomeContextRestData`-запиті (`Promise.all` з `listByStatus('reading')`, `listByStatus('rereading')`, `BookCapsuleRepository.getDue`, `ReadingGoalRepository.listAll`, `listByStatus('want_to_read')`) — CODE VERIFIED відсутність "10 full-table scans", про яке прямо попереджає ТЗ (усі запити вузькі/індексовані, окрім одного навмисного послідовного N+1 на деталі due-капсул, обґрунтованого тим, що капсул завжди мало).

## Чи Home став занадто довгим

Так, структурно. Навіть у "спокійному" сценарії (0-1 книга в читанні, немає контекстної картки) екран уже складається з: привітання → 1 картка книги → 3 плитки статистики → 4 плитки-шорткати → 3 повнорозмірні рекомендаційні картки → все. Це щонайменше 7-8 окремих блоків без жодного активного читання.

У "заповненому" сценарії (3-5 книг у "reading", є контекстна картка) додається ще 3-5 повних карток книг перед статистикою — екран стає довгим саме там, де ТЗ найбільше боявся "нескінченної стрічки" (`docs/HOME_REDESIGN.md`: "Home НЕ повинен стати нескінченною стрічкою").

Ключове й задокументоване саме в коді послаблення дисципліни "показуй максимум ОДНУ контекстну картку" (яку застосовано буквально до одного конкретного блоку п.4) — три рекомендаційні картки (`TomorrowEntryPointCard`/`OnePickerEntryPointCard`/`TrendsEntryPointCard`) свідомо НЕ підпадають під це правило й показуються всі три одночасно, безумовно, завжди. Коментар у коді прямо це визнає: "заборона 'Не роби великі cards' стосується буквально лише... чотирьох [шорткатів]" — тобто принцип "одна картка за раз" застосований вибірково, лише до офіційно названого в ТЗ блоку, а не до духу правила загалом.

## Чи "зараз читаю" все ще безумовний #1

Структурно — так: рендериться першим після привітання, до будь-якої статистики чи рекомендації (`CODE VERIFIED`, порядок JSX у `HomeScreen`). Але його візуальна вага прямо пропорційна кількості книг у статусі "reading" — при 4-5 активних книгах цей блок сам займає більшу частину першого екрана, "з'їдаючи" ту саму пріоритетність, яку мав дати.

## Кількість одночасно видимих дієвих елементів

У максимальному сценарії (5 книг "reading" + видима контекстна картка) одночасно на екрані (з прокруткою) присутні:
- до 5 CTA "Продовжити читання" (по одному на рядок)
- 1 CTA всередині контекстної картки (кнопка типу "Згадати...", "Переглянути ціль" тощо)
- 4 CTA-плитки шорткатів
- 3 повнорозмірні CTA-картки рекомендацій

Разом — до **13 окремих тапабельних дій**, не рахуючи вкладені елементи (серце-іконка, посилання "Усі (N)").

## Що потенційно можна прибрати/об'єднати

Без пропозиції конкретних рішень (per вимогу ТЗ) — лише фіксація фактів, які самі напрошуються на перегляд: три завжди-видимі рекомендаційні картки порушують же задекларований у цій самій фазі принцип "одна картка за раз"; чотири компактні шорткати (Щоденник/Історія/Пам'ять/Статистика) дослівно дублюються пунктами меню Профілю (`app/(tabs)/profile/index.tsx`, `MENU_ITEMS`) — той самий маршрут, той самий підпис, з двох різних місць навігації.

---

# 6. LIBRARY — ГЛИБОКИЙ UX AUDIT

CODE VERIFIED, `app/(tabs)/library/index.tsx`, `src/features/library/useLibrary.ts`, `src/data/repositories/UserBookRepository.ts`, `src/data/repositories/ShelfRepository.ts`. Перевірено проти `docs/LIBRARY_UX.md` — **дрейфу документації від коду не знайдено**: документ навіть чесно фіксує, чого свідомо НЕ реалізовано (пошук по бібліотеці, фільтр за жанром, лічильник активних фільтрів), і код це підтверджує.

## Структура екрана (вкладка "Усі", дефолтна з Milestone 11)

1. Заголовок "Бібліотека" + 2 кругові кнопки (перемикач список/сітка, "Сортувати" з крапкою-індикатором, коли сортування ≠ default)
2. Горизонтальна стрічка карток полиць (`ShelfCard`/`ShelfThemeCard`, ширина 260px — на екрані одночасно видно ~1.3-1.5 картки) + "+ Нова полиця"
3. Один горизонтально прокручуваний рядок з 7 чипів-фільтрів статусу (Усі/Читаю/Хочу прочитати/Відкладено/Прочитано/Перечитую/Не дочитав), з іконкою ліворуч
4. **Лише на вкладці "Усі"**: дві "розумні" горизонтальні стрічки — "Давно чекають" (найдовше у want_to_read) і "Нещодавно завершені" (найновіші finished), кожна обрізана до `CAROUSEL_LIMIT = 12`, кожна ховається сама, якщо порожня
5. Основний `FlatList` книг — рядок (`BookRow`, 40×58 обкладинка) або сітка 3 колонки (`GridBookItem`), long-press по будь-якій картці → `BookQuickActionsSheet`

Немає жодного пошуку чи фільтра за жанром на цьому екрані — навмисно, задокументовано в `docs/LIBRARY_UX.md` і підтверджено відсутністю такого коду.

## Дані/запити

`useLibraryByFilter(filter, sort)` — при `filter === 'all'`: `UserBookRepository.listAll(db)` = **один SELECT без LIMIT** (`SELECT * FROM user_book WHERE deleted_at IS NULL ORDER BY updated_at DESC`), далі `attachDetailsBatch` — фіксовані 5 пакетних `IN (...)`-запитів (edition/work/publisher/translators/authors) незалежно від N — це справжня, задокументована в коді фікс-версія колишнього 5N+1 (Milestone 8, аудит). Сортування/групування "читані нагорі" (`sortAllLibraryView`) і альтернативні сортування (`applySortOption`) виконуються **в JS, на клієнті**, після завантаження всього масиву.

**Сценарії масштабу (аналіз коду, не benchmark):**
- 1-20 книг: тривіально, жодних проблем.
- 100 книг: усе ще один SELECT + 5 пакетних IN-запитів; рендер — `FlatList`, тобто вікноване (не всі 100 рядків монтуються одночасно) — CODE VERIFIED, `FlatList` замінив колишній `ScrollView`+`.map()` саме через цю проблему (аудит Milestone 8, коментар прямо це фіксує).
- 500-1000 книг: запит і надалі один SELECT (SQLite впорається), але **немає жодного LIMIT/пагінації** на рівні даних — весь список завантажується в пам'ять і пересортовується в JS при КОЖНІЙ зміні фільтра/сортування. Крім того, пакетні `IN (...)`-запити в `attachDetailsBatch`/`EditionRepository.listByIds` будують плейсхолдери з унікальних `editionIds`/`workIds` — при ~1000 унікальних виданнях кількість bind-параметрів у одному запиті наближається до типової межі SQLite (`SQLITE_MAX_VARIABLE_NUMBER`, історично 999 за замовчуванням). Це **HYPOTHESIS/NOT VERIFIED** — у репозиторії немає тесту чи фікстури на 1000 рядків, яка підтвердила б, ламається запит чи ні на цій межі; це ризик, виявлений лише читанням коду, не відтворений.

## Візуальна ієрархія та щільність

На дефолтній вкладці "Усі" перед першою книгою списку стоять: шапка (2 кнопки) → стрічка полиць → 7 чипів фільтра → 2 горизонтальні стрічки-карусель. Це **4 окремі горизонтально-прокручувані/чипові зони**, накладені одна на одну, перш ніж з'явиться хоч один рядок реального списку — і саме на тій вкладці, яку застосунок тепер показує за замовчуванням. Парадоксально: чим більша бібліотека користувача, тим наповненіші стають "Полиці"/"Давно чекають"/"Нещодавно завершені" — тобто щільність шапки зростає разом із розміром бібліотеки, саме тоді, коли користувачу найбільше потрібен швидкий прямий доступ до списку.

## Тап-каунти

- **Продовжити читати книгу**: з Бібліотеки тап по рядку веде **на Book Details, не на запуск сесії** (свідома відмінність від Home, задокументована прямо в коментарі коду) → потім тап "Почати читання"/"Продовжити" в `ReadingControls`. Разом **2 тапи**, і другий тап відбувається лише після прокрутки/пошуку потрібної кнопки на довгому екрані Book Details (див. розділ 7). Це прямо суперечить шляху з Home (1 тап до запуску).
- **Змінити статус**: long-press (жест без візуальної підказки) → тап на чіп статусу в `BookQuickActionsSheet` = 2 дії; або (для тих, хто не здогадається про long-press — сам код це визнає) той самий шлях через Book Details.
- **Знайти книгу**: немає вбудованого пошуку взагалі — лише скрол + чипи фільтра статусу (0 текстового пошуку). Окремий екран `/search` — це інший домен (глобальний офлайн-пошук), не фільтрація вже наявної бібліотеки.
- **Відкрити полицю**: 1 тап на картку (за умови, що вона вже видима — інакше спершу горизонтальний скрол стрічки полиць).
- **Додати книгу**: немає кнопки "+" на самому екрані Бібліотеки — єдиний вхід із порожнього стану ("До пошуку" → `/search`); за наявних книг додавання відбувається виключно через Book Details.
- **Фільтр "Прочитано"**: 1 тап на чіп.

## Smart Sections: покращили чи перевантажили

Змішано. Самі по собі "Давно чекають"/"Нещодавно завершені" — корисний зріз, якого раніше не було, і кожна з них коректно ховається, коли порожня ("quiet degradation" — той самий підхід, що й по всьому застосунку). Але вони додані **саме на вкладку, яка тепер дефолтна**, поверх уже наявної стрічки полиць і рядка з 7 чипів — це найгустіша можлива конфігурація шапки, і саме вона — перше, що бачить користувач при відкритті вкладки.

## Список UX-занепокоєнь (без пропозицій рішень)

- Немає пошуку по бібліотеці (свідомо відкладено, задокументовано).
- Немає фільтра за жанром, хоча дані жанрів уже існують (`GenreTagsSection` на Book Details) і технічно доступні.
- Тап "продовжити читання" дає різну кількість кроків і різні можливості (редагована стартова сторінка) залежно від того, звідки почав користувач — Home чи Бібліотека.
- Швидкі дії доступні лише через long-press — жест без візуальної підказки/afordance на самій картці.
- Дефолтна вкладка "Усі" одночасно є найгустішою (полиці + фільтри + 2 каруселі) з усіх вкладок статусу.
- Немає LIMIT/пагінації на рівні запиту для "Усі" — весь набір книг завантажується в пам'ять і пересортовується в JS на кожен тог фільтра/сортування.
- Теоретичний ризик впертися в межу кількості bind-параметрів SQLite на дуже великих бібліотеках (~1000 унікальних видань) — не перевірено в цьому аудиті.
- Картки полиць широкі (260px) — навіть кілька полиць вимагають горизонтального скролу, щоб побачити всі.
- Нижнє вікно швидких дій (long-press) дублює той самий ChipSelect статусу, що вже є на Book Details, — два розбіжні шляхи до того самого результату, без явно "найшвидшого".

---

# 7. BOOK DETAILS — ГЛИБОКИЙ UX AUDIT

CODE VERIFIED, `app/work/[workId].tsx` (1598 рядків, найбільший екран застосунку), `src/features/book-details/useBookDetails.ts`, `src/components/ui/CollapsibleSection.tsx`.

## Фактична структура (точний порядок з render-функції `BookDetailsScreen`)

Це **не** hero + вкладки. Увесь екран — **один безперервний вертикальний скрол** (`ScreenContainer` без сегментів/табів), у якому послідовно рендериться до 14 блоків:

1. Обкладинка (128×188) + посилання "Змінити/Додати обкладинку" (якщо є `primaryEdition`)
2. Назва, автори, посилання на серію (якщо `seriesContext`)
3. Опис (якщо є)
4. **[згорнуто за замовчуванням]** `CollapsibleSection "Жанри та теги"` — куратовані жанри-чипи + "свій жанр", вільні теги
5. `LibrarySection` (якщо є `primaryEdition`) — **завжди розгорнуто**: кнопка старт/продовження читання (`ReadingControls`), ChipSelect статусу (7 опцій) + сердечко "улюблене", посилання "Переглянути підсумок читання" (якщо finished/rereading), перемикач "є в мене фізично", перемикач spoiler-safe (лише reading/rereading), чипи полиць + "Нова", кнопка "Прибрати з бібліотеки"
6. `StaleReadingSection` (лише якщо userBook і status reading/rereading і сесія "застаріла") — картка з CTA "Згадати, де я зупинився"
7. `LoreSection` ("Світ книги") — завжди, незалежно від статусу книги
8. `PreReadingReflectionSection` ("До читання", лише якщо userBook) — форма/перегляд видимі, лише поки статус реально "Читаю"/"Перечитую" (`canEditPreReadingReflection`), або якщо запис уже існує
9. `DnfReflectionSection` ("Не дочитав") — видима лише якщо `dnf_reflection`-рядок уже існує (тобто книга хоч раз мала статус "Не дочитав")
10. `FinishPredictionSection` (якщо userBook + primaryEdition)
11. `RatingSection` (якщо userBook) — зірки з кроком 0.5 + відгук
12. `JournalSection` (якщо userBook + primaryEdition) — лічильник, форма "+ Додати" (нотатка/цитата + категорія), список записів
13. **[згорнуто за замовчуванням]** `CollapsibleSection "Історія читання"` — лише якщо є завершені сесії
14. **[згорнуто за замовчуванням]** `CollapsibleSection "Видання (N)"` — лише якщо `editions.length > 0`

`CollapsibleSection` (`defaultExpanded` за замовчуванням `false`, і жоден з трьох викликів на екрані не передає `true`) — отже, **рівно 3 з 14 блоків** згорнуті за замовчуванням; решта ~10-11 (залежно від умов) завжди повністю розгорнуті й завжди рендеряться, коли їхня умова виконується.

Сам компонент `CollapsibleSection` містить наймовірніше найпряміший самопризнаний факт у всьому кодовій базі: doc-коментар прямо каже, що це "свідомий, обмежений трейд-офф... а не повний редизайн з hero+вкладками", бо Book Details — "найскладніший і найбільш взаємопов'язаний екран застосунку (торкається бібліотеки, оцінки, щоденника, історії читання, видань, жанрів/тегів, серії, прогнозу завершення)".

## Кількість CTA

Для книги в статусі "reading" з повними даними одночасно видимі кнопки/лінки: змінити обкладинку, старт/продовжити читання, переглянути підсумок (умовно), перемкнути "є в мене", перемкнути spoiler-safe, додати полицю, прибрати з бібліотеки, "Згадати де зупинився" (умовно), відкрити світ книги, додати/редагувати "До читання", додати запис щоденника — **щонайменше 10-11 окремих кнопок**, не рахуючи чипи (статус/жанри/теги/полиці) чи дії всередині записів щоденника (обране/реакція/повернутися пізніше/видалити).

## Скрол

Для активно читаної книги з рейтингом, записами щоденника й історією ефективно ~10-11 завжди розгорнутих блоків стоять поспіль вертикально — це справді довгий екран без якорів/швидких переходів між блоками.

## Стани книги (перевірено по коду)

- **Активна книга (reading)**: найгустіший стан — усе перелічене вище, плюс `StaleReadingSection`, якщо давно не читав.
- **Прочитана книга (finished)**: `ReadingControls` і надалі рендериться (userBook існує) і пропонує "Почати читання" знову (перечитування); з'являється посилання "Переглянути підсумок"; `StaleReadingSection` і spoiler-safe перемикач зникають (фільтр статусу); `PreReadingReflectionSection` ховається, якщо запису немає (canEdit=false); Rating/Journal/History/Editions лишаються.
- **TBR (want_to_read)**: `PreReadingReflectionSection` повністю ховається (canEdit=false і запису ще немає); але `RatingSection` і `JournalSection` **не мають гейту за статусом** — застосунок технічно дозволяє оцінити й вести щоденник по книзі, яку ще не почав читати.
- **DNF (did_not_finish)**: з'являється `DnfReflectionSection` (сторінка/причина/нотатка, авто-зафіксована при переході статусу); `PreReadingReflectionSection` уже не редагується (лише перегляд, якщо був); `StaleReadingSection` не показується (фільтр статусу).
- **Книга без видання** (`primaryEdition === null`, що також означає `editions.length === 0`): весь `LibrarySection` не рендериться взагалі — немає ні статусу, ні "додати до бібліотеки", ні полиць з Book Details у такому стані; лишаються лише опис, жанри/теги, "Світ книги". Секція "Видання" теж прихована (нема що показувати).
- **Книга без обкладинки**: `CoverThumbnail` очікувано падає на `coverFallbackColor` — не перевірено візуально, лише виведено з коду (CODE VERIFIED наявність пропу, NOT VERIFIED як це виглядає на пристрої).
- **Standalone vs. серія**: єдина відмінність — рядок-посилання на серію під назвою/автором; жодних інших структурних змін.

## Висновок

Так, Book Details прямо є екраном "усе про все" — і це не інтерпретація автора звіту, а буквально те, що визнає власний doc-коментар компонента `CollapsibleSection`, написаний авторами застосунку. Три згорнуті секції — недорогий і свідомо названий компроміс, не структурне рішення проблеми довжини екрана.

---

# 8. CORE READING FLOW

CODE VERIFIED, `app/session/launch/[userBookId].tsx`, `app/session/[sessionId].tsx` (878 рядків), `app/completion/[workId].tsx`, `src/data/repositories/ReadingSessionRepository.ts`, `src/data/repositories/ReadingProgressRepository.ts`, `src/lib/sessionTiming.ts`.

## Точний потік

**Старт, два різні шляхи з різною поведінкою:**

- **З Home**: тап по рядку "Зараз читаєш" → `session/launch/[userBookId]` (окремий екран з **редагованим** полем "Почати зі сторінки", попередньо заповненим з `currentPage`, і опційним полем "Ціль, хв") → тап "Почати читання" → `session/[sessionId]`. Якщо сесія для цієї книги вже активна — автоматичний `router.replace` одразу на `session/[sessionId]`, без проміжного екрана.
- **З Library/Book Details**: тап по рядку → Book Details (довгий екран, розділ 7) → тап "Почати читання"/"Продовжити" в `ReadingControls` → напряму `session/[sessionId]`, **без редагованого поля старту** — стартова сторінка мовчки береться з поточного `currentPage`.

Обидва шляхи — 2 тапи до таймера, але з різними можливостями; це реальна, задокументована лише опосередковано (коментарями "той самий трискладовий стан... навмисно продубльований") неузгодженість між точками входу.

**Активна сесія (єдина на застосунок):** `ReadingSessionRepository.getActiveSession()` шукає `ended_at IS NULL` без прив'язки до книги — CODE VERIFIED, коментар прямо каже: "активна сесія — щонайбільше одна на весь застосунок". Спроба почати другу сесію (з будь-якого з двох входів) показує блокуючу картку "Спершу заверши поточне читання" замість форми старту.

**Під час сесії:** таймер тікає автоматично (без дій користувача); Пауза/Відновити — 1 тап; композер щоденника **завжди розгорнутий** (не "+ Додати", свідомо, бо це "головна дія цього екрана") — категорія/текст/сторінка, чернетка автозберігається в SQLite (`journal_draft`) з дебаунсом 600мс і відновлюється один раз при вході на екран; "Завершити читання" відкриває форму (з автопаузою таймера на час заповнення), поля: кінцева сторінка (текстово опційна), нотатка про настрій (опційна), 1 з 7 emoji-реакцій (опційна) → "Зберегти сесію" → непослідовна панель "Як читалося?" (5 фіксованих значень або "Готово", не блокує, fire-and-forget) → `router.replace` **на Book Details** (`/work/[workId]`).

**Важливий структурний факт:** завершення сесії читання **не** веде автоматично на `Completion` (`app/completion/[workId].tsx`). Completion-екран відкривається лише окремою, ручною дією — зміною статусу книги на "Прочитано" через `ChipSelect` у `LibrarySection` на Book Details (`handleStatusChange`, `if (status === 'finished' && !wasFinished) router.push('/completion/...')`). Тобто послідовність "Finish → Reading Experience → Completion", описана в ТЗ як єдиний потік, у коді складається з **двох незалежних дій користувача**: закінчити сесію (веде на Book Details) і потім окремо перемкнути статус на "Прочитано" (веде на Completion).

## Надійність таймера

CODE VERIFIED, `src/lib/sessionTiming.ts`: `computeElapsedMs = now - startedAt - pausedMs`, чиста функція, жодного накопичувального React/JS-стану. Сесія пишеться в SQLite **одразу при старті** (`ReadingSessionRepository.start`, 1 INSERT), тож force-quit/крах посеред читання не втрачає прогрес — після relaunch той самий розрахунок з тими самими даними дає правильний час. `useLiveElapsedMs` лише перерендерює раз/секунду для візуального тікання — це не джерело істини.

Втім: **немає жодного автотесту** для `src/lib/sessionTiming.ts` (`computeElapsedMs`/`computePausedMs`/`isCurrentlyPaused`/`formatDuration`) — перевірено пошуком у всьому репозиторії, файла `sessionTiming.test.ts` не існує, попри те, що сам код називає цю логіку "критичний core loop" (п.12 ТЗ). Це NOT VERIFIED автотестом, лише CODE VERIFIED читанням.

## Background/foreground

Пошук `AppState` по всьому репозиторію дав **нуль збігів** — жодного явного опрацювання переходу застосунку у фон/на передній план ніде немає. Оскільки таймер — чиста функція від `now`, це не веде до втрати даних, але означає: час, проведений із застосунком у фоні (дзвінок, перемикання на інший застосунок, заблокований екран) без ручної паузи, **мовчки зараховується як час читання**. HYPOTHESIS: це не задокументована свідома відмова, а просто неопрацьований кейс.

## Пауза/відновлення — надійність і складність

`ReadingSessionRepository.pause`/`resume` — не атомарний SQL-вираз, а "прочитати → перевірити → записати". Коментарі в `app/session/[sessionId].tsx` прямо документують реальний, раніше знайдений race condition ("незалежний аудит після Milestone 11, п.1"): кілька одночасних викликів pause/resume із різних джерел (кнопка, автопауза при відкритті форми завершення, "Назад") могли мовчки затирати інтервал паузи один одного. Виправлення — ручна черга з одним "у польоті" запитом (`pauseResumeInFlightRef`/`queuedPauseIntentRef`) плюс синхронний "намір" (`pausedIntentRef`) проти застарілих даних запиту. Це робочий, CODE VERIFIED захист, але сама його складність (кілька `ref`, відкладені наміри, відкат при помилці кожного) — сигнал крихкості; **жодного автотесту** на цю конкретну гонку немає.

## Форми / прогрес сторінки

Немає жорстко блокуючих форм у самому циклі. Але: якщо поле "На якій сторінці зупинився?" лишити порожнім, `handleFinish` мовчки підставляє `data.session.startPage` (`Number.isFinite(parsedEndPage) ? parsedEndPage : data.session.startPage`) — сесія фіксується як **0 сторінок прогресу** з повною тривалістю, без жодного попередження чи валідації. Це легко відтворюваний, тихий дефект якості даних.

## Перечитування / кілька активних книг / офлайн

- Кілька книг одночасно можуть мати статус "reading"/"rereading" (Home показує до 5), але **лише одна** може мати активну сесію (`reading_session` з `ended_at IS NULL`) — жорсткий глобальний лок, підтверджений в обох точках входу однаково.
- Перечитування (`status = 'rereading'`) трактується як звичайне продовження — `ReadingControls`/`StaleReadingSection` обробляють `reading`/`rereading` ідентично; нові сесії просто додаються до тієї самої історії `user_book`, без поняття "прохід №2" — "Історія читання" не розділяє прочитання й перечитування візуально.
- Увесь шлях сесії читання (старт/пауза/відновлення/завершення/чернетка щоденника) — виключно локальний SQLite, без жодного мережевого виклику в цих репозиторіях (CODE VERIFIED відсутністю fetch/HTTP у цих файлах) — офлайн-стійкість тут випливає з архітектури, а не з окремого обробленого сценарію.

## Усі точки запису в БД (у порядку потоку)

1. Старт сесії: 1 INSERT `reading_session`.
2. Пауза: 1 UPDATE `reading_session.paused_intervals`.
3. Відновлення: 1 UPDATE `reading_session.paused_intervals`.
4. Автозбереження чернетки щоденника (дебаунс 600мс): UPSERT `journal_draft`.
5. Збереження запису щоденника під час сесії: INSERT `note`/`quote` + умовний UPDATE `user_book.current_page` (лише якщо введена сторінка > поточної) + очищення `journal_draft`.
6. **Завершення сесії** — одна транзакція (`db.withTransactionAsync`, CODE VERIFIED, явно виправлено після аудиту Milestone 8, коли ці 3 записи йшли без спільної транзакції): UPDATE `reading_session` (ended_at/paused_intervals/end_page/duration_seconds/mood_note) + UPDATE `user_book.current_page` + INSERT `reading_progress` (`source='session'`).
7. Опційна emoji-реакція після завершення: INSERT `note` (type='moment') + UPDATE `reaction` — окремо від транзакції п.6, best-effort (помилка лише логується).
8. Опційна "Як читалося?": 1 UPDATE `reading_session.reading_experience` — fire-and-forget, не блокує навігацію.
9. Скасування сесії: 1 UPDATE `reading_session.deleted_at` (м'яке видалення; записи щоденника НЕ видаляються).

## Де стан сесії може дублюватись або губитись

- **Порожня кінцева сторінка → тихий 0-прогрес** (п. вище) — найконкретніший знайдений дефект якості даних.
- **Розбіжність джерела істини прогресу**: `docs/DATABASE.md`-принцип, задокументований прямо в коментарі `ReadingProgressRepository.ts` — "статистика/графіки читають лише `reading_progress` + `reading_session`, ніколи не єдиний `user_book.current_page`". Але оновлення сторінки з композера щоденника **під час сесії** (`useUpdateCurrentPage` у `JournalComposer`) оновлює **лише** `user_book.current_page`, **без** нового рядка в `reading_progress`. Це означає: проміжний стрибок сторінки, зроблений через запис у щоденнику, не потрапляє в append-only журнал прогресу, і будь-яка статистика/графік, що читає строго з `reading_progress`, не побачить цей проміжний прогрес до моменту завершення сесії (коли `finish()` таки пише в `reading_progress`). Це конкретна, цитована по файлах суперечність між задокументованим принципом і реальною поведінкою.
- Ручна черга pause/resume — єдина точка складності, де майбутня зміна коду могла б повторно ввести вже одного разу виправлену гонку; регресійного тесту немає.

---

# 36. VISUAL COMPLEXITY AUDIT

CODE VERIFIED, підрахунок блоків/CTA/чипів зроблено читанням render-функцій (не піксель-перфектним вимірюванням).

| Екран | Секцій/блоків (прибл.) | Одночасних CTA | Чипів/фільтрів | Карток | Вердикт | Обґрунтування |
|---|---|---|---|---|---|---|
| **Home** | 5-8 (привітання, до 5 карток "зараз читаю", статистика, 1 контекстна, 4 шорткати, 3 рекомендації) | до 13 | 0 | до ~9-13 | **BUSY** | Структура впорядкована (Фаза 18 навела лад), але 3 рекомендаційні картки завжди видимі одночасно, порушуючи власний принцип "1 картка за раз", застосований лише до контекстного блоку. |
| **Library** ("Усі", дефолт) | 4 зони над списком (полиці, 7 чипів, 2 каруселі) + віртуалізований список | 2 кнопки шапки + N (полиці) + 7 (фільтри) | 7 статус-чипів | до 12+12 у каруселях + полиці | **BUSY→OVERLOADED** (саме на дефолтній вкладці) | Найгустіша шапка з'являється саме на вкладці, яку застосунок тепер відкриває за замовчуванням; інші вкладки статусу (без каруселей) — **ACCEPTABLE**. |
| **Book Details** | до 14 блоків (3 згорнуті, ~10-11 завжди розгорнуті) | 10-11+ | статус (7) + жанри + теги + полиці | багато `Card` без обмеження | **OVERLOADED** | Самопризнано в коді ("найскладніший... екран застосунку", компроміс без повного редизайну). |
| **Journal** (`app/journal/index.tsx`) | заголовок + пошук + 2 stat-картки + ReactionCountsRow + 6 фільтрів (тип/обране/повернутися пізніше/книга/реакція/дата) перед стрічкою | 6+ фільтрів-контролів | тип (кілька) + реакція (~7) + дата (кілька) | 2 stat-картки | **OVERLOADED** | Найгустіша "контролі-перед-контентом" шапка в усьому застосунку — 6 окремих фільтрувальних елементів стоять перед першим записом стрічки, для екрана, чия основна робота — показати хронологічну стрічку. |
| **Book Memory** (`app/memory/[workId].tsx`) | прев'ю картки + вибір шаблону + 2 timeline + before/after (умовно) + revisit-later + lore + capsule + 2 кнопки поділитись/зберегти | 4-6 | шаблон картки | 1 велике прев'ю + кілька `Card` | **BUSY** (ближче до OVERLOADED для книг з великою історією) | Кожен блок сам ховається, якщо порожній ("quiet degradation"), тож щільність сильно залежить від того, скільки даних накопичено про книгу. |
| **Profile** (`app/(tabs)/profile/index.tsx`) | 1 stat-картка (умовна) + 1 плаский список меню (13 пунктів в одній `Card`) + 3-кнопковий перемикач теми | 13 рядків меню + 3 кнопки теми | 0 | 1-2 | **CALM** | Найпростіший з перевірених екранів — жодних чипів, жодної статистики крім однієї стрічки, суто навігаційний список. |

---

# 45. CORE LOOP AUDIT

CODE VERIFIED там, де вказано; частина суджень — HYPOTHESIS, позначено окремо.

## Головний цикл: Open → Continue → Read → Capture → Finish session → Progress saved → Return later

**Екрани, які реально торкає цикл:** Home або Library (вхід) → (опційно, лише з Library-шляху) Book Details → (опційно, лише з Home-шляху) `session/launch` → `session/[sessionId]` (таймер + композер + форма завершення + панель рефлексії, все на одному екрані/стані) → назад на Book Details (не на Completion — див. розділ 8).

**Тап-каунт для найкоротшого реалістичного проходу (Home, відновлення вже активної сесії, без запису в щоденник, без рефлексії):**
1. Тап рядка "Зараз читаєш" на Home (авто-redirect повз форму запуску, бо сесія вже активна) → таймер.
2. Тап "Завершити читання".
3. Тап "Зберегти сесію" (кінцева сторінка — за замовчуванням із запиту, якщо не змінено).
4. Тап "Готово" на панелі рефлексії (або просто піти далі).

≈ **3-4 тапи** від Home до збереженого прогресу за найкоротшим шляхом. Через персистентний `ReadingSessionMiniBar` (доступний з будь-якої вкладки) — тап на "галочку" одразу відкриває форму завершення (`?openFinish=1`), тобто **2 тапи** до заповненої форми завершення з будь-якого місця застосунку.

Старт нової сесії з нуля (Home-шлях, редагована форма) додає ще 1-2 тапи (перейти на екран запуску + "Почати читання").

**Блокуючі форми:** формально жодної — навіть кінцева сторінка технічно необов'язкова (тихо підставляється `startPage`, див. розділ 8). **Опційні форми:** кінцева сторінка (м'яко-обов'язкова, без валідації), нотатка про настрій, emoji-реакція, будь-які записи щоденника під час сесії, "Як читалося?", деталі DNF (за потреби).

**Реальні точки тертя (з прочитаного коду):**
- Два різних шляхи старту сесії (Home: редагована сторінка старту; Library/Book Details: мовчки поточна сторінка) — різна функціональність залежно від входу.
- Відсутність `AppState`-обробки — час у фоні мовчки зараховується як час читання.
- Порожня кінцева сторінка → тихий запис "0 сторінок прогресу" замість валідації/попередження — легко відтворюваний, б'є по головній метриці застосунку (сторінки прочитано).
- Глобальний лок "одна активна сесія" — свідоме архітектурне рішення, але реальне обмеження для читачів, які паралельно ведуть кілька фізичних книг.
- Шлях через Library проходить крізь 14-блоковий Book Details (розділ 7) перш ніж дійти до кнопки старту — додаткова прокрутка/пошук кнопки, якої Home-шлях уникає повністю.

## Оцінки 1-10

**Швидкість: 7/10.** З Home чи з персистентного `ReadingSessionMiniBar` (видимого звідусіль) до працюючого таймера/відкритої форми завершення — 1-2 тапи, CODE VERIFIED. Але шлях через Library/Book Details помітно довший і менш прямий, і єдиної узгодженої "найшвидшої" кнопки для всіх точок входу немає. Оцінка ґрунтується виключно на підрахунку тапів у коді — жодного виміряного часу, аналітики чи бенчмарку в застосунку немає.

**Ясність: 6/10.** Сама машина станів сесії (одна активна сесія, явні повідомлення "спершу заверши іншу" в обох місцях, де це може статись) недвозначна й перевірена частково автотестом (`homeContext.test.ts` — хоча це про Home-картку, не про саму сесію; для самого екрана сесії автотестів немає). Але екрани, крізь які цикл проходить (Library, Book Details), самі по собі щільні (розділи 6-7), що працює проти загальної ясності подорожі, навіть якщо сам екран сесії мінімалістичний.

**Надійність: 6/10 — і я не повністю впевнений навіть у цій цифрі.** На користь: таймер — чиста функція від збереженого в SQLite стану (переживає крах/relaunch за конструкцією, CODE VERIFIED), `finish()` — атомарна транзакція (явно виправлено після аудиту), чернетка щоденника автозберігається в SQLite. Проти: жодного автотесту для `sessionTiming.ts`, задокументована історія реальної гонки pause/resume, виправленої вручну складеною чергою без регресійного тесту, відсутність `AppState`-обробки, і конкретний, підтверджений цитатами розрив між задокументованим принципом ("лише `reading_progress`, ніколи голий `current_page`") і реальною поведінкою `JournalComposer`. Хтось, хто вагоміше оцінює непокриту тестами конкурентну логіку, міг би обґрунтовано поставити нижче.

**Емоційна цінність: 6/10, переважно HYPOTHESIS.** Застосунок демонструє послідовний, конкретний намір: завжди розгорнутий низькотертєвий композер думок просто під таймером, необов'язкова нейтральна рефлексія "Як читалося?", задокументована мова без почуття провини для DNF/давно-не-читаних станів ("Не використовуй guilt language" — цитата з коментаря), emoji-реакції настрою. Це CODE VERIFIED через копірайт і коментарі в кількох незалежних файлах, тобто намір справжній і послідовний. Але в застосунку немає аналітики, немає користувацьких досліджень, і за весь цикл V1.6 є лише один неформальний прогін через Expo Go на реальному iPhone цієї сесії (перевірено, що застосунок запускається, БД відкривається, міграції проходять) — жодних структурованих UX-тестів. Чи справді цей задокументований намір "приземляється" емоційно для реального читача — невідомо; ця оцінка ґрунтується на тоні коду й копірайту, а не на жодному спостереженні за реальним користувачем.
# Розділ 9: Щоденник (Journal)

## 9.1 Модель даних

«Щоденник» — не окрема фізична сутність, а **union на рівні читання** двох давніших таблиць,
`note` і `quote`. Рішення прийнято свідомо в Фазі 1 Milestone 11 і задокументовано прямо в
коментарі до міграції:

> «Рішення Фази 1 (узгоджено з користувачем): `note` і `quote` лишаються фізично окремими
> таблицями (варіант A — мінімальний ризик...)»
— CODE VERIFIED: `src/data/db/migrations/003_journal_entry_extensions.ts:6-11`

Уніфікований тип читання — `JournalEntry` (CODE VERIFIED: `src/types/journalEntry.ts:19-45`):

```ts
export type JournalEntryKind = 'note' | 'quote';
export type JournalEntryType = NoteType | 'quote'; // NoteType = 'thought'|'question'|'theory'|'general'|'moment'
```

Отже, **шість типів запису**: `thought`, `question`, `theory`, `general`, `moment` (усі — варіанти
`note.type`, CHECK-обмежені на рівні SQLite, `src/data/db/migrations/003_journal_entry_extensions.ts:60`)
і `quote` (не має власного `type` — увесь рядок таблиці `quote` за визначенням є цитатою).

Кожен `JournalEntry` несе: `userBookId`, опційний `sessionId`/`page`/`progressPercent`,
`categoryId` (власна категорія користувача — лише для `note`, шосте «розширення» типу поверх
вбудованих п'яти, `src/types/journalEntry.ts:29-32`), `text`, `comment` (лише для `quote`),
`tags: string[]`, `isFavorite`, `revisitLater`, `reaction: string | null`, `createdAt`/`updatedAt`.

Мутації (favorite/reaction/revisitLater/remove) **не проходять через `JournalRepository`** — він
лише читає union; запис іде напряму в `NoteRepository`/`QuoteRepository` за `entry.kind`+`entry.id`
(CODE VERIFIED: коментар над `JournalRepository`, `src/data/repositories/JournalRepository.ts:149-155`,
і `src/features/journal/useJournal.ts:161-163` — `repositoryFor(kind)`).

## 9.2 UI-екрани

1. **Глобальна стрічка «Мій щоденник»** — `app/journal/index.tsx`. Вхід — картка на Home, без
   окремого таба знизу (5 табів лишаються фіксованими). Показує записи ВСІХ книг упереміш,
   найновіші зверху, згруповані за днем (`buildFeedRows`), з keyset-пагінацією
   (`useInfiniteQuery`, сторінка = 30 записів, `src/features/journal/useJournal.ts:129-159`).
   Фільтри: тип запису, лише обране, лише «Повернутися пізніше», книга (окремий пошук за
   назвою/автором), реакція, дата (пресети «Сьогодні»/«Цей тиждень»/«Цей місяць», без довільного
   календаря-піка — CODE VERIFIED, коментар `app/journal/index.tsx:64-69`), і текстовий пошук
   (дебаунс 250 мс) по `text` (і `comment` для цитат).
2. **Вкладка «Щоденник» на екрані книги** (`app/work/[workId].tsx`, `JournalSection`) — усі
   записи ОДНІЄЇ книги, з формою створення (не завжди розгорнутою — «+ Додати»-патерн), toggle
   favorite/reaction/revisitLater і кнопка видалення.
3. **Композер під час активної сесії читання** (`app/session/[sessionId].tsx`,
   `JournalComposer`) — завжди розгорнута форма (це головна дія екрана), плюс живий список
   «Записано під час цієї сесії» (`SessionJournalEntries`).
4. **«Повернутися до цих думок»** на Book Memory screen (`app/memory/[workId].tsx`) і на екрані
   підсумку читання (`app/completion/[workId].tsx`) — компактні списки записів із
   `revisitLater = true`.

## 9.3 Чернетки (JournalDraft)

Призначення (ТЗ Milestone 11, п.4): автозбереження незбереженого тексту композера, щоб пережити
згортання застосунку/примусове закриття. Зберігається **в SQLite**, не в пам'яті/Zustand
(`journal_draft`, PRIMARY KEY = `user_book_id` — тобто **рівно один активний слот чернетки на
книгу**, природний upsert). Навмисно **не входить у бекап** — CODE VERIFIED:
`src/data/db/migrations/003_journal_entry_extensions.ts:31-35`, `src/types/journalDraft.ts:6-9`.

Життєвий цикл (CODE VERIFIED, `app/session/[sessionId].tsx:636-681`):
- Відновлюється **один раз** при монтуванні композера (`restoredRef`), щоб фоновий рефетч не
  затер те, що користувач уже почав вводити.
- Автозбереження — дебаунс **600 мс** на кожну зміну `kind`/`category`/`text`/`comment`/`page`.
- Якщо і `text.trim()`, і `comment.trim()` порожні — чернетка одразу видаляється
  (`clearDraft.mutate`), а не зберігається порожньою.
- Явно очищується (`clearDraft`) одразу після успішного `createNote`/`createQuote`.

**Задокументований і свідомий компроміс** (не забутий кейс): при відновленні чернетки власна
категорія нотатки (`categoryId`) **НЕ відновлюється** — таблиця `journal_draft` не має власного
поля під неї, відновлюється лише вбудований `type`. CODE VERIFIED:
`app/session/[sessionId].tsx:647-652`.

### Знайдена проблема — чернетка існує ТІЛЬКИ в композері сесії читання

`useJournalDraft`/`useSaveJournalDraft`/`useClearJournalDraft` імпортуються рівно в одному місці
UI — `app/session/[sessionId].tsx` (CODE VERIFIED: `grep` по всьому `app/`+`src/` дає лише цей
файл і сам `useJournal.ts`). Композер нотаток/цитат на екрані Book Details
(`app/work/[workId].tsx`, `JournalSection`, форма створення) **не використовує чернетку взагалі** —
жодного виклику `useJournalDraft`/`useSaveJournalDraft` у файлі. Отже, автозбереження, яке ТЗ
п.4 Milestone 11 описує як загальний захист композера щоденника, реально захищає лише один з двох
місць уведення тексту нотатки/цитати; довгий текст, введений у форму на екрані книги, при
випадковому виході з екрана чи згортанні застосунку зникає безслідно. — CODE VERIFIED
(відсутність виклику), **HYPOTHESIS**: це навмисне звуження обсягу (Фаза 3 ТЗ прямо прив'язана
до «композера на екрані активної сесії»), а не забутий випадок — але ніде в коді/докс це прямо
не обумовлено для другого композера, тож користувач цієї різниці не побачить, поки не втратить
текст.

## 9.4 Редагування й видалення записів

### Знахідка — немає жодного способу відредагувати текст уже збереженого запису

`NoteRepository` і `QuoteRepository` мають рівно такий набір методів: `create`, `remove`,
`listByUserBookId`, `setFavorite`, `setReaction`, `setRevisitLater`, `countAll` (для `Note` ще й
через union) — **немає методу `update`** ні для тексту нотатки, ні для тексту/коментаря цитати.
CODE VERIFIED: повний лістинг `src/data/repositories/NoteRepository.ts` (104 рядки) і
`grep -n "^export const\|async "` по `QuoteRepository.ts` (той самий набір методів). Хуки
`src/features/notes/useNotes.ts` і `src/features/quotes/useQuotes.ts` експортують лише
`useNotes`/`useCreateNote`/`useRemoveNote` (відповідно `useQuotes`/`useCreateQuote`/`useRemoveQuote`)
— жодного `useUpdateNote`/`useUpdateQuote`. У `app/work/[workId].tsx` (єдиний екран із повним
редагуванням нотаток/цитат по книзі) кнопка над рядком запису — лише іконка `trash-outline`,
що викликає `handleRemove` (CODE VERIFIED: `app/work/[workId].tsx:1166-1172`, `:1296-1306`).

**Наслідок для користувача**: щойно нотатку чи цитату збережено, її текст, сторінку, тип/категорію
чи коментар **неможливо виправити** — навіть банальну одруковану помилку. Єдиний спосіб «змінити»
запис — видалити його й створити заново, що втрачає оригінальну `createdAt`, будь-яку вже
поставлену реакцію/обране/«повернутися пізніше», а також ламає посилання на цей запис зі всіх
місць, які зберігають `entryId` за значенням (Book Capsule — `journal_entry_id`,
`src/data/repositories/BookCapsuleRepository.ts:14`; Book Memory card — `entryRefs`,
`app/completion/[workId].tsx:129-131`) — такі посилання стають «сирітськими» (сам застосунок це
явно визнає: `capsule_orphan_journal_entry` у «Перевірці даних», `docs/BOOK_CAPSULES.md:226-228`).
Це найпомітніший продуктовий недолік щоденника: користувач пише особисті нотатки роками, і
жодного шляху виправити одруківку/уточнити думку немає — лише «видалити й почати заново».
Порівняно контрастно: `PreReadingReflectionRepository`/`DnfReflectionRepository` (розділ 10) мають
повноцінний `upsert`/`updateDetails`, тобто застосунок явно ВМІЄ робити редагування там, де про
нього подумали — просто не подумали про нього для основного тексту нотатки/цитати.

### Знахідка — видалення запису без підтвердження й без undo

Той самий обробник `handleRemove` (`app/work/[workId].tsx:1166-1172`) викликається одним тапом
по іконці кошика, без жодного `Alert.alert`/діалогу підтвердження і без toast «Скасувати». CODE
VERIFIED: `useRemoveNote`/`useRemoveQuote` (`src/features/notes/useNotes.ts:47-61`) одразу
викликають `NoteRepository.remove`/`QuoteRepository.remove` (м'яке видалення —
`UPDATE note SET deleted_at = ?`), без проміжного стану підтвердження в самому UI-обробнику.
Технічно запис лишається в БД (`deleted_at`), тобто теоретично відновний прямим SQL, але **немає
жодного UI-шляху** користувача повернути випадково видалений запис. У поєднанні з відсутністю
редагування (вище) це означає: єдина дія, доступна користувачу для «виправлення» запису, —
безповоротне (з погляду UI) видалення без запобіжника.

## 9.5 Валідація й ліміти довжини

- Мінімальна довжина: `CreateNoteInputSchema`/`CreateQuoteInputSchema` вимагають
  `text.trim().min(1)` (CODE VERIFIED: `src/types/note.ts:40`, `src/types/quote.ts:32`) —
  порожній (чи лише пробіли) текст неможливо зберегти, кнопка «Зберегти запис» також вимкнена,
  поки `!text.trim()` (`app/session/[sessionId].tsx:757`).
- Коментар цитати: `CreateQuoteInputSchema.comment` — `z.string().trim().min(1).optional()`, тобто
  поле або відсутнє, або непорожнє після trim; обидва місця виклику коректно конвертують порожній
  рядок у `undefined` перед відправкою (`comment.trim() || undefined`,
  `app/session/[sessionId].tsx:707`, `app/work/[workId].tsx:1155`) — інакше `min(1)` кинув би
  помилку валідації на порожній, але не-`undefined` рядок.
- **Максимальна довжина — НЕ ВСТАНОВЛЕНА ніде.** CODE VERIFIED: `grep -rn "maxLength"` по всьому
  `src/`+`app/` не дає жодного збігу в контексті нотаток/цитат/композерів; жодна Zod-схема не має
  `.max(...)` для `text`/`comment`. Колонка в SQLite — звичайний `TEXT` без обмеження. Це означає:
  користувач технічно може вставити (paste) текст будь-якого розміру (наприклад, увесь розділ
  книги) як «нотатку», і застосунок це збереже без попередження.
- NOT VERIFIED: як довгий текст (десятки тисяч символів) впливає на продуктивність рендеру. У
  глобальній стрічці (`app/journal/index.tsx`) рядок обрізається `numberOfLines={3}`
  (`JournalEntryRow`, `:210`), але у вкладці книги (`app/work/[workId].tsx`, `JournalSection`)
  текст рендериться **без `numberOfLines`** (CODE VERIFIED: `AppText variant="body"` без пропу
  обмеження рядків над `{entry.text}`), і сам список — простий `.map` без пагінації
  (`useJournalEntries` викликає `listByUserBookId` із `limit: 5000`,
  `src/data/repositories/JournalRepository.ts:270-273`) всередині прокручуваного екрана, не
  `FlatList`. Для книги з тисячами записів чи кількома дуже довгими нотатками це потенційна
  проблема продуктивності — HYPOTHESIS, не перевірено вручну (немає можливості запустити
  застосунок у цій сесії).
- Спецсимволи/emoji: жодного санітайзингу/екранування рядка перед збереженням у SQLite (звичайний
  bind-параметр, тому SQL-ін'єкція виключена сама по собі — параметризовані запити скрізь), і
  жодного тесту з emoji/юнікодом у `NoteRepository.test.ts`/`QuoteRepository.test.ts`/
  `JournalRepository.test.ts` (CODE VERIFIED: `grep -n "emoji"` по цих файлах — 0 збігів). NOT
  VERIFIED: як застосунок поводиться з дуже довгими графемними кластерами (комбіновані emoji,
  RTL-текст) у `numberOfLines`-обрізанні тексту — не покрито тестами, у цій сесії не перевірено.

## 9.6 Пошук і фільтрація

Реалізовано в два заходи: Фаза 6 (`JournalRepository.searchFeed`, для «Особистого пошуку» —
глобального пошуку по всьому застосунку) і Фаза 7 (повноцінні фільтри «Мій щоденник»:
текст/тип/обране/повернутися пізніше/книга/реакція/дата, `JournalRepository.listFeedPage`).

Свідоме архітектурне рішення — **без FTS5**, звичайний `LIKE '%…%'`. Обґрунтування прямо в коді,
дослівно (CODE VERIFIED, `src/data/repositories/JournalRepository.ts:345-364`):

> «...продуктивність: повний table scan `LIKE` по TEXT-колонці в SQLite... практично завжди <50мс
> навіть на 10 000+ рядків... Якщо реальний власник продукту повідомить про відчутне гальмування
> пошуку на своєму фактичному обсязі даних — це буде конкретний сигнал переглянути рішення...»

Це чесно й прозоро задокументована HYPOTHESIS самих авторів коду (не перевірена на реальному
пристрої/великому обсязі даних у цій БД-технології), а не заявлене як факт — гідна практика
документування рішення, але сам claim про продуктивність **NOT VERIFIED** незалежно (немає змоги
запустити навантажувальний тест у цій сесії).

## 9.7 Edge cases

- **Порожній щоденник**: `EmptyState` з двома різними текстами — «Тут поки порожньо...» (без
  фільтрів) і «Нічого не знайдено... Спробуй інші фільтри» (з активними фільтрами) —
  `app/journal/index.tsx:691-705`. Коректно розрізняє два різні порожні стани.
- **Реакції без CHECK у БД** (`note.reaction`/`quote.reaction` — вільний `TEXT`,
  `003_journal_entry_extensions.ts:24`): нерозпізнане значення (майбутня версія додала реакцію,
  якої стара версія не знає, або пошкоджені дані) тихо трактується як «без реакції» через
  `isReactionId`-фільтр (`src/design/reactions.ts:73-75`), а не крашить екран — свідомий
  захисний патерн, задокументований прямо в коментарі.
- **Категорія видалена, поки запис лишається**: `SessionJournalEntries` явно використовує
  `useAllNoteCategories` (включно з м'яко видаленими), а не `useActiveNoteCategories`, щоб запис,
  зроблений старою власною категорією, і далі показував її назву, а не порожню мітку — CODE
  VERIFIED: коментар `app/session/[sessionId].tsx:771-773`.

## 9.8 Розбіжності UI vs repository-шар і відсутні тести

- **Розбіжність**: `JournalRepository.countsByReaction` (агрегована статистика «N смішних
  моментів...») мала (за коментарем-визнанням у самому коді) раніше **не** приєднуватись до
  `user_book`, тож рахувала реакції записів книг, уже прибраних із бібліотеки — цифра вгорі
  екрана суперечила списку записів під нею (який коректно фільтрує видалені книги). Коментар
  прямо каже, що це виправлено «незалежним аудитом після Milestone 11»
  (CODE VERIFIED: `src/data/repositories/JournalRepository.ts:596-606`) — тобто цей клас багів
  («суперечливі цифри» між агрегатом і списком) уже траплявся в цій кодовій базі раніше й
  вимагав окремого виправлення; сам факт, що коментар посилається на «той самий клас „суперечливих
  цифр“, що й аудит М11 п.6.2», натякає, що це повторюваний патерн помилки в проєкті, вартий
  уваги при будь-якій новій агрегованій статистиці.
- **Тести**: `JournalRepository.test.ts` існує (9 тестів) і покриває union-читання; окремого
  тесту для `JournalDraftRepository` **НЕ знайдено** (CODE VERIFIED:
  `find . -iname "*JournalDraft*test*"` — порожньо) — чернетка (auto-save) не покрита
  репозиторним тестом взагалі, лише непрямо через будь-які інтеграційні тести композера, яких
  теж немає (у проєкті 0 тестів компонентів/екранів — `find app -iname "*.test.tsx"` /
  `find src/components -iname "*.test.tsx"` обидва дають 0; це системний, а не специфічний для
  Journal, брак — вартий згадки в загальному звіті про тестове покриття, не провина саме цієї
  фічі).

---

# Розділ 10: Deep Reading Memory — усі під-фічі

Усі під-фічі нижче побудовані за єдиним, послідовно повторюваним «house-патерном» V1.6: чиста
доменна логіка без SQL/React у `src/lib/*.ts` (детермінована, `referenceDate`/`now` — явний
параметр), окремий репозиторій у `src/data/repositories/`, тонкий React Query хук у
`src/features/memory/` чи `src/features/on-this-day/`, і UI-компонент/екран. Кожна фіча має свій
`docs/*.md` із розділом «Відомі обмеження» — рідкісна для аудиту зручність: значна частина
продуктового боргу вже задокументована самими авторами коду.

## 10.1 «Цей день у твоєму читанні» (On This Day)

**Що це**: на Home показує книги/події (сесії, старт, фініш, нотатки, цитати), чия
**календарна дата** (місяць+день, БУДЬ-ЯКИЙ минулий рік) збігається із сьогоднішньою.

**Реалізація**:
- `src/data/repositories/OnThisDayRepository.ts` — один `UNION ALL` SQL-запит по 5 джерелах
  (`reading_session`/`user_book.started_at`/`user_book.finished_at`/`note`/`quote`), фільтрований
  через `strftime('%m-%d', ts, localOffsetModifier) = ?`.
- `src/lib/onThisDay.ts` — чиста агрегація: групує події в «спогади» за ключем `(рік, книга)`,
  сортує journal-preview за пріоритетом `favorite → moment → thought → quote → other`
  (`JOURNAL_PREVIEW_LIMIT_PER_MEMORY = 3` — магічне число, CODE VERIFIED
  `src/lib/onThisDay.ts:58`), картки сортує за пріоритетом
  `finished → favorite journal → session → started → rating` (`priority` 1-5,
  `src/lib/onThisDay.ts:158-162`), і застосовує спойлер-евристику.
- `src/features/on-this-day/useOnThisDay.ts` — один `queryFn`, що комбінує SQL + чисті функції.

**Тригер показу**: `selectHomePrimaryMemory` — найближчий минулий рік з хоч одним спогадом →
у ньому найвищий пріоритет → primary card на Home; `null`, коли спогадів немає (Home тоді нічого
не показує). **Локальний час, не UTC** — явний зсув `computeLocalOffsetModifier` перед
`strftime`, щоб сесія о 23:50 за місцевим часом не «переїхала» на сусідній UTC-день (CODE
VERIFIED: докладний коментар `src/data/repositories/OnThisDayRepository.ts:84-95`).

**SPOILER SAFETY** (`applySpoilerRules`, `src/lib/onThisDay.ts:244-270`): якщо книга спогаду
зараз активно читається/перечитується і запис щоденника прив'язаний до сторінки, яка лежить
**далі** за поточний прогрес користувача — текст запису ховається (`text: ''`, `hidden: true`),
решта картки лишається видимою. Запис без прив'язаної сторінки **ніколи** не ховається (немає
надійного способу визначити «попереду» чи ні). Сам код чесно називає це «спрощеною евристикою
Фази 3», не повноцінним spoiler-safe mode (коментар `src/lib/onThisDay.ts:234-236`).

**Магічні числа/пороги**:
- `JOURNAL_PREVIEW_LIMIT_PER_MEMORY = 3` (`src/lib/onThisDay.ts:58`) — хардкод, не налаштовується.
- `yearsAgo < 1` виключено з групи (сьогоднішня активність поточного року — не «спогад»).

**Тести**: AUTOMATED TEST VERIFIED — `src/lib/onThisDay.test.ts` (23 тести, доменна логіка) і
`src/data/repositories/OnThisDayRepository.test.ts` (7 тестів, SQL-шар). React-хук
(`useOnThisDay.ts`) і компонент (`OnThisDayCard.tsx`) власних тестів не мають — NOT VERIFIED
(системний брак UI-тестів у проєкті, див. розділ 9.8).

**Конфлікт/накладання з іншими фічами**: On This Day — один з п'яти кандидатів на єдиний слот
контекстної картки Home (`src/lib/homeContext.ts`, п. 10.7 нижче) — конфлікт вирішено свідомо
явним пріоритетом, а не одночасним показом кількох карток.

## 10.2 Book Capsule («капсула книги»)

**Що це**: «капсула на пам'ять» про щойно прочитану книгу — до чотирьох полів
(`lastingThought`, `oneSentenceMemory`, `favoriteCharacterText`, посилання на улюблений запис
щоденника `journalEntryId`) + вибір «коли нагадати» (`reopenOption`: `none`/`3_months`/
`6_months`/`1_year`).

**Реалізація**: `src/lib/bookCapsule.ts` (домен), `src/data/repositories/BookCapsuleRepository.ts`
(SQL), `src/features/memory/useBookCapsule.ts` (хуки), `src/data/db/migrations/012_book_capsule.ts`.

**Бізнес-логіка/тригери**:
- `canCreateCapsule(status)` → `status === 'finished'` **лише**. НЕ для DNF, НЕ для `rereading`
  (CODE VERIFIED: `src/lib/bookCapsule.ts:76-83`).
- `validateCapsuleContent` — порожня капсула заборонена: потрібне хоч одне з чотирьох
  «змістовних» полів (`reopenAt` сам по собі — не контент).
- `calculateCapsuleReopenAt(option, createdAt)` — дата рахується від дати **створення капсули**,
  не від дати завершення книги, і **не «пливе»** при пізнішому редагуванні (завжди приймає
  оригінальний `createdAt` капсули). Календарно-коректна арифметика (`addMonths`/`addYears`,
  не фіксовані 90/180/365 днів) — природний clamp для 31 серпня / 29 лютого.
- `isCapsuleDue(capsule, referenceDate)` → `reopenAt != null && reopenAt <= referenceDate`.

**Два entry points**: (1) на екрані підсумку читання (`app/completion/[workId].tsx`, одразу
після фінішу), (2) на Book Memory screen (`app/memory/[workId].tsx`) — обидва ведуть до тієї
самої форми `/capsule/[workId]/edit`. Капсула **не має `UNIQUE`** на `user_book_id` — «поточна»
капсула визначається найновішою за `created_at` (свідомий компроміс: перечитування не має
надійного способу прив'язати нову капсулу до конкретного прочитання, задокументовано в
`docs/BOOK_CAPSULES.md:88-108`).

**Тести**: AUTOMATED TEST VERIFIED — `src/lib/bookCapsule.test.ts` (25 тестів) і
`src/data/repositories/BookCapsuleRepository.test.ts` (13 тестів).

**Відомі обмеження, визнані самим проєктом** (`docs/BOOK_CAPSULES.md:213-230`): відсутність
`UNIQUE` при перечитуванні; `favoriteLoreEntityId` зарезервовано, але не використовується;
довільна дата нагадування не підтримується (лише 4 пресети); `capsule_orphan_journal_entry` у
«Перевірці даних» не розрізняє «видалено» від «м'яко видалено».

## 10.3 «Згадати книгу» (Recall flow)

**Що це насправді**: НЕ окрема самостійна фіча, а **режим перевідкриття вже існуючої Book
Capsule**. `app/recall/[workId].tsx` — коли `reopenAt` капсули настав (або користувач відкриває
вручну), показує кроки: «Ти прочитав цю книгу N місяців тому» → спитати, що пам'ятає користувач
ЗАРАЗ (`currentMemoryText`) → показати оригінальний вміст капсули (reveal). Кожна спроба
записується в `capsule_recall` — **append-only, без `update`/`remove`**, «той самий підхід, що й
`reading_session`» (CODE VERIFIED, коментар `src/data/repositories/CapsuleRecallRepository.ts:24-28`).

**Реалізація**: `src/lib/recall.ts` (`formatTimeSinceFinished` — «N місяців/років/днів тому»,
з `differenceInMonths`, не `differenceInCalendarMonths` — навмисний вибір день-чутливої різниці,
щоб «31 серпня → 11 вересня» не рахувалось як «1 місяць», коментар `src/lib/recall.ts:18-27`),
`src/data/repositories/CapsuleRecallRepository.ts`, `src/features/memory/useCapsuleRecall.ts`
(лише `useCreateCapsuleRecall` — **немає хука читання історії спроб**, хоча
`listByBookCapsuleId` уже готовий у репозиторії «для майбутнього UI», CODE VERIFIED коментар
`src/data/repositories/CapsuleRecallRepository.ts:49-51`).

**Тести**: AUTOMATED TEST VERIFIED — `src/lib/recall.test.ts` (14 тестів),
`src/data/repositories/CapsuleRecallRepository.test.ts` (4 тести).

**Конфлікт/накладання з Book Capsule**: НЕ дублювання — це навмисно те саме доменне поняття у
двох станах («капсула» = запис ДО, «recall» = момент ПІСЛЯ, коли її відкривають). Код і докс
прямо описують це саме так (`app/memory/[workId].tsx:127-131`: «коли капсула вже існує, основна
дія тепер «Згадати книгу»... сам recall-флоу вже показує весь вміст капсули на кроці reveal»).
Це радше приклад **добре спроєктованого**, не конфліктного накладання.

**Відоме обмеження, визнане проєктом** (`docs/RECALL.md:107-113`): жодне сповіщення/нагадування
не прив'язане до самого Recall — тап на нотифікацію капсули відкриває застосунок, але НЕ
deep-link'ає на `app/recall/[workId].tsx` (у застосунку взагалі немає інфраструктури
tap-to-navigate для жодного типу нагадування).

## 10.4 Before/After reflections (рефлексії до/після читання)

**Що це**: порівняння очікувань «до» читання з тим, що вийшло «після».

**«До»** — нова сутність `pre_reading_reflection` (Фаза 6): `reasonText` («Чому хочеш прочитати
цю книгу?»), `expectationText` («Чого очікуєш?»), `expectedRating` (0.5-крок, `NULL`-able).
Точка входу — секція на Book Details (`app/work/[workId].tsx`), видима **лише** поки
`user_book.status === 'reading'` (`canEditPreReadingReflection`, CODE VERIFIED
`src/lib/beforeAfter.ts:42-44`) — свідомо: писати «чого чекав» заднім числом, уже знаючи фінал,
підважило б сам сенс порівняння. Один рядок на книгу (`UNIQUE(user_book_id)`), `upsert`, і
`created_at` **не оновлюється** при повторному збереженні (лишається «миттю ДО читання»).

**«Після»** — **НЕМАЄ окремого поля/таблиці**. ТЗ прямо каже «Book Memory МОЖЕ показати
порівняння», не збирати ще один текст — «після» береться з уже наявних `book_memory.reflection`
(«Спогад про книгу», Фаза 7) і `rating.value`. CODE VERIFIED: `docs/BEFORE_AFTER.md:36-48`,
`app/memory/[workId].tsx:225-233` (`BeforeAfterSection`).

**Тести**: AUTOMATED TEST VERIFIED — `src/lib/beforeAfter.test.ts` (16 тестів),
`src/data/repositories/PreReadingReflectionRepository.test.ts` (7 тестів).

### Знахідка — розбіжність між задокументованою і фактичною умовою показу

`docs/BEFORE_AFTER.md:24-25` стверджує: «Порівняння («До / Після») показується на
`app/memory/[workId].tsx`... **лише коли нотатка "До читання" взагалі існує**; без неї
порівнювати нічого» — це описує лише УМОВНИЙ рендер самої секції `BeforeAfterSection`
(`{preReadingReflection ? <BeforeAfterSection .../> : null}`, `app/memory/[workId].tsx:510-516`,
що справді відповідає документації). **Однак** цій умові передує значно суворіший, і ніде в
документації не згаданий gate самого екрана: `app/memory/[workId].tsx:451-455` —

```tsx
: !data.userBook || !memory ? (
  <AppText>Спершу створи спогад про цю книгу на екрані підсумку читання.</AppText>
) : ( /* тут і лише тут рендериться BeforeAfterSection, ReadingExperienceTimeline, JournalTimeline, ... */ )
```

де `memory` — це `useBookMemory(userBookId)`, тобто окрема, необов'язкова сутність
`book_memory` («Спогад про книгу», Фаза 7 — вільнотекстова рефлексія + вибір записів на
екрані підсумку читання, `BookMemorySection`, `app/completion/[workId].tsx:107-343`), яку
користувач **може пропустити** (форма показує лише кнопку «Створити спогад», нічого не вимагає).
Отже, реальна умова показу порівняння «До/Після» — **НЕ** «нотатка "До читання" існує», а
«нотатка "До читання" існує **І** користувач окремо заповнив (чи хоч раз зберіг) "Спогад про
книгу"». Той самий стан справ (а не порожній стан «Немає прогресу») блокує весь інший вміст
цього екрана — див. 10.5 і 10.7. CODE VERIFIED (двома незалежними прочитаннями коду й docs);
розбіжність між тим, що стверджує `docs/BEFORE_AFTER.md`, і фактичною умовою рендеру —
CONFIRMED.

## 10.5 «Як читалася ця книга» — Reading Experience Timeline

**Що це**: горизонтальна шкала на Book Memory screen з маркером на кожну завершену сесію
читання, позначену «Як читалося?» (`reading_session.reading_experience`, поле вже існувало з
Milestone V1.5 — тут лише нова агрегована візуалізація).

**Реалізація**: `src/lib/readingExperienceTimeline.ts` (чиста позиційна логіка),
`src/components/memory/ReadingExperienceTimeline.tsx` (рендер).

**Бізнес-логіка**:
- `MIN_SESSIONS_FOR_READING_EXPERIENCE_TIMELINE = 3` — магічне число (CODE VERIFIED,
  `src/lib/readingExperienceTimeline.ts:11`): менше 3 сесій — компонент рендерить `null`
  («не показуй misleading chart» з ТЗ, тиха деградація без пояснення).
- Позиція маркера — `progressPercent` сесії (за `endPage`, з fallback на `startPage`), коли
  для ВСІХ сесій відомий `pageCount` видання; інакше — рівномірний хронологічний розподіл
  `0..100%` для всіх сесій одразу (рішення приймається однаково для ВСІХ маркерів шкали, не
  по одному — щоб не змішувати два різні базиси позиціювання в одній шкалі).
- Стан «без позначки» (сесія завершена, але без відповіді на «Як читалося?», або значення, якого
  ця версія не розпізнає) — нейтральна крапка `ellipse-outline`, не помилка.

**Тести**: AUTOMATED TEST VERIFIED — `src/lib/readingExperienceTimeline.test.ts` (7 тестів).
Компонент (`.tsx`) — без власного тесту (системний брак, розділ 9.8).

**Відомі обмеження, визнані проєктом** (`docs/READING_EXPERIENCE_TIMELINE.md:64-73`): маркери
не кластеризуються при близькому розташуванні (на відміну від `JournalTimeline`); немає
редагування «Як читалося?» прямо з цього екрана (значення проставляється лише в
`SessionReflectionPanel` одразу після сесії); шкала не враховує перечитування окремо (новий
прохід рахує ті самі сесії, що й перший).

### Знахідка — та сама прихована залежність від Book Memory, що й у 10.4

`ReadingExperienceTimeline` рендериться **виключно** всередині `app/memory/[workId].tsx`
(CODE VERIFIED: `grep -rln "ReadingExperienceTimeline"` по `app/`+`src/components` дає лише сам
компонент і цей один екран). Той самий gate `!memory` (10.4) блокує показ цієї шкали для будь-якої
книги, для якої користувач не створив «Спогад про книгу» на екрані підсумку читання — незалежно
від того, скільки в неї насправді сесій із позначеним «Як читалося?». `docs/READING_EXPERIENCE_TIMELINE.md:17-23`
описує точку входу лише як «Секція... на Book Memory, рендериться лише коли сесій достатньо» —
без згадки про цей додатковий, суворіший gate. Той самий висновок стосується і **Journal
Timeline** (`src/components/memory/JournalTimeline.tsx`, шкала записів щоденника 0-100% книги,
Фаза 10 ТЗ) — вона теж рендериться лише на цьому самому екрані (CODE VERIFIED тим самим `grep`).

**Практичний наслідок**: користувач, який читає книгу, регулярно позначає «Як читалося?» після
кожної сесії, пише нотатки в щоденник — але на екрані підсумку читання просто натискає «Готово»,
не заповнюючи «Спогад про книгу» (це необов'язковий крок, нічого не вимагає) — **ніколи не
побачить** ні шкалу «Як читалася ця книга», ні шкалу записів щоденника, ні порівняння До/Після
для цієї книги, ні секцію «Повернутися до цих думок» (`RevisitLaterSection`, той самий екран) —
попри те, що всі ці дані в нього реально є. Єдиний обхідний шлях — повернутися на екран підсумку
й запізніло заповнити «Спогад про книгу» (натиснувши «Створити спогад»), про що ніщо на самому
екрані Book Memory не підказує (порожній стан — це один рядок тексту без кнопки-переходу до
екрана підсумку). CODE VERIFIED (умова рендеру); HYPOTHESIS щодо того, наскільки часто
реальні користувачі пропускають необов'язковий крок «Спогад про книгу» — не перевірено (немає
телеметрії/аналітики в застосунку, офлайн-first).

## 10.6 Stale Reading Recap («Давно не читав»)

**Що це**: підказка на Book Details і потенційна контекстна картка Home для книги зі статусом
«Читаю»/«Перечитую», яку давно не відкривали.

**Поріг**: `STALE_READING_THRESHOLD_DAYS = 14` — **хардкод**, ніде не налаштовується
користувачем чи через конфіг. CODE VERIFIED, з повним обґрунтуванням прямо в коментарі
(`src/lib/staleReading.ts:1-11`):

> «ТЗ Фази 8 не дає точного порогу — лише ілюстративний приклад ("Останнє читання — 18 днів
> тому"). Обрано 14 днів (два тижні): досить довго, щоб не смикати за кожну пропущену пару днів
> (ТЗ прямо застерігає "Не використовуй guilt language")...»

Логіка (`computeStaleReadingInfo`, `src/lib/staleReading.ts:29-39`): рахує
`differenceInCalendarDays(now, lastSession.endedAt)` від **найновішої завершеної сесії**; якщо
`< 14` — `null` (нічого не показувати); якщо книгу взагалі ще не читали жодною сесією — теж
`null` (немає бази для відліку, це просто щойно почата книга). Текст підказки
(`describeStaleReading`) навмисно нейтральний: «Останнє читання — 18 днів тому. Ти зупинився на
стор. 418.» — без «streak»/«пропустив»/окличних знаків (CODE VERIFIED, коментар
`src/lib/staleReading.ts:41-45`, прямо посилається на вимогу ТЗ уникати guilt language).

**Тригер показу**: (1) секція на Book Details (`StaleReadingSection`,
`app/work/[workId].tsx`, `grep` підтверджує використання); (2) кандидат на єдиний слот
контекстної картки Home — `findStaleReadingCandidate` (`src/lib/homeContext.ts:49-66`): серед
УСІХ книг зі статусом «Читаю»/«Перечитую» обирає ту, що **найдовше** не читалась
(`daysSinceLastSession` максимальний), якщо така взагалі є.

**«Не налаштовується»** — підтверджено: жодного UI-елемента (налаштування, слайдер, пресет) для
зміни порогу 14 днів не знайдено (`grep` по `STALE_READING_THRESHOLD_DAYS` дає лише визначення
константи й тест-файл, ніякого імпорту в екрани налаштувань). NOT VERIFIED як окремий product
call — чи це свідома відмова від конфігурованості, чи просто не дійшли руки: ТЗ явно не вимагав
точного числа, і код коментує лише ВИБІР самого числа, не обговорює конфігурованість.

**Тести**: AUTOMATED TEST VERIFIED — `src/lib/staleReading.test.ts` (11 тестів).

**Конфлікт з іншими фічами**: керовано через `src/lib/homeContext.ts` — див. 10.7.

## 10.7 Взаємодія й пріоритет карток на Home — `homeContext.ts`

Окрема, добре спроєктована точка вирішення конфліктів: ТЗ Фази 18 (HOME REDESIGN) прямо
забороняє показувати кілька контекстних карток одночасно («Не показуй 5 одночасно»).
`selectHomeContextCard` (`src/lib/homeContext.ts:177-186`) — єдина точка вибору, з буквальним
пріоритетом із ТЗ:

```
active stale reading → capsule due → on this day → goal near completion → TBR suggestion
```

Код чесно визнає, що саме ТЗ дає пріоритет у двох місцях по-різному (список і окремий «приклад
пріоритету») і документує, який із двох узятий за єдине джерело істини та чому
(`src/lib/homeContext.ts:12-19`). Кожен кандидат обирається послідовно: серед книг з
однаковим типом кандидатури — «хто найдовше чекає» (найбільше днів без читання / найраніший
`reopenAt`). Це приклад свідомо усунутого потенційного UX-конфлікту (п'ять фіч, що інакше могли
б «змагатись» за увагу користувача на Home), а не помилки.

**Додаткові магічні числа**: `GOAL_NEAR_COMPLETION_RATIO = 0.8` (80% виконання цілі) — той самий
патерн «ТЗ не дає точного числа», хардкод, обґрунтований у коментарі за аналогією з порогом
Stale Reading (`src/lib/homeContext.ts:122-126`).

**Важливе застереження щодо охоплення**: `selectHomeContextCard` вирішує конфлікт лише для
**одного слоту на Home**. Це НЕ усуває gate з 10.4/10.5 (Book Memory screen) — навіть якщо
капсула книги «due» й виграла слот на Home, перехід усередину `app/memory/[workId].tsx` для
перегляду решти пам'яті про ту саму книгу все одно впирається в той самий «Спершу створи
спогад...» бар'єр, якщо `book_memory` для неї не створено.

## 10.8 Загальний підсумок покриття тестами (Розділ 10)

| Під-фіча | Доменна логіка (`src/lib`) | Репозиторій | Компонент/екран |
|---|---|---|---|
| On This Day | AUTOMATED TEST VERIFIED (23) | AUTOMATED TEST VERIFIED (7) | NOT VERIFIED |
| Book Capsule | AUTOMATED TEST VERIFIED (25) | AUTOMATED TEST VERIFIED (13) | NOT VERIFIED |
| Recall | AUTOMATED TEST VERIFIED (14) | AUTOMATED TEST VERIFIED (4) | NOT VERIFIED |
| Before/After | AUTOMATED TEST VERIFIED (16) | AUTOMATED TEST VERIFIED (7, pre-reading) | NOT VERIFIED |
| Reading Experience Timeline | AUTOMATED TEST VERIFIED (7) | н/д (без нової таблиці) | NOT VERIFIED |
| Stale Reading | AUTOMATED TEST VERIFIED (11) | н/д (без нової таблиці) | NOT VERIFIED |
| DNF Reflection (суміжна) | AUTOMATED TEST VERIFIED (7) | AUTOMATED TEST VERIFIED (7) | NOT VERIFIED |
| `homeContext` (пріоритет) | вбудовано в загальний файл, без окремого `.test.ts` — NOT VERIFIED | — | — |

Останній рядок — знахідка сама по собі: `src/lib/homeContext.ts` (логіка вибору ЄДИНОЇ
контекстної картки Home, п. 10.7) не має власного `homeContext.test.ts` серед знайдених тестів
(CODE VERIFIED: `find src -iname "*.test.ts" | grep -i home` — порожньо), попри те, що це
центральна точка вирішення конфлікту між п'ятьма іншими, добре протестованими фічами. Функції в
ньому чисті й легко тестовані (той самий стиль, що й усе інше в `src/lib`), тож відсутність
тесту виглядає радше як прогалина, ніж свідоме рішення.

Системний контекст (не специфічний для Розділу 10): у всьому проєкті **немає жодного тесту
компонента чи екрана** (`find app -iname "*.test.tsx"` → 0, `find src/components -iname
"*.test.tsx"` → 0, при 50 файлах `*.test.ts` для доменної логіки/репозиторіїв). Це означає, що
всі UI-специфічні твердження в цьому звіті (умови рендеру, порядок кнопок, видимість секцій)
перевірені лише прямим читанням коду (CODE VERIFIED там, де so позначено), а не жодним
автоматичним тестом — поведінка реального UI під рукою користувача (анімації, взаємодія жестів,
race conditions рендеру) лишається NOT VERIFIED за визначенням цієї сесії.
# Група 4: Персональний Lore, Spoiler-Safe, DNF, Reading Seasons

Аудит проводився виключно читанням коду, застейдженого в `/mnt/user-data/uploads/polytsya-m11/`.
Жодних правок у код не внесено. Усі шляхи — відносно кореня репозиторію.

---

## Розділ 11: Персональний Lore / Персонажі (Characters)

### Модель даних

Одна таблиця `lore_entity` (міграція `src/data/db/migrations/015_lore_entity.ts`, версія 15):

```sql
CREATE TABLE lore_entity (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  first_seen_page INTEGER,
  first_seen_progress REAL,
  reaction TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_lore_entity_work ON lore_entity(work_id);

CREATE TABLE journal_lore_link (
  id TEXT PRIMARY KEY,
  lore_entity_id TEXT NOT NULL REFERENCES lore_entity(id) ON DELETE CASCADE,
  entry_kind TEXT NOT NULL CHECK (entry_kind IN ('note', 'quote')),
  entry_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (lore_entity_id, entry_kind, entry_id)
);
```

CODE VERIFIED (`src/data/db/migrations/015_lore_entity.ts:48-77`).

Ключове архітектурне рішення (задокументоване в коментарі міграції й у `docs/PERSONAL_LORE.md`):
уся модель одразу зроблена узагальненою — `type` розрізняє `character | place | term |
organization` (`src/types/loreEntity.ts:8`), а не окрема таблиця `character`. `type` — вільний
`TEXT` без `CHECK` на рівні SQL; список типів фіксований лише на рівні TypeScript
(`isLoreEntityType`, `src/types/loreEntity.ts:16-18`). Прив'язка — до `work_id`, не
`user_book_id`: персонажі належать твору, а не конкретному примірнику книжкової полиці, тому
доступні навіть для книг, яких ще нема в бібліотеці користувача.

`reaction` (ставлення до персонажа: подобається/не довіряю/смішний/важливий/не подобається/інше,
`src/design/loreEntityReaction.ts`) стосується лише `type === 'character'`; для інших типів
лишається `NULL` на рівні домену (UI просто не рендерить секцію реакції для не-персонажів —
`app/lore/[workId]/[entityId].tsx:294-299`).

`first_seen_progress` обчислюється доменним шаром (`computeFirstSeenProgress`,
`src/lib/loreEntity.ts:44-49`, обгортка над `computeProgressPercent`) із `first_seen_page` і
`pageCount` видання — не окреме поле форми. CODE VERIFIED.

### UI

Два незалежні набори екранів для однієї й тієї самої функціональності:

- **Актуальні** (Фаза 10, "Світ книги"): `app/lore/[workId].tsx` (список усіх 4 типів +
  форма швидкого додавання з вибором типу) і `app/lore/[workId]/[entityId].tsx` (деталі:
  ім'я/опис/реакція (лише для персонажів)/ручний пікер зв'язку із записами щоденника/обране/
  видалення).
- **Застарілі-але-живі** (Фаза 9, "Персонажі"): `app/characters/[workId].tsx` і
  `app/characters/[workId]/[entityId].tsx` — той самий екран, лише показує тільки
  `type === 'character'` і БЕЗ вибору типу.

За коментарями в самому коді (`app/lore/[workId].tsx:66-71`, `docs/PERSONAL_LORE.md:39-40`)
екрани `/characters/...` мали бути "перенесені" на `/lore/...` у Фазі 10. Однак файли
`app/characters/[workId].tsx` і `app/characters/[workId]/[entityId].tsx` фізично лишились у
дереві `app/` — а Expo Router (file-based routing) реєструє маршрут для кожного файлу під `app/`
автоматично, незалежно від того, чи хтось лінкує на нього з UI. CODE VERIFIED — жодних
внутрішніх переходів (`router.push`) на `/characters/[workId]` в коді немає (перевірено `grep`
по всьому `app/` і `src/`), обидва входи екрана Book Details/Book Memory ведуть саме на
`/lore/[workId]` (`app/work/[workId].tsx:665`, `app/memory/[workId].tsx:219`). Тобто
`/characters/...` — це мертвий, але СПРАВЖНІЙ і досяжний (прямим deep-link'ом, вручну набраним
URL, старим збереженим лінком, майбутнім регресом навігації) маршрут із дубльованою, більш
старою версією логіки. Детальніше про наслідки для spoiler-safe — розділ 12 нижче
(`POTENTIAL LEAK #1`).

### Зв'язок із книгами

`journal_lore_link` — м'яка полiморфна прив'язка персонажа до запису щоденника (note/quote), з
`UNIQUE(lore_entity_id, entry_kind, entry_id)` (ідемпотентне зв'язування, `INSERT OR IGNORE`,
`LoreEntityRepository.linkJournalEntry`, `src/data/repositories/LoreEntityRepository.ts:165-176`).
Зв'язок винятково ручний — ніякого NLP/автовизначення (задокументовано прямо в ТЗ і
підтверджено кодом — жодних "confidence"/"source"-полів у схемі).

### Ліміти та edge cases

- **Дублікати імен: НІЯК не обробляються.** `validateLoreEntityName`
  (`src/lib/loreEntity.ts:23-25`) перевіряє лише непорожність (після `trim`). Немає перевірки на
  унікальність імені в межах твору ні на рівні SQL (немає `UNIQUE`/`CHECK`), ні на рівні
  доменної логіки, ні в UI. Користувач може створити скільки завгодно персонажів з однаковим
  іменем — NOT VERIFIED як UX-намір (документація явно не обговорює цей кейс), але поведінково
  підтверджено кодом: CODE VERIFIED, дублікати не блокуються і навіть не попереджаються.
- **Ліміт кількості персонажів на книгу: відсутній.** `LoreEntityRepository.listByWorkId`
  (`src/data/repositories/LoreEntityRepository.ts:113-119`) — простий `SELECT * ... ORDER BY
  created_at DESC` без `LIMIT`/пагінації. Обидва екрани-списки (`app/lore/[workId].tsx`,
  `app/characters/[workId].tsx`) рендерять весь масив через звичайний `.map()` всередині `View`
  (НЕ `FlatList`/віртуалізований список) — для книги з дуже великою кількістю персонажів (сотні,
  як у деяких епічних фентезі-серіях) це означає повний нефільтрований рендер усіх карток
  одночасно. CODE VERIFIED відсутність LIMIT/пагінації/віртуалізації; практичний вплив на
  продуктивність — HYPOTHESIS (не вимірювалось, оскільки застосунок не запускався).
- Видалення персонажа — м'яке (`deleted_at`), записи щоденника, пов'язані з ним, НЕ видаляються
  і НЕ втрачають зв'язок мовчки — `journal_lore_link` каскадно видаляється через
  `ON DELETE CASCADE` на `lore_entity_id`, але сам запис щоденника залишається незмінним (діалог
  підтвердження прямо це повідомляє: `"Записи щоденника залишаться без змін"`,
  `app/lore/[workId]/[entityId].tsx:206`). CODE VERIFIED.
- Персонажа можна додавати незалежно від статусу книги (навіть для `want_to_read`) —
  `src/lib/loreEntity.ts:8-11` прямо документує відсутність гейту за статусом, на відміну від
  `BookCapsule`/`PreReadingReflection`. CODE VERIFIED.

### Тести

- `src/data/repositories/LoreEntityRepository.test.ts` — CRUD, `listByWorkId` (ізоляція між
  творами), `update` (не чіпає `workId`/`type`), `remove` (м'яке видалення), `setFavorite`,
  `linkJournalEntry`/`unlinkJournalEntry` (ідемпотентність), каскадне видалення при видаленні
  твору. AUTOMATED TEST VERIFIED — рівень репозиторію покритий добре.
- `src/lib/loreEntity.test.ts` — чисті функції валідації/нормалізації/обчислення прогресу.
  AUTOMATED TEST VERIFIED.
- **Немає жодного тесту** на: дублікати імені, велику кількість персонажів (перф/пагінація),
  UI-рівень (`useLoreEntities.ts`), маршрут `/characters/...`. NOT VERIFIED для цих кейсів.

---

## Розділ 12: Spoiler-Safe режим — leak-аудит

### Сама логіка (де й як вмикається)

Прапорець `user_book.spoiler_safe_enabled` — `INTEGER NOT NULL DEFAULT 1`
(`src/data/db/migrations/016_spoiler_safe.ts:24`), book-level (не work-level, не глобальний
налаштуванням застосунку). CODE VERIFIED.

Активність режиму — чиста функція:

```ts
// src/lib/spoilerSafe.ts:20-22
export function isSpoilerSafeActive(status: UserBookStatus, spoilerSafeEnabled: boolean): boolean {
  return spoilerSafeEnabled && (status === 'reading' || status === 'rereading');
}
```

Тобто прапорець сам по собі нічого не приховує — приховування активне лише для статусів
`reading`/`rereading`. Для `finished`/`did_not_finish`/`paused`/`want_to_read` — виключення
навмисне (`paused` теж НЕ вважається активним читанням, задокументовано явно в
`docs/SPOILER_SAFE.md:44-47`). CODE VERIFIED, покрито тестами
(`src/lib/spoilerSafe.test.ts:45-58`, усі 6 статусів перевірені).

Порівняння позиції (`isAheadOfCurrentProgress`, `src/lib/spoilerSafe.ts:42-51`): пріоритет —
сторінка, фолбек — відсоток прогресу; якщо жодної зі сторін порівняти неможливо — запис
**лишається видимим** (консервативний дефолт "хибний показ краще за хибне приховування").
CODE VERIFIED, AUTOMATED TEST VERIFIED (`src/lib/spoilerSafe.test.ts:76-96` — сторінка,
відсоток-фолбек, відсутність позиції з обох боків).

Винятків "на рівні книги" два офіційно задокументовані (`docs/SPOILER_SAFE.md:74-95`) і
перевірені в коді:

1. `JournalTimeline` (`app/memory/[workId].tsx`) — заявлено як "не показує текст, лише позицію".
2. Пікери на екранах, доступних лише для вже завершених книг (капсула/спогад-картка/recall) —
   `canCreateCapsule` (`src/lib/bookCapsule.ts:81-83`) справді жорстко гейтує `status ===
   'finished'`. SAFE — CODE VERIFIED.
3. Глобальна стрічка "Мій щоденник" (`app/journal/index.tsx`) — задокументовано як свідомо поза
   межами book-level налаштування.

### Де фільтр РЕАЛЬНО застосовано (SAFE)

Функції `filterSpoilerSafeJournalEntries`/`filterSpoilerSafeLoreEntities`
(`src/lib/spoilerSafe.ts:58-74`) використовуються рівно в чотирьох місцях:

| Місце | Тег | Коментар |
|---|---|---|
| `app/work/[workId].tsx:1112-1113` (`JournalSection`, Book Details) | **SAFE** | CODE VERIFIED — `isSpoilerSafeActive`+`filterSpoilerSafeJournalEntries` застосовано перед рендером нотаток/цитат. |
| `app/work/[workId].tsx:647-648` (`LoreSection`, Book Details) | **SAFE** | CODE VERIFIED — той самий фільтр для персонажів/лору, лічильник рахується ПІСЛЯ фільтрації. |
| `app/memory/[workId].tsx:201-205` (`LoreSection`, Book Memory) | **SAFE** | CODE VERIFIED — актуально й тут, бо екран доступний і під час `rereading`. |
| `app/lore/[workId].tsx:101-108` ("Світ книги", повний список) | **SAFE** | CODE VERIFIED — окремо показує "Ще N приховано режимом «без спойлерів»" замість тихого порожнього стану. |
| `app/recap/[workId].tsx:87-89` | **SAFE** | CODE VERIFIED — recap явно названий у ТЗ як такий, що "гарантує spoiler-safe experience". |

### POTENTIAL LEAK #1 — `app/characters/[workId].tsx` і `[entityId].tsx` (дубльований мертвий маршрут)

**POTENTIAL LEAK.** Обидва файли (`app/characters/[workId].tsx`,
`app/characters/[workId]/[entityId].tsx`) — старіша копія екрана "Персонажі" з Фази 9, яка
НІКОЛИ не імпортує `isSpoilerSafeActive`/`filterSpoilerSafeLoreEntities` (перевірено `grep` по
обох файлах — нуль збігів). `characters.map((entity) => <CharacterListRow .../>)`
(`app/characters/[workId].tsx:155`) рендерить **весь** список персонажів твору без жодної
фільтрації.

Чому це "потенційний", а не підтверджений на 100% leak: жоден активний елемент навігації не
веде на цей маршрут (перевірено — усі внутрішні `router.push`/лінки йдуть на `/lore/[workId]`),
тому в звичайному використанні застосунку користувач на цей екран не потрапить. Але:

- Expo Router реєструє цей маршрут автоматично як реальний, робочий URL
  (`/characters/[workId]`) — його можна відкрити прямим deep-link'ом (наприклад, зі старого
  збереженого посилання, зовнішнього виклику, майбутнього регресу коду, чи навіть простого
  експерименту користувача з URL-схемою застосунку).
- Якщо він відкриється — spoiler-safe режим для персонажів на ньому просто НЕ ДІЄ: усі
  персонажі книги, включно з тими, що "попереду" поточного прогресу, показуються без жодного
  приховування чи попередження.

Це — CODE VERIFIED факт відсутності фільтрації + NOT VERIFIED (без запущеного застосунку не
можу підтвердити, чи глибокий лінк на цей маршрут дійсно спрацює на реальному пристрої, хоча
файлова структура Expo Router робить це вкрай ймовірним). Рекомендація для аудиту: видалити
файли `app/characters/[workId].tsx`/`app/characters/[workId]/[entityId].tsx` як мертвий код,
або, якщо лишати з якоїсь причини — додати той самий фільтр, що й на `/lore/[workId].tsx`.

### POTENTIAL LEAK #2 — `JournalTimeline` показує повний текст запису при тапі на маркер

**POTENTIAL LEAK — найсерйозніша знахідка розділу.** Документація (`docs/SPOILER_SAFE.md:87-90`)
прямо стверджує, що `JournalTimeline` навмисно поза межами spoiler-safe фільтрації, бо "сам сенс
шкали — показати розподіл записів по всій книзі, а не окремі їхні тексти". Це твердження НЕ
відповідає коду:

- `app/memory/[workId].tsx:504-508` передає в `<JournalTimeline entries={allEntries ?? []} .../>`
  ПОВНИЙ, нефільтрований список усіх записів щоденника книги (`allEntries` = `useJournalEntries
  (userBookId)`, без жодного проходу через `filterSpoilerSafeJournalEntries`).
- Усередині `src/components/memory/JournalTimeline.tsx:39-117`: кожен маркер на шкалі — це
  `Pressable`, тап на який відкриває `Modal` (`openMarker`), і всередині цього модального вікна:

  ```tsx
  // src/components/memory/JournalTimeline.tsx:106-108
  <AppText variant="body" numberOfLines={4}>
    {entry.text}
  </AppText>
  ```

  тобто **повний текст** нотатки/цитати (обрізаний лише до 4 рядків `numberOfLines`, не
  видалений) рендериться в модалці, БЕЗ будь-якої перевірки, чи ця позиція "попереду" поточного
  прогресу читання.

Практичний сценарій leak: користувач перечитує книгу (`status: 'rereading'`), вмикає
spoiler-safe (типова поведінка — `DEFAULT 1`), відкриває Book Memory на `app/memory/[workId]
.tsx` — той самий екран, де в докstring явно сказано "SPOILER-SAFE MODE (Фаза 11) — той самий
фільтр, що й на Book Details... актуально й тут" (рядки 183-186) — і одразу нижче на тому ж
екрані бачить `JournalTimeline` із маркером ПОПЕРЕДУ поточної сторінки. Тап на маркер відкриває
повний текст запису про сюжет, якого користувач (у цьому конкретному перечитуванні) ще не
дістався. CODE VERIFIED — увесь ланцюжок (пропс → компонент → модалка → `entry.text`)
простежений напряму в коді, без жодного проміжного фільтра.

### POTENTIAL LEAK #3 — Глобальний пошук (`app/(tabs)/search.tsx`) показує текст нотаток/цитат без жодного spoiler-фільтра

**POTENTIAL LEAK.** `docs/SPOILER_SAFE.md` не згадує глобальний пошук серед задокументованих
винятків взагалі (лише `JournalTimeline`, фінішовані-only пікери, і `app/journal/index.tsx`) —
це виглядає як недогляд, а не свідоме рішення.

`usePersonalSearch` (`src/features/search/usePersonalSearch.ts:33-50`, фіча ще з V1.5 Фази 6,
ДО появи spoiler-safe у V1.6 Фазі 11) викликає `JournalRepository.searchFeed(db, query)` —
прямий SQL-пошук по ВСІХ нотатках/цитатах користувача (`notes`/`quotes` у результаті), без
жодного урахування `spoiler_safe_enabled`, статусу книги чи позиції запису відносно поточного
прогресу. Результат рендериться в `JournalResultRow`
(`app/(tabs)/search.tsx:124-150`) з повним `{entry.text}` (рядок 149).

Сценарій: користувач активно читає книгу зі spoiler-safe увімкненим, вводить у глобальний пошук
слово, яке фігурує в його ж власній нотатці про пізніший розділ (наприклад, ім'я персонажа, що
з'являється пізніше) — і бачить повний текст цієї нотатки в результатах пошуку, попри те, що на
Book Details той самий запис коректно прихований. CODE VERIFIED (відсутність фільтрації
простежена від SQL-запиту до рендеру рядка результату); власне відтворення сценарію на пристрої
— NOT VERIFIED (немає запущеного застосунку).

### Дрібніші спостереження (не критичні leak, але варті уваги)

- **`app/on-this-day.tsx` / `useOnThisDay` — окрема, СТАРІША евристика, що дублює (і частково
  розходиться з) Spoiler-Safe.** `applySpoilerRules` (`src/lib/onThisDay.ts:244-270`) — власний,
  спрощений механізм ще з Фази 3 (ДО Фази 11). Коментар у самому коді (рядки 234-236) досі каже:
  `"повноцінний 'spoiler-safe mode' — окрема майбутня Фаза 12 ТЗ, якої ще немає"` — це вже
  **застаріла заувага**, бо spoiler-safe (Фаза 11) на момент цього коду вже реалізований.
  `applySpoilerRules` **не перевіряє `user_book.spoiler_safe_enabled` взагалі** — застосовується
  до будь-якої книги зі статусом `reading`/`rereading` незалежно від того, чи користувач сам
  вимкнув перемикач "без спойлерів" саме для цієї книги (`useOnThisDay.ts:40-48`). Тобто: якщо
  користувач свідомо вимкнув spoiler-safe для конкретної книги (бо, наприклад, хоче бачити свої
  ж нотатки наперед), "Цей день" все одно ховатиме її записи-попереду — це не leak (протилежний
  напрямок — зайве приховування), але це **непослідовна поведінка** відносно решти застосунку і
  застарілий коментар, що вводить в оману. CODE VERIFIED.
- **`SeasonCardPreview`/Reading Seasons `journalHighlight`** — не проходить через жоден
  spoiler-фільтр (`useReadingSeason.ts:104-115`, бере "останній обраний за датою" запис
  `favoriteOnly: true` з `JournalRepository.listFeedPage`, без гейту на статус книги). Практичний
  ризик низький, бо запис уже написаний самим користувачем (тобто не є для нього новим
  спойлером), АЛЕ ця картка — саме SHARE-фіча (`app/seasons/[seasonKey].tsx`, захоплення в PNG і
  "Поділитися"/"Зберегти в галерею"), і доступна для ПОТОЧНОГО (ще не завершеного) сезону
  (`currentSeasonKey(new Date())` як дефолт, `app/seasons/[seasonKey].tsx:47-48`). Теоретично
  цитата з книги, яку користувач ще не дочитав у цьому сезоні, може потрапити на картку, яку він
  експортує й ділиться нею публічно. HYPOTHESIS — не знайдено конкретного експлойту (сам запис
  завжди "позаду" точки зору автора нотатки), але варто зафіксувати як архітектурну прогалину:
  жодна з Seasons-агрегацій не імпортує `spoilerSafe.ts`.
- **`app/session/[sessionId].tsx` (`SessionJournalEntries`)** — показує всі записи, зроблені під
  час конкретної (можливо, минулої) сесії читання, без spoiler-фільтра
  (`useJournalBySession`, `src/features/journal/useJournal.ts:73`). Під час `rereading`
  користувач може через "Мою історію" відкрити сесію з ПЕРШОГО (уже завершеного) прочитання й
  побачити нотатки, зроблені тоді на сторінках, яких ще не досяг у поточному перечитуванні.
  POTENTIAL LEAK, нижчого пріоритету за #1-#3 (потребує кількох навмисних кроків навігації через
  History), CODE VERIFIED відсутність фільтра, сценарій — HYPOTHESIS.
- **Home-картка "Остання думка"** (`app/(tabs)/index.tsx:129-133`, `CurrentReadingRow`) показує
  `lastEntry.text` — НАЙОСТАННІШИЙ ЗА ЧАСОМ СТВОРЕННЯ запис, а не найостанніший за позицією в
  книзі. Оскільки такий запис у звичайному use case пишеться в момент читання (тобто відповідає
  поточному прогресу чи раніше), практичний ризик низький — але сам відбір НЕ звіряється явно з
  поточною сторінкою і не проходить через `spoilerSafe.ts`. NOT VERIFIED як реальна загроза
  (потребує штучного сценарію на кшталт імпорту нотатки "заднім числом" з пізнішою сторінкою),
  але відсутність явної перевірки підтверджена кодом.

### Приховане Ok — де фільтр свідомо НЕ застосований і це виправдано

- Пікери на екранах, доступних лише для `status === 'finished'` (капсула/recall/спогад-картка) —
  **SAFE**, `canCreateCapsule` жорстко гейтує вхід.
- `app/completion/[workId].tsx` — MemoryEntryLine рендерить `entry.text`, але цей екран
  відкривається САМЕ в момент завершення книги (перехід у `finished`), тому spoiler-safe до
  цього моменту вже неактуальний за визначенням (`isSpoilerSafeActive` повертає `false` для
  `finished`). **NOT APPLICABLE**.
- `app/journal/index.tsx` (глобальна стрічка щоденника) — задокументовано як свідомо поза
  межами book-level фічі. **NOT APPLICABLE** (задокументоване рішення, хоча по суті це той самий
  клас проблеми, що й Пошук #3 — просто тут хоч є explicit документ, який це визнає).
- `app/day/[date].tsx` (деталі дня в календарі) — показує лише сесії читання (тривалість,
  діапазон сторінок), без тексту нотаток/цитат. **NOT APPLICABLE**.

### Підсумок розділу 12

Ядро самого механізму (`src/lib/spoilerSafe.ts`) — акуратне, чисто написане, добре покрите
тестами (`src/lib/spoilerSafe.test.ts`, 5 describe-блоків, межові випадки сторінка/відсоток/
відсутність позиції всі перевірені) і коректно застосоване в 5 задокументованих місцях. Але
"periметр" фічі — усі місця, де щоденник/лор МОЖЕ показуватись, а не лише 5 явно
задокументованих, — має щонайменше **3 підтверджені кодом прогалини** (мертвий дубльований
маршрут `/characters/...`, `JournalTimeline`-модалка з повним текстом всупереч власній
документації, і повністю нефільтрований глобальний пошук) і ще 2-3 менш критичні непослідовності
(On This Day зі своєю застарілою окремою евристикою, Session Detail, Reading Seasons
journalHighlight). Жодна з цих прогалин не покрита тестами — увесь наявний тест-набір
(`spoilerSafe.test.ts`) перевіряє лише самі чисті функції, а не те, де вони ЗАСТОСОВАНІ (чи, як
у випадку #1-#3, НЕ застосовані).

---

## Розділ 13: DNF (Did Not Finish)

### Модель даних

`dnf_reflection` (`src/data/db/migrations/017_dnf_reflection.ts:37-46`):

```sql
CREATE TABLE dnf_reflection (
  id TEXT PRIMARY KEY,
  user_book_id TEXT NOT NULL UNIQUE REFERENCES user_book(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  reason TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`UNIQUE(user_book_id)` — щонайбільше один запис на книгу. `page` — `NOT NULL` (на відміну від
`lore_entity.first_seen_page`): це знімок `user_book.current_page` У МИТЬ переходу статусу,
береться програмно, ніколи не вводиться вручну. `reason` — вільний `TEXT` без `CHECK`, реальний
список — `DnfReasonId` (7 значень, `src/design/dnfReason.ts:7-14`): `not_mood` ("Не мій
настрій"), `boring` ("Нудно"), `style` ("Не сподобався стиль"), `too_complex` ("Занадто
складно"), `wrong_genre` ("Не мій жанр"), `later` ("Повернуся пізніше"), `other` ("Інше"). CODE
VERIFIED.

### UI-flow позначення DNF

Статус змінюється тим самим `ChipSelect`, що й будь-який інший статус
(`STATUS_OPTIONS = Object.keys(userBookStatusLabels)`, `app/work/[workId].tsx:73-77`) — DNF
нічим не виділений на рівні самого перемикача (навмисно, за задокументованим UX-принципом "DNF
не є failure", `docs/DNF_IMPROVEMENT.md:13-21`). Одразу під час мутації статусу
(`useUpdateUserBookStatus`, `src/features/library/useUpdateUserBook.ts:29-48`), якщо новий
статус — `did_not_finish`, викликається `DnfReflectionRepository.captureIfMissing(db, id,
userBook.currentPage)` (рядки 42-47) — рядок `dnf_reflection` створюється АВТОМАТИЧНО, без
окремої форми. Причина/нотатка не збираються негайно — користувач може заповнити їх пізніше
на Book Details (секція "Не дочитав", видима лише коли `dnf_reflection` уже існує).

### Чи зберігається причина

Так, причина (`reason`, опційна, один з 7 фіксованих варіантів) і вільна нотатка (`note`,
незалежна від `reason`) — обидва nullable, редагуються окремо через
`DnfReflectionRepository.updateDetails` (`src/data/repositories/DnfReflectionRepository.ts
:71-87`), яке міняє ЛИШЕ `reason`/`note` (+`updated_at`) — `page`/`created_at` після першого
запису незмінні назавжди (перевірено тестом
`DnfReflectionRepository.test.ts:62-79`, "повторний виклик НЕ перезаписує вже зафіксовану
сторінку/дату"). Форма редагування доступна лише поки статус РЕАЛЬНО `did_not_finish`
(`canEditDnfReflection`, покрито тестом `src/lib/dnfReflection.test.ts:32-35`). CODE VERIFIED,
AUTOMATED TEST VERIFIED.

### Вплив на статистику/streak/seasons/profile

**Виключення DNF з "прочитаних книг" — коректне.** `UserBookRepository.updateStatus`
(`src/data/repositories/UserBookRepository.ts:185-198`) виставляє `finished_at` ТІЛЬКИ коли
`status === 'finished'`:

```ts
// src/data/repositories/UserBookRepository.ts:190-192
const startedAt = current.startedAt ?? ((status === 'reading' || status === 'rereading') ? now : null);
const finishedAt = current.finishedAt ?? (status === 'finished' ? now : null);
```

Тому перехід у `did_not_finish` НІКОЛИ не проставляє `finished_at`. Усі місця, що рахують
"прочитані книги" за `status = 'finished'` (не за самим лише `finishedAt`) — коректно
виключають DNF:

- `useOverallStatistics` (`src/features/statistics/useStatistics.ts:47`) —
  `UserBookRepository.listStatusOnly(db, 'finished')` для `booksFinishedAllTime`/
  `booksFinishedThisYear`. **SAFE/коректно.** CODE VERIFIED.
- `useReadingSeason` (`src/features/seasons/useReadingSeason.ts:50-56`) —
  `UserBookRepository.listByStatus(db, 'finished')`, потім фільтр за `finishedAt` у межах
  діапазону сезону. **SAFE/коректно.** CODE VERIFIED.
- Reading Streak (`computeStreaks`, `src/lib/streaks.ts`) навмисно рахується НЕ за статусом
  книги, а за днями, коли БУЛА ХОЧ ОДНА завершена сесія читання (`ReadingSessionRepository.
  listAllCompleted`, `useStatistics.ts:45-46`) — незалежно від того, чи книга пізніше стала DNF.
  Це — **навмисна і правильна** відповідність задокументованому UX-принципу "Не використовуй
  broken streak/negative achievement" (`docs/DNF_IMPROVEMENT.md:16`): дні, витрачені на книгу,
  яку зрештою покинули, залишаються "активними днями читання" й НЕ ламають streak заднім числом.
  **SAFE, і це добре продумана деталь**, не помилка. CODE VERIFIED.
- Той самий "усі сесії в діапазоні, незалежно від статусу книги" підхід — і в
  `totalMinutes`/`totalPages`/`sessionsCount` для Reading Seasons
  (`ReadingSessionRepository.listStartedBetween`, `useReadingSeason.ts:51,58-62`) — консистентно
  з тим самим принципом. **SAFE, узгоджено.**
- One Book Picker (`TBR_SCOPE_STATUSES.any_unread`, `src/lib/onePicker.ts:37-40`) свідомо
  ВКЛЮЧАЄ `did_not_finish` у пул "усе, що логічно можна почати (чи повернутись) читати" —
  задокументована, обґрунтована поведінка. **SAFE.**

**Знайдена НЕ задокументована й НЕ покрита тестом прогалина: `finished_at` не скидається при
переході з `finished` У `did_not_finish`.** Той самий рядок коду вище
(`current.finishedAt ?? (...)`) означає: якщо `finished_at` вже НЕ `null` (книга вже була
завершена раніше), він НІКОЛИ не змінюється жодним подальшим `updateStatus`, включно з переходом
у `did_not_finish`. Це поведінка задокументована й покрита тестом лише для сценарію
"finished → reading" (перечитування): `UserBookRepository.test.ts:174-188`, коментар "стара дата
завершення НЕ зникає" — там це навмисно й правильно (книга дійсно була прочитана раніше,
перечитування цього факту не скасовує).

Але той самий код-шлях спрацьовує і для сценарію **"finished → did_not_finish"** (користувач,
наприклад, виправляє свій запис: "насправді я тоді не дочитав", чи покинув книгу під час
повторного читання й змінює статус напряму на DNF) — а цей сценарій **не покритий жодним
тестом** і, судячи з коду, залишає застарілий `finished_at` НАЗАВЖДИ, попри те що `status` уже
`did_not_finish`. Це реально впливає на дві фічі, які запитують `finished_at IS NOT NULL`
НАПРЯМУ, без повторної перевірки поточного `status`:

- `ActivityHistoryRepository.ts:81-85` — `WHERE ub.finished_at IS NOT NULL` (подія
  `book_finished` у стрічці "Моя історія").
- `OnThisDayRepository.ts:123-129` — `WHERE ub.finished_at IS NOT NULL AND strftime('%m-%d', ub
  .finished_at, ?) = ?` (подія `finished` для "Цей день").

Наслідок: книга, яку користувач пізніше переніс зі статусу "Прочитано" в "Не дочитав", **назавжди
продовжує показуватись** як "Ти завершив цю книгу" у стрічці "Моя історія" й щороку на "Цей
день" — попри те, що бібліотека/статистика вже коректно кажуть "Не дочитано" (`status`-based
підрахунки). `DataIntegrityRepository.ts` (Data Doctor) містить перевірку на протилежний
дисбаланс (`finished_without_finished_at` — статус `finished`, але `finished_at IS NULL`), але
**НЕ має перевірки на цей** дисбаланс (`finished_at IS NOT NULL`, але `status != 'finished'`) —
перевірено `grep` по всьому файлу, збігів немає. CODE VERIFIED (весь ланцюжок: `updateStatus` →
`ActivityHistoryRepository`/`OnThisDayRepository` SQL → відсутність перевірки в Data Doctor);
чи це реально трапляється в даних користувачів — HYPOTHESIS (залежить від того, чи хтось
насправді змінює статус саме так, `finished → did_not_finish`; UI цьому не заважає, бо чіп
статусу дозволяє будь-який перехід).

### Edge cases

- **Повторний перехід у DNF не перезаписує `page`/`created_at`.** `captureIfMissing`
  (`DnfReflectionRepository.ts:54-65`) перевіряє існування рядка перед вставкою — задокументовано
  й протестовано (`DnfReflectionRepository.test.ts:62-79`). Якщо користувач вийшов з DNF (напр.
  повернувся читати) і знову позначив DNF пізніше на ІНШІЙ сторінці — старий знімок сторінки й
  дати лишається, новий НЕ записується. Це задокументована навмисна поведінка ("не перезаписуємо
  заднім числом"), але означає, що повторний DNF-цикл втрачає інформацію про ДРУГУ спробу.
  NOT VERIFIED як UX-проблема (не факт, що це небажано — залежить від продуктового наміру), але
  варто зазначити явно.
- **Немає повного видалення `dnf_reflection` з UI** (навмисно, `docs/DNF_IMPROVEMENT.md:69-74`)
  — можна очистити `reason`/`note`, але сам факт "покинуто на сторінці N такого числа"
  лишається назавжди, поки існує `user_book`. Метод `remove` існує в репозиторії лише для
  каскадного видалення й тестів, UI його не викликає (перевірено — жодного виклику
  `DnfReflectionRepository.remove` поза тестами).
- Бекап: `dnf_reflection` входить у `BACKUP_TABLE_ORDER` (задокументовано,
  `docs/DNF_IMPROVEMENT.md:103-107`) — NOT VERIFIED прямим читанням `BackupRepository.ts` у цій
  сесії (не було потреби для основного завдання), покладаюсь на документ + консистентність з
  іншими memory-таблицями.

### Тести

- `src/data/repositories/DnfReflectionRepository.test.ts` — `getByUserBookId`,
  `captureIfMissing` (перший виклик і ідемпотентність), `updateDetails`, `remove`, каскадне
  видалення разом з `user_book`. AUTOMATED TEST VERIFIED, хороше покриття репозиторію.
- `src/lib/dnfReflection.test.ts` — `normalizeDnfNote`, `computeDnfProgressPercent` (включно з
  edge case "сторінка 0"), `canEditDnfReflection`. AUTOMATED TEST VERIFIED.
- `src/design/dnfReason.test.ts` — guard-функція `isDnfReasonId`. AUTOMATED TEST VERIFIED.
- **Немає тесту** на сценарій "finished → did_not_finish" і його вплив на
  `ActivityHistoryRepository`/`OnThisDayRepository` (знахідка вище) — NOT VERIFIED тестами,
  підтверджено лише прямим читанням коду.

---

## Розділ 14: Reading Seasons

### Модель "сезону читання"

Сезон — ЦІЛКОМ derived-концепт, ніде не зберігається в БД (той самий принцип, що й Wrapped) —
лише параметр запиту/роута. Чотири метеорологічні (не астрономічні) сезони
(`src/design/season.ts:15,22-27`): `winter` (Зима, ❄), `spring` (Весна), `summer` (Літо),
`autumn` (Осінь).

### Межі дат і правило "власності року" для зими

Точна логіка — `src/lib/season.ts:17-43`:

```ts
const SEASON_MONTH_RANGE: Record<SeasonId, { startMonth: number; startYearOffset: number; endMonth: number }> = {
  winter: { startMonth: 12, startYearOffset: -1, endMonth: 3 },
  spring: { startMonth: 3, startYearOffset: 0, endMonth: 6 },
  summer: { startMonth: 6, startYearOffset: 0, endMonth: 9 },
  autumn: { startMonth: 9, startYearOffset: 0, endMonth: 12 },
};

export function seasonDateRange(seasonId: SeasonId, year: number): SeasonRange {
  const range = SEASON_MONTH_RANGE[seasonId];
  return {
    start: isoMonthStart(year + range.startYearOffset, range.startMonth),
    end: isoMonthStart(year, range.endMonth),
  };
}
```

Це дає точно задокументоване й протестоване правило: **"Зима 2026" = 1 грудня 2025 00:00:00.000Z
(включно) — 1 березня 2026 00:00:00.000Z (виключно)**, тобто грудень попереднього календарного
року + січень/лютий поточного. Коментар у коді прямо пояснює обраний побутовий сенс (рядки
28-36): "'Зима 2026' у розмові — здебільшого зима, про яку йдеться, це та, що ЗАКІНЧУЄТЬСЯ на
початку названого року" — зима "прив'язана до пізнішого року". Весна/літо/осінь лишаються в
межах одного календарного року (жодного зсуву). CODE VERIFIED, AUTOMATED TEST VERIFIED
(`src/lib/season.test.ts:10-31`, точні очікувані ISO-мітки для всіх 4 сезонів 2026 року).

`currentSeasonKey(now)` (`src/lib/season.ts:72-80`) визначає "поточний" сезон для дефолтного
відкриття екрана: грудень (`month === 12`) належить зимі НАСТУПНОГО року
(`{seasonId: 'winter', year: year + 1}`), а січень/лютий — зимі ПОТОЧНОГО. Обидва випадки прямо
протестовані:

```ts
// src/lib/season.test.ts:55-62
it('грудень належить зимі НАСТУПНОГО року', () => {
  expect(currentSeasonKey(new Date('2026-12-15T00:00:00.000Z'))).toEqual({ seasonId: 'winter', year: 2027 });
});
it('січень/лютий належать зимі того самого року', () => {
  expect(currentSeasonKey(new Date('2026-01-01T00:00:00.000Z'))).toEqual({ seasonId: 'winter', year: 2026 });
  expect(currentSeasonKey(new Date('2026-02-28T23:59:59.000Z'))).toEqual({ seasonId: 'winter', year: 2026 });
});
```

`adjacentSeasonKey` (навігація стрілками "попередній/наступний сезон",
`src/lib/season.ts:89-100`) коректно міняє рік лише на межах зими: "з осені вперед → зима вже
наступного року", "із зими назад → осінь попереднього року" — обидва протестовані
(`season.test.ts:91-97`), включно з "повний цикл 4 кроки вперед = +1 рік" і "4 вперед + 4 назад =
вихідна точка" (round-trip, `season.test.ts:105-123`). **AUTOMATED TEST VERIFIED, покриття
межових дат хороше** — усі чотири сезонні межі (1 березня/1 червня/1 вересня/1 грудня)
перевірені окремими `it`-блоками з таймстемпами буквально по обидва боки межі
(`23:59:59`/`00:00:00`).

### Пороги/межі: часовий пояс — НЕ враховується

`currentSeasonKey` рахує місяць через `getUTCMonth()` (не локальний час пристрою), і
`seasonDateRange` генерує чисто UTC-межі (`isoMonthStart`). Коментар у коді
(`src/lib/season.ts:4-6`) прямо визнає це навмисним спрощенням: "той самий контракт, що й
`ReadingSessionRepository.listStartedBetween`/`yearRange` у `useWrappedYear.ts` — без окремої
обробки часових зон". Це відрізняється від підходу "Цей день"
(`src/lib/onThisDay.ts:27-38`, `computeLocalOffsetModifier`), де для межі КАЛЕНДАРНОГО ДНЯ
свідомо зроблено зсув на локальний часовий пояс пристрою, щоб уникнути "переїзду" сесії на
сусідній день. Для Seasons такого зсуву немає — тобто для користувача в часовому поясі, дуже
далекому від UTC (наприклад UTC+12 чи UTC-11), книга, дочитана під самий кінець місяця-межі за
ЙОГО локальним часом, теоретично може бути віднесена SQL-порівнянням `finishedAt >= range.start
&& finishedAt < range.end` до сусіднього сезону, якщо різниця в часових поясах "перетягує" мить
через опівнічну межу UTC. Це — **той самий клас спрощення, що й Wrapped** (не унікальна для
Seasons вада, а узгоджений з рештою застосунку компроміс), тому не позначаю як окремий "баг", а
як задокументований edge case: HYPOTHESIS щодо практичного впливу (наскільки часто користувачі в
екстремальних часових поясах дочитують рівно на межі місяця), CODE VERIFIED щодо самого факту
відсутності обробки часових поясів. Тестів на цей конкретний edge case (розбіжність
локальний/UTC час на межі сезону) немає.

### Edge case: книга розпочата в одному сезоні, закінчена в іншому

Оброблено коректно на рівні дизайну: `booksFinished` для сезону визначається виключно за
`finishedAt` у межах `[range.start, range.end)` (`useReadingSeason.ts:54-56`) — сезон, у якому
книгу РОЗПОЧАТО, ролі не відіграє. Натомість статистика "сторінок/хвилин/кількості сесій"
рахується НЕ по книзі, а по ОКРЕМИХ сесіях читання (`ReadingSessionRepository.
listStartedBetween`, рядок 51) — тобто якщо книга почалась восени, а закінчилась узимку, осінні
сесії коректно потраплять у статистику осіннього сезону, а зимові — у статистику зимового,
незалежно від того, до якого сезону віднесено саму книгу як "прочитану". Це — правильна,
природна декомпозиція, і вона НЕ потребує спеціального edge-case коду саме тому, що гранулярність
(сесія, а не книга) уже вирішує проблему. **SAFE/коректно.** CODE VERIFIED.

### Favorite/top-rated book, топ-жанр, найактивніший місяць — коротко

- `favoriteBook`: серед позначених `isFavorite` книг сезону — найвище оцінена (fallback —
  просто перша); якщо жодної `isFavorite` немає — той самий fallback на найвищу оцінку серед
  УСІХ `booksFinished` сезону (`useReadingSeason.ts:72-80`). CODE VERIFIED, логіка проста й без
  видимих дір.
- `topGenre`: підрахунок жанрів серед `booksFinished` (пакетний запит, без N+1). CODE VERIFIED.
- `busiestMonth`: рахується з `session.startedAt` через `getUTCMonth()` (рядок 96) — той самий
  UTC-без-локального-зсуву підхід, що й межі сезону вище; консистентно, хоч і не локалізовано.
- `journalHighlight`: див. розділ 12 вище (POTENTIAL LEAK/HYPOTHESIS щодо spoiler-safe) — не
  фільтрується за статусом книги чи spoiler-safe, бере просто останній `favoriteOnly` запис за
  датою в межах сезону.

### Чи є тести на граничні дати

**Так, і досить ретельно** — `src/lib/season.test.ts` (125 рядків) покриває:
- Точні ISO-межі для всіх 4 сезонів 2026 року (`seasonDateRange`).
- Round-trip `formatSeasonKey`/`parseSeasonKey` + `null` для побитого рядка.
- ВСІ чотири сезонні межі (`currentSeasonKey`) з таймстемпами по обидва боки кожної межі
  (1 березня/1 червня/1 вересня/1 грудня), включно з "грудень = зима наступного року" і
  "січень/лютий = зима того самого року".
- `adjacentSeasonKey` у межах року, на межі зими в обидва боки, повний 4-кроковий цикл, і
  round-trip 4 вперед + 4 назад.

AUTOMATED TEST VERIFIED для всієї low-level дата-математики. Чого НЕМАЄ в тестах: (1) тестів
рівня хука `useReadingSeason` (агрегація `booksFinished`/`journalHighlight`/`favoriteBook`/
`topGenre`/`busiestMonth` — жодного файлу `useReadingSeason.test.ts` не знайдено), (2) тестів на
взаємодію з DNF (чи DNF-книга коректно виключається з `booksFinished` сезону — логічно так, бо
базується на `status='finished'`, але прямого тесту немає), (3) тестів на часовий пояс/локальний
зсув межі сезону (описано вище). NOT VERIFIED для цих трьох категорій.

---

## Зведення знахідок (за пріоритетом)

1. **POTENTIAL LEAK** — `JournalTimeline` (`src/components/memory/JournalTimeline.tsx:106-108`,
   `app/memory/[workId].tsx:504-508`) рендерить повний текст запису щоденника в модалці без
   spoiler-safe фільтрації, всупереч власній документації (`docs/SPOILER_SAFE.md:87-90`), яка
   стверджує протилежне. Найсерйозніша знахідка розділу 12.
2. **POTENTIAL LEAK** — Глобальний пошук (`app/(tabs)/search.tsx` + `usePersonalSearch.ts`)
   показує повний текст нотаток/цитат без будь-якої spoiler-safe фільтрації; не згадано в
   `docs/SPOILER_SAFE.md` як задокументований виняток.
3. **POTENTIAL LEAK** — Мертвий, але живий маршрут `app/characters/[workId].tsx`/
   `[entityId].tsx` — стара копія екрана лору БЕЗ spoiler-фільтрації персонажів, досяжна прямим
   deep-link'ом попри те, що жодна активна навігація на неї не веде.
4. **Знахідка (DNF × Activity History/On This Day)** — `finished_at` не скидається при переході
   `finished → did_not_finish` (той самий код-шлях, що навмисно зберігає дату при
   `finished → reading`), через що `ActivityHistoryRepository`/`OnThisDayRepository` (обидва
   фільтрують лише за `finished_at IS NOT NULL`, без перевірки поточного `status`) назавжди
   показують хибну подію "книгу завершено" для книги, яку користувач пізніше переніс у "Не
   дочитав". Не покрито тестом, не покрито Data Doctor.
5. Дрібніші непослідовності: застаріла окрема spoiler-евристика в `onThisDay.ts` (не звіряється
   з `spoiler_safe_enabled` конкретної книги, застарілий коментар "Фаза 12 ще немає"); Session
   Detail і Reading Seasons `journalHighlight` теж поза межами spoiler-safe фільтра, з нижчим
   практичним ризиком.
6. **Позитивні знахідки, варті окремої згадки**: сам механізм `spoilerSafe.ts` — акуратний,
   консервативний за замовчуванням, добре протестований; DNF коректно виключений з "прочитаних
   книг" усюди, де це перевірено; streak НАВМИСНО і правильно НЕ ламається заднім числом при
   DNF (відповідає задокументованому UX-принципу); winter year-ownership логіка для Seasons —
   точна, чітко задокументована й ретельно протестована на всіх межових датах.
# Група 5 — Reading Profile, Reading Fingerprint, One Book Picker, TBR/Anti-TBR

Корінь коду: `/mnt/user-data/uploads/polytsya-m11/`. Усі шляхи нижче — відносні до нього.

---

## Розділ 15: Reading Profile (приватна аналітика)

**Файли**: `src/lib/readingProfile.ts` (чисті функції/пороги), `src/features/readingProfile/useReadingProfile.ts` (збір даних, React Query), `app/reading-profile.tsx` (UI), тест `src/lib/readingProfile.test.ts`, документ `docs/READING_PROFILE.md`.

### Шість insight'ів і точні порогові значення (CODE VERIFIED, дослівні цитати)

**1. Час доби** — `src/lib/readingProfile.ts:28-33`:
```ts
export function bucketTimeOfDay(localHour: number): TimeOfDayId {
  if (localHour < 6) return 'night';
  if (localHour < 12) return 'morning';
  if (localHour < 18) return 'afternoon';
  return 'evening';
}
```
Поріг вибірки, `readingProfile.ts:46`:
```ts
export const MIN_SESSIONS_FOR_TIME_OF_DAY = 10;
```
`computeTimeOfDayInsight` (`readingProfile.ts:55-69`) рахує найчастіший з 4 кошиків (ніч/ранок/день/вечір) лише коли `localHours.length >= 10`, інакше повертає `null`. Час — **локальна** година (`Date.getHours()`), не UTC (обчислюється у хуку: `useReadingProfile.ts:50` — `new Date(s.startedAt).getHours()`).

**2. Середня сесія** — поріг `readingProfile.ts:79`:
```ts
export const MIN_SESSIONS_FOR_AVG_DURATION = 5;
```
`computeAverageSessionMinutes` (`readingProfile.ts:84-88`) — середнє `durationSeconds`, округлене до хвилини, `null` нижче 5 сесій.

**3. Найчастіший жанр** — поріг `readingProfile.ts:98`:
```ts
export const MIN_BOOKS_FOR_TOP_GENRE = 5;
```
`computeTopGenre` (`readingProfile.ts:109-117`) — рахується від кількості ЗАВЕРШЕНИХ книг (`totalBooks`), не суми жанрових входжень (книга з кількома жанрами рахується в кожен).

**4. Жанр з найвищими оцінками** — поріг **на кожен жанр окремо**, `readingProfile.ts:132`:
```ts
export const MIN_RATED_BOOKS_FOR_GENRE_RATING = 3;
```
`computeTopRatedGenre` (`readingProfile.ts:145-153`) — жанри з `count < 3` пропускаються цілком (`continue`), у порівняння взагалі не потрапляють.

**5. Формат (паперові vs цифрові)** — найризикованіший insight, поріг **на кожну сторону окремо**, `readingProfile.ts:187`:
```ts
export const MIN_SESSIONS_PER_FORMAT_SIDE = 5;
```
`computeFormatInsight` (`readingProfile.ts:195-198`):
```ts
export function computeFormatInsight(physicalCount: number, digitalCount: number): FormatInsight | null {
  if (physicalCount < MIN_SESSIONS_PER_FORMAT_SIDE || digitalCount < MIN_SESSIONS_PER_FORMAT_SIDE) return null;
  return { preferred: physicalCount >= digitalCount ? 'physical' : 'digital', physicalCount, digitalCount };
}
```
Нічия (`physicalCount === digitalCount`) йде на користь `'physical'` (`>=`), CODE VERIFIED тестом `readingProfile.test.ts:141-144`. Причина особливого статусу — задокументована в `docs/READING_PROFILE.md:64-87`: `edition.format` майже завжди `'paperback'`, бо (а) `EditionRepository.create` дефолтить на `'paperback'`, (б) обидва зовнішні провайдери метаданих (`GoogleBooksProvider`/`ISBNdbProvider`) завжди пишуть `'paperback'` незалежно від реального формату, (в) в застосунку немає UI редагування формату після створення видання. Тому обидві сторони мають отримати помітну кількість сесій, інакше "частіше читаєш паперові" — це майже завжди артефакт незміненого дефолту, а не реальна поведінка. Рахується **за сесіями** (`useReadingProfile.ts:90-98`), не за книгами бібліотеки; формат береться з ПОТОЧНОГО видання книги на момент запиту (`ub.edition.format`), не з формату на момент самої сесії.

**6. Середня довжина прочитаної книги** — поріг `readingProfile.ts:208`:
```ts
export const MIN_BOOKS_FOR_AVG_PAGES = 5;
```
`computeAveragePages` (`readingProfile.ts:212-216`) — середнє `edition.pageCount` завершених книг з відомим обсягом, округлене.

### Обчислення: на льоту чи кешується?

**На льоту, без явного кешування домену.** `useReadingProfile()` (`src/features/readingProfile/useReadingProfile.ts:36-109`) — звичайний React Query `useQuery` з ключем `queryKeys.readingProfile.overall` (`src/lib/queryKeys.ts:191`), **без** `staleTime`/`gcTime`, переданих явно в опціях хука. Греп по всьому `src/` не знайшов жодного виклику `queryClient.invalidateQueries` з цим ключем (чи з `fingerprint.overall`) — жодна мутація (сесія читання, зміна статусу книги, оцінка) явно не інвалідує ці два запити. Це означає: свіжість даних цілком залежить від **глобального** дефолту `QueryClient` (`staleTime`/`refetchOnMount` тощо).

NOT VERIFIED (частково): файл `src/lib/queryClient.ts`, що його імпортує `app/_layout.tsx:11` (`import { queryClient } from '@/lib/queryClient';`), **відсутній у застейдженому знімку коду** (`/mnt/user-data/uploads/polytsya-m11/src/lib/`) — перевірено `Glob`/`find` по всьому дереву, збігів нуль. Тому неможливо CODE VERIFIED підтвердити чи спростувати глобальний `staleTime`/`gcTime` — а отже, і те, чи екран «Мій читацький профіль», відкритий одразу після завершення сесії читання, реально покаже щойно оновлені дані, чи покаже застарілий кеш до природного спливання `staleTime`. Кожен запит сам по собі — це «свіжий SQL-агрегат» (кожен виклик `queryFn` заново читає БД і рахує з нуля, кешування самих ЧИСЕЛ/InsightІВ немає — це підтверджено кодом), але чи повторно рефетчиться він при кожному відкритті екрана — залежить від відсутнього файлу.

### Поведінка на малій кількості даних (1-2 книги)

**Тиха деградація ("quiet degradation"), не окремий edge-case UI на рівні кожної картки.** Кожна з шести функцій повертає `null`, якщо вхідні дані нижче свого `MIN_*`-порогу (найнижчий поріг у файлі — 3, найвищий — 10; при 1-2 книгах/сесіях **жоден** insight не пройде жоден поріг). `app/reading-profile.tsx:63-97` фільтрує `null`-поля в масив `rows`; коли `rows.length === 0` (`reading-profile.tsx:117-121`), показується один спільний `EmptyState`:
```
title: "Профіль ще збирається"
description: "Читай і фіксуй сесії — перші висновки з'являться, коли даних набереться достатньо."
```
Жодного попередження "недостатньо даних" на рівні окремої картки — insight нижче порогу просто відсутній у списку, доброзичливий тон без сорому за малу активність (задокументовано в `docs/READING_PROFILE.md:26-31`, CODE VERIFIED відповідністю коду). AUTOMATED TEST VERIFIED для меж порогів (не для 1-2 конкретно, а для "поріг мінус один" узагалі): `readingProfile.test.ts:38-41`, `:60-63`, `:79-82`, `:95-98,103-106`, `:131-134`, `:152-155` — кожна функція явно тестується на `MIN_* - 1` → `null`.

---

## Розділ 16: Reading Fingerprint (бейджі)

**Файли**: `src/lib/readingFingerprint.ts`, `src/features/fingerprint/useReadingFingerprint.ts`, `app/fingerprint.tsx`, `src/components/fingerprint/FingerprintCardPreview.tsx`, тест `src/lib/readingFingerprint.test.ts`, документ `docs/READING_FINGERPRINT.md`.

### Повний перелік бейджів (дослівна цитата, `readingFingerprint.ts:25-49`)

```ts
export type BadgeId =
  | 'evening_reader'
  | 'marathon_reader'
  | 'slow_immersion'
  | 'long_stories_lover'
  | 'series_reader'
  | 'genre_explorer'
  | 'note_taker'
  | 'quote_collector';

export const BADGE_META: Record<BadgeId, BadgeMeta> = {
  evening_reader: { label: 'Вечірній читач', icon: 'moon-outline' },
  marathon_reader: { label: 'Марафонський читач', icon: 'flash-outline' },
  slow_immersion: { label: 'Повільне занурення', icon: 'water-outline' },
  long_stories_lover: { label: 'Любитель довгих історій', icon: 'book-outline' },
  series_reader: { label: 'Читає серіями', icon: 'layers-outline' },
  genre_explorer: { label: 'Дослідник жанрів', icon: 'compass-outline' },
  note_taker: { label: 'Любить робити нотатки', icon: 'pencil-outline' },
  quote_collector: { label: 'Колекціонер цитат', icon: 'chatbubble-outline' },
};
```
Рівно 8 бейджів, як і заявляє `docs/READING_FINGERPRINT.md:37` ("Вісім бейджів"). Ніякого «психологічного» набору — усі описують поведінку (коли/як довго/як швидко/що саме читаєш), відповідає ТЗ-обмеженню, задокументованому в `readingFingerprint.ts:9-12`.

### Точні умови отримання кожного бейджа (CODE VERIFIED)

| Бейдж | Поріг вибірки | Умова | Рядки |
|---|---|---|---|
| `evening_reader` | успадкований з Profile: `MIN_SESSIONS_FOR_TIME_OF_DAY=10` | `timeOfDay?.timeOfDay === 'evening'` | `readingFingerprint.ts:69-71` |
| `marathon_reader` | успадкований: `MIN_SESSIONS_FOR_AVG_DURATION=5` | `averageSessionMinutes >= MARATHON_SESSION_MINUTES_THRESHOLD (60)` | `:81-85` |
| `slow_immersion` | власний: `MIN_HOURS_FOR_SLOW_IMMERSION_BADGE=15` (годин сумарного читання) | `pagesPerHour <= SLOW_IMMERSION_MAX_PAGES_PER_HOUR (20)` | `:94-118` |
| `long_stories_lover` | успадкований: `MIN_BOOKS_FOR_AVG_PAGES=5` | `averagePages >= LONG_BOOK_AVERAGE_PAGES_THRESHOLD (420)` | `:125-129` |
| `series_reader` | власний: `MIN_FINISHED_BOOKS_FOR_SERIES_BADGE=5` завершених книг | `finishedBooksInSeriesCount / finishedBooksTotalCount >= SERIES_READER_MIN_SHARE (0.4)` | `:135-144` |
| `genre_explorer` | власний: `MIN_FINISHED_BOOKS_FOR_GENRE_EXPLORER_BADGE=8` завершених книг | `distinctGenresCount >= GENRE_EXPLORER_MIN_DISTINCT_GENRES (6)` | `:150-156` |
| `note_taker` | власний: `MIN_NOTES_FOR_BADGE=20` | `notesCount >= 20` | `:163,166-168` |
| `quote_collector` | власний: `MIN_QUOTES_FOR_BADGE=20` | `quotesCount >= 20` | `:164,170-172` |

Три бейджі (`evening_reader`, `marathon_reader`, частково `long_stories_lover`) читають **вже пороговані** значення з `readingProfile.ts` напряму (`TimeOfDayInsight`/`averageSessionMinutes`/`averagePages`, що вже пройшли свій `MIN_*` у `readingProfile.ts`), не перераховують поріг вибірки заново — задокументовано у файловому коментарі `readingFingerprint.ts:16-22` і в `docs/READING_FINGERPRINT.md:39-46`.

`slow_immersion` має власну глобальну агрегацію темпу (`computeGlobalPace`, `readingFingerprint.ts:110-114`):
```ts
export function computeGlobalPace(pagesTurnedTotal: number, totalSeconds: number): GlobalPaceInsight | null {
  const totalHours = totalSeconds / 3600;
  if (totalHours < MIN_HOURS_FOR_SLOW_IMMERSION_BADGE || pagesTurnedTotal <= 0) return null;
  return { pagesPerHour: Math.round(pagesTurnedTotal / totalHours), totalHours };
}
```

### Пріоритет/конфлікти й ліміт показу

**Немає жодного правила "виключності" між бейджами** — це НЕ "обери один з кількох, що підходять". Кожен бейдж має власний незалежний предикат; `computeFingerprintBadges` (`readingFingerprint.ts:193-205`) просто фільтрує `BADGE_ORDER` за тим, які предикати повернули `true`:
```ts
export function computeFingerprintBadges(input: FingerprintInput): BadgeId[] {
  const qualifies: Record<BadgeId, boolean> = { /* 8 предикатів */ };
  return BADGE_ORDER.filter((badgeId) => qualifies[badgeId]);
}
```
AUTOMATED TEST VERIFIED: `readingFingerprint.test.ts:197-210` явно перевіряє, що **всі 8** бейджів можуть бути присутні одночасно, якщо всі 8 порогів пройдені — жодного "макс. N бейджів на самому екрані" немає. `BADGE_ORDER` (`readingFingerprint.ts:54-63`, фіксований порядок: evening_reader → marathon_reader → slow_immersion → long_stories_lover → series_reader → genre_explorer → note_taker → quote_collector) визначає лише **порядок відображення**, не взаємовиключність.

Єдине обмеження кількості — стосується **лише картки-зображення "поділитися"**, не самого екрана:
```ts
export const MAX_SHARE_CARD_BADGES = 6;

export function selectShareCardBadges(badges: BadgeId[]): BadgeId[] {
  return badges.slice(0, MAX_SHARE_CARD_BADGES);
}
```
(`readingFingerprint.ts:210-214`) — бере перші 6 у порядку `BADGE_ORDER` (не "найважливіші" за якимось окремим рейтингом, а просто перші за фіксованим порядком масиву). Повний список бейджів на самому екрані `app/fingerprint.tsx:144-159` не обрізається взагалі.

### Обчислення й кеш

Той самий патерн, що й Profile: окремий `useQuery` (`queryKeys.fingerprint.overall`, `useReadingFingerprint.ts:31`), без явного `staleTime`, без явних `invalidateQueries` десь у коді (греп підтвердив відсутність) — і той самий NOT VERIFIED застереження щодо відсутнього `src/lib/queryClient.ts` у застейдженому знімку (див. Розділ 15).

### Мала кількість даних (1-2 книги)

Той самий edge-case, що й Profile: при 1-2 книгах/сесіях жоден з 8 предикатів не пройде свій поріг (найнижчий поріг — 5 книг/годин/сесій), `computeFingerprintBadges` поверне `[]`. `app/fingerprint.tsx:144-148` показує `EmptyState`:
```
title: "Відбиток ще формується"
description: "Читай і фіксуй сесії — перші бейджі з'являться, коли даних набереться достатньо."
```
AUTOMATED TEST VERIFIED порожнього випадку: `readingFingerprint.test.ts:180-183` (`computeFingerprintBadges(EMPTY_INPUT)` → `[]`).

---

## Розділ 17: One Book Picker — алгоритм вибору "що читати далі"

**Файли**: `src/lib/onePicker.ts` (чисті функції), `src/features/onePicker/useOnePicker.ts` (збір даних, `useMutation`), `app/one-book-picker.tsx` (UI), тест `src/lib/onePicker.test.ts`, документ `docs/ONE_BOOK_PICKER.md`.

### Псевдокод алгоритму (побудований з реального коду)

```
handlePick():
  filters = { genreId, timeBudget, desiredMood, maxPages, seriesFilter, tbrScope, ownershipScope }
  pick.mutate({ filters, excludeUserBookIds: [] })     // app/one-book-picker.tsx:92-95

mutationFn(filters, excludeUserBookIds):                # useOnePicker.ts:50-127
  statuses = TBR_SCOPE_STATUSES[filters.tbrScope]        # 'tbr'->['want_to_read']; 'any_unread'->['want_to_read','paused','did_not_finish']
  userBooks = SELECT user_book WHERE status IN statuses  # один запит на кожен статус, потім .flat()
  userBooks = userBooks.filter(ub -> ub.id NOT IN excludeUserBookIds)
  if userBooks.length == 0: return null

  # Пакетне збагачення кандидатів (без N+1)
  genresByWorkId   = GenreRepository.listByWorkIds(workIds)
  workIdsInSeries  = SeriesRepository.listWorkIdsInSeries(workIds)
  ownedEditionIds  = OwnedBookRepository.listOwnedEditionIds(editionIds)
  sessions         = ReadingSessionRepository.listAllCompleted()   # УСІ завершені сесії всіх книг

  candidates = userBooks.map(ub -> {
    userBookId, status, pageCount: ub.edition.pageCount,
    genreIds, genreNames, isInSeries: workIdsInSeries.has(ub.work.id),
    isOwned: ownedEditionIds.has(ub.edition.id), descriptionText: ub.work.description
  })

  # ЖОРСТКА ФІЛЬТРАЦІЯ — filterCandidates (onePicker.ts:72-88)
  filtered = candidates.filter(c ->
       status IN allowedStatuses
    && (genreId == null || c.genreIds.includes(genreId))
    && (maxPages == null || c.pageCount == null || c.pageCount <= maxPages)   # невідома довжина НЕ виключається
    && (seriesFilter != 'standalone' || !c.isInSeries)
    && (seriesFilter != 'series'     ||  c.isInSeries)
    && (ownershipScope != 'owned'    ||  c.isOwned)
  )
  if filtered.length == 0: return null

  # Темп читання — RollingPace ОСТАННІХ 5 СЕСІЙ (DEFAULT_WINDOW, НЕ lifetime!)
  pace = computeRollingPace(sessions)              # windowSize НЕ передано -> default 5 (readingPace.ts:16,31)
  pagesPerMinute = pace.pagesPerMinute > 0 ? pace.pagesPerMinute : FALLBACK_PAGES_PER_MINUTE (=0.5)

  pageBudget = estimatePageBudget(TIME_BUDGET_OPTIONS[timeBudget].minutesMid, pagesPerMinute)
             = max(1, round(minutesMid * pagesPerMinute))

  # М'ЯКЕ РАНЖУВАННЯ — rankCandidates (onePicker.ts:122-137)
  scored = filtered.map(c -> {
     distance: c.pageCount != null ? |c.pageCount - pageBudget| : +Infinity,
     moodMatched: matchesDesiredMood(c, desiredMood)   # substring-пошук PURPOSE_KEYWORDS[mood] у (genreNames + descriptionText).toLowerCase()
  })
  ranked = scored.sort((a,b) ->
     a.moodMatched != b.moodMatched ? (a.moodMatched ? -1 : 1)   # збіг настрою ЗАВЖДИ переважає близькість сторінок
                                     : a.distance - b.distance
  )

  # ВИПАДКОВИЙ ВИБІР СЕРЕД ТОП-N — pickCandidate (onePicker.ts:142-151)
  pool  = ranked.slice(0, poolSize=5)      # ЛИШЕ перші 5 найкращих кандидатів, решта відкидається БЕЗПОВОРОТНО на цей запит
  index = floor(Math.random() * pool.length)
  picked = pool[index]
  if !picked: return null

  seriesContext = picked.isInSeries ? SeriesRepository.getContextForWork(picked.work.id) : null

  return {
    userBook: picked,
    explanation: buildPickExplanation(...)  ,       # до 3 причин, onePicker.ts:198-224
    estimatedMinutes: round(pageCount / pagesPerMinute),
    seriesStatus: formatSeriesStatus(seriesContext)
  }
```

### Фактори впливу та їхній пріоритет

1. **Жорсткі фільтри (виключають кандидата з пулу повністю)**: `tbrScope`→статус, `genreId`, `maxPages` (лише при відомій довжині), `seriesFilter`, `ownershipScope`. Порядок у `filterCandidates` не має значення — це логічне `AND` усіх умов одночасно.
2. **Настрій (`desiredMood`) — м'який, НАЙВИЩИЙ пріоритет у ранжуванні**: `rankCandidates` (`onePicker.ts:133-136`) спочатку сортує за `moodMatched` (true завжди попереду false), і лише **в межах однієї групи** — за відстанню сторінок. Це означає: книга без збігу настрою НІКОЛИ не обжене книгу зі збігом настрою, незалежно від того, наскільки ближче вона за обсягом до бюджету часу.
3. **Близькість `pageCount` до `pageBudget` — другорядний сигнал**, застосовується лише як tie-break усередині групи "збіг настрою"/"без збігу". Невідома довжина (`pageCount == null`) отримує `distance = +Infinity` і сортується в кінець своєї групи, але НЕ виключається з пулу.
4. **Рандомізація на останньому кроці** — `pickCandidate` бере рівномірно випадковий елемент серед перших `poolSize=5` (не завжди найкращого за рейтингом), той самий підхід і ті самі значення за замовчуванням, що й `tomorrowRecommendation.ts#pickCandidate` (`onePicker.ts:139-141`, коментар прямо посилається). `rng: () => number = Math.random` — за замовчуванням **недетерміновано**; в тестах інʼєктується фіксований `rng` (`onePicker.test.ts:158-164`).

### Пояснення вибору (`buildPickExplanation`, `onePicker.ts:210-225`)

Максимум 3 причини (`MAX_EXPLANATION_REASONS = 3`), у фіксованому порядку пріоритету: (1) часовий бюджет — завжди перша й обов'язкова; (2) збіг настрою — лише якщо `moodMatched && desiredMood != null`; (3) `isOwned` — «уже маєш цю книгу на полиці»; (4) фільтр серії (`standalone`/`series`); (5) фільтр жанру. Список причин обрізається до перших 3 навіть якщо всі 5 спрацювали одночасно — AUTOMATED TEST VERIFIED (`onePicker.test.ts:225-236`).

### КОНКРЕТНИЙ РОБОЧИЙ ПРИКЛАД (⚠️ ВИГАДАНІ дані, для ілюстрації логіки коду — не реальні книги з БД)

Фільтри користувача: `timeBudget = 'medium'` (`minutesMid = 270`, `tomorrowRecommendation.ts:45`), `desiredMood = 'absorbed'`, `maxPages = null`, `seriesFilter = 'any'`, `tbrScope = 'tbr'` (лише `want_to_read`), `ownershipScope = 'any'`. Історія читання: припустимо, реальних завершених сесій ще немає (типовий стан свіжого користувача) → `computeRollingPace([])` дає `pagesPerMinute = 0`, тож `usedFallback` → `pagesPerMinute = FALLBACK_PAGES_PER_MINUTE = 0.5`.

`pageBudget = estimatePageBudget(270, 0.5) = round(270 * 0.5) = 135` сторінок.

5 кандидатів-приклад, усі зі статусом `want_to_read` (тобто всі проходять жорсткий фільтр `tbrScope`):

| # | Назва (приклад) | Жанр(и) | Сторінок | У серії | Своя фізично | Опис (для перевірки настрою) |
|---|---|---|---|---|---|---|
| A | «Роман А» | Фентезі | 140 | ні | так | «Атмосферна історія, у яку неможливо не зануритися.» |
| B | «Роман B» | Комедія | 620 | так | ні | «Гумористичний роман про...» |
| C | «Роман C» | Наука | 90 | ні | ні | «Підручник з фізики.» |
| D | «Роман D» | Детектив | 130 | ні | ні | (немає опису) |
| E | «Роман E» | Фентезі, Пригоди | невідомо (`null`) | так | так | «Захопливий сюжет, який не відпускає до останньої сторінки.» |

**Крок 1 — `filterCandidates`**: жанр/maxPages/серія/володіння не задані як жорсткі обмеження в цьому прикладі → всі 5 проходять.

**Крок 2 — `matchesDesiredMood(candidate, 'absorbed')`**, ключові слова `PURPOSE_KEYWORDS.absorbed = ['захопливий сюжет', 'неможливо відірватися', 'напружений сюжет']` (`tomorrowRecommendation.ts:30`), пошук підрядка (case-insensitive) у `genreNames + descriptionText`:
- A: «...неможливо **не зануритися**» — НЕ містить підрядка «неможливо відірватися» → `false` (незважаючи на смислову близькість — це буквальний `includes()`, не семантичний збіг).
- B: жодного ключового слова → `false`.
- C: жодного ключового слова → `false`.
- D: опису немає → `false`.
- E: містить буквально «захопливий сюжет» → **`true`**.

**Крок 3 — `rankCandidates`**: `distance = |pageCount - 135|` (E отримує `+Infinity`, бо `pageCount == null`):
- A: 140 → `distance = 5`
- B: 620 → `distance = 485`
- C: 90 → `distance = 45`
- D: 130 → `distance = 5`
- E: `null` → `distance = +Infinity`, але `moodMatched = true`

Сортування: спочатку група `moodMatched=true` (лише E), потім решта за зростанням `distance`: A(5) і D(5) — рівна відстань, стабільне сортування зберігає вихідний порядок масиву (A раніше D), далі C(45), потім B(485).

**Підсумковий ранжований список**: `[E, A, D, C, B]`.

**Крок 4 — `pickCandidate(ranked, poolSize=5)`**: `pool = ranked.slice(0, 5)` — оскільки кандидатів рівно 5, **пул дорівнює всьому ранжованому списку**. `index = Math.floor(Math.random() * 5)` — **рівномірно випадковий вибір серед УСІХ П'ЯТИ**, включно з B (найгірший за рейтингом: не збігся настрій, найдальший за обсягом сторінок — 620 проти цілі 135).

### ⚠️ Ключовий висновок з цього прикладу (CODE VERIFIED, не HYPOTHESIS — прямий наслідок коду `onePicker.ts:142-151`)

Ранжування (`rankCandidates`) у цьому прикладі **фактично не впливає на кінцевий вибір**, бо `poolSize` за замовчуванням (5) дорівнює або перевищує розмір типового відфільтрованого пулу невеликої особистої бібліотеки (TBR-списки в застосунках для читання рідко перевищують кілька десятків книг, а після звуження жанром/довжиною/серією/жанром — легко потрапляють у діапазон ≤5). У такому разі алгоритм **вироджується в "рівномірно випадкова книга з відфільтрованого пулу"** — книга B (жодного збігу настрою, у 4.6 раза довша за бюджет часу) має РІВНО ТАКУ САМУ ймовірність бути обраною (20%), як і E (єдина зі збігом настрою). Пояснення (`buildPickExplanation`), яке покаже застосунок, все одно чесно опише лише реальні факти про обрану книгу (без вигадування "бо вона найкраще підходить") — але сам факт вибору в такому сценарії не гарантує, що показана книга дійсно НАЙКРАЩЕ підходить під фільтри, лише що вона входить у топ-5 (тут — увесь пул). Ранжування реально "працює" (звужує ймовірний вибір до дійсно найкращих) лише коли відфільтрований пул стабільно **перевищує** 5 кандидатів.

### Детермінованість

**НЕ детермінований за замовчуванням.** `pickCandidate(ranked, poolSize = 5, rng: () => number = Math.random)` (`onePicker.ts:142-146`) використовує `Math.random()` як RNG за замовчуванням — той самий запит із тими самими фільтрами й тим самим пулом кандидатів може повернути РІЗНУ книгу щоразу (серед топ-5). Це навмисне рішення (докстрінг `useOnePicker.ts:42-44`: "результат навмисно недетермінований... і не повинен кешуватись React Query як стабільне значення") — тому хук навмисно `useMutation`, не `useQuery`. `rng` ін'єктований параметр — у тестах підміняється фіксованою функцією для детермінованої перевірки (`onePicker.test.ts:158-164`).

---

## Розділ 18: TBR (To Be Read) vs One Book Picker — накладання

**Файли**: `src/features/tbr/useTbrReality.ts`, `app/tbr.tsx`, `src/lib/tbrEstimate.ts`, `src/lib/tbrPersonality.ts`, `docs/TBR_PERSONALITY.md`, для порівняння — `src/lib/onePicker.ts`/`src/features/onePicker/useOnePicker.ts` (Розділ 17).

### Це два окремі, незалежні екрани з окремою логікою (CODE VERIFIED)

TBR reality check (`app/tbr.tsx`, `useTbrRealityCheck`) і One Book Picker (`app/one-book-picker.tsx`, `useOnePicker`) — **окремі фічі різних milestone/фаз** (TBR reality check — Milestone 6/розділ 30 ТЗ; One Book Picker — Фаза 16 V1.6), кожна зі своїм React Query ключем (`queryKeys.tbr.reality` vs власний `useMutation` без queryKey), окремими чистими функціями (`tbrEstimate.ts`/`tbrPersonality.ts` vs `onePicker.ts`) і окремим UI. `docs/ONE_BOOK_PICKER.md:19-23` прямо стверджує, що новий пікер — свідомо незалежний файл, "не розширення" наявної логіки.

### Так, One Book Picker БЕРЕ кандидатів безпосередньо зі статусу TBR — і саме тут накладання РЕАЛЬНЕ

- TBR reality check рахує оцінку **виключно** по `UserBookRepository.listByStatus(db, 'want_to_read')` (`useTbrReality.ts:34`) — статус `want_to_read` І Є визначенням "TBR" у цій системі, жодного окремого поняття "TBR-список" з власною таблицею немає.
- One Book Picker за замовчуванням UI (`app/one-book-picker.tsx:78`, `tbrScope` дефолт `'tbr'`) використовує `TBR_SCOPE_STATUSES.tbr = ['want_to_read']` (`onePicker.ts:38`) — **той самий рівно один статус**, що й TBR reality check. Тобто пул кандидатів One Book Picker у дефолтному режимі — це буквально той самий список книг, що показує TBR reality check.
- Розширений режим `tbrScope: 'any_unread'` додає `'paused'`/`'did_not_finish'` (`onePicker.ts:39`) — ширше за "класичний" TBR, туди TBR reality check НЕ заглядає взагалі (рахує лише `want_to_read`).

Отже, це не дублювання логіки (обчислення різні: TBR reality check рахує дні на дочитання всього списку разом; One Book Picker обирає ОДНУ книгу з ранжуванням/рандомізацією), але це **той самий вихідний пул даних**, до якого застосовуються дві незалежні лінзи. Жодних явних перехресних посилань між `useTbrReality.ts` і `useOnePicker.ts`/`onePicker.ts` немає (не імпортують одне одного) — накладання виникає лише тому, що обидва читають однакову БД-умову `status = 'want_to_read'` окремими запитами.

### "TBR Personality"/"Anti-TBR" — що це насправді (CODE VERIFIED, розбіжність з назвою фази)

Незважаючи на назву `docs/TBR_PERSONALITY.md:1` ("TBR Personality / Anti-TBR (Фаза 17)") і докстрінг `tbrPersonality.ts:5` (та сама назва), **у коді немає жодної окремої функції чи механізму з іменем/логікою "anti-TBR"** — греп `anti.?tbr`/`antiTbr`/`AntiTbr` по всьому репозиторію знаходить лише сам заголовок документа й докстрінгу, жодного функціонального коду. Фактично реалізовано лише **два нових, суто описових insight'и**, додані до вже наявного екрана TBR reality check:

1. `findOldestWaitingBook` (`tbrPersonality.ts:43-48`) — книга з найранішим `addedAt` серед `want_to_read`, різниця в календарних днях від "зараз".
2. Три функції форматування речень (`formatBookCountSentence`, `formatOldestWaitingSentence`, `formatDaysWaitingSentence`, `tbrPersonality.ts:55-70`) — жодних порогів мінімальної вибірки (`docs/TBR_PERSONALITY.md:32-39` пояснює чому: це точний опис самого списку, не статистичний висновок).

Немає жодної фактичної "анти-TBR" механіки в сенсі, який зазвичай асоціюють з цим терміном (наприклад: пропозиція видалити книгу зі списку "Хочу прочитати", "здатися" на книзі, decluttering-потік, обмеження на додавання нових книг у TBR, попередження про переповнений список). Єдина "дія" на новій картці — CTA **«Нарешті прочитати»** (`app/tbr.tsx:58-62`), яка веде на Book Details (`/work/[workId]`), тобто **заохочує почати читати** книгу з TBR, а не якось "боротися" з TBR-списком. Це прямо суперечить очікуванню, яке створює сама назва фази ("Anti-TBR" типово означає механізм протидії накопиченню непрочитаного) — HYPOTHESIS щодо очікування читача назви, але CODE VERIFIED щодо відсутності будь-якого протидіючого механізму в коді.

### Суперечності/розбіжності між двома системами (CODE VERIFIED)

1. **Розбіжний трактування "rolling pace" темпу читання, попри коментар, що стверджує зворотне.** `useOnePicker.ts:44` (докстрінг): _"той самий rolling pace (останні сесії, не lifetime-середнє), що й «Що почитати завтра?»/TBR reality check"_. Це твердження **неточне** для TBR reality check:
   - `useOnePicker.ts:92-99`: `computeRollingPace(sessions.map(...))` — **без** другого аргументу `windowSize`, тож використовується `DEFAULT_WINDOW = 5` (`readingPace.ts:16,31`) — рахує темп лише за **останніми 5 сесіями** (по всій бібліотеці).
   - `useTbrReality.ts:38`: `computeRollingPace(sessions, sessions.length)` — `windowSize` явно = `sessions.length`, тобто **ВСІ сесії без обмеження** (lifetime-середнє). Це прямо підтверджено власним докстрінгом `useTbrReality.ts:23-26`: _"на відміну від `finishPrediction`... тут беремо темп за ВЕСЬ наявний час... TBR-оцінка довгострокова, одна недавня повільна/швидка сесія не повинна її різко хитати"_ — що є прямою протилежністю "rolling"-підходу.
   
   Отже, коментар у `useOnePicker.ts` описує TBR reality check неправильно: TBR reality check НЕ використовує rolling-вікно останніх сесій, а One Book Picker — використовує (вікно=5). Це не впливає на коректність обчислень кожного окремо (обидва коректні для своєї мети), але це **документаційна неточність/суперечність між коментарями двох сусідніх фіч**, яка може ввести розробника в оману, що темп однаковий і взаємозамінний між екранами — насправді той самий користувач з нерівномірним темпом читання (наприклад, різко прискорився в останніх 5 сесіях) побачить РІЗНУ оцінку швидкості читання на екрані TBR reality check (lifetime-темп) і в оцінці "скільки хвилин читати" на картці One Book Picker (темп лише за останніми 5 сесіями) для однієї й тієї самої книги в один і той самий момент.

2. **Немає єдиного UI-переходу між екранами.** TBR reality check (`app/tbr.tsx`) не пропонує "обрати конкретну книгу" (лише агрегатна оцінка + CTA на найдовше очікувану книгу); One Book Picker (`app/one-book-picker.tsx`) не показує нічого зі статистики TBR reality check (кількість книг, днів на дочитання). Користувач, що хоче і оцінку часу, і конкретний вибір книги, має відвідати два різні екрани поспіль — жодного взаємного посилання (deep link) з одного екрана на інший у переглянутому коді не знайдено.

3. **Різні жорсткі межі статусів "непрочитаного".** TBR reality check завжди = лише `want_to_read`. One Book Picker у режимі `any_unread` додає `paused`/`did_not_finish` — тобто книга, позначена "Не дочитав", може бути обрана One Book Picker (у розширеному режимі), але НІКОЛИ не потрапить у розрахунок TBR reality check (він не бачить `paused`/`did_not_finish` взагалі). Це узгоджений, свідомий дизайн (не помилка), але означає, що термін "TBR" у двох фічах трактується по-різному залежно від фільтра — вартий згадки як потенційне джерело плутанини користувача ("чому книга з 'Обери мені книгу' не врахована в оцінці TBR reality check").
# Розділ 19: Пошук (Search) — Catalog / Personal / Journal / Lore

## 19.0 Загальна карта — скільки окремих пошукових механізмів насправді існує

У застосунку не один «пошук», а щонайменше **шість** незалежних механізмів, що діляться на дві категорії за середовищем виконання:

| # | Механізм | Де живе дані | SQL-рушій | Файл |
|---|---|---|---|---|
| 1 | Пошук по каталогу користувача (Books/Authors) | Локальна SQLite | `LIKE '%…%'` | `src/data/repositories/WorkRepository.ts:126-149` |
| 2 | Personal Search — серії | Локальна SQLite | `LIKE '%…%'` | `src/data/repositories/SeriesRepository.ts:73-82` |
| 3 | Personal Search — полиці | Локальна SQLite | `LIKE '%…%'` | `src/data/repositories/ShelfRepository.ts:112-127` |
| 4 | Personal Search / Journal Search — нотатки й цитати | Локальна SQLite | `LIKE '%…%'` | `src/data/repositories/JournalRepository.ts` (`searchFeed`, `listFeedPage`/`listPage` з `options.query`) |
| 5 | Зовнішній пошук метаданих (Google Books / ISBNdb / Спільний каталог / Кураторська добірка / Manual) | Зовнішні REST API + власний Supabase-проєкт | різне (див. 19.4) | `src/data/providers/*.ts` |
| 6 | Lore (персонажі) | Локальна SQLite | **немає взагалі** — лише `listByWorkId` | `src/data/repositories/LoreEntityRepository.ts` |

CODE VERIFIED: у всьому дереві `src/` (`grep -rn "fts5\|FTS5\|VIRTUAL TABLE"`) єдина згадка FTS5 — це коментарі-обґрунтування в `JournalRepository.ts` (чому FTS5 **не** використано), а не сама реалізація. FTS5-таблиці в проєкті немає **ніде** — ні в базовій схемі (`src/data/db/migrations/001_base_schema.ts`), ні в жодній з 18 наступних міграцій (`002`…`018`, `src/data/db/migrations/*.ts`). Усі міграції написані TypeScript-функціями (`up(db)` з `db.execAsync`), а не `.sql`-файлами — задання агента, що шукало `src/data/db/migrations/*.sql`, дало 0 файлів, бо формат інший.

Отже: **непослідовності «FTS5 тут, LIKE там» не існує в принципі** — FTS5 не використовується ЖОДНОЮ фічею пошуку в локальній SQLite. Уся локальна текстова пошукова функціональність (каталог книг, серії, полиці, нотатки, цитати) побудована на `LIKE '%…%'` без жодного винятку. Це свідоме, документоване рішення (див. 19.2), а не недогляд в одному місці на тлі FTS5 деінде.

## 19.1 Пошук по власній бібліотеці (Personal Search) — `usePersonalSearch`

`src/features/search/usePersonalSearch.ts:33-50` — п'ять паралельних SQL-запитів (`Promise.all`) по чотирьох репозиторіях:

```ts
const [books, journal, series, shelves] = await Promise.all([
  WorkRepository.search(db, query),
  JournalRepository.searchFeed(db, query),
  SeriesRepository.search(db, query),
  ShelfRepository.search(db, query),
]);
```

Дебаунс введення — 250 мс (`useDebouncedValue(rawQuery.trim(), 250)`, `usePersonalSearch.ts:34`).

**WorkRepository.search** (`WorkRepository.ts:126-149`) — пошук по назві/оригінальній назві твору й по імені автора:
```sql
SELECT DISTINCT w.*, (SELECT e.cover_url FROM edition e WHERE e.work_id = w.id ... LIMIT 1) AS cover_url
FROM work w
LEFT JOIN work_author wa ON wa.work_id = w.id
LEFT JOIN author a ON a.id = wa.author_id
WHERE w.deleted_at IS NULL
  AND (w.title LIKE ? OR w.original_title LIKE ? OR a.name LIKE ?)
ORDER BY w.updated_at DESC
LIMIT 30
```
Порожній запит повертає `[]` без звернення до БД (`trimmed.length === 0`). Явно задокументовано обмеження: `LIKE` в SQLite не фолдить регістр кирилиці без ICU-розширення (коментар `WorkRepository.ts:123-125`) — тобто пошук чутливий до регістру кирилиці в певних випадках (LIKE в SQLite робить case-insensitive фолдинг лише для ASCII; UA/RU літери — ні). Це MANUALLY-документована, а не device-verified, поведінка SQLite за замовчуванням — стандартна відома властивість рушія.

**SeriesRepository.search** (`SeriesRepository.ts:73-82`) — `WHERE name LIKE ?`, limit 20, сортування за `updated_at DESC`.

**ShelfRepository.search** (`ShelfRepository.ts:112-127`) — той самий `LIKE`, з `LEFT JOIN shelf_book` + `COUNT` для `bookCount`, limit 20.

**JournalRepository.searchFeed** (`JournalRepository.ts:505-554`) — два незалежні запити (notes/quotes), кожен з окремим `LIMIT 10` (параметр за замовчуванням), `text LIKE ?` для нотаток, `(text LIKE ? OR comment LIKE ?)` для цитат, з JOIN до `user_book→edition→work` для назви й обкладинки книги в результаті. Тест: `PersonalSearch.test.ts` (`src/data/repositories/PersonalSearch.test.ts:94-108`) — AUTOMATED TEST VERIFIED, перевіряє коректність фільтрації по обох гілках і join-даних.

Усі п'ять доменів дають однаково короткі, обрізані `LIMIT`-и (10-30) — це пошук-«підказка», не повний список результатів з пагінацією; немає інфініт-скролу чи кнопки «показати більше» в жодному з цих доменів (перевірено відсутністю `cursor`/пагінаційних параметрів у сигнатурах методів).

## 19.2 «Каталог» (пошук у власному каталозі книг, Milestone 1) — `useBookSearch`

`src/features/search/useBookSearch.ts` — той самий `WorkRepository.search` (позначено в коментарі як «той самий метод, що й локальна секція "у твоєму каталозі"», `usePersonalSearch.ts:24-25`), лише окремий React Query hook для екрана «Додати книгу» (з `useRecentWorks` для порожнього запиту — показує недавно додані книги). Тобто «Catalog search» і «домен "Книги" у Personal Search» — це буквально один і той самий SQL-метод (`WorkRepository.search`), викликаний з двох різних хуків/екранів. Немає окремого «Catalog-специфічного» SQL.

## 19.3 Journal Search (Фаза 7 ТЗ) — окремий, явно задокументований FTS5-аналіз

Найважливіша знахідка розділу: у самому коді є **розлогий, явний коментар-обґрунтування**, чому FTS5 свідомо не впроваджено, написаний саме тому, що ТЗ прямо вимагало спочатку перевірити доцільність FTS5 (`JournalRepository.ts:345-364`):

> «ФАЗА 7 (JOURNAL SEARCH) — рішення щодо FTS5, як вимагає ТЗ ("спочатку перевір розмір поточної моделі даних… не вводь FTS тільки тому, що він існує")… Причини: (1) `LIKE '%…%'` з провідним wildcard ніколи не може використати B-tree індекс НАВІТЬ якби такий індекс існував… (2) FTS5 у expo-sqlite вимагав би: окремої віртуальної таблиці, тригерів синхронізації… і — найважливіше — підтвердження, що конкретний SQLite-білд у поточній версії `expo-sqlite` (SDK 57) стабільно вмикає розширення FTS5 на ОБОХ платформах (iOS/Android), що **не перевірено в цьому середовищі** (немає локального `device_bash`/emulator для built-перевірки); (3) головне — продуктивність: повний table scan `LIKE`… практично завжди <50мс навіть на 10 000+ рядків…»

Це чесно й прямо визнає: рішення «LIKE достатньо швидкий на 10к+ рядків» — це **HYPOTHESIS**, не виміряний факт (сам коментар каже «не перевірено в цьому середовищі», відсутній emulator/device для профілювання). Ніде в репозиторії немає ні бенчмарк-тесту, ні вимірювань `EXPLAIN QUERY PLAN`, ні реального профілювання на пристрої для журналу з великою кількістю записів. NOT VERIFIED — твердження «<50мс на 10 000+ рядків» ніде не підтверджене вимірюванням, лише інженерна оцінка в коментарі.

`JournalRepository.listFeedPage` (глобальна стрічка щоденника з фільтрами `query`/`reaction`/`workId`/`dateFrom`/`dateTo`, `JournalRepository.ts:366-487`) і `JournalRepository.listPage` (та сама логіка, звужена на одну книгу) реалізують текстовий пошук як `AND t.text LIKE ?` (нотатки) / `AND (t.text LIKE ? OR t.comment LIKE ?)` (цитати), у складі union-запиту `note` + `quote` з keyset-пагінацією (`created_at`/`id` курсор, `LIMIT limit + 1` — трюк «чи є ще сторінка» без окремого `COUNT`).

## 19.4 Зовнішній пошук метаданих (провайдери)

Ще один клас пошуку — жодного стосунку до SQLite взагалі:

- **GoogleBooksProvider** — офіційний REST API, `langRestrict=uk`; DEVICE VERIFIED (той єдиний легітимний для цього завдання випадок): `docs/BOOK_PROVIDERS.md:41-42` прямо стверджує «анонімні запити… реально ловлять HTTP 429 (**підтверджено на реальному пристрої**)», і `useProviderSearch.ts:14-17` кодує це рішення — React Query `signal` скасовує застарілий запит під час набору тексту, «реальна знахідка з тестування на пристрої: швидкий набір з паузами між словами легко ловить HTTP 429».
- **ISBNdbProvider** — платний, проксійований через Supabase Edge Function (`supabase/functions/isbndb-proxy/`), ключ ніколи не в клієнті з V1.5 Фази 1.1.
- **SharedCatalogProvider** (`src/data/providers/SharedCatalogProvider.ts`) — не SQLite і не FTS5, а Postgres RPC `catalog_search` у власному Supabase-проєкті користувача (`supabase/schema.sql:78-96`):
  ```sql
  where length(trim(p_query)) >= 3
    and (b.title ilike '%' || p_query || '%' or b.title % p_query)
  order by added_count desc, similarity(b.title, p_query) desc, b.last_seen_at desc
  ```
  Це **`ILIKE` + `pg_trgm` trigram similarity** (`%` оператор і `similarity()`) — фактично технічно сильніший за LIKE-пошук рушій (нечіткий пошук з trigram-індексом), ніж усе, що є локально в SQLite. Показова непослідовність: найпростіший (LIKE) підхід — саме там, де даних менше й вони належать одному користувачу (локальний SQLite), а більш «просунутий» пошук (trigram similarity) — у хмарному компоненті, спільному для всіх користувачів, де обсяг даних і потреба в релевантності об'єктивно вищі. Це не помилка, а результат того, що Postgres/Supabase «безкоштовно» дає pg_trgm, а expo-sqlite не дає FTS5 без додаткової роботи — але це означає, що твердження «FTS5 не потрібен, бо обсяги малі» технічно не застосовується до хмарної частини так само, і там таки використали щось потужніше за голий LIKE.
- **CuratedCatalogProvider** — та сама Supabase-модель, лише окрема таблиця `curated_book` (read-only з клієнта).
- **ManualBookProvider** — не мережевий, завжди `isEnabled: true`, гарантований fallback.

Порядок провайдерів у пошуку — SharedCatalog → CuratedCatalog → GoogleBooks → ISBNdb (платний — лише коли безкоштовні джерела не дали результату, `useProviderSearch.ts` `options.enabled`, `app/(tabs)/search.tsx`). Кожен провайдер — окремий `useQuery` (окремі loading/error стани, «degradation-safe» — один провайдер, що впав/повільний, не ховає результат іншого).

Мовний фільтр (`ukrainianFilter.ts`, `filterUkrainianBooks`) застосовується в `select` React Query (не мутує кеш) — подвійна перевірка: мовна мітка провайдера **І** кирилиця в назві (документований реальний кейс: ISBNdb повернув `language: 'ukrainian'` з англійською назвою «IF WE WERE VILLAINS»).

## 19.5 Lore (персонажі) — пошуку **немає взагалі**

CODE VERIFIED: `LoreEntityRepository.ts` не має жодного методу `search`. Єдиний спосіб отримати список — `listByWorkId(db, workId)` (`LoreEntityRepository.ts:113`), який повертає **всіх** персонажів/лор-записів однієї книги без фільтра за текстом. Хук `useLoreEntities` (`src/features/lore/useLoreEntities.ts:20-30`) — пряма обгортка над цим методом, теж без параметра пошуку.

Екран `app/lore/[workId].tsx` фільтрує результат лише через `filterSpoilerSafeLoreEntities` (spoiler-safe режим — приховує записи, що з'явилися пізніше поточної сторінки читання), а не через текстовий пошук — там немає ні `TextInput`, ні клієнтської фільтрації за назвою. Оскільки лор скопований на одну книгу (`workId`), а не глобальний, кількість записів об'єктивно мала (персонажі однієї книги — зазвичай одиниці-десятки), тож відсутність пошуку тут імовірно не є практичною проблемою UX — але це **прогалина в Personal Search**: п'ять доменів (`books/notes/quotes/series/shelves`) покриті, лор — шостий потенційний домен — не покритий взагалі, і в коді/коментарях `usePersonalSearch.ts` немає жодного пояснення, чому лор свідомо виключено (коментар каже «п'ять доменів», без згадки лору як розглянутого й відкинутого варіанту). NOT VERIFIED, чи це свідоме рішення продукту, чи просте недогляд/забута фіча — коментарів-обґрунтувань, аналогічних до `WorkRepository`/`JournalRepository`, для цього немає.

## 19.6 HYPOTHESIS — коли LIKE стане відчутно повільним

Немає жодного автоматизованого бенчмарку в репозиторії (перевірено: жоден `*.test.ts` не вимірює час виконання пошукових запитів, лише коректність результату). Наведена нижче оцінка — HYPOTHESIS на основі загальних властивостей SQLite (не проведеного вимірювання):

- **Нотатки/цитати/книги (`WorkRepository.search`, `JournalRepository.searchFeed`)**: `LIKE '%…%'` з провідним `%` завжди робить повний скан таблиці (жоден B-tree індекс не застосовний до такого патерна). На сучасному мобільному SoC (iPhone/сучасний Android) сканування кількох тисяч коротких TEXT-рядків у вже відкритій, закешованій SQLite-БД — операція в пам'яті порядку одиниць-десятків мікросекунд на рядок. Орієнтовний поріг, де затримка стане відчутною користувачем (>100-150 мс, поріг сприйняття «миттєвості» UI) — імовірно **десятки тисяч рядків** (30 000–100 000) для однієї таблиці (`note`/`quote`/`work`) на середньому мобільному пристрої, за умови відсутності додаткового навантаження (JOIN до 3-4 таблиць у `searchFeed`/`listFeedPage`, як у Journal, зменшує цей поріг, бо кожен матч ще й JOIN-иться до `user_book→edition→work`).
- Оскільки в реальному використанні один користувач Полиці навряд чи матиме десятки тисяч нотаток/цитат/книг (типова особиста бібліотека — сотні-тисячі позицій, `docs`-коментарі самі орієнтуються на «10 000+» як стрес-кейс), поточний `LIKE`-підхід імовірно залишиться прийнятним для переважної більшості користувачів навіть за роки використання. Але це **не перевірено на реальному пристрої з реальним обсягом даних** — жодних `DEVICE VERIFIED` доказів для цього твердження немає, лише інженерна оцінка (в коді й у цьому звіті).
- **Series/Shelf search** — обсяги на порядки менші (десятки записів на користувача), поріг проблеми там практично недосяжний у звичайному використанні.
- Якщо колись `note`/`quote` зростуть до порядку 50 000+ на користувача (нетиповий, але не неможливий сценарій за роки активного щоденника), `searchFeed`/`listFeedPage` з `query`-фільтром і множинними JOIN — перший кандидат на відчутне сповільнення, оскільки кожен UNION-branch там гортає JOIN до трьох таблиць (`user_book`→`edition`→`work`) на кожен рядок-кандидат перед фільтрацією LIKE (індекс на FK є, але сам текстовий фільтр — все одно повний скан гілки).

---

# Розділ 20: Activity History («Моя історія»)

## 20.1 Архітектура: derived view, НЕ audit-log

CODE VERIFIED — це однозначно **derived/похідна модель**, а не окрема таблиця-журнал подій. Прямий коментар у коді (`ActivityHistoryRepository.ts:43-51`):

> «ТЗ Фази 12 (READING ACTIVITY HISTORY) — «Якщо timeline можна derived з існуючих timestamped tables — використовуй derived model»: саме це тут і зроблено. **Жодної нової таблиці, жодного write-шляху** — один SQL-запит, що об'єднує (UNION ALL) вісім джерел…»

Підтверджено структурно:
- У жодній міграції (`001`…`018`) немає таблиці на кшталт `activity_log`/`audit_event`.
- `ActivityHistoryRepository` (`ActivityHistoryRepository.ts`) має рівно один публічний метод — `listRecent` — і жодного методу запису (`create`/`insert`/`log`). Сам коментар це явно підтверджує: «тут немає жодного методу запису — сама природа "похідної" моделі виключає write-шлях (кожна подія й так уже записана своїм "рідним" репозиторієм)».
- Тип `ActivityEvent` (`src/types/activityEvent.ts:23-30`) теж явно документований як похідний: «Похідна (derived) модель — НЕ окрема event-sourcing таблиця (пряма вимога ТЗ: «не створюй нову event-sourcing architecture тільки заради цього»)».

## 20.2 Точна реалізація — один SQL, UNION ALL по восьми джерелах

`ActivityHistoryRepository.listRecent` (`ActivityHistoryRepository.ts:61-138`) — один запит з восьми `SELECT … UNION ALL SELECT …` гілок, спільне `ORDER BY occurred_at DESC LIMIT ?` **після** об'єднання (не по кожній гілці окремо — явно перевірено окремим тестом, див. 20.4):

| Тип події | Джерело (timestamp-колонка) | Синтетичний чи власний `id` |
|---|---|---|
| `session_completed` | `reading_session.ended_at` (лише завершені, `deleted_at IS NULL`) | власний `rs.id` |
| `book_started` | `user_book.started_at` | синтетичний `${ub.id}:started` |
| `book_finished` | `user_book.finished_at` | синтетичний `${ub.id}:finished` |
| `book_added` | `user_book.added_at` (завжди, бо в кожної книги є ця дата) | синтетичний `${ub.id}:added` |
| `rating_added` | `rating.created_at` | власний `r.id` |
| `journal_entry` | `note.created_at` (`deleted_at IS NULL`) | власний `n.id` |
| `quote` | `quote.created_at` (`deleted_at IS NULL`) | власний `q.id` |
| `shelf_addition` | `shelf_book.added_at` | синтетичний `${shelfId}:${userBookId}` |

Усі вісім гілок JOIN-яться через спільний `BOOK_JOIN` (`edition e ON e.id = ub.edition_id JOIN work w ON w.id = e.work_id`) і фільтруються спільною умовою `BOOK_ALIVE = ub.deleted_at IS NULL AND w.deleted_at IS NULL AND e.deleted_at IS NULL` (`ActivityHistoryRepository.ts:38-41`).

**Задокументована побічна дія (тестами покрита, не помилка, але важливий продуктовий наслідок):** оскільки `BOOK_ALIVE` застосовується до **всіх** восьми гілок, м'яке видалення книги з бібліотеки (`user_book.deleted_at`) миттєво й повністю прибирає **всю** її минулу активність зі стрічки історії — не лише сам факт «додано»/«видалено», а й усі сесії читання, оцінки, нотатки й цитати цієї книги. Це прямо перевірено тестом (`ActivityHistoryRepository.test.ts:197-205`, `'м'яко видалена книга зникає з усіх своїх подій одразу'`) — AUTOMATED TEST VERIFIED, поведінка навмисна й задокументована, але потенційно несподівана для користувача: видалення книги з бібліотеки ретроактивно «стирає» слід її прочитання з персональної історії активності, без попередження про це на екрані видалення книги (не перевірено в цьому аудиті, чи екран видалення книги взагалі згадує наслідок для «Моєї історії» — поза межами файлів, переглянутих для цього розділу).

## 20.3 Типи подій, порядок, фільтрація, ліміт

- Рівно **вісім** типів подій (`ActivityEventTypeSchema`, `src/types/activityEvent.ts:14-23`) — точно відповідають переліку в ТЗ Фази 12 (коментар: «список подій навмисно фіксований і буквально повторює ТЗ»).
- **Немає жодної фільтрації в UI** (`app/history.tsx`) — ні за типом події, ні за книгою, ні за датою (на відміну від Journal Search, де є `type`/`reaction`/`workId`/`dateFrom`/`dateTo`). Це принципова відмінність від Розділу 19: Journal search — параметризований і фільтрований; Activity History — суцільна нефільтрована стрічка.
- **Групування по днях** — чиста JS-функція `groupActivityEventsByDate` (`src/lib/activityHistory.ts:21-42`), сортує вхідний масив за `occurredAt` спадаюче (незалежно від порядку, в якому дані прийшли з SQL — тобто не покладається на SQL `ORDER BY`, повторно сортує в JS), групує в `Map` по `yyyy-MM-dd`, повертає масив секцій у форматі, прямо сумісному з `SectionList` (`{ data: ActivityEvent[] }`, під вимогу React Native `SectionListData`).
- **Рендер** — `SectionList` (`app/history.tsx:182-206`) із заголовками секцій «Сьогодні»/«Вчора»/дата. Єдина інтерактивна дія рядка — перехід на сторінку книги; немає редагування/видалення подій із цього екрана (сам екран — «read-only», підтверджено коментарем `app/history.tsx:118-129`).

## 20.4 Пагінація — відсутня; жорсткий ліміт 300

CODE VERIFIED: `listRecent(db, limit = 300)` (`ActivityHistoryRepository.ts:61`) — **єдиний, фіксований** ліміт за замовчуванням, застосований після спільного сортування всіх восьми джерел (`LIMIT ?` в кінці об'єднаного запиту). Хук `useActivityHistory` (`useActivityHistory.ts:14-22`) викликає `listRecent` **без параметрів** — тобто завжди рівно 300 подій максимум, без можливості для UI запросити більше.

- **Немає keyset/offset-пагінації**, немає `cursor`, немає `onEndReached`/«завантажити ще» в `SectionList` (перевірено — компонент `app/history.tsx:182-206` не передає `onEndReached`/`onEndReachedThreshold`).
- **Немає індикатора «показано не все»** — якщо в користувача більш ніж 300 подій активності (сумарно по всіх восьми джерелах — досягається досить швидко: наприклад, 50 книг × (додано + почато + прочитано + оцінка) = 200 подій, плюс кожна сесія читання, кожна нотатка й кожна цитата — 300 легко перевищується для активного користувача за кілька місяців), стрічка **мовчки обрізається** на найновіших 300 подіях, без повідомлення «є ще старіші події» чи посилання на повний перегляд. Це CODE VERIFIED факт (сам код лімітує без прапорця `hasMore`/`nextCursor`, на відміну від `JournalRepository.listPage`/`listFeedPage`, де саме такий прапорець (`nextCursor`) свідомо реалізовано для порівнянної за формою стрічки). Це виглядає як пряма непослідовність продуктового підходу в межах ОДНІЄЇ фази: Journal Feed (той самий «стрічка з восьми... точніше двох джерел, змішаних по книгах») отримав повноцінну курсорну пагінацію, а Activity History (структурно ще складніша — вісім джерел) — ні, попри те що обидві фічі написані в межах одного застосунку з тим самим підходом «нескінченна стрічка».

## 20.5 Продуктивність — HYPOTHESIS

Немає жодного тесту продуктивності чи виміряного профілювання цього запиту (перевірено — `ActivityHistoryRepository.test.ts` тестує лише коректність, не час виконання). HYPOTHESIS-оцінка на основі структури запиту:

- Запит — вісім `SELECT` з JOIN по 2-3 таблицях кожен, об'єднаних `UNION ALL`, потім спільне `ORDER BY … LIMIT 300` **без обмеження на кожну гілку окремо** — тобто SQLite повинен матеріалізувати **весь** результат кожної з восьми гілок (наприклад, УСІ `book_added`-кандидати — рівно всі `user_book`, бо там немає `WHERE`, окрім `BOOK_ALIVE`), відсортувати об'єднаний набір і лише тоді обрізати до 300. Для користувача з, скажімо, 500 книгами в бібліотеці й 5 000 нотатками/цитатами загалом, це означає повне матеріалізування ~500 (book_added) + 500 (started, якщо всі почато) + … + 5 000 (notes+quotes) ≈ кілька тисяч проміжних рядків для сортування, перш ніж узяти перші 300. Індекси на FK-колонках (`idx_session_user_book`, `idx_note_user_book`, `idx_quote_user_book`, `idx_user_book_status` тощо, `001_base_schema.ts`) прискорюють самі JOIN, але не рятують від матеріалізації всього об'єднаного набору перед `ORDER BY`+`LIMIT`.
- HYPOTHESIS: для типового користувача (сотні книг, тисячі нотаток/цитат) цей запит імовірно виконується в межах прийнятного часу (низькі-середні десятки мілісекунд) на сучасному мобільному пристрої, аналогічно до оцінки в 19.6 — але це **не перевірено** (немає бенчмарка, немає `EXPLAIN QUERY PLAN` аналізу в репозиторії, немає DEVICE VERIFIED доказу). На відміну від Journal Search, де сам код явно й свідомо обговорює цей компроміс (коментар `JournalRepository.ts:345-364`), для Activity History **немає аналогічного коментаря-обґрунтування продуктивності** взагалі — рішення «один запит, 300 lim, без пагінації» задокументоване як реалізація вимоги ТЗ, але не як свідомий аналіз масштабованості. Це прогалина: фіча, структурно найважча серед усіх переглянутих (8-way UNION з JOIN), має найменше документованого обґрунтування продуктивності серед усіх.

## 20.6 Підсумок Розділу 20

- **Derived view, не audit-log** — CODE VERIFIED, підтверджено і кодом, і явними коментарями, і typedoc.
- Вісім типів подій, усі виведені надійно з наявних timestamped-колонок — CODE VERIFIED, AUTOMATED TEST VERIFIED (`ActivityHistoryRepository.test.ts`, 6 тестів, включно з edge-case м'якого видалення).
- Групування по днях — чиста, окремо протестована функція (файл тесту `src/lib/activityHistory.test.ts` існує, хоч детально не переглядався для цього розділу — CODE VERIFIED сама наявність файлу).
- **Немає фільтрації** в UI (тип/книга/дата) — на відміну від Journal Search.
- **Немає пагінації**, жорсткий `LIMIT 300` без індикації «є ще» — потенційна прогалина для дуже активних довготривалих користувачів, і пряма непослідовність порівняно з Journal Feed у тому самому застосунку, де курсорна пагінація реалізована.
- Продуктивність — HYPOTHESIS, не виміряна; сам запит структурно найважчий серед усіх пошуково-стрічкових фіч проєкту (8-way UNION), але з найменшим документованим обґрунтуванням продуктивності.
# Група 7 — Security, Privacy, Supabase (Розділи 26–28)

Аудит проведено на застейджений код `/mnt/user-data/uploads/polytsya-m11/`. Стандарт доказів:
CODE VERIFIED (з точним шляхом/рядком), AUTOMATED TEST VERIFIED, CI VERIFIED, NOT VERIFIED,
HYPOTHESIS. Жодних реальних секретів у застейджених файлах не знайдено (`.env` відсутній
навмисно) — там, де в файлах згадуються ключі, наведено лише факт наявності/відсутності, не
значення.

---

## Розділ 26 — Security: Edge Functions, EXPO_PUBLIC_* змінні, аудит зовнішніх викликів

### 26.1 Огляд архітектури обох функцій

Дві Supabase Edge Functions (Deno):

- `supabase/functions/isbndb-proxy/index.ts` — проксі до платного `api2.isbndb.com`, приховує
  `ISBNDB_API_KEY`.
- `supabase/functions/cover-upload/index.ts` — проксі запису у Storage bucket `book-covers`,
  приховує `service_role` ключ і забороняє прямий anon-запис.

Обидві використовують спільні модулі `supabase/functions/_shared/cors.ts` і
`supabase/functions/_shared/rateLimit.ts`. CODE VERIFIED.

### 26.2 CORS

`supabase/functions/_shared/cors.ts:5-9`:

```
'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
'Access-Control-Allow-Methods': 'POST, OPTIONS',
```

CODE VERIFIED: origin НЕ обмежено — `*` для обох функцій (обидві імпортують той самий
`CORS_HEADERS`). Коментар у файлі (рядки 1-4) пояснює це свідомим рішенням: мобільний RN
`fetch` CORS-preflight не робить узагалі (CORS — суто браузерний механізм), тож обмеження
origin тут не дало б жодного реального захисту для мобільного клієнта — воно стосувалося б
лише гіпотетичного майбутнього веб-клієнта (Dashboard власника продукту). **Оцінка:** прийнятний
ризик для поточного стану продукту (мобільний-only), але сам захист (rate limit, валідація
вхідних даних) саме тому і несе всю вагу — CORS тут не є лінією захисту, лише формальність.

### 26.3 Автентифікація/авторизація виклику функції

- **isbndb-proxy**: коментар `index.ts:13-19` стверджує, що Supabase залишає стандартну
  `verify_jwt = true` для функції, і клієнт передає `apikey`/`Authorization: Bearer <anon-key>`
  (той самий заголовок, що й для RPC-клієнтів). Це підтверджено інструкцією в
  `supabase/functions/isbndb-proxy/README.md:37-40` і `cover-upload/README.md:32`: "лишай
  `verify_jwt = true` за замовчуванням, **не додавай `--no-verify-jwt`**".
  **Важливо (NOT VERIFIED в репозиторії):** `verify_jwt` — це *deploy-time* прапорець
  Supabase CLI/Dashboard, не частина коду в git. У застейджених файлах немає
  `supabase/config.toml` з явним `[functions.isbndb-proxy] verify_jwt = true` (перевірено:
  `find supabase -type f` не показав такого файлу). Тобто цей захист існує лише як
  **документована інструкція для власника продукту**, не як щось, що код чи CI можуть
  перевірити/гарантувати. Якщо власник продукту колись redeploy'ить із `--no-verify-jwt`
  (помилково чи навмисно) — обидві функції стануть повністю анонімно викликаними, і жодного
  автоматичного тесту/CI-кроку, який би це зловив, немає (див. 26.6).
- Навіть за увімкненого `verify_jwt`, це **не автентифікація користувача** — перевіряється
  лише володіння anon-ключем, який навмисно публічний і вбудований у кожен клієнтський білд
  (тобто фактично будь-хто, хто розпакує APK/IPA, отримує цей ключ і проходить цю перевірку).
  Це чесно визнано в самому коментарі (`isbndb-proxy/index.ts:16-19`): "Це не 'авторизація' в
  сенсі користувача... але це відсікає найпростіше сканування інтернету ботами без жодного
  Supabase-ключа". **Висновок:** обидві функції де-факто анонімно викликаються будь-ким, хто
  має anon-ключ (тобто будь-ким, хто встановив застосунок) — реального user-level
  authorization немає (немає Supabase Auth у продукті взагалі, задокументовано як свідома межа
  milestone'у).

### 26.4 Rate limiting

`supabase/functions/_shared/rateLimit.ts` — спільний механізм, CODE VERIFIED:

- `getClientIp` (рядки 16-20): бере перший запис `x-forwarded-for` (проставляється Supabase
  edge-проксі платформи, не клієнтом напряму) або `'unknown'`.
- `checkRateLimit`/`checkRateLimitWindows` (29-75): викликає Postgres RPC
  `edge_rate_limit_check` через `service_role` ключ, durable-лічильник у таблиці
  `edge_rate_limit` (`supabase/schema.sql:451-491`), atomic fixed-window UPSERT з блокуванням
  рядка (коректно під конкуренцією).
- **Fail-open**: за будь-якої помилки виклику RPC (мережа/БД недоступні) функція повертає
  `true` (дозволити) — рядки 49, 53, 67. Свідомий компроміс, задокументований у коментарі
  (22-27): "повна відмова в сервісі ВСІМ користувачам... гірший наслідок, ніж тимчасова
  відсутність rate limit". **Оцінка:** прийнятний trade-off для non-critical проксі, але varto
  зафіксувати як залишковий ризик — за тривалого збою БД rate limit фактично зникає, і про це
  ніде немає моніторингу/алерту в репозиторії (NOT VERIFIED — жодного alerting-механізму не
  знайдено).

Конкретні ліміти (по IP, два вікна одночасно — "AND", обидва мають дозволити):

| Функція | burst | sustained |
|---|---|---|
| `isbndb-proxy` (`index.ts:49-52`) | 20 запитів / 60с | 300 запитів / 86400с (доба) |
| `cover-upload` (`index.ts:49-53`) | 10 запитів / 60с | 100 запитів / 86400с (доба) |

Bucket-ключ — `${bucketPrefix}:${name}` де `bucketPrefix` = `isbndb-proxy:${clientIp}` /
`cover-upload:${clientIp}` (`isbndb-proxy/index.ts:237`, `cover-upload/index.ts:142`) —
ізольовано за функцією та за IP.

**Задокументований залишковий ризик** (коментар `isbndb-proxy/index.ts:28-32`, чесно визнаний
самим кодом): IP — недосконалий ідентифікатор. Спільний NAT/мобільний оператор об'єднує багатьох
реальних користувачів під одним IP (може блокувати легітимних користувачів за чужий трафік);
VPN/проксі дають зловмиснику новий IP на вимогу (rate limit тривіально обходиться зміною IP).
Справжній per-user ліміт вимагає Supabase Auth, якого немає. **Оцінка:** чесно і явно
задокументований, не прихований ризик — це "найкращий pre-auth варіант", не панацея.

Таблиця `edge_rate_limit` не має TTL/чистки — рядки не видаляються автоматично
(`schema.sql:446-450`, задокументовано як прийнятне для поточного масштабу, з готовим SQL для
майбутнього прибирання).

### 26.5 Валідація вхідних даних

**isbndb-proxy** (`index.ts`):
- `op` обмежено `'search' | 'lookup'` (232).
- `search`: довжина запиту 2-200 символів (245-254, `MIN_QUERY_LENGTH`/`MAX_QUERY_LENGTH`).
- `lookup`: ISBN перевіряється контрольною цифрою через `isValidIsbn` (`isbn.ts`, повна
  реалізація ISO 2108 ISBN-10/13 — навмисна часткова копія `src/lib/isbn.ts`, задокументовано
  причина: Deno-рантайм не бачить `src/` мобільного застосунку).
- Захист від "response size bomb" з боку самого ISBNdb: `MAX_UPSTREAM_BODY_BYTES = 2_000_000`
  (44), реальний підрахунок байтів під час стріму (`readBodyWithLimit`, 129-148), не лише
  довіра `Content-Length`.
- Результат обрізається до `MAX_RESULTS = 40` (47, 268).
- Upstream timeout 8с (`UPSTREAM_TIMEOUT_MS`, 41) з `AbortController`.

**cover-upload** (`index.ts`):
- `Content-Type` перевіряється, що починається з `image/` (147-150) — **лише перша, слабка**
  перевірка (легко підмінити заголовок).
- Реальна перевірка типу файлу за magic bytes (JPEG `FF D8 FF`, PNG 8-байтова сигнатура) —
  `sniffImageType`, 82-91, застосовується ПІСЛЯ прочитання тіла (160-163) — це справжня, не
  формальна перевірка (заголовок Content-Type є лише підказкою до фактичного upload у
  Storage, а не джерелом істини).
- Розмір тіла обмежено `MAX_UPLOAD_BYTES = 5_242_880` (46, той самий ліміт, що
  `file_size_limit` bucket'а в `schema.sql:252`) з реальним підрахунком байтів під час стріму
  (`readRequestBodyWithLimit`, 96-124), не лише `Content-Length`.
- Шлях об'єкта в bucket генерується **виключно сервером** (`crypto.randomUUID()`, 168) —
  жодного клієнтського рядка (ні `editionId`, ні timestamp) не бере участі в побудові шляху,
  що архітектурно унеможливлює path traversal (не перевіркою, а конструкцією — немає що
  traversal'ити). Це виправлення реальної попередньої вразливості 🟡 (описаної в самому
  коментарі файлу, 1-37): раніше клієнт сам будував шлях і писав анонімним anon-ключем напряму
  в Storage без жодного ліміту.
- Upstream timeout 10с (47, 170-171).

**Оцінка:** валідація вхідних даних для обох функцій — вища за типовий baseline: перевірка за
реальним вмістом (magic bytes), а не лише декларованими заголовками; жорсткі межі розміру з
реальним підрахунком байтів, а не довіра до заголовків. Це не formal/"security theatre" —
реальна, продумана перевірка.

### 26.6 Обробка помилок і витік внутрішніх деталей

Обидві функції повертають структуровані JSON-помилки `{ error, code }` з типізованим
`ErrorCode` union (isbndb-proxy: 54-61, cover-upload: 56-64) — це добра практика.

Однак є конкретні місця, де в тіло помилки **клієнту** (не лише в лог) потрапляють шматки
відповіді від upstream-сервісу:

- `cover-upload/index.ts:189-191`:
  ```ts
  const bodyText = await uploadResponse.text().catch(() => '');
  return errorResponse(502, 'upstream_error', `Storage HTTP ${uploadResponse.status}: ${bodyText.slice(0, 200)}`);
  ```
  До 200 символів "сирого" тексту помилки від Supabase Storage йде прямо в HTTP-відповідь
  клієнту. Storage — власна інфраструктура (не витік стороннього API), і це, найімовірніше,
  безпечний технічний текст (наприклад, "Duplicate" чи "Payload too large" від самого
  Storage), а не стек/креденшели — але це не перевірено (NOT VERIFIED, що саме там могло б
  бути за різних збоїв Storage). **Оцінка: незначний (minor) ризик** — вартий приведення до
  того ж рівня, що вже застосовано в `isbndb-proxy`, де деталі upstream ідуть лише в
  `console.error`/`console.log` (приватні логи Supabase, не в відповідь клієнту), а клієнту —
  узагальнений код (`'upstream_error'`, `'ISBNdb HTTP ${status}'` без тіла відповіді ISBNdb,
  рядки 180-181 vs 259/281).
- `isbndb-proxy/index.ts:174-192`: детальні `console.log`/`console.error` з тілом відповіді
  ISBNdb (до 500 символів) — коментар (176-179, 189-192) явно стверджує, що це приватні логи
  Supabase-проєкту, не повертаються клієнту. CODE VERIFIED — `fetchIsbndb` повертає структуру
  `{ ok: false, code, detail }`, і в HTTP-відповідь клієнту йде лише `result.detail`, яке для
  цього шляху — короткий рядок `ISBNdb HTTP ${status}` (181), не сире тіло. Це коректно.

### 26.7 Тестове покриття Edge Functions (test coverage gap)

`find supabase -iname "*test*"` і пошук `*.test.*` за ключовими словами `isbndb|cover-upload|
rateLimit|cors` у всьому репозиторії — **нуль файлів знайдено**. CI (`.github/workflows/
ci.yml`) виконує лише `npm run typecheck`, `npm run lint`, `npm test` (Jest, Node-рантайм) і
`expo-doctor` (advisory) — жодного кроку `deno test` чи еквіваленту для коду в
`supabase/functions/` немає взагалі. **NOT VERIFIED / реальний пробіл**: rate-limit логіка,
magic-byte sniffing, ISBN-валідація в проксі, CORS-заголовки — жодна з них не має
автоматизованого тесту. Уся впевненість у коректній поведінці спирається на ручний
рев'ю коду (те, що зараз робить цей аудит) і на `curl`-перевірки з README (79-90 в
`isbndb-proxy/README.md`, 54-67 в `cover-upload/README.md`), які є одноразовими ручними
кроками деплою, не частиною CI.

### 26.8 Усі `EXPO_PUBLIC_*` змінні в клієнтському коді

Пошук `process.env.EXPO_PUBLIC_` по всьому `src/` і `app.config.ts` (`Grep`, вичерпний).
Знайдено 4 унікальні змінні:

| Змінна | Де використовується (файл:рядок) | Що це | Оцінка ризику |
|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `app.config.ts:133`, `curatedCatalogClient.ts:16`, `coverStorageClient.ts:17`, `isbndbProxyClient.ts:25`, `sharedCatalogClient.ts:27` | URL проєкту Supabase | **Прийнятний** — Supabase URL за дизайном публічний, не секрет. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ті самі 5 файлів (`app.config.ts:134`, і `...Client.ts` по одному входженню кожен) | Supabase anon (публічний) ключ | **Прийнятний ЗА УМОВИ коректного RLS** — перевірено в Розділі 28: усі таблиці мають RLS увімкнено без жодної policy + явний `revoke all... from anon, authenticated` (deny-all), єдиний доступ — через `SECURITY DEFINER` RPC з вузьким контрактом. CODE VERIFIED коректно налаштовано (`schema.sql`, детальніше нижче). |
| `EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY` | `GoogleBooksProvider.ts:16` | Ключ Google Books API (Google Cloud Console) | **Умовно прийнятний, але НЕ той самий рівень захисту, що anon-ключ.** Це звичайний Google Cloud API-ключ, вбудований прямо в клієнтський бандл — будь-хто, хто розпаковує APK/IPA, може його прочитати й використати для власних викликів Google Books API під квотою власника продукту. `.env.example:14-18` описує його як "безкоштовний... на порядки більша квота" — сам ключ не платний за дизайном Google Books API (Books API безкоштовний), і сервіс без нього все одно працює (з нижчою квотою анонімних запитів), тож фінансового ризику як з ISBNdb немає. Проте: чи обмежений цей конкретний ключ (application/referrer restriction чи API restriction) у самому Google Cloud Console — **NOT VERIFIED**, поза межами репозиторію (це налаштування живе лише в консолі власника продукту, не в коді). Без таких обмежень зловмисник, що видобув ключ з білда, міг би вичерпати денну квоту власника продукту (DoS для власних користувачів застосунку) — на відміну від ISBNdb, тут немає серверного проксі/rate limit для цього шляху взагалі. **Це найслабша ланка серед EXPO_PUBLIC_* змінних** — не тому, що ключ платний, а тому, що не проксійований і не обмежений rate limit'ом на рівні застосунку (лише на рівні самого Google API, поза контролем цього репозиторію). |
| `EXPO_PUBLIC_ISBNDB_PROXY_ENABLED` | `isbndbProxyClient.ts:29` | Прапорець `"0"/"1"`, вмикає ISBNdb-проксі | **Прийнятний** — не секрет за дизайном (сам код і коментар це явно стверджують, `isbndbProxyClient.ts:18-19`), просто boolean-перемикач. |

**Ключова перевірка (те, що прямо просив аудит): чи ISBNdb-ключ прямо в клієнті?** НІ.
Вичерпний grep `EXPO_PUBLIC_` по `src/` не знаходить жодного `EXPO_PUBLIC_ISBNDB_API_KEY` (лише
згадки в коментарях про те, що цю змінну *більше не читає* код — `ISBNdbProvider.ts:20`,
`isbndbProxyClient.ts:22`, `.env.example:24-26`, `isbndb-proxy/README.md:92-98` — усі
описують міграцію ГЕТЬ від клієнтського ключа). Сам платний ключ живе лише як
`Deno.env.get('ISBNDB_API_KEY')` на сервері (`isbndb-proxy/index.ts:39`), поставлений через
`supabase secrets set` (README.md:44-49) — **CODE VERIFIED, коректно архітектуровано**: платний
API-ключ проксійований, ніколи не в клієнтському бандлі. Це саме той фікс, що описаний у
коментарях як "POLYTSIA V1.5 Фаза 1.1" для знахідки 🔴 попереднього аудиту.

**Google Books ключ, натомість, лишається прямо в клієнті** (таблиця вище) — цей факт
безпосередньо суперечив би формулюванню "усі платні/квотовані ключі проксійовано", якщо таке
твердження колись прозвучить у маркетингових матеріалах цього milestone'у: ISBNdb (платний) —
так, проксійовано; Google Books (безкоштовний, але квотований) — ні, лишається в клієнті.
Продукт свідомо це задокументував (`.env.example`), не приховав — але сам факт залишається
вартим фіксації як асиметрія в моделі захисту.

`SUPABASE_SERVICE_ROLE_KEY` (обходить RLS повністю) — CODE VERIFIED ніде не має префіксу
`EXPO_PUBLIC_`, живе лише як Supabase-автопроставлена змінна середовища всередині Edge
Functions (`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`, обидві функції) і в окремому
`.env.admin` (в `.gitignore`, за `.env.admin.example`) для адмінського Node-скрипта
`scripts/sync-curated-books.js` — НІКОЛИ в клієнтському коді. CODE VERIFIED коректно.

---

## Розділ 27 — Privacy: карта класифікації даних

Методологія: для кожної категорії даних перевірено (а) де вона зберігається локально
(`src/data/db/migrations/001_base_schema.ts` та інші міграції) і (б) чи існує **будь-який**
клієнтський код, що передає цю категорію на Supabase — вичерпний `Grep` для кожної
feature-директорії (`journal`, `quotes`, `lore`, `notes`) за `SharedCatalogClient`/
`CuratedCatalogClient` дав **нуль збігів** у всіх трьох випадках. Єдині файли, що імпортують
`SharedCatalogClient`, — `src/data/remote/catalogSync.ts`, `src/features/trends/
useTrendingBooks.ts`, `src/features/library/useCreateBookDraft.ts`,
`src/features/library/useAddToLibrary.ts` — усі стосуються метаданих книги, не особистого
контенту.

| Категорія даних | Локальна таблиця (SQLite) | Йде на Supabase? | Що саме, якщо так | Доказ |
|---|---|---|---|---|
| Книги в бібліотеці (назва, автори, ISBN, обкладинка тощо) | `work`, `edition`, `user_book`, `owned_book`, `shelf` (`001_base_schema.ts`) | **Так, вибірково** | Лише метадані книги (title, authors, isbn13/10, publisher, publicationYear, pageCount, language, description, coverUrl, source) — ЛИШЕ якщо книгу знайдено через `google_books`/`open_library`/`isbndb` (НЕ `manual`), і ЛИШЕ ПІСЛЯ того, як користувач сам зберіг книгу | `catalogSync.ts:57,63-83` (`PUBLISHABLE_SOURCES`, `publishToSharedCatalog`) |
| Статус читання/полиця книги (читаю/прочитано/TBR) | `user_book`, `shelf_book` | **Ні** (окрім самого факту "цей device_id додав книгу собі" — див. рядок device_id нижче) | — | Немає жодного виклику `SharedCatalogClient`/`CuratedCatalogClient` з `useUpdateReadingStatus` чи подібних хуків (не знайдено при пошуку) |
| Нотатки (`note`) | `note` (`001_base_schema.ts:238-254`) | **Ні** | — | `Grep` "SharedCatalogClient\|CuratedCatalogClient" у `src/features/journal` → 0 збігів |
| Цитати (`quote`) | `quote` (`001_base_schema.ts:254-269`) | **Ні** | — | `Grep` у `src/features/quotes` → 0 збігів |
| Персонажі/lore (`lore_entity`) | `015_lore_entity.ts` | **Ні** | — | `Grep` у `src/features/lore` → 0 збігів |
| Оцінки (`rating`) | `rating` (`001_base_schema.ts:269-280`) | **Ні** | — | Не входить у жодне поле `CatalogUpsertInput`/`CoverSyncInput` (`sharedCatalogClient.ts:36-68`) |
| Прогрес читання, сесії читання (`reading_session`, `reading_progress`) | `001_base_schema.ts:206-238` | **Ні** | — | Не входить у жоден remote-клієнт |
| `device_id` | `expo-secure-store`, ключ `polytsya_device_id` (`deviceId.ts:7,22-25`) | **Так** | Анонімний, випадковий UUID пристрою — надсилається в `catalog_mark_added`/`catalog_mark_removed` RPC як параметр `p_device_id`, ЩОБ порахувати кількість *унікальних пристроїв*, що додали книгу (`added_count`); НЕ прив'язаний до жодного профілю/акаунту (акаунтів немає взагалі) | `catalogSync.ts:88-99`, `schema.sql:56-58` |
| Власне фото обкладинки книги (камера/галерея користувача) | Локальний `file://` URI в `edition`/related | **Так, стає публічним** | Байти фото завантажуються через `cover-upload` Edge Function у **публічний** Storage bucket (`public: true`, `schema.sql:251-256`) → публічний URL реєструється в спільному каталозі (`catalog_upsert_book` з `sourceType: 'manual'`, якщо книги там ще немає) | `catalogSync.ts:114-160` (`publishCoverToSharedCatalog`), `coverStorageClient.ts:43-83` |
| Пошуковий запит (текст, який людина вводить у пошук книги) | — (ефемерний) | **Так** | Вільний текст пошуку йде: (а) у Google Books API напряму (сторонній сервіс, `GoogleBooksProvider.ts`), (б) у ISBNdb через власний проксі (`isbndb-proxy`, `op: 'search'`), (в) у власний Supabase (`catalog_search`/`curated_book_search`, `p_query`) | `sharedCatalogClient.ts:107-110`, `curatedCatalogClient.ts:72-75` |
| `app_settings` (тема, налаштування UI) | `app_settings` (`001_base_schema.ts:340+`) | **Ні** | — | Не пов'язано з жодним remote-клієнтом |

### 27.1 Критична перевірка: чи можуть нотатки/цитати з щоденника потрапити в спільний каталог?

**НІ — CODE VERIFIED негативно.** `src/data/remote/sharedCatalogClient.ts` (`CatalogUpsertInput`,
рядки 54-68) і `src/data/remote/curatedCatalogClient.ts` мають строго типізовані інтерфейси
запитів, жоден з яких не містить поля на кшталт `note`/`quote`/`text`/`content` — лише
бібліографічні поля книги (title, authors, isbn, publisher, year, pageCount, language,
description книги *від провайдера*, coverUrl, source). `curated_book` (таблиця-джерело
"Що почитати завтра?") взагалі не приймає жодного клієнтського запису — немає жодної upsert
RPC для неї (`schema.sql:311-317`, явно задокументовано: єдиний спосіб запису — окремий
адмінський скрипт із `service_role`, поза застосунком). `src/features/journal`,
`src/features/quotes`, `src/features/lore` не імпортують жоден з remote-клієнтів (`Grep`,
0 збігів у кожному з трьох) — архітектурно немає шляху, яким особистий текстовий контент міг
би дійти до мережевого виклику, окрім якщо новий код майбутнього milestone'у це додасть.
**Висновок: наразі це не ризик, лише спостереження, що варто тримати як інваріант при
подальшому рев'ю кожної нової фічі, яка торкається `journal`/`quotes`/`lore`.**

### 27.2 Інші приватність-спостереження

- `description` книги (синопсис) в `CatalogUpsertInput`/`CoverSyncInput` — це метадані *самої
  книги* від зовнішнього провайдера чи ручного вводу назви книги, НЕ особистий читацький
  запис користувача — не плутати з `note`/`quote` таблицями (інша семантика поля, той самий
  ключ `description`, різні джерела).
- Немає жодної системи акаунтів/авторизації користувача взагалі (`docs/LOCAL_FIRST.md`, чесно
  задокументовано по всьому коду) — тобто немає й email/імені/будь-якого PII, яке технічно
  могло б "витекти" через ці канали навіть гіпотетично, окрім самого фото обкладинки (яке,
  теоретично, може випадково містити щось особисте, якщо людина сфотографує не ту сторінку —
  ризик пренаднизький і поза контролем застосунку).
- Публічний URL завантаженого фото обкладинки (`.../storage/v1/object/public/book-covers/
  <uuid>.jpg`) — доступний БЕЗ авторизації будь-кому, хто знає посилання (за дизайном, bucket
  `public: true`). UUID-шлях не вгадується, але URL і сам файл видно всім користувачам
  застосунку через спільний каталог (це навмисна фіча — "допомогти іншим користувачам
  впізнати книгу", `catalogSync.ts:126-131`), не помилка.

---

## Розділ 28 — Поточний стан Supabase (повний опис)

### 28.1 Таблиці (`supabase/schema.sql`)

| Таблиця | Призначення | RLS | Policy | Прямі гранти anon/authenticated |
|---|---|---|---|---|
| `catalog_book` (28-50) | Спільні метадані книги (одне видання, підтверджене якимось джерелом) | Увімкнено (66) | **Жодної** | `revoke all` (70) |
| `catalog_book_device` (59-64) | Анонімна позначка "цей пристрій додав цю книгу собі" (PK на парі book_id+device_id, унеможливлює накрутку) | Увімкнено (67) | **Жодної** | `revoke all` (71) |
| `curated_book` (318-347) | Власна кураторська добірка рекомендацій ("Що почитати завтра?") — жанри/цілі проставлені вручну власником продукту | Увімкнено (355) | **Жодної** | `revoke all` (356) |
| `edge_rate_limit` (451-455) | Durable лічильник rate limit для Edge Functions (fixed-window) | Увімкнено (457) | **Жодної** | `revoke all` (458), навіть RPC `grant`нуто ЛИШЕ `service_role` (491) |

**Твердження попередніх фаз "доступ повністю через SECURITY DEFINER RPC, жодної прямої RLS
policy" — CODE VERIFIED ІСТИННЕ** для всіх чотирьох таблиць у поточному `schema.sql`: жодного
`create policy` для жодної з них у файлі немає взагалі (лише один `drop policy if exists
"book-covers anon upload"` — видалення старої policy на `storage.objects`, рядок 270, не
таблиці застосунку). Модель — явний deny-all (RLS увімкнено без жодного дозволу) +
відкликані табличні гранти, єдиний прохід — вузькі `SECURITY DEFINER` функції нижче.

### 28.2 RPC-функції (усі `security definer set search_path = public`, захист від
search_path-injection застосовано послідовно)

| Функція | Сигнатура | Призначення | Grant |
|---|---|---|---|
| `catalog_search(p_query, p_limit)` | 78-96 | Повнотекстовий (ILIKE + trigram) пошук по спільному каталогу, сортування за `added_count` потім релевантністю | `anon, authenticated` |
| `catalog_find_by_isbn(p_isbn)` | 100-116 | Точний лукап за ISBN-10/13 | `anon, authenticated` |
| `catalog_upsert_book(...)` | 124-165 | Запис підтверджених метаданих книги (ідемпотентний upsert за ISBN, "перший підтверджений запис виграє") | `anon, authenticated` |
| `catalog_mark_added(p_isbn13, p_isbn10, p_device_id)` | 173-190 | Анонімна позначка "додав собі" (idempotent, no-op якщо книги немає) | `anon, authenticated` |
| `catalog_mark_removed(...)` | 192-208 | Скасування позначки | `anon, authenticated` |
| `catalog_set_cover_if_missing(p_isbn13, p_isbn10, p_cover_url)` | 217-232 | Заповнює `cover_url`, ЛИШЕ якщо порожній (ніколи не перезаписує) | `anon, authenticated` |
| `catalog_top_books(p_limit)` | 277-295 | "Тренди" — топ-N за кількістю пристроїв, що зберегли книгу | `anon, authenticated` |
| `curated_book_search(p_query, p_limit)` | 361-375 | Пошук по кураторській добірці | `anon, authenticated` |
| `curated_book_recommend(p_genre, p_purpose, p_limit)` | 387-399 | "Що почитати завтра?" — жанр обов'язковий (GIN-індекс через `@>`), мета — м'який пріоритет сортування, `random()`-компонент для різноманітності | `anon, authenticated` |
| `curated_book_find_by_isbn(p_isbn)` | 401-412 | Лукап у кураторському каталозі | `anon, authenticated` |
| `curated_book_get(p_id)` | 414-425 | Отримання одного запису за id (slug) | `anon, authenticated` |
| `edge_rate_limit_check(p_bucket_key, p_limit, p_window_seconds)` | 466-489 | Атомарний fixed-window rate limit лічильник (UPSERT з серіалізацією конкурентних викликів через row lock) | **ЛИШЕ `service_role`** (491) — недоступний з клієнта взагалі |

Немає жодної upsert/write RPC для `curated_book` — єдиний спосіб запису туди: окремий
адмінський Node-скрипт `scripts/sync-curated-books.js` через `service_role` ключ (поза
застосунком, поза RLS — `service_role` обходить RLS повністю за визначенням).

### 28.3 Storage

- Bucket `book-covers` (`schema.sql:251-256`): `public: true` (читання без авторизації),
  `file_size_limit: 5242880` (5 МБ), `allowed_mime_types: ['image/jpeg', 'image/png']`.
- Немає жодної RLS policy для `anon`/`authenticated` на `storage.objects` для цього bucket
  (стара policy `"book-covers anon upload"` явно видалена, `schema.sql:270`) — єдиний шлях
  запису: `cover-upload` Edge Function через `service_role` (обходить RLS цілком).

### 28.4 Текстова архітектурна діаграма

```
Мобільний застосунок (React Native/Expo, anon-ключ вбудований у білд)
│
├─► [пряме читання/запис через PostgREST RPC, anon-ключ]
│   ├─► POST {url}/rest/v1/rpc/catalog_search              ──┐
│   ├─► POST {url}/rest/v1/rpc/catalog_find_by_isbn           │
│   ├─► POST {url}/rest/v1/rpc/catalog_upsert_book             ├─► Postgres: SECURITY DEFINER RPC
│   ├─► POST {url}/rest/v1/rpc/catalog_mark_added               │    (жодної RLS policy на самих
│   ├─► POST {url}/rest/v1/rpc/catalog_mark_removed             │     таблицях — RPC-функції це
│   ├─► POST {url}/rest/v1/rpc/catalog_set_cover_if_missing     │     обходять як власник схеми)
│   ├─► POST {url}/rest/v1/rpc/catalog_top_books                │            │
│   ├─► POST {url}/rest/v1/rpc/curated_book_search               │            ▼
│   ├─► POST {url}/rest/v1/rpc/curated_book_recommend           │    catalog_book,
│   ├─► POST {url}/rest/v1/rpc/curated_book_find_by_isbn        │    catalog_book_device,
│   └─► POST {url}/rest/v1/rpc/curated_book_get               ──┘    curated_book (read-only з клієнта)
│
├─► [через Edge Function, anon-ключ до функції + verify_jwt (платформний деплой-прапорець,
│    поза git), функція сама далі використовує service_role]
│   ├─► POST {url}/functions/v1/isbndb-proxy {op: search|lookup}
│   │        │
│   │        ├─► rate limit: POST {url}/rest/v1/rpc/edge_rate_limit_check (service_role,
│   │        │   insert/update у edge_rate_limit)
│   │        └─► GET https://api2.isbndb.com/... (Authorization: ISBNDB_API_KEY, лише на сервері)
│   │
│   └─► POST {url}/functions/v1/cover-upload (тіло — сирі байти зображення)
│            │
│            ├─► rate limit: те саме edge_rate_limit_check
│            └─► POST {url}/storage/v1/object/book-covers/{server-generated-uuid}.{ext}
│                 (Authorization: service_role, обходить RLS storage.objects повністю)
│
├─► [прямий сторонній виклик, без Supabase взагалі]
│   └─► GET https://www.googleapis.com/books/v1/volumes (+ опційний EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY
│        прямо з клієнта, БЕЗ проксі — на відміну від ISBNdb)
│
└─► [читання публічних файлів, без авторизації]
    └─► GET {url}/storage/v1/object/public/book-covers/{uuid}.jpg


Окремо, поза мобільним застосунком:
scripts/sync-curated-books.js (Node, запускається вручну власником продукту, .env.admin
з SUPABASE_SERVICE_ROLE_KEY поза git) ──► прямий запис у curated_book (обходить RLS,
service_role) — єдиний спосіб наповнення кураторського каталогу.
```

### 28.5 Підсумкова оцінка Розділу 28

Модель доступу Supabase-бекенду архітектурно консистентна й послідовно застосована: **жодна**
з чотирьох таблиць не має прямої RLS policy для `anon`/`authenticated`, увесь доступ — вузькі,
однопризначні `SECURITY DEFINER` RPC. Це CODE VERIFIED відповідає тому, що заявлялось у
попередніх фазах. Найслабша структурна точка — не сам Supabase-шар (він спроєктований добре),
а межа між мобільним клієнтом і Google Books API, яка не проходить через жодну з цих
контрольованих точок узагалі (Розділ 26.8).
# Розділ 29–34: Продуктивність, індекси, тестування, CI, залежності, npm audit

> Стандарт доказів застосовано послідовно: CODE VERIFIED / AUTOMATED TEST VERIFIED / CI VERIFIED /
> NOT VERIFIED / NOT BENCHMARKED / HYPOTHESIS. Жодного реального профілювання на пристрої в цій
> сесії не проводилось — усі твердження про продуктивність нижче є статичним аналізом коду, не
> вимірюванням.

---

## Розділ 29. Продуктивність / "гарячі" запити

**⚠️ Увесь цей розділ: NOT BENCHMARKED.** Нижче — виключно статичний аналіз SQL-запитів і місць їх
виклику (`Grep`/`Read` по `src/data/repositories/**` і `app/**`). Жодного `EXPLAIN QUERY PLAN`,
жодного профілювання на реальному чи емульованому пристрої в цій сесії не виконувалось — час
виконання, кількість рядків у реальній БД користувача і фактична відчутність затримки НЕВІДОМІ.

### 29.1. Що реально викликається на Home (`app/(tabs)/index.tsx`)

CODE VERIFIED (простежено імпорти хуків → repository-методи):

| Хук | Repository-виклики | N+1? | LIMIT? |
|---|---|---|---|
| `useLibraryByStatus('reading')` (`src/features/library/useLibrary.ts:9-17`) | `UserBookRepository.listByStatus` → `attachDetailsBatch` (6 запитів фіксовано, не 5N+1 — коментар у коді, `UserBookRepository.ts:49-58`) | Ні (вже виправлено, задокументовано як Milestone 8 fix) | Немає SQL LIMIT; список звужується в JS до `HOME_READING_LIST_LIMIT = 5` ПІСЛЯ вибірки (`app/(tabs)/index.tsx:34`) — тобто SQL завжди тягне ВСІ книги в статусі "reading", а не лише 5 |
| `useReadingContinuity(userBookIds)` (`src/features/reading-session/useReadingContinuity.ts:27-45`) | `ReadingSessionRepository.listLastCompletedByUserBookIds` + `JournalRepository.listLatestByUserBookIds`, `Promise.all` — 2 запити на весь видимий список | Ні (пакетний `IN (...)`, задокументовано) | N/A (список і так малий, вхід — уже обрізаний `userBookIds`) |
| `useOverallStatistics()` (`src/features/statistics/useStatistics.ts:37-48`) | `ReadingSessionRepository.listAllCompleted(db)` (**усі** завершені сесії за весь час, `ORDER BY started_at ASC`, без LIMIT) + `UserBookRepository.listStatusOnly(db,'finished')`, `Promise.all` | Ні (два запити, не N+1) | **Немає LIMIT.** Код сам це визнає: "дані одного локального користувача, тож повна вибірка лишається дешевою" (`ReadingSessionRepository.ts:266-269`). Для користувача з роками історії (тисячі сесій) це повне сканування `reading_session` **на кожному відкритті Home**, потім агрегація/streaks у JS |
| `useHomeContextCard()` → `useHomeContextRestData()` (`src/features/home/useHomeContextCard.ts:65-122`) | 5 паралельних запитів (`listByStatus` ×3, `BookCapsuleRepository.getDue`, `ReadingGoalRepository.listAll`), потім послідовний N+1 `attachCapsuleDetails` (map + `getByIdWithDetails` на кожну прострочену капсулу) і послідовний N+1 `goalsWithProgress` (map + `getProgress` на кожну ціль) | **Так, два свідомих N+1** (`useHomeContextCard.ts:32-34`, `109-111`), але автори документують це як прийнятне, бо N (прострочені капсули / активні цілі) завжди мале число, не розмір бібліотеки | N/A |
| `useOnThisDay()` (через `HomeContextCard`/`JournalPreview`) | `OnThisDayRepository.listByMonthDay` — див. 29.2 нижче | — | Немає LIMIT, весь UNION проходить по 5 таблицях |

**Висновок 29.1 (CODE VERIFIED, статичний аналіз):** N+1-патерн на списках книг (найдорожчий клас
проблем — 5N+1 на кожну книгу бібліотеки) уже свідомо усунутий у Milestone 8 і задокументований
прямо в коді (`UserBookRepository.ts:49-58`, `ShelfRepository.ts:187-189`,
`ReadingSessionRepository.ts:282-289`, `JournalRepository.ts:556-563`) — це реальна, перевірювана
робота, не бездоказова заявка. Два свідомі, обмежені N+1 (`attachCapsuleDetails`,
`goalsWithProgress`) лишаються, але діють на малих, обмежених за природою множинах (прострочені
капсули, активні цілі), не на розмірі бібліотеки — ризик низький, але НЕ ВИМІРЯНИЙ.

### 29.2. Найбільш ризикований патерн: `OnThisDayRepository.listByMonthDay`

**CODE VERIFIED**, `src/data/repositories/OnThisDayRepository.ts:97-164`. Викликається на КОЖНОМУ
відкритті Home (через `useOnThisDay()`, який живить і `HomeContextCard`, і окрему картку "Цей день
у твоєму читанні"). Запит — `UNION ALL` по 5 таблицях (`reading_session`, `user_book` ×2,
`note`, `quote`), кожна гілка фільтрується:

```sql
WHERE rs.ended_at IS NOT NULL AND rs.deleted_at IS NULL AND <BOOK_ALIVE>
  AND strftime('%m-%d', rs.started_at, ?) = ?
```

`strftime(col, ?)` — виклик SQL-функції НАД індексованою колонкою (`started_at`/`created_at`), з
рантайм-параметром зсуву часового поясу (`localOffsetModifier`) як другим аргументом. У SQLite
функція над колонкою в `WHERE` **унеможливлює використання звичайного B-tree індексу** на цій
колонці (навіть якщо такий індекс існує, наприклад `idx_session_started_at`,
`idx_note_created_at`, `idx_quote_created_at`) — рушій не може вибірково перейти в дерево індексу,
бо шукане значення (`%m-%d`) обчислюється з параметром, невідомим на етапі побудови індексу.
Це означає: **повне сканування 5 таблиць (`reading_session`, `user_book`, `note`, `quote`) на
кожному відкритті Home**, незалежно від наявних індексів. Часткове пом'якшення — `rs.ended_at IS
NOT NULL`/`deleted_at IS NULL` фільтри звужують кандидатів ДО обчислення `strftime`, але самі
ці фільтри теж не мають власного індексу (`ended_at`, `deleted_at` — не проіндексовані на
`reading_session`/`note`/`quote`).

Вираз-індекс (`CREATE INDEX ON reading_session(strftime('%m-%d', started_at))`) тут технічно
НЕ рятує — `localOffsetModifier` є bind-параметром, що змінюється залежно від поточного часового
поясу користувача, а SQLite не може побудувати вираз-індекс, залежний від значення параметра
запиту (лише від константи в момент `CREATE INDEX`). Тобто це не "забули індекс" — це
архітектурне рішення, яке справді не має дешевого SQL-виправлення без додаткової
колонки-кешу (наприклад, збереженого `local_month_day` при записі).

**HYPOTHESIS (NOT BENCHMARKED):** для одного локального користувача з реалістичним обсягом даних
(сотні сесій/нотаток, не мільйони) це, ймовірно, лишається непомітним (одноразове сканування
кількох сотень-тисяч рядків у пам'яті SQLite — мілісекунди), АЛЕ жодного вимірювання в цій сесії
не проводилось, і твердження "10 000+ записів без затримки" з коментаря в `JournalRepository.ts`
(рядки 356-360) стосується LIKE-пошуку, не цього запиту — для `listByMonthDay` аналогічного явного
обґрунтування масштабованості в коді немає.

### 29.3. `ActivityHistoryRepository.listRecent` — та сама конструкція, інший екран

**CODE VERIFIED**, `src/data/repositories/ActivityHistoryRepository.ts:61-138`. Викликається з
`app/history.tsx` (НЕ Home/Library за прямим Grep — окремий екран "Моя історія"), але той самий
структурний ризик: `UNION ALL` по 8 джерелах (`reading_session`, `user_book` ×3, `rating`, `note`,
`quote`, `shelf_book`), `ORDER BY occurred_at DESC LIMIT ?` — **LIMIT застосовується ПІСЛЯ
глобального сортування об'єднаного результату всіх 8 гілок**, що є свідомим і задокументованим
рішенням (рядки 54-60 — інакше рідкісний тип події міг би несправедливо витіснити частину
стрічки). Наслідок: SQLite не може "протолкнути" `LIMIT` в жодну з 8 підвибірок — кожна гілка
виконується повністю (з відповідним JOIN до `edition`/`work`), матеріалізується, і лише ПОТІМ
сортується й обрізається. Індекси на `started_at`/`ended_at` окремих джерел тут не допомагають
фінальному сортуванню за синтетичною колонкою `occurred_at` (UNION ALL + зовнішній ORDER BY —
SQLite не може використати індекс однієї з гілок для сортування результату композитного запиту).
Це підтверджено власним тестом (`ActivityHistoryRepository.test.ts:189-196`, "limit застосовується
ПІСЛЯ спільного сортування, а не по кожному джерелу окремо") — поведінка навмисна, задокументована
і покрита тестом, але саме тому продуктивність на великому обсязі історії залишається відкритим
питанням: NOT BENCHMARKED.

### 29.4. Інші "гарячі" кандидати (Library-екран)

CODE VERIFIED, `app/(tabs)/library/index.tsx:18-24` → `src/features/library/useLibrary.ts`:

- `useLibraryByFilter('all', sort)` → `UserBookRepository.listAll(db)` — **уся бібліотека без
  LIMIT**, потім сортування (`sortAllLibraryView`/`applySortOption`) у JS. Для типової особистої
  бібліотеки (сотні книг) — прийнятно; жодного технічного стелі/пагінації немає, якщо бібліотека
  виросте до тисяч записів, кожне відкриття вкладки "Усі" й досі тягне всі книги з повним
  `attachDetailsBatch` (6 запитів, але кожен по всій бібліотеці).
- `useWaitingLongest()` / `useRecentlyFinished()` — використовують ТОЙ САМИЙ кеш-ключ, що й вкладка
  статусу (`byStatus('want_to_read')`/`byStatus('finished')`), сортування/обрізання до
  `CAROUSEL_LIMIT = 12` — **клієнтський `select`, не SQL LIMIT**: сам SQL-запит і тут тягне ВСІ
  книги статусу, лише відображення урізане.
- `useShelves()` → `ShelfRepository.listAll` — `LEFT JOIN shelf_book … GROUP BY s.id` — для
  невеликої кількості полиць (типова кількість — одиниці/десятки) дешево; масштаб не тестований.

**Загальний висновок 29:** архітектурно перелічені "гарячі" запити НЕ мають класичного N+1 на
списках книг (ця проблема вже виправлена й задокументована як Milestone 8), але майже ВСІ
Home/Library-запити є **необмеженими повними вибірками** ("вся бібліотека", "усі завершені сесії",
"усі 5 UNION-джерел щоденника"), що спираються на неявне припущення "дані одного локального
користувача завжди малі". Це задокументоване, свідоме архітектурне рішення (не недогляд), але
жодного порогового тестування ("що станеться при 5000 сесій / 3000 книг") у цій сесії не
проводилось — **NOT BENCHMARKED** для всього розділу без винятку.

---

## Розділ 30. Аудит індексів

CODE VERIFIED. Усі індекси визначені як `db.execAsync` SQL-рядки в TypeScript-файлах міграцій
(`.sql`-файлів у репозиторії немає — `src/data/db/migrations/*.ts`). Повний перелік (18 файлів
міграцій, `001`–`018`):

### 30.1. Повний список `CREATE INDEX`

```sql
-- 001_base_schema.ts
CREATE INDEX idx_edition_work ON edition(work_id);
CREATE INDEX idx_edition_isbn13 ON edition(isbn13);
CREATE INDEX idx_field_provenance_entity ON field_provenance(entity_type, entity_id);
CREATE INDEX idx_series_entry_series ON series_entry(series_id);
CREATE INDEX idx_user_book_status ON user_book(status);
CREATE INDEX idx_user_book_edition ON user_book(edition_id);
CREATE INDEX idx_session_user_book ON reading_session(user_book_id);
CREATE INDEX idx_session_started_at ON reading_session(started_at);
CREATE INDEX idx_progress_user_book ON reading_progress(user_book_id, recorded_at);
CREATE INDEX idx_note_user_book ON note(user_book_id);
CREATE INDEX idx_quote_user_book ON quote(user_book_id);
CREATE INDEX idx_loan_active ON loan(returned_at);

-- 003_journal_entry_extensions.ts
CREATE INDEX idx_note_user_book ON note(user_book_id);   -- (дублює ім'я з 001 — див. 30.4)
CREATE INDEX idx_note_type ON note(type);
CREATE INDEX idx_note_favorite ON note(is_favorite);
CREATE INDEX idx_note_created_at ON note(created_at);
CREATE INDEX idx_quote_favorite ON quote(is_favorite);
CREATE INDEX idx_quote_created_at ON quote(created_at);

-- 006_recommendation_shown.ts
CREATE INDEX idx_recommendation_shown_lookup ON book_recommendation_shown(genre_id, purpose);

-- 008_note_category.ts
CREATE INDEX idx_note_category_user_book ON note_category(user_book_id);

-- 011_revisit_later.ts
CREATE INDEX idx_note_revisit_later ON note(revisit_later);
CREATE INDEX idx_quote_revisit_later ON quote(revisit_later);

-- 012_book_capsule.ts
CREATE INDEX idx_book_capsule_user_book ON book_capsule(user_book_id);
CREATE INDEX idx_book_capsule_reopen_at ON book_capsule(reopen_at);

-- 013_capsule_recall.ts
CREATE INDEX idx_capsule_recall_book_capsule ON capsule_recall(book_capsule_id);

-- 015_lore_entity.ts
CREATE INDEX idx_lore_entity_work ON lore_entity(work_id);
CREATE INDEX idx_journal_lore_link_entity ON journal_lore_link(lore_entity_id);

-- 018_shelf_book_index.ts
CREATE INDEX idx_shelf_book_user_book ON shelf_book(user_book_id);
```

**30.4 Примітка:** `003_journal_entry_extensions.ts:82` повторно оголошує `idx_note_user_book`
(ідентичне ім'я й визначення, що й `001_base_schema.ts:252`). SQLite `CREATE INDEX` без `IF NOT
EXISTS` на вже існуючу назву кидає помилку — якщо це буквально виконується на БД, де вже
застосована міграція 001, це б валило `migrateDbIfNeeded`. Найімовірніше пояснення (не
перевірено далі в цьому файлі): міграція 003, ймовірно, спершу `DROP TABLE note`/перестворює
`note` з нуля (розширення схеми, "extensions" у назві) і тому індекс 001 на цей момент уже не
існує — це **потребує перевірки самого файлу `003_journal_entry_extensions.ts` цілком** (не
прочитано повністю в цій сесії, лише grep на `CREATE INDEX`). Фіксую як відкрите питання, не як
підтверджений баг.

### 30.2. Позитивні знахідки — індекси, що явно відповідають реальним запитам

- `idx_progress_user_book ON reading_progress(user_book_id, recorded_at)` — композитний,
  точно покриває `ReadingProgressRepository.listByUserBookId` (`WHERE user_book_id = ? ORDER BY
  recorded_at`) — зразковий приклад.
- `idx_shelf_book_user_book ON shelf_book(user_book_id)` (міграція 018) — цільове доповнення:
  первинний ключ `shelf_book` — `(shelf_id, user_book_id)`, тобто пошук за `shelf_id` (
  `ShelfRepository.listBooksByShelf`) уже покритий самим PK (провідна колонка), а пошук у
  зворотному напрямку (`listShelfIdsForUserBook`, `listNamesByUserBookIds` — `WHERE user_book_id
  IN (...)`) без цього індексу вимагав би повного сканування `shelf_book` — свідомий, точковий
  фікс, коректний.
- `work_author` / `work_genre`: композитні `PRIMARY KEY (work_id, ...)` — `work_id` як провідна
  колонка PK покриває `AuthorRepository.listByWorkId(s)`/аналогічні GenreRepository-запити без
  потреби в окремому `CREATE INDEX`.
- `rating.user_book_id` — оголошено `UNIQUE` (`001_base_schema.ts:271`), SQLite автоматично
  створює прихований унікальний індекс — `RatingRepository.getByUserBookId`/`upsert` покриті без
  явного `CREATE INDEX`.

### 30.3. Явно відсутні індекси (CODE VERIFIED зіставленням із запитами)

1. **`edition.isbn10` — немає індексу**, хоча `EditionRepository.ts:165`:
   ```sql
   SELECT * FROM edition WHERE (isbn10 = ? OR isbn13 = ?) AND deleted_at IS NULL LIMIT 1
   ```
   `idx_edition_isbn13` покриває лише другу половину `OR`. Коли жоден рядок не збігається за
   `isbn13` (типовий випадок для видань, збережених лише з `isbn10` — сам код це визнає в іншому
   місці, `EditionRepository.ts:191-196`), SQLite для `OR`-умови, де одна гілка не має індексу,
   як правило виконує повне сканування `edition` замість використання індексу лише для `isbn13`-
   гілки. Використовується при скануванні штрихкоду/додаванні книги (`getByIsbn`) — не
   Home/Library, але часто використовуваний шлях. **Рекомендація (не виконано в коді):
   `CREATE INDEX idx_edition_isbn10 ON edition(isbn10)`.**

2. **`note`/`quote`: немає композитного `(user_book_id, created_at)`.** Наявні лише окремі
   одноколонкові `idx_note_user_book`/`idx_note_created_at` (і аналогічно для `quote`).
   `JournalRepository.listByUserBookId`/`listFavoritesByUserBookId`/`listRevisitLaterByUserBookId`
   (усі — обгортки над `listPage({userBookId, ...}, limit: 5000)`) фільтрують за `user_book_id` і
   сортують за `created_at DESC, id DESC` — з одноколонковими індексами SQLite використає ОДИН з
   двох (найімовірніше `idx_note_user_book` для фільтра), а сортування за `created_at`
   довиконає окремим кроком у пам'яті. Для типової кількості записів на одну книгу (десятки-сотні)
   це, найімовірніше, непомітно — але це той самий клас відсутнього покриття, що вже одного разу
   був явно виправлений для `reading_progress` (`idx_progress_user_book`, композитний) і для
   `shelf_book` (`idx_shelf_book_user_book`, міграція 018) — тут аналогічного кроку для
   `note`/`quote` не зроблено.

3. **`user_book`: немає композитного `(status, updated_at)`.** `UserBookRepository.listByStatus`/
   `listStatusOnly` (`UserBookRepository.ts:254-259, 274-280`) — `WHERE status = ? AND deleted_at
   IS NULL ORDER BY updated_at DESC`. `idx_user_book_status` покриває лише рівність за `status`;
   сортування за `updated_at` — окремий крок. Це найгарячіший запит усього застосунку (виконується
   на кожному відкритті Home І Library, для 4+ різних статусів окремими викликами) — і
   найбільш виправданий кандидат на композитний індекс з усього списку, попри те що для
   реалістичного розміру особистої бібліотеки (сотні книг на статус) вплив, найімовірніше,
   малопомітний. NOT BENCHMARKED.

4. **`reading_session.ended_at` — немає індексу** (є лише `started_at`). Використовується у
   фільтрах `ReadingSessionRepository.getActiveSession`/`listByUserBookId`/`listAllCompleted`
   (`ended_at IS NOT NULL`/`IS NULL`) та в `ActivityHistoryRepository`/`OnThisDayRepository` (де,
   як пояснено в 29.2–29.3, індекс однаково не допоміг би фінальному сортуванню UNION-запиту, але
   міг би пришвидшити саму фільтрацію гілки). Низький пріоритет для `getActiveSession`
   (щонайбільше 1 активна сесія — висока вибірковість і без індексу), вищий — для
   `listAllCompleted`, яка сканує ВЕСЬ `reading_session` без LIMIT (розділ 29.1) незалежно від
   індексів.

5. **`deleted_at` (soft-delete) ніде не індексується** (`user_book`, `reading_session`, `note`,
   `quote`, `edition`, `work` — усі мають колонку `deleted_at`, жодна не має на ній індексу,
   ізольовано чи в композиті). Для одного користувача це низький ризик (видалених рядків завжди
   мало відносно живих — індекс на низькоселективній булевій-подібній колонці рідко вартий свого
   overhead на запис), тож це свідомо НЕ фіксується як дефект, лише як спостереження.

**Висновок 30:** індексна схема в цілому вдумлива й реагує на реальні запити (два задокументовані
точкові фікси — `reading_progress` і `shelf_book` — це докази ітеративної роботи, не
випадковості). Найпомітніша прогалина — `edition.isbn10` (п.1, реальний OR-без-індексу дефект) і
відсутність композитних `(user_book_id, created_at)`/`(status, updated_at)` там, де вони вже
застосовані в сусідніх таблицях за тим самим шаблоном. Жодна з прогалин НЕ підтверджена як реальна
проблема продуктивності — лише як розбіжність зі шаблоном, застосованим деінде в тій самій кодовій
базі.

---

## Розділ 31. Testing — точні цифри

### 31.1. Загальна кількість тестових файлів

**Glob `**/*.test.ts` під коренем проєкту: 50 файлів.**
**Glob `**/*.test.tsx`: 0 файлів** (увесь UI/верстка свідомо НЕ покриті автотестами — задокументовано
в `docs/TESTING.md`: "Верстка/анімації/жести — перевіряються вручну").

Розподіл 50 файлів:
- `src/data/repositories/*.test.ts` — **21 файл** (список нижче, п.31.2).
- `src/data/db/migrationRunner.test.ts` — **1 файл** (перевіряє сам migration runner, не окремий
  репозиторій).
- `src/lib/*.test.ts`, `src/domain/*.test.ts`, `src/design/*.test.ts` — **28 файлів** (чиста
  доменна логіка: `isbn`, `backupSerializer`, `lastReadLabel`, `bookStats`,
  `journalInvalidation`, `activityHistory`, `backupHealth`, `finishPrediction`, `bookCapsule`,
  `dataIntegrityDoctor`, `recall`, `journalTimeline`, `readingExperienceTimeline`,
  `staleReading`, `loreEntity`, `spoilerSafe`, `beforeAfter`, `dnfReflection`, `season`,
  `readingProfile`, `readingFingerprint`, `onePicker`, `tbrEstimate`, `tbrPersonality`,
  `dnfReason`, `homeContext`, `onThisDay`, `isFetchAborted`).

**⚠️ Розбіжність із базовою цифрою "584/584 тестів, 57 suites" (CI run #55).** Кількість тестових
*suite-файлів*, знайдена Glob у цьому знімку коду (50), НЕ збігається із заявленою кількістю
suites з останнього відомого CI-прогону (57) — розбіжність **7 suites**. Можливі пояснення: (а)
знімок коду в `/mnt/user-data/uploads/polytsya-m11/` не є точно тим комітом, на якому виконувався
run #55 (тобто з того часу могли видалити тестові файли або їх не було в цьому конкретному
знімку); (б) Jest у CI підбирає suites не лише за `*.test.ts` (наприклад, окремі `it.each`-блоки
не рахуються тут як окремі файли — але це не пояснило б розбіжність у *файлах*); (в) похибка в
базовій цифрі. **Це не підтверджено в жодну сторону в цій сесії — фіксую як відкриту розбіжність,
яку власник продукту має звірити з актуальним CI-прогоном, а не мовчки прийняти 584/57 як
актуальне.** Підрахунок тестів (`it(...)` всередині кожного suite) у цій сесії не виконувався
взагалі (це вимагало б реального запуску Jest, якого в цій сесії не було) — цифра "584 тести"
лишається CI VERIFIED виключно як історичний факт run #55, не як перевірена властивість цього
конкретного знімку коду.

### 31.2. Покриття тестами за репозиторієм (`src/data/repositories/*.ts`, 35 файлів, без тестів)

Класифікація: **FULL** (тест-файл покриває більшість публічних методів), **PARTIAL** (тест є, але
покриває вузьку частину — визначено читанням `describe`/`it` заголовків, не здогадкою),
**NONE** (жодного тестового файлу).

| Repository | Покриття | Обґрунтування (CODE VERIFIED) |
|---|---|---|
| `ActivityHistoryRepository` | **FULL** | `ActivityHistoryRepository.test.ts` — усі 8 типів подій, сортування, `limit` після сортування, каскад soft-delete |
| `AppSettingsRepository` | **NONE** | Немає тестового файлу |
| `AuthorRepository` | **NONE** | Немає тестового файлу (лише опосередковано через `attachDetailsBatch` в тестах `UserBookRepository`) |
| `BackupRepository` | **FULL** | `BackupRepository.test.ts` — round-trip export/restore, транзакційність, `approximateCounts`, `schemaVersion` guard |
| `BookCapsuleRepository` | **FULL** | `BookCapsuleRepository.test.ts` — create/get/update/remove/getDue/listWithFutureReminder/markOpened, перечитування, м'які посилання на щоденник |
| `bookDraftRepository` | **NONE** | Немає тестового файлу |
| `BookMemoryRepository` | **NONE** | Немає тестового файлу |
| `BookSourceRepository` | **NONE** | Немає тестового файлу |
| `CapsuleRecallRepository` | **FULL** | `CapsuleRecallRepository.test.ts` — create/list/cascade delete |
| `DataIntegrityRepository` | **FULL** | `DataIntegrityRepository.test.ts` — усі 6 категорій перевірок явно тестуються на зіпсованих даних |
| `DnfReflectionRepository` | **FULL** | `DnfReflectionRepository.test.ts` — get/captureIfMissing/updateDetails/remove/cascade |
| `EditionRepository` | **FULL** | `EditionRepository.test.ts` — create/setCoverUrl/getById/getByIdWithRelations/getByIsbn/listByIds/listAllIsbnKeys/listByWorkId |
| `GenreRepository` | **NONE** | Немає тестового файлу |
| `JournalDraftRepository` | **NONE** | Немає тестового файлу |
| `JournalRepository` | **PARTIAL** | `JournalRepository.test.ts` покриває лише фільтри `listFeedPage`/`listPage` (query/reaction/workId/dateFrom-dateTo/revisitLater); `listLatestByUserBookIds` тестується окремо в `ReadingContinuity.test.ts`; `searchFeed` — в `PersonalSearch.test.ts`. **Без покриття:** `listByUserBookId`, `listFavoritesByUserBookId`, `listBySessionId`, `countByUserBookId`, `countAll`, `countsByReaction` |
| `LoreEntityRepository` | **FULL** | `LoreEntityRepository.test.ts` — create/list/update/remove/setFavorite/link-unlink/cascade |
| `NoteCategoryRepository` | **NONE** | Немає тестового файлу |
| `NoteRepository` | **PARTIAL** | `NoteRepository.test.ts` тестує ЛИШЕ `create` і `setRevisitLater` (4 тести). **Без прямого покриття:** update/remove/setFavorite/setReaction та інші мутації |
| `OnThisDayRepository` | **FULL** | `OnThisDayRepository.test.ts` — джерела подій, видалені книги, локальна межа доби (часовий пояс) |
| `OwnedBookRepository` | **NONE** | Немає тестового файлу |
| `PreReadingReflectionRepository` | **FULL** | `PreReadingReflectionRepository.test.ts` — get/upsert/remove/cascade |
| `PublisherRepository` | **FULL** | `PublisherRepository.test.ts` — findOrCreateByName/getById/listByIds |
| `QuoteRepository` | **PARTIAL** | Той самий патерн, що й `NoteRepository` — лише `create`+`setRevisitLater` (4 тести) |
| `RatingRepository` | **FULL** | `RatingRepository.test.ts` — getByUserBookId/upsert(insert+update)/listByUserBookIds/remove |
| `ReadingGoalRepository` | **PARTIAL** | `ReadingGoalRepository.test.ts` глибоко покриває лише `getProgress` (усі типи цілей, межові умови періоду) — CRUD-методи (`create`/`update`/`delete`/`listAll`) НЕ підтверджені окремими тестами в межах прочитаної частини файлу |
| `ReadingProgressRepository` | **FULL** | `ReadingProgressRepository.test.ts` — recordForSession/recordManual/listByUserBookId (хронологія, ізоляція між книгами, append-only) |
| `ReadingSessionRepository` | **PARTIAL — найважливіша прогалина покриття у всьому списку** | `ReadingSessionRepository.test.ts` тестує **ВИКЛЮЧНО** `setReadingExperience` (4 тести). `listLastCompletedByUserBookIds` покрито окремо (`ReadingContinuity.test.ts`). **Без ЖОДНОГО прямого repository-тесту:** `start`, `pause`, `resume`, `finish` (транзакційний метод, що записує сесію+`current_page`+`reading_progress` в одній `withTransactionAsync` — сам код називає це "критичним core loop", `ReadingSessionRepository.ts:54-59`), `discard`, `listByUserBookId`, `listStartedBetween`, `listAllCompleted`. Чисті обчислення навколо сесії (`computeElapsedMs`, `sessionTiming`) тестуються окремо в `src/lib/*.test.ts`, але сам repository-шар транзакційного запису/читання сесій — ні |
| `ReminderRepository` | **NONE** | Немає тестового файлу |
| `RecommendationRepository` | **NONE** | Немає тестового файлу |
| `SeriesRepository` | **PARTIAL** | Лише `.search` покрито (`PersonalSearch.test.ts`) — CRUD не підтверджено |
| `ShelfRepository` | **PARTIAL** | Лише `.search` покрито (`PersonalSearch.test.ts`) — `create`/`addBook`/`removeBook`/`listAll`/`listBooksByShelf`/`remove`/`listNamesByUserBookIds` без прямого тесту |
| `TagRepository` | **NONE** | Немає тестового файлу |
| `TranslatorRepository` | **NONE** | Немає тестового файлу |
| `UserBookRepository` | **FULL** | `UserBookRepository.test.ts` — addToLibrary/getByEditionId/getById/getByIdWithDetails/updateStatus/updateCurrentPage/setFavorite/setSpoilerSafeEnabled/remove/applyImportedDates/listByIds/listWithDetailsByIds/listByStatus/listAll/listStatusOnly — найповніший файл зі списку |
| `WorkRepository` | **PARTIAL** | Лише `.search` покрито (`PersonalSearch.test.ts`) — інші методи (`getByIdWithAuthors`, `listByIds`, create тощо) не підтверджені окремим тестом |

**Підсумок:** 35 репозиторіїв — **14 FULL, 8 PARTIAL, 13 NONE**.

**Найважливіша знахідка цього розділу:** `ReadingSessionRepository` — репозиторій, що зберігає сам
"core loop" застосунку (старт/пауза/продовження/завершення сесії читання, транзакційний запис у 3
таблиці) — має ВЛАСНИЙ тестовий файл, який тестує лише один другорядний метод
(`setReadingExperience`), а не сам транзакційний `finish()` чи `start()`/`pause()`/`resume()`. Це
не означає, що ці шляхи не покриті НІЯК (деякі непрямо зачіпаються через `UserBookRepository.test.ts`
— ні, там `ReadingSessionRepository` не викликається — або через `ReadingContinuity.test.ts`, який
теж лише читає, не пише сесії), лише те, що прямого repository-рівня AUTOMATED TEST VERIFIED
покриття для запису/завершення сесії читання — **НЕМАЄ**, попри те що `docs/TESTING.md` (рядок 18)
згадує "Обчислення таймера сесії (`elapsedFromTimestamps`)" як явно протестоване — це стосується
чистої функції `sessionTiming.ts`, не самого `ReadingSessionRepository.finish()`, який її викликає
разом із транзакційним записом.

---

## Розділ 32. CI pipeline — опис

CODE VERIFIED на основі точного вмісту `.github/workflows/ci.yml`, наданого в постановці задачі.

**Тригери:** `push` і `pull_request` на гілку `main`. Concurrency group скасовує застарілі запуски
(типова практика — новий push на ту саму гілку/PR відміняє попередній ще не завершений прогін,
економить хвилини CI).

**Runner:** Node 22 (`engines.node: ">=22"` у `package.json` узгоджено з CI).

**Кроки, послідовно:**
1. `actions/checkout`
2. `actions/setup-node` з кешем npm (пришвидшує повторні прогони — кеш `~/.npm` за хешем
   `package-lock.json`)
3. `npm ci` — строгий, відтворюваний install точно за `package-lock.json` (падає на `EUSAGE`, якщо
   lock-файл і `package.json` розійшлись — навмисна жорсткість, не м'яка деградація до `npm
   install`)
4. `npm run typecheck` (`tsc --noEmit`, `strict: true`)
5. `npm run lint` (`eslint . --max-warnings=0` — **нуль попереджень**, не лише помилок; будь-яке
   попередження валить збірку)
6. `npm test -- --ci` (Jest, `jest-expo` preset, `--ci` вимикає інтерактивні watch-режими й
   snapshot-автозапис — коректний прапорець для CI-середовища)
7. `npx expo-doctor` з `continue-on-error: true` — **advisory-only**: результат видно в лозі
   прогону, але падіння цього кроку НЕ валить весь pipeline (свідоме рішення, бо `expo-doctor`
   частково звертається в мережу — нестабільність GitHub-раннера тут не мала б рахуватись як
   помилка коду)

**Ключова прогалина CI-покриття (обов'язково зафіксовано):** жодного окремого кроку типізації/
лінту/тестів для **Deno Edge Functions** (`supabase/functions/**`) немає. Ці файли пишуться під
Deno runtime (глобал `Deno`, імпорти з явним `.ts`), несумісні із синтаксисом звичайного
tsc/ESLint-проєкту застосунку — `tsconfig.json` explicitly `exclude`, `eslint.config.js` explicitly
`ignores` цю теку (підтверджено — CODE VERIFIED через сам `docs/TESTING.md:96-100`, і фактичний
вміст теки перевірено: `supabase/functions/_shared/rateLimit.ts`, `_shared/cors.ts`,
`isbndb-proxy/index.ts`, `isbndb-proxy/isbn.ts`, `cover-upload/index.ts` — **5 файлів, 0 з них
покриті CI**). Жодного `deno check`/`deno lint`/`deno test` кроку в `.github/workflows/ci.yml`
немає взагалі — ці 5 файлів (проксі до ISBNdb API, завантаження обкладинок, rate limiting,
CORS-обробка — усі мережеві, безпеко-чутливі за природою) наразі НІКОЛИ автоматично не
перевіряються ні на помилки типів, ні на лінт-порушення, ні тестами, на жодному push/PR. Це
підтверджена, конкретна, дієва прогалина CI-покриття, а не гіпотетична — власник продукту має або
додати окремий Deno-крок (`deno check`/`deno test` через Supabase CLI чи прямий `denoland/setup-deno`
action), або свідомо задокументувати, що ці функції перевіряються лише вручну.

---

## Розділ 33. Dependencies

Структурований огляд на основі точного `package.json`, наведеного в постановці задачі.

### 33.1. Платформа

| Компонент | Версія | Коментар |
|---|---|---|
| Expo SDK | `~57.0.22` (і весь набір `expo-*` пакетів узгоджено на `~57.0.x`) | Актуальна на момент написання мажорна лінійка Expo (знання моделі обмежене січнем 2026 — не можу підтвердити, чи вийшов SDK 58 після цього, HYPOTHESIS) |
| React Native | `0.86.3` | Узгоджено з Expo SDK 57 (Expo SDK 57 таргетить RN 0.81+ лінійку за типовою практикою Expo — точна відповідність SDK↔RN версії не перевірялась окремим запитом до npm registry в цій сесії, мережевого доступу немає) |
| React / React DOM | `19.2.3` | React 19.x — сучасна мажорна версія; `19.2.3` узгоджено між `react`/`react-dom` |
| TypeScript | `~6.0.3` (devDependency) | **Помітно:** TypeScript 6.x — якщо це справді реліз, а не помилка версії (TypeScript історично йшов 4.x/5.x лінійками; "6.0" відповідав би значному мажорному стрибку). Я НЕ можу підтвердити існування TS 6.0.3 з пам'яті моделі з високою впевненістю — **HYPOTHESIS: варто вручну перевірити, чи це не одруківка (наприклад, малося на увазі `~5.6.3` чи подібне) і чи `npm ci` в CI дійсно резолвить саме цю версію**, а не мовчки падає/підтягує щось інше через `package-lock.json`. Якщо версія коректна — TS 6 із `strict: true` це позитивний сигнал (найсвіжіша перевірка типів) |
| Node (engines) | `>=22` | Сучасна LTS-лінійка, узгоджена з CI (`setup-node` на Node 22) |

### 33.2. Ключові бібліотеки

| Пакет | Версія | Коментар |
|---|---|---|
| `@tanstack/react-query` | `^5.102.8` | v5 — сучасна, кеш-шар усіх repository-хуків, послідовно використовується (`useQuery`/`useMutation` скрізь у `src/features/**`) |
| `zustand` | `^5.0.15` | v5, легкий, підходить для offline-first клієнтського стану |
| `zod` | `^4.5.4` | v4 — сучасна; використання в проєкті не перевірялось окремо в цьому розділі |
| `expo-sqlite` | `~57.0.3` | Головне сховище даних; `docs/TESTING.md` документує відому обмеженість — не конструюється headless у Node/CI (тому й окремий `better-sqlite3`-адаптер для тестів) — це відоме архітектурне обмеження, не залежність-ризик як така |
| `@shopify/flash-list` | `2.0.2` (точна версія, без `^`) | Точно зафіксована (не діапазон) — свідомий вибір консистентності списків, типово чутлива до версії бібліотека |
| `react-native-reanimated` | `4.5.1` (точна) + `react-native-worklets` `0.10.1` (точна) | Обидві точно зафіксовані — узгоджено, Reanimated 4.x вимагає окремого `react-native-worklets` пакету (архітектурна зміна порівняно з Reanimated 3.x, де worklets був вбудований) — коректна пара версій за загальновідомою практикою Reanimated 4 |
| `react-native-view-shot` | `5.1.0` (точна) | `docs/TESTING.md:90-92` явно документує реальний інцидент: перший CI-прогін впав через розбіжність `package.json` (`^5.1.1`) і зафіксованого `package-lock.json` (`5.1.0`) — виправлено фіксацією точної версії `5.1.0` у `package.json`. Це підтверджений, задокументований факт з історії проєкту (CI VERIFIED), не гіпотеза |
| `react-native-uuid` | `^2.0.4` | Невелика утилітарна залежність, низький ризик |
| `expo-camera`, `expo-image-picker`, `expo-document-picker`, `expo-media-library` | усі `~57.0.x` | Усі нативні модулі узгоджені з Expo SDK 57 — консистентний набір, низький ризик розбіжності версій |

### 33.3. Загальна оцінка (HYPOTHESIS, без `npm audit`)

- Жодних відверто застарілих мажорних версій (Expo 5x-6x назад, React 16/17, класичного Redux
  тощо) у списку немає — весь стек виглядає як свіжий, послідовно оновлений набір на момент
  фіксації (V1.6).
- Найбільший відкритий знак питання — версія TypeScript `~6.0.3` (п. 33.1) — вимагає ручної
  звірки власником продукту, чи це коректний реліз, а не помилка написання.
- Точна фіксація версій (без `^`/`~`) для трьох історично "крихких" пакетів
  (`@shopify/flash-list`, `react-native-reanimated`, `react-native-worklets`, `react-native-
  view-shot`) — позитивний, свідомий сигнал стабільності збірки, а не недогляд.
- Жодних CVE/вразливостей тут не перевірено і НЕ може бути перевірено без мережевого доступу до
  npm registry — див. Розділ 34.

---

## Розділ 34. npm audit

**❌ `npm audit` НЕ ЗАПУСКАВСЯ в цій сесії.** Середовище цієї сесії не має мережевого доступу до
npm registry для виконання цієї перевірки (агент обмежений `Read`/`Grep`/`Glob` по застейдженому
локальному коду, без `Bash`/мережевих інструментів у цьому конкретному завданні аудиту).

**Увесь цей розділ: NOT VERIFIED.** Жодна вразливість (CVE), жоден рівень серйозності
(low/moderate/high/critical) для жодної з ~60 прямих залежностей (`dependencies` +
`devDependencies` у `package.json`) і жодної з транзитивних залежностей — **НЕ ПЕРЕВІРЕНІ**.

**Це — конкретна, дієва прогалина аудиту, яку власник продукту повинен закрити самостійно, ДО
релізу чи публікації застосунку:**

1. Локально: `cd polytsya-m11 && npm audit` (за потреби `npm audit --production` для
   відокремлення рантайм-залежностей від dev-інструментів) — і за результатом `npm audit fix`
   там, де це безпечно (не мажорні breaking-зміни без ручної перевірки).
2. Автоматизовано: увімкнути **GitHub Dependabot alerts** (Settings → Security → Code security →
   Dependabot alerts) для репозиторію — це дасть постійний моніторинг нових CVE в
   залежностях без ручного запуску `npm audit` щоразу, і окремо **Dependabot security updates**
   для автоматичних PR з патчами.
3. Розглянути додавання `npm audit --audit-level=high` (чи подібного) як ЩЕ ОДНОГО кроку в
   `.github/workflows/ci.yml` (можливо, `continue-on-error: true` за аналогією з `expo-doctor`,
   якщо власник продукту не хоче, щоб сама наявність low/moderate вразливості валила pipeline) —
   наразі такого кроку в CI НЕМАЄ (підтверджено читанням повного вмісту `ci.yml`, наведеного в
   постановці задачі: 7 кроків, жоден не `npm audit`).

Без виконання цих кроків самим власником продукту цей аудит НЕ МОЖЕ дати жодної гарантії щодо
безпеки ланцюга постачання (supply chain) застосунку — це прямо визнана межа цієї сесії, не
замовчана прогалина.
# Розділ 35-42: Design System, Accessibility, Offline, Error Handling, Notifications, Memory Card Sharing

> Методологія доказів у цьому документі: **CODE VERIFIED** (точний шлях/рядок перевірено читанням коду),
> **AUTOMATED TEST VERIFIED** (є файл тесту, що це покриває), **CI VERIFIED** (підтверджено логом CI —
> в цій сесії недоступно), **DEVICE VERIFIED** (недоступно — немає фізичного пристрою), **NOT VERIFIED**
> (типовий тег для реальної поведінки: screen reader, реальний контраст на екрані, реальні push-сповіщення),
> **HYPOTHESIS** (явно позначена оцінка без інструментального підтвердження). Жодного пункту нижче не
> позначено MANUALLY VERIFIED чи DEVICE VERIFIED без реального підтвердження — за методологією аудиту
> це майже завжди NOT VERIFIED.

---

## Розділ 35. Design System — послідовність, дублікати

### 35.1 Перевірка 18 заявлених спільних компонентів (ARCHITECTURE.md, розділ 5)

CODE VERIFIED через `Glob`/`ls src/components/ui/` — усі 18 компонентів, названих в `docs/ARCHITECTURE.md`
(рядки 203-209), справді існують за заявленими іменами й у заявленій директорії:

`AppText.tsx`, `Button.tsx`, `Card.tsx`, `ChipSelect.tsx`, `CollapsibleSection.tsx`, `CoverThumbnail.tsx`,
`EmptyState.tsx`, `LabeledInput.tsx`, `QueryErrorState.tsx`, `ReadingProgressBar.tsx`, `ScreenContainer.tsx`,
`StarRating.tsx` — і додані у "Фазі 19" (`docs/DESIGN_SYSTEM_EXTENSION.md`): `BookHero.tsx`,
`JournalPreview.tsx`, `MemorySection.tsx`, `QuickAction.tsx`, `SectionHeader.tsx`, `Timeline.tsx`.

Розбіжностей з документацією не знайдено — рідкісний випадок, коли `ARCHITECTURE.md` описує реальний стан
`src/components/ui/`, а не задуману на Milestone 0 структуру (на відміну, наприклад, від розділу 4 того ж
документа, де прямо визнається, що маршрутизація в `app/` розійшлась із задумом і документ довелось
переписувати за фактом — `docs/ARCHITECTURE.md:65-70`).

### 35.2 Design tokens (`src/design/tokens.ts`)

CODE VERIFIED — токени існують і мають очікувану форму: `spacing` (7 щаблів xs-xxxl), `radius` (5 щаблів),
`minTouchTarget = 44`, `typography.scale` (6 рівнів), `lightColors`/`darkColors` (14 полів кожна, однакова
форма через спільний `ColorPalette`-інтерфейс), `motion` (3 значення в мс).

Цікавий і чесний артефакт у самому файлі — коментар `src/design/tokens.ts:106-109` документує реальний
WCAG-аудит Milestone 8: колір `darkColors.textTertiary` спершу не проходив 4.5:1 на жодному з трьох темних
фонів (~4.19:1/~3.91:1/~3.62:1), і був замінений на `#948F84` (≥4.95:1 на всіх трьох). Це єдиний контраст,
для якого в коді є явний слід реального обчислення — решта контрастів нижче в розділі 37 не мають такого
сліду і лишаються **HYPOTHESIS**.

### 35.3 `motion`-токен: задокументована, але не реалізована поведінка

`src/design/tokens.ts:120-124` (коментар з `docs/ARCHITECTURE.md:250` дослівно повторює це): `motion`
"вимикається за reduceMotion". CODE VERIFIED, що це неправда для поточного коду:
`ThemeProvider.tsx` (`src/design/ThemeProvider.tsx:53,65-68,101`) справді відстежує
`AccessibilityInfo.isReduceMotionEnabled()`/`reduceMotionChanged` і кладе `reduceMotionEnabled: boolean` у
контекст теми — але `grep "reduceMotionEnabled"` по всьому `src/` й `app/` не знаходить **жодного** місця
поза самим `ThemeProvider.tsx`, де це значення читається. Жодна анімація в застосунку фактично не
перевіряє `reduceMotionEnabled` і не вимикається за ним. Висновок: прапорець збирається, але не
споживається — документація описує намір, якого немає в реалізації (CODE VERIFIED відсутність споживання).

### 35.4 Дублювання: JournalPreview — приклад ВЖЕ виправленого дублювання (позитивний факт)

Коментар у самому компоненті чесно документує причину своєї появи:
`src/components/ui/JournalPreview.tsx:16-23` — рядок "обкладинка 48×70 + назва + додаткові рядки" був
буквально продубльований мінімум 4 рази (`MemoryIndexRow` в `app/memory/index.tsx`, картка в
`app/on-this-day.tsx`, два місця в `src/components/home/OnThisDayCard.tsx`/`HomeContextCard.tsx`) до
"Фази 19", коли з'явився спільний компонент. Це варто зафіксувати як позитивний, підтверджений код-фактом
приклад того, що дублювання іноді реально усувається, а не лише документується заднім числом.

### 35.5 Дублювання, яке лишається невиправленим

`SectionHeader` (той самий "Фаза 19" спільний компонент, `src/components/ui/SectionHeader.tsx`) вирішує ту
саму задачу — "заголовок секції + опціональна дія праворуч", той самий inline-паттерн
`flexDirection:'row', alignItems:'center', justifyContent:'space-between'`. CODE VERIFIED: цей буквальний
inline-паттерн (а не виклик `SectionHeader`) далі повторюється як мінімум у:

- `app/work/[workId].tsx:508` і `app/work/[workId].tsx:1022`
- `app/(tabs)/library/index.tsx:436` і `app/(tabs)/library/index.tsx:456`
- `src/components/home/OnThisDayCard.tsx` (аналогічний inline-блок)
- `app/backup.tsx`

Тобто `SectionHeader` використовується лише в 6 місцях (`grep -rn "SectionHeader" app` = 6), тоді як
буквальний inline-еквівалент його розмітки трапляється щонайменше в 5 інших файлах, які могли б
використати той самий компонент. Це не критичний дефект (не a11y/логічна помилка), а якраз той тип
"дублювання стилю замість спільного компонента", про який просить розділ 35.

### 35.6 Хардкод кольорів/spacing поза `src/design/`

CODE VERIFIED, картина насправді чиста для основного UI:

- `grep "#[0-9A-Fa-f]{6}"` по `app/` знаходить хардкод-кольори лише в **одному** місці —
  `app/_layout.tsx:104-115` (`ErrorBoundary`-компонент кореневого layout). Це навмисний, задокументований
  вибір: коментар у файлі (`app/_layout.tsx:79-83`) прямо пояснює, що межа відлову помилок рендеру не
  повинна залежати від `ThemeProvider`/токенів, які самі могли впасти — кольори продубльовані буквально
  (ті самі значення, що й `lightColors`), а не імпортовані. Це єдиний виправданий виняток, не системна
  проблема.
- Палітри поза `tokens.ts` для fallback-обкладинок (`src/lib/coverFallback.ts:7-14`, 6 кольорів) і
  "вайбів" карток-спогадів (`src/lib/memoryCardMood.ts:28-37`, 7 кольорів) — теж хардкод-hex поза
  `src/design/`, але це навмисні, окремо задокументовані декоративні палітри ("підібрана в стилі design
  tokens" — `coverFallback.ts:4-5`), а не неконсистентне використання UI-кольорів.
- "Магічні числа" spacing (raw numbers замість `theme.spacing.*`) трапляються, але точково: у 10 файлах
  `app/` є хоча б один raw `padding*`/`margin*: <число>` (`app/capsule/[workId]/edit.tsx`,
  `app/data-doctor.tsx`, `app/completion/[workId].tsx`, `app/shelf/[shelfId].tsx`,
  `app/work/[workId].tsx`, `app/isbn-scan.tsx`, `app/_layout.tsx`, `app/(tabs)/library/index.tsx`,
  `app/(tabs)/profile/index.tsx`, `app/(tabs)/calendar.tsx`). Приклади: `app/work/[workId].tsx:1184`
  (`paddingVertical: 2`), `app/isbn-scan.tsx:277` (`paddingHorizontal: 24` — цей другий випадок у контексті
  кастомного camera-overlay UI, де прив'язка до токенів менш критична). Це не масове явище (10 файлів із
  44 маршрутів + 30 спільних компонентів), радше поодинокі відхилення, не системний розлад токенізації.
- `shadowOpacity`/`elevation` — `docs/ARCHITECTURE.md:255` обіцяє "мінімальні тіні (`elevation: 1-2` на
  Android, `shadowOpacity: 0.06` на iOS)" як принцип дизайну. CODE VERIFIED: `grep "shadowOpacity\|elevation:"` по
  всьому `app/`+`src/components`+`src/design` не знаходить **жодного** співпадіння. Це означає або (а)
  застосунок повністю "плаский" без жодної тіні (розбіжність з документацією), або (б) тіні застосовуються
  іншим механізмом, не знайденим цим пошуком — у будь-якому разі задокументований принцип не має явного
  коду, що його реалізує.

### 35.7 Висновок розділу 35

Design-система структурно послідовна й реально відповідає документації щодо переліку компонентів (рідкість
для цього проєкту, судячи з визнаної в самому `ARCHITECTURE.md` розбіжності по маршрутах). Основні
знахідки — не хаос, а точкові відхилення: (1) `motion`/`reduceMotionEnabled` зібрані, але ніде не
використовуються — a11y-намір без реалізації; (2) `SectionHeader` не витіснив усі свої inline-дублікати;
(3) дрібний хардкод spacing у ~10 файлах; (4) задокументований принцип тіней не має відповідного коду.

---

## Розділ 37. Accessibility

### 37.1 Методологія

Усе нижче — виключно **CODE VERIFIED** (наявність/відсутність `accessibilityLabel`/`accessibilityRole`/
`accessibilityHint`/`accessibilityState`/`accessible`/`accessibilityElementsHidden` у JSX) або
**HYPOTHESIS** (оцінка контрасту). Реальна поведінка з VoiceOver/TalkBack — **NOT VERIFIED**: ця сесія не
має доступу до пристрою чи емулятора зі screen reader'ом, і жоден артефакт у репозиторії (лог, звіт,
скріншот) не підтверджує реального прогону з допоміжною технологією.

### 37.2 Спільні компоненти `src/components/ui/` — по кожному

| Компонент | a11y-атрибути в коді | Статус |
|---|---|---|
| `AppText.tsx` | немає (`grep` — 0 збігів) | CODE VERIFIED: відсутні. Очікувано — це текстовий примітив, `Text` сам є accessible-елементом за замовчуванням у RN, явних атрибутів не потребує. |
| `Button.tsx` | `accessibilityRole="button"`, `accessibilityLabel={label}`, `accessibilityHint`, `accessibilityState={{disabled}}` (`Button.tsx:27-30`) | CODE VERIFIED: присутні, повний набір. |
| `Card.tsx` | немає | CODE VERIFIED: відсутні. Card — суто презентаційний контейнер (`View`), не інтерактивний сам по собі — очікувано без власних a11y-атрибутів. |
| `ChipSelect.tsx` | `accessibilityRole="button"`, `accessibilityState={{selected, disabled}}`, `accessibilityLabel={option.label}` (`ChipSelect.tsx:40-42`) | CODE VERIFIED: присутні. |
| `CollapsibleSection.tsx` | `accessibilityRole="button"`, `accessibilityState={{expanded}}`, `accessibilityLabel` (динамічний: "{title}, згорнути/розгорнути") (`CollapsibleSection.tsx:37-39`) | CODE VERIFIED: присутні, якісна реалізація — стан expanded/collapsed явно озвучується. |
| `CoverThumbnail.tsx` | `accessibilityLabel={"Обкладинка: " + title}` на зображенні (`CoverThumbnail.tsx:99`), `accessibilityElementsHidden` на декоративному fallback-блоці (`CoverThumbnail.tsx:121`) | CODE VERIFIED: присутні, коректний патерн (декоративний дублікат прибрано з дерева a11y). |
| `EmptyState.tsx` | немає | CODE VERIFIED: відсутні. Порожній стан — це `AppText`+ілюстрація, без власної інтерактивності; але сам текст порожнього стану, найімовірніше, озвучиться нормально як звичайний текстовий вузол — ризик низький. |
| `LabeledInput.tsx` | `accessibilityLabel={label}` на `TextInput` (`LabeledInput.tsx:40`) | CODE VERIFIED: присутній, але лише `accessibilityLabel` — немає `accessibilityHint`/явного зв'язку `label`↔`input` через `accessibilityLabelledBy` (не критично, RN зазвичай досить `accessibilityLabel` на самому input). |
| `QueryErrorState.tsx` | немає власних (використовує `Button`, який сам має атрибути) | CODE VERIFIED: непрямо покритий через композицію з `Button`. |
| `ReadingProgressBar.tsx` | немає (`grep` — 0 збігів) | CODE VERIFIED: **відсутні**. Це прогрес-бар з відсотком/сторінками — кандидат на `accessibilityRole="progressbar"` + `accessibilityValue={{now, min, max}}`, якого немає. Ризик: screen reader, найімовірніше, озвучить лише видимий текст-число поруч (якщо він є в окремому `AppText`), а не сам індикатор прогресу як семантичний progressbar. |
| `ScreenContainer.tsx` | немає | CODE VERIFIED: відсутні. Очікувано — це layout-обгортка (padding/scroll), не інтерактивний елемент. |
| `StarRating.tsx` | `accessibilityRole="button"`, `accessibilityLabel={"Оцінка " + position + " з 5"}` на кожній зірці (`StarRating.tsx:28-29`) | CODE VERIFIED: присутні по кожній із 5 зірок окремо — хороша деталізація. Немає `accessibilityState`/`accessibilityValue` для поточного обраного рейтингу як єдиного елемента (звучатиме як 5 окремих кнопок, не як один "slider"/"adjustable" елемент — прийнятний, хоч і не ідеальний, патерн). |
| `BookHero.tsx` | немає (`grep` — 0 збігів) | CODE VERIFIED: **відсутні**. Це "hero"-блок з обкладинкою+назвою+автором на капсулі/recall-екранах — суто презентаційний, ризик нижчий, ніж у `ReadingProgressBar`, але повністю без `accessibilityLabel` на композитному блоці означає, що screen reader читатиме кожен внутрішній `AppText`/`CoverThumbnail` окремо, без єдиного семантичного угрупування. |
| `JournalPreview.tsx` | немає | CODE VERIFIED: відсутні. Навмисно "тупий" презентаційний рядок без власної інтерактивності (`JournalPreview.tsx:21-23` — комент явно каже "не включає Pressable-обгортку", кожен виклик сам додає обгортку й, потенційно, її a11y-атрибути) — треба перевіряти на рівні викликів, не самого компонента. |
| `MemorySection.tsx` | немає | CODE VERIFIED: відсутні. Презентаційна секція-обгортка. |
| `QuickAction.tsx` | `accessibilityRole="button"`, `accessibilityLabel={accessibilityLabel ?? label}` (двічі — на двох варіантах рендеру, `QuickAction.tsx:62-63,75`) | CODE VERIFIED: присутні. |
| `SectionHeader.tsx` | немає | CODE VERIFIED: відсутні. Заголовок секції — здебільшого не інтерактивний. |
| `Timeline.tsx` | немає | CODE VERIFIED: відсутні. |

**Підсумок по 18 компонентах**: 6 із 18 мають явні a11y-атрибути (`Button`, `ChipSelect`,
`CollapsibleSection`, `CoverThumbnail`, `LabeledInput`, `StarRating`, `QuickAction` — фактично 7).
Решта 11 — презентаційні контейнери без власної інтерактивності, де відсутність атрибутів очікувана, за
одним помітним винятком: **`ReadingProgressBar`** — семантично це progressbar, і відсутність
`accessibilityRole="progressbar"`/`accessibilityValue` там є реальною прогалиною, а не очікуваною
відсутністю.

### 37.3 Покриття на рівні реальних інтерактивних елементів (`Pressable`/`TouchableOpacity`)

CODE VERIFIED, ширша перевірка по `app/`+`src/components/`: 47 файлів містять `Pressable`/`TouchableOpacity`
(за текстовим `grep`, включно з випадковими згадками в коментарях). Після ручної перевірки трьох файлів,
де `grep -q accessibilityRole` не знаходив збігу (`JournalPreview.tsx`, `SeasonCardPreview.tsx`,
`MemoryCardPreview.tsx`), виявилось, що в усіх трьох слово "Pressable" зустрічається лише **в
коментарі**, що явно документує "цей компонент навмисно без жодного Pressable" (наприклад
`MemoryCardPreview.tsx` — коментар "жодних Pressable" на рядку перед визначенням компонента; підтверджено
повним читанням файлу, реальних `<Pressable>` там немає). Тобто фактичне покриття: **усі файли з реальним
`Pressable`/`TouchableOpacity` мають `accessibilityRole` десь у файлі** — жодного файлу з "голим",
непокритим Pressable-елементом виявлено не було. Це помітно кращий результат, ніж типова картина в
подібних проєктах на цій стадії.

Застереження: перевірка на рівні файлу, не на рівні кожного окремого `Pressable`-виклику — файл із
кількома `Pressable` і хоча б одним `accessibilityRole` де завгодно в ньому пройшов би цю перевірку, навіть
якщо один із кількох `Pressable` не має власного атрибута. Для повної певності знадобився б AST-аналіз
кожного JSX-вузла, що виходить за рамки Grep-аудиту.

### 37.4 Приклади для ключових екранів

`app/work/[workId].tsx` — CODE VERIFIED, файл входить у список 29 файлів `app/` з accessibility-атрибутами
(перевірено `Grep "accessib"` по `app/`). `app/(tabs)/index.tsx` (Головна), `app/(tabs)/library/index.tsx`
(Бібліотека), `app/journal/index.tsx` (Щоденник), `app/memory/[workId].tsx` — усі в тому самому списку.
Екрани **поза** списком (тобто без жодного `accessib*`-атрибута): з 44 маршрутів `app/` лише 29 мають хоч
один збіг — 15 маршрутів (`backup.tsx`, `cover-photo/[editionId].tsx`, `import/review.tsx`,
`isbn-scan.tsx`, `one-book-picker.tsx`, `reading-profile.tsx`, `series/[seriesId].tsx`,
`session/launch/[userBookId].tsx`, `statistics.tsx`, `tbr.tsx`, `tomorrow.tsx`, `work/new.tsx`,
`(tabs)/search.tsx` — **ні**, цей у списку; уточнення: точний перелік 15 "порожніх" файлів варто
перерахувати вручну для фінального звіту, тут — оцінка різниці 44-29=15) не мають власних `accessib*`
атрибутів у собі, але можуть покриватись через спільні компоненти (`Button`, `QuickAction`, тощо), які самі
несуть атрибути — тобто "0 збігів accessib* у файлі екрана" не обов'язково означає "екран не доступний",
якщо весь інтерактив там делегований у `Button`/`ChipSelect`. Це AND CODE VERIFIED-факт (0 прямих збігів),
але не HYPOTHESIS/висновок про реальну недоступність без ручної перевірки кожного з 15 файлів.

### 37.5 Контраст кольорів — HYPOTHESIS

Реальний рендерений контраст **не обчислювався** (немає runtime/скріншота для інструментального
вимірювання) — усе нижче HYPOTHESIS на основі HEX-значень з `tokens.ts`:

- `lightColors.textSecondary` (`#6B6862`) на `lightColors.bg` (`#FAF9F7`) — HYPOTHESIS: візуально помірний
  сірий на майже білому, ймовірно проходить WCAG AA (4.5:1) для звичайного тексту, але не обчислено точно.
- `lightColors.textTertiary` (`#9C988F`) на `lightColors.surface`/`bg` — HYPOTHESIS: світліший за
  `textSecondary`, більший ризик не пройти AA для дрібного (`caption`/`micro`, 13/11px) тексту — саме
  такий випадок уже стався один раз у темній темі (див. 35.2, реальний задокументований фікс
  `darkColors.textTertiary`) і аналогічного явного сліду перевірки для **світлої** теми в коді не знайдено.
- `darkColors.textTertiary` (`#948F84`) — єдиний токен з явним задокументованим WCAG-розрахунком
  (≥4.95:1 на всіх трьох темних фонах) — це найбільш надійний токен у всій палітрі саме тому, що для нього
  є письмовий слід перевірки.
- Кольорові fallback-палітри обкладинок (`coverFallback.ts`) і "вайбів" карток (`memoryCardMood.ts`) —
  використовуються як **фон** під білий/темний текст (`CoverThumbnail`, водяні знаки карток) —
  контраст тексту поверх них НЕ перевірявся в коді жодного разу (немає коментаря/розрахунку, на відміну
  від `darkColors.textTertiary`). HYPOTHESIS: ризик найвищий саме тут, бо палітра (теракота, слива,
  індиго тощо) підбиралась "на око за принципом стриманості", а не за формулою контрасту.

### 37.6 Явне підтвердження: реальна поведінка з допоміжними технологіями

**NOT VERIFIED.** Ця сесія не мала і не має доступу до реального пристрою, емулятора, VoiceOver чи
TalkBack. Жоден файл у репозиторії (включно з `docs/MANUAL_UX_TEST_V1_6.md`, див. розділ 38) не містить
підтвердженого прогону зі screen reader'ом — навпаки, `docs/MANUAL_UX_TEST_V1_6.md` прямо є порожнім
чек-листом, жодна клітинка "Пройдено" не позначена (детальніше — розділ 38). Присутність
`accessibilityLabel`/`accessibilityRole` у коді (розділ 37.2-37.4) — необхідна, але не достатня умова
доброго UX з screen reader'ом: правильність порядку фокусу, озвучення динамічних змін
(`accessibilityLiveRegion` — **не знайдено в коді жодного разу**, `grep` по всьому проєкту дає 0 збігів),
і реальна поведінка на iOS/Android — усе це залишається НЕ ВЕРИФІКОВАНИМ.

---

## Розділ 38. Manual Device Test Status — чесна таблиця

### 38.1 Первинний артефакт: `docs/MANUAL_UX_TEST_V1_6.md`

CODE VERIFIED (текстовий факт): цей документ — **порожній шаблон чек-листа**, написаний явно як шаблон, а
не звіт. Рядки 1-8 самого документа прямо констатують: "Це середовище розробки не має фізичного пристрою
... тож цей документ є чек-листом для власника продукту, не звітом про вже пройдені перевірки. Жодна
клітинка 'Пройдено' нижче не позначена — це свідомо порожній шаблон." Перевірено: усі 17 сценаріїв у
документі (бібліотека з 1 книгою, 100+ книг, кілька "зараз читаю", довгі назви, відсутні обкладинки,
офлайн-режим, таймер у фоні, щоденник, пам'ять про книгу, капсула книги, spoiler-safe, DNF, сезон,
відбиток, темна тема, великий шрифт, малий екран) справді мають незаповнені `[ ] Так [ ] Ні` в кінці.
Підсумковий рядок документа: "Загалом пройдено: _____ / 17" — теж не заповнений.

### 38.2 Milestone-таблиця (`ARCHITECTURE.md`, розділ 9) — важлива розбіжність

`docs/ARCHITECTURE.md:350-361` містить таблицю Milestone 0-11, де **кожен** рядок (крім M11, відкладеного)
позначений "Готово, перевірено на реальному пристрої". Це стосується M0-M10 (базова архітектура, каталог
книг, бібліотека, reading timer, календар/нотатки, цілі/нагадування, prediction/TBR/backup, зовнішній
пошук, polish/a11y/error states/Supabase-каталог, жанри/CSV/автобекап/Goodreads-імпорт, обкладинки
скрізь). Ця таблиця — про milestone-план **до** POLYTSIA V1.5/V1.6 (44-фазний масив пізніших змін, який
іде "поза цією таблицею" за прямим текстом документа, `ARCHITECTURE.md:380-383`). Це означає: для
функціоналу, доданого в 22 фазах V1.6 (капсули книги, recall, spoiler-safe, memory card sharing,
fingerprint, seasons, before/after тощо — усе, що аналізується в цьому звіті) **немає** окремого запису
"перевірено на реальному пристрої" в цій таблиці взагалі — і `docs/MANUAL_UX_TEST_V1_6.md` (розділ 38.1)
прямим текстом підтверджує, що ці 17 сценаріїв (які покривають саме V1.6-функціонал) не пройдені.

Важливо чесно зазначити: цей аудит **не має способу перевірити**, чи реально відбулось те "перевірено на
реальному пристрої" для M0-M10 — жодних скріншотів, відеозаписів чи логів пристрою в репозиторії немає.
Формулювання таблиці — це текстове твердження документа, не CODE VERIFIED і не DEVICE VERIFIED факт із
позиції цього аудиту; воно наводиться тут лише як контекст, не як підтверджений результат.

### 38.3 Мережеві логи цієї сесії

Ця дослідницька сесія працювала виключно статичним аналізом коду (`Read`/`Grep`/`Glob`) в
`/mnt/user-data/uploads/polytsya-m11/` — жодного мережевого виклику, застосунку в емуляторі чи логів
реального пристрою в межах ЦІЄЇ сесії не було й не могло бути (інструментарій сесії їх не підтримує).
Будь-яке посилання на "мережеві логи з епізоду пошуку книг" належить до ширшого контексту аудиту поза цією
підсесією і **не підтверджене незалежно тут** — з позиції цього документа такий рядок не може бути
позначений DEVICE VERIFIED, лише переданий як контекст ширшого аудиту.

### 38.4 Чесна зведена таблиця

| Флоу | Статус | Джерело |
|---|---|---|
| Додавання книги (ручне) | NOT VERIFIED | Немає доказів прогону на пристрої в цій сесії; `ARCHITECTURE.md` таблиця M1 каже "перевірено", але без відтворюваного доказу (розділ 38.2) |
| Зовнішній пошук книг (Google Books/ISBNdb) | NOT VERIFIED у цій сесії (можливий мережевий епізод — поза межами цієї підсесії, не підтверджений тут незалежно) | Контекст ширшого аудиту, не CODE/DEVICE VERIFIED з позиції цього документа |
| Читання/прогрес (timer, сесія) | NOT VERIFIED | Сценарій 7 `MANUAL_UX_TEST_V1_6.md` не позначений |
| Journal entry (нотатка/цитата) | NOT VERIFIED | Сценарій 8 `MANUAL_UX_TEST_V1_6.md` не позначений |
| Spoiler-safe перемикання | NOT VERIFIED | Сценарій 11 `MANUAL_UX_TEST_V1_6.md` не позначений; є лише `AUTOMATED TEST VERIFIED` на рівні чистих функцій (`src/lib/spoilerSafe.test.ts`) |
| Backup/restore | NOT VERIFIED | Немає сценарію в 17-пунктовому чек-листі взагалі (документ V1.6-орієнтований, backup — старіший функціонал); є `AUTOMATED TEST VERIFIED` (`BackupRepository.test.ts`) |
| Onboarding / перший запуск | NOT VERIFIED | Не входить у 17 сценаріїв взагалі — відсутній як перевірений сценарій навіть у чек-листі |
| Пам'ять про книгу / Memory Card sharing | NOT VERIFIED | Сценарій 9 `MANUAL_UX_TEST_V1_6.md` не позначений; `react-native-view-shot`-захоплення й нативний "Поділитися" неможливо перевірити без пристрою |
| Капсула книги / нагадування (`expo-notifications`) | NOT VERIFIED | Сценарій 10 явно каже "перевірити хоча б з коротким тестовим інтервалом" — не позначено |
| Темна тема / контраст | NOT VERIFIED (реальний рендер), HYPOTHESIS (розрахунок за hex) | Сценарій 15; розділ 37.5 |
| Великий шрифт / Dynamic Type | NOT VERIFIED | Сценарій 16 |
| Офлайн-режим | NOT VERIFIED | Сценарій 6; додатково — розділ 39 показує, що заявлений offline-індикатор навіть не реалізований у коді, тож сценарій 6 неможливо було б пройти навіть за наявності пристрою |

**Підсумок**: з ключових флоу — **жодного DEVICE VERIFIED** у межах цієї дослідницької сесії. Це відповідає
очікуванню завдання: майже нічого не протестовано вручну на реальному пристрої для функціоналу V1.6, і сам
проєкт це прямо визнає власним порожнім чек-листом (`docs/MANUAL_UX_TEST_V1_6.md`), а не приховує.

---

## Розділ 39. Offline audit

### 39.1 Перевірка мережевого стану (`NetInfo` тощо) — відсутня в коді

CODE VERIFIED: `Grep "NetInfo|isConnected|isInternetReachable"` по всьому репозиторію (`src/`, `app/`,
`docs/`) дає **рівно один** збіг — і він у `docs/LOCAL_FIRST.md:46-49`, не в коді:

> "Мережа потрібна лише для (M7) пошуку метаданих. `NetInfo`-подібний стан (через `expo-network`, **за
> потреби**) показує делікатний inline-banner лише на екрані пошуку/сканера, ніколи глобальний блокуючий
> overlay..."

Формулювання "за потреби" (умовний спосіб) підтверджує: це опис **наміру/дизайн-принципу**, не реалізованої
поведінки. Ні `@react-native-community/netinfo`, ні `expo-network` не використовуються в жодному файлі
`.ts`/`.tsx` проєкту (перевірено окремо — жодних імпортів). Практичний наслідок: заявлений у
`docs/MANUAL_UX_TEST_V1_6.md` сценарій 6 ("Немає зайвих спінерів/помилок мережі на екранах, що не залежать
від неї") і "делікатний inline-banner" на екрані пошуку **не мають коду, що їх реалізує** — немає жодного
UI-елемента, який явно повідомляв би користувачу "ти офлайн" на екрані пошуку чи будь-де ще.

### 39.2 Реальна поведінка без мережі — degradation-safe / silent fail (підтверджено)

CODE VERIFIED: замість перевірки стану мережі наперед, кожен зовнішній провайдер книг та кожен
Supabase-клієнт покладається на `try/catch` навколо самого `fetch`-виклику, який за відсутності мережі сам
кине помилку `TypeError` (типова поведінка `fetch` без з'єднання), яка ловиться й перетворюється на
"порожній", не аварійний результат:

- `src/data/providers/GoogleBooksProvider.ts:97-101` — `catch` логує `log.warn` і повертає `[]`
  (порожній масив результатів пошуку), а не кидає помилку в UI.
- `src/data/providers/GoogleBooksProvider.ts:134-140` (`getEdition`) — `catch` повертає `null`.
- `src/data/remote/isbndbProxyClient.ts` — коментар на рядку 9 прямо документує патерн: "(try/catch →
  `null`, ніколи не кидає в UI)".
- `src/data/remote/sharedCatalogClient.ts:93-99`, `src/data/remote/curatedCatalogClient.ts:58-64`,
  `src/data/remote/coverStorageClient.ts:65-75` — той самий патерн: тіла відповіді ковтаються через
  `.catch(() => '')`, зовнішній `catch` логує й повертає безпечне порожнє/null-значення.

Це узгоджується з задокументованим "degradation-safe" принципом самого проєкту
(`docs/ARCHITECTURE.md:393`, таблиця ризиків: "кожен провайдер degradation-safe (при помилці — тихий
fallback на порожній результат + повідомлення 'Не вдалося отримати дані', manual entry завжди доступний)")
— і код дійсно відповідає цьому опису. **Підтверджено, а не спростовано.**

### 39.3 Черга відкладених операцій (retry queue) — відсутня, підтверджено навмисно

CODE VERIFIED: `grep "retry.*queue|retryQueue|outbox|pending.*sync|sync_queue"` по всьому `src/`+`app/`+`docs/`
дає збіг лише в `docs/LOCAL_FIRST.md` — і там це також опис **майбутнього**, не поточного стану
(`LOCAL_FIRST.md:31-32`: "Коли з'явиться sync (**не в цьому релізі**), додаються міграцією стовпці
`server_id`, `dirty`, `synced_at`"). Немає ні `sync_queue`-таблиці в SQLite-схемі, ні
in-memory/AsyncStorage-черги невдалих запитів, ні механізму автоматичного повтору при відновленні мережі.
Той самий документ прямо називає це свідомим рішенням, не недоглядом (`LOCAL_FIRST.md:34-39`): "Немає
realtime підписок, немає conflict-resolution engine, немає background sync job... ризик не виправдовує
вигоду в V1 (один користувач, один пристрій)."

Практичний наслідок: якщо запит до `GoogleBooksProvider`/`sharedCatalogClient`/`isbndbProxyClient` падає
через відсутність мережі, результат — порожній список/null **назавжди**, доки користувач не повторить дію
вручну (наприклад, повторний тап "Пошук"). Немає жодного автоматичного retry ні одразу, ні пізніше при
поверненні мережі.

### 39.4 Узгодженість з local-first-принципом — підтверджено

Основна теза `docs/LOCAL_FIRST.md:5-6` ("SQLite — не кеш перед сервером, а основне сховище. Жоден екран
core loop (Home, timer, progress, notes) не має мережевого запиту на критичному шляху") — CODE VERIFIED
узгоджується з тим, що знайдено: усі репозиторії (`src/data/repositories/*.ts`) працюють виключно з
локальним SQLite через `expo-sqlite`; мережеві виклики (`fetch`) знайдені лише в
`src/data/providers/*.ts` (пошук метаданих для додавання книги) і `src/data/remote/*.ts` (spільний
каталог — некритичний кеш-шар, за визнанням самого документа). Основний UX-цикл (бібліотека, читання,
нотатки, статистика) справді не має мережевої залежності — цю частину тези підтверджено кодом.

Але заявлений "offline-індикатор" (39.1) і "черга" (39.3) — **не реалізовані**, а лише задокументовані як
намір. Це найважливіший чесний висновок розділу 39: сам принцип local-first дотримано на рівні архітектури
сховища даних, але UX-складова "користувач розуміє, що він офлайн" — відсутня в коді.

---

## Розділ 40. Error Handling patterns

### 40.1 ErrorBoundary — глобальний, не per-screen

CODE VERIFIED: єдиний `ErrorBoundary` в усьому проєкті — `app/_layout.tsx:85-101`, підключений через
Expo Router конвенцію (компонент з іменем `ErrorBoundary`, експортований з layout-файлу, автоматично ловить
помилки рендеру всього піддерева маршруту). Коментар у самому файлі (`app/_layout.tsx:72-77`) чесно
документує передісторію: "Milestone 8 — аудит показав: такого не було ЖОДНОГО в застосунку, тож будь-яка
непіймана помилка рендеру валила весь застосунок на нативний 'red screen'". Оскільки він підключений на
кореневому `app/_layout.tsx` (а не, наприклад, окремо на кожному маршруті `app/work/[workId].tsx`,
`app/session/[sessionId].tsx` тощо), **немає per-screen ізоляції**: помилка рендеру на будь-якому екрані
приведе до показу того самого загального "Щось пішло не так" на рівні всього `(tabs)`-піддерева, а не
локального fallback лише для проблемного екрана. Це свідомий, задокументований компроміс (один
ErrorBoundary краще за жоден), не помилка — але й не per-screen ізоляція, про яку питає завдання.

### 40.2 `QueryErrorState` — спільний компонент для `isError`

CODE VERIFIED (`src/components/ui/QueryErrorState.tsx`): типовий текст "Не вдалося завантажити дані" +
опціональне уточнення + кнопка "Спробувати ще раз" (`onRetry`, викликає `refetch()` React Query).
Коментар компонента (`QueryErrorState.tsx:14-23`) документує передісторію: Milestone 8 аудит виявив 10
екранів, що перевіряли лише `isLoading`, ніколи `isError`. `CHANGELOG.md:3742-3744` підтверджує список
10 екранів (`statistics`, `day/[date]`, `series/[seriesId]`, `tbr`, `goals`, `reminders`, `work/[workId]`,
`session/[sessionId]`, Бібліотека, Полиця).

### 40.3 Логування — `createLogger` (`src/lib/logger.ts`)

CODE VERIFIED: тонка абстракція над `console.*` (`debug`/`info`/`warn`/`error`), з підмінним
`LogTransport` (`setLogTransport`) — архітектурно готова до підключення production-транспорту, але
**поточний і єдиний** транспорт — `consoleTransport` (`logger.ts:13-30`), що пише виключно в
`console.debug/info/warn/error`. Коментар самого файлу (`logger.ts:3`) прямо каже: "У майбутньому
transport можна підмінити на production-моніторинг (Sentry тощо)".

### 40.4 Remote error reporting / crash analytics — CODE VERIFIED відсутність

`Grep "Sentry|crashlytics"` по всьому репозиторію (`src/`, `app/`, `package.json`) — **0 збігів**. Немає
`@sentry/react-native`, `expo-application`-based crash reporting, `firebase-crashlytics` чи будь-якого
іншого remote error/crash-репортингу в `package.json` чи коді. Уся телеметрія помилок обмежена локальним
`console.*` через `createLogger` — жодна інформація про краш не покидає пристрій користувача. Це
узгоджується із загальним "нуль зовнішніх сервісів без явної потреби" принципом проєкту
(`docs/ARCHITECTURE.md:21-24`, "Свідомо не використовуємо Firebase"), але означає: у production власник
продукту **не отримає жодного сигналу** про реальні краші користувачів, окрім прямого звіту від самого
користувача.

### 40.5 `useMutationErrorHandler` + `ErrorToastProvider` — виправлена помилка методології аудиту

`CHANGELOG.md:3729-3733` документує (в межах Milestone 8 "Обробка помилок"): "**`ErrorToastProvider.tsx`**
(новий) + **`useMutationErrorHandler.ts`** (новий) — жодна з ~29 `useMutation` у застосунку не мала
`onError`... Тепер кожна мутація показує короткий тост знизу екрана з конкретним поясненням".

CODE VERIFIED, файл `src/lib/useMutationErrorHandler.ts` **існує** і реалізує саме це: спільний `onError`
callback для `useMutation`, що логує помилку й викликає `showError(userMessage)` з
`useErrorToast()` (`useMutationErrorHandler.ts:1,15-20`).

**Виправлення (додано під час синтезу звіту, після повторної перевірки на реальному пристрої):** під час
написання цього розділу локальне дзеркало коду `/mnt/user-data/uploads/polytsya-m11/`, яким користувався
цей дослідницький агент, справді не містило `src/design/ErrorToastProvider.tsx` — звідси помилковий
висновок "файл фізично відсутній, застосунок не компілюється". Причина — не дефект коду застосунку, а
прогалина процесу стейджингу файлів у ЦІЙ аудиторській сесії: при підготовці дзеркала явно
копіювались лише `src/design/*.ts` + окремо назва `ThemeProvider.tsx`, і другий `.tsx`-файл у тій самій
директорії (`ErrorToastProvider.tsx`) був пропущений через цю вузьку маску, а не через його відсутність
на реальному пристрої. Перевірка безпосередньо на пристрої користувача (`device_list_dir` на
`src/design/`) підтверджує: **файл реально існує**, 4599 байт, і містить робочу, повну реалізацією
`ErrorToastProvider`/`useErrorToast` (контекст + auto-hide тост-банер з `accessibilityRole="alert"`) —
жодних синтаксичних чи структурних проблем після прочитання повного вмісту файлу не виявлено.

**Виправлений висновок**: твердження "застосунок, найімовірніше, не компілюється" в попередній версії
цього розділу було **хибним і має бути повністю відкликане** — залишається зафіксованим тут навмисно
(закреслено по суті, не видалено) як приклад для власника продукту: методологія цього аудиту (стейджинг
файлів у окреме дзеркало перед делегуванням дослідницьким агентам) сама по собі є джерелом ризику
хибних знахідок, і будь-яка знахідка типу "файл відсутній"/"імпорт не резолвиться" з боку
research-агентів, що працювали виключно з застейдженим дзеркалом (а не напряму з диском користувача),
має піддаватись повторній перевірці перед включенням у Executive Summary. У цьому конкретному випадку
повторна перевірка виконана, і знахідка спростована. Решта висновків розділу 40 (глобальний, не
per-screen `ErrorBoundary`; `QueryErrorState`; `createLogger` лише в консоль; відсутність
Sentry/Crashlytics) стейджинг не зачіпав і лишаються дійсними.

---

## Розділ 41. Notifications

### 41.1 Типи сповіщень (`expo-notifications`, локальні — CODE VERIFIED)

Уся логіка централізована в `src/lib/notifications.ts` (тонка обгортка, як і задокументовано —
`ARCHITECTURE.md:15`: "лише локальні нагадування, без push/сервера" — CODE VERIFIED, `import * as
Notifications from 'expo-notifications'` — жодного серверного push SDK/токена не використовується).

Функції й тригери:

1. **Щоденне нагадування** — `scheduleDailyReminderAsync(timeOfDay, message)`
   (`notifications.ts:53-60`) — тригер `SchedulableTriggerInputTypes.DAILY` на конкретну годину/хвилину.
   Джерело: `src/data/repositories/ReminderRepository.ts` / `src/features/reminders/useReminders.ts`,
   керується користувачем на `app/reminders/index.tsx`.
2. **Тижневе нагадування за обраними днями** — `scheduleWeekdayReminderAsync(weekdays, timeOfDay,
   message)` (`notifications.ts:66-84`) — окремий `WEEKLY`-тригер на кожен обраний день тижня, id
   з'єднані комою в один рядок для подальшого скасування (коментар `notifications.ts:62-65` явно
   пояснює конвертацію нумерації днів JS↔`expo-notifications`, 0-6 vs 1-7).
3. **Одноразове нагадування на конкретну дату** — `scheduleDateReminderAsync(fireAt, title, body)`
   (`notifications.ts:95-101`) — доданий у Фазі 4 V1.6 для "Капсули книги" (reopenAt через 3/6/12
   місяців, `notifications.ts:86-94`).

Скасування — `cancelReminderAsync(notificationIdentifier)` (`notifications.ts:103-107`), універсальний
для всіх трьох типів (розбирає comma-separated id).

### 41.2 Дозволи

`requestNotificationPermissionAsync()` (`notifications.ts:31-36`) — явно запитує дозвіл (для UI-флоу, де
користувач сам вмикає нагадування). Окремо — `hasNotificationPermissionAsync()`
(`notifications.ts:42-45`) — лише **перевіряє**, не запитує; коментар (`notifications.ts:38-41`)
документує чому: "тихе перепланування нагадувань капсул після відновлення бекапу ніколи не повинно самé
спливати системним запитом дозволу" — якісна деталь UX (не турбувати користувача системним діалогом у
фоновому/неочікуваному контексті).

Android-специфіка: `ensureAndroidChannelAsync()` (`notifications.ts:22-29`) створює notification channel
'reminders' перед першим плануванням (Android 8+ вимога), `ARCHITECTURE.md:418` додатково зазначає вимогу
runtime permission `POST_NOTIFICATIONS` для Android 13+.

### 41.3 Налаштування вимкнення в UI

CODE VERIFIED: `app/reminders/index.tsx` — окремий екран управління нагадуваннями (перелік, увімкнення/
вимкнення, редагування). Це підтверджується наявністю `useReminders.ts`
(`src/features/reminders/useReminders.ts`) з мутаціями через `useMutationErrorHandler` (розділ 40.5 —
цей хук, утім, наразі не імпортується успішно через відсутній `ErrorToastProvider`).

Окремо — капсульні нагадування (reopenAt) керуються на рівні "Капсули книги" (`app/capsule/[workId]/edit.tsx`
), а не через загальний екран `reminders/index.tsx` — два незалежні UI-входи в систему нагадувань.

### 41.4 Тести

`Grep "notifications"` по `*.test.ts` знаходить лише один опосередкований збіг —
`src/data/repositories/BackupRepository.test.ts` (найімовірніше, тестує, що бекап/restore коректно
переплановує нагадування як побічний ефект відновлення даних, а не тестує саму бібліотеку сповіщень).
Прямих unit-тестів на `src/lib/notifications.ts` (наприклад, мокування `expo-notifications` і перевірку
правильності конвертації днів тижня 0-6→1-7, чи правильності склеювання/розбирання comma-separated id в
`cancelReminderAsync`) **не знайдено**. AUTOMATED TEST VERIFIED — відсутнє для основної логіки
сповіщень; реальне спрацювання нагадування в обраний час (сценарій 10 `MANUAL_UX_TEST_V1_6.md`) —
NOT VERIFIED (документ прямо просить "перевірити хоча б з коротким тестовим інтервалом" і не позначений
пройденим).

---

## Розділ 42. Memory Card sharing

### 42.1 Механізм захоплення — `react-native-view-shot` (CODE VERIFIED)

Пакет `react-native-view-shot@5.1.0` у `package.json`. Використовується напряму через `captureRef` у
трьох екранах (не через спільну обгортку-хук, кожен екран викликає `captureRef` самостійно):

- `app/memory/[workId].tsx:6,338,352` — картка-спогад книги.
- `app/seasons/[seasonKey].tsx:5,65,81` — картка "Мій читацький сезон".
- `app/fingerprint.tsx:5,71,87` — картка "Читацький відбиток".

Формат захоплення уніфікований — `CAPTURE_OPTIONS = { format: 'png', quality: 1 }` (буквально та сама
константа в усіх трьох файлах, `app/memory/[workId].tsx` коментар пояснює вибір: `'tmpfile'` за
замовчуванням дає реальний `file://`-шлях, потрібний і для `Sharing.shareAsync`, і для
`MediaLibrary.saveToLibraryAsync`). **Формат зображення: PNG, максимальна якість** — CODE VERIFIED для
всіх трьох типів карток.

Кожна картка підтримує обидва виходи — "Поділитися" (`expo-sharing`, `Sharing.shareAsync`) і "Зберегти в
галерею" (`expo-media-library`) — окремі мутації (`shareCard`/`saveCard`) в `app/memory/[workId].tsx:335-363`.

### 42.2 Які саме картки можна шейрити

Три незалежні типи shareable-карток, кожен зі своїм екраном-джерелом:

1. **Картка-спогад про книгу** (`MemoryCardPreview`, `src/components/memory/MemoryCardPreview.tsx`) — 5
   шаблонів (`classic`, `quote`, `stats`, `minimal`, `beforeAfter` — `MemoryCardPreview.tsx:249-494`):
   обкладинка, назва/автор, рейтинг (зірки), обрана цитата/нотатка з щоденника, статистика читання (час/
   сторінки/дні), "до/після" рефлексія, тематичний водяний знак-"вайб" за жанром.
2. **Картка сезону читання** (`SeasonCardPreview`) — підсумок сезону (Зима/Весна/Літо/Осінь).
3. **Картка "Читацький відбиток"** (`FingerprintCardPreview`) — 4-6 бейджів-рис читацької поведінки.

Бейдж/капсула окремо (`app/capsule/[workId]/edit.tsx`) — CODE VERIFIED, `captureRef`/`view-shot` там
**не** використовується (лише в трьох файлах вище) — "Капсула книги" сама по собі не має share-картки,
лише системні нагадування (розділ 41).

### 42.3 Spoiler-контент у shareable-картках — КРИТИЧНА КРОС-ПЕРЕВІРКА

Це найважливіша знахідка розділу 42, перевірена перехресно з розділом spoiler-safe (`src/lib/spoilerSafe.ts`).

**Факт 1 — вибіркова відсутність фільтрації.** `app/memory/[workId].tsx:31` імпортує з `@/lib/spoilerSafe`
лише `isSpoilerSafeActive` і `filterSpoilerSafeLoreEntities` — **не** `filterSpoilerSafeJournalEntries`.
Для порівняння, два інші екрани, що показують журнальні записи щодо прогресу книги, **явно** імпортують і
застосовують саме `filterSpoilerSafeJournalEntries`:
- `app/work/[workId].tsx:41,1113` — `const entries = filterSpoilerSafeJournalEntries(rawEntries ?? [], spoilerSafeActive, {...})`.
- `app/recap/[workId].tsx:14,89` — те саме, з явним коментарем на рядку 68: "інакше recap міг би сам
  стати джерелом спойлера".

`app/memory/[workId].tsx` цього патерну **не повторює**. `allEntries` там береться напряму з
`useJournalEntries(userBookId)` (рядок 306, **без** проходження через `filterSpoilerSafeJournalEntries`) і
використовується у двох місцях без будь-якої spoiler-фільтрації:

- **Побудова самої shareable-картки**: `selectedEntries` (`app/memory/[workId].tsx:397-401`) —
  фільтрує `allEntries` лише за `memory.entryRefs` (id, обрані користувачем при створенні спогаду), без
  жодної перевірки позиції запису відносно поточного прогресу — передається напряму в `MemoryCardPreview`
  (`app/memory/[workId].tsx:467` `entries={selectedEntries}`).
- **`JournalTimeline`** на тому самому екрані (`app/memory/[workId].tsx:502-506`) — рендерить `allEntries`
  напряму (`entries={allEntries ?? []}`), теж без фільтрації — шкала записів щоденника книги 0-100%,
  видима прямо на екрані Memory, ще до самого захоплення картки.

**Факт 2 — коли це реально становить ризик.** `isSpoilerSafeActive` (`spoilerSafe.ts:20-22`) активний лише
для статусів `reading`/`rereading`. Екран `app/memory/[workId].tsx` доступний лише коли `book_memory`-запис
уже створено (доступ через `app/completion/[workId].tsx`, зазвичай після переходу книги в статус
`finished`) — тобто в **звичайному** сценарії (прочитав один раз, створив спогад, поділився) записи
щоденника вже не "попереду" нічого, бо книга дочитана, іspoiler-safe у будь-якому разі не мав би що
приховувати. **Але** для сценарію **"Перечитування"** (`rereading` — той самий `userBookId`, той самий
пул журнальних записів, що продовжує накопичуватись) ризик реальний: якщо користувач повертається на
екран Memory під час активного перечитування (наприклад, щоб оновити чи повторно поділитися старою
карткою), і `memory.entryRefs` включає (або користувач додає) записи, зроблені **під час поточного
перечитування попереду поточного прогресу** — ні сама картка, ні `JournalTimeline` на цьому екрані **не
приховають** такий запис, на відміну від `app/work/[workId].tsx`/`app/recap/[workId].tsx`, де той самий
запис був би прихований. Це реальна, відтворювана в коді (CODE VERIFIED) неконсистентність між трьома
екранами, що мають показувати ту саму spoiler-safe модель — не гіпотетична, а пряма різниця в імпортах і
виклику функцій.

**Факт 3 — lore-сутності фільтруються, журнальні записи ні (та сама неконсистентність, вужче).**
Цікаво, що на тому самому екрані `filterSpoilerSafeLoreEntities` **застосовується** (тобто автор явно
думав про spoiler-safe на цьому екрані для однієї категорії даних — lore/персонажі), але паралельна
функція для журнальних записів — ні. Це виглядає як реальний, а не навмисний пропуск (inconsistent
application того самого патерну в тому самому файлі), а не свідоме архітектурне рішення — жодного
коментаря, що пояснював би, чому журнальні записи на цьому екрані навмисно не фільтруються (на відміну
від, наприклад, `spoilerSafe.ts`, де кожне архітектурне рішення явно закоментоване).

### 42.4 Тести

`AUTOMATED TEST VERIFIED` для самої spoiler-safe логіки — `src/lib/spoilerSafe.test.ts` існує й тестує
`filterSpoilerSafeJournalEntries`/`filterSpoilerSafeLoreEntities`/`isSpoilerSafeActive` на чистих функціях
(`spoilerSafe.test.ts:61-94`). Але цей тест перевіряє лише сáму функцію фільтрації — **не** те, що
`app/memory/[workId].tsx` (чи будь-який конкретний екран) її дійсно викликає. Тобто "логіка фільтрації
правильна" — AUTOMATED TEST VERIFIED; "усі екрани, що мають її застосовувати, дійсно її застосовують" —
**спростовано** для `app/memory/[workId].tsx` (розділ 42.3), і жоден тест цю інтеграцію не покриває
(немає ні integration-тесту на сам екран, ні snapshot-тесту на пропси, що йдуть у `MemoryCardPreview`).

Для самого `MemoryCardPreview`/`SeasonCardPreview`/`FingerprintCardPreview` (рендер картки) і для
`memoryCardFile.ts`/`seasonCardFile.ts`/`fingerprintCardFile.ts` (share/save-логіка) —
`Glob`/`find` за іменами `*memoryCard*test*`, `*seasonCard*test*`, `*fingerprintCard*test*` **не
знаходить жодного тестового файлу**. Захоплення `captureRef` і системні `Sharing`/`MediaLibrary`
виклики за визначенням неможливо unit-тестувати без реального пристрою чи глибокого мокування нативного
шару — тому це NOT VERIFIED (і, реалістично, залишиться NOT VERIFIED навіть у майбутньому без
E2E/device-тестів, не лише зараз).

### 42.5 Висновок розділу 42

Механізм технічно послідовний (один формат захоплення, той самий PNG-вихід, той самий
Share/Save-паттерн для трьох типів карток). Головна знахідка — **реальна, підтверджена кодом
неконсистентність spoiler-safe фільтрації на екрані Memory Card**: два сусідні екрани (`work/[workId]`,
`recap/[workId]`) явно захищають журнальні записи від спойлерів під час перечитування, третій
(`memory/[workId]`, саме той, що генерує shareable-зображення) — ні, хоча на тому самому екрані
spoiler-safe **частково** застосований (до lore-сутностей). Це не catastrophic-рівня дефект (вузьке вікно
ризику — лише активне перечитування з записами, зробленими після поточного відновленого прогресу, і лише
якщо користувач сам не проконтролював, які записи потрапляють у картку), але це конкретний, точно
локалізований пропуск, а не гіпотетичний ризик.

---

## Зведення найважливіших знахідок (для швидкого читання)

1. **[Спростовано, залишено як методологічна примітка] Початковий висновок "`ErrorToastProvider.tsx`
   фізично відсутній, застосунок не компілюється" — хибний**, спричинений прогалиною стейджингу файлів
   у ЦІЙ аудиторській сесії (вузька маска `design/*.ts` пропустила другий `.tsx`-файл у тій самій
   директорії), а не реальним станом коду. Перевірка напряму на пристрої користувача підтверджує: файл
   існує (4599 байт), повністю реалізований, і імпорти в `app/_layout.tsx`/`useMutationErrorHandler.ts`/
   `useReminders.ts` мають резолвитись коректно. Деталі виправлення — розділ 40.5.
2. **[Значуще] Offline-індикатор і мережева черга — задокументовані, але не реалізовані.** `NetInfo`/
   `expo-network` не використовується в коді жодного разу; "делікатний inline-banner" для офлайн-стану
   на екрані пошуку — з коду відсутній. Деградація при відсутності мережі відбувається "мовчки" (порожні
   результати), без retry-черги (підтверджено як свідоме архітектурне рішення V1, не помилка).
3. **[Значуще] Spoiler-safe фільтрація журнальних записів не застосована на екрані Memory Card**
   (`app/memory/[workId].tsx`), хоча застосована на двох сусідніх екранах (`work/[workId]`,
   `recap/[workId]`) і хоча lore-сутності на тому самому екрані фільтруються. Стосується як самого
   shareable-зображення, так і `JournalTimeline` на тому ж екрані.
4. **[Помірно] `reduceMotionEnabled` збирається в `ThemeProvider`, але ніде не споживається** — a11y-намір
   без реалізації.
5. **[Помірно] `ReadingProgressBar` — семантичний progressbar без `accessibilityRole`/`accessibilityValue`.**
6. **[Позитивно] 18 заявлених спільних UI-компонентів справді існують** за заявленими іменами й шляхами —
   документація й код узгоджені в цій конкретній частині, на відміну від деяких інших розділів проєкту.
7. **[Позитивно] Практично всі реальні інтерактивні елементи (`Pressable`/`TouchableOpacity`) мають
   `accessibilityRole`** десь у своєму файлі — жодного файлу з повністю "голим" Pressable не знайдено.
8. **[Чесно визнано самим проєктом] `docs/MANUAL_UX_TEST_V1_6.md` — порожній шаблон**, жоден із 17
   сценаріїв не позначений пройденим; це узгоджується з вимогою завдання показати, що реальне ручне
   тестування на пристрої для V1.6-функціоналу практично відсутнє.
# Розділ 43. Product Feature Inventory

**Метод:** повний обхід `src/features/**` (29 піддиректорій) та `app/**` (44 роути, без урахування двох `_layout.tsx`). Кожен рядок нижче — CODE VERIFIED (точний шлях указано).

| # | Фіча | Короткий опис | Статус | Складність UI |
|---|---|---|---|---|
| 1 | **Library** (`app/(tabs)/library/index.tsx`, `src/features/library/**`) | Головний список книг користувача: 7 фільтрів-чипів за статусом, 2 режими перегляду (список/сітка), сортування, картки-полиці, швидкі дії по довгому тапу | core loop | висока (644 рядки в одному файлі, `LibrarySortSheet`, `BookQuickActionsSheet`, `LibraryCarousel`) |
| 2 | **Reading session** (`app/session/[sessionId].tsx`, `app/session/launch/[userBookId].tsx`, `src/features/reading-session/**`) | Старт/пауза/завершення сесії читання, ціль у хвилинах, нотатка настрою, тег "як читалося" | core loop | середня |
| 3 | **Home** (`app/(tabs)/index.tsx`, `src/features/home/**`) | Дашборд: поточне читання, сьогоднішня статистика, одна контекстна картка (з 5 конкуруючих типів), 4 shortcuts, 3 рекомендаційні картки | core loop | висока (9+ різних секцій на одному екрані) |
| 4 | **Calendar** (`app/(tabs)/calendar.tsx`, `app/day/[date].tsx`, `src/features/calendar/**`) | Календарний перегляд сесій читання по днях | core loop | середня |
| 5 | **Search / Add book** (`app/(tabs)/search.tsx`, `src/features/search/**`) | Уніфікований пошук: власна бібліотека (Work/Series/Shelf/Journal) + 4 зовнішні провайдери (Google Books, ISBNdb, SharedCatalog, CuratedCatalog) + "Додати вручну" | core loop | висока |
| 6 | **Book Details** (`app/work/[workId].tsx`, `app/work/new.tsx`) | Мега-екран книги: статус/прогрес, видання, серія, жанри, теги, власна копія, "давно не читав", до/після, капсула/recall, лор/персонажі | core loop | висока (найбільш перевантажений екран застосунку — агрегує ~10 інших фіч) |
| 7 | **Journal** (`app/journal/index.tsx`, `src/features/journal/**`, `src/features/notes/**`, `src/features/quotes/**`) | Глобальна стрічка нотаток/цитат/моментів по всіх книгах, категорії нотаток, "повернутися пізніше" | доповнення | середня |
| 8 | **Goals** (`app/goals/index.tsx`, `src/features/goals/**`) | Цілі читання (книг/сторінок/хвилин/днів/фініш книги-серії) | доповнення | низька |
| 9 | **Reminders** (`app/reminders/index.tsx`, `src/features/reminders/**`) | Локальні нагадування (щодня/по днях тижня/повернення позики/довільні) | доповнення | низька |
| 10 | **Statistics** (`app/statistics.tsx`, `src/features/statistics/**`) | Загальна статистика: streak, сторінки, час, книги за рік | доповнення | середня |
| 11 | **Trends** (`app/trends.tsx`) | Топ-10 книг за кількістю користувачів, що додали (Supabase RPC) | експериментальне (Milestone 11) | низька |
| 12 | **Activity History** (`app/history.tsx`, `src/features/activity-history/**`) | "Моя історія" — похідна стрічка з 8 типів подій (UNION ALL) | доповнення | низька |
| 13 | **Backup** (`app/backup.tsx`, `src/features/backup/**`) | Експорт/імпорт JSON, авто-бекап, перевірка "здоров'я" бекапу | доповнення | середня |
| 14 | **Data Doctor** (`app/data-doctor.tsx`, `src/features/data-doctor/**`) | Перевірка цілісності даних (осиротілі посилання капсул/сесій тощо) | доповнення | середня |
| 15 | **Library IO / Goodreads import** (`app/import/goodreads.tsx`, `app/import/review.tsx`, `src/features/library-io/**`) | Імпорт CSV з Goodreads + CSV-експорт бібліотеки | доповнення | висока (багатокроковий review-флоу) |
| 16 | **Owned Library / Loans** (`app/(tabs)/library` частково, `src/features/owned-library/**`) | Фізична копія книги (стан/ціна/місце), позики | доповнення | середня |
| 17 | **Series** (`app/series/[seriesId].tsx`, `src/features/series/**`) | Деталі серії, порядок частин, прогрес по серії | доповнення | низька |
| 18 | **Shelf** (`app/shelf/[shelfId].tsx`, `app/shelf/new.tsx`) | Користувацькі полиці з темами оформлення | доповнення | середня |
| 19 | **Wrapped** (`app/wrapped/[year].tsx`, `src/features/wrapped/**`) | Річний підсумок-картка для поділитися (у стилі Spotify Wrapped) | експериментальне | середня |
| 20 | **Reading Seasons** (`app/seasons/[seasonKey].tsx`, `src/features/seasons/**`) | Те саме, що Wrapped, але за сезон (метеорологічний квартал) | експериментальне | середня |
| 21 | **Reading Profile** (`app/reading-profile.tsx`, `src/features/readingProfile/**`) | 6 insight-речень про поведінку читання з мінімальними порогами вибірки | експериментальне | низька |
| 22 | **Reading Fingerprint** (`app/fingerprint.tsx`, `src/features/fingerprint/**`) | 8 поведінкових бейджів (побудованих над тими самими даними, що й Reading Profile) + картка-поділитися | експериментальне | середня |
| 23 | **TBR Reality Check / Personality** (`app/tbr.tsx`, `src/features/tbr/**`) | "N книг чекає", найдовше-очікувана книга, оцінка часу прочитання списку | доповнення | низька |
| 24 | **Tomorrow recommendation** (`app/tomorrow.tsx`, `src/features/tomorrow/**`) | "Що почитати завтра?" — одна книга ЗЗОВНІ (Google Books/куратор), жанр+час+настрій | доповнення | середня |
| 25 | **One Book Picker** (`app/one-book-picker.tsx`, `src/features/onePicker/**`) | "Обери мені книгу" — одна книга З уже наявної бібліотеки (переважно TBR), той самий набір фільтрів настрою/часу | експериментальне (паралельне до #24) | середня |
| 26 | **Memory: Book Memory / Capsule / Recall / Before-After / DNF reflection** (`app/memory/[workId].tsx`, `app/memory/index.tsx`, `app/capsule/[workId].tsx`, `app/capsule/[workId]/edit.tsx`, `app/recall/[workId].tsx`, `app/completion/[workId].tsx`, `src/features/memory/**`) | Найгустіший кластер фіч: 5 різних сутностей "згадати книгу" (детально — Розділ 44) | експериментальне | висока |
| 27 | **On This Day** (`app/on-this-day.tsx`, `src/features/on-this-day/**`) | "Цей день у твоєму читанні" — похідні спогади з минулих років цієї календарної дати | експериментальне | низька |
| 28 | **Personal Lore / Characters** (`app/characters/[workId].tsx`, `app/characters/[workId]/[entityId].tsx`, `app/lore/[workId].tsx`, `app/lore/[workId]/[entityId].tsx`, `src/features/lore/**`) | Нотатки про персонажів/місця/терміни книги, spoiler-safe режим | експериментальне | середня |
| 29 | **Stale Reading Recap** (`app/recap/[workId].tsx`) | "Давно не читав" — нагадування, де зупинився (без AI/зовнішнього переказу) | доповнення | низька |
| 30 | **Reading Experience Timeline** (частина `app/memory/[workId].tsx`) | Горизонтальна шкала "як читалося" по всій книзі | експериментальне | низька |
| 31 | **ISBN scan** (`app/isbn-scan.tsx`) | Сканування штрихкоду камерою для додавання книги | доповнення | середня (камера) |
| 32 | **Cover photo** (`app/cover-photo/[editionId].tsx`) | Заміна обкладинки видання власним фото | доповнення | низька |

**Підсумок:** 44 роути `app/**`, 29 фіче-директорій `src/features/**`, з яких приблизно **7** обслуговують core loop (додав книгу → читаєш → прогрес → завершив), а решта **~22-25** — це нашарування V1.5 (16 фаз) і V1.6 (22 фази) навколо нього. Значна частина "доповнень" і майже всі "експериментальні" фічі виникли не з користувацького запиту через use-тестування, а з послідовних ТЗ-фаз одного product owner, що сам собі писав специфікацію на 22 наступні фази поспіль (`docs/ROADMAP.md`, `docs/V1_6_SPEC.md`) — жодного циклу "випустили → подивились на реальне використання → скоротили" в артефактах репозиторію не зафіксовано.

---

# Розділ 44. Потенційний Feature Bloat

## Чи є дублікати/накладання — так, і застосунок сам це частково документує

Проєкт має незвичну рису: майже кожна нова фіча V1.6 супроводжується документом (`docs/*.md`), який явно порівнює її з попередньою схожою фічею й пояснює, чому вони "насправді різні". Сама частота таких пояснень — непрямий доказ того, що межі між фічами нечіткі навіть для автора коду.

### Пара 1: «Що почитати завтра?» vs «Обери мені книгу» (Tomorrow vs One Book Picker)

CODE VERIFIED, `docs/ONE_BOOK_PICKER.md`, `app/(tabs)/index.tsx` рядки 262-298.

Обидві — картки на Home з ідентичним візуальним патерном (`QuickAction`, іконка+підпис+опис), обидві відповідають на те саме користувацьке питання "що мені почитати?", обидві використовують той самий словник "настроїв" (`PURPOSE_KEYWORDS`) і той самий часовий пресет (`TIME_BUDGET_OPTIONS`). Формальна відмінність — джерело кандидатів (зовнішній каталог vs власна бібліотека) — це архітектурне рішення розробника, не те, що новий користувач інтуїтивно розрізнить із двох майже однакових карток "Що почитати завтра?" / "Обери мені книгу" одна під одною на Home (`app/(tabs)/index.tsx` рядки 371-375: `TomorrowEntryPointCard`, `OnePickerEntryPointCard`, `TrendsEntryPointCard` — три картки поспіль).

### Пара 2: One Book Picker vs TBR Reality Check / TBR Personality

CODE VERIFIED, `docs/TBR_PERSONALITY.md`, `app/tbr.tsx`.

TBR-екран тепер має власну картку "Найдовше чекає: «X». Додано N днів тому." з CTA «Нарешті прочитати» → Book Details. Функціонально це третій "підбери мені книгу зі списку Хочу-прочитати" механізм (після Tomorrow і One Book Picker), лише за іншим критерієм вибору (найстаріша, а не за фільтрами настрою/часу). Три різні алгоритми відповідають на практично те саме питання користувача: "яку з моїх книг читати далі?"

### Пара 3: Book Capsule (перегляд) vs Recall vs Book Memory — три екрани "згадати книгу"

CODE VERIFIED, `docs/RECALL.md` §Відмінність від перегляду капсули, `docs/BOOK_CAPSULES.md` §Точки входу.

- `app/capsule/[workId].tsx` — перегляд власних нотаток капсули.
- `app/recall/[workId].tsx` — "гра-на-пам'ять" перед показом тих самих нотаток капсули.
- `app/memory/[workId].tsx` (Book Memory) — окрема сутність `book_memory` (інша таблиця, інша рефлексія) + компактна версія `BookCapsuleSection` + `ReadingExperienceTimeline` + `JournalTimeline`.

Автор коду сам формулює відмінність як "два різні досвіди, які показують частково той самий вміст, але з різною метою" (`docs/RECALL.md` рядок 55) — це чесне визнання перекриття, не спростування. Для звичайного користувача це: три різні екрани, дві різні бази записів (`book_memory` і `book_capsule`, обидві — вільний текст "що я думаю про цю книгу"), з подібними назвами українською ("Спогад про книгу" vs "Капсула книги" vs "Пригадування") — межа між ними тримається на product-документації, не на інтерфейсі.

### Пара 4: П'ять окремих "аналітика мого читання" екранів

CODE VERIFIED: `app/statistics.tsx`, `app/reading-profile.tsx`, `app/fingerprint.tsx`, `app/wrapped/[year].tsx`, `app/seasons/[seasonKey].tsx`.

Усі п'ять — незалежні `derived aggregate` без спільної обчислювальної основи: кожен документ (`READING_PROFILE.md`, `READING_FINGERPRINT.md`, `READING_SEASONS.md`) буквально повторює формулювання "той самий 'власний запит, власний reduce' підхід, що й Wrapped/Seasons/Statistics/Profile — без композиції хука поверх інших хуків" — це навмисна архітектурна відмова від перевикористання логіки між п'ятьма фактично спорідненими екранами. Наслідок: "найчастіший жанр" рахується незалежно (і потенційно порізному фільтрується за порогами вибірки) одразу в Wrapped, Seasons і Reading Profile — три окремі реалізації того самого поняття. З погляду користувача це п'ять різних місць, куди йти "подивитись на свою статистику", без єдиної точки входу чи ієрархії ("почни зі Statistics, а Fingerprint — це поглиблення" ніде не сказано).

### Пара 5: Journal vs Activity History vs Memory index vs On This Day — чотири "стрічки минулого"

CODE VERIFIED: `app/journal/index.tsx`, `app/history.tsx`, `app/memory/index.tsx`, `app/on-this-day.tsx`.

Усі чотири — хронологічні списки того, що користувач уже зробив/написав, з різним зрізом тих самих першоджерел (`note`/`quote`/`reading_session`/`book_capsule`). Новий користувач, який хоче "подивитись, що я писав раніше", має чотири правдоподібні відправні точки в UI (плюс "Моя пам'ять" у Home shortcuts, яка веде саме на #3).

## Self-aware ознаки самого застосунку

ТЗ Фази 18 (`docs/HOME_REDESIGN.md`) прямим текстом визнає ризик: *"Home НЕ повинен стати нескінченною стрічкою"* — і вводить правило "не більше однієї контекстної картки одночасно" з 5 кандидатів (`stale_reading`/`capsule_due`/`on_this_day`/`goal_near_completion`/`tbr_suggestion`). Це правило зменшує шум лише частково: усе одно на Home одночасно присутні до 9 окремих інтерактивних елементів навіть без "нескінченної стрічки" — `CurrentlyReadingList` (до 5 книг), `TodayStatsRow` (3 цифри), 1 контекстна картка, 4 shortcuts-тайли, 3 рекомендаційні картки (`app/(tabs)/index.tsx` рядки 341-385).

Меню Профілю (`app/(tabs)/profile/index.tsx`, `MENU_ITEMS`) — 12 пунктів одним плоским списком без секцій/групування: "Статистика", "Моя історія", "Цілі читання", "Мій читацький профіль", "Нагадування", "TBR reality check", "Wrapped", "Читацькі сезони", "Мій читацький відбиток", "Резервна копія", "Перевірка даних", "Імпорт з Goodreads". П'ять із дванадцяти пунктів — це варіації "аналітика мого читання" (Статистика/Профіль/Wrapped/Сезони/Відбиток), показані з однаковою візуальною вагою, що й технічні утиліти (Резервна копія, Перевірка даних).

## Когнітивна складність для нового користувача ("додати книгу і почати читати")

HYPOTHESIS (оцінка на основі структури коду, не тестування з людьми): щоб просто додати першу книгу і почати сесію читання, новий користувач стикається щонайменше з такими окремими концепціями, кожна з яких має власний екран/термінологію:

1. 5 нижніх вкладок (Головна/Бібліотека/Календар/Пошук/Профіль) — жодна явно не підписана як "почни тут".
2. Різниця Work/Edition (твір vs видання) — прихована в даних, але впливає на те, що саме показується в результатах пошуку.
3. 4 джерела результатів пошуку одночасно (власна бібліотека, Google Books, ISBNdb, курований каталог) без явного розмежування в UI, яке з якого.
4. 6 статусів книги (Хочу прочитати/Читаю/Прочитано/Відкладено/Не дочитав/Перечитую) — потрібно обрати один одразу при додаванні.
5. Полиці (shelves) — окрема концепція від статусу, з власними темами оформлення.
6. Сесія читання (старт/пауза/ціль у хвилинах/нотатка настрою/"як читалося") — суттєво багатша за просте "оновити сторінку".
7. Після завершення сесії — потенційний ланцюжок запрошень: оцінка, "Спогад про книгу", "Капсула книги", DNF-рефлексія (якщо кинув), before/after порівняння.

Це 7 окремих концептуальних кластерів ще ДО того, як користувач торкнеться будь-якої з ~15 "доповнення/експериментальне" фіч із Розділу 43. Для порівняння: `docs/PRODUCT.md` сам формулює принцип "найчастіші дії — 1 tap, максимум 2" — це витримується на рівні окремих дій, але не на рівні загальної кількості паралельних систем, які треба почати розуміти.

## Висновок розділу (чесна оцінка)

Немає жодної фічі, яка технічно "зламана" через перекриття — кожна документована, кожна ізольована архітектурно (окремі таблиці/хуки, `ON DELETE CASCADE` там, де треба). Проблема не в якості коду окремих фіч, а в **сукупній продуктовій поверхні**: 29 фіче-директорій і 44 роути для однокористувацького офлайн-трекера читання — це істотно більше, ніж мінімально необхідно для core loop, і значна частина приросту (V1.5: 16 фаз, V1.6: 22 фази) — це послідовні "покращення" й "нові паралельні фічі" без жодного зафіксованого циклу видалення чи консолідації. Ризик не гіпотетичний: сам застосунок двічі відкрито визнає його в документації (Home-екран, TBR-картка) — але вирішує його лише на рівні одного екрана (Home), не на рівні всього продукту.

---

# Розділ 46. First-Time User Experience (FTUE)

## Наявність onboarding-флоу — CODE VERIFIED: ВІДСУТНІЙ

Перевірено: `Glob "**/*Onboard*"`, `"**/*FTUE*"`, `"**/*Welcome*"`, `"**/*Intro*"` — 0 результатів у всьому репозиторії. Додатковий пошук за ключовими словами (`onboard`, `tutorial`, `walkthrough`, "перший запуск", "first launch") у всьому дереві — 0 збігів у коді застосунку (є лише 3 збіги в `docs/BUILD_AND_RELEASE.md`/`app.config.ts`/`docs/FINAL_REPORT.md`, усі стосуються процесу запуску білда, не UI onboarding). `docs/MANUAL_UX_TEST_V1_6.md` рядки 3-5 прямо констатують: середовище розробки взагалі не має фізичного пристрою, і ТЗ Фази 22 явно забороняє стверджувати, що device-тест пройдено.

Висновок: **у застосунку немає жодного welcome-екрана, tutorial-кроків, підказок-coach mark чи будь-якого спеціального first-run флоу.** Перше відкриття застосунку веде одразу на `app/(tabs)/index.tsx` (Home), як і будь-яке наступне відкриття.

## Що буквально бачить новий користувач при першому відкритті (CODE VERIFIED, `app/(tabs)/index.tsx`)

1. Привітання за часом доби (`getTimeOfDayGreeting()`) — єдиний персоналізований елемент.
2. `CurrentlyReadingList` — повертає `null` (немає книг у статусі "reading").
3. `TodayStatsRow` — повертає `null` (`data.totalSessions === 0`).
4. `HomeContextCard` — повертає `null` (усі 5 типів кандидатів вимагають наявних даних: жодних сесій, капсул, цілей, спогадів "цей день" чи книг у TBR ще немає).
5. `HomeShortcuts` — 4 тайли РЕНДЕРЯТЬСЯ БЕЗУМОВНО, завжди видимі незалежно від стану даних: «Мій щоденник», «Моя історія», «Моя пам'ять», «Статистика» — усі чотири ведуть на порожні екрани.
6. Три рекомендаційні картки — теж рендеряться безумовно: «Що почитати завтра?», «Обери мені книгу» (де для порожньої бібліотеки результат буде порожнім/нерелевантним, бо кандидати беруться з `user_book`), «Тренди».
7. Явний `EmptyState` (`app/(tabs)/index.tsx` рядки 377-384): заголовок **"Зараз ти нічого не читаєш."**, опис **"Обери книгу з бібліотеки, щоб почати сесію читання."**, кнопка **"Обрати книгу"** → `router.push('/library')`.

Отже: єдиний явний заклик до дії для нового користувача — це один `EmptyState` унизу екрана, ПІСЛЯ семи інших секцій/карток вище (з яких чотири-п'ять на цей момент або порожні, або ведуть у порожні місця). CTA не перший елемент на екрані.

## Другий крок: Бібліотека (CODE VERIFIED, `app/(tabs)/library/index.tsx`)

Тап на "Обрати книгу" веде в Бібліотеку — теж порожню. `FILTER_EMPTY_TEXT['all'] = 'Бібліотека поки порожня.'`, опис **"Знайди книгу через пошук і додай її сюди з Book Details."**, кнопка **"До пошуку"** → `router.push('/search')` (рядки 618-623). Перед тим користувач бачить 7 фільтр-чипів (Усі/Читаю/Хочу прочитати/…), усі так само порожні — сім порожніх станів по черзі, якщо тапати по чипах.

## Третій крок: Пошук (CODE VERIFIED, `app/(tabs)/search.tsx`)

Унормований пошук по 4 джерелах одночасно (власна бібліотека + Google Books + ISBNdb + курований каталог) з явною кнопкою **"Додати вручну"** (рядок 472, веде на `app/work/new.tsx`) для випадку, коли жодне зовнішнє джерело книгу не знайшло. Текстове поле пошуку без жодного пояснювального тексту типу "введи назву або автора" верифіковано не було (не читалась повна розмітка інпуту) — NOT VERIFIED щодо точного плейсхолдера.

## Оцінка зрозумілості (HYPOTHESIS)

ЦЕЙ РОЗДІЛ ЦІЛКОМ ГІПОТЕТИЧНИЙ (HYPOTHESIS) — базується на аналізі коду, не на реальному тестуванні з живими користувачами.

Позитивне: шлях "порожній Home → CTA → порожня Бібліотека → CTA → Пошук → додати" — послідовний, логічний, і на кожному кроці справді є явний текстовий заклик до дії (жодного мовчазного глухого кута). Це відповідає власному принципу `docs/PRODUCT.md`: "Кожен порожній екран пропонує дію, не просто констатує відсутність даних."

Ризиковане: (1) на самому першому екрані користувач бачить 7+ інтерактивних елементів ДО того, як дійде до єдиного релевантного для нього в цей момент CTA внизу — немає жодного механізму, що ховав би shortcuts/рекомендаційні картки, поки бібліотека порожня (вони рендеряться "безумовно", як видно з коду); (2) чотири Home-shortcuts і три рекомендаційні картки одразу зустрічають нового користувача назвами на кшталт "Мій читацький відбиток", "Капсула книги", "TBR reality check" (через Профіль) — термінологія, зрозуміла лише PRODUCT.md-читачу, не новачку без жодного пояснення в UI, що це таке; (3) відсутність будь-якого onboarding означає, що весь концептуальний навантаження з Розділу 44 (7+ кластерів понять) новий користувач має розібрати самостійно, дослідженням інтерфейсу методом спроб — для застосунку такого масштабу фіч (44 роути) це нетривіальний бар'єр входу, навіть якщо кожен окремий крок "порожній стан → дія" сам по собі елегантний.

---

# Розділ 47. Симуляція 7 днів використання

ЦЕЙ РОЗДІЛ ЦІЛКОМ ГІПОТЕТИЧНИЙ (HYPOTHESIS) — базується на аналізі коду, не на реальному тестуванні з живими користувачами.

Припущення сценарію: один активний читач, реалістичний темп — читає щодня по 20-40 хвилин, одну книгу за раз, вряди-годи робить нотатку.

**День 1.** Відкриває застосунок → порожній Home (Розділ 46). Через Пошук знаходить книгу (Google Books), тисне "Додати", обирає статус "Читаю" на Book Details. Переходить у сесію читання (`app/session/launch/[userBookId].tsx` → `app/session/[sessionId].tsx`), читає 25 хв, завершує — `reading_session.duration_seconds`, `end_page` записані (CODE VERIFIED, `src/data/db/migrations/001_base_schema` — `reading_session`). `TodayStatsRow` на Home тепер показує "25 хв сьогодні" (`totalSessions === 1` вже не 0). Home Context Card і далі `null` — жоден із 5 типів кандидатів (stale reading потребує 14 днів без сесії; capsule_due потребує капсули; on_this_day потребує історії за минулі роки; goal near completion потребує активної цілі; TBR suggestion потребує книг у "Хочу прочитати") ще не спрацював на день 1.

**Дні 2-4.** Продовжує щодня. `currentStreak` росте (2, 3, 4). `MIN_SESSIONS_FOR_AVG_DURATION = 5` (Reading Profile, `docs/READING_PROFILE.md`) — ще не досягнуто (4 сесії). Жоден Reading Profile insight ще не показується (усі пороги — мінімум 5 сесій/книг). Reading Fingerprint (`MIN_SESSIONS_FOR_TIME_OF_DAY = 10`, `MIN_HOURS_FOR_SLOW_IMMERSION_BADGE = 15` годин сумарного читання) — недосяжно навіть теоретично за 7 днів по 25-40 хв/день (це 7×40хв ≈ 4.7 год за тиждень, далеко від 15 годин).

**День 5.** П'ята сесія — `MIN_SESSIONS_FOR_AVG_DURATION = 5` пройдено: Reading Profile тепер МІГ БИ показати "Середня сесія — N хв", якщо користувач відкриє `/reading-profile` (Профіль → Мій читацький профіль). Це перший інсайт, реально досяжний за 7 днів — за умови, що користувач узагалі знає, що цей екран існує (він у Профілі, не на Home).

**День 6-7.** Якщо книга коротка (250-350 стор.) і темп читання високий, можливе перше завершення книги: `user_book.status = 'finished'`, `finished_at` проставлено. Це відкриває: запрошення на оцінку (`rating`), запрошення на "Спогад про книгу" (`BookMemorySection`, `app/completion/[workId].tsx`) і на "Капсулу книги" (`BookCapsuleSection`) — обидва одразу на екрані завершення. **Reading Fingerprint бейджі:** жоден недосяжний за 7 днів (найнижчі пороги — `MIN_NOTES_FOR_BADGE = 20`/`MIN_QUOTES_FOR_BADGE = 20` записів, `MIN_FINISHED_BOOKS_FOR_SERIES_BADGE = 5` завершених книг — жоден реалістично не збирається за тиждень одного читача). **On This Day** — потребує історії за минулі роки цієї самої календарної дати; для нового користувача в перший рік вона фізично не існує (спогад міг би з'явитись лише з наступного року). **Wrapped/Seasons/Trends/TBR insights** — Seasons і Wrapped агрегують дані за весь рік/сезон, тож за 7 днів покажуть мінімальні, майже порожні картки (1 книга, кілька сесій) — технічно доступні, але малоцінні.

**Підсумок 7 днів:** з усього багатого шару V1.5/V1.6 фіч реалістично "оживає" за тиждень лише: streak на Home, базова статистика сьогодні/загалом, можливо перший Reading Profile insight (день 5+), можливо перше завершення книги з запрошеннями на Capsule/Memory/rating. Increasing Fingerprint-бейджі, TBR-персональність (потребує накопиченого TBR-списку), Wrapped/Seasons (потребують масштабу року/сезону) і On This Day (потребує кількох РОКІВ) — усі непридатні для оцінки продуктової цінності на горизонті одного тижня; вони структурно розраховані на набагато довший обрій використання (Розділи 48-49).

---

# Розділ 48. Симуляція 1 рік використання

ЦЕЙ РОЗДІЛ ЦІЛКОМ ГІПОТЕТИЧНИЙ (HYPOTHESIS) — базується на аналізі коду, не на реальному тестуванні з живими користувачами.

Припущення: той самий читач, рік потому. Реалістичний темп одного активного читача — 25-40 книг за рік (~500-800 сторінок/тиждень), кілька десятків нотаток/цитат, використання застосунку нерегулярне (не щодня, з паузами).

## Що "розквітає" на горизонті року

- **Reading Seasons** (`docs/READING_SEASONS.md`) — після завершення хоча б одного повного сезону (3 місяці) з'являється перша повноцінна картка "Читацький сезон" з колажем обкладинок, улюбленою книгою, цитатою. За рік — 4 сезони, кожен зі своєю карткою-поділитися.
- **Wrapped** — перший повноцінний річний підсумок наприкінці року, за умови ~25-40 завершених книг це вже змістовна картка (не мінімальна, як на 7-й день).
- **Reading Fingerprint** — за рік реалістично накопичується 15-40 годин читання (якщо 30-40 книг × ~6-8 год/книга) → поріг `MIN_HOURS_FOR_SLOW_IMMERSION_BADGE = 15` цілком досяжний; `MIN_FINISHED_BOOKS_FOR_SERIES_BADGE = 5`/`MIN_FINISHED_BOOKS_FOR_GENRE_EXPLORER_BADGE = 8` — досяжні за рік активного читання; `MIN_NOTES_FOR_BADGE = 20`/`MIN_QUOTES_FOR_BADGE = 20` — досяжні для читача, що робить нотатки хоч зрідка. Реалістично за рік користувач може отримати 4-7 із 8 бейджів.
- **Reading Profile** — усі 6 insight'ів мають реальний шанс пройти пороги вибірки (`MIN_SESSIONS_FOR_TIME_OF_DAY = 10`, `MIN_BOOKS_FOR_TOP_GENRE = 5` тощо) — це перший горизонт, на якому Reading Profile справді "працює за призначенням", а не показує порожній `EmptyState`.
- **On This Day** — усе ще НЕ спрацює протягом самого першого року (потребує МИНУЛОГО року з даними на ту саму календарну дату) — фіча за визначенням марна для будь-кого в перший рік використання. Це структурний парадокс: фіча існує з дня 1 коду, але корисна лише користувачам, які вже пережили принаймні один повний рік із застосунком.
- **TBR Personality** — за рік бібліотека "Хочу прочитати" реалістично накопичує десятки записів (люди додають швидше, ніж читають) → "Найдовше чекає: «X». Додано 340 днів тому." стає правдоподібним і, можливо, неприємно точним відображенням реальної поведінки.
- **Book Capsule / Recall** — з пресетами нагадування `3_months`/`6_months`/`1_year` перші капсули з пресетом `3_months`/`6_months` почнуть "дозрівати" (`reopen_at` настане) протягом року — перший реальний цикл "нагадай мені за 3 місяці → recall" замикається саме на горизонті кількох місяців-року.

## Проблеми масштабування, що можуть проявитись (HYPOTHESIS + CODE VERIFIED щодо механізму)

- **Пошук через `LIKE '%…%'` без FTS5** (CODE VERIFIED, `src/data/repositories/JournalRepository.ts` рядки 125-361, `WorkRepository.ts` рядок 138, `SeriesRepository.ts` рядок 70): це full table scan по TEXT-колонках без індексу для провідного `%`-wildcard. Коментарі в коді самі це визнають ("провідний wildcard ніколи не може використати B-tree індекс") і свідомо приймають компроміс "для тисяч, не мільйонів рядків". За рік активного читача з кількома сотнями нотаток/цитат — це, найімовірніше, ще некритично (десятки-сотні мс), але це вже межа діапазону, для якого рішення офіційно розраховане. Якщо в Розділі 19 цього аудиту (інша група) є вимірювання реальної латентності пошуку — цей розділ варто звірити з тими цифрами; тут це не вимірювалось.
- **Home Context Card / N+1 на due-капсулах** (CODE VERIFIED, `docs/HOME_REDESIGN.md` §Продуктивність): `UserBookRepository.getByIdWithDetails` викликається окремо на кожну "due" капсулу. За рік із пресетами `3_months` кількість одночасно "дозрілих" капсул навряд чи перевищить одиниці — ризик низький, але це прямо визнаний N+1, прийнятний лише завдяки малій очікуваній кількості.
- **Wrapped/Seasons/Profile/Fingerprint — "власний запит, власний reduce" без кешування між екранами**: кожен із п'яти аналітичних екранів наново рахує подібні агрегати (топ-жанр, середні показники) при кожному відкритті — за рік даних (сотні сесій, десятки книг) це вже реальні JS-обчислення на кожен рендер, не мікросекунди на порожній базі.

---

# Розділ 49. Симуляція 5 років використання

ЦЕЙ РОЗДІЛ ЦІЛКОМ ГІПОТЕТИЧНИЙ (HYPOTHESIS) — базується на аналізі коду, не на реальному тестуванні з живими користувачами. Числові оцінки нижче — грубі порядки величини для орієнтації, не бенчмарк.

## Оцінка обсягу даних SQLite (CODE VERIFIED схема, `docs/DATABASE.md`)

Припущення власника продукту з `PRODUCT.md`: "один користувач, кілька місяців-років використання". Екстраполяція на 5 років при ~25-35 книг/рік → **~125-175 книг** реалістичного темпу; сценарій із запиту ("500 книг") — верхня межа активного колекціонера/перечитувача за 5 років, теж правдоподібна.

Ключові таблиці й порядок величини рядків при 500 `user_book`:

- `work`/`edition` — по ~500-600 (з урахуванням кількох видань на твір) — кожен рядок ~0.3-0.5 КБ з текстовими полями (опис твору може бути кілька КБ) → до кількох МБ лише на описи творів.
- `reading_session` — щонайменше 1 сесія на книгу, реалістично 5-15 сесій/книгу (кілька сидінь на книгу) → **2500-7500 рядків**, кожен ~0.2-0.3 КБ (без великого тексту) → ~1-2 МБ.
- `reading_progress` — по одному рядку на кожне завершення сесії + ручні правки → того самого порядку, що й `reading_session`, +30-50% → **3000-10000 рядків**.
- `note`+`quote` — сценарій запиту прямо каже "тисячі journal-записів". При помірній активності (5-10 записів/книгу) на 500 книг → **2500-5000 рядків**, але текстові поля тут найбільші (нотатка/цитата — від кількох слів до кількох абзаців, 0.1-1 КБ кожен) → реалістично **1-5 МБ** лише на текст щоденника, це найбільший за обсягом кластер бази.
- `book_capsule`+`capsule_recall`+`book_memory`+`pre_reading_reflection`+`dnf_reflection` — по щонайбільше одному-кілька рядків на книгу → сотні-тисячі рядків сумарно, невеликий обсяг (кожен рядок — кілька коротких текстових полів).
- `lore_entity`+`journal_lore_link` — залежить від того, наскільки користувач веде нотатки про персонажів; для серійного читача (фентезі/фантастика) може легко дорости до тисяч записів на популярні серії.
- Індекси — CODE VERIFIED (`docs/DATABASE.md` §Індекси): 15+ окремих `CREATE INDEX` на `user_book`/`reading_session`/`note`/`quote`/`book_capsule`/`shelf_book` — при TEXT `id` (UUID, не autoincrement INTEGER, свідомий вибір під майбутню синхронізацію, `docs/DATABASE.md` рядок 11-13) кожен індекс на FK-колонку зберігає повні 36-байтні UUID-рядки, а не 4-8-байтні INTEGER — це помітно збільшує розмір індексів порівняно з autoincrement-схемою, ціна, яку документ сам явно називає ("трохи більший розмір індексів").

**Груба сукупна оцінка**: файл SQLite на 5 років активного використання (500 книг + кілька тисяч journal-записів + сесії + похідні таблиці + індекси на UUID-ключах) реалістично лежить у діапазоні **10-40 МБ** — не критично для мобільного пристрою (сотні МБ-ГБ вільного місця типові), але вже достатньо, щоб: (а) повний JSON-бекап (`docs/BACKUP_FORMAT.md`) — послідовний дамп УСІХ таблиць одним файлом — став помітного розміру файлом для email/cloud-шерингу; (б) `restoreAll` (повна заміна бази з бекапу) — операція, час виконання якої росте лінійно з кількістю рядків, а не миттєва, як на порожній базі. Жодних вимірювань реального часу restore на такому обсязі в репозиторії не знайдено (NOT VERIFIED).

## Проблеми міграцій бази даних з часом

CODE VERIFIED (`docs/DATABASE.md` §Історія міграцій): станом на аудит — **18 послідовних міграцій** (`001`-`018`), керованих через `PRAGMA user_version`, застосовуються послідовно від поточної версії до останньої при кожному запуску. За 22 фази V1.6 і 16 фаз V1.5 виникло 18 файлів міграцій — темп приблизно 1 міграція на 2 фази ТЗ. Дві з них (`002`, `007`) — full table rebuild (`create new → copy → drop → rename`, бо SQLite не підтримує `ALTER CHECK`), з явним `PRAGMA foreign_keys = OFF/ON` навколо, щоб уникнути каскадного обнулення FK. Це вже двічі застосований, працюючий патерн — але кожна майбутня зміна CHECK-обмеження (наприклад, новий статус книги чи нове джерело метаданих) вимагатиме того самого крихкого ручного rebuild-кроку, а не простого `ALTER TABLE`. На горизонті 5 років і продовження темпу "нова фаза → нова таблиця/колонка" (18 міграцій за ~38 задокументованих фаз V1/V1.5/V1.6) можна екстраполювати ще **15-30+ додаткових міграцій**, якщо темп розробки фазами збережеться — це не проблема сама по собі (Expo-рекомендований підхід, `PRAGMA user_version` — стандартний механізм), але довжина ланцюжка міграцій, які треба коректно прогнати послідовно на реальному пристрої користувача з РЕАЛЬНИМИ (не тестовими) даними за 5 років — це саме та категорія ризику, яку `docs/MANUAL_UX_TEST_V1_6.md` відкрито визнає неперевіреною (немає фізичного пристрою в середовищі розробки взагалі, а отже й немає перевірки міграційного ланцюжка на "брудній" продакшн-базі).

## Чи витримає поточна архітектура (локальний SQLite, без serverside backend для основних даних)

Структурно — так, у межах свого явно заявленого діапазону: `docs/PRODUCT.md` і `docs/LOCAL_FIRST.md` прямо й свідомо обирають "один користувач, локальний SQLite" як модель на весь горизонт V1, і схема спроєктована з оглядом на майбутню синхронізацію (UUID PK, `created_at`/`updated_at`/`deleted_at`/`dirty`/`synced_at`-заготовки, `docs/DATABASE.md` рядки 10-15) — тобто якщо через 5 років з'явиться потреба в multi-device sync, це не вимагатиме переписування схеми з нуля.

Ризики, специфічні саме для горизонту 5 років (HYPOTHESIS):

1. **Єдина точка відмови — один локальний файл на одному пристрої.** Без serverside backend для основних читацьких даних, `docs/BACKUP_FORMAT.md`-експорт (ручний або авто-бекап, `src/features/backup/useAutoBackup.ts`) — єдиний захист від втрати 5 років записів при втраті/поломці пристрою. Наскільки надійно й часто спрацьовує авто-бекап у реальному довгостроковому використанні (не лише "чи є код для цього") — NOT VERIFIED у межах цього аудиту коду.
2. **LIKE-пошук без FTS5** (див. Розділ 48) — на 5-річному горизонті з тисячами journal-записів це вже реалістично найближче до межі діапазону, для якого рішення свідомо спроєктоване ("тисячі, не мільйони рядків", коментар прямо в `JournalRepository.ts`) — не обов'язково відчутна проблема, але вже не "з запасом", як на рік 1.
3. **Перечитування й "поточна капсула/прочитання" — задокументоване структурне обмеження** (`docs/BOOK_CAPSULES.md` §Перечитування): застосунок не має сутності "прочитання"/"reading run" — `user_book.finished_at` завжди дата ПЕРШОГО завершення. Для читача, що за 5 років кілька разів перечитує улюблені книги (реалістичний сценарій на такому горизонті), це означає: капсули від різних прочитань розрізняються лише за `created_at` без явного зв'язку з конкретним проходженням, а "Reading Experience Timeline" (Розділ 43, #30) явно документовано НЕ розрізняє сесії різних прочитань — вони змішуються в одну шкалу. Це вже явно визнане, а не приховане обмеження, але саме на горизонті 5 років воно стає реалістично відчутним, не теоретичним.
4. **34 доповнення-фічі підтримувати одночасно.** Кожна нова міграція SQLite (18 і далі) потенційно торкається таблиць, від яких залежать одразу кілька з 29 features/32 екранів (наприклад, `note`/`quote` — джерело для Journal, Activity History, On This Day, Wrapped, Seasons, Reading Profile, Fingerprint, капсул через `journal_entry_id`-посилання). Обсяг поверхні, яку кожна майбутня зміна базової схеми потенційно зачіпає, зростає разом із кількістю фіч із Розділу 43-44 — це організаційний/підтримувальний ризик, не суто продуктивнісний.

**Підсумок:** сама архітектура (локальний SQLite + repository pattern + чіткий шлях до майбутнього sync) — CODE VERIFIED, спроєктована свідомо й задокументовано; вона, найімовірніше, технічно витримає обсяг даних одного користувача за 5 років (порядок 10-40 МБ — не є проблемою для SQLite чи для мобільного сховища). Реальний ризик 5-річного горизонту — не "чи впаде база", а (а) чи надійно спрацьовує єдина лінія захисту даних (бекап) увесь цей час без серверної копії за замовчуванням, (б) чи витримає ланцюжок із 30-50+ послідовних міграцій коректність на реальних "брудних" даних, які ніколи ще не тестувались на фізичному пристрої, і (в) чи не почне сукупна кількість функцій (Розділ 44) ставати важчою в підтримці швидше, ніж росте сама база даних.
# Блок G12 — Диференціація, Ukrainian-first, Product Metrics, V2 Readiness (Auth / Sync / AI)

> Методологія: усі твердження про код позначені **CODE VERIFIED** з точним шляхом до файлу
> (перевірено напряму `Read`/`Grep` у `/mnt/user-data/uploads/polytsya-m11/`). Твердження про
> ринок/конкурентів (Goodreads, StoryGraph) — явно позначені **HYPOTHESIS** або **загальне
> знання (не факт про цей код)**: у мене немає живого доступу до цих застосунків чи їхнього
> коду, лише загальновідомі публічні характеристики категорії "book tracking apps".

---

## Розділ 50: Диференціація на ринку

**Загальне знання (не факт про цей код), контекст категорії:** Goodreads і The StoryGraph —
провідні book-tracking застосунки — типово пропонують: каталог книг, полиці/статуси, оцінки й
рецензії, соціальну стрічку (друзі, лайки/коментарі до рецензій), прогрес читання (сторінка/%),
базову статистику (книг за рік), список бажань (TBR), імпорт CSV. StoryGraph додає
mood/pace-теги для рекомендацій і трохи детальнішу статистику настрою. Жоден із двох, наскільки
це загальновідомо, не пропонує: приватний "капсульний" рефлексійний формат після кожної книги,
структуровану модель персонажів/лору книги, spoiler-safe-фільтрацію власних нотаток за поточним
прогресом читання, чи "читацький відбиток"-бейджі на основі поведінкових патернів.

### Що реально унікальне (CODE VERIFIED)

1. **Spoiler-safe mode** — `src/data/db/migrations/016_spoiler_safe.ts`, `src/lib/spoilerSafe.ts`
   (`isSpoilerSafeActive`, `filterSpoilerSafeLoreEntities`). Колонка `user_book.
   spoiler_safe_enabled` (default ON для активного читання) фільтрує власні нотатки/персонажів
   користувача так, щоб не показувати записи "з майбутнього" відносно поточної сторінки. Це
   вирішує реальну й специфічну проблему: досвідчений читач, що веде нотатки під час читання,
   легко натрапляє на власний спойлер, гортаючи назад щоденник книги, яку ще не дочитав. Ні
   Goodreads, ні StoryGraph (загальне знання) не мають аналога — їхні нотатки/рецензії не
   фільтруються відносно поточного прогресу.
2. **Personal Lore / Characters** — `src/data/db/migrations/015_lore_entity.ts`,
   `app/lore/[workId].tsx`, `app/characters/[workId].tsx`. Єдина таблиця `lore_entity` (тип
   `character`/`place`/`term`/`organization`, реакція, `first_seen_page`/`first_seen_progress`,
   зв'язок із конкретними нотатками/цитатами через `journal_lore_link`). Це структурована
   персональна "вікі" по книзі, яку веде сам користувач вручну (свідомо БЕЗ NLP-екстракції —
   коментар міграції прямо це фіксує, рядок 42-44 файлу). Жоден типовий трекер книг не пропонує
   структурованого ведення персонажів/термінів як частини читацького досвіду.
3. **Deep Reading Memory / Book Capsule + Recall** — `src/data/db/migrations/012_book_capsule.ts`
   ("Капсула книги") і `013_capsule_recall.ts` ("Книга через час"). Капсула — структурований
   рефлексійний знімок одразу після прочитання (з м'яким зв'язком на нотатки/цитати); recall —
   окрема таблиця для повторних "спроб згадати" капсулу пізніше (кожна спроба — окремий рядок,
   капсулу можна відкривати повторно). Це прямий продуктовий заклад на довготривалу пам'ять про
   прочитане, а не миттєву рецензію одразу після завершення — цього немає в жодному типовому
   трекері (рецензія там пишеться один раз і не має вбудованого механізму "згадати пізніше").
4. **Reading Fingerprint / Reading Profile** — `src/lib/readingFingerprint.ts`,
   `src/lib/readingProfile.ts`, `app/fingerprint.tsx`, `app/reading-profile.tsx`. Детермінований
   (без AI/LLM — прямо зазначено в коментарі файлу, рядок 10) набір поведінкових бейджів
   ("Вечірній читач", "Марафонський читач" тощо) на основі вже зібраних локальних даних (час
   доби сесій, середня тривалість, швидкість). Явний продуктовий принцип у коді: "НІКОЛИ не
   негативний, НІКОЛИ не психологічний набір бейджів" (рядок 10-11) — це радше playful
   self-insight картка, ніж аналітичний дашборд. Схоже за духом на Spotify Wrapped-стиль
   картки, але специфічно прив'язане до поведінки читання, не до соціального порівняння.
5. **"Що почитати завтра?"** (`app/tomorrow.tsx`, `src/lib/tomorrowRecommendation.ts`) — локальний
   рекомендаційний крок за мета+час-бюджетом (легке/поплакати/посміятися/вникнути; до 2 год —
   12+ год) виключно на власних даних користувача, без мережевого виклику. Це легша,
   персональніша версія "що читати далі", ніж типовий алгоритмічний feed.

**Висновок Розділу 50 (HYPOTHESIS щодо ринкової цінності, CODE VERIFIED щодо існування
функціоналу):** ці п'ять фіч формують послідовну продуктову тезу — "приватна, рефлексивна,
spoiler-безпечна пам'ять про читання", яка справді відрізняється від соціально-орієнтованого
трекінгу Goodreads/StoryGraph (загальне знання). Це правдоподібна диференціація, але вона
недоведена: жодних даних про реальне використання цих фіч користувачами немає (див. Розділ 52)
— неможливо підтвердити, чи ця диференціація резонує з реальними користувачами, чи просто
незатребувана глибина.

### Де немає диференціації (CODE VERIFIED)

- **Базовий трекінг** (статуси, полиці, оцінки, прогрес по сторінках) — `src/data/db/
  migrations/001_base_schema.ts` (`user_book`, `shelf`, `rating`, `reading_progress`) — це
  точна відповідність базовому функціоналу будь-якого трекера книг, без диференціації.
- **Соціальні функції відсутні майже повністю.** Grep на "sync"/спільні дані показав лише
  `catalog_book_device` / `SharedCatalogClient` (`src/data/remote/sharedCatalogClient.ts`,
  `src/data/remote/catalogSync.ts`) — анонімний лічильник "скільки пристроїв додали цю книгу"
  для екрана "Тренди" (`app/trends.tsx`, топ-10 за кількістю додавань). Немає друзів, немає
  коментарів/лайків, немає профілів інших користувачів, немає рецензій, видимих іншим. Це
  прямо на противагу соціальному ядру Goodreads (загальне знання) — "Полиця" свідомо приватна
  (docs/LOCAL_FIRST.md, підтверджено коментарями коду типу `src/lib/deviceId.ts:22-23`:
  "жодних персональних даних, немає акаунтів/auth"). Це може бути навмисним позиціонуванням
  (privacy-first), а не прогалиною — але як "фіча проти конкурентів" соціальна складова
  об'єктивно значно слабша.
- **Імпорт лише з Goodreads CSV** (`app/import/goodreads.tsx`, `app/import/review.tsx`) —
  типова, очікувана функція для будь-якого альтернативного трекера, не диференціація.
- **Wrapped/річний підсумок** (`app/wrapped/[year].tsx`) — концептуально копіює вже усталений
  патерн (Spotify Wrapped і подібні "рік підсумків" фічі, які й Goodreads, і StoryGraph уже
  роблять — загальне знання) — не унікальна ідея сама по собі, хоч реалізація власна.

---

## Розділ 51: Ukrainian-first продуктовий аудит

### Шар лейблів vs хардкод у JSX — CODE VERIFIED

Існує один централізований файл `src/design/i18n-labels.ts` (222 рядки) — коментар на початку
файлу прямо каже: "Єдине джерело українських підписів для доменних enum-значень. Жодна фіча не
хардкодить ці рядки повторно — імпортує звідси. Увесь user-facing текст застосунку — українською
(п.54 ТЗ)." Він покриває **лише enum-типи** (статуси книг, типи нотаток, формати видань, типи
цілей, шаблони картки-спогаду, теми полиць, категорії перевірки даних, типи подій історії тощо)
— 15 іменованих експортів (`userBookStatusLabels`, `editionFormatLabels`, `noteTypeLabels`,
`memoryCardTemplateLabels`, `shelfThemeLabels`, `activityEventTypeLabels` та інші).

**Це НЕ повноцінний i18n-шар.** Перевірено:
- `package.json` не містить жодної i18n-бібліотеки (`grep -i "i18n|intl|localiz"` — 0 збігів;
  немає `react-i18next`, `expo-localization`, `react-intl`, `i18next`).
- Увесь інший user-facing текст (заголовки екранів, кнопки, підказки, повідомлення про
  помилки, порожні стани) захардкожений прямо в JSX українською мовою, файл за файлом. Перевірка
  показала кириличні рядки в 46 з 46 перевірених `.tsx`-файлів у `app/` та `src/features` —
  тобто буквально кожен UI-файл містить прямий український текст у JSX, не через шар лейблів.

**Наслідок для майбутньої локалізації:** якщо колись знадобиться друга мова (наприклад
англійська для діаспори/міжнародного релізу), це вимагатиме переписати практично кожен `.tsx`
файл під ключ-based переклад (наприклад `t('key')` замість буквального рядка) — `i18n-labels.ts`
допоможе лише для ~15 enum-словників, не для основного тексту інтерфейсу. Це не є проблемою для
поточної версії (моноязична застосунок для українського ринку — свідомий вибір), але це
архітектурний борг, якщо мультимовність колись стане ціллю.

### Англомовні залишки в UI — CODE VERIFIED (не знайдено)

Перевірено: `placeholder=` атрибути в усіх `.tsx` (`app/`, `src/components`, `src/features`) —
лише один нетекстовий випадок (`app/session/[sessionId].tsx:469`, `placeholder={String(...)}` —
це не текстовий рядок, а прив'язка до числового значення сторінки, не переклад). Пошук
JSX-текстових вузлів без кирилиці й з англійськими словами (регулярний вираз по всіх
`.tsx`-файлах `app/`, `src/features`, `src/components`) не знайшов жодного справжнього
англомовного UI-рядка — єдиний хибний збіг був TypeScript-синтаксисом (`Set<...>`), не текстом
UI. **Висновок: англомовних залишків у видимому UI-тексті не знайдено** — застосунок послідовно
україномовний на рівні прямого хардкоду.

### Форматування дат/чисел — CODE VERIFIED (враховує українську локаль)

- `date-fns/locale/uk` імпортується й використовується щонайменше в 10 файлах:
  `src/lib/lastReadLabel.ts`, `app/capsule/[workId].tsx`, `app/day/[date].tsx`,
  `app/journal/index.tsx`, `app/backup.tsx`, `app/history.tsx`, `app/completion/[workId].tsx`,
  `app/wrapped/[year].tsx`, `app/on-this-day.tsx`, `app/(tabs)/calendar.tsx`.
- Пряме форматування через `Intl`/`Date.prototype.toLocaleDateString('uk-UA', ...)` знайдено в
  `src/components/memory/ReadingExperienceTimeline.tsx:77`, `app/recap/[workId].tsx:169`,
  `app/work/[workId].tsx:1376,1400` — з опцією `{ day: 'numeric', month: 'long' }`, що коректно
  дає українську форму місяця в родовому відмінку (наприклад "12 вересня", а не "September 12"
  чи неправильний називний відмінок "вересень"). Це підтверджує, що форматування дат враховує
  українську локаль, а не є простим `.toString()`/ISO-виведенням.
- Окремий доменний файл `pluralizeUk` згадується в списку доменних тестів
  (`docs/V2_READINESS.md`, розділ 6: "13 файлів `src/lib/*.test.ts`... `pluralizeUk`") —
  це вказує на свідому роботу над правильним відмінюванням українських числівників (наприклад
  "1 книга" / "2 книги" / "5 книг"), а не наївне `count + " книг"` для всіх значень. Файл сам
  не був відкритий у цьому дослідженні (поза межами конкретного запиту), але його існування й
  назва — CODE VERIFIED (`docs/V2_READINESS.md` розділ 6, факт перевірено читанням документа).

**Висновок Розділу 51:** Ukrainian-first виконано послідовно на рівні готового продукту
(дати, відмінки, відсутність англомовних залишків) — це не поверхневий переклад, а свідомо
вбудована локаль. Водночас архітектурно це **моноязична** реалізація (прямий хардкод, без
i18n-шару за межами enum-лейблів) — цілком прийнятно для поточної цілі (український ринок), але
майбутня мультимовність вимагатиме суттєвого рефакторингу, не просто додавання файлу перекладів.

---

## Розділ 52: Product Metrics Readiness

**CODE VERIFIED: аналітика використання відсутня повністю.**

- `package.json` не містить жодної аналітичної/crash-reporting бібліотеки — перевірено прямим
  переглядом `dependencies`: немає Sentry, Firebase/Crashlytics, Amplitude, Mixpanel, PostHog,
  Segment чи будь-якого еквівалента.
- Пошук `grep -rniE "analytics|amplitude|mixpanel|posthog|segment\.io|\.track\(|logEvent"` по
  всьому `src/` та `app/` дав лише 7 збігів — і всі вони НЕ про реальну аналітику: коментарі
  документації типу "PRIVATE analytics (ТЗ) — дані нікуди не виходять за межі" (`src/features/
  readingProfile/useReadingProfile.ts:33`), "не створюй таблицю для derived analytics"
  (`src/components/memory/MemoryCardPreview.tsx:45`), назва іконки `'analytics-outline'`
  (`app/(tabs)/profile/index.tsx:42` — це іконка Ionicons для екрана "Статистика", не виклик
  аналітичного SDK). Жодного реального виклику логування подій немає.
- Немає жодного `logger`-виклику, що надсилав би дані на зовнішній сервер — `src/lib/logger.ts`
  (використовується скрізь через `createLogger`) — судячи з патерну використання (`log.warn(...)`
  з локальними повідомленнями), це локальний консольний логер для розробки, не подієвий трекер.

### Що це означає для власника продукту

Власник продукту **не має жодного способу дізнатись**:
- Скільки людей взагалі відкривають застосунок регулярно (retention).
- Які фічі з переліку Milestone 0-11 реально використовуються, а які створені й забуті
  (наприклад: чи хтось насправді користується "Персонажами"/Lore, "Капсулою книги", "Читацьким
  відбитком", spoiler-safe mode — усі ці недешеві архітектурно фічі можуть бути незатребувані,
  і про це неможливо дізнатись з коду).
- На якому кроці користувачі кидають онбординг чи певний флоу (наприклад форму ручного додавання
  книги з 12+ полів — `app/work/new.tsx`, згадана в `docs/V2_READINESS.md` розділ 3).
- Чи трапляються реальні помилки/креші на пристроях користувачів — без crash reporting
  (Sentry/Crashlytics) власник продукту дізнається про баг лише якщо користувач сам напише
  фідбек.
- Приблизний масштаб бази користувачів взагалі (окрім непрямого сигналу з `catalog_book_device`
  — кількість УНІКАЛЬНИХ пристроїв, що додали хоч одну книгу до спільного каталогу; це не
  метрика продукту, а побічний ефект соціальної фічі "Тренди", і покриває лише тих, хто
  користується онлайн-пошуком/спільним каталогом, а не всіх користувачів).

**Позначення: NOT CURRENTLY MEASURED.** Це узгоджується із задокументованим у коді принципом
"local-first, privacy-first, без акаунтів" (`src/lib/deviceId.ts`, `docs/LOCAL_FIRST.md`) —
ймовірно свідомий продуктовий вибір, а не недогляд. Але з точки зору Product/Technical
Architect це означає: рішення про пріоритизацію фіч у V2 (що розвивати, що прибрати) на
сьогодні можуть спиратись ЛИШЕ на якісний фідбек власника продукту та припущення, без жодних
кількісних даних використання. Якщо власник продукту захоче почати вимірювати — це вимагатиме
або (а) інтеграції privacy-friendly self-hosted рішення (наприклад PostHog self-hosted) з явним
consent-флоу, що суперечить поточному "без акаунтів, без збору даних" позиціонуванню, або (б)
свідомого рішення так і залишатись без метрик як частину ціннісної пропозиції "приватність
понад усе".

---

## Розділ 53: V2 Auth Readiness

**Поточний стан (CODE VERIFIED):** авторизації немає взагалі. Пошук "auth"/"signIn"/"signUp" по
всьому коду дав лише коментарі, що явно констатують відсутність auth і пояснюють, чому певні
рішення (rate limiting в Edge Functions) обмежені без нього: `supabase/functions/isbndb-proxy/
index.ts:21-32` ("до появи Auth немає стабільного 'хто саме'... per-user rate limiting
неможливий до Auth... Справжній per-користувач ліміт вимагає Supabase Auth (свідомо поза
межами цього milestone)"). `src/lib/deviceId.ts` — єдиний "ідентифікатор" у системі: анонімний,
випадковий `deviceId`, що зберігається в `expo-secure-store`, використовується ЛИШЕ для
лічильника унікальних пристроїв у спільному каталозі (`catalog_book_device`), явно НЕ
персональний ідентифікатор (коментар рядок 22-23: "не прив'язаний до жодних персональних
даних, немає акаунтів/auth"). У SQLite-схемі немає жодної колонки `user_id` в жодній таблиці
(перевірено повний `001_base_schema.ts`, 18 таблиць) — застосунок фізично однокористувацький
на рівні БД: один локальний SQLite-файл = один читач, без розрізнення "чиї" це дані.

`docs/V2_READINESS.md` розділ 10 (таблиця "Що вже архітектурно готове для V2") описує намір
власника продукту: "опційний шар (Supabase Auth, email+пароль, унікальний @nickname),
local-first лишається для тих, хто не хоче входити" — тобто auth планується як ДОДАТКОВИЙ шар
поверх існуючого local-first ядра, не заміна.

### Оцінка кроків додавання Supabase Auth за складністю

| Крок | Оцінка | Обґрунтування |
|---|---|---|
| Підключення `@supabase/supabase-js` Auth SDK, екрани логіну/реєстрації (email+пароль) | **TRIVIAL–MODERATE** | Supabase вже інтегрований у проєкт як залежність для спільного каталогу (`src/data/remote/sharedCatalogClient.ts`) — сам клієнт і конфігурація вже існують, треба додати лише Auth-модуль SDK і UI-екрани логіну (нових screens за наявним патерном `app/*.tsx`, `ScreenContainer`/`LabeledInput`/`Button` компоненти вже стандартизовані). |
| Додавання `user_id` до SQLite-схеми локальних таблиць | **MODERATE** | `user_book`, `note`, `quote`, `reading_session` тощо — усе вже має мiграційний runner на `PRAGMA user_version` (`docs/V2_READINESS.md` розділ 2) і задокументований принцип "Repository-шар відокремлений від UI; `user_id` — міграція, не переписування" (розділ 10 таблиці). Технічно проста ALTER TABLE-міграція за наявним патерном (17 попередніх міграцій — усі однотипні `ALTER TABLE`/`CREATE TABLE`), АЛЕ для однокористувацького локального SQLite `user_id` сам по собі майже без сенсу (немає кількох користувачів на одному пристрої) — реальна цінність `user_id` з'являється лише РАЗОМ із синхронізацією в хмару (Розділ 54), тобто ця "проста" міграція сама по собі не дає користі без сервер-side синхронізації, яка є набагато складнішим кроком. |
| Прив'язка існуючого анонімного `deviceId` до auth-акаунта | **MODERATE–COMPLEX** | `deviceId` (`src/lib/deviceId.ts`) сьогодні використовується виключно як лічильник унікальних пристроїв для соціальної фічі "Тренди" (`catalog_book_device`), НЕ як власник даних — він не є "чернеткою" ID користувача, тому пряма міграція "deviceId → user_id" не є 1:1 мапінгом. Складність зростає, якщо власник продукту захоче міграцію "цей пристрій уже мав локальні дані, тепер прив'язати їх до щойно створеного акаунта" — потрібен окремий разовий "claim"-флоу (завантажити весь локальний SQLite-стан у Supabase під новим `user_id` при першому логіні), якого зараз немає в коді ЖОДНОЮ мірою (немає жодного коду завантаження user_book/note/quote в Supabase — лише спільний каталог метаданих книг, не персональні дані користувача). Це фактично новий шар логіки, а не перевикористання наявного `deviceId`. |
| RLS (Row Level Security) політики на Supabase для персональних даних | **COMPLEX** | Наразі Supabase (`supabase/schema.sql`, доступний лише частково через Edge Functions) використовується ЛИШЕ для спільного каталогу/кураторської добірки/обкладинок — без жодних персональних таблиць. Додавання персональних даних (нотатки, прогрес, полиці) у хмару вимагатиме зовсім нової схеми з нуля з RLS-політиками "лише власник рядка" — а це прямо новий проєктний шар, не розширення наявного `sharedCatalogClient.ts`, який свідомо спроєктований анонімним і публічним (коментар `src/data/remote/sharedCatalogClient.ts:10`: "без auth-сесій, без realtime"). |
| Міграція існуючого `isbndb-proxy` rate-limiting з pre-auth евристики на справжній per-user ліміт | **TRIVIAL** | Коментар у коді (`supabase/functions/isbndb-proxy/index.ts:21-32`) прямо каже, що це заплановане й очікуване покращення одразу після появи Auth — сама Edge Function уже структурована так, щоб додати `user_id`-based rate limit пізніше. |

**Загальний висновок Розділу 53:** базовий Auth SDK-рівень (логін/реєстрація) — швидкий крок
завдяки вже наявній Supabase-інтеграції та стандартизованим UI-компонентам. Складність
різко зростає не в самому Auth, а в (а) міграції персональних локальних даних у хмару під
конкретного користувача (claim-флоу — не існує зараз ЖОДНОЮ мірою) і (б) проєктуванні
RLS-безпеки для нової персональної схеми з нуля. `deviceId` сьогодні — це не заготовка під
auth-акаунт, а вузькоспеціалізований анонімний лічильник для однієї соціальної фічі; його
"прив'язка" до auth-акаунта — це нова робота, не перевикористання.

---

## Розділ 54: Future Sync Readiness

**Soft-delete патерн — CODE VERIFIED, присутній, але непослідовний.**

Перевірено всі 18 таблиць `001_base_schema.ts` + подальші міграції:

**Мають `deleted_at` (м'яке видалення):** `work`, `edition`, `user_book`, `reading_session`,
`note`, `quote`, `owned_book` (усі — `001_base_schema.ts`), `lore_entity`
(`015_lore_entity.ts`), `note_category` (`008_note_category.ts`, коментар прямо каже: "той
самий патерн, що й `note`/`quote`").

**НЕ мають `deleted_at` (лише `created_at`/`updated_at`, або взагалі без обох — імовірно
hard-delete чи взагалі без видалення в UI):** `author`, `publisher`, `translator`, `genre`,
`tag`, `series`, `series_entry`, `shelf`, `shelf_book`, `reading_progress`, `rating`, `loan`,
`reading_goal`, `reminder`, `app_settings`, `book_memory` (`004_book_memory.ts` — лише
`created_at`/`updated_at`), `book_capsule` (`012_book_capsule.ts` — лише `created_at`/
`updated_at`), `capsule_recall` (`013_capsule_recall.ts` — лише `created_at`).

**Наслідок для майбутньої синхронізації:**

- Для таблиць, що ВЖЕ мають `deleted_at` + `updated_at` (ключові: `user_book`, `note`, `quote`,
  `reading_session`) — це саме той фундамент, що потрібен для offline-first синхронізації:
  last-write-wins за `updated_at` цілком реалізовний, а `deleted_at` дозволяє поширювати
  видалення між пристроями без гонки "пристрій A видалив, пристрій B синхронізував раніше і
  бачить рядок як живий" (типова проблема hard-delete в розподілених системах).
- Для таблиць БЕЗ `deleted_at` (найпомітніше — `shelf`, `rating`, `reading_goal`, `book_capsule`,
  `book_capsule` містить саме ту нову "Deep Reading Memory" фічу, яку Розділ 50 називає
  диференціатором) — синхронізація видалень цих сутностей між пристроями вимагатиме або (а)
  ретроактивної міграції додавання `deleted_at` (проста ALTER TABLE, той самий патерн, що вже
  17 разів застосовувався — **TRIVIAL** сама по собі), або (б) прийняття, що видалення на одному
  пристрої просто не поширюється (ризиковано — "примар-рядки" з'являться знову після sync).
- **`reading_progress`** (позиції прогресу читання по сторінках, `001_base_schema.ts:226-234`) —
  лише `created_at`, без `updated_at`/`deleted_at`, і це append-only таблиця (кожен запис
  прогресу — новий рядок, ніколи не редагується за дизайном). Це фактично ІДЕАЛЬНО готово до
  sync у поточному вигляді (append-only природно уникає конфліктів запису — два пристрої просто
  додають різні рядки, дедуплікація за `id` UUID вирішує решту).
- Немає жодного `sync_version`/`vector_clock`/tombstone-механізму за межами простого
  `deleted_at TEXT` (timestamp, не boolean) — цього достатньо для базового last-write-wins, але
  НЕДОСТАТНЬО для складнішого conflict resolution (наприклад: користувач одночасно редагував
  той самий `note.text` на двох пристроях офлайн — `updated_at`-based LWW просто мовчки
  відкине одну версію без попередження користувача чи merge-стратегії; жодного механізму
  виявлення й показу конфлікту користувачеві в коді немає).
- Немає жодного коду, що взагалі читає/пише персональні дані користувача (`user_book`, `note`,
  `quote`, `reading_session` тощо) в Supabase — весь наявний мережевий шар (`src/data/remote/`)
  стосується ЛИШЕ спільного каталогу метаданих книг (публічні, не персональні дані) і обкладинок.
  Сама інфраструктура двонаправленої синхронізації персональних даних (push/pull, конфлікт-UI,
  retry-черга для офлайн-мутацій) не існує в коді ЖОДНОЮ мірою — лише схема БД частково готова
  до неї.

**Висновок Розділу 54:** схема БД демонструє явний, свідомий (судячи з коментарів у міграціях,
що прямо порівнюють новий код з "тим самим патерном") soft-delete + timestamp-дизайн на
найважливіших, найчастіше редагованих таблицях — це набагато краща стартова позиція для sync,
ніж типовий MVP із чистим hard-delete. Але покриття неповне (нотатно: сама "капсула книги" —
одна з головних диференціюючих фіч Розділу 50 — БЕЗ soft-delete), і найскладніша частина
(двонаправлена синхронізація, conflict resolution UX, offline-мутаційна черга) не існує
взагалі — це велика окрема робота, не "просто увімкнути", навіть з наявною гарною схемою.

---

## Розділ 55: Future AI Readiness

**HYPOTHESIS (оцінка складності майбутньої роботи, не факт про існуючий AI-код — AI/LLM/
embedding відсутні в коді повністю, підтверджено):** пошук "AI"/"LLM"/"embedding"/
"openai"/"anthropic" по всьому коду дав лише коментарі, що явно й неодноразово підкреслюють
СВІДОМУ відсутність AI: `src/lib/readingFingerprint.ts:10` ("детермінований (без AI/LLM)"),
`app/recap/[workId].tsx:59-60` ("Не використовуй external plot summaries... жодного мережевого
виклику, жодного AI-переказу сюжету, лише те, що користувач сам зберіг"),
`src/types/bookCapsule.ts:6` ("НЕ review, НЕ public post, НЕ AI-summary"). Це послідовний,
явний продуктовий принцип "жодного AI" у поточній версії — не недогляд, а рішення.

### Дані, вже структуровано придатні для AI-фіч (CODE VERIFIED, структура даних)

- **Нотатки/цитати з прив'язкою до прогресу** (`note`, `quote` — `page`, `progress_percent`,
  `type`/`tags`, `001_base_schema.ts`) — готовий контекст для "AI-summary моїх нотаток до цієї
  книги" чи "AI, підсумуй мої думки про цю книгу" — текстові дані вже чисто структуровані по
  книзі й по позиції в ній.
- **Reading Profile / Fingerprint** (`src/lib/readingProfile.ts`, `readingFingerprint.ts`) —
  уже обчислені поведінкові агрегати (темп читання, час доби, улюблені жанри) — прямий вхід
  для AI-рекомендацій без потреби рахувати ці ознаки з нуля.
- **Lore Entities** (персонажі/місця/терміни, `lore_entity`) — структурований контекст книги
  очима читача — потенційний вхід для "AI, нагадай мені хто такий цей персонаж" (RAG-подібний
  сценарій на власних нотатках користувача, не зовнішній сюжет — узгоджується з явним
  анти-спойлерним принципом застосунку, `app/recap/[workId].tsx:59-60`).
- **Book Capsule / Recall** — вже структурована рефлексія одразу після прочитання ("Капсула
  книги") — готовий матеріал для "AI, порівняй мою капсулу з тим, що я думаю про книгу зараз"
  (природне продовження вже наявної фічі "recall").
- **Каталог книг** (`work`/`edition`/`genre`/`series`) нормалізований, з жанрами й серіями —
  `docs/V2_READINESS.md` розділ 10 прямо зазначає: "Recommendation engine — Каталог
  нормалізований; локальний крок уже є («Що почитати завтра?»)" — базова матриця
  книга-жанр-серія вже є, підходить як вхід для рекомендаційної моделі (як класичної, так і
  LLM-based).

### Яких даних бракує (HYPOTHESIS)

- **Немає векторного сховища/embedding-стовпця** ніде в схемі (перевірено — жодна таблиця не
  має `BLOB`/`vector`-подібної колонки для embeddings) — будь-яка AI-фіча на основі семантичного
  пошуку (наприклад "знайди схожі нотатки на цю думку") вимагатиме нового шару зберігання
  (окрема таблиця embeddings або зовнішній vector DB) — це нова інфраструктура, не розширення
  наявної SQLite-схеми "на льоту".
- **Немає жодного мережевого виклику до LLM-провайдера** (OpenAI/Anthropic/інше) — інтеграція
  вимагатиме нового Edge Function-проксі (той самий патерн, що вже є для ISBNdb,
  `supabase/functions/isbndb-proxy/`, тобто АРХІТЕКТУРНИЙ ПАТЕРН для безпечного проксі
  зовнішнього платного API вже є і перевірений на практиці — це знижує складність порівняно з
  проєктом, що взагалі не має досвіду з платними зовнішніми API).
- **Немає auth/user-рівня** (Розділ 53) — якщо AI-фічі мають різнитись за користувачем чи
  вимагати rate-limit по користувачу (щоб не отримати ту саму проблему, що вже задокументована
  для ISBNdb-ключа — необмежені запити від імені власника продукту), це блокується тим самим
  "немає Auth" обмеженням, що й у Розділі 53.
- **Немає жодного тексту книги/повного opис сюжету в базі** — і за дизайном НЕ повинно бути
  (`app/recap/[workId].tsx` explicitly забороняє external plot summaries) — тобто AI-фічі, які
  тут доречні, обмежені власним текстом користувача (нотатки/цитати/рефлексії), НЕ переказом
  сюжету книги ззовні — це звужує, але й чітко визначає прийнятний scope AI-фіч, узгоджений із
  вже встановленим анти-спойлерним, приватним продуктовим принципом застосунку.

**Висновок Розділу 55 (HYPOTHESIS):** дані для "AI над власними нотатками" (summary,
семантичний пошук по щоденнику, помічник по персонажах) структуровано підготовлені набагато
краще, ніж у типовому MVP — завдяки вже наявній глибокій моделі (note/quote/lore/capsule з
прив'язкою до прогресу). Найбільший бракуючий шматок — не дані, а інфраструктура виклику
LLM (з проксі-патерном, який уже є прецедент в `isbndb-proxy`, отже відтворюваний) і
відсутність auth/rate-limiting фундаменту, який так само блокує безпечне економічне
масштабування AI-функцій, як і персоналізовану синхронізацію (Розділи 53-54) — ці три
прогалини (Auth, Sync, AI) де в чому взаємопов'язані: усі три впираються в одну й ту саму
відсутню базову інфраструктуру ("хто цей користувач і як безпечно й лімітовано робити
запити від його імені"), а не є трьома незалежними проблемами.
# Група 13 — Нові ідеї, борг і ризики (Розділи 56–61)

Джерело: самостійне дослідження застейдженого коду в `/mnt/user-data/uploads/polytsya-m11/`
(`src/`, `app/`, `docs/`, `supabase/`, `data/`) через Read/Grep/Glob. Жодних правок у код не
вносилось. Стандарт доказів: **CODE VERIFIED** (з точним шляхом), **AUTOMATED TEST VERIFIED**,
**CI VERIFIED**, **NOT VERIFIED**, **HYPOTHESIS** — позначено при кожному твердженні.

---

## Розділ 56. До 15 нових продуктових ідей

Кожна ідея прив'язана до реального repository/таблиці/фічі, що вже існує в коді — не
абстрактна вигадка.

### 1. Читацькі виклики за жанрами ("Прочитай 5 жанрів цього року")
Ціль на кшталт "прочитати книги з N різних жанрів за період", а не лише "N книг" чи "N
сторінок". **CODE VERIFIED**: таблиці `genre`/`work_genre` вже існують і нормалізовані
(`src/data/db/migrations/001_base_schema.ts:42-87`, `GenreRepository.ts`), `ReadingGoalType`
(`src/types/readingGoal.ts:4-11`) вже має п'ять типів і легко розширюється (`enum` + один
новий case у `ReadingGoalRepository.getProgress`, який групує завершені `user_book` за
`work_genre.genre_id` і рахує `DISTINCT`). **Складність: середня** (нова гілка обчислення
прогресу, без нової таблиці).

### 2. Річна теплокарта читання (heatmap активності)
Календарна сітка (як GitHub-контриб'юшенс), де інтенсивність клітинки — активність дня.
**CODE VERIFIED**: `ActivityHistoryRepository.listRecent` (`src/data/repositories/
ActivityHistoryRepository.ts:1-30` і далі) вже агрегує вісім типів подій (сесія, старт,
фініш, оцінка, нотатка, цитата, полиця) в один timestamped потік одним UNION ALL SQL —
достатньо згрупувати ту саму вибірку по днях замість списку. `useWrappedYear.ts` вже рахує
річні агрегати тим самим підходом. **Складність: низька-середня** (переважно UI + один
GROUP BY запит).

### 3. Довільна дата для нагадувань ("одноразове" — `custom` kind)
Схема й repository вже підтримують це — бракує лише UI. **CODE VERIFIED**:
`ReminderKindSchema` (`src/types/reminder.ts:6`) включає `'custom'` і поле `fireAt`, але
`CreateReminderInputSchema` (`reminder.ts:278-283`) навмисно обмежує форму до
`'daily'|'weekday'` з коментарем "custom потребує date+time picker, якого в застосунку ще
немає". Додати date-picker на екрані `app/reminders.tsx` — і четвертий тип нагадувань
запрацює без міграції. **Складність: низька** (модель і repository вже готові).

### 4. Пошук по власній бібліотеці за настроєм/враженням
Фільтр "покажи книги, які я позначив як 'absorbed'/'cry'/'light'" серед уже прочитаного.
**CODE VERIFIED**: `note.reaction`/`quote.reaction` — вільний рядок, навмисно НЕ enum
(`src/types/note.ts:230-232`, `src/types/quote.ts:187`), а той самий словник настроїв
(`light`/`cry`/`laugh`/`absorbed`) уже живе як `RecommendationPurpose` у
`src/lib/tomorrowRecommendation.ts:19` і як колонка `purposes` у `data/curated-books.csv`.
Ідея — перевикористати той самий словник як фільтр у Personal Search (`src/features/
search/`) над уже наявними reaction-полями. **Складність: середня** (потрібен новий
SQL-фільтр + UI chip, дані вже пишуться).

### 5. Особистий "глосарій" термінів/місць/організацій наскрізь усієї бібліотеки
Один екран "усі місця, які я занотував" або "усі терміни" — не по книзі, а по всій
бібліотеці. **CODE VERIFIED**: `LoreEntityType` уже включає `'place'|'term'|'organization'`
(`src/types/loreEntity.ts:480`), `LoreEntityRepository` уже читає їх (перевірено —
`app/lore/[workId].tsx:19-21` пропонує всі чотири типи в UI), але немає жодного екрана, що
агрегує їх МІЖ книгами (лише `workId`-scoped). Потрібен новий `listAllByType(db, type)` у
`LoreEntityRepository.ts` + новий екран. **Складність: середня**.

### 6. Тижневий дайджест "капсул", готових до повернення
Замість одного push-нагадування на капсулу — щотижневий збірний огляд "3 капсули чекають
на тебе". **CODE VERIFIED**: `BookCapsule.reopenAt`/`notificationIdentifier`
(`src/types/bookCapsule.ts:617-636`) і `CapsuleRecallRepository` вже дають усе потрібне для
запиту "усі капсули з `reopenAt <= now` і без recall цього тижня"; `src/lib/notifications.ts`
вже містить логіку планування локальних сповіщень. **Складність: середня** (новий агрегатний
запит + один сценарій планування, без нової таблиці).

### 7. Персональний словник причин DNF ("чому я найчастіше кидаю книги")
Агрегована статистика по `DnfReflection.reason` за весь час. **CODE VERIFIED**:
`DnfReflectionRepository` + фіксований `DnfReasonId` (7 значень, `src/design/dnfReason.ts:
8-15`) — просто `GROUP BY reason` по всіх рядках `dnf_reflection` користувача, дані вже є
(поле `UNIQUE(user_book_id)` — по одному рядку на книгу). **Складність: низька**.

### 8. Друкована/поширювана картка "Wrapped року" (як картка-спогад)
`useWrappedYear.ts` уже рахує річну статистику, але, на відміну від `BookMemory`
(`app/memory/[workId].tsx:6,338,352` — `captureRef`+`expo-sharing`), у Wrapped немає власної
share-картки. **CODE VERIFIED**: паттерн захоплення в PNG і шерингу вже реалізований і
перевірений (`react-native-view-shot`, `expo-media-library` дозволи в `app.config.ts`) —
застосувати той самий компонент до екрана `app/wrapped.tsx`. **Складність: низька**
(перевикористання наявного паттерну, не нова інфраструктура).

### 9. Порівняння сезонів рік до року ("ця осінь vs. минула осінь")
`useReadingSeason.ts`/`src/lib/season.ts` уже рахують межі й агрегати одного сезону —
природне розширення: два виклики тієї самої чистої функції з різними `year`, показані поруч.
**CODE VERIFIED**: `seasonDateRange`/`SEASON_MONTH_RANGE` (`src/lib/season.ts:15-22`) вже
параметризовані по року. **Складність: низька-середня**.

### 10. Розумні (обчислювані) полиці на додачу до ручних
Наприклад, полиця "Прочитано цього літа" — автоматично оновлюється, без ручного
`shelf_book.add`. **CODE VERIFIED**: `ShelfSchema`/`ShelfBookSchema`
(`src/types/shelf.ts:134-161`) зараз чисто ручні (M:N через `shelf_book`); ідея додає
опціональний прапорець "smart" + збережений фільтр (JSON), а рендер списку книг іде тим
самим шляхом, що вже фільтрує бібліотеку в `src/features/library/`. **Складність: висока**
(потрібен generic query-builder за збереженим фільтром, не тривіальне розширення).

### 11. Експорт добірки улюблених цитат в окремий текстовий файл ("моя книга цитат")
`Quote.isFavorite` уже позначає обрані цитати (`src/types/quote.ts:183`);
`src/features/library-io/libraryCsvExport.ts` уже показує робочий паттерн генерації файлу й
`expo-sharing`. **CODE VERIFIED**: досить нового `quotesExport.ts` за тим самим паттерном,
що фільтрує `QuoteRepository` за `isFavorite=true` й форматує в `.txt`/`.md`.
**Складність: низька**.

### 12. Агрегована статистика власних категорій нотаток ("про що я найчастіше пишу")
`NoteCategory` зараз прив'язана до конкретної книги (`userBookId`,
`src/types/noteCategory.ts:942-949`, коментар явно каже "не глобальна") — ідея: НЕ
переробляти модель (яка свідомо per-book), а зробити текстову агрегацію "найчастіші назви
категорій по всіх книгах" (`GROUP BY label COLLATE NOCASE` по всіх активних категоріях
користувача) — суто читальний запит, без зміни моделі. **Складність: середня** (обережна
UX-подача, щоб не сплутати з "глобальною категорією", якої свідомо немає).

### 13. "На часі знову" — нагадування про недочитані серії
Використовує вже наявний `Series`/`SeriesEntry` + `user_book.status`. **CODE VERIFIED**:
`SeriesEntrySchema` (`src/types/series.ts:82-93`) вже дає `position`/`entryType`; ідея —
запит "серії, де є хоч один `finished` том і хоч один ще не читаний том, останній `finished`
> N місяців тому" за вже наявними `user_book`/`series_entry`. **Складність: середня**.

### 14. Читацький "відбиток" по місяцях (не лише сумарний)
`useReadingFingerprint.ts` (`src/features/fingerprint/`) уже рахує агрегований "відбиток"
читацьких звичок; ідея — той самий набір метрик, розбитий по місяцях/кварталах для
відстеження зміни звичок у часі, а не єдиний застиглий знімок. **CODE VERIFIED**:
`bucketTimeOfDay`/`computeTimeOfDayInsight` (`src/lib/readingProfile.ts:27-58`) вже чисті
функції над масивом годин сесій — досить групувати вхідний масив по місяцю перед викликом.
**Складність: середня**.

### 15. "TBR-черга" з ручним пріоритетом (drag-to-reorder)
Зараз "Хочу прочитати" — просто статус `user_book.status='to_read'`, без порядку. Полиці вже
мають `sortOrder` (`src/types/shelf.ts:148`, `ShelfRepository`) — той самий патерн (цілочисельний
`sort_order` + reorder-мутація) можна перенести на TBR-підмножину `user_book`. **CODE
VERIFIED**: `useTbrReality.ts` (`src/features/tbr/`) уже читає цю підмножину без власного
порядку. **Складність: середня** (нова колонка + міграція + UI drag, але паттерн `sortOrder`
вже є в кодовій базі як референс).

---

## Розділ 57. "Що НЕ варто будувати" (мінімум 10 пунктів)

1. **Ніяких лайків/коментарів під чужими книгами в спільному каталозі.** `catalog_book`
   (Supabase) навмисно deny-all для прямого клієнтського доступу, лише SECURITY DEFINER RPC
   без user-контенту (**CODE VERIFIED**, `docs/SECURITY.md:136-145`) — додавання
   публічного тексту від анонімних пристроїв без Auth (розділ "Багато користувачів" у
   `docs/ROADMAP.md:40` прямо названо "поза межами V1", і не випадково: без стабільної
   ідентичності модерація неможлива) відкриє площину для спаму/зловживань, яку зараз
   архітектура структурно виключає.
2. **Ніякого автоматичного "розумного" видалення чи злиття записів щоденника.** Нотатки й
   цитати — приватний, ручний журнал (`note`/`quote`); будь-яка "AI очистка дублікатів"
   суперечить самій природі особистого архіву — користувач сам вирішує, що лишити.
3. **Ніякого NLP entity extraction з тексту книги для Personal Lore.** Прямо заборонено
   власним ТЗ (**CODE VERIFIED**, `src/types/loreEntity.ts:493` — "НЕ wiki, лише те, що
   користувач сам занотував (ТЗ: 'Не роби NLP entity extraction')"). Автоматичний парсинг
   персонажів/місць — це вже територія авторських прав видавця (не власний контент
   користувача) і принципово інший продукт.
4. **Ніякої фонової/примусової cloud-синхронізації всієї бібліотеки без явної згоди.**
   `docs/LOCAL_FIRST.md` — заявлений принцип; наявна Supabase-інфраструктура навмисно
   мінімальна (спільний каталог метаданих книг, не дані користувача) — розширення її до
   "автоматичний бекап у хмару за замовчуванням" суперечить тому, що застосунок продає як
   свою ідентичність (офлайн-first, без акаунту).
5. **Ніякого реклама/трекінгу третіх сторін (Google Ads SDK, Facebook Pixel тощо).**
   Немає жодного analytics SDK в `package.json` зараз (**CODE VERIFIED**, розділ 60) — додавання
   рекламного SDK для монетизації зруйнує і приватність, і "спокійний преміальний"
   дизайн-принцип (`docs/V2_READINESS.md`, розділ 9).
6. **Ніякого "gamification-спаму"** (бейджі/стрики/пуш-нагадування "не втрачай стрик!").
   Продукт свідомо уникає тиску й змагальності (немає жодного "streak" поля в схемі —
   **CODE VERIFIED**, немає такої колонки в жодній міграції `src/data/db/migrations/`) —
   додавання цього зараз суперечило б уже усталеному "спокійному" тону нагадувань
   (`src/lib/notifications.ts` формулює нагадування описово, не тривожно).
7. **Ніякого AI-генерованого summary/рецензій книг всередині застосунку.** `BookCapsule`
   явно документована як "НЕ review, НЕ AI-summary" (**CODE VERIFIED**, `src/types/
   bookCapsule.ts:585`) — це б перетворило особистий рефлексивний інструмент на генератор
   контенту, і суперечило б "приватному" позиціонуванню.
8. **Ніякого власного механізму позик/трекінгу "кому я дав книгу" з нагадуваннями-тиском.**
   Таблиця `loan` уже зарезервована в бекап-форматі (`docs/BACKUP_FORMAT.md:21`
   — `"loan": [...]`) але порожня/невикористана в кодовій базі (`grep` по репозиторіях не
   знайшов `LoanRepository`) — розширювати варто обережно й мінімально: соціальний тиск
   "нагадування боржнику" — не роль цього застосунку.
9. **Ніякого редизайну під "соціальну стрічку" (feed чужих читацьких активностей) без
   попереднього рішення про Auth.** `docs/ROADMAP.md:42` прямо документує це як
   заблоковане на Authentication — будувати UI стрічки заздалегідь, без даних про інших
   користувачів, означає або підробні дані, або мертвий екран.
10. **Ніякого blockchain/NFT/"довести, що ти прочитав" сертифікатів.** Не з'являється в
    жодному документі продукту (`docs/PRODUCT.md`, `docs/ROADMAP.md`) — класичний приклад
    hype-фічі, що не розв'язує жодну реальну потребу читача й додає складність без
    користувацької цінності.
11. **Ніякого примусового переходу на платну підписку для вже наявних безкоштовних фіч.**
    `docs/ROADMAP.md:41` документує: "Немає жодної paywall-логіки в коді" — якщо монетизація
    з'явиться, вона мусить бути новим шаром ЗВЕРХУ, ніколи не "замкненням" уже доступного
    функціоналу (втрата довіри користувачів, які вже отримали ці фічі безкоштовно).
12. **Ніякого автоматичного постингу в соцмережі від імені користувача.** `expo-sharing`
    зараз відкриває системний sheet (користувач сам обирає, куди поділитися карткою-спогадом
    — **CODE VERIFIED**, `app/memory/[workId].tsx`) — пряма інтеграція з конкретними
    соцмережами (API Instagram/Twitter) додає складність підтримки токенів third-party API
    заради того, що системний share sheet уже робить простіше й приватніше.

---

## Розділ 58. Technical Debt Register

| # | Опис боргу | Файл/локація (CODE VERIFIED) | Ризик | Вартість |
|---|---|---|---|---|
| T1 | Дублювання парсингу `EXPO_PUBLIC_SUPABASE_URL`/normalizing-логіки (обрізання `/rest/v1`) буквально ідентичним кодом у 4 файлах, без спільної утиліти | `src/data/remote/sharedCatalogClient.ts:27-30`, `isbndbProxyClient.ts:25-28`, `coverStorageClient.ts:17-20`, `curatedCatalogClient.ts:16-19` | Низький (працює коректно, але зміна формату URL вимагає редагування в 4 місцях синхронно) | S |
| T2 | Навмисне часткове дублювання `isbn.ts` (валідація контрольної цифри) між мобільним застосунком і Deno Edge Function — задокументовано як усвідомлений компроміс, але без автотесту, що обидві копії лишаються синхронізованими | `src/lib/isbn.ts` vs `supabase/functions/isbndb-proxy/isbn.ts` (коментар прямо визнає ризик розходження, рядки 10-14 другого файлу) | Середній (розходження алгоритму означає різну поведінку валідації клієнт/сервер, виявиться не одразу) | S |
| T3 | `jest.config.js` `collectCoverageFrom` обмежений лише `src/domain/**` і `src/lib/**` — 21 файл repository-тестів (`src/data/repositories/*.test.ts`) існує й проходить, але НЕ враховується в жодному coverage-звіті | `jest.config.js:26` | Низький (тести реальні, лише метрика покриття вводить в оману) | S |
| T4 | Жоден React-хук у `src/features/*` (29 директорій, кожна з `use*.ts`) не має власного unit/integration тесту — уся логіка непрямо покрита лише тестами repository-шару, під яким хук працює | Увесь `src/features/**/use*.ts` (наприклад `src/features/goals/useGoals.ts`, `src/features/reminders/useReminders.ts`) — 0 файлів `*.test.ts` у жодній з 29 директорій (перевірено `find`) | Середній (регресії в самій логіці React Query — invalidate/select/derive — не зловить жоден автотест) | M |
| T5 | Немає rollback ("down") міграцій — `migrationRunner.ts` застосовує 18 послідовних `up`-міграцій без зворотного шляху; невдала міграція на реальному пристрої користувача не має автоматичного відкату | `src/data/db/migrationRunner.ts`, `src/data/db/migrations/001…018_*.ts` (жодного `down`) | Середній (одноразовий ризик при кожному новому релізі з міграцією; зменшується тим, що WAL/транзакційність SQLite є, але не перевірено на реальному пристрої — див. розділ 60) | M |
| T6 | Резервна копія (`BackupRepository`) — повний plaintext JSON без опції шифрування/пароля, попри те, що містить приватні нотатки/цитати/DNF-причини | `docs/BACKUP_FORMAT.md`, `src/data/repositories/BackupRepository.ts` (немає жодного `encrypt`/`password` символу — перевірено grep) | Середній (дублюється в розділі 59/60 як продуктовий/приватності ризик, тут — як конкретний технічний пробіл: немає навіть опційного шару) | M |
| T7 | `.gitignore`/CI-артефакт "Claude outputs/" — тека, яку створює десктоп-застосунок Cowork при збереженні файлів, спеціально виключена з Jest (`testPathIgnorePatterns`), але не підтверджено, що вона також у `.gitignore` — ризик випадкового коміту дублікатів файлів | `jest.config.js:20-25` (коментар прямо описує проблему, яку довелось обходити) | Низький | S |
| T8 | Немає жодного `ErrorBoundary` нижче кореневого рівня (`app/_layout.tsx`) — одна межа на весь застосунок; крах у глибоко вкладеному екрані (наприклад, рендер картки-спогаду) відкочує користувача на весь стек, а не лише на проблемний екран | `app/_layout.tsx:85-101` (єдиний `ErrorBoundary` у всьому дереві — перевірено `grep -rln ErrorBoundary`) | Низький-середній | M |
| T9 | `console.log`/`console.error` як постійне діагностичне логування додано напряму в Edge Function і клієнтський `fetchIsbndb` "для майбутньої діагностики" — не через `Logger`-абстракцію (`src/lib/logger.ts`), яку решта коду використовує послідовно | `docs/SECURITY.md:51-53` (сам документ визнає: "Додано постійне діагностичне логування (`console.log`/`console.error` у `fetchIsbndb`, `index.ts`)") | Низький (Edge Function — окремий Deno-рантайм, де `Logger`-абстракція клієнта об'єктивно не застосовна, але непослідовність підходу лишається) | S |
| T10 | Zustand у залежностях (`package.json:57` — `"zustand": "^5.0.15"`), але жодного явного store-файлу не знайдено в `src/` (уся логіка стану йде через `@tanstack/react-query` + `useState`) — або мертва залежність, або недокументоване використання десь у компонентах | `package.json` dependencies vs відсутність `*Store.ts`/`create(` патерну в `src/` (не підтверджено остаточно без повного індексного проходу по кожному `.tsx`) | Низький | S (перевірити й або задокументувати призначення, або прибрати) |

---

## Розділ 59. Product Debt Register

| # | Опис продуктового боргу | Локація | Вплив на користувача |
|---|---|---|---|
| P1 | Резервна копія — повний, нешифрований JSON з усіма приватними нотатками/цитатами/DNF-причинами/pre-reading рефлексіями, який `expo-sharing` дозволяє відправити будь-яким каналом (месенджер, email, хмарний диск) без попередження про вміст | `docs/BACKUP_FORMAT.md`, `src/features/backup/useBackup.ts` | Середній-високий (користувач, що не усвідомлює вміст файлу, може ненавмисно поширити дуже особисті записи — DNF-причини, pre-reading очікування — каналом без шифрування) |
| P2 | `Reminder.kind: 'custom'`/`'loan_return'` існують у моделі й типах, але недоступні у формі створення (`CreateReminderInputSchema` обмежує до `daily`/`weekday`) — користувач бачить у документації/коді можливість, якої немає в UI | `src/types/reminder.ts:273-283` | Низький-середній (не видно кінцевому користувачеві напряму, але недокументована для нього невідповідність "що можна" в схемі й "що доступно" в UI) |
| P3 | `Shelf.theme` — вільний `TEXT` без CHECK, з явним коментарем "будь-яке нерозпізнане значення трактується як `'classic'`" — полиці, створені зі старими темами (`mystery`/`historical`/`drama`/`comedy`, прибраними Доповненням13), мовчки "втрачають" візуальну тему без жодного повідомлення користувачу про те, що сталось | `src/types/shelf.ts:114-121` | Низький-середній (тихий downgrade вигляду вже створеної користувачем полиці без пояснення) |
| P4 | `version: '0.1.0'` у `app.config.ts` не змінювалась попри завершення 16 фаз V1.5 і 22 фаз V1.6 — версія, яку побачить користувач у сторі/налаштуваннях, не відображає реального обсягу продукту | `app.config.ts:31` | Низький (косметично, але плутає при підтримці — "яка версія в кого встановлена" неможливо відрізнити між V1.5 і V1.6 білдами за самим номером) |
| P5 | `MANUAL_UX_TEST_V1_6.md` — увесь чекліст (14+ сценаріїв: порожня бібліотека, 100+ книг, кілька "зараз читаю", довгі назви, відсутні обкладинки тощо) свідомо не пройдений — жодна клітинка "Пройдено" не позначена | `docs/MANUAL_UX_TEST_V1_6.md:1-9` (сам документ прямо це визнає) | Невідомий, потенційно високий (жоден з цих сценаріїв не підтверджений на реальному рендері — edge cases layout можуть просто не бути перевірені) |
| P6 | `NoteCategory` — явно per-book (`userBookId`), з коментарем "той самий набір під 'Гаррі Поттера' нічого не каже про 'Дюну'" — але користувач, що створює однакові за змістом категорії під кожною книгою окремо (наприклад "страшний момент" знову і знову), не отримує жодної підказки про вже введені раніше назви (немає автодоповнення з історії) | `src/types/noteCategory.ts:928-941`, `src/data/repositories/NoteCategoryRepository.ts` | Низький-середній (повторюваний ручний ввід, дрібне тертя UX) |
| P7 | Rate-limit на серверних Edge Functions — за IP, а не за пристроєм/користувачем (задокументований свідомий компроміс) — користувачі за одним NAT/мобільним оператором можуть впертись у чужий ліміт без жодного пояснення в UI, чому запит раптом не спрацював | `docs/SECURITY.md:29-40` (сам документ визнає залишковий ризик) | Низький-середній (рідкісний, але незрозумілий для постраждалого користувача збій) |
| P8 | `EAS Build` профіль `production` існує в `eas.json`, але задокументовано як "не використовується у V1" — немає жодного реального App Store/Play Store релізу, попри завершені 38 фаз двох великих milestone — розрив між обсягом готового функціоналу і фактичною доступністю користувачам поза колом власника продукту | `docs/BUILD_AND_RELEASE.md` (профіль `production`), `eas.json:24-26` | N/A для поточних користувачів (власник продукту єдиний реальний користувач), високий для майбутнього релізу — фіча-багатий продукт, який ніхто зовні ще не бачив |

---

## Розділ 60. Pre-release Risks

1. **Відсутність crash reporting/error tracking.** `src/lib/logger.ts` — вся "телеметрія"
   зараз лише `console.*` (**CODE VERIFIED**, `createLogger`/`consoleTransport`,
   `src/lib/logger.ts:13-31`; коментар прямо каже: "У майбутньому transport можна підмінити
   на production-моніторинг (Sentry тощо)" — тобто НЕ підмінено). У продакшн-білді жоден
   `console.error` нікуди не долітає до власника продукту — краш у реального користувача
   залишиться невидимим, доки той сам не поскаржиться (а більшість користувачів мовчки
   видаляють застосунок замість цього).
2. **Немає жодного onboarding-флоу.** Пошук по `src`/`app` на "onboarding"/"welcome"/"first
   launch" дав нуль результатів (**NOT VERIFIED інакше** — перевірено `grep -rli` по всьому
   дереву). Новий користувач з порожньою бібліотекою потрапляє одразу в порожні екрани без
   пояснення, що таке "полиці", "сезони читання", "капсули" тощо — при такій кількості фіч
   (V1.5+V1.6, 38 фаз) відсутність будь-якого "з чого почати" — суттєвий ризик для
   утримання нових користувачів.
3. **`npm audit` жодного разу не запускався в реальному середовищі.** `docs/SECURITY.md:
   175-179` прямо визнає: "Власник продукту вже бачив '19 moderate severity vulnerabilities'
   при реальному `npm install`... не підтверджено й не спростовано тут. Єдиний реально
   відкритий пункт цього документа." Точний список CVE невідомий.
4. **Manual UX test chart — порожній шаблон, не пройдений жоден сценарій** (детальніше —
   розділ 59, P5). Продукт із 22-фазним V1.6 milestone не має жодного підтвердження, що
   основні layout-сценарії (порожня бібліотека, 100+ книг, довгі назви, відсутні
   обкладинки, кілька "зараз читаю") справді коректно рендеряться на реальному пристрої.
5. **Немає реального пристрою в жодному середовищі розробки.** `docs/BUILD_AND_RELEASE.md`
   прямо каже: "`tsc` проти реальних `node_modules` і `npx expo start` ще підлягають
   підтвердженню на машині користувача" — увесь код написаний і типо-перевірений, але
   ніколи фізично не запускався в React Native runtime до передачі власнику продукту.
6. **Немає production EAS-профілю в активному використанні** (розділ 59, P8) — шлях від
   поточного стану ("готовий код") до "застосунок у Google Play/App Store" ще жодного разу
   не пройдений навіть частково (немає підписаного релізного білда, немає App
   Store Connect/Play Console запису, наскільки видно з коду репозиторію).
7. **Backup-файл без шифрування можна ненавмисно розповсюдити** (розділ 59, P1) — перед
   публічним релізом варто або додати опційний пароль/шифрування бекапу, або хоча б чіткіше
   попередження при `Sharing.shareAsync` про вміст файлу.
8. **Rate limiting за IP, не за користувачем** (розділ 59, P7) — за реального публічного
   навантаження (а не лише власника продукту) спільний NAT великих мобільних операторів
   України може викликати хибні відмови в обслуговуванні для легітимних користувачів.
9. **Локалізація — лише українська, жодного fallback/i18n-фреймворку не знайдено.**
   (**NOT VERIFIED вичерпно** — не перевірявся кожен рядок UI, але жодного `i18next`/
   `react-intl` у `package.json` немає, а тексти хардкоджені прямо в компонентах і
   `src/design/i18n-labels.ts`) — це свідомий продуктовий вибір (застосунок позиціонується
   як україномовний), але варто підтвердити, що це саме РІШЕННЯ, а не забутий крок, перед
   тим як орієнтуватись на будь-яку іншу аудиторію.
10. **`service_role` Supabase-ключ потрібен окремому Node-скрипту
    `scripts/sync-curated-books.js`** (`docs/SECURITY.md:150-152`) — цей скрипт і його
    оточення (де саме зберігається `service_role` під час запуску) не входить у застейджений
    код репозиторію; перед релізом варто підтвердити, що цей ключ ніколи не потрапляє в CI
    logs/git history власника продукту.

---

## Розділ 61. Owner Action Required

Дії, які **фізично може виконати лише власник продукту** (реальний пристрій/акаунти/рішення),
не AI-агент у хмарному середовищі розробки:

1. **Запустити `npm install` + `npm audit` на реальній машині** і отримати точний список CVE
   (`docs/SECURITY.md:175-179` — досі невідомо, чи серед "19 moderate" є щось критичне для
   Expo/RN-залежностей).
2. **Пройти весь чекліст `docs/MANUAL_UX_TEST_V1_6.md`** на реальному Android/iOS пристрої —
   жодна клітинка зараз не позначена; це єдиний спосіб перевірити layout-крайні випадки
   (порожня бібліотека, 100+ книг, довгі назви, відсутні обкладинки, темна тема на реальному
   екрані тощо).
3. **Реальний білд через EAS** (`eas build --profile preview` мінімум, `production` — коли
   готові до релізу) і встановлення на власний телефон — `npx tsc --noEmit` перевіряє лише
   типи, не факт, що нативний код збирається й запускається.
4. **Рішення про crash reporting/analytics** — чи додавати Sentry (чи аналог) і на яких
   умовах з приватністю (local-first принцип, `docs/LOCAL_FIRST.md`) — це продуктове й
   етичне рішення, не технічна деталь, яку варто вирішувати за власника продукту.
5. **Рішення про шифрування бекапів** (P1/пункт 7 розділу 60) — чи додавати опційний
   пароль, чи залишити поточну поведінку свідомо (з попередженням у UI).
6. **Deploy та перевірка `scripts/sync-curated-books.js`** з реальним `service_role`
   ключем у безпечному оточенні власника (не в хмарному dev-середовищі, де цей ключ
   в принципі був відсутній).
7. **App Store Connect / Google Play Console реєстрація**, заповнення карток застосунку,
   скріншотів, privacy nutrition label/Data Safety форми (Apple/Google вимагають ручного
   заповнення через їхні власні консолі — жоден агент не має доступу).
8. **Рішення про онбординг** — чи потрібен, і якого обсягу, з огляду на реальну реакцію
   перших користувачів (розділ 60, пункт 2) — вимагає людського судження про UX, не
   автоматизованого рішення.
9. **Ручна перевірка реальних викликів `isbndb-proxy`/`cover-upload` після кожного
   майбутнього деплою** (продовження вже зробленої 2026-09-10 перевірки,
   `docs/SECURITY.md:44-53,77-85`) — Supabase secrets і реальні мережеві виклики
   верифікуються лише з реального оточення власника.
10. **Рішення про версіонування** (`app.config.ts:31`, `version: '0.1.0'`) — підняти до
    реалістичного номера перед публічним релізом і визначити подальшу схему версіонування
    (semver проти build number).
11. **Юридичний огляд Privacy Policy/Terms** (сторовий лістинг вимагає посилання на
    privacy policy) — застосунок обробляє персональні читацькі дані (навіть локально), тож
    потрібен текст, погоджений власником продукту, не згенерований автоматично.
12. **Рішення про Zustand-залежність** (T10, розділ 58) — підтвердити реальне призначення
    чи прибрати з `package.json`, спираючись на знання про те, де саме в поточній роботі
    над UI вона використовується (або планувалась).
---

## Розділ 62. Рекомендовані наступні кроки — 3 сценарії

Усі три сценарії виходять з того, що жодна нова фіча не додається, поки не закриті знахідки цього аудиту —
відповідно до власного принципу власника продукту, вже застосованого в попередніх фазах ("спочатку
довести існуюче до ладу, потім рости").

### Сценарій A — Мінімальний ("Довести V1.6 до реальної готовності")

Найвужчий, найшвидший шлях перед тим, як власник продукту почне сам щодня користуватись застосунком.

1. Виправити 3 конкретні дефекти з розділу 1.1: DNF `finished_at` (розділ 13), spoiler-safe leak на
   Memory Card (розділ 42.3), незахищений Google Books ключ (розділ 26 — мінімум перенести за Edge
   Function-проксі за зразком ISBNdb).
2. Пройти всі 17 сценаріїв `docs/MANUAL_UX_TEST_V1_6.md` реально на пристрої й зафіксувати результат
   (не залишати порожнім).
3. Виправити фактичну помилку в `CHANGELOG.md` (Фаза 19, camera-scan) — не заради історії, а тому що
   заднім числом хибний запис підриває довіру до решти документа як джерела правди.
4. Підняти версію застосунку з `0.1.0` на щось, що відображає реальний обсяг зробленого (розділ 58) —
   суто організаційний крок, нульовий технічний ризик.

Оцінка обсягу: дні, не тижні — усі 4 пункти точково локалізовані, жодних архітектурних змін.

### Сценарій B — Середній ("Закрити структурний борг перед ростом")

Сценарій A + конкретне закриття тестового/CI-боргу, що інакше накопичуватиметься з кожною новою фазою:

5. Написати тести на транзакційну серцевину `ReadingSessionRepository` (`start`/`finish`/`pause`/`resume`)
   — найважливіший непокритий шлях усього core loop (розділ 31).
6. Додати Deno-typecheck/lint крок для `supabase/functions/**` у CI (розділ 32) — зараз ці 5 файлів поза
   будь-якою автоматичною перевіркою.
7. Реально запустити `npm audit` (чи ввімкнути GitHub Dependabot alerts) — розділ 34, ще жодного разу не
   виконано за всю історію проєкту.
8. Продуктове рішення (не код) щодо трьох "що читати далі" механізмів і трьох "згадати книгу" екранів
   (розділ 44) — або явно розмежувати їх призначення в UI (наприклад різні описи "навіщо цей екран" на
   кожному), або звести до меншої кількості.

Оцінка обсягу: 1-3 тижні одного розробника, залежно від того, наскільки глибоко переписувати
`ReadingSessionRepository`-тести.

### Сценарій C — Максимальний ("Підготовка до V2 і/або іншого користувача")

Сценарій A + B, плюс:

9. Додати мінімальний onboarding-flow (розділ 46) — зараз новий користувач бачить порожню бібліотеку без
   жодної підказки.
10. Додати `deleted_at` на `book_capsule` (розділ 51/58) — вирівняти soft-delete-покриття перед тим, як
    ускладнювати модель синхронізацією.
11. Розглянути мінімальне remote error reporting (навіть локальний файл-лог, який користувач сам може
    надіслати, якщо не Sentry — розділ 40.4) — без цього краші користувача завжди залишаться невидимими
    для власника продукту.
12. Ухвалити явне рішення "так/ні" щодо продуктової аналітики (розділ 52) — зараз 0% видимості того, які
    фічі реально використовуються, що ускладнює будь-яке майбутнє продуктове рішення "що розвивати далі"
    даними, а не інтуїцією.

Оцінка обсягу: тижні-місяць, і це вже свідомий вихід за межі "просто виправити знайдене" в бік
цілеспрямованої підготовки до наступного етапу життя продукту.

---

## Розділ 63. Власна критична рекомендація цього аудиту

Якщо обирати одну річ, з якої почати — це **не** технічний борг, а **сценарій A, пункт 2**: пройти реальні
17 сценаріїв на пристрої.

Обґрунтування. Технічна якість коду тут явно вища за типовий проєкт цього масштабу (0 `any`, 0 TODO, 584
тести, послідовна архітектура — розділи 35, 58). Ризик не в тому, що код "поганий" — а в тому, що
**жодна людина ще не бачила 22 фази V1.6 на реальному екрані**. Усі знахідки цього звіту, отримані статичним
аналізом (spoiler leak, DNF-баг, накладання фіч), — реальні й варті виправлення, але вони систематично
недооцінюють ризик у порівнянні з тим, що покаже перший реальний прогін: неочікувані взаємодії анімацій,
реальний контраст кольорів на реальному екрані (розділ 37.5 — усе зараз HYPOTHESIS), реальна швидкодія
LIKE-пошуку/`strftime()`-запитів на реальному обсязі даних (розділи 19, 29 — усе NOT BENCHMARKED), реальна
поведінка нагадувань і push-дозволів на реальній ОС.

Другорядна, але майже так само важлива рекомендація: **зупинитись і свідомо вирішити долю трьох
"що читати далі" і трьох "згадати книгу" механізмів** (розділ 44), перш ніж додавати "Фазу 23". Кожна
нова фаза, додана поверх нерозв'язаної концептуальної плутанини, ускладнює майбутнє злиття/спрощення
експоненційно, а не лінійно — це вже видно з того, що навіть сам код (коментарі в `useOnePicker.ts` про
"TBR reality check", розділ 17-18) починає плутатись у власних визначеннях.

Явно НЕ рекомендується: продовжувати додавати нові фічі (Фаза 23+) до виконання хоча б Сценарію A. Це
прямо узгоджується з принципом, який власник продукту вже сам сформулював і застосував раніше в цьому
проєкті ("спочатку довести існуюче до ладу").

---

## Розділ 64. Фінальна оцінна картка (1-10, з обґрунтуванням)

| Вимір | Оцінка | Обґрунтування |
|---|---|---|
| Архітектура / структура коду | **8/10** | Послідовна repository/domain/features-структура, 0 `any`, 0 TODO (CODE VERIFIED, розділ 58); мінус за дублювання Supabase URL-parsing логіки в 4 клієнтах і за один задокументований, але все ж помітний, розлад маршрутів (`app/` розійшовся з задуманою структурою — сам `ARCHITECTURE.md` це визнає). |
| Якість коду / технічний борг | **7/10** | Чисто на рівні стилю й дисципліни; борг зосереджений точково (розділ 58) — не розмазаний хаос, а конкретний, перелічений список. |
| Тестування (глибина й розподіл) | **6/10** | 584 тести — це реальне число (CI VERIFIED), але розподілене нерівномірно: сильне на чистих функціях/repository, майже відсутнє на `src/features/**`-хуках і на транзакційній серцевині reading session (розділ 31). |
| CI/CD | **6/10** | Реальний, зелений, автоматичний пайплайн існує (рідкість для проєкту цього типу) — але покриває лише Node/TS-частину, повністю ігноруючи 5 файлів Deno Edge Functions (розділ 32). |
| Безпека | **6/10** | Правильна серверна архітектура (RLS deny-all + SECURITY DEFINER, реальний rate limiting) підважена одним конкретним і легко виправним недоглядом — незахищений Google Books ключ (розділ 26). |
| Приватність | **7/10** | Основний принцип (журнал/lore/нотатки локально) реально дотриманий кодом, з однією конкретною, вузько локалізованою діркою (Memory Card spoiler leak, розділ 42.3). |
| Продуктивність | **5/10 (переважно HYPOTHESIS)** | Немає жодного реального вимірювання (NOT BENCHMARKED, розділи 29-30); знайдений конкретний архітектурний ризик (`strftime()` на індексованих колонках) — не катастрофічний за поточного обсягу даних одного користувача, але реальний. |
| Accessibility | **6/10** | Добре покриття `accessibilityRole` на інтерактиві (розділ 37.3); мінус за `reduceMotionEnabled`, що збирається, але ніде не споживається, і за повну відсутність реальної перевірки зі screen reader'ом. |
| Дизайн-система / послідовність UI | **7/10** | Рідкісний випадок, коли документація (`ARCHITECTURE.md`) реально описує код 1-в-1 (розділ 35); мінус за точкові inline-дублікати `SectionHeader` і відсутній код для задокументованого принципу тіней. |
| Документація | **7/10** | Після документаційного проходу цієї ж сесії — суттєво покращена й переважно узгоджена з кодом; мінус за одну знайдену фактичну помилку в `CHANGELOG.md` (Фаза 19). |
| Фокус продукту / відсутність feature bloat | **5/10** | Реальні продуктові ідеї диференційовані й цінні (розділ 50), але конкретні, підтверджені кодом накладання функціоналу (розділ 44) знижують концептуальну ясність для нового користувача. |
| Диференціація на ринку | **7/10** | Spoiler-safe режим, персональний lore, глибока пам'ять про прочитане — реально рідкісні для категорії "book tracking" фічі (HYPOTHESIS щодо ринку, CODE VERIFIED щодо існування в коді). |
| Готовність до V2 (auth/sync/AI) | **5/10** | Soft-delete є на більшості таблиць, але не на всіх (`book_capsule`); `deviceId` не заготовка під акаунт; жодних архітектурних блокерів, але й жодної підготовчої роботи поза тим, що вже є. |
| Ручна валідація на реальному пристрої | **2/10** | 0 з 17 сценаріїв `MANUAL_UX_TEST_V1_6.md` пройдено; єдиний реальний контакт із пристроєм за всю історію — один епізод мережевих логів пошуку. Найнижча оцінка картки, і не випадково — це головний висновок усього аудиту. |

**Середнє по 14 вимірах: ≈6.0/10** — технічно міцна основа, продуктово цікава ідея, але практично не
перевірена на реальному використанні. Це число варто читати разом з розділом 1, а не окремо: середнє в 6
балів ховає розкид від 8 (архітектура) до 2 (ручна валідація) — і саме цей розкид, а не середнє значення,
є найважливішим сигналом цього звіту.

---

*Кінець звіту. Цей документ — самодостатній: усі 64 розділи ТЗ присутні вище з точними посиланнями на
файли й код станом на 2026-09-12. Наступний крок — не нова фаза розробки, а рішення власника продукту щодо
сценарію з розділу 62.*
