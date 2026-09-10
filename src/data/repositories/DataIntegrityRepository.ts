import type { SQLiteDatabase } from 'expo-sqlite';
import {
  runDataIntegrityCheck,
  type DataIntegrityReport,
  type DataIntegritySnapshot,
  type UserBookSnapshotRow,
  type EditionSnapshotRow,
  type WorkSnapshotRow,
  type ReadingSessionSnapshotRow,
  type ReadingProgressSnapshotRow,
  type NoteSnapshotRow,
  type QuoteSnapshotRow,
  type NoteCategorySnapshotRow,
  type ShelfBookSnapshotRow,
  type SeriesEntrySnapshotRow,
} from '@/domain/dataIntegrityDoctor';

/**
 * «Перевірка даних» (POLYTSIA V1.5, Фаза 5) — читає з реальної SQLite рівно ті колонки, що
 * потрібні перевіркам у `src/domain/dataIntegrityDoctor.ts` (не `SELECT *`, на відміну від
 * `BackupRepository` — тут генеричність не потрібна), мапить у типізовані рядки знімку (той
 * самий патерн `Row`-інтерфейс + `mapRow`, що й в інших repository, напр.
 * `PublisherRepository.ts`), і віддає чистій доменній функції. Сам repository — тонкий: жодної
 * логіки перевірки тут немає, лише читання.
 */

interface UserBookRow {
  id: string;
  edition_id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  current_page: number;
  deleted_at: string | null;
}
function mapUserBook(row: UserBookRow): UserBookSnapshotRow {
  return {
    id: row.id,
    editionId: row.edition_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    currentPage: row.current_page,
    deletedAt: row.deleted_at,
  };
}

interface EditionRow {
  id: string;
  work_id: string;
  isbn10: string | null;
  isbn13: string | null;
  page_count: number | null;
  deleted_at: string | null;
}
function mapEdition(row: EditionRow): EditionSnapshotRow {
  return {
    id: row.id,
    workId: row.work_id,
    isbn10: row.isbn10,
    isbn13: row.isbn13,
    pageCount: row.page_count,
    deletedAt: row.deleted_at,
  };
}

interface WorkRow {
  id: string;
  deleted_at: string | null;
}
function mapWork(row: WorkRow): WorkSnapshotRow {
  return { id: row.id, deletedAt: row.deleted_at };
}

interface ReadingSessionRow {
  id: string;
  user_book_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  paused_intervals: string;
}
function mapReadingSession(row: ReadingSessionRow): ReadingSessionSnapshotRow {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    pausedIntervals: row.paused_intervals,
  };
}

interface ReadingProgressRow {
  id: string;
  user_book_id: string;
  page: number;
}
function mapReadingProgress(row: ReadingProgressRow): ReadingProgressSnapshotRow {
  return { id: row.id, userBookId: row.user_book_id, page: row.page };
}

interface NoteRow {
  id: string;
  user_book_id: string;
  session_id: string | null;
  category_id: string | null;
}
function mapNote(row: NoteRow): NoteSnapshotRow {
  return { id: row.id, userBookId: row.user_book_id, sessionId: row.session_id, categoryId: row.category_id };
}

interface QuoteRow {
  id: string;
  user_book_id: string;
  session_id: string | null;
}
function mapQuote(row: QuoteRow): QuoteSnapshotRow {
  return { id: row.id, userBookId: row.user_book_id, sessionId: row.session_id };
}

interface NoteCategoryRow {
  id: string;
  deleted_at: string | null;
}
function mapNoteCategory(row: NoteCategoryRow): NoteCategorySnapshotRow {
  return { id: row.id, deletedAt: row.deleted_at };
}

interface ShelfBookRow {
  shelf_id: string;
  user_book_id: string;
}
function mapShelfBook(row: ShelfBookRow): ShelfBookSnapshotRow {
  return { shelfId: row.shelf_id, userBookId: row.user_book_id };
}

interface SeriesEntryRow {
  id: string;
  series_id: string;
  work_id: string;
}
function mapSeriesEntry(row: SeriesEntryRow): SeriesEntrySnapshotRow {
  return { id: row.id, seriesId: row.series_id, workId: row.work_id };
}

async function collectSnapshot(db: SQLiteDatabase): Promise<DataIntegritySnapshot> {
  const [
    userBookRows,
    editionRows,
    workRows,
    sessionRows,
    progressRows,
    noteRows,
    quoteRows,
    noteCategoryRows,
    shelfBookRows,
    seriesRows,
    seriesEntryRows,
  ] = await Promise.all([
    db.getAllAsync<UserBookRow>('SELECT id, edition_id, status, started_at, finished_at, current_page, deleted_at FROM user_book'),
    db.getAllAsync<EditionRow>('SELECT id, work_id, isbn10, isbn13, page_count, deleted_at FROM edition'),
    db.getAllAsync<WorkRow>('SELECT id, deleted_at FROM work'),
    db.getAllAsync<ReadingSessionRow>(
      'SELECT id, user_book_id, started_at, ended_at, duration_seconds, paused_intervals FROM reading_session',
    ),
    db.getAllAsync<ReadingProgressRow>('SELECT id, user_book_id, page FROM reading_progress'),
    db.getAllAsync<NoteRow>('SELECT id, user_book_id, session_id, category_id FROM note'),
    db.getAllAsync<QuoteRow>('SELECT id, user_book_id, session_id FROM quote'),
    db.getAllAsync<NoteCategoryRow>('SELECT id, deleted_at FROM note_category'),
    db.getAllAsync<ShelfBookRow>('SELECT shelf_id, user_book_id FROM shelf_book'),
    db.getAllAsync<{ id: string }>('SELECT id FROM series'),
    db.getAllAsync<SeriesEntryRow>('SELECT id, series_id, work_id FROM series_entry'),
  ]);

  return {
    userBooks: userBookRows.map(mapUserBook),
    editions: editionRows.map(mapEdition),
    works: workRows.map(mapWork),
    readingSessions: sessionRows.map(mapReadingSession),
    readingProgress: progressRows.map(mapReadingProgress),
    notes: noteRows.map(mapNote),
    quotes: quoteRows.map(mapQuote),
    noteCategories: noteCategoryRows.map(mapNoteCategory),
    shelfBooks: shelfBookRows.map(mapShelfBook),
    seriesIds: seriesRows.map((row) => row.id),
    seriesEntries: seriesEntryRows.map(mapSeriesEntry),
  };
}

export const DataIntegrityRepository = {
  collectSnapshot,

  /** Читає БД і одразу прогонює перевірку (ТЗ Фази 5 — «Перевірка даних») — те, що реально
   * викликає UI-хук. */
  async runCheck(db: SQLiteDatabase): Promise<DataIntegrityReport> {
    const snapshot = await collectSnapshot(db);
    return runDataIntegrityCheck(snapshot);
  },
};
