import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import type { ReadingSession } from '@/types/readingSession';

const log = createLogger('features/reading-session');

function useInvalidateSessions() {
  const queryClient = useQueryClient();
  return (session?: { id: string; userBookId: string } | null) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions.active });
    if (session) {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(session.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.history(session.userBookId) });
    }
    // Book Details показує "почати"/"продовжити" залежно від активної сесії книги.
    queryClient.invalidateQueries({ queryKey: queryKeys.works.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.userBooks.all });
    // ТЗ Фази 8 (READING CONTINUITY) — старт/завершення/скасування сесії міняють "останню
    // завершену сесію" картки "Зараз читаєш" на Home. Префікс, не повний параметризований
    // ключ (`queryKeys.sessions.continuity`, той самий підхід, що й `journal.feed`/
    // `invalidateJournal`) — так змивається кеш незалежно від того, який саме набір
    // `userBookIds` був у списку на момент запиту.
    queryClient.invalidateQueries({ queryKey: ['sessions', 'continuity'] });
  };
}

export function useStartSession() {
  const invalidate = useInvalidateSessions();
  const onError = useMutationErrorHandler(log, 'Не вдалося почати сесію читання. Спробуй ще раз.');
  return useMutation<ReadingSession, Error, { userBookId: string; startPage: number; goalMinutes?: number | null }>({
    mutationFn: async (params) => {
      const db = await getDatabase();
      return ReadingSessionRepository.start(db, params);
    },
    onSuccess: (session) => invalidate(session),
    onError,
  });
}

export function usePauseSession() {
  const invalidate = useInvalidateSessions();
  const onError = useMutationErrorHandler(log, 'Не вдалося поставити сесію на паузу.');
  return useMutation<void, Error, { id: string; userBookId: string }>({
    mutationFn: async ({ id }) => {
      const db = await getDatabase();
      await ReadingSessionRepository.pause(db, id);
    },
    onSuccess: (_data, variables) => invalidate(variables),
    onError,
  });
}

export function useResumeSession() {
  const invalidate = useInvalidateSessions();
  const onError = useMutationErrorHandler(log, 'Не вдалося відновити сесію читання.');
  return useMutation<void, Error, { id: string; userBookId: string }>({
    mutationFn: async ({ id }) => {
      const db = await getDatabase();
      await ReadingSessionRepository.resume(db, id);
    },
    onSuccess: (_data, variables) => invalidate(variables),
    onError,
  });
}

/** Найризикованіша мутація сесії (аудит Milestone 8 — реальний ризик втрати даних): якщо
 * впаде, прогрес сесії (сторінки, mood note) міг НЕ зберегтись, а користувач про це раніше
 * не дізнавався (екран сесії перевіряв лише `isPending`, ніколи `isError`) — тепер тост
 * гарантовано показує, що зберегти не вдалось, замість тихого зникнення прогресу. */
export function useFinishSession() {
  const invalidate = useInvalidateSessions();
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(
    log,
    'Не вдалося зберегти сесію читання. Спробуй ще раз — прогрес ще не втрачено, сесія лишається активною.',
  );
  return useMutation<
    ReadingSession | null,
    Error,
    { id: string; userBookId: string; endPage: number; moodNote?: string | null }
  >({
    mutationFn: async ({ id, endPage, moodNote }) => {
      const db = await getDatabase();
      return ReadingSessionRepository.finish(db, id, { endPage, moodNote });
    },
    onSuccess: (_data, variables) => {
      invalidate(variables);
      // Завершена сесія міняє загальну статистику, streaks, прогрес цілей і крапки
      // календаря — усе це рахується "на льоту" з reading_session, тож просто інвалідуємо.
      queryClient.invalidateQueries({ queryKey: queryKeys.statistics.overall });
      queryClient.invalidateQueries({ queryKey: queryKeys.goals.all });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      // Wrapped (Milestone 10 fix6, `docs/STATUS_V1.md` п. 3.4) — завершення сесії читання це
      // основна дія циклу читання, яку користувач робить найчастіше з усіх, що впливають на
      // підсумок року (сторінки/час читання за рік, найактивніші місяці рахуються саме з
      // reading_session). Без цього рядка Wrapped показував би застарілі дані, доки власний
      // `staleTime` того запиту не спливе сам, а не одразу після завершення сесії.
      queryClient.invalidateQueries({ queryKey: ['wrapped'] });
    },
    onError,
  });
}

/**
 * "Як читалося?" (ТЗ Фази 9 — SESSION REFLECTION), окрема мутація від `useFinishSession` —
 * навмисно: сесія до цього моменту вже безпечно збережена (`ended_at` записано), рефлексія —
 * легкий, необов'язковий крок ПІСЛЯ, тому власна помилка тут ніколи не повинна виглядати як
 * "сесію не збережено" (`SessionReflectionPanel`, `app/session/[sessionId].tsx`, навіть не
 * чекає результату перед переходом на екран книги — тост про помилку тут суто інформаційний).
 */
export function useSetReadingExperience() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(
    log,
    'Не вдалося зберегти "Як читалося?". Сама сесія вже збережена — це лише необов\'язкова позначка.',
  );
  return useMutation<void, Error, { id: string; userBookId: string; value: string | null }>({
    mutationFn: async ({ id, value }) => {
      const db = await getDatabase();
      await ReadingSessionRepository.setReadingExperience(db, id, value);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.history(variables.userBookId) });
    },
    onError,
  });
}

export function useDiscardSession() {
  const invalidate = useInvalidateSessions();
  const onError = useMutationErrorHandler(log, 'Не вдалося скасувати сесію.');
  return useMutation<void, Error, { id: string; userBookId: string }>({
    mutationFn: async ({ id }) => {
      const db = await getDatabase();
      await ReadingSessionRepository.discard(db, id);
    },
    onSuccess: (_data, variables) => invalidate(variables),
    onError,
  });
}
