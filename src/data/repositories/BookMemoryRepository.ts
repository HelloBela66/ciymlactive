import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { BookMemory, BookMemoryEntryRef, MemoryCardTemplateId } from '@/types/bookMemory';
import { ReadingRunRepository } from './ReadingRunRepository';

interface BookMemoryRow {
  id: string;
  user_book_id: string;
  reading_run_id: string | null;
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
    readingRunId: row.reading_run_id,
    reflection: row.reflection,
    entryRefs: parseEntryRefs(row.entry_refs),
    templateId: parseTemplateId(row.template_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Спогад для конкретного run, якщо він є; інакше (книга без жодного `reading_run` — Фаза 7
 * `addToLibrary`, свідомо не підключена) — "книжковий" спогад без прив'язки до run
 * (`reading_run_id IS NULL`), той самий фолбек, що діяв для ВСІХ спогадів до Фази 8. */
async function getForBookAndRun(
  db: SQLiteDatabase,
  userBookId: string,
  readingRunId: string | null,
): Promise<BookMemory | null> {
  const row = readingRunId
    ? await db.getFirstAsync<BookMemoryRow>(`SELECT * FROM book_memory WHERE reading_run_id = ?`, [readingRunId])
    : await db.getFirstAsync<BookMemoryRow>(
        `SELECT * FROM book_memory WHERE user_book_id = ? AND reading_run_id IS NULL`,
        [userBookId],
      );
  return row ? mapRow(row) : null;
}

/**
 * «Спогад про книгу» (Milestone 11, Фаза 7-8; REREADING MODEL, Фаза 8 — `docs/READING_RUN.md`).
 * ДО Фази 8 — щонайбільше один на книгу (`UNIQUE(user_book_id)`, `004_book_memory.ts`): другий
 * `upsert` (наприклад, після перечитування) БЕЗПОВОРОТНО перезаписував перший
 * (`docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 23, п.5). Фаза 8 (`021_book_memory_run.ts`) змінює
 * обмеження на `UNIQUE(reading_run_id)` — щонайбільше один спогад НА RUN, тож кожне завершене
 * прочитання (перше, перечитування №2, №3...) тепер може мати власний спогад, що не
 * перезаписує попередні.
 *
 * `getCurrent`/`upsertCurrent` — головний публічний API: САМІ визначають "поточний" run книги
 * (`ReadingRunRepository.getLatestByUserBookId` — найновіший run НЕЗАЛЕЖНО від статусу, бо
 * спогад пишеться вже ПІСЛЯ того, як `updateStatus`, Фаза 7, завершив run) і працюють із
 * прив'язаним до нього спогадом. Виклики з UI (`useBookMemory.ts`) лишаються НЕЗМІННИМИ за
 * формою — той самий `userBookId`, жодного нового параметра — тож перечитування книги тепер
 * природно починає НОВИЙ, порожній спогад для нового run замість затирання старого, без жодної
 * зміни в UI-шарі цієї фази (докладніше — `docs/READING_RUN.md` §"Фаза 8").
 */
export const BookMemoryRepository = {
  /** Спогад для конкретного run напряму — Фаза 8, майбутня історія спогадів (Фаза 12). */
  async getByReadingRunId(db: SQLiteDatabase, readingRunId: string): Promise<BookMemory | null> {
    const row = await db.getFirstAsync<BookMemoryRow>(`SELECT * FROM book_memory WHERE reading_run_id = ?`, [
      readingRunId,
    ]);
    return row ? mapRow(row) : null;
  },

  /** УСІ спогади книги, за всіма її run — Фаза 8, майбутня історія спогадів (Фаза 12). */
  async listByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<BookMemory[]> {
    const rows = await db.getAllAsync<BookMemoryRow>(
      `SELECT * FROM book_memory WHERE user_book_id = ? ORDER BY created_at DESC`,
      [userBookId],
    );
    return rows.map(mapRow);
  },

  /** Спогад "поточного" (найновішого) run книги — те, що показує UI сьогодні. */
  async getCurrent(db: SQLiteDatabase, userBookId: string): Promise<BookMemory | null> {
    const run = await ReadingRunRepository.getLatestByUserBookId(db, userBookId);
    return getForBookAndRun(db, userBookId, run?.id ?? null);
  },

  async upsertCurrent(
    db: SQLiteDatabase,
    params: {
      userBookId: string;
      reflection: string | null;
      entryRefs: BookMemoryEntryRef[];
      templateId: MemoryCardTemplateId;
    },
  ): Promise<BookMemory> {
    const run = await ReadingRunRepository.getLatestByUserBookId(db, params.userBookId);
    const readingRunId = run?.id ?? null;

    const now = nowIso();
    const entryRefsJson = JSON.stringify(params.entryRefs);
    const existing = await getForBookAndRun(db, params.userBookId, readingRunId);

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
      `INSERT INTO book_memory (id, user_book_id, reading_run_id, reflection, entry_refs, template_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, params.userBookId, readingRunId, params.reflection, entryRefsJson, params.templateId, now, now],
    );
    return {
      id,
      userBookId: params.userBookId,
      readingRunId,
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
