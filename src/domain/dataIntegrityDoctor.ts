/**
 * «Перевірка даних» (POLYTSIA V1.5, Фаза 5 — Data Integrity Doctor). Чиста функція без SQL/
 * React (той самий принцип, що й решта `src/domain/*`, `docs/TESTING.md`) — приймає вже
 * прочитаний "знімок" потрібних таблиць (`DataIntegritySnapshot`, рядки як є в SQLite, той
 * самий рівень абстракції, що й `BackupRepository`) і повертає структурований звіт.
 * Читання снепшоту з реальної БД — `src/data/repositories/DataIntegrityRepository.ts`.
 *
 * НАВМИСНО жодного destructive auto-repair на цьому milestone (ТЗ Фази 5) — лише знаходження
 * й, де можливо, дані для safe navigation до проблемного запису (UI сам вирішує, як саме
 * навігувати — цей модуль повертає лише посилання на сутності, не маршрути Expo Router).
 *
 * Категорії звіту — рівно ті 6, що вимагає ТЗ: книги, сесії, прогрес, щоденник, полиці, серії.
 * Кожна перевірка нижче навмисно НЕ покладається лише на SQLite FK (`PRAGMA foreign_keys =
 * ON`, `002_book_source_isbndb.ts` та інші вже покладаються на нього для посилальної
 * цілісності) — цей "лікар" навпаки існує саме для випадків, коли FK НЕ могли б це впіймати:
 * polymorphic-посилання без REFERENCES (`note.category_id`, свідомий вибір у
 * `008_note_category.ts`), м'яке видалення (`deleted_at`, FK лишається задоволеним навіть
 * коли сутність логічно "видалена"), і семантичні суперечності між полями одного рядка
 * (наприклад, `status`/`finished_at`), які СХЕМА взагалі не може виразити як CHECK.
 */

export type DataIntegrityCategory = 'books' | 'sessions' | 'progress' | 'journal' | 'shelves' | 'series';

export const DATA_INTEGRITY_CATEGORIES: readonly DataIntegrityCategory[] = [
  'books',
  'sessions',
  'progress',
  'journal',
  'shelves',
  'series',
];

/** Куди (якою сутністю) можна безпечно навігувати з проблемного запису — ТЗ Фази 5: "де
 * можливо — запропонуй safe navigation до problematic item". `null`, коли для цього типу
 * проблеми немає осмисленого екрана призначення (напр. сирітський `note.category_id` —
 * категорія сама не має власного екрана). UI (не цей модуль) перетворює це на реальний
 * маршрут Expo Router. */
export type DataIntegrityLink =
  | { type: 'work'; workId: string }
  | { type: 'session'; sessionId: string }
  | { type: 'shelf'; shelfId: string }
  | { type: 'series'; seriesId: string }
  | null;

export interface DataIntegrityIssue {
  category: DataIntegrityCategory;
  /** Машинний код перевірки — стабільний ідентифікатор для тестів/можливого групування в UI,
   * не показується користувачу напряму. */
  code: string;
  /** Людське повідомлення українською (п.54 ТЗ) — досить конкретне, щоб зрозуміти проблему
   * без читання коду (містить id сутності, де це доречно). */
  message: string;
  link: DataIntegrityLink;
}

export interface DataIntegrityReport {
  issues: DataIntegrityIssue[];
  byCategory: Record<DataIntegrityCategory, DataIntegrityIssue[]>;
  hasIssues: boolean;
}

// ---- рядки знімку — лише колонки, що реально потрібні перевіркам нижче (не `SELECT *`,
// на відміну від BackupRepository — тут генеричність не потрібна, перевірки конкретні). ----

export interface UserBookSnapshotRow {
  id: string;
  editionId: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  currentPage: number;
  deletedAt: string | null;
}

export interface EditionSnapshotRow {
  id: string;
  workId: string;
  isbn10: string | null;
  isbn13: string | null;
  pageCount: number | null;
  deletedAt: string | null;
}

export interface WorkSnapshotRow {
  id: string;
  deletedAt: string | null;
}

