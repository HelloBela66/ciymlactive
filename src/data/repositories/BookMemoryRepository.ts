import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { BookMemory, BookMemoryEntryRef, MemoryCardTemplateId } from '@/types/bookMemory';

interface BookMemoryRow {
  id: string;
  user_book_id: string;
  reflection: string | null;
  entry_refs: string;
  template_id: string;
  created_at: string;
  updated_at: string;
}

const TEMPLATE_IDS: MemoryCardTemplateId[] = ['classic', 'quote', 'stats', 'minimal'];

// БЕЗ SQLite CHECK на `template_id` (`005_book_memory_template.ts`) — тож теоретично можливе
// стороннє/застаріле значення з майбутнього формату бекапу; той самий "не падати на сміттєвих
// даних" підхід, що й `parseEntryRefs` нижче. `'classic'` — розумний дефолт-фолбек.
function parseTemplateId(raw: string): MemoryCardTemplateId {
  return (TEMPLATE_IDS as string[]).includes(raw) ? (raw as MemoryCardTemplateId) : 'classic';
}

function parseEntryRefs(raw: string): BookMemoryEntryRef[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is BookMemoryEntryRef =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as BookMemoryEntryRef).id === 'string' &&
        ((item as BookMemoryEntryRef).kind === 'note' || (item as BookMemoryEntryRef).kind === 'quote'),
    );
  } catch {
    return [];
  }
}

function mapRow(row: BookMemoryRow): BookMemory {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    reflection: row.reflection,
    entryRefs: parseEntryRefs(row.entry_refs),
    templateId: parseTemplateId(row.template_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** «Спогад про книгу» (Milestone 11, Фаза 7-8) — щонайбільше один на книгу
 * (`UNIQUE(user_book_id)` у `004_book_memory.ts`), тому upsert, той самий патерн, що й
 * `RatingRepository`. */
export const BookMemoryRepository = {
  async getByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<BookMemory | null> {
    const row = await db.getFirstAsync<BookMemoryRow>(`SELECT * FROM book_memory WHERE user_book_id = ?`, [
      userBookId,
    ]);
    return row ? mapRow(row) : null;
  },

  async upsert(
    db: SQLiteDatabase,
    params: {
      userBookId: string;
      reflection: string | null;
      entryRefs: BookMemoryEntryRef[];
      templateId: MemoryCardTemplateId;
    },
  ): Promise<BookMemory> {
    const now = nowIso();
    const entryRefsJson = JSON.stringify(params.entryRefs);
    const existing = await BookMemoryRepository.getByUserBookId(db, params.userBookId);

    if (existing) {
      await db.runAsync(
        `UPDATE book_memory SET reflection = ?, entry_refs = ?, template_id = ?, updated_at = ? WHERE id = ?`,
        [params.reflection, entryRefsJson, params.templateId, now, existing.id],
      );
      return {
        ...existing,
        reflection: params.reflection,
        entryRefs: params.entryRefs,
        templateId: params.templateId,
        updatedAt: now,
      };
    }

    const id = generateId();
    await db.runAsync(
      `INSERT INTO book_memory (id, user_book_id, reflection, entry_refs, template_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, params.userBookId, params.reflection, entryRefsJson, params.templateId, now, now],
    );
    return {
      id,
      userBookId: params.userBookId,
      reflection: params.reflection,
      entryRefs: params.entryRefs,
      templateId: params.templateId,
      createdAt: now,
      updatedAt: now,
    };
  },

  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`DELETE FROM book_memory WHERE id = ?`, [id]);
  },
};
