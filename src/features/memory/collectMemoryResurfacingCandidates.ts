import type { SQLiteDatabase } from 'expo-sqlite';
import { JournalRepository } from '@/data/repositories/JournalRepository';
import { ReadingRunRepository } from '@/data/repositories/ReadingRunRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { readingMonthKey, readingYearOf } from '@/lib/readingCalendar';
import {
  buildMemoryResurfacingCandidates,
  MIN_JOURNAL_MEMORY_AGE_DAYS,
  type FinishedRunMemoryInput,
  type JournalMemoryInput,
  type MemoryResurfacingCandidate,
  type PastPeriodMemoryInput,
} from '@/lib/memoryResurfacing';
import type { UserBookStatus } from '@/types/userBook';

/**
 * POLYTSIA V1.7, Phase 9 — ЄДИНИЙ шлях «БД → кандидати-спогади» (ТЗ модуль E).
 *
 * Той самий прийом, що вже врятував паритет періодів у Phase 6 (`summarizeReadingPeriod`): якби
 * хук ходив у БД сам, а тест збирав дані «так само», тест доводив би лише те, що його власна
 * копія працює. Тут і `useMemoryResurfacing`, і `memoryResurfacingHistory.test.ts` викликають
 * буквально цю функцію — отже, spoiler-safe і soft-delete перевіряються на справжніх запитах.
 *
 * ПРОДУКТИВНІСТЬ (ТЗ §35): обмежена вибірка записів (не «вся історія Журналу»), один пакетний
 * запит назв книг, жодного запиту на кандидата.
 */

/**
 * Скільки записів щоденника максимум розглядати. Вибірка йде від найновіших СЕРЕД ДОСТАТНЬО
 * СТАРИХ (`dateTo` = поріг «спогаду»), тож стеля не відрізає найцінніше — вона лише не дає
 * завантажити десять тисяч рядків заради шести карток. ТЗ §35: bounded candidate query.
 */
export const JOURNAL_CANDIDATE_POOL_SIZE = 200;

function toJournalInput(
  entry: Awaited<ReturnType<typeof JournalRepository.listFeedPage>>['items'][number],
  bookStatusByUserBookId: Map<string, UserBookStatus>,
): JournalMemoryInput | null {
  const bookStatus = bookStatusByUserBookId.get(entry.userBookId);
  if (bookStatus == null) return null;
  return {
    entryId: entry.id,
    entryType: entry.type,
    isFavorite: entry.isFavorite,
    text: entry.text,
    createdAt: entry.createdAt,
    userBookId: entry.userBookId,
    workId: entry.workId,
    workTitle: entry.workTitle,
    coverUrl: entry.coverUrl,
    coverFallbackColor: entry.coverFallbackColor,
    bookStatus,
  };
}

