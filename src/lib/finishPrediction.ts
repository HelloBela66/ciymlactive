import { addDays } from 'date-fns';
import type { RollingPace } from './readingPace';

export interface FinishPredictionInput {
  currentPage: number;
  /** `null` — сторінок видання невідомо (ручне додавання без pageCount); прогноз неможливий. */
  totalPages: number | null;
  pace: RollingPace;
  /** "Зараз" як параметр — детермінізм для тестів, як і в `sessionTiming.ts`. */
  referenceDate: Date;
}

export interface FinishPrediction {
  remainingPages: number | null;
  estimatedHoursRemaining: number | null;
  /** ISO-дата; `null`, коли недостатньо даних для прогнозу (нова книга, давно не читали). */
  estimatedFinishDate: string | null;
}

/**
 * Прогноз дати завершення книги (розділ 30 ТЗ, `docs/TESTING.md`: "rolling-average (не
 * lifetime pace!) → залишок годин, дата"). Свідомо повертає `null` замість вигаданого числа,
 * коли даних не досить (щойно почата книга, пауза в читанні) — краще чесно "недостатньо
 * даних", ніж оманливий прогноз.
 */
export function predictFinish(input: FinishPredictionInput): FinishPrediction {
  if (input.totalPages == null) {
    return { remainingPages: null, estimatedHoursRemaining: null, estimatedFinishDate: null };
  }

  const remainingPages = Math.max(0, input.totalPages - input.currentPage);
  if (remainingPages === 0) {
    return { remainingPages: 0, estimatedHoursRemaining: 0, estimatedFinishDate: input.referenceDate.toISOString() };
  }

  if (input.pace.pagesPerMinute <= 0 || input.pace.minutesPerActiveDay <= 0) {
    return { remainingPages, estimatedHoursRemaining: null, estimatedFinishDate: null };
  }

  const minutesRemaining = remainingPages / input.pace.pagesPerMinute;
  const daysNeeded = Math.max(1, Math.ceil(minutesRemaining / input.pace.minutesPerActiveDay));

  return {
    remainingPages,
    estimatedHoursRemaining: Math.round((minutesRemaining / 60) * 10) / 10,
    estimatedFinishDate: addDays(input.referenceDate, daysNeeded).toISOString(),
  };
}
