import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Спільний хелпер інвалідації для Milestone 11 (Мій щоденник) — `note`/`quote` лишаються
 * окремими репозиторіями/хуками (`useNotes.ts`/`useQuotes.ts`), але читаються ще й через
 * union-шар `JournalRepository`. Кожна мутація note/quote (create/remove/favorite/reaction)
 * викликає це поряд зі своєю "рідною" інвалідацією, щоб глобальна стрічка/бейдж кількості
 * на екрані книги/обране не лишались застарілими до спливання власного staleTime.
 */
export function invalidateJournal(queryClient: QueryClient, userBookId: string, sessionId?: string | null): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.journal.byUserBook(userBookId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.journal.favoritesByUserBook(userBookId) });
  // POLYTSIA V1.5, Фаза 11 («ПОВЕРНУТИСЯ ПІЗНІШЕ») — той самий привід, що й
  // `favoritesByUserBook` вище: будь-яка мутація note/quote (включно з `setRevisitLater` самою)
  // могла змінити цей список.
  queryClient.invalidateQueries({ queryKey: queryKeys.journal.revisitLaterByUserBook(userBookId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.journal.countByUserBook(userBookId) });
  // Префікс, не повний параметризований ключ (Фаза 4 — `queryKeys.journal.feed` тепер бере
  // фільтри) — так змивається стрічка одразу для будь-якої комбінації фільтрів.
  queryClient.invalidateQueries({ queryKey: ['journal', 'feed'] });
  queryClient.invalidateQueries({ queryKey: queryKeys.journal.countAll });
  // Milestone 11, доповнення (реакції) — та сама мутація (create/remove/favorite/reaction)
  // могла змінити агреговану статистику реакцій, тож змиваємо й її тут одразу для всіх
  // мутацій note/quote, а не додаємо окрему інвалідацію в кожному виклику.
  queryClient.invalidateQueries({ queryKey: queryKeys.journal.reactionCounts });
  if (sessionId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.journal.bySession(sessionId) });
  }
  // ТЗ Фази 8 (READING CONTINUITY) — "остання думка" на картці "Зараз читаєш" (Home) читає
  // саме останній note/quote на книгу, тож будь-яка мутація note/quote могла її змінити.
  // Префікс, не повний параметризований ключ — той самий підхід, що й `['journal','feed']`
  // вище (`queryKeys.sessions.continuity`, `useReadingContinuity.ts`).
  queryClient.invalidateQueries({ queryKey: ['sessions', 'continuity'] });
  // POLYTSIA V1.5, Фаза 12 (READING ACTIVITY HISTORY) — стрічка "Моя історія" читає
  // `note.created_at`/`quote.created_at` як події `journal_entry`/`quote`; create/remove
  // (не favorite/reaction/revisitLater) справді змінюють цей список, але інвалідація тут —
  // той самий "будь-яка мутація" підхід, що й у решти рядків цієї функції, а не окрема гілка
  // лише для create/remove.
  queryClient.invalidateQueries({ queryKey: queryKeys.activityHistory.recent });
}
