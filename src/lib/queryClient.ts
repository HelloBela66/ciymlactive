import { QueryClient } from '@tanstack/react-query';

/**
 * TanStack Query готовий інфраструктурно для майбутнього server state (Supabase sync),
 * але у V1 жоден активний хук не робить мережевих запитів на критичному шляху —
 * див. docs/LOCAL_FIRST.md. Консервативні дефолти (без refetchOnWindowFocus — немає сенсу
 * в мобільному застосунку без сервера) обрані, щоб клієнт був "тихим", доки не потрібен.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  },
});
