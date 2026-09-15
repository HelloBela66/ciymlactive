import {
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
} from 'date-fns';
import { uk } from 'date-fns/locale';
import { formatCompactDuration } from './calendarFormat';
import { pluralizeUk } from './pluralizeUk';
import {
  formatReadingMonthKey,
  inclusiveEnd,
  monthRange,
  parseReadingMonthKey,
  readingDayFromKey,
  readingWeekKeyOf,
  weekRange,
  yearRange,
  type ReadingPeriodRange,
} from './readingCalendar';
import { isReadingPeriodEmpty, type ReadingPeriodSummary } from './readingPeriodSummary';

/**
 * POLYTSIA V1.7, Phase 5 — READING RECAPS (`docs/V1_7_READING_LIFE.md`, ТЗ V1.7 модуль C).
 *
 * Перетворює canonical-підсумок періоду (`computeReadingPeriodSummary`) на ТЕКСТ, який людина
 * читає: одне сильне речення + список фактів. Тиждень, місяць і рік — той самий двигун, лише з
 * іншим `kind`, бо це та сама операція над тією самою структурою.
 *
 * ── ЖОДНОЇ ГЕНЕРАЦІЇ (ТЗ §103) ───────────────────────────────────────────────────────────────
 * Тут немає ані AI, ані випадковості, ані «варіантів фраз для різноманіття». Кожен рядок —
 * детермінований шаблон, обраний явним правилом із чисел підсумку. Той самий період із тими
 * самими даними ЗАВЖДИ дає той самий текст — інакше recap перестав би бути описом історії й став
 * би генератором вражень. Це також єдина причина, чому весь цей файл узагалі можна покрити
 * тестами.
 *
 * ── ЖОДНОЇ НОВОЇ ТАБЛИЦІ (ТЗ §71-§72) ────────────────────────────────────────────────────────
 * Recap — чиста функція над уже наявним підсумком. Його ніде не зберігають: він перераховується
 * щоразу з тих самих сесій і прочитань. Тому «recap за минулий травень» не може розійтися з тим,
 * що показує Reading Life за травень — це буквально той самий `ReadingPeriodSummary`.
 *
 * ── ТОН (той самий, що й у Читацького відбитка) ───────────────────────────────────────────────
 * Ніколи не докоряти, ніколи не підганяти, ніколи не оцінювати людину. Порожній період — не
 * провал: «читання не записувалось», а не «ти нічого не прочитав». Жодного наказового способу
 * («спробуй», «не здавайся»), жодних оцінних прикметників («мало», «слабко», «нарешті»).
 *
 * Порівняння з попереднім періодом при цьому СИМЕТРИЧНЕ: і «на 40 хв більше», і «на 40 хв
 * менше» — однаково спокійні констатації. Показувати лише зростання було б тихою маніпуляцією:
 * людина перестала б довіряти цифрі, побачивши, що вона з'являється вибірково. Арифметика — не
 * докір; докором її робить наказовий спосіб, якого тут немає.
 */

export type RecapPeriodKind = 'week' | 'month' | 'year';

export interface RecapPeriod {
  kind: RecapPeriodKind;
  /** Перший день періоду, ЛОКАЛЬНА північ. */
  start: Date;
  /** ОСТАННІЙ день періоду (включно) — не наступний після нього. */
  endInclusive: Date;
}

/** Книга, прочитання якої завершилось у періоді. `isReread` — `run_number > 1` (ТЗ §25). */
export interface RecapFinishedBook {
  title: string;
  isReread: boolean;
}

export interface ReadingRecapInput {
  period: RecapPeriod;
  summary: ReadingPeriodSummary;
  /**
   * Підсумок ПОПЕРЕДНЬОГО такого самого періоду. `null`/відсутній — порівняння не показується.
   * Так само воно не показується, якщо попереднього періоду просто не було читання: рядок
   * «на 3 год більше, ніж попереднього тижня» проти нуля — не інформація, а привід для гордості
   * чи сорому, тобто рівно те, чого цей екран уникає.
   */
  previousSummary?: ReadingPeriodSummary | null;
  finishedBooks?: RecapFinishedBook[];
}

export type RecapFactId =
  | 'activeDays'
  | 'time'
  | 'pages'
  | 'finished'
  | 'reread'
  | 'dnf'
  | 'journal'
  | 'pace'
  | 'comparison';

