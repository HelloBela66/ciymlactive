import { readingMonthKey } from './readingCalendar';
import {
  computeReadingPeriodSummary,
  type PeriodFinishedRunInput,
  type PeriodSessionInput,
  type ReadingPeriodSummary,
} from './readingPeriodSummary';

/**
 * POLYTSIA V1.7, Phase 4 — READING LIFE (`docs/V1_7_READING_LIFE.md`, ТЗ V1.7 §11-§13, §96-§97).
 *
 * Перетворює ПЛОСКУ історію користувача (усі завершені сесії, усі завершені прочитання, усі
 * записи щоденника) на ієрархію «рік → місяць», якою рухається навігація Reading Life:
 * Профіль → «Моє читання» → «Моя читацька історія» → рік → місяць.
 *
 * ── ЧОМУ ГРУПУВАННЯ В JS, А НЕ `GROUP BY` В SQL ──────────────────────────────────────────────
 * Локальний календарний місяць/рік залежить від часового поясу пристрою (і від того, який offset
 * діяв у КОНКРЕТНИЙ момент — через перехід на літній час), а SQLite цього поясу не знає. Будь-яке
 * `GROUP BY substr(started_at, 1, 7)` повернуло б UTC-місяць — рівно ту misattribution, яку
 * усунула Phase 1 (`docs/V1_7_TEMPORAL_SEMANTICS.md`). Тому бакетування робить JS через
 * `readingMonthKey`, а SQL віддає лише вузькі колонки.
 *
 * ── ЧОМУ ОДНА ФУНКЦІЯ НА ВСЮ ІСТОРІЮ, А НЕ ЗАПИТ НА КОЖЕН РІК ────────────────────────────────
 * FINAL ARCHITECTURAL PRINCIPLE ТЗ: «у «Полиці» не повинно існувати п'ять різних відповідей на
 * питання «скільки я читав цього місяця?»». Тут це забезпечено САМОЮ формою коду, а не
 * дисципліною: і рік, і місяць рахуються ОДНИМ canonical-двигуном (`computeReadingPeriodSummary`,
 * `readingPeriodSummary.ts`) над ОДНИМ і тим самим набором даних. Екран року й екран місяця —
 * це дві проєкції одного результату, а не два незалежні обчислення, які колись можуть розійтись.
 *
 * ── ПРАВИЛО АТРИБУЦІЇ (V1.7) ────────────────────────────────────────────────────────────────
 * Сесія належить ЦІЛКОМ місяцю свого `startedAt` і ніколи не ділиться між періодами. Завершене
 * прочитання належить місяцю свого `finishedAt` — та сама семантика, що вже діє в Сезонах і
 * Wrapped (`ReadingRunRepository.listFinishedBetween` фільтрує саме за `finished_at`), тож
 * Reading Life не вигадує третьої відповіді. Прочитання без `finishedAt` (триває просто зараз)
 * не належить жодному місяцю — воно ще не подія історії.
 *
 * Річний підсумок рахується НЕ сумою місячних: `uniqueFinishedWorkIds` за рік — це унікальні
 * твори року, а не сума унікальних творів кожного місяця (та сама книга, дочитана в березні й
 * перечитана в листопаді, — один твір за рік, але два місячні входження). Тому рік проганяється
 * через двигун власним, повним набором даних. Для адитивних метрик (хвилини/сторінки/сесії/
 * активні дні) рівність «рік = сума місяців» лишається істинною й покрита тестом.
 *
 * Чиста функція (house-стиль `lib/*.ts`): без SQL, без React, без `new Date()` без аргумента.
 */

export interface ReadingLifeInput {
  sessions: PeriodSessionInput[];
  finishedRuns: PeriodFinishedRunInput[];
  /**
   * Моменти створення записів щоденника (нотатки + цитати) за весь час — лише для лічильника
   * «N записів» періоду. Необов'язкові: якщо не передані, `summary.journalCount` лишається
   * `null` («не рахувалось»), а не `0` («рахувалось і нічого не знайшлось»).
   */
  journalInstants?: string[];
}

export interface ReadingLifeMonth {
  year: number;
  /** 1-12, як у людей (не 0-11, як у `Date`). */
  month: number;
  /** `yyyy-MM` — стабільний ключ для маршруту й React Query. */
  monthKey: string;
  summary: ReadingPeriodSummary;
}

export interface ReadingLifeYear {
  year: number;
  summary: ReadingPeriodSummary;
  /** Лише місяці, у яких щось відбулось, найновіший перший. */
  months: ReadingLifeMonth[];
}

