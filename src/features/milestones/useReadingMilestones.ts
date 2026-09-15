import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { ReadingRunRepository } from '@/data/repositories/ReadingRunRepository';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { queryKeys } from '@/lib/queryKeys';
import { formatMilestoneCopy, type MilestoneCopy } from '@/lib/readingMilestoneCopy';
import { buildReadingMilestones, type ReadingMilestone } from '@/lib/readingMilestones';
import { fetchReadingHistoryStart } from '@/features/reading-period/readingHistoryStart';

/**
 * POLYTSIA V1.7, Phase 8 — MEANINGFUL READING MILESTONES (ТЗ V1.7 модуль D).
 *
 * ЖОДНОЇ НОВОЇ ТАБЛИЦІ (ТЗ §17). Віхи derived із тієї самої історії, що й Reading Life, Recaps і
 * Wrapped: `reading_run` + `reading_session`. Звідси безкоштовно випливає те, чого ТЗ вимагає
 * окремими пунктами: ідемпотентність (§18), стійкість до backup/restore (§34) і збереження віхи
 * після soft-delete книги (§19) — прибрати книгу з Бібліотеки сьогодні не означає, що вона
 * перестала бути 50-ю завершеною.
 *
 * ОДИН КЕШ-ЗАПИС НА ВСІ ПОВЕРХНІ (ТЗ §21-§22). Reading Life, Recap і Home беруть зріз із цього
 * результату (`filterMilestonesInRange`, `latestMilestone`), а не рахують свої віхи — той самий
 * принцип, що вже діє для `readingLife.all`.
 *
 * ПРОДУКТИВНІСТЬ (ТЗ §36). Три вузькі запити (проходи, метрики сесій, дві дати-агрегати) і по
 * ОДНОМУ проходу по кожному масиву всередині `buildReadingMilestones` — не «для кожного порогу
 * завантажити всю історію».
 *
 * Назви книг резолвляться ОДНИМ пакетним запитом і лише для тих кількох віх, що реально
 * посилаються на книгу (їх одиниці, не сотні).
 */

export interface ReadingMilestoneView {
  milestone: ReadingMilestone;
  copy: MilestoneCopy;
  /** Назва книги, з якою пов'язана віха; `null` для ювілею чи зниклої книги. */
  bookTitle: string | null;
  /** Для навігації на книгу — `null`, якщо віха не про конкретну книгу. */
  workId: string | null;
}

export function useReadingMilestones() {
  return useQuery<ReadingMilestoneView[]>({
    queryKey: queryKeys.readingMilestones.all,
    queryFn: async () => {
      const db = await getDatabase();

      const [runs, sessions, earliestReadingInstant] = await Promise.all([
        ReadingRunRepository.listAllFinished(db),
        ReadingSessionRepository.listAllCompletedMetrics(db),
        // POLYTSIA V1.7, Phase 10 — початок історії рахує СПІЛЬНА функція
        // (`fetchReadingHistoryStart`), а не цей хук власним кодом: той самий момент потрібен
        // межам гортання Сезонів, і дві копії обчислення з часом розійшлись би (ТЗ модуль D §11).
        fetchReadingHistoryStart(db),
      ]);

      // Ідентичність книги — `work`, не `user_book`/`edition` (ТЗ §30: два видання того самого
      // твору не є двома різними книгами). `listWorkIdsByIds` не фільтрує `deleted_at` — §19.
      const workIdByUserBookId = await UserBookRepository.listWorkIdsByIds(db, [
        ...new Set(runs.map((run) => run.userBookId)),
      ]);

      const milestones = buildReadingMilestones({
        finishedRuns: runs.map((run) => ({
          runId: run.id,
          userBookId: run.userBookId,
          workId: workIdByUserBookId.get(run.userBookId) ?? null,
          status: run.status,
          finishedAt: run.finishedAt,
        })),
        sessions: sessions.map((entry) => ({
          sessionId: entry.id,
          userBookId: entry.userBookId,
          startedAt: entry.startedAt,
          durationSeconds: entry.durationSeconds,
        })),
        earliestReadingInstant,
        // «Зараз» приходить сюди, а не в чисту функцію: `lib/*.ts` у V1.7 не звертаються до
        // годинника (той самий house-принцип, що й `season.ts`/`readingCalendar.ts`).
        now: new Date(),
      });

      const milestoneUserBookIds = [
        ...new Set(
          milestones
            .map((milestone) => milestone.userBookId)
            .filter((value): value is string => value != null),
        ),
      ];
      const userBooks = await UserBookRepository.listWithDetailsByIdsIncludingDeleted(
        db,
        milestoneUserBookIds,
      );
      const titleByUserBookId = new Map(userBooks.map((ub) => [ub.id, ub.work.title]));
      const workIdForNavigation = new Map(userBooks.map((ub) => [ub.id, ub.work.id]));

      return milestones.map((milestone) => {
        const bookTitle =
          milestone.userBookId != null ? titleByUserBookId.get(milestone.userBookId) ?? null : null;
        return {
          milestone,
          copy: formatMilestoneCopy(milestone, bookTitle),
          bookTitle,
          workId:
            milestone.workId ??
            (milestone.userBookId != null
              ? workIdForNavigation.get(milestone.userBookId) ?? null
              : null),
        };
      });
    },
  });
}
