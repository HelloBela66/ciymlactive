import type { SQLiteDatabase } from 'expo-sqlite';
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { BookCapsuleRepository } from '@/data/repositories/BookCapsuleRepository';
import { ReadingGoalRepository } from '@/data/repositories/ReadingGoalRepository';
import { queryKeys } from '@/lib/queryKeys';
import { findOldestWaitingBook } from '@/lib/tbrPersonality';
import { selectHomePrimaryMemory } from '@/lib/onThisDay';
import { useOnThisDay } from '@/features/on-this-day/useOnThisDay';
import { useReadingMilestones } from '@/features/milestones/useReadingMilestones';
import {
  useHomeResurfacingState,
  useMemoryResurfacingCandidates,
} from '@/features/memory/useMemoryResurfacing';
import {
  journalSemanticKey,
  selectHomeResurfacingCandidate,
  workRelationshipSemanticKey,
} from '@/lib/memoryResurfacing';
import { HomeContextSuppressionStorage } from '@/lib/homeContextSuppressionStorage';
import {
  findStaleReadingCandidate,
  findCapsuleDueCandidate,
  findGoalNearCompletionCandidate,
  findRecentMilestoneCandidate,
  selectVisibleHomeContextCard,
  getHomeContextCardSuppressionKey,
  type StaleReadingCandidate,
  type CapsuleDueCandidate,
  type GoalCandidate,
  type HomeContextCard,
} from '@/lib/homeContext';
import type { BookCapsule } from '@/types/bookCapsule';

interface HomeContextRestData {
  staleReading: StaleReadingCandidate | null;
  capsuleDue: CapsuleDueCandidate | null;
  goalNearCompletion: GoalCandidate | null;
  tbrBookCount: number;
  tbrOldestWaiting: ReturnType<typeof findOldestWaitingBook>;
}

/**
 * Деталі книг due-капсул (обкладинка/назва) ОДНИМ пакетним запитом.
 *
 * POLYTSIA V1.7, Phase 11 (ТЗ §17) — ВИПРАВЛЕНИЙ N+1. Раніше тут був послідовний
 * `getByIdWithDetails` на кожну капсулу, з виправданням «due-капсул завжди мало». Home справді
 * показує лише ОДНУ, але запит робився по ВСІХ прострочених — а їх у людини з роками історії
 * може бути десятки. Пакетний метод уже існував; його просто не застосували.
 */
async function attachCapsuleDetails(
  db: SQLiteDatabase,
  capsules: BookCapsule[],
): Promise<Parameters<typeof findCapsuleDueCandidate>[0]> {
  const userBooks = await UserBookRepository.listWithDetailsByIds(db, [
    ...new Set(capsules.map((capsule) => capsule.userBookId)),
  ]);
  const userBookById = new Map(userBooks.map((ub) => [ub.id, ub]));
  return capsules
    .map((capsule) => ({ capsule, userBook: userBookById.get(capsule.userBookId) }))
    .filter((x): x is { capsule: BookCapsule; userBook: NonNullable<typeof x.userBook> } => x.userBook != null)
    .map(({ capsule, userBook }) => ({
      capsuleId: capsule.id,
      userBookId: capsule.userBookId,
      workId: userBook.work.id,
      title: userBook.work.title,
      coverUrl: userBook.edition.coverUrl,
      coverFallbackColor: userBook.work.coverFallbackColor,
      reopenAt: capsule.reopenAt,
      openedAt: capsule.openedAt,
    }));
}

/**
 * Усі "сирі" дані, потрібні для вибору контекстної картки Home (ТЗ Фази 18, HOME REDESIGN),
 * ОКРІМ «Цей день у твоєму читанні» — той сигнал бере вже наявний `useOnThisDay()` нижче (той
 * самий React Query кеш, що й `OnThisDayCard`, жодного дублювання запиту). Один `queryFn` на
 * решту чотирьох кандидатів (той самий підхід, що й `useTbrRealityCheck`/`useStatistics`) — усі
 * запити тут вузькі й уже проіндексовані/пакетні (`listByStatus`, `listLastCompletedByUserBookIds`,
 * `getDue`, `listAll` цілей — їх завжди мало), тож жодних "10 full table scans" (ТЗ, HOME
 * PERFORMANCE).
 */
