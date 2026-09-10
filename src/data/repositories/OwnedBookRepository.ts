import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { OwnedBook, OwnedBookCondition, CreateOwnedBookInput } from '@/types/ownedBook';

interface OwnedBookRow {
  id: string;
  edition_id: string;
  condition: OwnedBookCondition | null;
  location: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  purchase_currency: string | null;
  purchase_place: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: OwnedBookRow): OwnedBook {
  return {
    id: row.id,
    editionId: row.edition_id,
    condition: row.condition,
    location: row.location,
    purchaseDate: row.purchase_date,
    purchasePrice: row.purchase_price,
    purchaseCurrency: row.purchase_currency,
    purchasePlace: row.purchase_place,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * "Я маю цю книгу фізично" — окремо від reading-статусу (можна володіти й не читати, чи
 * читати електронну версію не володіючи паперовою). Milestone 2 дає лише позначку +
 * мінімальні поля просто на Book Details; повноцінний екран "Моя фізична бібліотека" зі
 * списком/фільтрами за станом/місцем і Loans (позичання) — пізніший milestone (див.
 * CHANGELOG, "Відомі обмеження цієї ітерації").
 */
export const OwnedBookRepository = {
  async getByEditionId(db: SQLiteDatabase, editionId: string): Promise<OwnedBook | null> {
    const row = await db.getFirstAsync<OwnedBookRow>(
      `SELECT * FROM owned_book WHERE edition_id = ? AND deleted_at IS NULL LIMIT 1`,
      [editionId],
    );
    return row ? mapRow(row) : null;
  },

  async create(db: SQLiteDatabase, input: CreateOwnedBookInput): Promise<OwnedBook> {
    const existing = await OwnedBookRepository.getByEditionId(db, input.editionId);
    if (existing) return existing;

    const id = generateId();
    const now = nowIso();

    await db.runAsync(
      `INSERT INTO owned_book (id, edition_id, condition, location, purchase_date, purchase_price, purchase_currency, purchase_place, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)`,
      [id, input.editionId, input.condition ?? null, input.location ?? null, input.notes ?? null, now, now],
    );

    return {
      id,
      editionId: input.editionId,
      condition: input.condition ?? null,
      location: input.location ?? null,
      purchaseDate: null,
      purchasePrice: null,
      purchaseCurrency: null,
      purchasePlace: null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
  },

  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`UPDATE owned_book SET deleted_at = ? WHERE id = ?`, [nowIso(), id]);
  },
};
