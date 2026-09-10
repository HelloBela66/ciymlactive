import { useEffect, useState } from 'react';
import { computeElapsedMs } from '@/lib/sessionTiming';
import type { ReadingSession } from '@/types/readingSession';

/**
 * Живий таймер сесії читання: перераховує `computeElapsedMs` раз на секунду з поточних даних
 * сесії (не накопичувальний стан — докладніше `src/lib/sessionTiming.ts`). Винесено з
 * `app/session/[sessionId].tsx` (Milestone 11, панель активного читання) — той самий тікер
 * тепер потрібен і глобальній панелі (`ReadingSessionMiniBar`), і повному екрану сесії, і
 * дублювати `setInterval`-логіку у двох місцях означало б два незалежних джерела правди для
 * того самого числа.
 */
export function useLiveElapsedMs(session: ReadingSession | null | undefined): number {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!session || session.endedAt) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [session?.id, session?.endedAt]);

  if (!session) return 0;
  return computeElapsedMs(session.startedAt, session.pausedIntervals, now, session.endedAt);
}
