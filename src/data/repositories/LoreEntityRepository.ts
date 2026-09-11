import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { CreateLoreEntityInput, JournalLoreLink, LoreEntity, LoreEntityType } from '@/types/loreEntity';
import type { JournalEntryKind } from '@/types/journalEntry';

interface LoreEntityRow {
  id: string;
  work_id: string;
  type: LoreEntityType;
  name: string;
  description: string | null;
  first_seen_page: number | null;
  first_seen_progress: number | null;
  reaction: string | null;
  is_favorite: number;
  created_at: string;
  updated_at: string;
}

interface JournalLoreLinkRow {
  id: string;
  lore_entity_id: string;
  entry_kind: JournalEntryKind;
  entry_id: string;
  created_at: string;
}

function mapRow(row: LoreEntityRow): LoreEntity {
  return {
    id: row.id,
    workId: row.work_id,
    type: row.type,
    name: row.name,
    description: row.description,
    firstSeenPage: row.first_seen_page,
    firstSeenProgress: row.first_seen_progress,
    reaction: row.reaction,
    isFavorite: row.is_favorite === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLinkRow(row: JournalLoreLinkRow): JournalLoreLink {
  return {
    id: row.id,
    loreEntityId: row.lore_entity_id,
    entryKind: row.entry_kind,
    entryId: row.entry_id,
    createdAt: row.created_at,
  };
}

/** `firstSeenProgress` — уже обчислена доменним шаром (`src/lib/loreEntity.ts`) перед викликом,
 * репозиторій сам жодного проценту не рахує (той самий поділ обов'язків, що й
 * `BookCapsuleRepository.create`/`reopenAt`). */
export interface CreateLoreEntityParams extends CreateLoreEntityInput {
  firstSeenProgress: number | null;
}

export interface UpdateLoreEntityParams {
  id: string;
  name: string;
  description: string | null;
  firstSeenPage: number | null;
  firstSeenProgress: number | null;
  reaction: string | null;
}

/**
 * «Персонажі» / PERSONAL LORE (POLYTSIA V1.6, Фаза 9-10, `015_lore_entity.ts`) — CRUD за тим
 * самим шаблоном, що й `NoteRepository` (м'яке видалення через `deleted_at`, `listByWorkId`
 * найновіші зверху), плюс `journal_lore_link` (полiморфний зв'язок із записом щоденника, той
 * самий "id+kind" підхід, що й `TagRepository`/`tagged_item`).
 */
export const LoreEntityRepository = {
  async create(db: SQLiteDatabase, params: CreateLoreEntityParams): Promise<LoreEntity> {
    const id = generateId();
    const now = nowIso();

    await db.runAsync(
      `INSERT INTO lore_entity (
         id, work_id, type, name, description, first_seen_page, first_seen_progress, reaction,
         is_favorite, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)`,
      [id, params.workId, params.type, params.name, params.description, params.firstSeenPage, params.firstSeenProgress, now, now],
    );

    return {
      id,
      workId: params.workId,
      type: params.type,
      name: params.name,
      description: params.description,
      firstSeenPage: params.firstSeenPage,
      firstSeenProgress: params.firstSeenProgress,
      reaction: null,
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
    };
  },

  async getById(db: SQLiteDatabase, id: string): Promise<LoreEntity | null> {
    const row = await db.getFirstAsync<LoreEntityRow>(
      `SELECT * FROM lore_entity WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    return row ? mapRow(row) : null;
  },

  async listByWorkId(db: SQLiteDatabase, workId: string): Promise<LoreEntity[]> {
    const rows = await db.getAllAsync<LoreEntityRow>(
      `SELECT * FROM lore_entity WHERE work_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [workId],
    );
    return rows.map(mapRow);
  },

  async update(db: SQLiteDatabase, params: UpdateLoreEntityParams): Promise<void> {
    await db.runAsync(
      `UPDATE lore_entity SET
         name = ?, description = ?, first_seen_page = ?, first_seen_progress = ?, reaction = ?,
         updated_at = ?
       WHERE id = ?`,
      [
        params.name,
        params.description,
        params.firstSeenPage,
        params.firstSeenProgress,
        params.reaction,
        nowIso(),
        params.id,
      ],
    );
  },

  /** Той самий патерн, що й `NoteRepository.setFavorite`/`UserBookRepository.setFavorite`. */
  async setFavorite(db: SQLiteDatabase, id: string, isFavorite: boolean): Promise<void> {
    await db.runAsync(`UPDATE lore_entity SET is_favorite = ?, updated_at = ? WHERE id = ?`, [
      isFavorite ? 1 : 0,
      nowIso(),
      id,
    ]);
  },

  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`UPDATE lore_entity SET deleted_at = ? WHERE id = ?`, [nowIso(), id]);
  },

  /** Персонажі, пов'язані з конкретним записом щоденника — компактний бейдж на самому записі
   * (майбутнє UI-розширення; уже потрібен репозиторію для симетрії з `listLinkedEntryIds`). */
  async listLinksForEntity(db: SQLiteDatabase, loreEntityId: string): Promise<JournalLoreLink[]> {
    const rows = await db.getAllAsync<JournalLoreLinkRow>(
      `SELECT * FROM journal_lore_link WHERE lore_entity_id = ? ORDER BY created_at DESC`,
      [loreEntityId],
    );
    return rows.map(mapLinkRow);
  },

  /** Ідемпотентне зв'язування (`INSERT OR IGNORE`, той самий підхід, що й
   * `TagRepository.addToWork` — `UNIQUE(lore_entity_id, entry_kind, entry_id)` не дає дубля при
   * повторному натисканні "Пов'язати"). */
  async linkJournalEntry(
    db: SQLiteDatabase,
    loreEntityId: string,
    entryKind: JournalEntryKind,
    entryId: string,
  ): Promise<void> {
    await db.runAsync(
      `INSERT OR IGNORE INTO journal_lore_link (id, lore_entity_id, entry_kind, entry_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [generateId(), loreEntityId, entryKind, entryId, nowIso()],
    );
  },

  async unlinkJournalEntry(
    db: SQLiteDatabase,
    loreEntityId: string,
    entryKind: JournalEntryKind,
    entryId: string,
  ): Promise<void> {
    await db.runAsync(
      `DELETE FROM journal_lore_link WHERE lore_entity_id = ? AND entry_kind = ? AND entry_id = ?`,
      [loreEntityId, entryKind, entryId],
    );
  },
};