export interface ReadingLife {
  /** Лише роки, у яких щось відбулось, найновіший перший. */
  years: ReadingLifeYear[];
}

/** `2026`, `6` → `'2026-06'`. Дзеркальна до `parseReadingMonthKey` нижче. */
export function formatReadingMonthKey(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/**
 * `'2026-06'` → `{ year: 2026, month: 6 }`; `null` для будь-чого іншого. Потрібна на межі з
 * навігацією: `monthKey` приходить у маршрут як рядок параметра (`app/reading-life/month/
 * [monthKey].tsx`), тобто як недовірений вхід — екран не має падати, якщо туди потрапить
 * будь-що.
 */
export function parseReadingMonthKey(monthKey: string): { year: number; month: number } | null {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return null;
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (month < 1 || month > 12) return null;
  return { year, month };
}

interface MonthBucket {
  sessions: PeriodSessionInput[];
  finishedRuns: PeriodFinishedRunInput[];
  journalCount: number;
}

function emptyBucket(): MonthBucket {
  return { sessions: [], finishedRuns: [], journalCount: 0 };
}

function bucketFor(buckets: Map<string, MonthBucket>, monthKey: string): MonthBucket {
  const existing = buckets.get(monthKey);
  if (existing) return existing;
  const created = emptyBucket();
  buckets.set(monthKey, created);
  return created;
}

export function buildReadingLife(input: ReadingLifeInput): ReadingLife {
  const { sessions, finishedRuns, journalInstants } = input;

  const byMonth = new Map<string, MonthBucket>();

  for (const session of sessions) {
    bucketFor(byMonth, readingMonthKey(session.startedAt)).sessions.push(session);
  }

  for (const run of finishedRuns) {
    // Прохід, який ще триває, не має дати завершення — і не належить жодному місяцю історії.
    if (run.finishedAt == null) continue;
    bucketFor(byMonth, readingMonthKey(run.finishedAt)).finishedRuns.push(run);
  }

  if (journalInstants) {
    for (const instant of journalInstants) {
      bucketFor(byMonth, readingMonthKey(instant)).journalCount += 1;
    }
  }

  // Рік визначається з уже обчисленого ключа місяця, а не окремим викликом `readingYearOf`:
  // так місяць фізично не може опинитись в іншому році, ніж каже його власний ключ.
  const byYear = new Map<number, ReadingLifeMonth[]>();

  for (const [monthKey, bucket] of byMonth) {
    const parsed = parseReadingMonthKey(monthKey);
    if (!parsed) continue; // недосяжно: ключ побудований `readingMonthKey`, але тип чесніший за віру
    const summary = computeReadingPeriodSummary({
      sessions: bucket.sessions,
      finishedRuns: bucket.finishedRuns,
      journalCount: journalInstants ? bucket.journalCount : null,
    });
    const months = byYear.get(parsed.year) ?? [];
    months.push({ year: parsed.year, month: parsed.month, monthKey, summary });
    byYear.set(parsed.year, months);
  }

  const years: ReadingLifeYear[] = [];

  for (const [year, months] of byYear) {
    months.sort((a, b) => b.month - a.month);

    // Річний підсумок — власний прогін двигуна над УСІМА даними року (див. шапку файлу про
    // те, чому це не сума місячних).
    const yearSessions: PeriodSessionInput[] = [];
    const yearRuns: PeriodFinishedRunInput[] = [];
    let yearJournalCount = 0;
    for (const month of months) {
      const bucket = byMonth.get(month.monthKey);
      if (!bucket) continue;
      yearSessions.push(...bucket.sessions);
      yearRuns.push(...bucket.finishedRuns);
      yearJournalCount += bucket.journalCount;
    }

    years.push({
      year,
      summary: computeReadingPeriodSummary({
        sessions: yearSessions,
        finishedRuns: yearRuns,
        journalCount: journalInstants ? yearJournalCount : null,
      }),
      months,
    });
  }

  years.sort((a, b) => b.year - a.year);
  return { years };
}

export function findReadingLifeYear(life: ReadingLife, year: number): ReadingLifeYear | null {
  return life.years.find((entry) => entry.year === year) ?? null;
}

export function findReadingLifeMonth(life: ReadingLife, monthKey: string): ReadingLifeMonth | null {
  const parsed = parseReadingMonthKey(monthKey);
  if (!parsed) return null;
  const year = findReadingLifeYear(life, parsed.year);
  return year?.months.find((month) => month.monthKey === monthKey) ?? null;
}
