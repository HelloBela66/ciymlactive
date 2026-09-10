import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { Shelf, ShelfThemeId, ShelfWithCount } from '@/types/shelf';
import type { UserBookWithDetails } from '@/types/userBook';
import { DEFAULT_SHELF_THEME } from '@/design/shelfThemes';
import { UserBookRepository } from './UserBookRepository';

interface ShelfRow {
  id: string;
  name: string;
  description: string | null;
  theme: string;
  is_system: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ShelfRow): Shelf {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    theme: row.theme,
    isSystem: row.is_system === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Полиці — довільні користувацькі колекції поверх user_book (докладніше — docs/DATABASE.md).
 * У Milestone 2 усі полиці — користувацькі (`is_system` завжди 0); авто-полиці (наприклад,
 * "Улюблені" з user_book.is_favorite) — можлива майбутня фіча, не потрібна зараз, бо
 * "улюблене" вже є окремим прапорцем на самій книзі.
 */
export const ShelfRepository = {
  /** `theme` (Milestone 11, доповнення8) — за замовчуванням `DEFAULT_SHELF_THEME` ('classic'),
   * той самий нейтральний вигляд, що й у полиць, створених до доповнення8 (`009_shelf_theme.ts`
   * заднім числом проставляє їм те саме значення). `findOrCreateByName` (Goodreads-імпорт)
   * викликає `create` без `theme` — імпортовані полиці свідомо лишаються класичними, вибір теми
   * тут — окрема дія користувача на екрані створення, а не щось, що можна вгадати з файлу
   * імпорту. */
  async create(
    db: SQLiteDatabase,
    name: string,
    description?: string | null,
    theme: ShelfThemeId = DEFAULT_SHELF_THEME,
  ): Promise<Shelf> {
    const id = generateId();
    const now = nowIso();
    const row = await db.getFirstAsync<{ maxOrder: number | null }>(
      `SELECT MAX(sort_order) as maxOrder FROM shelf`,
    );
    const sortOrder = (row?.maxOrder ?? -1) + 1;

    await db.runAsync(
      `INSERT INTO shelf (id, name, description, theme, is_system, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
      [id, name.trim(), description ?? null, theme, sortOrder, now, now],
    );

    return {
      id,
      name: name.trim(),
      description: description ?? null,
      theme,
      isSystem: false,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    };
  },

  async getById(db: SQLiteDatabase, id: string): Promise<Shelf | null> {
    const row = await db.getFirstAsync<ShelfRow>(`SELECT * FROM shelf WHERE id = ?`, [id]);
    return row ? mapRow(row) : null;
  },

  async findByName(db: SQLiteDatabase, name: string): Promise<Shelf | null> {
    const row = await db.getFirstAsync<ShelfRow>(`SELECT * FROM shelf WHERE name = ? LIMIT 1`, [name.trim()]);
    return row ? mapRow(row) : null;
  },

  /** "Знайти чи створити" за назвою (той самий підхід, що й `AuthorRepository`/
   * `PublisherRepository`) — для Goodreads-імпорту (Milestone 9): довільні "Bookshelves" з
   * файлу експорту стають полицями застосунку, без дублікатів при повторному імпорті чи
   * кількох книгах на тій самій полиці. */
  async findOrCreateByName(db: SQLiteDatabase, name: string): Promise<Shelf> {
    const existing = await ShelfRepository.findByName(db, name);
    if (existing) return existing;
    return ShelfRepository.create(db, name);
  },

  async listAll(db: SQLiteDatabase): Promise<ShelfWithCount[]> {
    const rows = await db.getAllAsync<ShelfRow & { book_count: number }>(
      `SELECT s.*, COUNT(sb.user_book_id) as book_count
       FROM shelf s
       LEFT JOIN shelf_book sb ON sb.shelf_id = s.id
       GROUP BY s.id
       ORDER BY s.sort_order ASC`,
    );
    return rows.map((row) => ({ ...mapRow(row), bookCount: row.book_count }));
  },

  async addBook(db: SQLiteDatabase, shelfId: string, userBookId: string): Promise<void> {
    await db.runAsync(
      `INSERT OR IGNORE INTO shelf_book (shelf_id, user_book_id, added_at) VALUES (?, ?, ?)`,
      [shelfId, userBookId, nowIso()],
    );
  },

  async removeBook(db: SQLiteDatabase, shelfId: string, userBookId: string): Promise<void> {
    await db.runAsync(`DELETE FROM shelf_book WHERE shelf_id = ? AND user_book_id = ?`, [
      shelfId,
      userBookId,
    ]);
  },

  /** Видалення полиці (Milestone 8.4) — жорстке (не soft-delete, на відміну від
   * user_book/reading_session/книг у каталозі): полиця сама по собі не несе історичних
   * даних, які варто було б зберігати після видалення (на відміну від нотаток/цитат/сесій).
   * `shelf_book` (зв'язки "книга на цій полиці") видаляються каскадно на рівні схеми
   * (`ON DELETE CASCADE`, `PRAGMA foreign_keys = ON` — `src/data/db/client.ts`) — самі книги
   * й усе інше, що до них прив'язане, не чіпається. `AND is_system = 0` — запобіжник на
   * майбутнє: зараз усі полиці користувацькі (див. коментар до `create` вище), але якщо
   * колись з'являться системні полиці, видалення тут тихо не подіє на них, а не впаде. */
  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`DELETE FROM shelf WHERE id = ? AND is_system = 0`, [id]);
  },

  /** Полиці, на яких уже лежить конкретна книга — для позначок у Book Details. */
  async listShelfIdsForUserBook(db: SQLiteDatabase, userBookId: string): Promise<string[]> {
    const rows = await db.getAllAsync<{ shelf_id: string }>(
      `SELECT shelf_id FROM shelf_book WHERE user_book_id = ?`,
      [userBookId],
    );
    return rows.map((row) => row.shelf_id);
  },

  /** Пакетний варіант — назви полиць (не id) для списку user_book одразу, для CSV-експорту
   * бібліотеки (Milestone 9): один запит замість одного на кожну книгу. */
  async listNamesByUserBookIds(db: SQLiteDatabase, userBookIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (userBookIds.length === 0) return result;

    const placeholders = userBookIds.map(() => '?').join(',');
    const rows = await db.getAllAsync<{ user_book_id: string; name: string }>(
      `SELECT sb.user_book_id as user_book_id, s.name as name
       FROM shelf_book sb
       JOIN shelf s ON s.id = sb.shelf_id
       WHERE sb.user_book_id IN (${placeholders})
       ORDER BY s.sort_order ASC`,
      userBookIds,
    );
    for (const row of rows) {
      const list = result.get(row.user_book_id) ?? [];
      list.push(row.name);
      result.set(row.user_book_id, list);
    }
    return result;
  },

  /** Пакетне довантаження (`listWithDetailsByIds`) замість одного `getByIdWithDetails` на
   * кожну книгу полиці (Milestone 8, продуктивність) — `listWithDetailsByIds` зберігає
   * порядок вхідних id, тож `ORDER BY added_at DESC` тут і далі коректний. */
  async listBooksByShelf(db: SQLiteDatabase, shelfId: string): Promise<UserBookWithDetails[]> {
    const rows = await db.getAllAsync<{ user_book_id: string }>(
      `SELECT user_book_id FROM shelf_book WHERE shelf_id = ? ORDER BY added_at DESC`,
      [shelfId],
    );
    return UserBookRepository.listWithDetailsByIds(db, rows.map((row) => row.user_book_id));
  },
};
