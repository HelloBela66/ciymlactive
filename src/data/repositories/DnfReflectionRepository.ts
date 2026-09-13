import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { DnfReflection } from '@/types/dnfReflection';
import { ReadingRunRepository } from './ReadingRunRepository';

interface DnfReflectionRow {
  id: string;
  user_book_id: string;
  reading_run_id: string | null;
  page: number;
  reason: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: DnfReflectionRow): DnfReflection {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    readingRunId: row.reading_run_id,
    page: row.page,
    reason: row.reason,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface UpdateDnfReflectionDetailsInput {
  reason: string | null;
  note: string | null;
}

/** Знімок "Не дочитав" для конкретного run, якщо є; інакше (книга без жодного `reading_run` —
 * той самий фолбек, що й у Фазах 8-10) — "книжковий" знімок без прив'язки до run
 * (`reading_run_id IS NULL`), той самий фолбек, що діяв для ВСІХ знімків до Фази 11. */
async function getForBookAndRun(
  db: SQLiteDatabase,
  userBookId: string,
  readingRunId: string | null,
): Promise<DnfReflection | null> {
  const row = readingRunId
    ? await db.getFirstAsync<DnfReflectionRow>(`SELECT * FROM dnf_reflection WHERE reading_run_id = ?`, [
        readingRunId,
      ])
    : await db.getFirstAsync<DnfReflectionRow>(
        `SELECT * FROM dnf_reflection WHERE user_book_id = ? AND reading_run_id IS NULL`,
        [userBookId],
      );
  return row ? mapRow(row) : null;
}

/**
 * DNF IMPROVEMENT (POLYTSIA V1.6, Фаза 12); REREADING MODEL, Фаза 11 (`docs/READING_RUN.md`
 * §"Фаза 11"). ДО Фази 11 — щонайбільше один знімок на книгу (`UNIQUE(user_book_id)`,
 * `017_dnf_reflection.ts`): друге покинуте прочитання не мало власного знімка — `captureIfMissing`
 * бачив уже наявний рядок ПЕРШОГО покинутого прочитання й нічого не робив
 * (`docs/V1_6_FULL_AUDIT_REPORT.md`). Фаза 11 (`024_dnf_reflection_run.ts`) змінює обмеження на
 * `UNIQUE(reading_run_id)` — щонайбільше один знімок НА RUN, тож кожне покинуте прочитання
 * (перше, друге...) тепер фіксується окремо.
 *
 * `getCurrent`/`captureIfMissing`/`updateDetails` — головний публічний API: САМІ визначають
 * "поточний" run книги через `ReadingRunRepository.getLatestByUserBookId` — той самий вибір
 * (динамічна ре-резолюція щоразу), що й `BookMemoryRepository`/`PreReadingReflectionRepository`
 * (Фази 8-9), НЕ фіксований раз-назавжди підхід `BookCapsuleRepository` (Фаза 10): на відміну
 * від капсули, DNF-знімок — не "щось, що можна залишити чи ні", а автоматичний факт переходу
 * статусу, тож немає причини колись "маскувати" один одним два різних покинутих прочитання —
 * досить, щоб кожен виклик бачив ЩОЙНО завершений (у тій самій мутації, `useUpdateUserBookStatus`)
 * run як "поточний". Виклики з UI (`useDnfReflection.ts`) лишаються НЕЗМІННИМИ за формою — той
 * самий `userBookId`, жодного нового параметра.
 */
export const DnfReflectionRepository = {
  /** Знімок конкретного run напряму — Фаза 11, майбутнє порівняння історії (Фаза 12). */
  async getByReadingRunId(db: SQLiteDatabase, readingRunId: string): Promise<DnfReflection | null> {
    const row = await db.getFirstAsync<DnfReflectionRow>(
      `SELECT * FROM dnf_reflection WHERE reading_run_id = ?`,
      [readingRunId],
    );
    return row ? mapRow(row) : null;
  },

  /** УСІ DNF-знімки книги, за всіма її run, найновіший перший — Фаза 11, майбутнє порівняння
   * історії (Фаза 12). */
  async listByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<DnfReflection[]> {
    const rows = await db.getAllAsync<DnfReflectionRow>(
      `SELECT * FROM dnf_reflection WHERE user_book_id = ? ORDER BY created_at DESC`,
      [userBookId],
    );
    return rows.map(mapRow);
  },

  /** Знімок "поточного" (найновішого) run книги — те, що показує `DnfReflectionSection`
   * (`app/work/[workId].tsx`) сьогодні. */
  async getCurrent(db: SQLiteDatabase, userBookId: string): Promise<DnfReflection | null> {
    const run = await ReadingRunRepository.getLatestByUserBookId(db, userBookId);
    return getForBookAndRun(db, userBookId, run?.id ?? null);
  },

  /** Фіксує сторінку "миті DNF" рівно один раз НА ПОТОЧНИЙ RUN. Резолвить run так само, як і
   * `getCurrent` — оскільки викликається з `useUpdateUserBookStatus` ОДРАЗУ ПІСЛЯ того, як той
   * самий `updateStatus` уже завершив run (`ReadingRunRepository.finish`), "найновіший run
   * книги" на цей момент — це і є той самий, щойно завершений `did_not_finish`-run. Якщо знімок
   * для цього run УЖЕ існує (повторний виклик з тим самим статусом), нічого не робить —
   * `page`/`created_at` не перезаписуються заднім числом (той самий дух, що й
   * `user_book.started_at`/`finished_at`). Перечитування, покинуте ВДРУГЕ, резолвить ІНШИЙ
   * (новіший) run і тому створює ОКРЕМИЙ знімок — старий не зачіпається. */
  async captureIfMissing(db: SQLiteDatabase, userBookId: string, page: number): Promise<void> {
    const run = await ReadingRunRepository.getLatestByUserBookId(db, userBookId);
    const readingRunId = run?.id ?? null;

    const existing = await getForBookAndRun(db, userBookId, readingRunId);
    if (existing) return;

    const id = generateId();
    const now = nowIso();
    await db.runAsync(
      `INSERT INTO dnf_reflection (id, user_book_id, reading_run_id, page, reason, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)`,
      [id, userBookId, readingRunId, Math.max(0, Math.trunc(page)), now, now],
    );
  },

  /** Редагування причини/нотатки знімка ПОТОЧНОГО run (`getCurrent`) — `page`/`created_at`
   * лишаються незмінними, оновлюється лише `updated_at`. Повертає `null`, якщо знімка для
   * поточного run ще нема (не мало б статись у звичайному UI-потоці — форма редагування
   * рендериться лише коли `reflection` уже завантажений). */
  async updateDetails(
    db: SQLiteDatabase,
    userBookId: string,
    input: UpdateDnfReflectionDetailsInput,
  ): Promise<DnfReflection | null> {
    const existing = await DnfReflectionRepository.getCurrent(db, userBookId);
    if (!existing) return null;

    const now = nowIso();
    await db.runAsync(`UPDATE dnf_reflection SET reason = ?, note = ?, updated_at = ? WHERE id = ?`, [
      input.reason,
      input.note,
      now,
      existing.id,
    ]);
    return { ...existing, reason: input.reason, note: input.note, updatedAt: now };
  },

  /** Повне видалення (той самий "прибрати повністю" вибір, що й
   * `PreReadingReflectionRepository.remove`) — наступний перехід у "Не дочитав" для ЦЬОГО run
   * (якщо трапиться знову) створить свіжий знімок наново через `captureIfMissing`. */
  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`DELETE FROM dnf_reflection WHERE id = ?`, [id]);
  },
};
