# READING_FINGERPRINT.md — «Мій читацький відбиток» (Фаза 15)

POLYTSIA V1.6, Фаза 15 (READING FINGERPRINT). Той самий "фіксує рішення, яке інакше довелось би
пояснювати заново" документ, що й `docs/READING_PROFILE.md`/`docs/READING_SEASONS.md`.

## Мета

ТЗ Фази 15: «Мій читацький відбиток» — "На основі Reading Profile створи concise identity
summary": до 8 детермінованих поведінкових бейджів (НЕ AI/LLM), кожен зі своїм порогом вибірки,
жодного з них не показано, якщо дані його не підтверджують. Явна вимога тону: бейджі НІКОЛИ не
негативні й НІКОЛИ не психологічні — вони описують ПОВЕДІНКУ читання (коли/як довго/як
швидко/що саме читаєш), а не роблять висновки про особистість користувача.

## Архітектура

**Немає нової таблиці й немає нової міграції** — той самий "derived aggregate" принцип, що й
Wrapped/Reading Seasons/Reading Profile.

- `src/lib/readingFingerprint.ts` — чисті функції: `BadgeId` union із восьми бейджів,
  `BADGE_META` (мітка+іконка), фіксований пріоритетний `BADGE_ORDER`, окрема предикат-функція
  `is*Badge` на кожен бейдж зі своєю іменованою `MIN_*`/поріговою константою,
  `computeFingerprintBadges` (збір усіх бейджів, що пройшли поріг, у порядку `BADGE_ORDER`),
  `selectShareCardBadges`/`MAX_SHARE_CARD_BADGES = 6` (відсічення для картки-поділитися).
- `src/features/fingerprint/useReadingFingerprint.ts` — збір сирих даних і виклик чистих
  функцій. Той самий "власний запит, власний reduce" підхід, що й Wrapped/Seasons/Statistics/
  Profile (без композиції хука поверх `useReadingProfile()`) — "На основі Reading Profile" із
  ТЗ виконано на рівні ЧИСТИХ ФУНКЦІЙ: `computeTimeOfDayInsight`/`computeAverageSessionMinutes`/
  `computeAveragePages` з `readingProfile.ts` перевикористані напряму, той самий поріг вибірки,
  що вже пройшов на екрані профілю, а не переписаний заново чи розпарсений із готового речення
  (форвард-коментар у `docs/READING_PROFILE.md` саме це й передбачав).
- `app/fingerprint.tsx` — список бейджів-карток (не dashboard) + SHARE TEMPLATE: захоплення
  `FingerprintCardPreview` у PNG, «Поділитися»/«Зберегти в галерею», той самий
  `react-native-view-shot`+`expo-sharing` потік, що й картка сезону/спогаду. На відміну від
  картки сезону (перемикач 9:16/4:5) тут рівно ОДИН фіксований формат — ТЗ Фази 15 не згадує
  вибір формату взагалі, лише кількісне обмеження "не більше 4-6 traits" на самій картці.

## Вісім бейджів і їхні пороги

Три бейджі читають уже порогові значення напряму з `readingProfile.ts` (жодного нового запиту):

1. **Вечірній читач** (`moon-outline`) — `timeOfDay.timeOfDay === 'evening'` (Profile-поріг:
   `MIN_SESSIONS_FOR_TIME_OF_DAY = 10`).
2. **Марафонський читач** (`flash-outline`) — `averageSessionMinutes >=
   MARATHON_SESSION_MINUTES_THRESHOLD (60)` (Profile-поріг: `MIN_SESSIONS_FOR_AVG_DURATION = 5`).
3. **Любитель довгих історій** (`book-outline`) — `averagePages >=
   LONG_BOOK_AVERAGE_PAGES_THRESHOLD (420)` (Profile-поріг: `MIN_BOOKS_FOR_AVG_PAGES = 5`).

П'ять бейджів мають власні нові джерела даних і власні пороги:

4. **Повільне занурення** (`water-outline`) — НОВА глобальна агрегація темпу читання
   (сторінок/годину за ВСІМА завершеними сесіями, той самий "endPage - startPage за сесію,
   від'ємне не рахується" підхід, що й `pagesTurned` у `computeBookStats`,
   `src/lib/bookStats.ts`, лише сумарно, а не по одній книзі). Поріг вибірки —
   `MIN_HOURS_FOR_SLOW_IMMERSION_BADGE = 15` (годин сумарного читання, не сесій/книг — темп про
   ЧАС). Бейдж — коли `pagesPerHour <= SLOW_IMMERSION_MAX_PAGES_PER_HOUR (20)`: помітно
   повільніше за типовий темп прози, сигналізує уважне неспішне читання, а не "недолік".
5. **Читає серіями** (`layers-outline`) — `SeriesRepository.listWorkIdsInSeries` (пакетний
   запит по `work_id` завершених книг). Поріг: `MIN_FINISHED_BOOKS_FOR_SERIES_BADGE = 5`
   завершених книг, і частка книг у серіях `>= SERIES_READER_MIN_SHARE (0.4)`.
6. **Дослідник жанрів** (`compass-outline`) — унікальні жанри серед завершених книг
   (`GenreRepository.listByWorkIds`, той самий пакетний запит, що й Profile). Поріг:
   `MIN_FINISHED_BOOKS_FOR_GENRE_EXPLORER_BADGE = 8` завершених книг, і
   `distinctGenresCount >= GENRE_EXPLORER_MIN_DISTINCT_GENRES (6)`.
7. **Любить робити нотатки** (`pencil-outline`) — `NoteRepository.countAll` (`COUNT(*) WHERE
   deleted_at IS NULL`). Поріг: `MIN_NOTES_FOR_BADGE = 20`.
8. **Колекціонер цитат** (`chatbubble-outline`) — `QuoteRepository.countAll`, той самий підхід.
   Поріг: `MIN_QUOTES_FOR_BADGE = 20`.

Пороги 4-8 (крім "Читає серіями"/"Дослідник жанрів", де частка/мінімум випливають зі здорового
глузду того, що вважати "помітною" присутністю) — довільні, але обрані щедро: бейджі описові,
не статистично виведені, і мета — рідко фальшивий позитив, а не суворий поріг значущості.

## Пріоритетний порядок і картка-поділитися

`BADGE_ORDER` — фіксований порядок (той самий, що ТЗ наводить приклади бейджів), використовується
і для порядку відображення на екрані, і для відсічення картки-поділитися: `selectShareCardBadges`
бере перші `MAX_SHARE_CARD_BADGES = 6` бейджів із уже відфільтрованого списку. Повний список на
самому екрані відбитку НЕ обрізається — обмеження "4-6" стосується лише картки-зображення (ТЗ:
"premium template").

## Приватність

PRIVATE analytics (той самий принцип, що й Reading Profile) — жодного мережевого виклику,
жодного AI/LLM, жодного експорту цих бейджів кудись окремо від звичайного бекапу (самі
бейджі — derived, у бекап не входять). Дані не покидають пристрій.
