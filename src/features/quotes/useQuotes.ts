import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { QuoteRepository } from '@/data/repositories/QuoteRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import { invalidateJournal } from '@/lib/journalInvalidation';
import { triggerLightHapticFeedback } from '@/lib/haptics';
import type { CreateQuoteInput, Quote } from '@/types/quote';

const log = createLogger('features/quotes');

export function useQuotes(userBookId: string | undefined) {
  return useQuery<Quote[]>({
    queryKey: queryKeys.quotes.byUserBook(userBookId ?? ''),
    queryFn: async () => {
      if (!userBookId) return [];
      const db = await getDatabase();
      return QuoteRepository.listByUserBookId(db, userBookId);
    },
    enabled: !!userBookId,
  });
}

export function useCreateQuote() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося зберегти цитату. Спробуй ще раз.');
  return useMutation<Quote, Error, CreateQuoteInput>({
    mutationFn: async (input) => {
      const db = await getDatabase();
      return QuoteRepository.create(db, input);
    },
    onSuccess: (quote) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.byUserBook(quote.userBookId) });
      invalidateJournal(queryClient, quote.userBookId, quote.sessionId);
      // ТЗ Фази 19 (DESIGN SYSTEM EXTENSION, §HAPTICS) — "save journal".
      triggerLightHapticFeedback();
    },
    onError,
  });
}

export function useRemoveQuote() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося видалити цитату.');
  return useMutation<void, Error, { id: string; userBookId: string; sessionId?: string | null }>({
    mutationFn: async ({ id }) => {
      const db = await getDatabase();
      await QuoteRepository.remove(db, id);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.byUserBook(variables.userBookId) });
      invalidateJournal(queryClient, variables.userBookId, variables.sessionId);
    },
    onError,
  });
}
