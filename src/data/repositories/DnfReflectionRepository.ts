import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { DnfReflection } from '@/types/dnfReflection';

interface DnfReflectionRow {
  id: string;
  user_book_id: string;
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

/**
 * DNF IMPROVEMENT (POLYTSIA V1.6, Фаза 12) — щонайбільше одна на книгу
 * (`UNIQUE(user_book_id)`, той самий сенс, що й `PreReadingReflectionRepository`). На відміну
 * від `pre_reading_reflection` (де перший запис створює сам користувач формою), тут рядок
 * ЗАВЖДИ створюється автоматично, `captureIfMissing`, у мить переходу статусу в "Не дочитав"
 * (`useUpdateUserBookStatus`) — `page`/`created_at` фіксуються там і більше НІКОЛИ не
 * змінюються; `updateDetails` лише редагує `reason`/`note` вже наявного рядка.
 */
export const DnfReflectionRepository = {
  async getByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<DnfReflection | null> {
    const row = await db.getFirstAsync<DnfReflectionRow>(
      `SELECT * FROM dnf_reflection WHERE user_book_id = ?`,
      [userBookId],
    );
    return row ? mapRow(row) : null;
  },

  /** Фіксує сторінку "миті DNF" рівно один раз. Якщо рядок для цієї книги вже існує (повторний
   * перехід у "Не дочитав" — чи просто ще один виклик `updateStatus` з тим самим статусом), нічого
   * не робить: `page`/`created_at` не перезаписуються заднім числом (той самий дух, що й
   * `user_book.started_at`/`finished_at`). */
  async captureIfMissing(db: SQLiteDatabase, userBookId: string, page: number): Promise<void> {
    const existing = await DnfReflectionRepository.getByUserBookId(db, userBookId);
    if (existing) return;

    const id = generateId();
    const now = nowIso();
    await db.runAsync(
      `INSERT INTO dnf_reflection (id, user_book_id, page, reason, note, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, ?, ?)`,
      [id, userBookId, Math.max(0, Math.trunc(page)), now, now],
    );
  },

  /** Редагування причини/нотатки вже наявного рядка (створеного `captureIfMissing`) —
   * `page`/`created_at` лишаються незмінними, оновлюється лише `updated_at`. Повертає `null`,
   * якщо рядка для цієї книги ще нема (не мало б статись у звичайному UI-потоці — форма
   * редагування рендериться лише коли `reflection` уже завантажений). */
  async updateDetails(
    db: SQLiteDatabase,
    userBookId: string,
    input: UpdateDnfReflectionDetailsInput,
  ): Promise<DnfReflection | null> {
    const existing = await DnfReflectionRepository.getByUserBookId(db, userBookId);
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
   * `PreReadingReflectionRepository.remove`) — наступний перехід у "Не дочитав" (якщо
   * трапиться) створить свіжий знімок наново через `captureIfMissing`. */
  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`DELETE FROM dnf_reflection WHERE id = ?`, [id]);
  },
};
