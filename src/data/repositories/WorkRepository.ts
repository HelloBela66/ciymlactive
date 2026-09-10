import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import { pickCoverFallbackColor } from '@/lib/coverFallback';
import type { Work, WorkWithAuthors } from '@/types/work';
import { AuthorRepository } from './AuthorRepository';

interface WorkRow {
  id: string;
  title: string;
  original_title: string | null;
  description: string | null;
  original_language: string | null;
  first_published_year: number | null;
  cover_fallback_color: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: WorkRow): Work {
  return {
    id: row.id,
    title: row.title,
    originalTitle: row.original_title,
    description: row.description,
    originalLanguage: row.original_language,
    firstPublishedYear: row.first_published_year,
    coverFallbackColor: row.cover_fallback_color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Рядок пошуку/останніх доданих — з представницькою обкладинкою (Milestone 10). Work сам по
 * собі не володіє обкладинкою (лише `edition.cover_url` — один твір може мати кілька видань,
 * `docs/DATABASE.md`), тож для списків результатів пошуку/"Останні додані" (де показуємо
 * саме Work, ще до вибору конкретного видання) беремо обкладинку НАЙСТАРІШОГО видання цього
 * твору підзапитом — той самий принцип, що й `primaryEdition` у `useBookDetails.ts`
 * ("перше видання, зазвичай єдине для книг, доданих вручну"). */
interface WorkRowWithCover extends WorkRow {
  cover_url: string | null;
}

export interface WorkSearchResult extends WorkWithAuthors {
  coverUrl: string | null;
}

function mapRowWithCover(row: WorkRowWithCover): Work & { coverUrl: string | null } {
  return { ...mapRow(row), coverUrl: row.cover_url };
}

export interface CreateWorkInput {
  title: string;
  originalTitle?: string | null;
  description?: string | null;
  originalLanguage?: string | null;
  firstPublishedYear?: number | null;
}

export const WorkRepository = {
  async create(db: SQLiteDatabase, input: CreateWorkInput): Promise<Work> {
    const id = generateId();
    const now = nowIso();
    const coverFallbackColor = pickCoverFallbackColor(input.title);
    await db.runAsync(
      `INSERT INTO work (id, title, original_title, description, original_language, first_published_year, cover_fallback_color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.title,
        input.originalTitle ?? null,
        input.description ?? null,
        input.originalLanguage ?? null,
        input.firstPublishedYear ?? null,
        coverFallbackColor,
        now,
        now,
      ],
    );
    return {
      id,
      title: input.title,
      originalTitle: input.originalTitle ?? null,
      description: input.description ?? null,
      originalLanguage: input.originalLanguage ?? null,
      firstPublishedYear: input.firstPublishedYear ?? null,
      coverFallbackColor,
      createdAt: now,
      updatedAt: now,
    };
  },

  async getById(db: SQLiteDatabase, id: string): Promise<Work | null> {
    const row = await db.getFirstAsync<WorkRow>(`SELECT * FROM work WHERE id = ? AND deleted_at IS NULL`, [id]);
    return row ? mapRow(row) : null;
  },

  async getByIdWithAuthors(db: SQLiteDatabase, id: string): Promise<WorkWithAuthors | null> {
    const work = await WorkRepository.getById(db, id);
    if (!work) return null;
    const authors = await AuthorRepository.listByWorkId(db, id);
    return { ...work, authors };
  },

  /** Пакетний варіант `getById` для списків (Milestone 8, продуктивність) — один запит на
   * весь список замість одного на рядок, викликається з `UserBookRepository.attachDetailsBatch`.
   * Повертає "сирі" Work без авторів — їх сам виклик батчить окремо через `AuthorRepository.listByWorkIds`. */
  async listByIds(db: SQLiteDatabase, ids: string[]): Promise<Map<string, Work>> {
    const result = new Map<string, Work>();
    if (ids.length === 0) return result;
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.getAllAsync<WorkRow>(
      `SELECT * FROM work WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      ids,
    );
    for (const row of rows) result.set(row.id, mapRow(row));
    return result;
  },

  /**
   * Локальний пошук по каталогу (Milestone 1 — лише те, що вже додано вручну). Шукає за
   * назвою, оригінальною назвою й іменем автора. Зовнішні провайдери — Milestone 7.
   * LIKE у SQLite не фолдить регістр кирилиці без ICU-розширення — прийнятне обмеження для
   * одного користувача на цьому етапі (докладніше — коментар у AuthorRepository).
   */
  async search(db: SQLiteDatabase, query: string, limit = 30): Promise<WorkSearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];
    const pattern = `%${trimmed}%`;

    const rows = await db.getAllAsync<WorkRowWithCover>(
      `SELECT DISTINCT w.*,
         (SELECT e.cover_url FROM edition e WHERE e.work_id = w.id AND e.deleted_at IS NULL ORDER BY e.created_at ASC LIMIT 1) AS cover_url
       FROM work w
       LEFT JOIN work_author wa ON wa.work_id = w.id
       LEFT JOIN author a ON a.id = wa.author_id
       WHERE w.deleted_at IS NULL
         AND (w.title LIKE ? OR w.original_title LIKE ? OR a.name LIKE ?)
       ORDER BY w.updated_at DESC
       LIMIT ?`,
      [pattern, pattern, pattern, limit],
    );

    if (rows.length === 0) return [];

    const works = rows.map(mapRowWithCover);
    const authorsByWork = await AuthorRepository.listByWorkIds(db, works.map((w) => w.id));
    return works.map((work) => ({ ...work, authors: authorsByWork.get(work.id) ?? [] }));
  },

  /** Останні додані книги — для порожнього стану пошуку/дебагу в Milestone 1. */
  async listRecent(db: SQLiteDatabase, limit = 20): Promise<WorkSearchResult[]> {
    const rows = await db.getAllAsync<WorkRowWithCover>(
      `SELECT w.*,
         (SELECT e.cover_url FROM edition e WHERE e.work_id = w.id AND e.deleted_at IS NULL ORDER BY e.created_at ASC LIMIT 1) AS cover_url
       FROM work w
       WHERE w.deleted_at IS NULL
       ORDER BY w.created_at DESC
       LIMIT ?`,
      [limit],
    );
    if (rows.length === 0) return [];
    const works = rows.map(mapRowWithCover);
    const authorsByWork = await AuthorRepository.listByWorkIds(db, works.map((w) => w.id));
    return works.map((work) => ({ ...work, authors: authorsByWork.get(work.id) ?? [] }));
  },
};