function useHomeContextRestData() {
  return useQuery<HomeContextRestData>({
    queryKey: queryKeys.home.contextCard,
    queryFn: async () => {
      const db = await getDatabase();
      const now = new Date();

      const [reading, rereading, dueCapsules, goals, wantToRead] = await Promise.all([
        UserBookRepository.listByStatus(db, 'reading'),
        UserBookRepository.listByStatus(db, 'rereading'),
        BookCapsuleRepository.getDue(db, now.toISOString()),
        ReadingGoalRepository.listAll(db),
        UserBookRepository.listByStatus(db, 'want_to_read'),
      ]);

      // Той самий набір статусів, що й `StaleReadingSection` на Book Details
      // (`app/work/[workId].tsx`) — "Читаю"/"Перечитую", не лише буквальне "reading" з ТЗ.
      const activeReadingBooks = [...reading, ...rereading];
      const lastSessions = await ReadingSessionRepository.listLastCompletedByUserBookIds(
        db,
        activeReadingBooks.map((ub) => ub.id),
      );

      const staleReading = findStaleReadingCandidate(
        activeReadingBooks.map((ub) => ({
          userBookId: ub.id,
          workId: ub.work.id,
          title: ub.work.title,
          coverUrl: ub.edition.coverUrl,
          coverFallbackColor: ub.work.coverFallbackColor,
          lastSession: lastSessions.get(ub.id) ?? null,
        })),
        now,
      );

      // Дешевий попередній фільтр ДО запиту деталей: переглянуті due-капсули однаково
      // відфільтрувались би (`findCapsuleDueCandidate`), тож тягнути їхні книги не варто.
      const unopenedDueCapsules = dueCapsules.filter((c) => c.openedAt == null);
      const capsuleDue =
        unopenedDueCapsules.length > 0
          ? findCapsuleDueCandidate(await attachCapsuleDetails(db, unopenedDueCapsules), now)
          : null;

      const goalsWithProgress = await Promise.all(
        goals.map(async (goal) => ({ goal, progress: await ReadingGoalRepository.getProgress(db, goal) })),
      );
      const goalNearCompletion = findGoalNearCompletionCandidate(goalsWithProgress);

      const tbrOldestWaiting = findOldestWaitingBook(
        wantToRead.map((ub) => ({ userBookId: ub.id, workId: ub.work.id, title: ub.work.title, addedAt: ub.addedAt })),
        now,
      );

      return { staleReading, capsuleDue, goalNearCompletion, tbrBookCount: wantToRead.length, tbrOldestWaiting };
    },
  });
}

/**
 * POLYTSIA V1.6.2, #169 (HOME CONTEXT SUPPRESSION) — ключі карток, приглушених "на сьогодні"
 * (`homeContextSuppressionStorage.ts`). Окремий запит від `useHomeContextRestData` вище (інший
 * queryKey, `queryKeys.home.contextCardSuppression`) — читається з `SecureStore`, не з БД, і
 * інвалідується лише дією "приховати" (`useDismissHomeContextCard` нижче), не будь-яким
 * записом/сесією, що вже інвалідує `contextCard`.
 */
function useHomeContextSuppressedKeys() {
  return useQuery<Set<string>>({
    queryKey: queryKeys.home.contextCardSuppression,
    queryFn: () => HomeContextSuppressionStorage.getActiveKeys(new Date()),
  });
}

/**
 * Вибрана ЄДИНА контекстна картка Home, чи `null` — саму логіку пріоритезації й приглушення
 * рахує чиста `selectVisibleHomeContextCard` (`src/lib/homeContext.ts`), тут лише зібрані докупи
 * "сирі" дані. Повертає `null` і поки будь-які дані ще завантажуються (та сама "тиха деградація",
 * що й решта контекстних карток V1.6) — Home просто не показує розділ, доки не буде відомо, що
 * саме показати, а не "блимає" порожньою карткою чи спінером.
 */
