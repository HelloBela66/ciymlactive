import { z } from 'zod';

/**
 * REREADING MODEL, Фаза 6 (POLYTSIA V1.6.1, `docs/READING_RUN.md`, `019_reading_run.ts`) —
 * одне конкретне "проходження" книги (перше читання, перечитування №2, №3...), відокремлене
 * від `user_book.status` (поточний UI-стан бібліотечної картки). СВІДОМО не дублює
 * `UserBookStatus` (`src/types/userBook.ts`) — лише термінальний результат самого прочитання.
 */
export const ReadingRunStatusSchema = z.enum(['in_progress', 'finished', 'did_not_finish']);
export type ReadingRunStatus = z.infer<typeof ReadingRunStatusSchema>;

export const ReadingRunSchema = z.object({
  id: z.string(),
  userBookId: z.string(),
  /** 1, 2, 3... у межах одного `userBookId`, монотонно зростає — ніколи не перевикористовується
   * (докладніше — коментар у `019_reading_run.ts`). */
  runNumber: z.number().int().positive(),
  status: ReadingRunStatusSchema,
  startedAt: z.string(),
  /** `null`, доки run `in_progress`. */
  finishedAt: z.string().nullable(),
  /** `true` — цей run створено заднім числом бекфілом (Фаза 6b) з наявних
   * `started_at`/`finished_at`/сесій/статусу, а не зафіксовано в реальний момент дії
   * користувача. UI/аналітика МОЖУТЬ (не зобов'язані) показувати такий run з нижчою
   * впевненістю — докладніше `docs/READING_RUN.md` §Backfill. */
  isLegacyBackfill: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** SOFT-DELETE READINESS (POLYTSIA V1.6.1, Фаза 26) — DB-колонка `deleted_at` існувала з
   * самого початку (`019_reading_run.ts`, `ReadingRunRepository.discard`), але цей домен-тип
   * її досі не проносив далі рядка бази — код, якому потрібно було б знати, чи саме цей run
   * скасовано (а не просто відфільтрований геть читанням), не мав такої можливості. Усі наявні
   * публічні read-методи `ReadingRunRepository` й далі фільтрують `deleted_at IS NULL`, тож для
   * них це поле завжди `null` — воно існує заради майбутніх невідфільтрованих читань
   * (`DataIntegrityRepository`, майбутній sync) і заради самої гарантії ТЗ: ReadingRun
   * обов'язково несе UUID + createdAt + updatedAt + deletedAt. */
  deletedAt: z.string().nullable(),
});

export type ReadingRun = z.infer<typeof ReadingRunSchema>;
