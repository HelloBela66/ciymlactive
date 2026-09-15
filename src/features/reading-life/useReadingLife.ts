import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { JournalRepository } from '@/data/repositories/JournalRepository';
import { ReadingRunRepository } from '@/data/repositories/ReadingRunRepository';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { queryKeys } from '@/lib/queryKeys';
import { monthRangeOf, parseReadingMonthKey } from '@/lib/readingCalendar';
import {
  buildReadingLife,
  findReadingLifeMonth,
  findReadingLifeYear,
  type ReadingLife,
  type ReadingLifeMonth,
  type ReadingLifeYear,
} from '@/lib/readingLife';
import type { ReadingRunStatus } from '@/types/readingRun';
import type { UserBookWithDetails } from '@/types/userBook';

/**
 * POLYTSIA V1.7, Phase 4 — «Моя читацька історія» (`docs/V1_7_READING_LIFE.md`, ТЗ V1.7
 * §11-§13, §96-§97).
 *
 * ОДИН запит на всю історію → ОДИН `buildReadingLife` → три екрани як його проєкції (список
 * років, рік із місяцями, окремий місяць). Це не оптимізація, а спосіб виконати FINAL
 * ARCHITECTURAL PRINCIPLE ТЗ структурно: у застосунку не повинно існувати кількох різних
 * відповідей на «скільки я читав цього місяця?». Якби екран року й екран місяця мали власні
 * `queryFn`, вони були б двома незалежними обчисленнями тієї самої історичної правди — і мали б
 * право колись розійтись. Тут розійтись нема чому: рік і місяць читають один кеш-запис
 * (`queryKeys.readingLife.all`) і один canonical-двигун (`computeReadingPeriodSummary`).
 *
 * НЕ НОВА ТАБЛИЦЯ (ТЗ §71-§72, §14): усе derived із уже наявних `reading_session`/`reading_run`/
 * `note`/`quote`. Жодного write-шляху тут немає й не може бути.
 *
 * ЦІНА ЗАПИТУ. Три вузькі вибірки за весь час: сесії (4 колонки з 13), завершені прочитання й
 * часові мітки записів щоденника. Це строго дешевше за `listAllCompleted` (`SELECT *` по всіх
 * сесіях), який застосунок і так уже робить для Читацького профілю й Відбитка. Групування за
 * ЛОКАЛЬНИМ місяцем — у JS, бо SQLite не знає часового поясу пристрою (докладніше — коментарі
 * при самих методах репозиторіїв і шапка `src/lib/readingLife.ts`).
 */
export function useReadingLife() {
  return useQuery<ReadingLife>({
    queryKey: queryKeys.readingLife.all,
    queryFn: async () => {
      const db = await getDatabase();

      const [sessions, runs, journalInstants] = await Promise.all([
        ReadingSessionRepository.listAllCompletedMetrics(db),
        ReadingRunRepository.listAllFinished(db),
        JournalRepository.listCreatedInstants(db),
      ]);

      // `workId` резолвиться тут, а не в чистій функції: прохід знає лише `userBookId`, а
      // «унікальні твори» рахуються за `work.id`. Один пакетний запит на всі книги, які колись
      // були дочитані — не по одному на прохід.
      const workIdByUserBookId = await UserBookRepository.listWorkIdsByIds(db, [
        ...new Set(runs.map((run) => run.userBookId)),
      ]);

      return buildReadingLife({
        sessions,
        finishedRuns: runs.map((run) => ({
          id: run.id,
          userBookId: run.userBookId,
          workId: workIdByUserBookId.get(run.userBookId) ?? null,
          runNumber: run.runNumber,
          status: run.status,
          finishedAt: run.finishedAt,
          // ТЗ §9 — збережена дата завершення, якщо є: саме за нею прохід лягає в місяць.
          finishedCalendarDate: run.finishedCalendarDate,
        })),
        journalInstants,
      });
    },
  });
}

