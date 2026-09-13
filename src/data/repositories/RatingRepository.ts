import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { Rating } from '@/types/rating';
import { ReadingRunRepository } from './ReadingRunRepository';

interface RatingRow {
  id: string;
  user_book_id: string;
  reading_run_id: string | null;
  value: number;
  review: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function mapRow(row: RatingRow): Rating {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    readingRunId: row.reading_run_id,
    value: row.value,
    review: row.review,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/** Оцінка для конкретного run, якщо є; інакше (книга без жодного `reading_run` — той самий
 * фолбек, що й у Фазах 8-11) — "книжкова" оцінка без прив'язки до run (`reading_run_id IS
 * NULL`), той самий фолбек, що діяв для ВСІХ оцінок до Фази 12.
 *
 * СВІДОМО БЕЗ `deleted_at IS NULL` тут — SOFT-DELETE READINESS (Фаза 26), той самий підхід (і
 * та сама причина: `reading_run_id UNIQUE` НЕЗАЛЕЖНО від `deleted_at`, `025_rating_run.ts`), що
 * й `BookMemoryRepository.getForBookAndRun`. Публічний `getCurrent` нижче фільтрує сам. */
async function getForBookAndRun(
  db: SQLiteDatabase,
  userBookId: string,
  readingRunId: string | null,
): Promise<Rating | null> {
  const row = readingRunId
    ? await db.getFirstAsync<RatingRow>(`SELECT * FROM rating WHERE reading_run_id = ?`, [readingRunId])
    : await db.getFirstAsync<RatingRow>(`SELECT * FROM rating WHERE user_book_id = ? AND reading_run_id IS NULL`, [
        userBookId,
      ]);
  return row ? mapRow(row) : null;
}

/**
 * Оцінка (п.23 ТЗ); REREADING MODEL, Фаза 12 (`docs/READING_RUN.md` §"Фаза 12"). ДО Фази 12 —
 * щонайбільше одна оцінка на книгу (`UNIQUE(user_book_id)`, той самий сенс, що й
 * `book_memory`/`pre_reading_reflection`/`dnf_reflection` до їхніх власних фаз): друге
 * прочитання БЕЗПОВОРОТНО перезаписувало оцінку першого. Фаза 12 (`025_rating_run.ts`) змінює
 * обмеження на `UNIQUE(reading_run_id)` — щонайбільше одна оцінка НА RUN.
 *
 * `getCurrent`/`upsertCurrent` — головний API для Book Details (`RatingSection`,
 * `app/work/[workId].tsx`): САМІ визначають "поточний" run книги через
 * `ReadingRunRepository.getLatestByUserBookId`, той самий вибір (динамічна ре-резолюція
 * щоразу), що й `BookMemoryRepository`/`PreReadingReflectionRepository`/`DnfReflectionRepository`
 * (Фази 8-9, 11). Виклик з UI (`useRating.ts`) лишається НЕЗМІННИМ за формою — той самий
 * `userBookId`, жодного нового параметра: перечитування книги природно починає НОВУ, порожню
 * оцінку для нового run замість затирання старої.
 *
 * `listByUserBookIds` (батч-варіант для списків — Wrapped/Сезони читання/Профіль
 * читача/"Цього дня") — на відміну від `getCurrent`, НЕ прив'язана до конкретного run: ці
 * екрани хочуть "оцінку книги" для агрегатної статистики, а не саме поточного run, тож метод
 * повертає НАЙНОВІШУ оцінку книги серед (тепер, можливо, кількох) рядків — той самий принцип,
 * що й `BookCapsuleRepository.getByUserBookId` (Фаза 10): зовнішні споживачі й далі отримують
 * "оцінку книги", лише явно найновішу, а не єдину можливу.
 */
export const RatingRepository = {
  /** Оцінка конкретного run напряму — Фаза 12, майбутнє порівняння історії. */
  async getByReadingRunId(db: SQLiteDatabase, readingRunId: string): Promise<Rating | null> {
    const row = await db.getFirstAsync<RatingRow>(
      `SELECT * FROM rating WHERE reading_run_id = ? AND deleted_at IS NULL`,
      [readingRunId],
    );
    return row ? mapRow(row) : null;
  },

  /** УСІ оцінки книги, за всіма її run, найновіша перша — Фаза 12, порівняння прочитань. */
  async listByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<Rating[]> {
    const rows = await db.getAllAsync<RatingRow>(
      `SELECT * FROM rating WHERE user_book_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [userBookId],
    );
    return rows.map(mapRow);
  },

  /** Пакетний варіант "оцінки книги" для списків (Milestone 8, продуктивність) — один запит
   * замість одного на кожну книгу. Повертає НАЙНОВІШУ оцінку кожної книги (не прив'язану до
   * конкретного run — докладніше в коментарі над репозиторієм вище).
   *
   * `ORDER BY created_at DESC, rowid DESC` — ДРУГИЙ ключ сортування потрібен щойно з'явилась
   * реальна можливість кількох рядків на книгу (Фаза 12): `created_at` — мілісекундна точність
   * (`nowIso()`, `Date.toISOString()`), тож дві оцінки того самого перечитування, збережені в
   * межах однієї мілісекунди (напр. `upsertCurrent` для двох run поспіль у швидкому тесті чи
   * імпорті), мали б РІВНИЙ `created_at` — без `rowid` тай-брейку SQLite не гарантує порядок
   * серед рівних, і "найновіша" непередбачувано могла б виявитись насправді старішою (знайдено
   * `RatingRepository.test.ts`). Неявний `rowid` (таблиця БЕЗ `WITHOUT ROWID`) монотонно зростає
   * за порядком вставки — надійний тай-брейк без нової колонки. */
  async listByUserBookIds(db: SQLiteDatabase, userBookIds: string[]): Promise<Map<string, Rating>> {
    const result = new Map<string, Rating>();
    if (userBookIds.length === 0) return result;
    const placeholders = userBookIds.map(() => '?').join(',');
    const rows = await db.getAllAsync<RatingRow>(
      `SELECT * FROM rating WHERE user_book_id IN (${placeholders}) AND deleted_at IS NULL ORDER BY created_at DESC, rowid DESC`,
      userBookIds,
    );
    // ORDER BY ... + "перший запис на userBookId перемагає" — той самий трюк, що дає
    // "найновіша", без окремого GROUP BY/підзапиту.
    for (const row of rows) {
      if (!result.has(row.user_book_id)) result.set(row.user_book_id, mapRow(row));
    }
    return result;
  },

  /** Оцінка ПОТОЧНОГО (найновішого) run книги — те, що показує `RatingSection` на Book Details.
   * Фільтрує `deletedAt` тут (не всередині `getForBookAndRun`) — той самий підхід, що й
   * `BookMemoryRepository.getCurrent` (SOFT-DELETE READINESS, Фаза 26). */
  async getCurrent(db: SQLiteDatabase, userBookId: string): Promise<Rating | null> {
    const run = await ReadingRunRepository.getLatestByUserBookId(db, userBookId);
    const rating = await getForBookAndRun(db, userBookId, run?.id ?? null);
    return rating && !rating.deletedAt ? rating : null;
  },

  async upsertCurrent(
    db: SQLiteDatabase,
    params: { userBookId: string; value: number; review?: string | null },
  ): Promise<Rating> {
    const run = await ReadingRunRepository.getLatestByUserBookId(db, params.userBookId);
    const readingRunId = run?.id ?? null;

    const now = nowIso();
    // Невідфільтроване (бачить і м'яко видалені) — SOFT-DELETE READINESS (Фаза 26), докладніше
    // коментар над `getForBookAndRun`: `reading_run_id` лишається UNIQUE незалежно від
    // `deleted_at`, тож повторний виклик після `remove` мусить ВІДРОДИТИ (UPDATE), а не спробувати
    // INSERT у зайнятий UNIQUE-слот.
    const existing = await getForBookAndRun(db, params.userBookId, readingRunId);

    if (existing) {
      await db.runAsync(`UPDATE rating SET value = ?, review = ?, updated_at = ?, deleted_at = NULL WHERE id = ?`, [
        params.value,
        params.review ?? null,
        now,
        existing.id,
      ]);
      return { ...existing, value: params.value, review: params.review ?? null, updatedAt: now, deletedAt: null };
    }

    const id = generateId();
    await db.runAsync(
      `INSERT INTO rating (id, user_book_id, reading_run_id, value, review, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, params.userBookId, readingRunId, params.value, params.review ?? null, now, now],
    );
    return {
      id,
      userBookId: params.userBookId,
      readingRunId,
      value: params.value,
      review: params.review ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  },

  /** SOFT-DELETE READINESS (Фаза 26, `027_soft_delete_readiness.ts`) — м'яке видалення: рецензія
   * (`review`, вільний текст) — так само незамінний написаний користувачем контент, як і
   * капсула/спогад. Той самий "revive on upsert" підхід — див. коментар над
   * `getForBookAndRun`/`upsertCurrent`. */
  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`UPDATE rating SET deleted_at = ? WHERE id = ?`, [nowIso(), id]);
  },
};
