import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { JournalRepository } from '@/data/repositories/JournalRepository';
import { JournalDraftRepository } from '@/data/repositories/JournalDraftRepository';
import { NoteRepository } from '@/data/repositories/NoteRepository';
import { QuoteRepository } from '@/data/repositories/QuoteRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import { invalidateJournal } from '@/lib/journalInvalidation';
import type { JournalEntry, JournalEntryCursor, JournalEntryKind, JournalEntryType } from '@/types/journalEntry';
import type { JournalDraft, SaveJournalDraftInput } from '@/types/journalDraft';

const log = createLogger('features/journal');

/** Усі записи щоденника (note+quote) по одній книзі, найновіші зверху — вкладка "Щоденник"
 * на екрані книги (п.9 ТЗ). */
export function useJournalEntries(userBookId: string | undefined) {
  return useQuery<JournalEntry[]>({
    queryKey: queryKeys.journal.byUserBook(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return [];
      const db = await getDatabase();
      return JournalRepository.listByUserBookId(db, userBookId);
    },
    enabled: !!userBookId,
  });
}

/** Обране по книзі — для вибору карток «Спогад про книгу» (п.16 ТЗ, обране спершу). */
export function useJournalFavorites(userBookId: string | undefined) {
  return useQuery<JournalEntry[]>({
    queryKey: queryKeys.journal.favoritesByUserBook(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return [];
      const db = await getDatabase();
      return JournalRepository.listFavoritesByUserBookId(db, userBookId);
    },
    enabled: !!userBookId,
  });
}

/** Лічильник для бейджа вкладки "Щоденник" на екрані книги. */
export function useJournalCount(userBookId: string | undefined) {
  return useQuery<number>({
    queryKey: queryKeys.journal.countByUserBook(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return 0;
      const db = await getDatabase();
      return JournalRepository.countByUserBookId(db, userBookId);
    },
    enabled: !!userBookId,
  });
}

/** Записи, додані під час конкретної сесії читання (Фаза 3) — "щоденник" прямо в екрані
 * активного читання (`app/session/[sessionId].tsx`). */
export function useJournalBySession(sessionId: string | undefined) {
  return useQuery<JournalEntry[]>({
    queryKey: queryKeys.journal.bySession(sessionId ?? ''),
    queryFn: async () => {
      if (!sessionId) return [];
      const db = await getDatabase();
      return JournalRepository.listBySessionId(db, sessionId);
    },
    enabled: !!sessionId,
  });
}

/** Загальний лічильник (усі книги) — картка-вхід "Мій щоденник" на Home і статистика
 * зверху самого екрана щоденника (Фаза 4). */
export function useJournalGlobalCount() {
  return useQuery<{ total: number; favorites: number }>({
    queryKey: queryKeys.journal.countAll,
    queryFn: async () => {
      const db = await getDatabase();
      return JournalRepository.countAll(db);
    },
  });
}

/** Скільки записів мають кожну реакцію, по всій бібліотеці (Milestone 11, доповнення) — для
 * рядка "N смішних моментів..." на екрані щоденника (`app/journal/index.tsx`). */
export function useJournalReactionCounts() {
  return useQuery<Record<string, number>>({
    queryKey: queryKeys.journal.reactionCounts,
    queryFn: async () => {
      const db = await getDatabase();
      return JournalRepository.countsByReaction(db);
    },
  });
}

