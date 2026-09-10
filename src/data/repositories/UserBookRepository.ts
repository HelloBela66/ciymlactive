import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { UserBook, UserBookStatus, UserBookWithDetails } from '@/types/userBook';
import type { EditionWithRelations } from '@/types/edition';
import type { WorkWithAuthors } from '@/types/work';
import { EditionRepository } from './EditionRepository';
import { WorkRepository } from './WorkRepository';
import { AuthorRepository } from './AuthorRepository';
import { PublisherRepository } from './PublisherRepository';
import { TranslatorRepository } from './TranslatorRepository';

interface UserBookRow {
  id: string;
  edition_id: string;
  status: UserBookStatus;
  started_at: string | null;
  finished_at: string | null;
  current_page: number;
  is_favorite: number;
  added_at: string;
  updated_at: string;
}

function mapRow(row: UserBookRow): UserBook {
  return {
    id: row.id,
    editionId: row.edition_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    currentPage: row.current_page,
    isFavorite: row.is_favorite === 1,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
  };
}

async function attachDetails(db: SQLiteDatabase, userBook: UserBook): Promise<UserBookWithDetails | null> {
  const edition = await EditionRepository.getByIdWithRelations(db, userBook.editionId);
  if (!edition) return null;
  const work = await WorkRepository.getByIdWithAuthors(db, edition.workId);
  if (!work) return null;
  return { ...userBook, edition, work };
}

/**
 * Пакетна версія `attachDetails` для списків (Milestone 8, продуктивність — реальна знахідка
 * з аудиту: `Promise.all(rows.map(attachDetails))` робив ~5 запитів НА КОЖНУ книгу
 * (edition, publisher, translators, work, authors) — 5N+1 на весь список замість фіксованої
 * кількості. Тут та сама інформація збирається шістьма запитами IN (...) сумарно, незалежно
 * від розміру списку: по одному на edition/work/publisher/translators/authors плюс сам
 * `user_book`. Використовується `listByStatus`/`listAll` тут і `ShelfRepository.listBooksByShelf`.
 * `getByIdWithDetails`/`getByEditionIdWithDetails` (рівно ОДНА книга — не список) свідомо
 * лишились на старому `attachDetails`: там 5 запитів замість 6 не варті додаткової складності.
 */
async function attachDetailsBatch(db: SQLiteDatabase, userBooks: UserBook[]): Promise<UserBookWithDetails[]> {
  if (userBooks.length === 0) return [];

  const editionIds = [...new Set(userBooks.map((ub) => ub.editionId))];
  const editionById = await EditionRepository.listByIds(db, editionIds);

  const editions = [...editionById.values()];
  const workIds = [...new Set(editions.map((e) => e.workId))];
  const publisherIds = [...new Set(editions.map((e) => e.publisherId).filter((id): id is string => id != null))];

  const [workById, authorsByWork, publisherById, translatorsByEdition] = await Promise.all([
    WorkRepository.listByIds(db, workIds),
    AuthorRepository.listByWorkIds(db, workIds),
    PublisherRepository.listByIds(db, publisherIds),
    TranslatorRepository.listByEditionIds(db, editionIds),
  ]);

  const results: UserBookWithDetails[] = [];
  for (const userBook of userBooks) {
    const edition = editionById.get(userBook.editionId);
    if (!edition) continue; // те саме захисне пропускання, що й у singular attachDetails
    const work = workById.get(edition.workId);
    if (!work) continue;

    const workWithAuthors: WorkWithAuthors = { ...work, authors: authorsByWork.get(work.id) ?? [] };
    const editionWithRelations: EditionWithRelations = {
      ...edition,
      publisher: edition.publisherId ? publisherById.get(edition.publisherId) ?? null : null,
      translators: translatorsByEdition.get(edition.id) ?? [],
    };
    results.push({ ...userBook, edition: editionWithRelations, work: workWithAuthors });
  }
  return results;
}

