# Фаза 19 — DESIGN SYSTEM EXTENSION

ТЗ прямо застерігає: «Не редизайнь весь application. Покращуй існуючу design system.» Ця фаза
не додає жодного нового візуального стилю — лише виносить розмітку, яка вже існувала в кількох
місцях буквально однаковою, у спільні компоненти `src/components/ui/`, і додає легкий haptic
feedback на кілька конкретних дій. Візуально застосунок виглядає так само, як до фази.

## Аудит: що зроблено, що пропущено, і чому

ТЗ перелічує 10 можливих компонентів. Перед тим, як щось писати, весь застосунок перевірено на
реальну дублювану розмітку (не на гіпотетичну майбутню потребу) — і рішення по кожному:

| Компонент | Рішення | Обґрунтування |
|---|---|---|
| `MemorySection` | Створено | 5 буквально однакових "іконка + заголовок + Card" секцій: `RevisitLaterSection`/`BeforeAfterSection` (`app/memory/[workId].tsx`), 3 секції на `app/recall/[workId].tsx`. |
| `BookHero` | Створено | 2 буквально однакові "обкладинка 96×140 + назва + автори" колонки: `app/capsule/[workId].tsx`, `app/recall/[workId].tsx`. |
| `JournalPreview` | Створено | 4 однакові рядки "обкладинка 48×70 + назва + рядки під нею": `MemoryIndexRow` (`app/memory/index.tsx`), `MemoryCard` (`app/on-this-day.tsx`), `OnThisDayCard.tsx`, 2 картки в `HomeContextCard.tsx`. |
| `Timeline` | Створено | `JournalTimeline.tsx`/`ReadingExperienceTimeline.tsx` мали буквально скопійований "хребет" (Card+заголовок+рейка+підписи країв, ті самі константи `MARKER_SIZE`/`TRACK_HEIGHT`) — винесено, сам маркер (форма/поведінка тапу) лишився в кожному файлі, бо реально різний. |
| `SectionHeader` | Створено | 2 реальні місця (`CurrentlyReadingList`, `YearSection`) з двома трохи різними розкладками — обидві підтримані пропом `layout`, а не вгадані наперед. |
| `QuickAction` | Створено | Найдубльованіший патерн — той самий 44×44 `accentSoft`-круг скопійований 4 рази в одному файлі (`app/(tabs)/index.tsx`) у двох формах (`tile`/`row`). |
| `EmptyMemoryState` | **Не створено** | Уже покрито `ui/EmptyState.tsx` — жодного дубльованого ad-hoc порожнього стану не знайдено. |
| `BookCoverStack` | **Не створено** | Жодного місця в застосунку з накладеними обкладинками+лічильником не знайдено — писати компонент без жодного реального виклику суперечило б "не редизайнь". |
| `InsightCard` | **Не створено** | Два схожі-за-наміром, але візуально різні місця (`StatBadgeTile` у `MemoryCardPreview.tsx`, `TodayStatsRow` на Home) — недостатньо спільного, щоб не вигадувати API навмання. |
| `StatPill` | **Не створено** | Той самий випадок — пілюля прогресу (`ReadingProgressBar`) і лічильник-бейдж (`JournalTimeline`'s `MarkerDot`) — різні форми, обидві вже стабільно протестовані; примусова уніфікація коштувала б ризику регресії заради малої вигоди. |

## Рефакторинг існуючих екранів

Кожен новий компонент одразу застосований там, де раніше була дублювана розмітка (не лишений
невикористаним поруч зі старим кодом):

- `app/memory/[workId].tsx` — `RevisitLaterSection`, `BeforeAfterSection` → `MemorySection`.
- `app/recall/[workId].tsx` — hero-блок → `BookHero`; 3 секції (улюблені моменти/цитати/думки) → `MemorySection`.
- `app/capsule/[workId].tsx` — hero-блок → `BookHero`.
- `app/memory/index.tsx`, `app/on-this-day.tsx`, `src/components/home/OnThisDayCard.tsx`, `src/components/home/HomeContextCard.tsx` — рядок обкладинка+текст → `JournalPreview`.
- `src/components/memory/JournalTimeline.tsx`, `src/components/memory/ReadingExperienceTimeline.tsx` — хребет шкали → `Timeline`.
- `app/(tabs)/index.tsx` — заголовок "Зараз читаєш" → `SectionHeader`; `HomeShortcuts` + три `EntryPointCard` → `QuickAction`.
- `app/on-this-day.tsx` — заголовок року (`YearSection`) → `SectionHeader` (`layout="inline"`).

## HAPTICS

`expo-haptics` не був установлений до цієї фази — додано (`npx expo install expo-haptics`,
SDK-сумісна версія). Єдина точка виклику — `src/lib/haptics.ts#triggerLightHapticFeedback`
(обгортає `Haptics.impactAsync(ImpactFeedbackStyle.Light)`, помилка ловиться й лише логується —
вібрація не повинна ламати саму дію користувача).

ТЗ дає 4 приклади дій, "НЕ на кожен тап":

- **save journal** — `useCreateNote`/`useCreateQuote` (`src/features/notes/useNotes.ts`,
  `src/features/quotes/useQuotes.ts`), `onSuccess`.
- **finish reading** — `useUpdateUserBookStatus` (`src/features/library/useUpdateUserBook.ts`),
  `onSuccess`, лише коли `status === 'finished'` (не для кожної зміни статусу).
- **favorite** — `useToggleFavorite` (той самий файл), `onSuccess`, лише коли позначку
  ВСТАНОВЛЮЮТЬ (`isFavorite === true`), не при знятті.
- **successful scan** — **не реалізовано**: у застосунку немає фічі сканування штрихкоду/ISBN
  камерою (лише фото обкладинки, `app/cover-photo/[editionId].tsx`, і ручний ввід ISBN у
  пошуку) — немає реального місця виклику, вигадувати його заради ТЗ-прикладу означало б додати
  функціонал поза межами цієї фази.

## Візуальний напрям

Жодних нових кольорів/тіней/градієнтів — усі нові компоненти використовують ті самі
`theme.colors`/`theme.spacing`/`theme.radius`, що й код, який вони замінили. Немає нової бібліотеки
анімацій — жодна з цих змін не потребує мікроанімацій понад те, що вже було (тап-стани
`Pressable` лишились ті самі).
