# V1.7 READING LIFE — IMPLEMENTATION MAP (Phase 0)

**Дата:** 2026-09-15
**Статус:** Phase 0 (аудит) завершено. Жодного продуктового коду цією фазою НЕ змінено.
**Метод:** прочитано живий код на `C:\polytsya-m11` (не документацію про нього). Свіжість
локального снапшота підтверджена побайтовим порівнянням розмірів проти пристрою: 47/47 файлів
`app/` і 38/38 ключових файлів `src/` збігаються — аудит зроблено на актуальному коді.

**Базовий стан:** 27 міграцій (`001`–`027`), 73 тестові файли, 1214 тестів (останній повністю
зелений CI-прогін — `docs/FOUNDATION_FINAL_POLISH_REPORT.md`).

---

## 1. Головний висновок аудиту

**V1.7 — це НЕ будівництво з нуля.** Значна частина того, що описує ТЗ, уже існує в кодовій базі,
але або (а) стоїть на ХИБНОМУ canonical-джерелі, або (б) не з'єднана в одну систему, або (в)
продубльована. Найбільша цінність V1.7 — не нові екрани, а **уніфікація canonical-семантики** й
**з'єднання** вже наявних систем.

Три найважливіші знахідки:

1. **Річний recap уже існує — і має рівно той баг, який Reading Seasons уже виправили.**
   `useWrappedYear.ts` визначає "книги року" через `UserBookRepository.listByStatus(db,
   'finished')` + `filterFinishedInRange(UserBook.finishedAt)` — тобто через **поточний статус
   книги**, а не через завершення `ReadingRun` у вікні періоду. Наслідки (усі — реальні, не
   гіпотетичні): книга, завершена у 2026 й перечитана у 2028, зараз має статус `'rereading'` і
   **повністю зникає з Wrapped 2026**; повторне завершення тієї самої книги в межах того самого
   року **взагалі непомітне** (`user_book` — один рядок на книгу, не на прохід); soft-deleted
   книга зникає з Wrapped, що прямо порушує §73. Seasons цей самий клас бага вже закрили, перейшовши
   на `ReadingRunRepository.listFinishedBetween` — коментар у репозиторії це буквально описує.
   → **Phase 1 має перевести Wrapped на ту саму run-based семантику (§25), а не додавати поруч
   ще один recap.**

2. **§61/§62 gap підтверджено в живому коді.** `ReadingRunRepository.listFinishedBetween` містить
   `JOIN user_book ub ... AND ub.deleted_at IS NULL`, із явним коментарем, що guard залишено
   НАВМИСНО, бо "чи має Season бачити прочитання soft-deleted книги — окреме продуктове рішення
   поза обсягом". V1.7 §61 приймає це рішення (історичний сезон переживає видалення з Бібліотеки)
   → Phase 10 знімає рівно цю умову, без жодного redesign Seasons.

3. **`activity_history` — це НЕ таблиця, а derived 8-гілковий `UNION ALL`** над
   `reading_session`/`user_book`(×3)/`rating`/`note`/`quote`/`shelf_book`, уже з range-запитом
   `listBetween(startIso, endIso)` і вбудованою spoiler-safe логікою. Це рівно та архітектура,
   якої вимагає §72 ("Prefer derived timeline", "не створюй giant duplicated `reading_life_events`").
   → **Reading Life timeline будується поверх цього, а не поруч із ним.** Обмеження: ця модель
   НЕ run-aware (події беруться з `user_book.started_at/finished_at`, не з `reading_run`), тож для
   §8 (ReadingRun first-class) потрібна run-атрибуція окремо.

---

## 2. Що вже існує — карта перевикористання

Колонка «Дія» — це рішення Phase 0, не припущення.

