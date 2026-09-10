import type { PausedInterval } from '@/types/readingSession';

/**
 * Чиста доменна логіка таймера сесії читання — без React/SQL, щоб бути тестованою
 * (docs/TESTING.md). Ключова ідея з п.12 ТЗ: таймер на екрані — це ОБЧИСЛЕННЯ
 * `now - started_at - pausedTotal`, а не накопичувальний стан у пам'яті. Якщо застосунок
 * крашнеться посеред сесії, після relaunch ці самі функції з тими самими даними з SQLite
 * дадуть правильний час — нічого не втрачається, бо нічого й не трималось лише в пам'яті.
 */

/** Сумарна тривалість усіх пауз (мс). Пауза, що ще триває (`resumedAt: null`), рахується до `now`. */
export function computePausedMs(intervals: PausedInterval[], now: Date): number {
  return intervals.reduce((total, interval) => {
    const pausedAt = new Date(interval.pausedAt).getTime();
    const resumedAt = interval.resumedAt ? new Date(interval.resumedAt).getTime() : now.getTime();
    return total + Math.max(0, resumedAt - pausedAt);
  }, 0);
}

/**
 * Чистий час читання (мс): загальний час від старту мінус паузи. Якщо сесія вже завершена
 * (`endedAt` передано), рахує до моменту завершення, а не до `now`. Якщо сесія зараз на
 * паузі, значення "заморожене" — не росте, поки пауза триває (бо computePausedMs росте з
 * тією самою швидкістю, що й загальний час, і різниця лишається сталою).
 */
export function computeElapsedMs(
  startedAt: string,
  intervals: PausedInterval[],
  now: Date,
  endedAt?: string | null,
): number {
  const end = endedAt ? new Date(endedAt) : now;
  const totalMs = Math.max(0, end.getTime() - new Date(startedAt).getTime());
  const pausedMs = computePausedMs(intervals, end);
  return Math.max(0, totalMs - pausedMs);
}

export function isCurrentlyPaused(intervals: PausedInterval[]): boolean {
  const last = intervals[intervals.length - 1];
  return last != null && last.resumedAt === null;
}

/** Форматує мілісекунди як `HH:MM:SS` (або `MM:SS`, якщо менше години) для UI таймера. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