export function useHomeContextCard(): HomeContextCard | null {
  const onThisDayQuery = useOnThisDay();
  const restQuery = useHomeContextRestData();
  const suppressedQuery = useHomeContextSuppressedKeys();
  // POLYTSIA V1.7, Phase 8 (ТЗ §22) — той самий спільний кеш-запис віх, що й Reading Life/Recap.
  // Home не рахує власних віх: якби рахував, «50-та книга» на головній і в Reading Life могли б
  // колись розійтись.
  const milestonesQuery = useReadingMilestones();
  // POLYTSIA V1.7, Phase 9 — той самий спільний кеш-запис спогадів, що й Memory Hub.
  const resurfacingQuery = useMemoryResurfacingCandidates();
  const resurfacingStateQuery = useHomeResurfacingState();

  if (!restQuery.data || !suppressedQuery.data) return null;

  // Один виклик на обидві потреби: «чи хоче On This Day слот» і «які сутності він уже
  // розповідає» (ТЗ модуль E §21) — інакше та сама функція рахувалась би двічі за рендер, і
  // з'явився б шанс, що дві відповіді розійдуться.
  const primaryMemory = onThisDayQuery.data ? selectHomePrimaryMemory(onThisDayQuery.data) : null;
  const onThisDayAvailable = primaryMemory != null;
  // «Зараз» — тут, а не в чистій функції (house convention). Доки віхи вантажаться, кандидата
  // просто немає: картка не блимає й не з'являється з затримкою поверх іншої.
  const milestone = milestonesQuery.data
    ? findRecentMilestoneCandidate(
        milestonesQuery.data.map((view) => ({ id: view.milestone.id, at: view.milestone.at })),
        new Date(),
      )
    : null;

  /**
   * ТЗ модуль E §21, §30 — семантичні ключі того, що ВЖЕ розповідає інша поверхня. Одна подія не
   * повинна прийти до людини двічі різними словами: сьогоднішній «Цей день у твоєму читанні» і
   * віха, що зараз має право на слот, закривають свої сутності для resurfacing.
   *
   * Ключі будуються тими самими функціями, що й у самих кандидатів (`journalSemanticKey` тощо) —
   * саме тому вони експортовані: якби кожна сторона клеїла рядок по-своєму, дедуп мовчки
   * перестав би працювати від однієї зайвої двокрапки.
   */
  const excludedSemanticKeys = new Set<string>();
  if (primaryMemory) {
    excludedSemanticKeys.add(workRelationshipSemanticKey(primaryMemory.primary.workId));
    for (const entry of primaryMemory.primary.journalEntries) {
      excludedSemanticKeys.add(journalSemanticKey(entry.id));
    }
  }
  if (milestone) {
    // Лише та віха, що реально претендує на слот, — не вся історія віх: інакше книга, яка колись
    // була 50-ю завершеною, назавжди втратила б право стати спогадом.
    const milestoneWorkId = milestonesQuery.data?.find((view) => view.milestone.id === milestone.id)?.workId;
    if (milestoneWorkId != null) excludedSemanticKeys.add(workRelationshipSemanticKey(milestoneWorkId));
  }

  const memoryResurfacing = resurfacingQuery.data
    ? selectHomeResurfacingCandidate(resurfacingQuery.data, {
        now: new Date(),
        state: resurfacingStateQuery.data,
        excludedSemanticKeys,
      })
    : null;

  return selectVisibleHomeContextCard(
    { ...restQuery.data, onThisDayAvailable, milestone, memoryResurfacing },
    suppressedQuery.data,
  );
}

/**
 * #169 — дія "приховати на сьогодні" для картки, яку `HomeContextCard.tsx` наразі показує:
 * рахує ключ ОБРАНОЇ картки (`getHomeContextCardSuppressionKey`), приглушує його до завтра
 * (`HomeContextSuppressionStorage.suppressUntilTomorrow`) і інвалідує лише
 * `contextCardSuppression` — наступний рендер `useHomeContextCard` природно "провалиться" до
 * наступного за пріоритетом кандидата (чи нічого не покаже), без жодного нового мережевого/SQL
 * запиту.
 */
export function useDismissHomeContextCard(): (card: HomeContextCard) => void {
  const queryClient = useQueryClient();

  return useCallback(
    (card: HomeContextCard) => {
      const key = getHomeContextCardSuppressionKey(card);
      void HomeContextSuppressionStorage.suppressUntilTomorrow(key, new Date()).then(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.home.contextCardSuppression });
      });
    },
    [queryClient],
  );
}
