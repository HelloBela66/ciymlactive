import type { ReadingExperienceId } from '@/design/readingExperience';
import { isReadingExperienceId } from '@/design/readingExperience';

/**
 * Спільні domain-calculator'и для аналітичних "підсумків за період" (POLYTSIA V1.6.1, Фаза 15
 * — ANALYTICS HIERARCHY, `docs/MY_READING.md`). Аудит V1.6.1 (§"Пара 4") зафіксував: п'ять
 * аналітичних екранів (Statistics/Reading Profile/Reading Fingerprint/Wrapped/Reading Seasons)
 * — "незалежні `derived aggregate` без спільної обчислювальної основи", і конкретно
 * "найчастіший жанр" рахувався незалежно одразу в трьох місцях. Перевірено буквально (не за
 * назвою поля, а за реальним кодом): `useWrappedYear.ts`/`useReadingSeason.ts` рахували
 * `busiestMonth`/`topGenre`/суми хвилин-сторінок/фільтр "завершено в межах діапазону" БУКВАЛЬНО
 * ІДЕНТИЧНИМ кодом (той самий `Map`-підхід, той самий tie-break); `useStatistics.ts` рахував
 * суми хвилин/сторінок тим самим виразом теж. Ці п'ять функцій — той код, піднятий сюди один
 * раз, БЕЗ жодної зміни поведінки чи tie-break порядку.
 *
 * Свідомо НЕ включено (перевірено й відхилено як хибна відповідність — той самий клас пастки,
 * що аудит уже знайшов між `onePicker`/`tomorrowRecommendation`/`tbrEstimate`, Фаза 12/14):
 * - `readingProfile.ts#computeTopGenre` — має поріг вибірки (`MIN_BOOKS_FOR_TOP_GENRE`) і
 *   семантику "insight, який може чесно мовчати"; `computeTopGenreAmong` тут — навпаки, завжди
 *   показує "що буквально сталось за період" (Wrapped/Seasons recap), без порогу. Об'єднання
 *   зламало б одну з двох семантик.
 * - `readingFingerprint.ts`'s `globalPace`-цикл — рахує ту саму базову величину (сторінки/
 *   секунди сесій), але іншим циклом (accumulate-if-positive, не clamped reduce) — достатньо
 *   інша форма, щоб не зливати без окремої перевірки на межових випадках.
 * - `useStatistics.ts`'s `booksFinishedAllTime`/`booksFinishedThisYear` — інший repository-
 *   виклик (`listStatusOnly`, не `listByStatus`) і інший фільтр (календарний рік через
 *   `getFullYear()`, не ISO-діапазон) — досить інша механіка, щоб не уніфікувати з
 *   `filterFinishedInRange` нижче без окремого продуктового рішення.
 */

export interface SessionMinutesInput {
  durationSeconds: number | null;
}

export interface SessionPagesInput {
  startPage: number;
  endPage: number | null;
}

/** Сума хвилин по сесіях — округлення на КОЖНУ сесію окремо, тоді підсумок (не підсумок секунд
 * з одним округленням наприкінці) — той самий вираз, що був продубльований у
 * `useStatistics.ts`/`useWrappedYear.ts`/`useReadingSeason.ts`. */
export function sumSessionMinutes(sessions: SessionMinutesInput[]): number {
  return sessions.reduce((sum, s) => sum + Math.round((s.durationSeconds ?? 0) / 60), 0);
}

/** Сума сторінок по сесіях — лише додатна дельта `endPage - startPage`, обрізана знизу нулем
 * (сесія без `endPage` чи з від'ємною дельтою рахується як 0 сторінок, не як помилка). */
export function sumSessionPages(sessions: SessionPagesInput[]): number {
  return sessions.reduce((sum, s) => {
    const delta = s.endPage != null ? s.endPage - s.startPage : 0;
    return sum + Math.max(0, delta);
  }, 0);
}

export interface BusiestMonthInput {
  startedAt: string;
}

export interface BusiestMonth {
  month: number;
  sessionsCount: number;
}

/** Місяць (1-12, UTC) з найбільшою кількістю сесій, що почались у ньому. Рівність — перемагає
 * той, що зустрівся першим при переборі `Map` (порядок вставки, тобто порядок `sessions`) — той
 * самий tie-break, що був у `useWrappedYear.ts`/`useReadingSeason.ts` до цієї фази. `null`, якщо
 * сесій нема. */
export function computeBusiestMonth(sessions: BusiestMonthInput[]): BusiestMonth | null {
  const monthCounts = new Map<number, number>();
  for (const session of sessions) {
    const month = new Date(session.startedAt).getUTCMonth() + 1;
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
  }
  let result: BusiestMonth | null = null;
  for (const [month, count] of monthCounts) {
    if (!result || count > result.sessionsCount) result = { month, sessionsCount: count };
  }
  return result;
}

export interface DateRange {
  start: string;
  end: string;
}

/** Книги, `finishedAt` яких потрапляє в `[range.start, range.end)` — включно зліва, виключно
 * справа (той самий діапазон, що будують `yearRange`/`seasonDateRange`). Той самий предикат, що
 * був продубльований у `useWrappedYear.ts`/`useReadingSeason.ts`. */
export function filterFinishedInRange<T extends { finishedAt: string | null }>(books: T[], range: DateRange): T[] {
  return books.filter((ub) => ub.finishedAt != null && ub.finishedAt >= range.start && ub.finishedAt < range.end);
}

