# V1_6_SPEC.md

Дослівний майстер-ТЗ POLYTSIA V1.6 (22 фази), збережений у репозиторії, щоб не залежати від
історії чату/сесії — попередня спроба покладатися на «можу дістати це з transcript» виявилася
ненадійною (компресія історії сесії губить старі повідомлення). Це джерело істини для Фаз 7–22.

Нумерація тут — це нумерація САМОГО майстер-ТЗ («PHASE N»), і саме вона йде в назви комітів/
документації як «Фаза N» (без зсуву, починаючи з Фази 4 — `Book Capsule`). Це відрізняється від
нумерації в розділі IMPLEMENTATION ORDER нижче (там власна наскрізна нумерація 1–22, що включає
аудит і тести як окремі пункти 1–2 перед фактичними feature-фазами).

## Статус фаз 1–6 (вже реалізовано до появи цього файлу)

Фази 1–3 (аудит, критичні repository-тести, Library UX) і Фаза 4 (`Book Capsule`), Фаза 5
(`Recall`), Фаза 6 (`Before/After`) — реалізовані раніше цієї сесії/вікна. Дослівний текст ТЗ
для Фаз 1–5 не зберігся (втрачений при компресії історії до того, як з'явилася ця практика
збереження в репозиторій); Фаза 6 — текст є, доданий нижче в Додатку для повноти. Деталі
реалізації Фаз 4–6 — у `docs/BOOK_CAPSULES.md`, `docs/RECALL.md`, `docs/BEFORE_AFTER.md` та
відповідних записах `CHANGELOG.md`.

---

## PHASE 7 — «ЯК ЧИТАЛАСЯ КНИГА»

Поточний `reading_experience` вже існує. Не створюй нову duplicate field. Агрегуй reading
experience по sessions.

На Book Memory додай section: «Як читалася ця книга». Покажи horizontal timeline.

Приклад semantic states: Легко, Захопливо, Спокійно, Напружено, Важко.

### VISUALIZATION

- Не використовуй emoji як єдиний visual encoding.
- Покажи markers + labels/tooltips.
- Timeline приблизно відповідає progress книги.
- Якщо session не має progress — використовуй chronological position.
- Якщо даних мало (<2–3 sessions) — не показуй misleading chart.

## PHASE 8 — «ДАВНО НЕ ЧИТАВ»

Для books status = reading. Якщо остання completed session була давно, показуй helpful context.
Не використовуй guilt language.

Приклад:
- «Останнє читання — 18 днів тому.»
- «Ти зупинився на стор. 418.»

CTA: «Згадати, де я зупинився».

### RECAP SCREEN

Показуй ТІЛЬКИ дані користувача:
- current page;
- last sessions;
- latest journal entries;
- latest favorite moment;
- characters/lore later if available.

Не генеруй summary через AI. Не використовуй external plot summaries. Це гарантує spoiler-safe
experience.

## PHASE 9 — CHARACTERS

Створи personal character notes. Це НЕ encyclopedia. Користувач сам додає персонажів.

Character fields: `id`, `workId`, `name`, `description` optional, `firstSeenPage` optional,
`firstSeenProgress` optional, `reaction` optional, `isFavorite`, `createdAt`, `updatedAt`.

### CHARACTER UX

На Book Details/Memory: «Персонажі».

Quick add: ім'я, коротка примітка, сторінка.

Optional impression: подобається, не довіряю, смішний, важливий, не подобається, інше. Не
використовуй жорстку універсальну classification.

### CHARACTER DETAIL

Показуй: name, user description, first seen, linked journal entries, якщо користувач їх
прив'язав.

Дозволь manually link journal entry → character. Не роби NLP entity extraction.

## PHASE 10 — PERSONAL LORE

Architecture characters повинна бути розширювана до personal lore. На цьому milestone реалізуй
basic entity types: character, place, term, organization.

Назва section: «Світ книги». Користувач може створити: Персонаж, Місце, Термін, Організація.

### LORE ENTITY

