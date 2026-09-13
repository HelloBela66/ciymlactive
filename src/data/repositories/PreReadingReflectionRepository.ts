import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { PreReadingReflection } from '@/types/preReadingReflection';
import { ReadingRunRepository } from './ReadingRunRepository';

interface PreReadingReflectionRow {
  id: string;
  user_book_id: string;
  reading_run_id: string | null;
  reason_text: string | null;
  expectation_text: string | null;
  expected_rating: number | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: PreReadingReflectionRow): PreReadingReflection {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    readingRunId: row.reading_run_id,
    reasonText: row.reason_text,
    expectationText: row.expectation_text,
    expectedRating: row.expected_rating,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface UpsertPreReadingReflectionInput {
  userBookId: string;
  reasonText: string | null;
  expectationText: string | null;
  expectedRating: number | null;
}

/** Нотатка "До" для конкретного run, якщо вона є; інакше (книга без жодного `reading_run` —
 * Фаза 7 `addToLibrary`, свідомо не підключена) — "книжкова" нотатка без прив'язки до run
 * (`reading_run_id IS NULL`), той самий фолбек, що діяв для ВСІХ нотаток до Фази 9. */
async function getForBookAndRun(
  db: SQLiteDatabase,
  userBookId: string,
  readingRunId: string | null,
): Promise<PreReadingReflection | null> {
  const row = readingRunId
    ? await db.getFirstAsync<PreReadingReflectionRow>(
        `SELECT * FROM pre_reading_reflection WHERE reading_run_id = ?`,
        [readingRunId],
      )
    : await db.getFirstAsync<PreReadingReflectionRow>(
        `SELECT * FROM pre_reading_reflection WHERE user_book_id = ? AND reading_run_id IS NULL`,
        [userBookId],
      );
  return row ? mapRow(row) : null;
}

/**
 * «До/Після» (POLYTSIA V1.6, Фаза 6; REREADING MODEL, Фаза 9 — `docs/READING_RUN.md`).
 * ДО Фази 9 — щонайбільше одна нотатка на книгу (`UNIQUE(user_book_id)`, `014_pre_reading_reflection.ts`):
 * друге проходження (`rereading`) не мало власної нотатки "До", а форма її запису взагалі була
 * недоступна повторно (`docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 23, п.6). Фаза 9
 * (`022_pre_reading_reflection_run.ts`) змінює обмеження на `UNIQUE(reading_run_id)` —
 * щонайбільше одна нотатка НА RUN, тож кожне проходження (перше, перечитування №2, №3...) тепер
 * може мати власну нотатку "До", що не перезаписує попередні.
 *
 * `getCurrent`/`upsertCurrent` — головний публічний API: САМІ визначають "поточний" run книги
 * через `ReadingRunRepository.getLatestByUserBookId` — той самий вибір, що й
 * `BookMemoryRepository` (Фаза 8), і НАВМИСНО НЕ `getActiveByUserBookId` (лише `in_progress`),
 * хоч нотатка "До" й пишеться РАНО, поки книга ще читається: `getCurrent` читає і `Book
 * Details` (`app/work/[workId].tsx`, ПІД ЧАС читання — там `latest === active`, той самий run),
 * і екран порівняння До/Після на Book Memory (`app/memory/[workId].tsx`, ПІСЛЯ завершення
 * читання — там run уже `finished`, а `getActiveByUserBookId` повернув би `null` і "До" зникло б
 * із порівняння). `getLatestByUserBookId` коректний в обох випадках: під час читання найновіший
 * run — це і є активний; після завершення — це той самий run, який щойно завершився. Виклики з
 * UI (`usePreReadingReflection.ts`) лишаються НЕЗМІННИМИ за формою — той самий `userBookId`,
 * жодного нового параметра.
 */
export const PreReadingReflectionRepository = {
  /** Нотатка "До" для конкретного run напряму — Фаза 9, майбутнє порівняння історії (Фаза 12). */
  async getByReadingRunId(db: SQLiteDatabase, readingRunId: string): Promise<PreReadingReflection | null> {
    const row = await db.getFirstAsync<PreReadingReflectionRow>(
      `SELECT * FROM pre_reading_reflection WHERE reading_run_id = ?`,
      [readingRunId],
    );
    return row ? mapRow(row) : null;
  },

  /** УСІ нотатки "До" книги, за всіма її run — Фаза 9, майбутнє порівняння історії (Фаза 12). */
  async listByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<PreReadingReflection[]> {
    const rows = await db.getAllAsync<PreReadingReflectionRow>(
      `SELECT * FROM pre_reading_reflection WHERE user_book_id = ? ORDER BY created_at DESC`,
      [userBookId],
    );
    return rows.map(mapRow);
  },

  /** Нотатка "До" "поточного" (найновішого) run книги — те, що показує UI сьогодні, і поки
   * читає, і вже після завершення (порівняння До/Після). */
  async getCurrent(db: SQLiteDatabase, userBookId: string): Promise<PreReadingReflection | null> {
    const run = await ReadingRunRepository.getLatestByUserBookId(db, userBookId);
    return getForBookAndRun(db, userBookId, run?.id ?? null);
  },

  async upsertCurrent(db: SQLiteDatabase, params: UpsertPreReadingReflectionInput): Promise<PreReadingReflection> {
    const run = await ReadingRunRepository.getLatestByUserBookId(db, params.userBookId);
    const readingRunId = run?.id ?? null;

    const now = nowIso();
    const existing = await getForBookAndRun(db, params.userBookId, readingRunId);

    if (existing) {
      await db.runAsync(
        `UPDATE pre_reading_reflection SET reason_text = ?, expectation_text = ?, expected_rating = ?, updated_at = ? WHERE id = ?`,
        [params.reasonText, params.expectationText, params.expectedRating, now, existing.id],
      );
      return {
        ...existing,
        reasonText: params.reasonText,
        expectationText: params.expectationText,
        expectedRating: params.expectedRating,
        updatedAt: now,
      };
    }

    const id = generateId();
    await db.runAsync(
      `INSERT INTO pre_reading_reflection (id, user_book_id, reading_run_id, reason_text, expectation_text, expected_rating, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, params.userBookId, readingRunId, params.reasonText, params.expectationText, params.expectedRating, now, now],
    );
    return {
      id,
      userBookId: params.userBookId,
      readingRunId,
      reasonText: params.reasonText,
      expectationText: params.expectationText,
      expectedRating: params.expectedRating,
      createdAt: now,
      updatedAt: now,
    };
  },

  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`DELETE FROM pre_reading_reflection WHERE id = ?`, [id]);
  },
};