export interface TopGenreAmong {
  name: string;
  count: number;
}

/** Найчастіший жанр серед переданих книг — БЕЗ порогу вибірки (на відміну від
 * `readingProfile.ts#computeTopGenre`, див. коментар угорі файлу). Кожен елемент вхідного масиву
 * — список назв жанрів ОДНІЄЇ книги (книга з кількома жанрами рахується в кожен, той самий
 * підхід, що `topAuthor` для співавторів у Wrapped) — виклик передає вже готовий
 * `genresByWorkId.get(...)`-результат, ця функція сама нічого не запитує з БД. Рівність —
 * перемагає жанр, що зустрівся першим при переборі книг (порядок вставки `Map`) — той самий
 * tie-break, що був у `useWrappedYear.ts`/`useReadingSeason.ts` до цієї фази. `null`, якщо
 * жодного жанру нема. */
export function computeTopGenreAmong(genreNamesByBook: string[][]): TopGenreAmong | null {
  const genreCounts = new Map<string, number>();
  for (const genreNames of genreNamesByBook) {
    for (const name of genreNames) {
      genreCounts.set(name, (genreCounts.get(name) ?? 0) + 1);
    }
  }
  let result: TopGenreAmong | null = null;
  for (const [name, count] of genreCounts) {
    if (!result || count > result.count) result = { name, count };
  }
  return result;
}

export interface ActiveDayInput {
  startedAt: string;
}

/** Кількість УНІКАЛЬНИХ календарних днів (за `startedAt.slice(0, 10)`) серед переданих сесій —
 * POLYTSIA V1.6.2, #167 (READING SEASONS — PRODUCT REDEFINITION, ТЗ §44: "Distinct local
 * calendar days with completed reading activity. Timezone safe"). Той самий `Set<string>`-підхід,
 * що вже є в `rereadComparison.ts#computeRunReadingStats` (там — на рівні одного run, тут — на
 * рівні періоду), і той самий UTC-based `.slice(0,10)`, яким рахує календарний день УСЯ решта
 * застосунку (`useWrappedYear.ts`, `season.ts`) — жодне місце в кодовій базі не робить
 * конверсію в локальний часовий пояс (свідомий вибір застосунку, задокументований у
 * `season.ts`). ТЗ буквально вимагає "local calendar days" — цей рядок навмисно лишається на
 * тому самому UTC-дні, що й решта застосунку, а не вводить локальну конверсію лише для Сезонів:
 * розбіжність з UTC можлива тільки для сесій, що почались близько до півночі UTC, і зміна цього
 * ОДНОГО місця зробила б "активні дні" сезону несумісними з тим, як день рахується всюди інде
 * (Wrapped/Calendar/reread-порівняння) без окремого продуктового рішення для всього застосунку. */
export function computeActiveDays(sessions: ActiveDayInput[]): number {
  return new Set(sessions.map((s) => s.startedAt.slice(0, 10))).size;
}

/** Мінімум сесій із заповненим `reading_experience` у періоді, перш ніж "Як читалося" (ТЗ §50)
 * взагалі рахує домінантне значення — той самий "insight, який може чесно мовчати" принцип, що
 * й `readingProfile.ts#MIN_BOOKS_FOR_TOP_GENRE`/`MIN_SESSIONS_FOR_AVG_DURATION`: 1-2 випадкові
 * позначки не повинні видавати категоричне "Це літо читалось напружено" на весь сезон. */
export const MIN_SESSIONS_FOR_READING_EXPERIENCE = 5;

export interface ReadingExperienceInput {
  readingExperience: string | null;
}

/** Домінантне значення "як читалося" серед сесій періоду — та сама vote-count+"перша зустрінута
 * перемагає нічию" механіка, що й `rereadComparison.ts#computeRunReadingStats.dominantExperience`
 * (там — рівно один run, тут — довільний період), піднята сюди окремою функцією, а не імпортом
 * звідти: та функція повертає одразу ЦІЛИЙ `RunReadingStats` (тривалість/дні/сесії run) — інший
 * контракт, непотрібний тут. `null`, якщо сесій із розпізнаним значенням менше за
 * `MIN_SESSIONS_FOR_READING_EXPERIENCE` (поріг, якого немає в `computeRunReadingStats` — там
 * порогу вибірки свідомо нема, бо порівняння run завжди показує "що записано", навіть якщо це
 * одна сесія; тут же — саме "insight", який має право чесно мовчати за замовчуванням, ТЗ §50). */
export function computeDominantReadingExperience(sessions: ReadingExperienceInput[]): ReadingExperienceId | null {
  const recognized = sessions.filter(
    (s): s is { readingExperience: string } => s.readingExperience != null && isReadingExperienceId(s.readingExperience),
  );
  if (recognized.length < MIN_SESSIONS_FOR_READING_EXPERIENCE) return null;

  const counts = new Map<ReadingExperienceId, number>();
  for (const s of recognized) {
    const id = s.readingExperience as ReadingExperienceId;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let result: ReadingExperienceId | null = null;
  let bestCount = 0;
  for (const s of recognized) {
    const id = s.readingExperience as ReadingExperienceId;
    const count = counts.get(id) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      result = id;
    }
  }
  return result;
}