/**
 * Стани, які потрібні екранам-зрізам. Свідомо ВУЗЬКИЙ тип замість `...query` розсипом: повний
 * `UseQueryResult` — дискримінований union, і розсип його в новий об'єкт не лише втрачає це
 * звуження, а й віддає екранам купу полів, які їм ні до чого.
 */
interface ReadingLifeSliceState {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Один рік історії. НЕ окремий запит — зріз того самого кеш-запису (`useReadingLife` вище).
 * `year: null` при вже завантажених даних означає саме «цього року в історії немає», а не
 * «ще не завантажилось» — екран розрізняє ці стани за `isLoading`.
 */
export function useReadingLifeYear(
  year: number,
): ReadingLifeSliceState & { year: ReadingLifeYear | null } {
  const query = useReadingLife();
  return {
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
    year: query.data ? findReadingLifeYear(query.data, year) : null,
  };
}

/** Один місяць історії — той самий зріз того самого кеш-запису, що й `useReadingLifeYear`. */
export function useReadingLifeMonth(
  monthKey: string,
): ReadingLifeSliceState & { month: ReadingLifeMonth | null } {
  const query = useReadingLife();
  return {
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
    month: query.data ? findReadingLifeMonth(query.data, monthKey) : null,
  };
}

export interface ReadingLifeMonthBook {
  runId: string;
  runNumber: number;
  status: ReadingRunStatus;
  finishedAt: string | null;
  userBook: UserBookWithDetails;
}

/**
 * Книги, прочитання яких завершилось у цьому місяці — назви й обкладинки для розділу «Що я
 * дочитав». ОКРЕМИЙ, вузький діапазонний запит, а не частина `useReadingLife`: повні деталі
 * книг потрібні лише відкритому місяцю, тоді як загальний запит обслуговує всю історію одразу.
 *
 * Той самий `listFinishedBetween` + `listWithDetailsByIdsIncludingDeleted`, що вже обслуговує
 * Сезони й Wrapped — і та сама History Preservation: книга, прибрана з Бібліотеки сьогодні, не
 * зникає з місяця, у якому її було прочитано (§61).
 *
 * ОДИН рядок на ПРОХІД, не на книгу: якщо книгу дочитано двічі за місяць (рідко, але можливо —
 * тонка книжка й перечитування), це дві реальні події історії, і «Прочитання №2» видно на місці.
 * Кількість книг проти кількості проходів уже чесно розводить сам `summary`
 * (`uniqueFinishedWorkIds` vs `finishedRunCount`).
 */
export function useReadingLifeMonthBooks(monthKey: string) {
  const parsed = parseReadingMonthKey(monthKey);

  return useQuery<ReadingLifeMonthBook[]>({
    queryKey: queryKeys.readingLife.monthBooks(monthKey),
    enabled: parsed != null,
    queryFn: async () => {
      if (!parsed) return [];
      const db = await getDatabase();
      const { startIso, endIso } = monthRangeOf(parsed.year, parsed.month);

      const runs = await ReadingRunRepository.listFinishedBetween(db, startIso, endIso);
      const userBooks = await UserBookRepository.listWithDetailsByIdsIncludingDeleted(db, [
        ...new Set(runs.map((run) => run.userBookId)),
      ]);
      const userBookById = new Map(userBooks.map((ub) => [ub.id, ub]));

      const result: ReadingLifeMonthBook[] = [];
      for (const run of runs) {
        const userBook = userBookById.get(run.userBookId);
        // Книга з фізично відсутнім edition/work тихо пропускається — той самий підхід, що й
        // `attachDetailsBatch`/Wrapped: підсумок місяця не має падати через одну биту книгу.
        if (!userBook) continue;
        result.push({
          runId: run.id,
          runNumber: run.runNumber,
          status: run.status,
          finishedAt: run.finishedAt,
          userBook,
        });
      }
      return result;
    },
  });
}
