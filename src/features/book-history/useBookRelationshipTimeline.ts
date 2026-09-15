import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { JournalRepository } from '@/data/repositories/JournalRepository';
import { queryKeys } from '@/lib/queryKeys';
import { filterSpoilerSafeJournalEntries, isSpoilerSafeActive } from '@/lib/spoilerSafe';
import {
  buildBookRelationshipTimeline,
  type BookRelationshipTimeline,
  type TimelineJournalInput,
  type TimelineMarkInput,
  type TimelineRatingInput,
  type TimelineRunInput,
  type TimelineSessionInput,
} from '@/lib/bookRelationshipTimeline';
import { useReadingRunsDetail, type ReadingRunDetail } from '@/features/reading-runs/useReadingRunsDetail';
import type { UserBookWithDetails } from '@/types/userBook';

/**
 * POLYTSIA V1.7, Phase 2 — дані для «Моєї історії з цією книгою»
 * (`docs/V1_7_READING_LIFE.md`, ТЗ V1.7 §5-§10).
 *
 * ЧОМУ ДВА ХУКИ, А НЕ ОДИН ВЕЛИКИЙ ЗАПИТ. `useReadingRunsDetail` (Фаза 12 REREADING MODEL) уже
 * є canonical-збирачем даних НА КОЖЕН ПРОХІД: оцінка, спогад, «До/Після», капсула, DNF-знімок і
 * статистика сесій. Він уже використовується «Історією прочитань» і екраном порівняння
 * перечитувань, тобто його результат уже лежить у кеші React Query для цієї книги. Дублювати ці
 * п'ять запитів тут означало б і зайву роботу, і ДРУГЕ джерело правди про прохід — саме те, чого
 * V1.7 уникає. Тому цей хук довантажує лише те, чого там немає (картка книги, сесії, журнал), а
 * збірка хронології відбувається в `useMemo` над обома результатами.
 *
 * SPOILER-SAFE (ТЗ §74): журнал фільтрується тим самим `filterSpoilerSafeJournalEntries`, що й
 * решта однокнижних поверхонь — третьої реалізації політики спойлерів не створюється. Записи
 * попереду поточного прогресу не потрапляють у хронологію взагалі, тож не можуть «підглянути»
 * фінал під час перечитування.
 *
 * ІСТОРІЯ ≠ ЖИВА БІБЛІОТЕКА (ТЗ §73): книга резолвиться через
 * `getByIdWithDetailsIncludingDeleted`-еквівалент (`listWithDetailsByIdsIncludingDeleted`), щоб
 * історія не зникала після того, як книгу прибрали з Бібліотеки — той самий принцип, що вже діє
 * для Календаря, Сезонів і підсумків періодів.
 */

export interface BookTimelineSources {
  userBook: UserBookWithDetails | null;
  sessions: TimelineSessionInput[];
  journal: TimelineJournalInput[];
}

function toTimelineJournal(entry: {
  id: string;
  kind: string;
  sessionId: string | null;
  page: number | null;
  text: string;
  isFavorite: boolean;
  revisitLater: boolean;
  createdAt: string;
}): TimelineJournalInput {
  return {
    id: entry.id,
    kind: entry.kind,
    sessionId: entry.sessionId,
    page: entry.page,
    text: entry.text,
    isFavorite: entry.isFavorite,
    revisitLater: entry.revisitLater,
    createdAt: entry.createdAt,
  };
}

/** Картка книги + сесії + (spoiler-safe) журнал — те, чого немає в `useReadingRunsDetail`. */
export function useBookTimelineSources(userBookId: string | undefined) {
  return useQuery<BookTimelineSources>({
    queryKey: queryKeys.bookHistory.sources(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return { userBook: null, sessions: [], journal: [] };
      const db = await getDatabase();

      // `...IncludingDeleted` — History Preservation (ТЗ §73): історія книги лишається доступною
      // після м'якого видалення з Бібліотеки.
      const [userBooks, sessions, journalEntries] = await Promise.all([
        UserBookRepository.listWithDetailsByIdsIncludingDeleted(db, [userBookId]),
        ReadingSessionRepository.listByUserBookId(db, userBookId),
        JournalRepository.listByUserBookId(db, userBookId),
      ]);

      const userBook = userBooks[0] ?? null;

      const spoilerActive =
        userBook != null && isSpoilerSafeActive(userBook.status, userBook.spoilerSafeEnabled);
      const visibleJournal = filterSpoilerSafeJournalEntries(journalEntries, spoilerActive, {
        currentPage: userBook?.currentPage ?? null,
        pageCount: userBook?.edition.pageCount ?? null,
      });

      return {
        userBook,
        sessions: sessions.map(
          (session): TimelineSessionInput => ({
            id: session.id,
            readingRunId: session.readingRunId,
            startedAt: session.startedAt,
            durationSeconds: session.durationSeconds,
            startPage: session.startPage,
            endPage: session.endPage,
          }),
        ),
        journal: visibleJournal.map(toTimelineJournal),
      };
    },
    enabled: !!userBookId,
  });
}

/** Оцінка/спогад/капсула з уже зібраних `ReadingRunDetail` — без жодного додаткового запиту. */
function collectRunMarks(details: ReadingRunDetail[]): {
  runs: TimelineRunInput[];
  ratings: TimelineRatingInput[];
  memories: TimelineMarkInput[];
  capsules: TimelineMarkInput[];
} {
  const runs: TimelineRunInput[] = [];
  const ratings: TimelineRatingInput[] = [];
  const memories: TimelineMarkInput[] = [];
  const capsules: TimelineMarkInput[] = [];

  for (const detail of details) {
    runs.push({
      id: detail.run.id,
      runNumber: detail.run.runNumber,
      status: detail.run.status,
      startedAt: detail.run.startedAt,
      finishedAt: detail.run.finishedAt,
    });
    if (detail.rating) {
      ratings.push({ at: detail.rating.createdAt, runId: detail.run.id, value: detail.rating.value });
    }
    if (detail.memory) memories.push({ at: detail.memory.createdAt, runId: detail.run.id });
    if (detail.capsule) capsules.push({ at: detail.capsule.createdAt, runId: detail.run.id });
  }

  return { runs, ratings, memories, capsules };
}

export interface BookRelationshipTimelineResult {
  timeline: BookRelationshipTimeline | null;
  userBook: UserBookWithDetails | null;
  runDetails: ReadingRunDetail[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Готова хронологія книги. Збірка — чистий `buildBookRelationshipTimeline`
 * (`src/lib/bookRelationshipTimeline.ts`), покритий власними тестами; тут лише постачання даних
 * і мемоізація.
 */
export function useBookRelationshipTimeline(userBookId: string | undefined): BookRelationshipTimelineResult {
  const sourcesQuery = useBookTimelineSources(userBookId);
  const runsQuery = useReadingRunsDetail(userBookId);

  const sources = sourcesQuery.data;
  const runDetails = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);

  const timeline = useMemo(() => {
    if (!sources) return null;
    const { runs, ratings, memories, capsules } = collectRunMarks(runDetails);
    return buildBookRelationshipTimeline({
      addedAt: sources.userBook?.addedAt ?? null,
      runs,
      sessions: sources.sessions,
      journal: sources.journal,
      ratings,
      memories,
      capsules,
    });
  }, [sources, runDetails]);

  return {
    timeline,
    userBook: sources?.userBook ?? null,
    runDetails,
    isLoading: sourcesQuery.isLoading || runsQuery.isLoading,
    isError: sourcesQuery.isError || runsQuery.isError,
    refetch: () => {
      void sourcesQuery.refetch();
      void runsQuery.refetch();
    },
  };
}