`id`, `workId`, `type`, `name`, `description`, `firstSeenPage`, `firstSeenProgress`, `favorite`
optional, `createdAt`, `updatedAt`.

Якщо Character model краще уніфікувати як LoreEntity — проаналізуй це ПЕРЕД migration. Не
створюй duplicate schema лише тому, що prompt спочатку називає Character. Обери чисту domain
model.

## PHASE 11 — SPOILER-SAFE MODE

Це важливий product principle. Для journal/lore entities, де відомий progress/page, підтримай
spoiler-safe filtering.

При active reading: не показуй memory/lore entries, створені ПІСЛЯ current progress, якщо
користувач увімкнув «Без спойлерів». Default: ON для active books.

### SETTINGS PER BOOK

Book-level setting: «Приховувати майбутні записи» ON/OFF. Не видаляй записи. Тільки hide/filter.

### REREADING

Особливо важливо: під час rereading можна створити new reading run. Spoiler-safe mode може
враховувати поточний reread progress. Не руйнуй existing rereading model.

## PHASE 12 — DNF IMPROVEMENT

При status «Не дочитав» додай optional reason.

Reasons: «Не мій настрій», «Нудно», «Не сподобався стиль», «Занадто складно», «Не мій жанр»,
«Повернуся пізніше», «Інше». Optional free text.

### UX PRINCIPLE

DNF не є failure. Microcopy повинна бути neutral. Наприклад: «Не кожна книга має бути
дочитана». Не використовуй broken streak/negative achievement.

### DNF MEMORY

Зберігай: page/progress; date; reason; note. Це потім може використовуватись у recommendation
engine.

## PHASE 13 — READING SEASONS

Створи personal seasonal summaries. Seasons: Зима, Весна, Літо, Осінь. Для кожного року.
Derived from existing reading data.

Показуй: finished books; pages; reading hours; sessions; favorite/highest rated book;
most-read genre; most active month optional.

### SEASON SCREEN

Візуально це повинна бути memory/summary page, а не business dashboard. Cover collage; large
numbers; favorite book; journal highlight optional.

### SHARE TEMPLATE

Додай: «Мій читацький сезон». Formats: 9:16, 4:5. Не додавай complex image editor.

## PHASE 14 — READING PROFILE

Створи: «Мій читацький профіль». Це PRIVATE analytics. Не public profile. Показуй тільки
insights, які реально можна обґрунтувати даними.

Наприклад:
- «Найчастіше читаєш увечері.»
- «Середня сесія — 38 хв.»
- «Найчастіший жанр — фентезі.»
- «Найвищі оцінки ставиш детективам.»
- «Частіше читаєш паперові книги.»
- «Середня завершена книга — 486 сторінок.»

Не роби statements з 1–2 data points. Для кожного insight встанови minimum sample threshold.

## PHASE 15 — READING FINGERPRINT

На основі Reading Profile створи concise identity summary: «Мій читацький відбиток». Не
використовуй AI. Правила deterministic.

Приклади badges: «Вечірній читач», «Любитель довгих історій», «Читає серіями», «Любить робити
нотатки», «Повільне занурення», «Марафонський читач», «Колекціонер цитат», «Дослідник жанрів».

### IMPORTANT

Не присвоюй негативні labels. Не роби психологічні висновки. Fingerprint описує тільки reading
behavior.

### SHARE CARD

Додай premium template: «Мій читацький відбиток». Не більше 4–6 traits на одній картці.

## PHASE 16 — ONE BOOK PICKER

Покращ поточний «Що почитати завтра?». Не видаляй existing recommendation logic без причини.

Новий UX: «Обери мені книгу». Filters: скільки часу є; desired mood; максимальна довжина;
standalone / series / будь-яка; тільки з TBR; тільки owned books optional; genre optional.

### RESULT

Показуй ОДНУ основну рекомендацію. Не 20.

Card: cover, title, author, why selected, estimated reading time, series status.

CTA: «Обрати цю». Secondary: «Іншу».

### EXPLANATION