export interface JournalFeedFilters {
  favoriteOnly: boolean;
  /** `null` — усі типи. */
  types: JournalEntryType[] | null;
  /** Пошукові фільтри «Мій щоденник» (ТЗ Фази 7 — text/book/reaction/date; `favorite`/`type`
   * вище — вже наявні фільтри Фази 4). Усі — необов'язкові, без жодного — поведінка не
   * відрізняється від Фази 4. */
  query?: string;
  reaction?: string;
  workId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Глобальна стрічка "Мій щоденник" (Фаза 4, розширена пошуком у Фазі 7; `app/journal/index.tsx`)
 * — keyset-пагінація через `useInfiniteQuery`, кожна сторінка несе назву/обкладинку книги
 * кожного запису (`JournalRepository.listFeedPage`, записи різних книг ідуть впереміш). */
export function useJournalFeed(filters: JournalFeedFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.journal.feed({
      favoriteOnly: filters.favoriteOnly,
      types: filters.types,
      query: filters.query ?? null,
      reaction: filters.reaction ?? null,
      workId: filters.workId ?? null,
      dateFrom: filters.dateFrom ?? null,
      dateTo: filters.dateTo ?? null,
    }),
    queryFn: async ({ pageParam }) => {
      const db = await getDatabase();
      return JournalRepository.listFeedPage(db, {
        favoriteOnly: filters.favoriteOnly,
        types: filters.types ?? undefined,
        query: filters.query,
        reaction: filters.reaction,
        workId: filters.workId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        cursor: pageParam,
        limit: 30,
      });
    },
    initialPageParam: null as JournalEntryCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

function repositoryFor(kind: JournalEntryKind) {
  return kind === 'note' ? NoteRepository : QuoteRepository;
}

/** Той самий патерн, що й `useToggleFavorite` для книги (`useUpdateUserBook.ts`) — але тут
 * має ще й знати, у яку з двох таблиць писати (`entry.kind`).
 *
 * `sessionId` — необов'язковий (не всі виклики знають його чи мають сенс з ним), але коли
 * викликач ЗНАЄ, з якою сесією зв'язаний запис (`entry.sessionId`), варто його передати:
 * інакше `invalidateJournal` не змиває `queryKeys.journal.bySession(sessionId)`, і список
 * "Записано під час цієї сесії" (`SessionJournalEntries`, `app/session/[sessionId].tsx`) не
 * покаже зміну, доки не спливе `staleTime` — тап на "обране"/реакцію під час активної сесії
 * виглядав би так, ніби нічого не сталося. */
export function useToggleJournalFavorite() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, "Не вдалося оновити позначку «улюблене».");
  return useMutation<
    void,
    Error,
    { id: string; kind: JournalEntryKind; userBookId: string; isFavorite: boolean; sessionId?: string | null }
  >({
    mutationFn: async ({ id, kind, isFavorite }) => {
      const db = await getDatabase();
      await repositoryFor(kind).setFavorite(db, id, isFavorite);
    },
    onSuccess: (_data, variables) => {
      invalidateJournal(queryClient, variables.userBookId, variables.sessionId);
      if (variables.kind === 'note') {
        queryClient.invalidateQueries({ queryKey: queryKeys.notes.byUserBook(variables.userBookId) });
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.quotes.byUserBook(variables.userBookId) });
      }
    },
    onError,
  });
}

/** `reaction: null` знімає реакцію. `sessionId` — той самий необов'язковий параметр і та сама
 * причина, що й у `useToggleJournalFavorite` вище (щоб `SessionJournalEntries` бачив нову
 * реакцію одразу, не чекаючи `staleTime`). */
export function useSetJournalReaction() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося зберегти реакцію.');
  return useMutation<
    void,
    Error,
    { id: string; kind: JournalEntryKind; userBookId: string; reaction: string | null; sessionId?: string | null }
  >({
    mutationFn: async ({ id, kind, reaction }) => {
      const db = await getDatabase();
      await repositoryFor(kind).setReaction(db, id, reaction);
    },
    onSuccess: (_data, variables) => {
      invalidateJournal(queryClient, variables.userBookId, variables.sessionId);
      if (variables.kind === 'note') {
        queryClient.invalidateQueries({ queryKey: queryKeys.notes.byUserBook(variables.userBookId) });
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.quotes.byUserBook(variables.userBookId) });
      }
    },
    onError,
  });
}

/** Чернетка композера для поточної книги (авто-збереження, п.4 ТЗ) — читається при
 * відкритті композера, щоб запропонувати відновити незбережений текст. */
export function useJournalDraft(userBookId: string | undefined) {
  return useQuery<JournalDraft | null>({
    queryKey: queryKeys.journal.draft(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return null;
      const db = await getDatabase();
      return JournalDraftRepository.get(db, userBookId);
    },
    enabled: !!userBookId,
  });
}

/** Викликається з дебаунсом на кожну зміну тексту в композері (Фаза 3) — без `onError`
 * toast/alert, помилка тут не повинна переривати ввід користувача, лише лягти в лог. */
export function useSaveJournalDraft() {
  const queryClient = useQueryClient();
  return useMutation<JournalDraft, Error, SaveJournalDraftInput>({
    mutationFn: async (input) => {
      const db = await getDatabase();
      return JournalDraftRepository.upsert(db, input);
    },
    onSuccess: (draft) => {
      queryClient.setQueryData(queryKeys.journal.draft(draft.userBookId), draft);
    },
    onError: (error) => {
      log.warn('Не вдалося зберегти чернетку', { error });
    },
  });
}

export function useClearJournalDraft() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { userBookId: string }>({
    mutationFn: async ({ userBookId }) => {
      const db = await getDatabase();
      await JournalDraftRepository.clear(db, userBookId);
    },
    onSuccess: (_data, variables) => {
      queryClient.setQueryData(queryKeys.journal.draft(variables.userBookId), null);
    },
    onError: (error) => {
      log.warn('Не вдалося очистити чернетку', { error });
    },
  });
}