export interface ReadingSessionSnapshotRow {
  id: string;
  userBookId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  pausedIntervals: string;
}

export interface ReadingProgressSnapshotRow {
  id: string;
  userBookId: string;
  page: number;
}

export interface NoteSnapshotRow {
  id: string;
  userBookId: string;
  sessionId: string | null;
  categoryId: string | null;
}

export interface QuoteSnapshotRow {
  id: string;
  userBookId: string;
  sessionId: string | null;
}

export interface NoteCategorySnapshotRow {
  id: string;
  deletedAt: string | null;
}

export interface ShelfBookSnapshotRow {
  shelfId: string;
  userBookId: string;
}

export interface SeriesEntrySnapshotRow {
  id: string;
  seriesId: string;
  workId: string;
}

export interface DataIntegritySnapshot {
  userBooks: UserBookSnapshotRow[];
  editions: EditionSnapshotRow[];
  works: WorkSnapshotRow[];
  readingSessions: ReadingSessionSnapshotRow[];
  readingProgress: ReadingProgressSnapshotRow[];
  notes: NoteSnapshotRow[];
  quotes: QuoteSnapshotRow[];
  noteCategories: NoteCategorySnapshotRow[];
  shelfBooks: ShelfBookSnapshotRow[];
  seriesIds: string[];
  seriesEntries: SeriesEntrySnapshotRow[];
}

function isValidPausedIntervals(raw: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!Array.isArray(parsed)) return false;
  return parsed.every((item) => {
    if (typeof item !== 'object' || item === null) return false;
    const { start, end } = item as Record<string, unknown>;
    if (typeof start !== 'string' || typeof end !== 'string') return false;
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;
    return endMs >= startMs;
  });
}

/**
 * Головна перевірка (ТЗ Фази 5 — Data Integrity Doctor). Чиста, синхронна, без побічних
 * ефектів — той самий знімок завжди дає той самий звіт.
 */
