# A11Y_LARGE_TEXT_AUDIT.md — Accessibility fixes (Фаза 22)

POLYTSIA V1.6.1, Фаза 22 (ACCESSIBILITY FIXES). Той самий "фіксує рішення, яке інакше довелось
би пояснювати заново" документ, що й `docs/OFFLINE_UX.md`/`docs/BACKUP_PRIVACY_UX.md`.

## Завдання (буквально)

"`reduceMotionEnabled` справді споживається всіма non-essential анімаціями.
`ReadingProgressBar` отримує `accessibilityRole="progressbar"` + `accessibilityValue`.
Перевірка large text на Home/Library/Calendar/Book Details/Session/Memory/Capsule."

Три незалежні частини — кожна нижче окремим розділом.

## 1. `reduceMotionEnabled` — від "збирається, але нічого не вимикає" до реально підключеного

`ThemeProvider.tsx` читає `AccessibilityInfo.isReduceMotionEnabled`/підписується на
`reduceMotionChanged` ще з Milestone 8 і віддає прапорець через `useTheme().reduceMotionEnabled`
— але до цієї фази жоден компонент застосунку його не читав (`grep` по всьому `src`/`app` до
фази — нуль збігів поза `ThemeProvider.tsx` самим). Той самий клас знахідки, що й "пакет є в
залежностях, ніхто не використовує" (аудит, T10, Zustand) — тут не пакет, а прапорець стану.

**Інвентаризація всього руху в застосунку** (`grep` на `Animated\.`/`useAnimatedStyle`/
`withTiming`/`withSpring`/`LayoutAnimation`/`useSharedValue` по `src`/`app`):
- `react-native-reanimated` — залежність у `package.json`, але жодного `useAnimatedStyle`/
  `withTiming` виклику ніде немає в коді. Окрема знахідка, поза скоупом цієї фази (немає що
  "вимикати" — коду руху нема) — той самий клас "невикористана залежність", лишається
  продуктовим боргом поруч із T10.
