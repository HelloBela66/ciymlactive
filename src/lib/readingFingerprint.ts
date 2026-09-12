import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { TimeOfDayInsight } from './readingProfile';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * «Мій читацький відбиток» (ТЗ Фази 15, READING FINGERPRINT, `docs/READING_FINGERPRINT.md`) —
 * ТЗ: "На основі Reading Profile створи concise identity summary" — детермінований (без
 * AI/LLM), НІКОЛИ не негативний, НІКОЛИ не психологічний набір бейджів, що описують лише
 * ПОВЕДІНКУ читання (коли/як довго/як швидко/що саме), а не особистість користувача. Той самий
 * "чисті функції над уже зібраними даними, жодного SQL/React/`new Date()`" принцип, що й
 * `src/lib/readingProfile.ts`/`src/lib/season.ts` — фактичний збір даних лишається в
 * `src/features/fingerprint/useReadingFingerprint.ts`.
 *
 * Два бейджі ("Вечірній читач"/"Марафонський читач") і частково третій ("Любитель довгих
 * історій") читають ВЖЕ порогові значення з `readingProfile.ts` напряму (`TimeOfDayInsight`,
 * `averageSessionMinutes`, `averagePages` — усі три вже пройшли свій власний `MIN_*` поріг
 * вибірки там), а не перераховують їх заново — саме так, як передбачав forward-looking
 * коментар у `docs/READING_PROFILE.md`. Решта бейджів мають власні нові джерела даних і власні
 * пороги, названі константами нижче — той самий "MIN_* замість магічного числа" підхід, що й
 * усюди в застосунку.
 */

export type BadgeId =
  | 'evening_reader'
  | 'marathon_reader'
  | 'slow_immersion'
  | 'long_stories_lover'
  | 'series_reader'
  | 'genre_explorer'
  | 'note_taker'
  | 'quote_collector';

export interface BadgeMeta {
  label: string;
  icon: IconName;
}

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

/** Фіксований пріоритетний порядок — той самий порядок, у якому ТЗ Фази 15 наводить приклади
 * бейджів. Подвійна роль: (1) порядок відображення на екрані відбитку, (2) порядок відсікання
 * для картки-поділитися (`selectShareCardBadges` нижче бере перші `MAX_SHARE_CARD_BADGES`). */
export const BADGE_ORDER: BadgeId[] = [
  'evening_reader',
  'marathon_reader',
  'slow_immersion',
  'long_stories_lover',
  'series_reader',
  'genre_explorer',
  'note_taker',
  'quote_collector',
];

/* ---------------------------------------------------------------------------------------- *
 * Вечірній читач — напряму з Reading Profile (`timeOfDay`, уже пройшов MIN_SESSIONS_FOR_TIME_OF_DAY)
 * ---------------------------------------------------------------------------------------- */

export function isEveningReaderBadge(timeOfDay: TimeOfDayInsight | null): boolean {
  return timeOfDay?.timeOfDay === 'evening';
}

/* ---------------------------------------------------------------------------------------- *
 * Марафонський читач — напряму з Reading Profile (`averageSessionMinutes`, уже пройшов
 * MIN_SESSIONS_FOR_AVG_DURATION), плюс власний поріг "що вважати марафоном"
 * ---------------------------------------------------------------------------------------- */

/** 60+ хв середньої сесії — довша за типову "коротку паузу почитати" сесію, поріг не з даних, а
 * зі здорового глузду (як і `LONG_BOOK_AVERAGE_PAGES_THRESHOLD`/`SERIES_READER_MIN_SHARE` нижче
 * — бейджі описові, не статистично виведені). */
export const MARATHON_SESSION_MINUTES_THRESHOLD = 60;

export function isMarathonReaderBadge(averageSessionMinutes: number | null): boolean {
  return averageSessionMinutes != null && averageSessionMinutes >= MARATHON_SESSION_MINUTES_THRESHOLD;
}

/* ---------------------------------------------------------------------------------------- *
 * Повільне занурення — НОВИЙ глобальний темп (сторінок/годину), якого нема у Reading Profile
 * ---------------------------------------------------------------------------------------- */

/** Мінімум сумарного часу читання (усі сесії, усі книги) для будь-якого висновку про темп —
 * той самий "Не роби statements з 1-2 data points" принцип, що й пороги `readingProfile.ts`,
 * лише виміряний у годинах, а не кількості сесій/книг (темп — про ЧАС, не про кількість подій). */
export const MIN_HOURS_FOR_SLOW_IMMERSION_BADGE = 15;

/** ≤20 стор./год — помітно повільніше за типовий темп читання прози; сигналізує уважне,
 * неспішне читання (перечитування абзаців, нотатки на льоту, поезія/складний текст), а не
 * "повільний читач" як недолік — той самий "ніколи не негативний" принцип, що й увесь файл. */
export const SLOW_IMMERSION_MAX_PAGES_PER_HOUR = 20;

export interface GlobalPaceInsight {
  pagesPerHour: number;
  totalHours: number;
}

/** `pagesTurnedTotal`/`totalSeconds` — уже прораховані викликачем суми за ВСІМА завершеними
 * сесіями (той самий "endPage - startPage за сесію, від'ємне не рахується" підхід, що й
 * `pagesTurned` у `computeBookStats`, `src/lib/bookStats.ts`, лише глобально за весь час, а не
 * по одній книзі). */
export function computeGlobalPace(pagesTurnedTotal: number, totalSeconds: number): GlobalPaceInsight | null {
  const totalHours = totalSeconds / 3600;
  if (totalHours < MIN_HOURS_FOR_SLOW_IMMERSION_BADGE || pagesTurnedTotal <= 0) return null;
  return { pagesPerHour: Math.round(pagesTurnedTotal / totalHours), totalHours };
}

