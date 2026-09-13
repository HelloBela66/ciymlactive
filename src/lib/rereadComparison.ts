import type { ReadingExperienceId } from '@/design/readingExperience';
import { isReadingExperienceId } from '@/design/readingExperience';

/**
 * «Як змінилася книга для тебе» (REREADING MODEL, Фаза 12, `docs/READING_RUN.md` §"Фаза 12") —
 * порівняння ≥2 завершених прочитань (`reading_run.status === 'finished'`) однієї книги на
 * основі вже наявних даних користувача (оцінка/спогад/До-Після/капсула/сесії), БЕЗ жодної
 * AI-генерації. Цей файл — лише ЧИСТІ обчислення над уже завантаженими даними (той самий
 * house-стиль, що й `readingPace.ts`/`finishPrediction.ts`): сам fetch/збірка даних по кожному
 * run — у `useReadingRunsDetail.ts` (`src/features/reading-runs/`), який і викликає ці функції.
 */

export interface RunSessionStatsInput {
  startedAt: string;
  durationSeconds: number | null;
  readingExperience: string | null;
}

export interface RunReadingStats {
  /** Сума `durationSeconds` усіх сесій цього run (0, якщо сесій нема або жодна не має
   * зафіксованої тривалості). */
  totalDurationSeconds: number;
  /** Кількість УНІКАЛЬНИХ календарних днів (за `startedAt.slice(0, 10)`, той самий підхід, що
   * й `computeRollingPace` у `readingPace.ts`), коли відбулась хоч одна сесія цього run. */
  daysSpent: number;
  sessionCount: number;
  /** Найчастіше значення `readingExperience` серед сесій run (ігноруючи `null` і нерозпізнані
   * рядки — `isReadingExperienceId`, той самий захисний підхід, що й у `readingExperience.ts`).
   * Рівність голосів — перемагає те, що зустрілось РАНІШЕ (стабільний порядок вхідного масиву).
   * `null`, якщо жодна сесія цього run не має розпізнаного значення. */
  dominantExperience: ReadingExperienceId | null;
}

/** Порожня статистика — той самий "нуль, а не помилка" підхід, що й `computeRollingPace` для
 * `pagesPerMinute`/`minutesPerActiveDay` при відсутності сесій. */
export const EMPTY_RUN_READING_STATS: RunReadingStats = {
  totalDurationSeconds: 0,
  daysSpent: 0,
  sessionCount: 0,
  dominantExperience: null,
};

export function computeRunReadingStats(sessions: RunSessionStatsInput[]): RunReadingStats {
  if (sessions.length === 0) return EMPTY_RUN_READING_STATS;

  let totalDurationSeconds = 0;
  const dayKeys = new Set<string>();
  const experienceCounts = new Map<ReadingExperienceId, number>();

  for (const session of sessions) {
    totalDurationSeconds += session.durationSeconds ?? 0;
    dayKeys.add(session.startedAt.slice(0, 10));
    if (session.readingExperience != null && isReadingExperienceId(session.readingExperience)) {
      experienceCounts.set(session.readingExperience, (experienceCounts.get(session.readingExperience) ?? 0) + 1);
    }
  }

  let dominantExperience: ReadingExperienceId | null = null;
  let bestCount = 0;
  for (const session of sessions) {
    const id = session.readingExperience;
    if (id == null || !isReadingExperienceId(id)) continue;
    const count = experienceCounts.get(id) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      dominantExperience = id;
    }
  }

  return {
    totalDurationSeconds,
    daysSpent: dayKeys.size,
    sessionCount: sessions.length,
    dominantExperience,
  };
}

export interface NumericDelta {
  from: number | null;
  to: number | null;
  /** `to - from`, `null` — якщо хоч одне зі значень відсутнє (нема чого порівнювати, а не 0). */
  diff: number | null;
}

/** Різниця між двома числовими значеннями двох run — для показу "оцінка змінилась на +1.5"
 * тощо на екрані порівняння. Навмисно окрема функція (а не inline `to - from` у компоненті),
 * щоб один і той самий "null, якщо чогось нема" підхід не дублювався для кожного виміру
 * (оцінка/тривалість/дні) окремо. */
export function computeNumericDelta(from: number | null, to: number | null): NumericDelta {
  return {
    from,
    to,
    diff: from != null && to != null ? to - from : null,
  };
}
