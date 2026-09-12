import { pluralizeUk } from './pluralizeUk';
import type { EditionFormatValue } from '@/types/edition';

/**
 * «Мій читацький профіль» (ТЗ Фази 14, READING PROFILE, `docs/READING_PROFILE.md`) — PRIVATE
 * analytics, деталі архітектури й обґрунтування порогів — у документації. Увесь файл —
 * чисті функції над уже зібраними масивами/мапами (жодного SQL/React/`new Date()` для
 * "зараз" тут немає, той самий house convention, що й `src/lib/season.ts`) — фактичний збір
 * даних (`ReadingSessionRepository`/`UserBookRepository`/`GenreRepository`/`RatingRepository`)
 * лишається в `src/features/readingProfile/useReadingProfile.ts`.
 */

const PAGE_FORMS = ['сторінка', 'сторінки', 'сторінок'] as const;

/* ---------------------------------------------------------------------------------------- *
 * Час доби
 * ---------------------------------------------------------------------------------------- */

export type TimeOfDayId = 'night' | 'morning' | 'afternoon' | 'evening';

/** Ті самі межі локальної години, що й `getTimeOfDayGreeting` (`src/lib/greeting.ts`) — тут
 * як чиста функція агрегації, а не форматування привітання. Приймає вже готову локальну
 * годину (0-23), а не сам `Date`/ISO-рядок — виклик `new Date(session.startedAt).getHours()`
 * лишається на боці хука (`useReadingProfile.ts`), той самий поділ, що й `new Date(session.
 * startedAt).getUTCMonth()` у `useWrappedYear.ts`/`useReadingSeason.ts`. Навмисно ЛОКАЛЬНИЙ
 * час (не UTC, на відміну від помісячного групування там-таки) — "коли людина читає" має
 * сенс лише в її власному часовому поясі, докладніше — `docs/READING_PROFILE.md`. */
export function bucketTimeOfDay(localHour: number): TimeOfDayId {
  if (localHour < 6) return 'night';
  if (localHour < 12) return 'morning';
  if (localHour < 18) return 'afternoon';
  return 'evening';
}

export const TIME_OF_DAY_ADVERB: Record<TimeOfDayId, string> = {
  night: 'вночі',
  morning: 'вранці',
  afternoon: 'вдень',
  evening: 'увечері',
};

/** Мінімум сесій для будь-якого висновку про "коли ти читаєш" — ТЗ: "Не роби statements з
 * 1-2 data points". Чотири кошики (ніч/ранок/день/вечір) — навіть при рівномірному розподілі
 * по 2-3 сесії на кошик це вже статистичний шум, тож поріг вищий, ніж у решти insight'ів
 * цього файлу. */
export const MIN_SESSIONS_FOR_TIME_OF_DAY = 10;

export interface TimeOfDayInsight {
  timeOfDay: TimeOfDayId;
  count: number;
  totalSessions: number;
}

