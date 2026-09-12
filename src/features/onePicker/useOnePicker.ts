import { useMutation } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { GenreRepository } from '@/data/repositories/GenreRepository';
import { SeriesRepository } from '@/data/repositories/SeriesRepository';
import { OwnedBookRepository } from '@/data/repositories/OwnedBookRepository';
import { computeRollingPace, FALLBACK_PAGES_PER_MINUTE } from '@/lib/readingPace';
import { TIME_BUDGET_OPTIONS, estimatePageBudget } from '@/lib/tomorrowRecommendation';
import {
  TBR_SCOPE_STATUSES,
  filterCandidates,
  rankCandidates,
  pickCandidate,
  estimateMinutesToRead,
  formatSeriesStatus,
  buildPickExplanation,
} from '@/lib/onePicker';
import type { PickerCandidate, PickerFilters } from '@/lib/onePicker';
import type { UserBookWithDetails } from '@/types/userBook';

export interface OnePickerInput {
  filters: PickerFilters;
  /** `userBookId`, які вже показані цього сеансу пікера (кнопка «Іншу») — той самий сенс, що й
   * shown-history у `useTomorrowRecommendation.ts`, лише СВІДОМО без окремої таблиці/міграції:
   * пул кандидатів тут — власна невелика бібліотека користувача (не безмежний зовнішній
   * пошук), тож звичайного клієнтського `Set` на час сеансу екрана досить (скидається разом з
   * фільтрами/при виході з екрана) — той самий "не вводь premature caching/persistence
   * complexity" принцип, що й ТЗ `PERFORMANCE TARGETS`. */
  excludeUserBookIds: string[];
}

export interface OnePickerResult {
  userBook: UserBookWithDetails;
  explanation: string;
  estimatedMinutes: number | null;
  seriesStatus: string;
}

/**
 * «Обери мені книгу» (ТЗ Фази 16, ONE BOOK PICKER, `docs/ONE_BOOK_PICKER.md`) — той самий
 * "мутація, не запит" підхід, що й `useTomorrowRecommendation`: результат навмисно
 * недетермінований (випадковий вибір серед топ-N, `pickCandidate`) і не повинен кешуватись
 * React Query як стабільне значення для тих самих фільтрів. Уся логіка фільтрації/ранжування —
 * у `src/lib/onePicker.ts` (чисті, тестовані функції); тут лише збір сирих даних і виклик цих
 * функцій. Дані НЕ покидають пристрій (PRIVATE, як і решта персональної аналітики застосунку).
 */
export function useOnePicker() {
  return useMutation<OnePickerResult | null, Error, OnePickerInput>({
    mutationFn: async ({ filters, excludeUserBookIds }) => {
      const db = await getDatabase();
      const excluded = new Set(excludeUserBookIds);

      // Пул кандидатів — один запит на кожен статус свого TbrScope (найбільше два: 'paused' і
      // 'did_not_finish' для `any_unread`), той самий `listByStatus` запит, що й Бібліотека.
      const statuses = TBR_SCOPE_STATUSES[filters.tbrScope];
      const userBooksByStatus = await Promise.all(statuses.map((status) => UserBookRepository.listByStatus(db, status)));
      const userBooks = userBooksByStatus.flat().filter((ub) => !excluded.has(ub.id));
      if (userBooks.length === 0) return null;

      const workIds = userBooks.map((ub) => ub.work.id);
      const editionIds = userBooks.map((ub) => ub.edition.id);

      // Пакетні запити (той самий Milestone 8-style підхід, що й Wrapped/Seasons/Profile/
      // Fingerprint) замість запиту в циклі на кожну книгу пулу.
      const [genresByWorkId, workIdsInSeries, ownedEditionIds, sessions] = await Promise.all([
        GenreRepository.listByWorkIds(db, workIds),
        SeriesRepository.listWorkIdsInSeries(db, workIds),
        OwnedBookRepository.listOwnedEditionIds(db, editionIds),
        ReadingSessionRepository.listAllCompleted(db),
      ]);

      const candidates: PickerCandidate[] = userBooks.map((ub) => {
        const genres = genresByWorkId.get(ub.work.id) ?? [];
        return {
          userBookId: ub.id,
          status: ub.status,
          pageCount: ub.edition.pageCount,
          genreIds: genres.map((g) => g.id),
          genreNames: genres.map((g) => g.nameUk),
          isInSeries: workIdsInSeries.has(ub.work.id),
          isOwned: ownedEditionIds.has(ub.edition.id),
          descriptionText: ub.work.description,
        };
      });

      const filtered = filterCandidates(candidates, filters);
      if (filtered.length === 0) return null;

      // Темп читання — той самий rolling pace (останні сесії, не lifetime-середнє), що й
      // «Що почитати завтра?»/TBR reality check, з тим самим фолбеком, коли історії ще нема.
      const pace = computeRollingPace(
        sessions.map((s) => ({
          startPage: s.startPage,
          endPage: s.endPage,
          durationSeconds: s.durationSeconds,
          startedAt: s.startedAt,
        })),
      );
      const pagesPerMinute = pace.pagesPerMinute > 0 ? pace.pagesPerMinute : FALLBACK_PAGES_PER_MINUTE;

      const timeBudgetOption = TIME_BUDGET_OPTIONS.find((option) => option.value === filters.timeBudget);
      const pageBudget = estimatePageBudget(timeBudgetOption?.minutesMid ?? TIME_BUDGET_OPTIONS[1]!.minutesMid, pagesPerMinute);

      const ranked = rankCandidates(filtered, pageBudget, filters.desiredMood);
      const picked = pickCandidate(ranked);
      if (!picked) return null;

      const userBook = userBooks.find((ub) => ub.id === picked.candidate.userBookId);
      if (!userBook) return null;

      // Деталі серії (назва/позиція) — лише для ОБРАНОЇ книги, одним точковим запитом
      // (`getContextForWork`), не пакетно: на відміну від фільтра вище (де потрібен лише факт
      // членства для ВСЬОГО пулу), тут потрібні подробиці рівно ОДНІЄЇ вже вибраної книги.
      const seriesContext = picked.candidate.isInSeries
        ? await SeriesRepository.getContextForWork(db, userBook.work.id)
        : null;

      return {
        userBook,
        explanation: buildPickExplanation({ filters, moodMatched: picked.moodMatched, isOwned: picked.candidate.isOwned }),
        estimatedMinutes: estimateMinutesToRead(picked.candidate.pageCount, pagesPerMinute),
        seriesStatus: formatSeriesStatus(
          seriesContext ? { seriesName: seriesContext.series.name, position: seriesContext.position } : null,
        ),
      };
    },
  });
}
