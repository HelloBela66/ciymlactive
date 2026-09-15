import { readingDayKey } from '@/lib/readingCalendar';

/**
 * POLYTSIA V1.7, Phase 2 — «МОЯ ІСТОРІЯ З ЦІЄЮ КНИГОЮ»
 * (`docs/V1_7_READING_LIFE.md`, ТЗ V1.7 §5-§10).
 *
 * Чиста збірка читацької хронології книги з уже завантажених даних — жодного SQL, жодного
 * `new Date()` без аргумента (той самий house-стиль, що й `rereadComparison.ts`/
 * `readingPeriodSummary.ts`). Вибірку робить hook-шар.
 *
 * ── ЩО ЦЕ НЕ Є ───────────────────────────────────────────────────────────────────────────────
 * Це НЕ технічний лог (ТЗ §7). Подій виду "session started / paused / resumed / saved" тут не
 * буде ніколи. Хронологія — читацька ПАМ'ЯТЬ: «почав», «зберіг думку на 183-й сторінці»,
 * «завершив», «повернувся через рік». Усе дрібне групується.
 *
 * ── ГОЛОВНА СТРУКТУРА: ПРОХІД = ГЛАВА (ТЗ §8) ────────────────────────────────────────────────
 * Кожне прочитання (`reading_run`) — окрема глава історії: «Перше читання, 2026»,
 * «Перечитування, 2028». Події не звалюються в один плаский список, бо тоді дві різні зустрічі
 * з книгою через два роки виглядали б як одна безперервна стрічка.
 *
 * ── ГРУПУВАННЯ СЕСІЙ (ТЗ §7) ─────────────────────────────────────────────────────────────────
 * Усі сесії ОДНОГО проходу згортаються в ОДНУ подію-відрізок:
 *
 *     4–17 квітня · 8 сеансів · 6 год 42 хв · 412 сторінок
 *
 * Саме так, як у прикладі ТЗ. Свідомо НЕ розбиваємо на підгрупи за паузами: прохід і є
 * природною одиницею «однієї зустрічі з книгою», а додаткове дроблення за евристикою «велика
 * пауза» повернуло б до логу, лише дрібнішого. Сесії поза будь-яким проходом (історичні дані до
 * появи `reading_run`, міграція 019/020) групуються в окрему главу без run.
 *
 * ── ЖУРНАЛ: ОКРЕМО ЛИШЕ ЗНАЧУЩЕ (ТЗ §7) ──────────────────────────────────────────────────────
 * Окремою подією показується лише запис, який користувач сам позначив: `isFavorite` («обране»)
 * або `revisitLater` («повернутися пізніше»). Решта записів не зникає — вона рахується в
 * `journalCount` глави («ще 12 записів»), але не роздуває хронологію. Критерій навмисно
 * спирається на ЯВНУ дію користувача, а не на здогадку про «важливість».
 *
 * ── RUN-АТРИБУЦІЯ ЖУРНАЛУ: ЧЕСНО ПРО ОБМЕЖЕННЯ ───────────────────────────────────────────────
 * `note`/`quote` НЕ мають `reading_run_id` у схемі (колонки проходу отримали лише
 * `book_memory`/`pre_reading_reflection`/`book_capsule`/`dnf_reflection`/`rating`, міграції
 * 021-025). Тому прив'язка запису до проходу — двоступенева:
 *   1) `sessionId` → `reading_session.reading_run_id` — ТОЧНА прив'язка (запис зроблено під час
 *      сесії конкретного проходу);
 *   2) інакше — за часом: `createdAt` у межах `[run.startedAt, run.finishedAt)` — ЕВРИСТИКА.
 * Запис, який не лягає ні туди, ні туди (створений між проходами), лишається поза главами.
 * Це задокументоване обмеження, а не недогляд: додавати `reading_run_id` у дві таблиці означало
 * б міграцію, backfill якої спирався б рівно на ту саму евристику (2) — тобто зафіксував би
 * здогадку як факт. ТЗ §10 і формулює цю фічу умовно («якщо Journal entries run-aware»).
 */

export interface TimelineSessionInput {
  id: string;
  readingRunId: string | null;
  startedAt: string;
  durationSeconds: number | null;
  startPage: number;
  endPage: number | null;
}