export interface RecapLine {
  id: RecapFactId;
  text: string;
}

export interface ReadingRecap {
  /** Заголовок періоду: «10–16 серпня», «Серпень 2026», «2026». */
  title: string;
  /** Одне сильне речення про період. Ніколи не порожнє. */
  headline: string;
  /** Решта фактів — без того, що вже сказав `headline`. */
  lines: RecapLine[];
  /** У періоді не сталось нічого: ні сесій, ні завершень, ні записів. */
  isEmpty: boolean;
}

const DAY_FORMS = ['день', 'дні', 'днів'] as const;
const BOOK_FORMS = ['книгу', 'книги', 'книг'] as const;
const PAGE_FORMS = ['сторінка', 'сторінки', 'сторінок'] as const;
const ENTRY_FORMS = ['запис', 'записи', 'записів'] as const;
const SESSION_FORMS = ['сеанс', 'сеанси', 'сеансів'] as const;

/** «попереднього тижня/місяця/року» — для рядка порівняння. */
const PREVIOUS_PERIOD_LABEL: Record<RecapPeriodKind, string> = {
  week: 'попереднього тижня',
  month: 'попереднього місяця',
  year: 'попереднього року',
};

/** «Цього тижня/місяця/року» — початок речення. */
const THIS_PERIOD_LABEL: Record<RecapPeriodKind, string> = {
  week: 'Цього тижня',
  month: 'Цього місяця',
  year: 'Цього року',
};