Recommendation повинен бути explainable. Наприклад: «Підходить, бо ти хочеш щось коротке,
атмосферне й уже маєш цю книгу на полиці.» Не вигадуй attributes, яких немає в metadata.

## PHASE 17 — TBR PERSONALITY / ANTI-TBR

Покращ TBR Reality Check. Додай playful, але respectful insights.

Наприклад: «41 книга чекає на тебе.», «Найдовше чекає: …», «Додано 427 днів тому.»

CTA: «Нарешті прочитати». Не shame користувача. Не використовуй aggressive notifications.

## PHASE 18 — HOME REDESIGN

Після реалізації memory/discovery features перевір Home. Home НЕ повинен стати нескінченною
стрічкою.

Priority order: 1. Current Reading; 2. Continue CTA; 3. Today summary; 4. one contextual
memory/recommendation; 5. secondary shortcuts.

### CONTEXTUAL HOME CARD

У конкретний момент показуй максимум ОДНУ context card: «Цей день у твоєму читанні»; Book
Capsule ready; давно не читав; goal near completion; TBR suggestion.

Не показуй 5 одночасно. Створи prioritization function.

Приклад пріоритету: active stale reading → capsule due → on this day → goal → TBR.

Документуй правила.

### HOME SHORTCUTS

Compact shortcuts: Мій щоденник, Моя історія, Моя пам'ять, Статистика. Не роби великі cards для
кожного.

## PHASE 19 — DESIGN SYSTEM EXTENSION

Не редизайнь весь application. Покращуй існуючу design system.

Для нових memory features створи reusable components: `MemorySection`, `BookHero`,
`JournalPreview`, `InsightCard`, `Timeline`, `EmptyMemoryState`, `StatPill`, `SectionHeader`,
`BookCoverStack`, `QuickAction`.

Перевір, чи existing components можна reuse перед створенням нових.

### VISUAL DIRECTION

Продукт повинен виглядати: modern; calm; premium; editorial; book-centric. Обкладинки —
основне джерело кольору. Background neutral. Whitespace generous. Typography strong.

Не використовуй: heavy brown/vintage aesthetic; надмірні gradients; glassmorphism everywhere;
neon; gaming badges; cartoon UI; excessive shadows.

### MOTION

Microinteractions тільки там, де додають clarity. Приклади: journal saved; book finished;
capsule opened; filter changed. Поважай reduced-motion preference. Не додавай animation library
без потреби.

### HAPTICS

Якщо `expo-haptics` уже є або легко додається через сумісний SDK: використовуй легкий haptic
feedback для: save journal; finish reading; favorite; successful scan. Не використовуй haptics
на кожному tap. Перед install: перевір Expo SDK compatibility. Встановлюй через
`npx expo install`.

## PHASE 20 — DATABASE / MIGRATIONS

Усі schema changes тільки additive migrations, де можливо. Перед створенням нової entity:
перевір, чи existing model вже покриває use case.

Potential models: `book_capsule`, `pre_reading_reflection`, `lore_entity`, `journal_lore_link`,
`dnf_reason`, revisit/recall data.

Не створюй таблицю для derived analytics, якщо дані можна безпечно обчислити.

### INDEXES

Перевір indexes для: workId; userBookId; createdAt; progress; lore work; capsule work; journal
links. Не додавай index без query use case.

## PHASE 21 — TESTS

Додай unit/domain tests для: On This Day matching; capsule due calculation; recall state;
before/after aggregation; reading experience timeline; stale reading detection; spoiler-safe
filtering; DNF state; season boundaries; reading profile thresholds; reading fingerprint; Home
contextual-card priority; one-book picker.

### REPOSITORY TESTS

Перед новими low-priority repositories обов'язково додай/покращ покриття critical existing:
`UserBookRepository`, `ReadingProgressRepository`, `EditionRepository`, `RatingRepository`. Це
higher priority, ніж testing cosmetic components.

## PHASE 22 — DEVICE UX CHECK PREPARATION

