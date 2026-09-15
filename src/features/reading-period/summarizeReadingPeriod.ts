import type { SQLiteDatabase } from 'expo-sqlite';
import { JournalRepository } from '@/data/repositories/JournalRepository';
import { ReadingRunRepository } from '@/data/repositories/ReadingRunRepository';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import type { ReadingPeriodRange } from '@/lib/readingCalendar';
import { computeReadingPeriodSummary, type ReadingPeriodSummary } from '@/lib/readingPeriodSummary';
import type { ReadingRunStatus } from '@/types/readingRun';
import type { UserBookWithDetails } from '@/types/userBook';

/**
 * POLYTSIA V1.7, Phase 6 — ЄДИНИЙ спосіб дістати canonical-підсумок періоду З БАЗИ
 * (`docs/V1_7_READING_LIFE.md`).
 *
 * `computeReadingPeriodSummary` (`src/lib/readingPeriodSummary.ts`) уже був єдиною ФОРМУЛОЮ, але
 * ланцюжок «діапазон → які саме repository-методи → що передати у формулу» досі жив копіями: у
 * `useReadingRecap`, у `useWrappedYear`, у `useReadingSeason` і в самому parity-тесті. Формула
 * спільна, а от «які саме рядки в неї покласти» — ні, і саме тут могла б непомітно виникнути
 * п'ята відповідь на питання «скільки я читав цього місяця»: досить було б одному споживачеві
 * забути `...IncludingDeleted` або взяти `listStartedOrFinishedBetween` замість
 * `listFinishedBetween`.
 *
 * Тепер таких копій немає: є одна функція, і parity-тест викликає САМЕ ЇЇ, а не свою імітацію
 * того самого ланцюжка.
 *
 * ПРИЙМАЄ `db` ПАРАМЕТРОМ, а не бере `getDatabase()` сама — тоді той самий код виконується і в
 * застосунку, і в тесті на міграйованій тестовій БД. Це не дрібниця: parity-тест, який перевіряє
 * імітацію продакшн-шляху, доводить лише те, що імітація узгоджена сама з собою.
 *
 * СЕМАНТИКА (та сама, що вже діяла в Сезонах і Wrapped після Phase 1):
 * - сесії — за `started_at` у діапазоні (сесія належить ЦІЛКОМ дню свого початку, ніколи не
 *   ділиться між періодами);
 * - прочитання — за `finished_at` у діапазоні, `status IN ('finished','did_not_finish')`;
 * - книги резолвляться `...IncludingDeleted` — History Preservation (§61): видалення книги з
 *   Бібліотеки сьогодні не переписує минулий період;
 * - записи щоденника — лічильник за `created_at` (числа, не тексти, тож spoiler-safe не
 *   застосовується — та сама політика, що й `countAll`).
 */

export interface PeriodBookRow {
  runId: string;
  runNumber: number;
  status: ReadingRunStatus;
  finishedAt: string | null;
  userBook: UserBookWithDetails;
}

export interface ReadingPeriodResult {
  summary: ReadingPeriodSummary;
  /** Один рядок на ПРОХІД, не на книгу: книга, дочитана двічі за період, — дві події історії. */
  books: PeriodBookRow[];
}

export async function summarizeReadingPeriod(
  db: SQLiteDatabase,
  range: ReadingPeriodRange,
): Promise<ReadingPeriodResult> {
  const [runs, sessions, journalCount] = await Promise.all([
    ReadingRunRepository.listFinishedBetween(db, range.startIso, range.endIso),
    ReadingSessionRepository.listStartedBetween(db, range.startIso, range.endIso),
    JournalRepository.countCreatedBetween(db, range.startIso, range.endIso),
  ]);

  const userBooks = await UserBookRepository.listWithDetailsByIdsIncludingDeleted(db, [
    ...new Set(runs.map((run) => run.userBookId)),
  ]);
  const userBookById = new Map(userBooks.map((ub) => [ub.id, ub]));

  const summary = computeReadingPeriodSummary({
    sessions,
    finishedRuns: runs.map((run) => ({
      id: run.id,
      userBookId: run.userBookId,
      workId: userBookById.get(run.userBookId)?.work.id ?? null,
      runNumber: run.runNumber,
      status: run.status,
      finishedAt: run.finishedAt,
    })),
    journalCount,
  });

  const books: PeriodBookRow[] = [];
  for (const run of runs) {
    const userBook = userBookById.get(run.userBookId);
    // Книга з фізично відсутнім edition/work тихо пропускається — той самий підхід, що й
    // `attachDetailsBatch`: підсумок періоду не має падати через одну биту книгу.
    if (!userBook) continue;
    books.push({
      runId: run.id,
      runNumber: run.runNumber,
      status: run.status,
      finishedAt: run.finishedAt,
      userBook,
    });
  }

  return { summary, books };
}

/**
 * Унікальні книги серед ЗАВЕРШЕНИХ прочитань періоду, у порядку завершення. Перечитування тієї
 * самої книги не дублює її (ТЗ §25: перечитування — не «нова книга»); скільки саме було проходів,
 * каже `summary.finishedRunCount`.
 */
export function uniqueFinishedBooks(books: PeriodBookRow[]): UserBookWithDetails[] {
  const seen = new Set<string>();
  const result: UserBookWithDetails[] = [];
  for (const book of books) {
    if (book.status !== 'finished') continue;
    if (seen.has(book.userBook.id)) continue;
    seen.add(book.userBook.id);
    result.push(book.userBook);
  }
  return result;
}
