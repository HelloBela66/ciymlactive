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
  /** SOFT-DELETE READINESS / REREADING DATA DOCTOR (POLYTSIA V1.6.1, Фаза 26) — до якого
   * `reading_run` належить ця сесія (`ReadingSessionRepository.start`, REREADING MODEL Фаза 7:
   * нова сесія ЗАВЖДИ отримує run). `null` — легітимно лише для сесій, записаних ДО Фази 7
   * (backfill `020_reading_run_backfill.ts` міг не знайти відповідного run для кожної старої
   * сесії) — саме такі й ловить `session_without_run` нижче. */
  readingRunId: string | null;
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

/** POLYTSIA V1.6, Фаза 4 («Капсула книги») — лише колонки, потрібні перевіркам нижче
 * (`012_book_capsule.ts`). `journalEntryId` без `journalEntryKind` тут не розрізняється (обидва
 * `null` або обидва задані за конструкцією репозиторія) — досить самого id для перевірки
 * існування. */
export interface BookCapsuleSnapshotRow {
  id: string;
  userBookId: string;
  journalEntryId: string | null;
  /** REREADING DATA DOCTOR (Фаза 26) — необов'язкове, за замовчуванням `null` нижче (та сама
   * причина, що й у `DataIntegritySnapshot.bookCapsules?` — старі тестові фікстури Фази 4-5,
   * написані ДО прив'язки капсул до run (Фаза 10), лишаються валідними без змін). */
  readingRunId?: string | null;
  /** Те саме — `undefined`/`null` трактується як "не видалено" нижче (капсула отримала
   * `deleted_at` лише в Фазі 26, `027_soft_delete_readiness.ts`). */
  deletedAt?: string | null;
}

/** REREADING DATA DOCTOR (POLYTSIA V1.6.1, Фаза 26) — той самий рівень деталізації, що й
 * `BookCapsuleSnapshotRow` вище: `book_memory` не отримало соло-перевірки в жодній попередній
 * фазі Data Doctor, лише тепер, разом із самим ReadingRun. */
export interface BookMemorySnapshotRow {
  id: string;
  userBookId: string;
  readingRunId: string | null;
  deletedAt: string | null;
}

/** «До» (Фаза 9) і «Не дочитав»-знімок (Фаза 11) — обидва без `deleted_at` (лишаються жорстко
 * видалюваними, Фаза 26 їх не чіпає, `docs/SOFT_DELETE_READINESS.md`), тож для обох досить
 * самого посилання на run — рядок, що дійшов до знімку, за визначенням ще існує. */
export interface PreReadingReflectionSnapshotRow {
  id: string;
  userBookId: string;
  readingRunId: string | null;
}

export interface DnfReflectionSnapshotRow {
  id: string;
  userBookId: string;
  readingRunId: string | null;
}

/** REREADING MODEL / DATA DOCTOR (POLYTSIA V1.6.1, Фаза 26) — `019_reading_run.ts`. Той самий
 * рівень деталізації, що й `UserBookSnapshotRow` — лише колонки, реально потрібні перевіркам
 * нижче (`status`/`startedAt`/`finishedAt`/`deletedAt` для узгодженості власного стану run, не
 * `isLegacyBackfill`/`createdAt`/`updatedAt`, яких жодна перевірка не потребує). */
