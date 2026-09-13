import { z } from 'zod';

/**
 * Один інтервал паузи всередині сесії. `resumedAt: null` означає "пауза триває зараз" —
 * саме на цьому будується жива поведінка таймера (докладніше — src/lib/sessionTiming.ts).
 */
export const PausedIntervalSchema = z.object({
  pausedAt: z.string(),
  resumedAt: z.string().nullable(),
});

export type PausedInterval = z.infer<typeof PausedIntervalSchema>;

export const ReadingSessionSchema = z.object({
  id: z.string(),
  userBookId: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  goalMinutes: z.number().int().nullable(),
  pausedIntervals: z.array(PausedIntervalSchema),
  startPage: z.number().int(),
  endPage: z.number().int().nullable(),
  durationSeconds: z.number().int().nullable(),
  moodNote: z.string().nullable(),
  // ТЗ Фази 9 (SESSION REFLECTION) — "Як читалося?", одне з 5 фіксованих значень
  // (`ReadingExperienceId`, `src/design/readingExperience.ts`), проставляється ОКРЕМОЮ
  // мутацією ПІСЛЯ того, як сесія вже безпечно збережена (`setReadingExperience`,
  // `ReadingSessionRepository.ts`). Навмисно вільний рядок, не enum — той самий підхід, що й
  // `moodNote`/`note.reaction` вище: список значень фіксується лише TypeScript-типом,
  // нерозпізнане значення UI сам відфільтровує (`isReadingExperienceId`), а не ця схема.
  readingExperience: z.string().nullable(),
  isEdited: z.boolean(),
  /** REREADING MODEL, Фаза 6b (POLYTSIA V1.6.1, `020_reading_run_backfill.ts`,
   * `docs/READING_RUN.md`) — до якого `ReadingRun` належить сесія. `null` лише для дуже рідкого
   * захисного випадку (сесія без визначеного `started_at`-джерела для backfill, докладніше —
   * коментар у міграції) — на практиці кожна легасі-сесія отримала посилання одразу під час
   * backfill. Нові сесії (`ReadingSessionRepository.start`) поки ЗАВЖДИ створюються з `null` —
   * реальне підключення нового старту до конкретного run це Фаза 7, свідомо не ця. СВІДОМО без
   * SQL FK у самій колонці (докладне обґрунтування ризику rebuild-міграції — коментар у
   * `020_reading_run_backfill.ts`).
   */
  readingRunId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ReadingSession = z.infer<typeof ReadingSessionSchema>;
