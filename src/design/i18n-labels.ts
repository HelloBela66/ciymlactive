import type { ShelfThemeId } from '@/types/shelf';

/**
 * Єдине джерело українських підписів для доменних enum-значень.
 * Жодна фіча не хардкодить ці рядки повторно — імпортує звідси.
 * Увесь user-facing текст застосунку — українською (п.54 ТЗ).
 */

export const userBookStatusLabels = {
  want_to_read: 'Хочу прочитати',
  reading: 'Читаю',
  finished: 'Прочитано',
  paused: 'Відкладено',
  did_not_finish: 'Не дочитав',
  rereading: 'Перечитую',
} as const;

export type UserBookStatus = keyof typeof userBookStatusLabels;

export const editionFormatLabels = {
  hardcover: 'Тверда обкладинка',
  paperback: "М'яка обкладинка",
  ebook: 'Електронна книга',
  audiobook: 'Аудіокнига',
  other: 'Інше',
} as const;

export type EditionFormat = keyof typeof editionFormatLabels;

export const seriesEntryTypeLabels = {
  main: 'Основна',
  prequel: 'Приквел',
  sequel: 'Сиквел',
  novella: 'Новела',
  spin_off: 'Спін-оф',
  companion: 'Супутня книга',
  anthology: 'Антологія',
  other: 'Інше',
} as const;

export type SeriesEntryType = keyof typeof seriesEntryTypeLabels;

export const noteTypeLabels = {
  thought: 'Думка',
  question: 'Питання',
  theory: 'Теорія',
  general: 'Загальне',
  // Milestone 11 (Мій щоденник) — шостий тип запису поряд із думкою/питанням/теорією/
  // загальним; п'ятий, "цитата", не тип `note.type` — це весь рядок `quote`
  // (`journalEntryTypeLabels` нижче об'єднує обидва джерела для UI щоденника).
  moment: 'Момент',
} as const;

export type NoteType = keyof typeof noteTypeLabels;

/** Підписи для всіх 6 типів запису щоденника (`JournalEntryType`,
 * `src/types/journalEntry.ts`) — 5 підписів `note` + окремий "Цитата" для `quote`, у якої
 * власного поля `type` немає (докладніше — коментар у `journalEntry.ts`). */
export const journalEntryTypeLabels = {
  ...noteTypeLabels,
  quote: 'Цитата',
} as const;

export type JournalEntryTypeLabel = keyof typeof journalEntryTypeLabels;

/** Шаблони картки-спогаду (Milestone 11, Фаза 8; тип значень —
 * `MemoryCardTemplateId` у `src/types/bookMemory.ts`, той самий стиль дублювання union, що
 * вже усталений для `NoteType` вище — підпис для вибору шаблону тут, сам вигляд шаблону —
 * `src/components/memory/MemoryCardPreview.tsx`). */
export const memoryCardTemplateLabels = {
  classic: 'Класична',
  quote: 'Цитата',
  stats: 'Статистика',
  minimal: 'Мінімалістична',
} as const;

export type MemoryCardTemplateLabel = keyof typeof memoryCardTemplateLabels;

/** Короткий підпис під кожним шаблоном у виборі (Фаза 8) — що саме на ньому буде. */
export const memoryCardTemplateDescriptions = {
  classic: 'Обкладинка, назва й твоя рефлексія',
  quote: 'Улюблена цитата чи нотатка — головна на картці',
  stats: 'Час читання, сторінки й дні',
  minimal: 'Лише обкладинка й назва — без зайвого',
} as const;

export const readingGoalTypeLabels = {
  books_per_year: 'Книг за рік',
  pages: 'Сторінок',
  minutes: 'Хвилин читання',
  reading_days: 'Днів читання',
  finish_book: 'Дочитати книгу',
  finish_series: 'Дочитати серію',
} as const;

export type ReadingGoalType = keyof typeof readingGoalTypeLabels;

export const seriesStatusLabels = {
  ongoing: 'Триває',
  completed: 'Завершена',
  hiatus: 'Призупинена',
  unknown: 'Невідомо',
} as const;

export const ownedBookConditionLabels = {
  new: 'Новий стан',
  good: 'Хороший стан',
  worn: 'Потертий',
  damaged: 'Пошкоджений',
} as const;

export const weekStartLabels = {
  monday: 'Понеділок',
  sunday: 'Неділя',
} as const;

export const themePreferenceLabels = {
  system: 'Системна',
  light: 'Світла',
  dark: 'Темна',
} as const;

export const sessionGoalMinutesOptions = [15, 30, 45, 60] as const;

export const readingGoalStatusLabels = {
  active: 'Активна',
  completed: 'Виконана',
  abandoned: 'Скасована',
} as const;

export const reminderKindLabels = {
  daily: 'Щодня',
  weekday: 'За днями тижня',
  loan_return: 'Повернення книги',
  custom: 'Одноразово',
} as const;

/** Пн-перший порядок днів тижня для UI, з відповідним JS `Date#getDay()` значенням
 * (0=неділя..6=субота — те саме, що зберігається в `reminder.weekdays`). */
export const weekdayChipOptions = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 0, label: 'Нд' },
] as const;

export const reminderTimeOptions = ['07:00', '08:00', '12:00', '18:00', '20:00', '21:00', '22:00'] as const;

/** «Що почитати завтра?» (Milestone 11, доповнення) — підписи для `RecommendationPurpose`
 * (`src/lib/tomorrowRecommendation.ts`) і `TimeBudgetPreset` (звідти ж), для пікера в
 * `app/tomorrow.tsx`. */
export const recommendationPurposeLabels = {
  light: 'Легке проведення часу',
  cry: 'Поплакати',
  laugh: 'Посміятися',
  absorbed: 'Вникнути в історію',
} as const;

export const recommendationTimeBudgetLabels = {
  short: 'До 2 год',
  medium: '3–6 год',
  long: '7–12 год',
  epic: '12+ год',
} as const;

/** Тематичне оформлення полиці (Milestone 11, доповнення8; набір значень — доповнення13) —
 * підписи для `ShelfThemeId` (`src/types/shelf.ts`), точнісінько ті слова, які попросив
 * власник продукту для кожного з 10 варіантів. Явний тип `Record<ShelfThemeId, string>` (не
 * `as const` + `keyof typeof`, як у `memoryCardTemplateLabels` вище) — щоб додавання нового
 * значення в `ShelfThemeId` без відповідного підпису тут падало компіляцією, а не мовчки лишало
 * нову тему без назви в пікері. Саме зображення кожної теми — окремо в
 * `src/design/shelfThemes.ts`, щоб не змішувати текст і візуальні дані в одному файлі. */
export const shelfThemeLabels: Record<ShelfThemeId, string> = {
  classic: 'Класичний',
  dark_romance: 'Дарк романи',
  romance: 'Романтика',
  autumn: 'Осінь',
  winter: 'Зима',
  summer: 'Літо',
  spring: 'Весна',
  thriller_horror: 'Трилери та жахи',
  fantasy: 'Фентезі',
  detective: 'Детективи',
};
