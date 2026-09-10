import type { QueryClient } from '@tanstack/react-query';
import { invalidateJournal } from './journalInvalidation';
import { queryKeys } from './queryKeys';

function createMockQueryClient() {
  return { invalidateQueries: jest.fn() } as unknown as QueryClient;
}

function invalidatedKeys(queryClient: QueryClient): unknown[] {
  const mock = queryClient.invalidateQueries as unknown as jest.Mock;
  return mock.mock.calls.map(([arg]) => (arg as { queryKey: unknown }).queryKey);
}

describe('invalidateJournal', () => {
  it('без sessionId інвалідує лише базові ключі щоденника (без bySession)', () => {
    const queryClient = createMockQueryClient();
    invalidateJournal(queryClient, 'ub1');

    expect(invalidatedKeys(queryClient)).toEqual([
      queryKeys.journal.byUserBook('ub1'),
      queryKeys.journal.favoritesByUserBook('ub1'),
      // ТЗ Фази 11 («ПОВЕРНУТИСЯ ПІЗНІШЕ») — той самий "малий список по одній книзі" ключ, що
      // й `favoritesByUserBook` вище.
      queryKeys.journal.revisitLaterByUserBook('ub1'),
      queryKeys.journal.countByUserBook('ub1'),
      ['journal', 'feed'],
      queryKeys.journal.countAll,
      queryKeys.journal.reactionCounts,
      // ТЗ Фази 8 (READING CONTINUITY) — "остання думка" на картці "Зараз читаєш" (Home)
      // читає останній note/quote на книгу, тож будь-яка мутація note/quote змиває і її.
      ['sessions', 'continuity'],
    ]);
  });

  it('з sessionId — додатково інвалідує bySession для цієї сесії', () => {
    const queryClient = createMockQueryClient();
    invalidateJournal(queryClient, 'ub1', 'sess1');

    const keys = invalidatedKeys(queryClient);
    // Фаза 11 додала ще один базовий ключ (`revisitLaterByUserBook`) — було 8, стало 9.
    expect(keys).toHaveLength(9);
    expect(keys).toContainEqual(queryKeys.journal.bySession('sess1'));
  });

  it('sessionId === null поводиться так само, як відсутній sessionId', () => {
    const queryClient = createMockQueryClient();
    invalidateJournal(queryClient, 'ub1', null);

    // Фаза 11 додала ще один базовий виклик (`revisitLaterByUserBook`) — було 7, стало 8.
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(8);
  });

  it('стрічку інвалідує за спільним префіксом ["journal", "feed"], а не за конкретними фільтрами', () => {
    // Навмисна перевірка проти регресії: `queryKeys.journal.feed(filters)` параметризований
    // (Фаза 4), і якщо хтось випадково замінить префіксну інвалідацію на повний ключ з
    // фільтрами — стрічка перестане змиватись для інших комбінацій фільтрів.
    const queryClient = createMockQueryClient();
    invalidateJournal(queryClient, 'ub1');

    expect(invalidatedKeys(queryClient)).toContainEqual(['journal', 'feed']);
  });
});