/** `localHours` — уже готові локальні години (0-23) кожної сесії, одна на сесію. */
export function computeTimeOfDayInsight(localHours: number[]): TimeOfDayInsight | null {
  if (localHours.length < MIN_SESSIONS_FOR_TIME_OF_DAY) return null;

  const counts = new Map<TimeOfDayId, number>();
  for (const hour of localHours) {
    const bucket = bucketTimeOfDay(hour);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  let top: TimeOfDayInsight | null = null;
  for (const [timeOfDay, count] of counts) {
    if (!top || count > top.count) top = { timeOfDay, count, totalSessions: localHours.length };
  }
  return top;
}

export function formatTimeOfDaySentence(insight: TimeOfDayInsight): string {
  return `Найчастіше читаєш ${TIME_OF_DAY_ADVERB[insight.timeOfDay]}.`;
}

/* ---------------------------------------------------------------------------------------- *
 * Середня сесія
 * ---------------------------------------------------------------------------------------- */

export const MIN_SESSIONS_FOR_AVG_DURATION = 5;

/** `durationsSeconds` — `reading_session.durationSeconds` уже завершених сесій (без `null`,
 * фільтрує викликач). Повертає хвилини, округлено — той самий підхід, що й `totalMinutes` в
 * `useWrappedYear`/`useReadingSeason`, лише середнє замість суми. */
export function computeAverageSessionMinutes(durationsSeconds: number[]): number | null {
  if (durationsSeconds.length < MIN_SESSIONS_FOR_AVG_DURATION) return null;
  const totalSeconds = durationsSeconds.reduce((sum, s) => sum + s, 0);
  return Math.round(totalSeconds / durationsSeconds.length / 60);
}

export function formatAverageSessionSentence(averageMinutes: number): string {
  return `Середня сесія — ${averageMinutes} хв.`;
}

/* ---------------------------------------------------------------------------------------- *
 * Найчастіший жанр
 * ---------------------------------------------------------------------------------------- */

export const MIN_BOOKS_FOR_TOP_GENRE = 5;

export interface GenreCount {
  name: string;
  count: number;
}

/** `genreCounts` — уже пораховані входження жанру серед прочитаних книг (`Map<nameUk,
 * count>`, та сама побудова мапи, що й `topGenre` у `useWrappedYear`/`useReadingSeason`).
 * `totalBooks` — знаменник порогу (кількість завершених книг, НЕ сума `genreCounts`, бо одна
 * книга рахується в кілька жанрів одразу). */
export function computeTopGenre(genreCounts: Map<string, number>, totalBooks: number): GenreCount | null {
  if (totalBooks < MIN_BOOKS_FOR_TOP_GENRE) return null;

  let top: GenreCount | null = null;
  for (const [name, count] of genreCounts) {
    if (!top || count > top.count) top = { name, count };
  }
  return top;
}

/** "жанр «X»" — навмисно без відмінювання назви жанру (не "читаєш фентезі", а "читаєш жанр
 * «Фентезі»"): жанри — вільний користувацький список (`GenreRepository.findOrCreateByName`),
 * без узгодженого відмінювання довільну назву граматично коректно не просхилити. */
export function formatTopGenreSentence(genre: GenreCount): string {
  return `Найчастіше читаєш жанр «${genre.name}».`;
}

/* ---------------------------------------------------------------------------------------- *
 * Жанр з найвищими оцінками
 * ---------------------------------------------------------------------------------------- */

/** Поріг per-жанр (не загальний) — кожен жанр із середньою оцінкою повинен мати досить своїх
 * оцінених книг, інакше жанр з однією "5" виглядав би як "найкращий" на порожньому місці. */
export const MIN_RATED_BOOKS_FOR_GENRE_RATING = 3;

export interface GenreRating {
  name: string;
  averageValue: number;
  count: number;
}

/** `genreRatingSums` — `Map<nameUk, {sum оцінок, count оцінених книг}>` серед завершених
 * книг з рейтингом (кожна книга додає свою оцінку в КОЖЕН зі своїх жанрів, той самий
 * "багато-жанрова книга рахується в кожен" підхід, що й `computeTopGenre`). Жанри, що не
 * дотягують до `MIN_RATED_BOOKS_FOR_GENRE_RATING`, пропускаються цілком — не потрапляють у
 * порівняння взагалі, а не показуються з застереженням. */
export function computeTopRatedGenre(genreRatingSums: Map<string, { sum: number; count: number }>): GenreRating | null {
  let top: GenreRating | null = null;
  for (const [name, { sum, count }] of genreRatingSums) {
    if (count < MIN_RATED_BOOKS_FOR_GENRE_RATING) continue;
    const averageValue = sum / count;
    if (!top || averageValue > top.averageValue) top = { name, averageValue, count };
  }
  return top;
}

/** "жанру «X»" — той самий "без відмінювання довільної назви" прийом, що й
 * `formatTopGenreSentence`, лише інша рамкова конструкція ("найвищу оцінку отримує жанр"
 * замість "найчастіше читаєш жанр"), щоб два речення про жанри не звучали дослівно однаково. */
export function formatTopRatedGenreSentence(genre: GenreRating): string {
  return `Найвищу середню оцінку отримує жанр «${genre.name}».`;
}

/* ---------------------------------------------------------------------------------------- *
 * Формат: паперові vs цифрові книги
 * ---------------------------------------------------------------------------------------- */

export type FormatGroup = 'physical' | 'digital';

/** `hardcover`/`paperback`/`other` -> фізична; `ebook`/`audiobook` -> цифрова. `other` навмисно
 * у фізичній групі — той самий консервативний дефолт, що й сама схема (`EditionRepository.
 * create`: `format ?? 'paperback'`), а не окрема "невідомо" категорія: тут нам потрібен лише
 * бінарний поділ для порівняння "частіше", тертя категорії не додає сигналу. */
export function formatGroup(format: EditionFormatValue): FormatGroup {
  return format === 'ebook' || format === 'audiobook' ? 'digital' : 'physical';
}

/** По КОЖНІЙ стороні окремо — навмисно вищий за решту порогів файл. `edition.format`
 * фактично майже завжди `'paperback'` (дефолт при створенні книги, і обидва зовнішні
 * провайдери метаданих — `GoogleBooksProvider`/`ISBNdbProvider` — завжди пишуть саме
 * `'paperback'` незалежно від реального формату книги; жодного UI редагування формату після
 * створення видання в застосунку немає). Тому "більше фізичних сесій" саме по собі НІЧОГО не
 * доводить — це майже завжди просто незмінений дефолт, а не реальна поведінка користувача.
 * Insight показується лише коли є ПОМІТНА кількість сесій І з фізичними, І з цифровими
 * виданнями одночасно — тобто коли в даних є реальний доказ, що користувач взагалі читає в
 * обох форматах, а не сама лише тиша з боку "цифрового" (що найімовірніше означає "формат
 * ніколи не виставлявся", а не "користувач ніколи не читає цифрові книги"). Докладніше —
 * `docs/READING_PROFILE.md`. */
export const MIN_SESSIONS_PER_FORMAT_SIDE = 5;

export interface FormatInsight {
  preferred: FormatGroup;
  physicalCount: number;
  digitalCount: number;
}

export function computeFormatInsight(physicalCount: number, digitalCount: number): FormatInsight | null {
  if (physicalCount < MIN_SESSIONS_PER_FORMAT_SIDE || digitalCount < MIN_SESSIONS_PER_FORMAT_SIDE) return null;
  return { preferred: physicalCount >= digitalCount ? 'physical' : 'digital', physicalCount, digitalCount };
}

export function formatFormatSentence(insight: FormatInsight): string {
  return insight.preferred === 'physical' ? 'Частіше читаєш паперові книги.' : 'Частіше читаєш цифрові книги.';
}

/* ---------------------------------------------------------------------------------------- *
 * Середня довжина прочитаної книги
 * ---------------------------------------------------------------------------------------- */

export const MIN_BOOKS_FOR_AVG_PAGES = 5;

/** `pageCounts` — `edition.pageCount` уже завершених книг, без `null` (фільтрує викликач —
 * не кожне видання має вказану кількість сторінок). */
export function computeAveragePages(pageCounts: number[]): number | null {
  if (pageCounts.length < MIN_BOOKS_FOR_AVG_PAGES) return null;
  const total = pageCounts.reduce((sum, p) => sum + p, 0);
  return Math.round(total / pageCounts.length);
}

export function formatAveragePagesSentence(averagePages: number): string {
  return `Середня завершена книга — ${averagePages} ${pluralizeUk(averagePages, PAGE_FORMS)}.`;
}