| Вимога ТЗ | Що вже існує | Дія |
|---|---|---|
| §66 canonical period aggregation | `src/lib/readingAggregates.ts`: `sumSessionMinutes`, `sumSessionPages`, `computeActiveDays`, `computeBusiestMonth`, `computeTopGenreAmong`, `filterFinishedInRange`, `computeDominantReadingExperience` | **Розширити** цей файл (не створювати новий шар) |
| §36 українська плюралізація | `src/lib/pluralizeUk.ts` + тест | **Перевикористати**, розширити тестами (1,2,4,5,11,12,14,21,22,25,101,102,105) |
| §8 ReadingRun first-class | `useReadingRunsDetail.ts` — на кожен run уже збирає rating/memory/before-after/capsule/DNF/session-stats; `ReadingRunsHistorySection.tsx` | **Перевикористати**; бракує лише journal-count на run (§9) |
| §9 reread comparison | `src/lib/rereadComparison.ts` (`computeRunReadingStats`, `computeNumericDelta`) + `app/reread-comparison/[workId].tsx` + `selectComparableRuns` | **Уже реалізовано.** Додати лише «Нотатки» до таблиці |
| §21–22 year recap | `useWrappedYear.ts` + `app/wrapped/[year].tsx` | **Виправити canonical-джерело**, потім наростити story-структуру |
| §11/§94 хаб історії | `app/my-reading.tsx` «Моє читання» (Профіль → Statistics/Profile/Fingerprint/Wrapped/Seasons) | **Вхід звідси.** Не створювати конкурентний хаб |
| §72 derived timeline | `ActivityHistoryRepository` (8-branch UNION, `listBetween`, spoiler-safe) | **Основа Reading Life.** Жодної нової event-таблиці |
| §39/§92/§93 Home card + пріоритет + dismiss | `lib/homeContext.ts` (ланцюг `stale_reading → capsule_due → on_this_day → goal_near_completion → tbr_suggestion`), `homeContextSuppressionStorage.ts`, `useHomeContextCard.ts` | **Вбудувати recap-картки в цей ланцюг** |
| §25 run-у-періоді | `ReadingRunRepository.listFinishedBetween` (+ `listStartedOrFinishedBetween`, `listUserBookIdsWithMultipleFinishedRuns`) | **Canonical-джерело для recap-періодів** |
| §32 most-read ranking | `lib/calendarTopBooks.ts` (`rankTopBooksOfMonth`) | **Перевикористати**, якщо семантика збігається |
| §28 темп | `lib/readingPace.ts` (`pagesPerMinuteFromTotals`, `computeRollingPace`, `FALLBACK_PAGES_PER_MINUTE`) | **Перевикористати** |
| §30 формат тривалості | `lib/calendarFormat.ts` (компактний «1 год 12 хв» + повнословесний) | **Перевикористати** |
| §74 spoiler safety | `lib/spoilerSafe.ts` + spoiler-aware `ActivityHistoryRepository` | **Перевикористати.** Третьої реалізації не створювати |
| §58 memory resurfacing | `lib/onThisDay.ts`, `lib/recall.ts`, capsule reminders, `OnThisDayCard.tsx` | **Спільний шар поверх**, не четверта система |
| §47/§98 share | `memoryCardFile.ts` + `seasonCardFile.ts` + `fingerprintCardFile.ts` (три майже ідентичні) і `MemoryCardPreview`/`SeasonCardPreview`/`FingerprintCardPreview` | **Витягнути спільний примітив.** Не додавати 4-й і 5-й |
| §73 історія ≠ жива бібліотека | `UserBookRepository.listWithDetailsByIdsIncludingDeleted` / `listByIdsIncludingDeleted` | **Перевикористати** для всіх історичних поверхонь |
| §68/§69 продуктивність | `getLifetimePaceTotals`/`getLifetimeCompletedTotals` (SQL-агрегати), `listLastCompletedByUserBookIds`, `RatingRepository.listByUserBookIds`, `GenreRepository.listByWorkIds` (batch) | **Прецедент уже є** — наслідувати, не винаходити |

---

## 3. Canonical-джерело кожної метрики (§67)

Зафіксовано за результатом читання коду. Це — єдине джерело істини для V1.7; будь-яка нова
формула, що розходиться з цим рядком, є помилкою, а не варіантом.

| Метрика | Canonical-джерело | Точна семантика |
|---|---|---|
| Хвилини читання | `sumSessionMinutes` (`readingAggregates.ts`) | `Math.round(durationSeconds/60)` **на кожну сесію окремо**, тоді сума. Не сума секунд з одним округленням |
| Сторінки | `sumSessionPages` | Лише додатна дельта `endPage - startPage`; сесія без `endPage` = 0, не помилка. **Ніколи не `book.pageCount`** (§26) |
| Завершені книги періоду | `ReadingRunRepository.listFinishedBetween` | `reading_run.finished_at` у `[start, end)`; статуси `finished` + `did_not_finish` — **для recap потрібно розділяти** |
| Перечитування | `run_number > 1` на рядку run | Уже готовий сигнал, без окремого запиту |
| Унікальні книги | `work` identity | Не `user_book`, не `edition` |
| Активні дні | `computeActiveDays` | `Set(startedAt.slice(0,10)).size` — **UTC-день** |
| Календарний день | `startedAt.slice(0, 10)` | **UTC**, свідомо й задокументовано (див. §4 нижче) |
| Темп | `readingPace.ts` | Реальні сторінки / реальний час. Ховати метрику, а не показувати `0 стор/год` (§28) |
| Оцінка | `RatingRepository.getByReadingRunId` | Rating прив'язаний до run (міграція `025_rating_run`) |
| Журнал | `JournalRepository` | Spoiler-фільтрація через `spoilerSafe.ts` |
| Діапазон `[start, end)` | `filterFinishedInRange` | Включно зліва, виключно справа |

