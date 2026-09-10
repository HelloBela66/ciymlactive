import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { Series, SeriesEntry, SeriesContext } from '@/types/series';
import type { WorkWithAuthors } from '@/types/work';
import { WorkRepository } from './WorkRepository';
import { AuthorRepository } from './AuthorRepository';

interface SeriesRow {
  id: string;
  name: string;
  description: string | null;
  status: Series['status'];
  total_known_works: number | null;
  cover_url: string | null;
  created_at: string;
  updated_at: string;
}

interface SeriesEntryRow {
  id: string;
  series_id: string;
  work_id: string;
  position: number | null;
  publication_order: number | null;
  chronological_order: number | null;
  recommended_order: number | null;
  entry_type: SeriesEntry['entryType'];
}

function mapSeriesRow(row: SeriesRow): Series {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    totalKnownWorks: row.total_known_works,
    coverUrl: row.cover_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEntryRow(row: SeriesEntryRow): SeriesEntry {
  return {
    id: row.id,
    seriesId: row.series_id,
    workId: row.work_id,
    position: row.position,
    publicationOrder: row.publication_order,
    chronologicalOrder: row.chronological_order,
    recommendedOrder: row.recommended_order,
    entryType: row.entry_type,
  };
}

/**
 * Повний Series Screen (перегляд усіх книг серії, кілька видів порядку) — Milestone 2.
 * У Milestone 1 серія потрібна лише як контекст на Book Details: "ця книга — N-та у серії X".
 */
export const SeriesRepository = {
  async findByName(db: SQLiteDatabase, name: string): Promise<Series | null> {
    const row = await db.getFirstAsync<SeriesRow>(`SELECT * FROM series WHERE name = ? LIMIT 1`, [name.trim()]);
    return row ? mapSeriesRow(row) : null;
  },

  async findOrCreateByName(db: SQLiteDatabase, name: string): Promise<Series> {
    const trimmed = name.trim();
    const existing = await SeriesRepository.findByName(db, trimmed);
    if (existing) return existing;

    const id = generateId();
    const now = nowIso();
    await db.runAsync(
      `INSERT INTO series (id, name, description, status, total_known_works, cover_url, created_at, updated_at)
       VALUES (?, ?, NULL, 'unknown', NULL, NULL, ?, ?)`,
      [id, trimmed, now, now],
    );
    return {
      id,
      name: trimmed,
      description: null,
      status: 'unknown',
      totalKnownWorks: null,
      coverUrl: null,
      createdAt: now,
      updatedAt: now,
    };
  },

  async addEntry(
    db: SQLiteDatabase,
    params: { seriesId: string; workId: string; position: number | null },
  ): Promise<SeriesEntry> {
    const id = generateId();
    await db.runAsync(
      `INSERT INTO series_entry (id, series_id, work_id, position, publication_order, chronological_order, recommended_order, entry_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'main')
       ON CONFLICT (series_id, work_id) DO UPDATE SET position = excluded.position`,
      [id, params.seriesId, params.workId, params.position, params.position, params.position, params.position],
    );
    return {
      id,
      seriesId: params.seriesId,
      workId: params.workId,
      position: params.position,
      publicationOrder: params.position,
      chronologicalOrder: params.position,
      recommendedOrder: params.position,
      entryType: 'main',
    };
  },

  /** Контекст серії для одного твору (Book Details, Milestone 1). */
  async getContextForWork(db: SQLiteDatabase, workId: string): Promise<SeriesContext | null> {
    const row = await db.getFirstAsync<SeriesRow & { position: number | null }>(
      `SELECT s.*, se.position as position FROM series_entry se
       JOIN series s ON s.id = se.series_id
       WHERE se.work_id = ?
       LIMIT 1`,
      [workId],
    );
    if (!row) return null;
    return { series: mapSeriesRow(row), position: row.position };
  },

  async getById(db: SQLiteDatabase, id: string): Promise<Series | null> {
    const row = await db.getFirstAsync<SeriesRow>(`SELECT * FROM series WHERE id = ?`, [id]);
    return row ? mapSeriesRow(row) : null;
  },

  /**
   * Повний Series Screen (Milestone 2): серія + всі твори, впорядковані за `position`
   * (NULL — в кінці). Множинне сортування (publication/chronological/recommended order з
   * докладнішими правилами) — за потреби пізніше; для одного користувача з невеликими
   * серіями `position` як єдиний порядок цілком читабельний уже зараз.
   */
  async getByIdWithWorks(
    db: SQLiteDatabase,
    id: string,
  ): Promise<{ series: Series; entries: Array<{ entry: SeriesEntry; work: WorkWithAuthors }> } | null> {
    const series = await SeriesRepository.getById(db, id);
    if (!series) return null;

    const rows = await db.getAllAsync<SeriesEntryRow>(
      `SELECT * FROM series_entry WHERE series_id = ?
       ORDER BY position IS NULL, position ASC`,
      [id],
    );

    const entries = await Promise.all(
      rows.map(async (row) => {
        const entry = mapEntryRow(row);
        const work = await WorkRepository.getById(db, entry.workId);
        if (!work) return null;
        const authors = await AuthorRepository.listByWorkId(db, entry.workId);
        return { entry, work: { ...work, authors } };
      }),
    );

    return {
      series,
      entries: entries.filter((item): item is { entry: SeriesEntry; work: WorkWithAuthors } => item !== null),
    };
  },
};