Створи `docs/MANUAL_UX_TEST_V1_6.md`.

Сценарії: library 1 book; library 100+ books; multiple current reads; large titles; missing
covers; offline; timer background; journal; memory; capsule; spoiler mode; DNF; season;
fingerprint; dark theme; large fonts; small screen.

Не стверджуй, що physical-device test пройдений, якщо environment не має device.

---

## DO NOT IMPLEMENT IN V1.6

Не реалізовуй: Supabase Auth; multi-user sync; friends; followers; public feed; comments; book
clubs; buddy reads; subscriptions; payments; AI assistant; LLM; automatic plot summaries;
automatic character extraction; public reviews; publisher dashboard; chat; direct Instagram API
integration.

## PRIVACY

Усі: journal; capsules; characters; lore; before/after; reading profile; fingerprint — є private
local user data. Не відправляй їх на external APIs. Не використовуй для catalog enrichment.

## SPOILER SAFETY

Never fetch plot/character/lore information automatically для active book. Personal lore
створює користувач. External book description залишається окремим metadata. Не змішуй
description та personal reading memory.

## PERFORMANCE TARGETS

Перевір: 1000 books; 5000 reading sessions; 10000 journal entries; 1000 lore entities. Не
створюй expensive aggregate query на кожен Home render. Derived insights cache лише якщо реально
потрібно. Не вводь premature caching complexity.

### HOME PERFORMANCE

Context card selection не повинна виконувати 10 full-table scans. Створи
repository/domain aggregation architecture.

## DOCUMENTATION

Онови: `ARCHITECTURE.md`, `DATABASE.md`, `PRODUCT.md`, `ROADMAP.md`, `TESTING.md`,
`BACKUP_FORMAT.md`, `V2_READINESS.md`.

Додай: `READING_MEMORY.md`, `BOOK_CAPSULES.md`, `PERSONAL_LORE.md`, `READING_PROFILE.md`,
`LIBRARY_UX.md`.

## BACKUP

Усі нові personal entities мають входити у versioned backup. Онови round-trip test. Old backup
migration strategy не ламати.

## ACCESSIBILITY

Перевір: Dynamic Type; VoiceOver/TalkBack labels; 44pt touch targets; contrast; large Ukrainian
strings; reduced motion; status not encoded only by color.

## ERROR / EMPTY STATES

Кожен новий screen має thoughtful empty state.

Наприклад:
- Characters empty: «Тут можна зберегти персонажів, яких хочеш пам'ятати.»
- Capsule empty: «Збережи кілька думок, які хочеш забрати з цієї книги із собою.»
- On This Day empty: не показуй screen/card unnecessarily.

## MICROCOPY

Увесь UI українською. Tone: теплий; спокійний; дорослий; не infantilized; не motivational
pressure.

Приклади: «Згадати цю книгу», «Що залишилося з тобою?», «Ти зупинився тут», «Цей момент варто
зберегти», «Рік тому ти читав…», «Не кожна книга має бути дочитана», «Обери мені книгу».

## IMPLEMENTATION ORDER

Не реалізовуй усе одним patch. Порядок:

1. audit;
2. critical repository tests;
3. Library UX;
4. Book Details UX;
5. On This Day;
6. Book Capsule;
7. Recall;
8. Before/After;
9. Reading Experience Timeline;
10. Stale Reading Recap;
11. Lore/Characters;
12. Spoiler-safe mode;
13. DNF;
14. Seasons;
15. Reading Profile;
16. Reading Fingerprint;
17. One Book Picker;
18. TBR improvements;
19. Home contextual redesign;
20. design polish;
21. migrations/backup verification;
22. complete tests/docs.

Після кожної phase: inspect → plan → implement → typecheck → lint → tests → update docs →
commit-ready summary. Не переходь далі при failing quality gate.