---

## 4. Межі періодів — три зафіксовані факти (§23, §24, §31)

**Факт 1. День = UTC, а не локальний час.** Увесь застосунок рахує календарний день як
`isoString.slice(0, 10)`. Це не недогляд: `readingAggregates.ts` містить розгорнутий коментар,
що ТЗ Сезонів буквально вимагало "local calendar days", і що UTC залишено СВІДОМО, бо зміна
одного місця зробила б "активні дні" несумісними з Wrapped/Calendar/reread-порівнянням.
→ **V1.7 лишається на UTC.** §23/§31 прямо вимагають використати наявну canonical-політику й не
створювати другу. Локальна конверсія була б саме тією прихованою другою definition, яку ТЗ
забороняє.

**Факт 2. Тиждень не існує як поняття взагалі.** Колонка `app_settings.week_start` існує з
міграції `001` (`DEFAULT 'monday'`, `CHECK IN ('monday','sunday')`), але:
* `AppSettingsRepository` **не має** ані `getWeekStart`, ані `setWeekStart`;
* UI налаштувань для неї не існує;
* `app/(tabs)/calendar.tsx` жорстко передає `buildMonthGrid(monthAnchor, 1)` з коментарем, що
  підключення свідомо відкладене як окрема фіча налаштувань поза обсягом.

§23 дає два дозволені шляхи: коректно підключити setting **або** чітко використати наявну
canonical week policy. **Рекомендація Phase 0:** використати наявну — понеділок як canonical
початок тижня (це вже де-факто політика застосунку: `buildMonthGrid(..., 1)`), і НЕ будувати
UI налаштувань у межах V1.7. Обґрунтування: §23 забороняє приховану іншу definition, але не
вимагає нової фічі налаштувань; повноцінне підключення `week_start` означає новий екран
налаштувань + backup + тести, тобто scope-зростання, якого ТЗ ніде не просить. Читання колонки
без UI дало б налаштування, яке користувач не може змінити — гірше за явну canonical-політику.
→ **Це рішення потребує підтвердження власника** (див. §7 нижче).

**Факт 3. `listFinishedBetween` повертає і `finished`, і `did_not_finish`.** Для recap це не
одне й те саме: §25 вимагає відрізняти нову прочитану книгу від перечитування, а §53 — не
включати DNF у default share. Фільтрація за статусом обов'язкова на рівні recap-агрегації.

---

## 5. Геп-и, які V1.7 має закрити

| # | Геп | Де | Пріоритет |
|---|---|---|---|
| 1 | Wrapped рахує книги за поточним статусом, не за завершенням run → втрата перечитувань і soft-deleted книг | `useWrappedYear.ts` | **High** (порушує §25 і §73) |
| 2 | Seasons не бачать прочитань soft-deleted книги | `ReadingRunRepository.listFinishedBetween` | **High** (§61/§62) |
| 3 | Тижневої агрегації не існує зовсім | — | **High** (§16–17) |
| 4 | Місячного recap не існує (є лише Calendar month summary — інша семантика) | — | **High** (§18) |
| 5 | Немає journal-count на run для таблиці порівняння | `useReadingRunsDetail.ts` | Medium (§9) |
| 6 | `ActivityHistory` не run-aware → не може сам обслужити §8 | `ActivityHistoryRepository` | Medium |
| 7 | Три майже ідентичні share-реалізації; V1.7 додав би 4-ту й 5-ту | `*CardFile.ts`, `*CardPreview.tsx` | Medium (§98) |
| 8 | Milestones не існують | — | Medium (§54–57) |
| 9 | Немає спільного шару resurfacing — три незалежні системи | `onThisDay`/`recall`/capsule | Low (§58) |

---

## 6. Архітектурні рішення Phase 0