export interface ReadingRunSnapshotRow {
  id: string;
  userBookId: string;
  runNumber: number;
  status: 'in_progress' | 'finished' | 'did_not_finish';
  startedAt: string;
  finishedAt: string | null;
  deletedAt: string | null;
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
  // POLYTSIA V1.6, Фаза 4 — необов'язкове поле (не всі виклики snapshot зобов'язані його
  // передавати; існуючі фікстури тестів Фази 5, написані ДО цієї фази, лишаються валідними
  // без змін, `bookCapsules` за замовчуванням трактується як порожній список нижче).
  bookCapsules?: BookCapsuleSnapshotRow[];
  // REREADING DATA DOCTOR (POLYTSIA V1.6.1, Фаза 26) — усі чотири необов'язкові тим самим
  // способом і з тією самою причиною, що й `bookCapsules` вище: фікстури репозиторних тестів
  // цього самого файлу, написані до цієї фази, не зобов'язані знати про ReadingRun узагалі.
  readingRuns?: ReadingRunSnapshotRow[];
  bookMemories?: BookMemorySnapshotRow[];
  preReadingReflections?: PreReadingReflectionSnapshotRow[];
  dnfReflections?: DnfReflectionSnapshotRow[];
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
    // POLYTSIA V1.6.1, Фаза 1 — успадкована неузгодженість, можлива в даних, створених ДО
    // фіксу `UserBookRepository.updateStatus` (див. коментар там): якщо книга зараз "Не
    // дочитав", але `finished_at` досі стоїть з попереднього переходу в "Прочитано" — Activity
    // History/On This Day показуватимуть хибну подію "книгу завершено" для цієї книги. Новий
    // код більше не створює такий стан, але записи, збережені до фіксу, могли лишитись саме
    // такими — ця перевірка лише знаходить їх (без destructive auto-fix, той самий принцип, що
    // й решта цього модуля).
    if (userBook.status === 'did_not_finish' && userBook.finishedAt) {
      issues.push({
        category: 'books',
        code: 'dnf_with_finished_at',
        message: `Книга ${userBook.id} має статус "Не дочитав", але досі позначена датою завершення — історія читання може хибно показувати "завершено".`,
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

  // ---- Капсули книги (POLYTSIA V1.6, Фаза 4) ----
  const noteIdSet = new Set(snapshot.notes.map((n) => n.id));
  const quoteIdSet = new Set(snapshot.quotes.map((q) => q.id));
  for (const capsule of snapshot.bookCapsules ?? []) {
    const userBook = userBookById.get(capsule.userBookId);
    if (userBook?.deletedAt) {
      issues.push({
        category: 'books',
        code: 'capsule_references_deleted_book',
        message: `Капсула ${capsule.id} посилається на видалену книгу ${capsule.userBookId}.`,
        link: workLink(capsule.userBookId),
      });
    }
    if (capsule.journalEntryId && !noteIdSet.has(capsule.journalEntryId) && !quoteIdSet.has(capsule.journalEntryId)) {
      issues.push({
        category: 'journal',
        code: 'capsule_orphan_journal_entry',
        message: `Капсула ${capsule.id} посилається на неіснуючий запис щоденника ${capsule.journalEntryId}.`,
        link: workLink(capsule.userBookId),
      });
    }
  }

  // ---- Прочитання (REREADING DATA DOCTOR — POLYTSIA V1.6.1, Фаза 26) ----
  // Категорії свідомо НЕ нові ('books'/'sessions', ті самі 6, що ТЗ Фази 5 зафіксувало як
  // вичерпний список) — той самий вибір, що й для капсул вище (Фаза 4): нова сутність
  // інтегрується в наявну структуру звіту/UI (`app/data-doctor.tsx` ітерує фіксований
  // `DATA_INTEGRITY_CATEGORIES` і мапить кожну на `DataIntegrityLink`, якого для "run" own
  // немає) замість заводити нову категорію/тип посилання заради однієї фази.
  const readingRuns = snapshot.readingRuns ?? [];
  const liveRunById = new Map(readingRuns.filter((r) => !r.deletedAt).map((r) => [r.id, r]));
  const runsByUserBook = new Map<string, ReadingRunSnapshotRow[]>();
  for (const run of readingRuns) {
    if (run.deletedAt) continue;
    const list = runsByUserBook.get(run.userBookId) ?? [];
    list.push(run);
    runsByUserBook.set(run.userBookId, list);
  }

  // Сесія без прив'язки до жодного run — легітимно лише для сесій, записаних ДО REREADING
  // MODEL Фаза 7 (докладніше — коментар над `ReadingSessionSnapshotRow.readingRunId`).
  for (const session of snapshot.readingSessions) {
    if (session.readingRunId !== null) continue;
    issues.push({
      category: 'sessions',
      code: 'session_without_run',
      message: `Сесія ${session.id} не прив'язана до жодного прочитання (reading run) — ймовірно, застарілий запис до Фази 6b/7.`,
      link: { type: 'session', sessionId: session.id },
    });
  }

  // Сесія посилається на run іншої книги — той самий клас перевірки, що вже є для note/quote
  // проти сесії (`*_session_mismatch` вище), тепер симетрично для самого run.
  for (const session of snapshot.readingSessions) {
    if (!session.readingRunId) continue;
    const run = liveRunById.get(session.readingRunId);
    if (run && run.userBookId !== session.userBookId) {
      issues.push({
        category: 'sessions',
        code: 'run_session_mismatch',
        message: `Сесія ${session.id} посилається на прочитання (${session.readingRunId}) іншої книги.`,
        link: { type: 'session', sessionId: session.id },
      });
    }
  }

  for (const [userBookId, runs] of runsByUserBook) {
    const userBook = userBookById.get(userBookId);
    if (userBook?.deletedAt) continue;

    // Кілька одночасно "активних" (`in_progress`) run на одну книгу — `019_reading_run.ts`
    // (п.4) свідомо НЕ забороняє це на рівні схеми (UNIQUE), "активний" визначається запитом
    // (найновіший за run_number), а не констрейнтом — тож це можливий, хоч і аномальний, стан
    // даних, а не гарантовано неможливий.
    const activeRuns = runs.filter((r) => r.status === 'in_progress');
    if (activeRuns.length > 1) {
      issues.push({
        category: 'books',
        code: 'multiple_active_runs',
        message: `Книга ${userBookId} має ${activeRuns.length} одночасно активних прочитань: ${activeRuns.map((r) => r.id).join(', ')}.`,
        link: workLink(userBookId),
      });
    }

    // Завершений run без finishedAt — той самий дисбаланс, що `finished_without_finished_at`
    // перевіряє для user_book, тепер симетрично для самого run.
    for (const run of runs) {
      if ((run.status === 'finished' || run.status === 'did_not_finish') && !run.finishedAt) {
        issues.push({
          category: 'books',
          code: 'run_finished_without_finished_at',
          message: `Прочитання ${run.id} книги ${userBookId} має статус "${run.status}", але без дати завершення.`,
          link: workLink(userBookId),
        });
      }
    }

    // Послідовність run_number має відповідати реальній хронології (started_at): пізніше
    // прочитання не може розпочатись РАНІШЕ за попереднє — інакше номери й реальний порядок
    // подій розходяться (typo в backfilled даті, ручне редагування заднім числом тощо).
    const bySequence = [...runs].sort((a, b) => a.runNumber - b.runNumber);
    for (let i = 1; i < bySequence.length; i += 1) {
      const prev = bySequence[i - 1];
      const next = bySequence[i];
      if (prev && next && next.startedAt < prev.startedAt) {
        issues.push({
          category: 'books',
          code: 'run_invalid_sequence',
          message: `Книга ${userBookId}: прочитання №${next.runNumber} (${next.id}) розпочалось раніше за прочитання №${prev.runNumber} (${prev.id}).`,
          link: workLink(userBookId),
        });
      }
    }

    // Суперечність між найновішим run книги й `user_book.status`. Коментар історично називав це
    // "застарілим" станом, можливим лише в даних ДО Фази 7 (`UserBookRepository.updateStatus`) —
    // це виявилось НЕ так: до P0 FIX (POLYTSIA V1.6.2, Фаза 1) `ReadingSessionRepository.start()`
    // (єдиний шлях кнопки "Почати читання") створювала run, узагалі не чіпаючи статус, тож саме
    // цей стан міг виникати й у щойно записаних даних. Після Фази 1 нові дані більше не мали б
    // породжувати цю суперечність — перевірка лишається як safety net (старі дані до фікса,
    // ручне редагування БД, майбутні шляхи запису, що можуть обійти `start()`/`updateStatus`).
    const latestRun = bySequence[bySequence.length - 1];
    if (userBook && latestRun) {
      const bookIsReading = userBook.status === 'reading' || userBook.status === 'rereading';
      const bookIsDone = userBook.status === 'finished' || userBook.status === 'did_not_finish';
      if (latestRun.status === 'in_progress' && bookIsDone) {
        issues.push({
          category: 'books',
          code: 'legacy_contradictory_status',
          message: `Книга ${userBookId}: найновіше прочитання (${latestRun.id}) досі активне, але сама книга вже позначена як "${userBook.status}".`,
          link: workLink(userBookId),
        });
      } else if ((latestRun.status === 'finished' || latestRun.status === 'did_not_finish') && bookIsReading) {
        issues.push({
          category: 'books',
          code: 'legacy_contradictory_status',
          message: `Книга ${userBookId}: найновіше прочитання (${latestRun.id}) уже завершене ("${latestRun.status}"), але книга досі позначена як "${userBook.status}".`,
          link: workLink(userBookId),
        });
      }
    }
  }

  // Капсула/спогад/знімок "До"/DNF-знімок, що посилається на НЕІСНУЮЧИЙ або м'яко видалений
  // run — та сама перевірка (посилання на "невалідну" ціль), що вже є для видаленого user_book/
  // edition/note-категорії, тепер поширена на ReadingRun. Пропускаємо, коли сама дитяча
  // сутність уже м'яко видалена (capsule/memory) — той самий принцип, що й `if
  // (userBook.deletedAt) continue;` на початку файлу: немає сенсу репортувати посилання
  // видаленого запису.
  for (const capsule of snapshot.bookCapsules ?? []) {
    if (capsule.deletedAt) continue;
    const readingRunId = capsule.readingRunId ?? null;
    if (readingRunId && !liveRunById.has(readingRunId)) {
      issues.push({
        category: 'books',
        code: 'capsule_references_invalid_run',
        message: `Капсула ${capsule.id} посилається на неіснуюче або скасоване прочитання ${readingRunId}.`,
        link: workLink(capsule.userBookId),
      });
    }
  }
  for (const memory of snapshot.bookMemories ?? []) {
    if (memory.deletedAt) continue;
    if (memory.readingRunId && !liveRunById.has(memory.readingRunId)) {
      issues.push({
        category: 'books',
        code: 'memory_references_invalid_run',
        message: `Спогад ${memory.id} посилається на неіснуюче або скасоване прочитання ${memory.readingRunId}.`,
        link: workLink(memory.userBookId),
      });
    }
  }
  for (const reflection of snapshot.preReadingReflections ?? []) {
    if (reflection.readingRunId && !liveRunById.has(reflection.readingRunId)) {
      issues.push({
        category: 'books',
        code: 'pre_reading_reflection_references_invalid_run',
        message: `Нотатка "До" ${reflection.id} посилається на неіснуюче або скасоване прочитання ${reflection.readingRunId}.`,
        link: workLink(reflection.userBookId),
      });
    }
  }
  for (const reflection of snapshot.dnfReflections ?? []) {
    if (reflection.readingRunId && !liveRunById.has(reflection.readingRunId)) {
      issues.push({
        category: 'books',
        code: 'dnf_reflection_references_invalid_run',
        message: `DNF-знімок ${reflection.id} посилається на неіснуюче або скасоване прочитання ${reflection.readingRunId}.`,
        link: workLink(reflection.userBookId),
      });
    }
  }

  const byCategory = Object.fromEntries(
    DATA_INTEGRITY_CATEGORIES.map((category) => [category, issues.filter((issue) => issue.category === category)]),
  ) as Record<DataIntegrityCategory, DataIntegrityIssue[]>;

  return { issues, byCategory, hasIssues: issues.length > 0 };
}
