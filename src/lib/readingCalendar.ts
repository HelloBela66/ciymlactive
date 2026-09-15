import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';

/**
 * POLYTSIA V1.7 — CANONICAL READING CALENDAR (`docs/V1_7_TEMPORAL_SEMANTICS.md`).
 *
 * ЄДИНА точка перетворення "абсолютний момент часу" → "день читацької історії людини".
 *
 * ЧОМУ ЦЕЙ ФАЙЛ ІСНУЄ. Temporal Semantics Verification (V1.7, перед Phase 1) знайшла, що
 * застосунок мав ТРИ різні відповіді на питання "якого це дня":
 * - Календар — локальний пояс пристрою (`format(new Date(startedAt), 'yyyy-MM-dd')`);
 * - Сезони/Wrapped — UTC (`startedAt.slice(0, 10)`, межі `...T00:00:00.000Z`);
 * - Statistics — ЗМІШАНО, і через це мав реальний виробничий баг: локальний `todayKey`
 *   порівнювався з UTC-підрядком `substr(started_at, 1, 10)`, тож у Києві кожне читання між
 *   00:00 і 03:00 не потрапляло в "сьогодні".
 *
 * Вердикт: `CURRENT UTC SEMANTICS CAUSES HUMAN-CALENDAR MISATTRIBUTION`. Сесія о 00:30 у Києві
 * потрапляла в попередній UTC-день, а читання в новорічну ніч — у Wrapped ПОПЕРЕДНЬОГО року.
 *
 * РІШЕННЯ: canonical = ЛОКАЛЬНИЙ календарний день пристрою. Не тому, що локальний час "кращий"
 * технічно (він нестабільний при зміні поясу — див. `docs/V1_7_TEMPORAL_SEMANTICS.md` §6), а
 * тому, що це і є "людський календар" продукту: користувач пам'ятає, що читав уночі 16-го, а не
 * що instant припав на 15-те за Гринвічем. Календар — найбільш вживана історична поверхня —
 * УЖЕ працював так і показував правильно; уніфікація приводить решту до нього, а не навпаки.
 *
 * ЩО НЕ ЗМІНЮЄТЬСЯ: самі timestamps лишаються абсолютними UTC instants (`toISOString()`), а
 * `duration_seconds` лишається canonical-тривалістю. Проблема ніколи не була в зберіганні —
 * лише в інтерпретації. Тому цей файл нічого не переписує в БД: він лише централізує ЧИТАННЯ.
 *
 * ЖОДНОГО `new Date()` БЕЗ АРГУМЕНТА тут немає (house convention `lib/*.ts`, той самий принцип,
 * що й `season.ts`: "зараз" приходить параметром, щоб функції лишались детермінованими й
 * тестованими). `new Date(iso)` — це парсинг наданого значення, не звертання до годинника.
 */

export const READING_DAY_KEY_FORMAT = 'yyyy-MM-dd';

/**
 * Понеділок як canonical початок тижня (V1.7, рішення власника). Колонка `app_settings.week_start`
 * існує з міграції 001, але не має ані repository-методу, ані UI — і свідомо не підключається цим
 * пасом: це була б нова фіча налаштувань, якої ТЗ не просить. Понеділок — уже де-факто політика
 * застосунку (`buildMonthGrid(monthAnchor, 1)`, `src/lib/calendarGrid.ts`); тут вона стає явною.
 */
export const READING_WEEK_STARTS_ON = 1 as const;

/**
 * Абсолютний instant → ключ календарного дня читацької історії (`yyyy-MM-dd`) у ЛОКАЛЬНОМУ поясі
 * пристрою. Єдиний дозволений спосіб віднести подію до дня.
 *
 * НЕ використовувати `iso.slice(0, 10)` і НЕ використовувати SQL `substr(started_at, 1, 10)` —
 * обидва дають UTC-день, тобто саме ту misattribution, яку цей файл усуває.
 */
export function readingDayKey(instantIso: string): string {
  return format(new Date(instantIso), READING_DAY_KEY_FORMAT);
}

/** Той самий ключ, але з уже наявного `Date` (сітка Календаря, "сьогодні" тощо). */
export function readingDayKeyOf(date: Date): string {
  return format(date, READING_DAY_KEY_FORMAT);
}

/**
 * Напіввідкритий діапазон `[startIso, endIso)` в абсолютних UTC instants, побудований із
 * ЛОКАЛЬНИХ меж періоду. Саме в такому вигляді він іде в SQL (`started_at >= ? AND started_at < ?`)
 * — межі локальні за змістом, але виражені інстантами, тож SQL порівнює однорідні значення й не
 * потребує знання поясу. Це рівно той підхід, який Календар уже застосовував успішно.
 */
export interface ReadingPeriodRange {
  startIso: string;
  endIso: string;
}

function toRange(start: Date, end: Date): ReadingPeriodRange {
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Локальна доба, що містить `date`. */
export function dayRange(date: Date): ReadingPeriodRange {
  const start = startOfDay(date);
  return toRange(start, addDays(start, 1));
}

/**
 * Локальний тиждень, що містить `date`: понеділок 00:00 → наступний понеділок 00:00.
 * `addWeeks`, а не `addDays(start, 7)` — на тижні з переходом на літній/зимовий час доба триває
 * 23 або 25 годин, і `addWeeks` коректно дає саме наступний понеділок 00:00 локального часу, а
 * не "рівно 168 годин по тому".
 */
export function weekRange(date: Date): ReadingPeriodRange {
  const start = startOfWeek(date, { weekStartsOn: READING_WEEK_STARTS_ON });
  return toRange(start, addWeeks(start, 1));
}

/** Локальний календарний місяць, що містить `date`. */
export function monthRange(date: Date): ReadingPeriodRange {
  const start = startOfMonth(date);
  return toRange(start, addMonths(start, 1));
}

/** Локальний календарний рік, що містить `date`. */
export function yearRange(date: Date): ReadingPeriodRange {
  const start = startOfYear(date);
  return toRange(start, addYears(start, 1));
}

/**
 * Місяць за номером (`month` — 1-12, як у людей, не 0-11 як у `Date`). Для Сезонів, які
 * будують діапазон із трьох конкретних місяців, а не з "місяця, що містить дату".
 */
export function monthRangeOf(year: number, month: number): ReadingPeriodRange {
  const start = new Date(year, month - 1, 1);
  return toRange(startOfMonth(start), addMonths(startOfMonth(start), 1));
}

/** Рік за номером — для Wrapped/Year Recap, які отримують рік числом. */
export function yearRangeOf(year: number): ReadingPeriodRange {
  const start = new Date(year, 0, 1);
  return toRange(startOfYear(start), addYears(startOfYear(start), 1));
}

/**
 * Діапазон, що охоплює кілька послідовних місяців (Сезон — три місяці, можливо через межу року:
 * зима = грудень попереднього року + січень + лютий). `monthCount` місяців, починаючи з
 * `year`/`month`.
 */
export function monthSpanRange(year: number, month: number, monthCount: number): ReadingPeriodRange {
  const start = startOfMonth(new Date(year, month - 1, 1));
  return toRange(start, addMonths(start, monthCount));
}

/**
 * ВКЛЮЧНА верхня межа (`endIso − 1мс`) для тих небагатьох запитів, чий контракт історично
 * включає верхню межу (`JournalRepository.listFeedPage`'s `dateTo`) — щоб той самий діапазон не
 * доводилось перераховувати вручну на кожному виклику з ризиком розійтись на мілісекунду.
 */
export function inclusiveEnd(range: ReadingPeriodRange): string {
  return new Date(new Date(range.endIso).getTime() - 1).toISOString();
}