export function runDataIntegrityCheck(snapshot: DataIntegritySnapshot): DataIntegrityReport {
  const issues: DataIntegrityIssue[] = [];

  const editionById = new Map(snapshot.editions.map((e) => [e.id, e]));
  const workById = new Map(snapshot.works.map((w) => [w.id, w]));
  const userBookById = new Map(snapshot.userBooks.map((ub) => [ub.id, ub]));
  const noteCategoryById = new Map(snapshot.noteCategories.map((c) => [c.id, c]));
  const sessionById = new Map(snapshot.readingSessions.map((s) => [s.id, s]));
  const seriesIdSet = new Set(snapshot.seriesIds);

  function workIdForUserBook(userBookId: string): string | null {
    const userBook = userBookById.get(userBookId);
    if (!userBook) return null;
    return editionById.get(userBook.editionId)?.workId ?? null;
  }

  function workLink(userBookId: string): DataIntegrityLink {
    const workId = workIdForUserBook(userBookId);
    return workId ? { type: 'work', workId } : null;
  }

  function editionForUserBook(userBookId: string): EditionSnapshotRow | undefined {
    const userBook = userBookById.get(userBookId);
    return userBook ? editionById.get(userBook.editionId) : undefined;
  }

  // ---- Книги ----
  const editionGroupsByIsbn = new Map<string, EditionSnapshotRow[]>();
  for (const edition of snapshot.editions) {
    if (edition.deletedAt) continue;
    const key = edition.isbn13 || edition.isbn10;
    if (!key) continue;
    const group = editionGroupsByIsbn.get(key) ?? [];
    group.push(edition);
    editionGroupsByIsbn.set(key, group);
  }
  for (const [isbn, group] of editionGroupsByIsbn) {
    const [firstEdition] = group;
    if (group.length < 2 || !firstEdition) continue;
    issues.push({
      category: 'books',
      code: 'duplicate_isbn_edition',
      message: `${group.length} видання з однаковим ISBN ${isbn}: ${group.map((e) => e.id).join(', ')}.`,
      link: { type: 'work', workId: firstEdition.workId },
    });
  }

  for (const userBook of snapshot.userBooks) {
    if (userBook.deletedAt) continue;

    if (userBook.status === 'finished' && !userBook.finishedAt) {
      issues.push({
        category: 'books',
        code: 'finished_without_finished_at',
        message: `Книга ${userBook.id} має статус "Прочитано", але без дати завершення.`,
        link: workLink(userBook.id),
      });
    }
    if (userBook.status === 'want_to_read' && userBook.startedAt) {
      issues.push({
        category: 'books',
        code: 'want_to_read_with_started_at',
        message: `Книга ${userBook.id} має статус "Хочу прочитати", але вже має дату початку читання.`,
        link: workLink(userBook.id),
      });
    }
    if (userBook.startedAt && userBook.finishedAt && userBook.finishedAt < userBook.startedAt) {
      issues.push({
        category: 'books',
        code: 'finished_before_started',
        message: `Книга ${userBook.id}: дата завершення раніша за дату початку.`,
        link: workLink(userBook.id),
      });
    }

    const edition = editionById.get(userBook.editionId);
    if (edition?.deletedAt) {
      issues.push({
        category: 'books',
        code: 'user_book_references_deleted_edition',
        message: `Книга ${userBook.id} посилається на видалене видання ${edition.id}.`,
        link: workLink(userBook.id),
      });
    }
  }

  // ---- Сесії ----
  for (const session of snapshot.readingSessions) {
    const userBook = userBookById.get(session.userBookId);
    if (!userBook) {
      issues.push({
        category: 'sessions',
        code: 'session_without_valid_book',
        message: `Сесія ${session.id} посилається на неіснуючу книгу ${session.userBookId}.`,
        link: { type: 'session', sessionId: session.id },
      });
    } else if (userBook.deletedAt) {
      issues.push({
        category: 'sessions',
        code: 'session_references_deleted_book',
        message: `Сесія ${session.id} посилається на видалену книгу ${session.userBookId}.`,
        link: { type: 'session', sessionId: session.id },
      });
    }

    if (session.durationSeconds != null && session.durationSeconds < 0) {
      issues.push({
        category: 'sessions',
        code: 'negative_duration',
        message: `Сесія ${session.id} має від'ємну тривалість.`,
        link: { type: 'session', sessionId: session.id },
      });
    }

    if (!isValidPausedIntervals(session.pausedIntervals)) {
      issues.push({
        category: 'sessions',
        code: 'invalid_paused_intervals',
        message: `Сесія ${session.id} має пошкоджені дані про паузи.`,
        link: { type: 'session', sessionId: session.id },
      });
    }
  }

  // ---- Прогрес ----
  for (const progress of snapshot.readingProgress) {
    if (progress.page < 0) {
      issues.push({
        category: 'progress',
        code: 'negative_progress_page',
        message: `Запис прогресу ${progress.id} має від'ємну сторінку.`,
        link: workLink(progress.userBookId),
      });
    }
    const edition = editionForUserBook(progress.userBookId);
    if (edition?.pageCount != null && progress.page > edition.pageCount) {
      issues.push({
        category: 'progress',
        code: 'progress_exceeds_page_count',
        message: `Запис прогресу ${progress.id}: сторінка ${progress.page} перевищує обсяг видання (${edition.pageCount}).`,
        link: workLink(progress.userBookId),
      });
    }
  }
  for (const userBook of snapshot.userBooks) {
    if (userBook.deletedAt) continue;
    if (userBook.currentPage < 0) {
      issues.push({
        category: 'progress',
        code: 'negative_current_page',
        message: `Книга ${userBook.id} має від'ємну поточну сторінку.`,
        link: workLink(userBook.id),
      });
    }
    const edition = editionById.get(userBook.editionId);
    if (edition?.pageCount != null && userBook.currentPage > edition.pageCount) {
      issues.push({
        category: 'progress',
        code: 'current_page_exceeds_page_count',
        message: `Книга ${userBook.id}: поточна сторінка ${userBook.currentPage} перевищує обсяг видання (${edition.pageCount}).`,
        link: workLink(userBook.id),
      });
    }
  }

  // ---- Щоденник ----
  function checkJournalEntry(entry: { id: string; userBookId: string; sessionId: string | null }, kind: 'note' | 'quote') {
    const userBook = userBookById.get(entry.userBookId);
    if (userBook?.deletedAt) {
      issues.push({
        category: 'journal',
        code: `${kind}_references_deleted_book`,
        message: `${kind === 'note' ? 'Нотатка' : 'Цитата'} ${entry.id} посилається на видалену книгу ${entry.userBookId}.`,
        link: workLink(entry.userBookId),
      });
    }
    if (entry.sessionId) {
      const session = sessionById.get(entry.sessionId);
      if (session && session.userBookId !== entry.userBookId) {
        issues.push({
          category: 'journal',
          code: `${kind}_session_mismatch`,
          message: `${kind === 'note' ? 'Нотатка' : 'Цитата'} ${entry.id} посилається на сесію іншої книги.`,
          link: workLink(entry.userBookId),
        });
      }
    }
  }

  for (const note of snapshot.notes) {
    checkJournalEntry(note, 'note');
    if (note.categoryId && !noteCategoryById.get(note.categoryId)) {
      issues.push({
        category: 'journal',
        code: 'note_orphan_category',
        message: `Нотатка ${note.id} посилається на неіснуючу категорію ${note.categoryId}.`,
        link: workLink(note.userBookId),
      });
    } else if (note.categoryId && noteCategoryById.get(note.categoryId)?.deletedAt) {
      issues.push({
        category: 'journal',
        code: 'note_deleted_category',
        message: `Нотатка ${note.id} посилається на видалену категорію ${note.categoryId}.`,
        link: workLink(note.userBookId),
      });
    }
  }
  for (const quote of snapshot.quotes) {
    checkJournalEntry(quote, 'quote');
  }

  // ---- Полиці ----
  for (const shelfBook of snapshot.shelfBooks) {
    const userBook = userBookById.get(shelfBook.userBookId);
    if (!userBook) {
      issues.push({
        category: 'shelves',
        code: 'shelf_book_missing_user_book',
        message: `Полиця ${shelfBook.shelfId} посилається на неіснуючу книгу ${shelfBook.userBookId}.`,
        link: { type: 'shelf', shelfId: shelfBook.shelfId },
      });
    } else if (userBook.deletedAt) {
      issues.push({
        category: 'shelves',
        code: 'shelf_book_deleted_user_book',
        message: `Полиця ${shelfBook.shelfId} посилається на видалену книгу ${shelfBook.userBookId}.`,
        link: { type: 'shelf', shelfId: shelfBook.shelfId },
      });
    }
  }

  // ---- Серії ----
  for (const entry of snapshot.seriesEntries) {
    if (!seriesIdSet.has(entry.seriesId)) {
      issues.push({
        category: 'series',
        code: 'series_entry_missing_series',
        message: `Запис серії ${entry.id} посилається на неіснуючу серію ${entry.seriesId}.`,
        link: null,
      });
      continue;
    }
    const work = workById.get(entry.workId);
    if (!work) {
      issues.push({
        category: 'series',
        code: 'series_entry_missing_work',
        message: `Запис серії ${entry.id} посилається на неіснуючий твір ${entry.workId}.`,
        link: { type: 'series', seriesId: entry.seriesId },
      });
    } else if (work.deletedAt) {
      issues.push({
        category: 'series',
        code: 'series_entry_deleted_work',
        message: `Запис серії ${entry.id} посилається на видалений твір ${entry.workId}.`,
        link: { type: 'series', seriesId: entry.seriesId },
      });
    }
  }

  const byCategory = Object.fromEntries(
    DATA_INTEGRITY_CATEGORIES.map((category) => [category, issues.filter((issue) => issue.category === category)]),
  ) as Record<DataIntegrityCategory, DataIntegrityIssue[]>;

  return { issues, byCategory, hasIssues: issues.length > 0 };
}
