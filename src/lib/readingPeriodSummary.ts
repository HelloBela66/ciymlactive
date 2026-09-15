import { readingDayKey } from '@/lib/readingCalendar';
import { sumSessionMinutes, sumSessionPages } from '@/lib/readingAggregates';
import { pagesPerMinuteFromTotals } from '@/lib/readingPace';

/**
 * POLYTSIA V1.7 — ЄДИНИЙ canonical-двигун базових метрик періоду
 * (`docs/V1_7_READING_LIFE.md`, `docs/V1_7_TEMPORAL_SEMANTICS.md`).
 *
 * ПРИНЦИП: у «Полиці» не повинно існувати п'яти різних відповідей на питання «скільки я читав
 * цього місяця?». Повинна бути ОДНА історична правда і різні способи її показати. Цей файл —
 * та сама одна правда для тижня, місяця, року, сезону й будь-якого майбутнього періоду.
 *
 * Споживачі (обов'язково): Weekly Recap, Monthly Recap, Year Recap/Wrapped, Reading Seasons,
 * Statistics (для метрик, що збігаються). Календар може мати власну ВІЗУАЛЬНУ read-модель
 * (клітинка дня, cover-стек), але не має права винаходити інше значення хвилин/сторінок/
 * завершених прочитань/активних днів.
 *
 * ЧИСТА функція над уже завантаженими даними (той самий house-стиль, що й `rereadComparison.ts`/
 * `readingPace.ts`): жодного SQL, жодного `new Date()` без аргумента, жодного звертання до
 * репозиторіїв. Вибірку робить hook-шар, який передає сюди вже відфільтровані дані періоду.
 *
 * ПРАВИЛО АТРИБУЦІЇ (V1.7, прийнято власником): одна `ReadingSession` належить ЦІЛКОМ
 * календарній даті свого `started_at` і НІКОЛИ не ділиться між періодами — ні через північ, ні
 * через понеділок, ні через межу місяця, ні через 31 грудня → 1 січня. Це правило однакове для
 * тривалості, сторінок, кількості сесій і активних днів.
 *
 * Правило виконується САМОЮ ФОРМОЮ вибірки, а не додатковою перевіркою тут: hook бере сесії
 * діапазоном `started_at >= startIso AND started_at < endIso`, де межі побудовані з ЛОКАЛЬНИХ
 * меж періоду (`readingCalendar.ts`). Сесія, що почалась 31 серпня о 23:50 і скінчилась 1
 * вересня о 00:20, потрапляє у серпневий діапазон за `started_at` — і вся її тривалість та вся
 * її дельта сторінок належать серпню. Тому:
 *
 * - ТРИВАЛІСТЬ НЕ ДУБЛЮЄТЬСЯ: `duration_seconds` кожної сесії додається рівно один раз, у рівно
 *   один період. Сума за всіма періодами дорівнює сумі за всіма сесіями (інваріант, покритий
 *   тестом).
 * - СТОРІНКИ НЕ ДІЛЯТЬСЯ: уся додатна дельта `endPage − startPage` іде в той самий період.
 *   Це свідома відмова, а не недогляд: внутрішньосесійного page-timeline у схемі НЕМАЄ
 *   (`reading_session` має лише `start_page`/`end_page`; `paused_intervals` містить самі часові
 *   мітки без сторінок; `reading_progress` записує одну точку на завершення сесії). Даних, щоб
 *   чесно сказати "5 сторінок до півночі, 12 після", не існує — тож поділ не вигадується.
 */

export interface PeriodSessionInput {
  startedAt: string;
  durationSeconds: number | null;
  startPage: number;
  endPage: number | null;
}

/**
 * Завершене прохождення книги в межах періоду. `workId` резолвиться викликачем (run знає лише
 * `userBookId`) — щоб ця функція лишалась чистою й не робила власних запитів; `null`, якщо
 * книгу/видання неможливо резолвити (фізично видалені дані — деградуємо тихо, не падаємо).
 */
export interface PeriodFinishedRunInput {
  id: string;
  userBookId: string;
  workId: string | null;
  /** 1 — перше прочитання, >1 — перечитування (`reading_run.run_number`). */
  runNumber: number;
  status: string;
  finishedAt: string | null;
}

