import { z } from 'zod';

/** Значення від 0.5 до 5 з кроком 0.5 (півзірки) — те саме обмеження, що й CHECK у SQLite. */
export const RatingValueSchema = z
  .number()
  .min(0.5)
  .max(5)
  .refine((value) => Number.isInteger(value * 2), 'Оцінка — з кроком 0.5');

export const RatingSchema = z.object({
  id: z.string(),
  userBookId: z.string(),
  /** REREADING MODEL, Фаза 12 (POLYTSIA V1.6.1, `025_rating_run.ts`, `docs/READING_RUN.md`
   * §"Фаза 12") — run, чиїй оцінці належить цей рядок. Резолвиться ДИНАМІЧНО, той самий підхід,
   * що й `BookMemory`/`PreReadingReflection`/`DnfReflection` (НЕ фіксується один раз назавжди,
   * на відміну від `BookCapsule.readingRunId`): `RatingRepository.getCurrent`/`upsertCurrent`
   * самі щоразу резолвлять поточний run через `ReadingRunRepository.getLatestByUserBookId`.
   * `null` — книга без жодного `reading_run` (той самий фолбек, що й у Фазах 8-11). */
  readingRunId: z.string().nullable(),
  value: RatingValueSchema,
  review: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** SOFT-DELETE READINESS (POLYTSIA V1.6.1, Фаза 26, `027_soft_delete_readiness.ts`) —
   * `RatingRepository.remove` тепер м'яко видаляє (рецензія — вільний текст, незамінний
   * контент). `null` для будь-якого рядка, що доходить до звичайного UI (публічні read-методи
   * репозиторія фільтрують `deleted_at IS NULL`). */
  deletedAt: z.string().nullable(),
});

export type Rating = z.infer<typeof RatingSchema>;