export interface TimelineRunInput {
  id: string;
  runNumber: number;
  status: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface TimelineJournalInput {
  id: string;
  kind: string;
  sessionId: string | null;
  page: number | null;
  text: string;
  isFavorite: boolean;
  revisitLater: boolean;
  createdAt: string;
}

export interface TimelineMarkInput {
  /** `createdAt` відповідного запису; `null` — запис є, але без дати (не показуємо як подію). */
  at: string | null;
  runId: string | null;
}

export interface TimelineRatingInput extends TimelineMarkInput {
  value: number;
}

/** Згорнутий відрізок читання — головна «робоча» подія глави (ТЗ §7). */
export interface TimelineSessionsSummary {
  firstStartedAt: string;
  lastStartedAt: string;
  sessionCount: number;
  minutes: number;
  pages: number;
  /** Унікальні ЛОКАЛЬНІ календарні дні (canonical-семантика V1.7, `readingCalendar.ts`). */
  daysSpent: number;
}

export type BookTimelineEvent =
  | { kind: 'book_added'; at: string }
  | { kind: 'run_started'; at: string; runId: string; runNumber: number }
  | { kind: 'sessions'; at: string; summary: TimelineSessionsSummary }
  | { kind: 'journal'; at: string; entry: TimelineJournalInput }
  | { kind: 'rating'; at: string; value: number }
  | { kind: 'memory'; at: string }
  | { kind: 'capsule'; at: string }
  | { kind: 'run_finished'; at: string; runId: string; runNumber: number }
  | { kind: 'run_dnf'; at: string; runId: string; runNumber: number };

export interface BookTimelineChapter {
  /** `null` — глава для активності поза будь-яким проходом (історичні дані до `reading_run`). */
  runId: string | null;
  runNumber: number | null;
  status: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  events: BookTimelineEvent[];
  /** Усі записи журналу цієї глави — і показані окремо, і згорнуті. */
  journalCount: number;
  /** Скільки з них показано окремими подіями (обране / «повернутися пізніше»). */
  meaningfulJournalCount: number;
  sessions: TimelineSessionsSummary | null;
  /**
   * Коли людина востаннє відклала цю книгу перед ЦИМ проходом — `finishedAt` попереднього
   * проходу; `null` для першого проходу чи коли попередній ще не завершено.
   *
   * POLYTSIA V1.7, Phase 8 (ТЗ §8): «Ти повернувся до цієї книги через 5 років» — meaningful
   * подія стосунків саме з КНИГОЮ, а не глобальне досягнення. Тому вона живе тут, у хронології
   * книги, і НЕ стає віхою читацької історії.
   *
   * Тут лише ДАНІ: сам проміжок форматує `formatReturnGap` («через 2 роки 4 місяці», ніколи
   * «через 854 дні») на боці екрана — щоб цей модуль лишався вільним від копірайту.
   *
   * Статус попереднього проходу навмисно не звужується до `finished`: повернення через роки до
   * книги, яку колись відклали, — так само повернення до книги. Чим воно було — перечитуванням
   * чи продовженням — уже видно з номера самої глави.
   */
  previousRunFinishedAt: string | null;
}

export interface BookRelationshipTimelineInput {
  addedAt: string | null;
  runs: TimelineRunInput[];
  sessions: TimelineSessionInput[];
  journal: TimelineJournalInput[];
  ratings?: TimelineRatingInput[];
  memories?: TimelineMarkInput[];
  capsules?: TimelineMarkInput[];
}

export interface BookRelationshipTimeline {
  /** Події до/поза главами — наразі лише «додано до бібліотеки». */
  prelude: BookTimelineEvent[];
  chapters: BookTimelineChapter[];
  /** Завершені прочитання (`status === 'finished'`) — скільки разів книгу дочитано. */
  finishedRunCount: number;
  hasReread: boolean;
}

/** Запис журналу вважається значущим лише за ЯВНОЮ дією користувача (ТЗ §7). */
export function isMeaningfulJournalEntry(entry: TimelineJournalInput): boolean {
  return entry.isFavorite || entry.revisitLater;
}

function summarizeSessions(sessions: TimelineSessionInput[]): TimelineSessionsSummary | null {
  if (sessions.length === 0) return null;
  const sorted = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;

  let minutes = 0;
  let pages = 0;
  const dayKeys = new Set<string>();
  for (const session of sorted) {
    // Та сама конвенція, що й `sumSessionMinutes`: округлення на КОЖНУ сесію, тоді сума.
    minutes += Math.round((session.durationSeconds ?? 0) / 60);
    pages += session.endPage != null ? Math.max(0, session.endPage - session.startPage) : 0;
    dayKeys.add(readingDayKey(session.startedAt));
  }

  return {
    firstStartedAt: first.startedAt,
    lastStartedAt: last.startedAt,
    sessionCount: sorted.length,
    minutes,
    pages,
    daysSpent: dayKeys.size,
  };
}

/**
 * Прохід, до якого належить запис журналу. Спершу точна прив'язка через сесію, тоді — часова
 * евристика (докладніше — коментар угорі файлу).
 */
function resolveJournalRunId(
  entry: TimelineJournalInput,
  runIdBySessionId: Map<string, string | null>,
  runs: TimelineRunInput[],
): string | null {
  if (entry.sessionId != null) {
    const viaSession = runIdBySessionId.get(entry.sessionId);
    if (viaSession != null) return viaSession;
  }
  for (const run of runs) {
    const endsAt = run.finishedAt;
    if (entry.createdAt >= run.startedAt && (endsAt == null || entry.createdAt < endsAt)) {
      return run.id;
    }
  }
  return null;
}

function sortEvents(events: BookTimelineEvent[]): BookTimelineEvent[] {
  // Стабільне сортування за часом; при однаковому моменті порядок вставки зберігається
  // (Array.prototype.sort у сучасних рушіях стабільний), тож «почав» лишається перед «завершив»
  // навіть для проходу, створеного одним імпортом з ідентичними мітками часу.
  return [...events].sort((a, b) => a.at.localeCompare(b.at));
}

export function buildBookRelationshipTimeline(
  input: BookRelationshipTimelineInput,
): BookRelationshipTimeline {
  const { addedAt, runs, sessions, journal } = input;
  const ratings = input.ratings ?? [];
  const memories = input.memories ?? [];
  const capsules = input.capsules ?? [];

  const orderedRuns = [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  const runIdBySessionId = new Map<string, string | null>();
  for (const session of sessions) runIdBySessionId.set(session.id, session.readingRunId);

  const sessionsByRunId = new Map<string | null, TimelineSessionInput[]>();
  for (const session of sessions) {
    const key = session.readingRunId;
    const list = sessionsByRunId.get(key);
    if (list) list.push(session);
    else sessionsByRunId.set(key, [session]);
  }

  const journalByRunId = new Map<string | null, TimelineJournalInput[]>();
  for (const entry of journal) {
    const key = resolveJournalRunId(entry, runIdBySessionId, orderedRuns);
    const list = journalByRunId.get(key);
    if (list) list.push(entry);
    else journalByRunId.set(key, [entry]);
  }

  const chapters: BookTimelineChapter[] = [];
  // Коли книгу востаннє відклали перед наступним проходом (ТЗ §8).
  let previousRunFinishedAt: string | null = null;

  for (const run of orderedRuns) {
    const events: BookTimelineEvent[] = [
      { kind: 'run_started', at: run.startedAt, runId: run.id, runNumber: run.runNumber },
    ];

    const runSessions = sessionsByRunId.get(run.id) ?? [];
    const summary = summarizeSessions(runSessions);
    if (summary) events.push({ kind: 'sessions', at: summary.firstStartedAt, summary });

    const runJournal = journalByRunId.get(run.id) ?? [];
    const meaningful = runJournal.filter(isMeaningfulJournalEntry);
    for (const entry of meaningful) events.push({ kind: 'journal', at: entry.createdAt, entry });

    for (const rating of ratings) {
      if (rating.runId === run.id && rating.at != null) {
        events.push({ kind: 'rating', at: rating.at, value: rating.value });
      }
    }
    for (const memory of memories) {
      if (memory.runId === run.id && memory.at != null) events.push({ kind: 'memory', at: memory.at });
    }
    for (const capsule of capsules) {
      if (capsule.runId === run.id && capsule.at != null) events.push({ kind: 'capsule', at: capsule.at });
    }

    if (run.finishedAt != null) {
      const kind = run.status === 'did_not_finish' ? 'run_dnf' : 'run_finished';
      events.push({ kind, at: run.finishedAt, runId: run.id, runNumber: run.runNumber });
    }

    chapters.push({
      runId: run.id,
      runNumber: run.runNumber,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      events: sortEvents(events),
      journalCount: runJournal.length,
      meaningfulJournalCount: meaningful.length,
      sessions: summary,
      previousRunFinishedAt,
    });

    previousRunFinishedAt = run.finishedAt;
  }

  // Активність без проходу — історичні дані до появи `reading_run` (міграції 019/020) або
  // записи між проходами. Показується окремою главою без номера, а не губиться.
  const orphanSessions = sessionsByRunId.get(null) ?? [];
  const orphanJournal = journalByRunId.get(null) ?? [];
  if (orphanSessions.length > 0 || orphanJournal.length > 0) {
    const summary = summarizeSessions(orphanSessions);
    const events: BookTimelineEvent[] = [];
    if (summary) events.push({ kind: 'sessions', at: summary.firstStartedAt, summary });
    const meaningful = orphanJournal.filter(isMeaningfulJournalEntry);
    for (const entry of meaningful) events.push({ kind: 'journal', at: entry.createdAt, entry });

    chapters.push({
      runId: null,
      runNumber: null,
      status: null,
      startedAt: summary?.firstStartedAt ?? orphanJournal[0]?.createdAt ?? null,
      finishedAt: null,
      events: sortEvents(events),
      journalCount: orphanJournal.length,
      meaningfulJournalCount: meaningful.length,
      sessions: summary,
      // Глава без проходу не має «попереднього проходу» за визначенням.
      previousRunFinishedAt: null,
    });
  }

  const finishedRunCount = orderedRuns.filter((run) => run.status === 'finished').length;

  return {
    prelude: addedAt != null ? [{ kind: 'book_added', at: addedAt }] : [],
    chapters,
    finishedRunCount,
    hasReread: finishedRunCount > 1,
  };
}