export async function collectMemoryResurfacingCandidates(
  db: SQLiteDatabase,
  now: Date,
): Promise<MemoryResurfacingCandidate[]> {
  const memoryThreshold = new Date(now.getTime() - MIN_JOURNAL_MEMORY_AGE_DAYS * 24 * 60 * 60 * 1000);

  const [feed, runs] = await Promise.all([
    /**
     * `dateTo` відсікає все свіже ще в SQL — у JS не приїжджають записи, які все одно не пройдуть
     * поріг спогаду. `includeDeletedBooks` — ТЗ §19: книга, прибрана з Бібліотеки, не стирає
     * думку, записану під час її читання (`JournalRepository`, `includeDeletedBooks`).
     *
     * Спойлер-фільтрація вже застосована ВСЕРЕДИНІ цього запиту централізованим `isSpoilerHidden`
     * (ТЗ §15, §16) — resurfacing не має власної реалізації й не може з нею розійтись.
     */
    JournalRepository.listFeedPage(db, {
      dateTo: memoryThreshold.toISOString(),
      limit: JOURNAL_CANDIDATE_POOL_SIZE,
      includeDeletedBooks: true,
    }),
    ReadingRunRepository.listAllFinished(db),
  ]);

  const userBookIds = [
    ...new Set([...feed.items.map((entry) => entry.userBookId), ...runs.map((run) => run.userBookId)]),
  ];
  // `...IncludingDeleted` — той самий History Preservation Principle, що й у віхах (ТЗ §19).
  const userBooks = await UserBookRepository.listWithDetailsByIdsIncludingDeleted(db, userBookIds);
  const bookStatusByUserBookId = new Map(userBooks.map((ub) => [ub.id, ub.status]));
  const bookByUserBookId = new Map(userBooks.map((ub) => [ub.id, ub]));

  const journalEntries = feed.items
    .map((entry) => toJournalInput(entry, bookStatusByUserBookId))
    .filter((entry): entry is JournalMemoryInput => entry != null);

  // Ідентичність книги — `work`, не `user_book`: два видання того самого твору не є двома
  // різними книгами (той самий інваріант, що й у `readingMilestones`).
  const finishedByWorkId = new Map<string, number>();
  const orderedFinished = runs
    .filter((run) => run.status === 'finished' && run.finishedAt != null)
    .sort((a, b) =>
      a.finishedAt! < b.finishedAt! ? -1 : a.finishedAt! > b.finishedAt! ? 1 : a.id < b.id ? -1 : 1,
    );
  for (const run of orderedFinished) {
    const workId = bookByUserBookId.get(run.userBookId)?.work.id;
    if (workId == null) continue;
    finishedByWorkId.set(workId, (finishedByWorkId.get(workId) ?? 0) + 1);
  }

  const seenFirstFinishedWorkIds = new Set<string>();
  const finishedRuns: FinishedRunMemoryInput[] = [];
  for (const run of orderedFinished) {
    const userBook = bookByUserBookId.get(run.userBookId);
    if (userBook == null || run.finishedAt == null) continue;
    const workId = userBook.work.id;
    const isFirstFinishedRun = !seenFirstFinishedWorkIds.has(workId);
    seenFirstFinishedWorkIds.add(workId);
    finishedRuns.push({
      runId: run.id,
      userBookId: run.userBookId,
      workId,
      workTitle: userBook.work.title,
      coverUrl: userBook.edition.coverUrl,
      coverFallbackColor: userBook.work.coverFallbackColor,
      finishedAt: run.finishedAt,
      finishedRunCount: finishedByWorkId.get(workId) ?? 1,
      isFirstFinishedRun,
    });
  }

  return buildMemoryResurfacingCandidates({
    journalEntries,
    finishedRuns,
    pastPeriods: derivePastPeriods(finishedRuns, now),
    now,
  });
}

/**
 * Періоди, які варто перечитати як Recap (ТЗ §3D).
 *
 * Береться з УЖЕ завантажених завершених проходів, без жодного додаткового запиту: місяць, у
 * якому людина щось дочитала, гарантовано має змістовний Recap. Це свідомо вужче за «усі місяці з
 * активністю» — ТЗ §13 просить якість, а не повноту, і місяць із трьома сторінками читання не той
 * спогад, заради якого варто відкривати Recap.
 *
 * Поточні місяць і рік виключені: «Твій вересень 2026» посеред вересня 2026 — це не спогад, а
 * звіт, і він уже має власне місце.
 */
function derivePastPeriods(runs: FinishedRunMemoryInput[], now: Date): PastPeriodMemoryInput[] {
  const nowIso = now.toISOString();
  const currentMonthKey = readingMonthKey(nowIso);
  const currentYear = readingYearOf(nowIso);
  const months = new Map<string, string>();
  const years = new Map<string, string>();

  for (const run of runs) {
    const monthKey = readingMonthKey(run.finishedAt);
    const yearKey = String(readingYearOf(run.finishedAt));
    if (monthKey !== currentMonthKey) {
      const existing = months.get(monthKey);
      if (existing == null || run.finishedAt > existing) months.set(monthKey, run.finishedAt);
    }
    if (yearKey !== String(currentYear)) {
      const existing = years.get(yearKey);
      if (existing == null || run.finishedAt > existing) years.set(yearKey, run.finishedAt);
    }
  }

  return [
    ...[...months.entries()].map(([periodKey, occurredAt]) => ({
      periodKind: 'month' as const,
      periodKey,
      occurredAt,
    })),
    ...[...years.entries()].map(([periodKey, occurredAt]) => ({
      periodKind: 'year' as const,
      periodKey,
      occurredAt,
    })),
  ];
}