export interface ReadingPeriodSummary {
  readingMinutes: number;
  pagesRead: number;
  sessionCount: number;
  /** Кількість УНІКАЛЬНИХ локальних календарних днів із хоча б однією завершеною сесією. */
  activeDays: number;
  /** Самі ключі днів (`yyyy-MM-dd`, локальні) — для streak/теплової карти, без повторного обчислення. */
  activeDayKeys: string[];
  /** Завершені прочитання (`status === 'finished'`). DNF сюди НЕ входить. */
  finishedRunCount: number;
  /** Із них — перші прочитання (`runNumber === 1`). */
  firstTimeFinishCount: number;
  /** Із них — перечитування (`runNumber > 1`). ТЗ §25: не називати перечитування "новою книгою". */
  rereadFinishCount: number;
  /** Кинуті в межах періоду (`status === 'did_not_finish'`) — окремо, ніколи не в `finishedRunCount`. */
  dnfRunCount: number;
  /** Унікальні твори серед завершених прочитань (ідентичність — `work`, не `user_book`/`edition`). */
  uniqueFinishedWorkIds: string[];
  /** `user_book` завершених прочитань, у порядку завершення — для обкладинок і навігації. */
  finishedUserBookIds: string[];
  journalCount: number | null;
  /**
   * Середній темп, сторінок/год. `null`, коли даних недостатньо (нема хвилин або нема сторінок)
   * — ТЗ §28: метрика ховається, а не показує `0 стор/год` через відсутність page tracking.
   */
  pagesPerHour: number | null;
}

export interface ReadingPeriodSummaryInput {
  sessions: PeriodSessionInput[];
  finishedRuns: PeriodFinishedRunInput[];
  journalCount?: number | null;
}

export const EMPTY_READING_PERIOD_SUMMARY: ReadingPeriodSummary = {
  readingMinutes: 0,
  pagesRead: 0,
  sessionCount: 0,
  activeDays: 0,
  activeDayKeys: [],
  finishedRunCount: 0,
  firstTimeFinishCount: 0,
  rereadFinishCount: 0,
  dnfRunCount: 0,
  uniqueFinishedWorkIds: [],
  finishedUserBookIds: [],
  journalCount: null,
  pagesPerHour: null,
};

/**
 * Темп сторінок/год із уже підсумованих величин. Окрема функція, щоб "коли темп недостовірний"
 * жило в одному місці: `pagesPerMinuteFromTotals` (`readingPace.ts`) уже інкапсулює "0, якщо
 * ділити нема на що", а ТЗ §28 додає продуктову вимогу — за відсутності даних показувати НЕ
 * нуль, а нічого.
 */
export function computePagesPerHour(pagesRead: number, readingMinutes: number): number | null {
  if (readingMinutes <= 0 || pagesRead <= 0) return null;
  const perMinute = pagesPerMinuteFromTotals(pagesRead, readingMinutes);
  if (perMinute <= 0) return null;
  return perMinute * 60;
}

export function computeReadingPeriodSummary(input: ReadingPeriodSummaryInput): ReadingPeriodSummary {
  const { sessions, finishedRuns, journalCount = null } = input;

  const readingMinutes = sumSessionMinutes(sessions);
  const pagesRead = sumSessionPages(sessions);

  // Локальний календарний день (`readingCalendar.ts`), НЕ `startedAt.slice(0, 10)` — саме ця
  // заміна усуває misattribution нічних сесій (`docs/V1_7_TEMPORAL_SEMANTICS.md` §4).
  const dayKeys = new Set<string>();
  for (const session of sessions) dayKeys.add(readingDayKey(session.startedAt));
  const activeDayKeys = [...dayKeys].sort();

  const finished = finishedRuns.filter((run) => run.status === 'finished');
  const dnfRunCount = finishedRuns.filter((run) => run.status === 'did_not_finish').length;

  const uniqueWorkIds = new Set<string>();
  for (const run of finished) {
    if (run.workId != null) uniqueWorkIds.add(run.workId);
  }

  return {
    readingMinutes,
    pagesRead,
    sessionCount: sessions.length,
    activeDays: activeDayKeys.length,
    activeDayKeys,
    finishedRunCount: finished.length,
    firstTimeFinishCount: finished.filter((run) => run.runNumber <= 1).length,
    rereadFinishCount: finished.filter((run) => run.runNumber > 1).length,
    dnfRunCount,
    uniqueFinishedWorkIds: [...uniqueWorkIds],
    finishedUserBookIds: finished.map((run) => run.userBookId),
    journalCount,
    pagesPerHour: computePagesPerHour(pagesRead, readingMinutes),
  };
}