/**
 * UserBook — "ця книга в МОЇЙ бібліотеці", окремо від каталогу Work/Edition (Milestone 1).
 * Один edition може мати щонайбільше один активний (не видалений) user_book — повторне
 * додавання того самого видання оновлює наявний запис, а не створює дублікат
 * (докладніше — getByEditionId, використовується формою "Додати до бібліотеки").
 */
export const UserBookRepository = {
  async getByEditionId(db: SQLiteDatabase, editionId: string): Promise<UserBook | null> {
    const row = await db.getFirstAsync<UserBookRow>(
      `SELECT * FROM user_book WHERE edition_id = ? AND deleted_at IS NULL LIMIT 1`,
      [editionId],
    );
    return row ? mapRow(row) : null;
  },

  async addToLibrary(db: SQLiteDatabase, editionId: string, status: UserBookStatus): Promise<UserBook> {
    const existing = await UserBookRepository.getByEditionId(db, editionId);
    if (existing) return existing;

    const id = generateId();
    const now = nowIso();
    const startedAt = status === 'reading' || status === 'rereading' ? now : null;
    const finishedAt = status === 'finished' ? now : null;

    await db.runAsync(
      `INSERT INTO user_book (id, edition_id, status, started_at, finished_at, current_page, is_favorite, added_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      [id, editionId, status, startedAt, finishedAt, now, now],
    );

    return {
      id,
      editionId,
      status,
      startedAt,
      finishedAt,
      currentPage: 0,
      isFavorite: false,
      addedAt: now,
      updatedAt: now,
    };
  },

  async getById(db: SQLiteDatabase, id: string): Promise<UserBook | null> {
    const row = await db.getFirstAsync<UserBookRow>(
      `SELECT * FROM user_book WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    return row ? mapRow(row) : null;
  },

  async getByIdWithDetails(db: SQLiteDatabase, id: string): Promise<UserBookWithDetails | null> {
    const userBook = await UserBookRepository.getById(db, id);
    if (!userBook) return null;
    return attachDetails(db, userBook);
  },

  async getByEditionIdWithDetails(db: SQLiteDatabase, editionId: string): Promise<UserBookWithDetails | null> {
    const userBook = await UserBookRepository.getByEditionId(db, editionId);
    if (!userBook) return null;
    return attachDetails(db, userBook);
  },

  /** Пакетний вибір за списком id, зі збереженням порядку `ids` (важливо для
   * `ShelfRepository.listBooksByShelf` — порядок `shelf_book.added_at DESC`, а `WHERE id IN
   * (...)` сам по собі порядок не гарантує). */
  async listByIds(db: SQLiteDatabase, ids: string[]): Promise<UserBook[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.getAllAsync<UserBookRow>(
      `SELECT * FROM user_book WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      ids,
    );
    const byId = new Map(rows.map((row) => [row.id, mapRow(row)]));
    return ids.map((id) => byId.get(id)).filter((ub): ub is UserBook => ub != null);
  },

  /** Пакетна версія `getByIdWithDetails` для списків — `attachDetailsBatch` замість N
   * окремих `attachDetails` (Milestone 8, продуктивність). Використовується
   * `ShelfRepository.listBooksByShelf`. */
  async listWithDetailsByIds(db: SQLiteDatabase, ids: string[]): Promise<UserBookWithDetails[]> {
    const userBooks = await UserBookRepository.listByIds(db, ids);
    return attachDetailsBatch(db, userBooks);
  },

  /**
   * Оновлення статусу. `started_at`/`finished_at` виставляються автоматично при першому
   * переході в 'reading'/'rereading' чи 'finished' (і не перезаписуються, якщо вже стоять) —
   * щоб дата початку/завершення читання не "стрибала" при випадкових перемиканнях статусу.
   */
  async updateStatus(db: SQLiteDatabase, id: string, status: UserBookStatus): Promise<void> {
    const current = await UserBookRepository.getById(db, id);
    if (!current) return;

    const now = nowIso();
    const startedAt =
      current.startedAt ?? ((status === 'reading' || status === 'rereading') ? now : null);
    const finishedAt = current.finishedAt ?? (status === 'finished' ? now : null);

    await db.runAsync(
      `UPDATE user_book SET status = ?, started_at = ?, finished_at = ?, updated_at = ? WHERE id = ?`,
      [status, startedAt, finishedAt, now, id],
    );
  },

  async updateCurrentPage(db: SQLiteDatabase, id: string, currentPage: number): Promise<void> {
    await db.runAsync(`UPDATE user_book SET current_page = ?, updated_at = ? WHERE id = ?`, [
      Math.max(0, Math.trunc(currentPage)),
      nowIso(),
      id,
    ]);
  },

  async setFavorite(db: SQLiteDatabase, id: string, isFavorite: boolean): Promise<void> {
    await db.runAsync(`UPDATE user_book SET is_favorite = ?, updated_at = ? WHERE id = ?`, [
      isFavorite ? 1 : 0,
      nowIso(),
      id,
    ]);
  },

  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`UPDATE user_book SET deleted_at = ? WHERE id = ?`, [nowIso(), id]);
  },

  /** Проставляє реальні історичні дати з імпорту (Goodreads CSV, Milestone 9) — на відміну
   * від `addToLibrary`/`updateStatus` (які виставляють `started_at`/`finished_at` як "зараз"
   * при переході статусу, бо для звичайного використання застосунку іншої дати просто не
   * існує), тут дати вже відомі з файлу. `COALESCE(?, ...)` — кожен параметр `null` лишає
   * відповідне поле незмінним, а не затирає його: не кожен рядок Goodreads-експорту має і
   * "Date Read", і "Date Added". */
  async applyImportedDates(
    db: SQLiteDatabase,
    id: string,
    params: { startedAt?: string | null; finishedAt?: string | null; addedAt?: string | null },
  ): Promise<void> {
    await db.runAsync(
      `UPDATE user_book
       SET started_at = COALESCE(?, started_at),
           finished_at = COALESCE(?, finished_at),
           added_at = COALESCE(?, added_at),
           updated_at = ?
       WHERE id = ?`,
      [params.startedAt ?? null, params.finishedAt ?? null, params.addedAt ?? null, nowIso(), id],
    );
  },

  /** Усі книги користувача з певним статусом, найновіші зверху — для вкладки Бібліотека.
   * Пакетне довантаження деталей (`attachDetailsBatch`) — фіксована кількість запитів
   * незалежно від розміру бібліотеки (Milestone 8, продуктивність, було 5N+1). */
  async listByStatus(db: SQLiteDatabase, status: UserBookStatus): Promise<UserBookWithDetails[]> {
    const rows = await db.getAllAsync<UserBookRow>(
      `SELECT * FROM user_book WHERE status = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [status],
    );
    return attachDetailsBatch(db, rows.map(mapRow));
  },

  /** Усі книги користувача незалежно від статусу — рахунки/групування на Бібліотеці. */
  async listAll(db: SQLiteDatabase): Promise<UserBookWithDetails[]> {
    const rows = await db.getAllAsync<UserBookRow>(
      `SELECT * FROM user_book WHERE deleted_at IS NULL ORDER BY updated_at DESC`,
    );
    return attachDetailsBatch(db, rows.map(mapRow));
  },

  /** Легкий вибір без деталей видання/твору — для статистики, якій потрібні лише
   * status/finishedAt (Milestone 8, продуктивність: `useOverallStatistics` рахував лише
   * кількість/дати завершених книг, але через `listByStatus` тягнув усі 5 запитів на книгу
   * даремно). */
  async listStatusOnly(db: SQLiteDatabase, status: UserBookStatus): Promise<UserBook[]> {
    const rows = await db.getAllAsync<UserBookRow>(
      `SELECT * FROM user_book WHERE status = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [status],
    );
    return rows.map(mapRow);
  },
};