- `CollapsibleSection.tsx` — навмисно СИНХРОННИЙ розгорт/згорт (коментар компонента прямо це
  каже — "проста синхронна зміна висоти... не додає ризику зависання на слабших Android-
  пристроях заради суто косметичного ефекту"), уже "reduce-motion-safe" за задумом до цієї
  фази; нічого чіпати не треба.
- **Єдиний реальний рух** в усьому застосунку — вбудований перехід системного `Modal`
  (`animationType="fade"`/`"slide"`) на чотирьох bottom sheet/попапах:
  `LibrarySortSheet.tsx`, `BookQuickActionsSheet.tsx`, `ReactionPicker.tsx`
  (`ReactionToggle`), `JournalTimeline.tsx` (маркер-попап).

**Рішення:** новий `useReducedMotionAnimationType(preferred)` (`src/lib/
useReducedMotionAnimationType.ts`) — повертає `'none'` замість `preferred`, коли
`theme.reduceMotionEnabled`, той самий офіційно задокументований підхід React Native
(`Modal.animationType` приймає `'none'`) без сторонньої бібліотеки. Один спільний хук замість
чотирьох копій `theme.reduceMotionEnabled ? 'none' : 'fade'` — та сама причина централізації,
що й `ACTIVITY_UNION_SQL` у Фазі 19. Усі чотири `Modal` тепер підключені.

## 2. `ReadingProgressBar` — `accessibilityRole="progressbar"` + `accessibilityValue`

Додано на зовнішній `View` компонента (`src/components/ui/ReadingProgressBar.tsx`):
`accessible`, `accessibilityRole="progressbar"`, `accessibilityLabel="Прогрес читання"`,
`accessibilityValue={{ min: 0, max: 100, now, text: '${now}%' }}`. `accessible` на зовнішньому
`View` групує трек/маркер-закладку/відсотковий чіп в ОДИН вузол читача екрана — без цього
"72%"-чіп праворуч озвучувався б окремим, другим кроком після самого прогрес-бару.

**Чому це компонентний фікс, а не зміна поведінки сьогодні:** усі три поточні місця виклику
(Home, рядок Бібліотеки, Полиця) вже загортають `ReadingProgressBar` у `Pressable`
з ВЛАСНИМ `accessibilityLabel`, що вже включає відсоток (наприклад, `${title}, прочитано
${percent}%`) — RN збирає весь піддерево такого `Pressable` в один вузол доступності, тож
вкладена розмітка `ReadingProgressBar` у цих трьох місцях сьогодні НЕ читається окремо (не
регресія — `Pressable`-батько просто "поглинає" піддерево, як і робив до цієї фази). Фікс
робить сам КОМПОНЕНТ коректним з власної точки зору — для будь-якого поточного чи майбутнього
виклику, де він НЕ загорнутий у такий батьківський `accessible`-елемент.

## 3. Large text (Dynamic Type / Android font scaling) — Home/Library/Calendar/Book Details/
   Session/Memory/Capsule

`AppText` (єдиний текстовий компонент застосунку) ніде не вимикає масштабування
(`allowFontScaling`/`maxFontSizeMultiplier` — жодного разу за весь `grep` до цієї фази) —
правильна базова поведінка. Перевірено всі сім названих екранів/областей на конкретний ризик:
фіксована `height` (не `minHeight`/`aspectRatio`), що напряму огортає текст, який міг би
вирости вище цієї висоти при великому системному розмірі шрифту.

| Область | Висновок |
|---|---|
| **Home** | Безпечно — рядки книг/журналу на `flex`/`gap`-колонках, жодної фіксованої `height` навколо тексту. |
| **Library** | **Знайдено й виправлено** — `ReadingStatusChip` (`app/(tabs)/library/index.tsx`) мала `height: theme.minTouchTarget` (44px) навколо `AppText`-лейбла статусу; змінено на `minHeight` (+невеликий вертикальний padding) — той самий `minHeight`-підхід, що вже переважає в решті застосунку (`Button.tsx`/`ChipSelect.tsx`/`LabeledInput.tsx` тощо) для будь-якого текстового touch target; сусідній `HeaderIconButton` (лише іконка) лишився `height` — коректно, там нема тексту, що росте. |
| **Calendar** | **Знайдено й виправлено** — день-бейджі (`app/(tabs)/calendar.tsx`): 32×32 і `minWidth:18/height:18` кола з номером дня всередині. Змінити на `minHeight` тут зламало б форму кола (стало б овалом). Замість цього — `maxFontSizeMultiplier={1.2}` на самому номері дня (частковий, не повний ліміт — компонент живий, не captured-зображення): число лишається читабельним, але не росте настільки, щоб вилізти за коло. Повна дата/інтенсивність/назва книги вже в `accessibilityLabel` клітинки — сам 1-2-значний глиф несе мало інформації для читача екрана. |
| **Book Details** | Безпечно — єдині `height: theme.minTouchTarget` в файлі на іконку-лише кнопках "обране" (без тексту всередині). |
| **Session** | `ReadingSessionMiniBar.tsx` — назва книги `numberOfLines={1}` у персистентному міні-барі; свідомо прийнятний компроміс (не фікс) — той самий клас "довга назва обрізається трьома крапками", що й скрізь по застосунку (`GridBookItem` тощо), рядок без фіксованої `height`, тож не клипається, лише коротшає видима частина назви. |
| **Memory** | **Знайдено й виправлено (найвищий пріоритет)** — `MemoryCardPreview.tsx`, живий preview (не лише offscreen-захоплення — рендериться прямо на екрані `app/memory/[workId].tsx`, той самий вузол потім іде в `captureRef`) фіксованого `aspectRatio: 4/5` з `overflow: 'hidden'`, стек кількох текстових блоків. При великому шрифті СУКУПНА висота блоків могла б перевищити висоту картки — обрізало б цілі секції (не один рядок). Той самий патерн підтверджено й у `SeasonCardPreview.tsx`/`FingerprintCardPreview.tsx` (три незалежні shareable-картки, спільний "тупий презентаційний компонент" дизайн). |
| **Capsule** | Безпечно — `app/completion/[workId].tsx` без окремого фіксовано-розмірного "картка"-вузла (на відміну від Memory); кола-індикатори лише іконки, текст поруч на `flex:1`. |

### Рішення для трьох shareable-карток (Memory/Season/Fingerprint)

Новий `CardPreviewText` (`src/components/ui/CardPreviewText.tsx`) — `AppText`-дублікат з
жорстко `allowFontScaling={false}`, використаний замість `AppText` УСЮДИ всередині
`MemoryCardPreview.tsx`/`SeasonCardPreview.tsx`/`FingerprintCardPreview.tsx` (в кожному з цих
трьох файлів геть увесь текст — усередині фіксованої картки, немає жодного "довкола" тексту).
**Єдиний виняток із правила "усе масштабується"** у всьому застосунку — свідомий, бо ці три
компоненти не звичайний скролований екран, а шаблон зображення фіксованої пропорції,
захоплюваний `react-native-view-shot` у PNG для "Поділитися"/"Зберегти в галерею": картка
завжди лишається тим самим зображенням, яке бачив користувач у прев'ю, що й потрапляє у файл.
Решта застосунку (усі звичайні екрани) використовують `AppText` напряму й повністю
підтримують системне масштабування без жодних змін.

## Свідомо НЕ зроблено

- **Не рефакторено `react-native-reanimated`** (невикористана залежність) — поза скоупом цієї
  фази (тут немає чого "вимикати" заради reduce motion — коду руху там нема); лишається поруч
  із T10 (Zustand) як окрема, майбутня знахідка "невикористана залежність".
- **Не додано `maxFontSizeMultiplier`/повне вимкнення масштабування будь-де поза трьома
  shareable-картками й денними бейджами Календаря** — решта застосунку (заголовки книг, назви,
  нотатки, кнопки) навмисно лишається повністю доступною системному масштабуванню; це
  правило-за-замовчуванням, не виняток, що вимагав фіксу.
- **Не змінено `accessibilityLabel` трьох поточних викликів `ReadingProgressBar`** (Home/
  Бібліотека/Полиця) — вони вже коректно озвучують відсоток через власний `Pressable`-лейбл;
  дублювати цю інформацію в самому компоненті понад те, що вже додано (розділ 2 вище), не
  потрібно.