export function isSlowImmersionBadge(globalPace: GlobalPaceInsight | null): boolean {
  return globalPace != null && globalPace.pagesPerHour <= SLOW_IMMERSION_MAX_PAGES_PER_HOUR;
}

/* ---------------------------------------------------------------------------------------- *
 * Любитель довгих історій — напряму з Reading Profile (`averagePages`, уже пройшов
 * MIN_BOOKS_FOR_AVG_PAGES), плюс власний поріг "що вважати довгою книгою"
 * ---------------------------------------------------------------------------------------- */

export const LONG_BOOK_AVERAGE_PAGES_THRESHOLD = 420;

export function isLongStoriesLoverBadge(averagePages: number | null): boolean {
  return averagePages != null && averagePages >= LONG_BOOK_AVERAGE_PAGES_THRESHOLD;
}

/* ---------------------------------------------------------------------------------------- *
 * Читає серіями — НОВЕ джерело (SeriesRepository.listWorkIdsInSeries)
 * ---------------------------------------------------------------------------------------- */

export const MIN_FINISHED_BOOKS_FOR_SERIES_BADGE = 5;

/** Частка завершених книг, що належать до якоїсь серії — довільний, але щедрий поріг: серійний
 * читач не мусить читати ВИКЛЮЧНО серії, досить, щоб серії були помітною частиною бібліотеки. */
export const SERIES_READER_MIN_SHARE = 0.4;

export function isSeriesReaderBadge(finishedBooksInSeriesCount: number, finishedBooksTotalCount: number): boolean {
  if (finishedBooksTotalCount < MIN_FINISHED_BOOKS_FOR_SERIES_BADGE) return false;
  return finishedBooksInSeriesCount / finishedBooksTotalCount >= SERIES_READER_MIN_SHARE;
}

/* ---------------------------------------------------------------------------------------- *
 * Дослідник жанрів — НОВЕ джерело (GenreRepository.listByWorkIds, підрахунок унікальних жанрів)
 * ---------------------------------------------------------------------------------------- */

export const MIN_FINISHED_BOOKS_FOR_GENRE_EXPLORER_BADGE = 8;
export const GENRE_EXPLORER_MIN_DISTINCT_GENRES = 6;

export function isGenreExplorerBadge(distinctGenresCount: number, finishedBooksTotalCount: number): boolean {
  if (finishedBooksTotalCount < MIN_FINISHED_BOOKS_FOR_GENRE_EXPLORER_BADGE) return false;
  return distinctGenresCount >= GENRE_EXPLORER_MIN_DISTINCT_GENRES;
}

/* ---------------------------------------------------------------------------------------- *
 * Любить робити нотатки / Колекціонер цитат — НОВІ джерела (NoteRepository.countAll/
 * QuoteRepository.countAll)
 * ---------------------------------------------------------------------------------------- */

export const MIN_NOTES_FOR_BADGE = 20;
export const MIN_QUOTES_FOR_BADGE = 20;

export function isNoteTakerBadge(notesCount: number): boolean {
  return notesCount >= MIN_NOTES_FOR_BADGE;
}

export function isQuoteCollectorBadge(quotesCount: number): boolean {
  return quotesCount >= MIN_QUOTES_FOR_BADGE;
}

/* ---------------------------------------------------------------------------------------- *
 * Збір усіх бейджів
 * ---------------------------------------------------------------------------------------- */

export interface FingerprintInput {
  timeOfDay: TimeOfDayInsight | null;
  averageSessionMinutes: number | null;
  averagePages: number | null;
  globalPace: GlobalPaceInsight | null;
  finishedBooksInSeriesCount: number;
  finishedBooksTotalCount: number;
  distinctGenresCount: number;
  notesCount: number;
  quotesCount: number;
}

/** Повертає лише бейджі, що пройшли свій поріг, у фіксованому порядку `BADGE_ORDER` — та сама
 * "тиха деградація" (quiet degradation), що й `readingProfile.ts`: бейдж нижче порогу просто
 * відсутній у результаті, без жодного "недостатньо даних" на його місці. */
export function computeFingerprintBadges(input: FingerprintInput): BadgeId[] {
  const qualifies: Record<BadgeId, boolean> = {
    evening_reader: isEveningReaderBadge(input.timeOfDay),
    marathon_reader: isMarathonReaderBadge(input.averageSessionMinutes),
    slow_immersion: isSlowImmersionBadge(input.globalPace),
    long_stories_lover: isLongStoriesLoverBadge(input.averagePages),
    series_reader: isSeriesReaderBadge(input.finishedBooksInSeriesCount, input.finishedBooksTotalCount),
    genre_explorer: isGenreExplorerBadge(input.distinctGenresCount, input.finishedBooksTotalCount),
    note_taker: isNoteTakerBadge(input.notesCount),
    quote_collector: isQuoteCollectorBadge(input.quotesCount),
  };
  return BADGE_ORDER.filter((badgeId) => qualifies[badgeId]);
}

/** ТЗ: "premium template... Не більше 4-6 traits" — картка-поділитися показує не більше цієї
 * кількості, найпріоритетніші (`BADGE_ORDER`) першими; повний список бейджів на самому екрані
 * відбитку не обрізається. */
export const MAX_SHARE_CARD_BADGES = 6;

export function selectShareCardBadges(badges: BadgeId[]): BadgeId[] {
  return badges.slice(0, MAX_SHARE_CARD_BADGES);
}