1. **Жодної нової persistent-таблиці** (§71, §72). Усі recap і Reading Life — derived. Наявні
   примітиви (`listFinishedBetween`, `listStartedBetween`, `ActivityHistoryRepository.listBetween`,
   SQL-агрегати) це дозволяють. Якщо на Phase 5–6 виявиться реальна потреба у snapshot — вона буде
   спершу обґрунтована окремо, а не закладена наперед.
2. **Жодної нової міграції за замовчуванням.** Потенційний виняток — persistent user choices (§75:
   вибраний спогад для share, dismissed recap). Dismissal уже має інфраструктуру
   (`homeContextSuppressionStorage`), тож найімовірніше міграція не знадобиться взагалі.
3. **Розширювати `readingAggregates.ts`, а не створювати паралельний шар** — інакше V1.7 відтворить
   рівно ту проблему ("п'ять незалежних aggregate без спільної основи"), яку Фаза 15 вже виправляла.
4. **Один recap-двигун на три періоди** (§44), різна композиція — не три дубльовані екрани.
5. **Перед будь-якою зміною спільного контракту — пошук УСІХ consumers** (§89, §107). Це прямий урок
   `searchBooks()`: контракт змінили, двох виробничих викликачів знайшов лише `tsc` після деплою.

---

## 7. Рішення власника — ЗАФІКСОВАНО

Питання 1 і 3 поставлені власнику продукту явно (не припущені) і відповіді отримані 2026-09-15.
Питання 2 і 4 вирішені самим ТЗ V1.7, окремого підтвердження не потребували.

| # | Питання | **Рішення** |
|---|---|---|
| 1 | **§23 week_start:** підключати налаштування чи зафіксувати понеділок? | ✅ **Понеділок як canonical.** Без нового UI налаштувань. Де-факто політика застосунку (`buildMonthGrid(..., 1)`) стає явною й задокументованою. §23 це прямо дозволяє: «або чітко використовувати існуючу canonical week policy». Прихованої другої definition не створюється |
| 2 | **§61 Seasons:** історичний сезон переживає видалення книги з Бібліотеки? | ✅ **Так** (рішення ТЗ §61). Знімається один `AND ub.deleted_at IS NULL` у `listFinishedBetween` |
| 3 | **§1 Wrapped:** перевести на run-based чи будувати Year Recap поруч? | ✅ **Перевести на run-based.** Числа в уже баченому екрані зміняться, але стануть правильними; два паралельні річні підсумки з різними числами були б гіршим результатом. Year Recap §22 будується ПОВЕРХ виправленого Wrapped, не поруч |
| 4 | **§43 нотифікації:** у межах V1.7 чи follow-up? | ✅ **Follow-up** (рішення ТЗ §43: «Якщо це значно розширює scope — залиш як follow-up. Не блокуй V1.7») |

---

## 8. Уточнений план фаз

Порядок ТЗ (§106) збережено; уточнення — у дужках.

* **Phase 0** — аудит + ця мапа. ✅
* **Phase 1** — canonical period aggregation: розширення `readingAggregates.ts` + run-based
  джерело періоду + межі тиждень/місяць/рік + тести меж (§24, §82).
* **Phase 2** — Book Relationship Timeline (§6–7), поверх `useReadingRunsDetail` + групування сесій.
* **Phase 3** — reread comparison (здебільшого існує — додати «Нотатки», §9–10).
* **Phase 4** — Reading Life навігація (Профіль → «Моя читацька історія» → рік → місяць).
* **Phase 5** — Weekly + Monthly Recaps + deterministic copy engine (§34–36).
* **Phase 6** — Year Recap (перевід Wrapped на run-based + story-структура §22).
* **Phase 7** — share cards (спершу витягнути спільний примітив із трьох наявних, §98).
* **Phase 8** — milestones (§54–57).
* **Phase 9** — memory resurfacing (спільний шар над трьома наявними).
* **Phase 10** — Seasons historical consistency (один SQL-рядок + тести).
* **Phase 11** — accessibility / продуктивність / backup / тести.
* **Phase 12** — фінальний звіт (`docs/V1_7_FINAL_REPORT.md`) + `docs/V1_7_READING_LIFE.md` +
  `docs/V1_7_OWNER_ACCEPTANCE.md`.

**Quality gates (§108)** — після кожної фази, що змінює спільний контракт: `npx tsc --noEmit`,
`npx eslint . --max-warnings=0`, `npm test`. CI VERIFIED не заявляється без реального прогону
(прямий урок FOUNDATION FINAL POLISH: три з семи знахідок того пасу знайшли саме інструменти, а
не ручне вичитування).