function capitalizeFirst(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

/**
 * Заголовок періоду. Для тижня — діапазон, у якому назва місяця не повторюється двічі, якщо він
 * один («10–16 серпня», а не «10 серпня – 16 серпня»), і рік показується лише тоді, коли тиждень
 * реально перетинає межу року («28 грудня 2026 – 3 січня 2027»).
 *
 * `MMMM` (родовий: «серпня») для дат усередині діапазону й `LLLL` (називний: «серпень») для
 * заголовка місяця — це різні форми в українській, і date-fns їх розрізняє саме так.
 */
export function formatRecapPeriodTitle(period: RecapPeriod): string {
  if (period.kind === 'year') return String(period.start.getFullYear());
  if (period.kind === 'month') {
    return capitalizeFirst(format(period.start, 'LLLL yyyy', { locale: uk }));
  }

  const { start, endInclusive } = period;
  if (start.getFullYear() !== endInclusive.getFullYear()) {
    return `${format(start, 'd MMMM yyyy', { locale: uk })} – ${format(endInclusive, 'd MMMM yyyy', { locale: uk })}`;
  }
  if (start.getMonth() !== endInclusive.getMonth()) {
    return `${format(start, 'd MMMM', { locale: uk })} – ${format(endInclusive, 'd MMMM', { locale: uk })}`;
  }
  return `${start.getDate()}–${format(endInclusive, 'd MMMM', { locale: uk })}`;
}

/** Скільки календарних днів у періоді — для «читав 4 дні із 7». */
export function recapPeriodDayCount(period: RecapPeriod): number {
  return differenceInCalendarDays(period.endInclusive, period.start) + 1;
}

/* ---------------------------------------------------------------------------------------- *
 * НАВІГАЦІЯ ПЕРІОДАМИ
 *
 * Ключ періоду — те, що лежить у маршруті: понеділок для тижня (`yyyy-MM-dd`), `yyyy-MM` для
 * місяця, `yyyy` для року. Усі три розбираються ЛОКАЛЬНО (`readingDayFromKey`,
 * `parseReadingMonthKey`) — ніколи через `new Date(key)`, який для date-only рядка дає
 * UTC-північ і в західних поясах з'їжджає на добу назад.
 *
 * Тиждень, місяць і рік навмисно проходять через один набір функцій: інакше «попередній
 * тиждень» і «попередній місяць» стали б двома різними реалізаціями одного поняття — рівно та
 * фрагментація, яку V1.7 усуває.
 * ---------------------------------------------------------------------------------------- */

/** Ключ періоду → ЛОКАЛЬНА дата всередині нього; `null` на недовірений вхід із маршруту. */
export function resolveRecapAnchor(kind: RecapPeriodKind, periodKey: string): Date | null {
  if (kind === 'week') return readingDayFromKey(periodKey);
  if (kind === 'month') {
    const parsed = parseReadingMonthKey(periodKey);
    return parsed ? new Date(parsed.year, parsed.month - 1, 1) : null;
  }
  if (!/^\d{4}$/.test(periodKey)) return null;
  return new Date(Number(periodKey), 0, 1);
}

/** Дата всередині періоду → його ключ. Дзеркальна до `resolveRecapAnchor`. */
export function recapPeriodKeyOf(kind: RecapPeriodKind, anchor: Date): string {
  if (kind === 'week') return readingWeekKeyOf(anchor);
  if (kind === 'month') return formatReadingMonthKey(anchor.getFullYear(), anchor.getMonth() + 1);
  return String(anchor.getFullYear());
}

/** Canonical-діапазон періоду, що містить `anchor` — той самий `readingCalendar`, що й усюди. */
export function recapRangeOf(kind: RecapPeriodKind, anchor: Date): ReadingPeriodRange {
  if (kind === 'week') return weekRange(anchor);
  if (kind === 'month') return monthRange(anchor);
  return yearRange(anchor);
}

/**
 * Сусідній період. `addWeeks`/`addMonths`/`addYears`, а не арифметика на мілісекундах: на тижні
 * з переходом на літній час доба триває 23 або 25 годин, і «мінус 7×24 год» промахнулось би повз
 * понеділок.
 */
export function shiftRecapAnchor(kind: RecapPeriodKind, anchor: Date, delta: number): Date {
  if (kind === 'week') return addWeeks(anchor, delta);
  if (kind === 'month') return addMonths(anchor, delta);
  return addYears(anchor, delta);
}

/**
 * Діапазон → період для заголовка. `endInclusive` — остання МИТЬ періоду (`inclusiveEnd`), тобто
 * його останній календарний день: напіввідкритий `endIso` вказував би вже на наступний день
 * («10–17 серпня» замість «10–16»).
 */
export function recapPeriodFromRange(kind: RecapPeriodKind, range: ReadingPeriodRange): RecapPeriod {
  return {
    kind,
    start: new Date(range.startIso),
    endInclusive: new Date(inclusiveEnd(range)),
  };
}

function formatBookList(titles: string[]): string {
  const quoted = titles.map((title) => `«${title}»`);
  if (quoted.length === 1) return quoted[0]!;
  if (quoted.length === 2) return `${quoted[0]!} і ${quoted[1]!}`;
  return `${quoted.slice(0, -1).join(', ')} і ${quoted[quoted.length - 1]!}`;
}

/**
 * Скільки назв книг показувати текстом, перш ніж перейти на число. Три — межа, за якою речення
 * перестає читатись як речення й починає читатись як список.
 */
const MAX_LISTED_TITLES = 3;

function describeFinished(books: RecapFinishedBook[], count: number, isReread: boolean): string {
  const verb = isReread ? 'перечитав' : 'дочитав';
  if (books.length > 0 && books.length <= MAX_LISTED_TITLES) {
    return `Ти ${verb} ${formatBookList(books.map((book) => book.title))}.`;
  }
  return `Ти ${verb} ${count} ${pluralizeUk(count, BOOK_FORMS)}.`;
}

export function buildReadingRecap(input: ReadingRecapInput): ReadingRecap {
  const { period, summary, previousSummary = null, finishedBooks = [] } = input;

  const title = formatRecapPeriodTitle(period);
  const totalDays = recapPeriodDayCount(period);
  // POLYTSIA V1.7, Phase 10 — визначення переїхало в `readingPeriodSummary.ts`, щоб Recap і
  // Сезони не могли розійтись у тому, що вважається порожнім періодом. Логіка не змінилась.
  const isEmpty = isReadingPeriodEmpty(summary);

  if (isEmpty) {
    return {
      title,
      // Не «ти нічого не прочитав»: порожній період — це відсутність ЗАПИСІВ, а не провал людини.
      headline: `${THIS_PERIOD_LABEL[period.kind]} читання не записувалось.`,
      lines: [],
      isEmpty: true,
    };
  }

  const firstTimeBooks = finishedBooks.filter((book) => !book.isReread);
  const rereadBooks = finishedBooks.filter((book) => book.isReread);

  // Який факт забирає собі headline — решта піде рядками. Порядок пріоритету: завершена книга
  // сильніша за перечитану, перечитана — за самі хвилини, хвилини — за самі записи щоденника.
  const usedByHeadline = new Set<RecapFactId>();
  let headline: string;

  if (summary.firstTimeFinishCount > 0) {
    headline = describeFinished(firstTimeBooks, summary.firstTimeFinishCount, false);
    usedByHeadline.add('finished');
  } else if (summary.rereadFinishCount > 0) {
    headline = describeFinished(rereadBooks, summary.rereadFinishCount, true);
    usedByHeadline.add('reread');
  } else if (summary.sessionCount > 0) {
    headline = `Ти читав ${summary.activeDays} ${pluralizeUk(summary.activeDays, DAY_FORMS)} — разом ${formatCompactDuration(summary.readingMinutes)}.`;
    usedByHeadline.add('activeDays');
    usedByHeadline.add('time');
  } else {
    // Ні сесій, ні завершень — але щось у щоденнику є (інакше період був би порожнім вище).
    const journalCount = summary.journalCount ?? 0;
    headline = `${THIS_PERIOD_LABEL[period.kind]} сеансів не записано, зате в щоденнику з'явилось ${journalCount} ${pluralizeUk(journalCount, ENTRY_FORMS)}.`;
    usedByHeadline.add('journal');
  }

  const lines: RecapLine[] = [];
  const push = (id: RecapFactId, text: string) => {
    if (usedByHeadline.has(id)) return;
    lines.push({ id, text });
  };

  if (summary.activeDays > 0) {
    push(
      'activeDays',
      `Читав ${summary.activeDays} ${pluralizeUk(summary.activeDays, DAY_FORMS)} із ${totalDays}.`,
    );
  }
  if (summary.readingMinutes > 0) {
    push('time', `Разом — ${formatCompactDuration(summary.readingMinutes)}.`);
  }
  if (summary.pagesRead > 0) {
    push('pages', `${summary.pagesRead} ${pluralizeUk(summary.pagesRead, PAGE_FORMS)}.`);
  }
  if (summary.sessionCount > 0 && summary.readingMinutes === 0) {
    // Сесії є, а тривалості немає (старі/імпортовані записи) — чесніше сказати про сеанси, ніж
    // показати «0 хв».
    push(
      'time',
      `${summary.sessionCount} ${pluralizeUk(summary.sessionCount, SESSION_FORMS)} без записаної тривалості.`,
    );
  }
  // Перечитування ніколи не зливається з першим прочитанням (ТЗ §25) — навіть коли headline уже
  // розповів про дочитані вперше.
  if (summary.rereadFinishCount > 0 && !usedByHeadline.has('reread')) {
    push(
      'reread',
      rereadBooks.length > 0 && rereadBooks.length <= MAX_LISTED_TITLES
        ? `Повернувся до ${formatBookList(rereadBooks.map((book) => book.title))}.`
        : `Перечитано ${summary.rereadFinishCount} ${pluralizeUk(summary.rereadFinishCount, BOOK_FORMS)}.`,
    );
  }
  if (summary.dnfRunCount > 0) {
    // «Відклав» — не «кинув»: відкласти книгу це рішення, а не поразка.
    push(
      'dnf',
      `Відкладено ${summary.dnfRunCount} ${pluralizeUk(summary.dnfRunCount, BOOK_FORMS)}.`,
    );
  }
  if ((summary.journalCount ?? 0) > 0) {
    const journalCount = summary.journalCount ?? 0;
    push('journal', `${journalCount} ${pluralizeUk(journalCount, ENTRY_FORMS)} у щоденнику.`);
  }
  if (summary.pagesPerHour != null) {
    push('pace', `Темп — ${Math.round(summary.pagesPerHour)} стор/год.`);
  }

  // Порівняння — останнім рядком і лише за наявності з чим порівнювати (див. `previousSummary`).
  if (previousSummary && previousSummary.readingMinutes > 0 && summary.readingMinutes > 0) {
    const delta = summary.readingMinutes - previousSummary.readingMinutes;
    const previousLabel = PREVIOUS_PERIOD_LABEL[period.kind];
    push(
      'comparison',
      delta === 0
        ? `Стільки ж часу, скільки ${previousLabel}.`
        : delta > 0
          ? `На ${formatCompactDuration(delta)} більше, ніж ${previousLabel}.`
          : `На ${formatCompactDuration(-delta)} менше, ніж ${previousLabel}.`,
    );
  }

  return { title, headline, lines, isEmpty: false };
}
