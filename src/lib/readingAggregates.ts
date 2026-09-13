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