**Примітка щодо нумерації** (див. вступ): пункти цього списку 1–22 — власна наскрізна
нумерація IMPLEMENTATION ORDER, НЕ нумерація `PHASE N` вище. Відповідність для вже
реалізованого: пункт 6 (Book Capsule) = PHASE 4 = «Фаза 4»; пункт 7 (Recall) = PHASE 5 =
«Фаза 5»; пункт 8 (Before/After) = PHASE 6 = «Фаза 6». Для решти — пункт 9 (Reading Experience
Timeline) = PHASE 7 = «Фаза 7», і далі пункти йдуть зі зсувом −2 відносно PHASE N аж до пункту
18 (TBR improvements), який об'єднує ідеї PHASE 16 (One Book Picker) та PHASE 17 (TBR
Personality) в один робочий крок; звідти пункти 19–22 (Home redesign, design polish,
migrations/backup verification, complete tests/docs) — це вже наскрізні cross-cutting кроки, що
збирають докупи вимоги з розділів DATABASE/TESTS/DEVICE UX/DOCUMENTATION/ACCESSIBILITY/
PERFORMANCE вище, а не окремі PHASE N з майстер-ТЗ.

## QUALITY GATE

V1.6 НЕ завершена, поки:

- TypeScript strict проходить;
- ESLint проходить;
- Jest проходить;
- CI зелений;
- `UserBookRepository` critical CRUD покритий integration tests;
- `ReadingProgressRepository` покритий;
- всі нові migrations перевірені fresh/populated DB;
- backup round-trip включає нові дані;
- personal data не йде на external APIs;
- Library UX не має obvious regression;
- active Reading core loop не ускладнений;
- offline usage залишається working.

## FINAL ACCEPTANCE SCENARIO

Після V1.6 користувач повинен мати можливість:

1. Відкрити Library.
2. Одразу побачити, що читає.
3. Знайти книгу за кілька секунд.
4. Змінити grid/list.
5. Відфільтрувати книги.
6. Відкрити Book Details.
7. Продовжити читання одним obvious CTA.
8. Завершити session.
9. Записати «Як читалося».
10. Додати journal moment.
11. Повернутися до книги після довгої паузи.
12. Побачити, де зупинився.
13. Згадати останні записи без spoilers.
14. Додати персонажа/lore entity.
15. Завершити книгу.
16. Створити Book Capsule.
17. Додати after-reading reflection.
18. Порівняти Before/After.
19. Через recall flow згадати стару книгу.
20. Побачити «Цей день у твоєму читанні».
21. Переглянути Reading Season.
22. Побачити private Reading Profile.
23. Побачити Reading Fingerprint.
24. Попросити «Обери мені книгу».
25. Отримати одну explainable рекомендацію з TBR.
26. Побачити красивий Book Memory.
27. Створити share card.
28. Перезапустити app.
29. Переконатися, що всі дані збережені.
30. Export → restore round-trip проходить.

## ГОЛОВНИЙ PRODUCT PRINCIPLE

При будь-якому конфлікті між «додати ще одну функцію» та «зробити існуючий reading flow
простішим» — обирай друге.

«Полиця» не повинна перетворитися на control panel. Вона повинна залишатися місцем, яке
хочеться відкрити поряд із книгою.

Основна формула продукту: Читаю → Зберігаю → Пам'ятаю → Розумію себе → Обираю наступну книгу.

І головна ідея бренду: «Полиця — пам'ять твого читання».

---

## Додаток: дослівний текст PHASE 6 — BEFORE / AFTER (для довідки, вже реалізовано)

Для книги, яку користувач тільки починає, запропонуй optional pre-reading note. НЕ блокуй start
reading.

Fields: «Чому хочеш прочитати цю книгу?»; «Чого очікуєш?»; Expected rating optional; «Який
настрій/очікування?» Зберігай як structured preReadingReflection.

Після finish: Book Memory може показати «До читання» vs «Після читання».

Наприклад:
- До: «Очікую дуже важку фантастику.»
- Після: «Виявилося значно емоційніше...»
- Expected rating: 5
- Actual: 4.

### SHARE CARD

Додай новий memory-card template: «До / Після». Не перевантажуй. Cover, title, short before,
short after, rating.
