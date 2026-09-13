import {
  runDataIntegrityCheck,
  DATA_INTEGRITY_CATEGORIES,
  type DataIntegritySnapshot,
  type UserBookSnapshotRow,
  type EditionSnapshotRow,
  type ReadingSessionSnapshotRow,
  type ReadingRunSnapshotRow,
} from './dataIntegrityDoctor';

function emptySnapshot(): DataIntegritySnapshot {
  return {
    userBooks: [],
    editions: [],
    works: [],
    readingSessions: [],
    readingProgress: [],
    notes: [],
    quotes: [],
    noteCategories: [],
    shelfBooks: [],
    seriesIds: [],
    seriesEntries: [],
  };
}

function userBook(overrides: Partial<UserBookSnapshotRow> = {}): UserBookSnapshotRow {
  return {
    id: 'ub1',
    editionId: 'ed1',
    status: 'reading',
    startedAt: '2026-08-01T00:00:00.000Z',
    finishedAt: null,
    currentPage: 10,
    deletedAt: null,
    ...overrides,
  };
}

function edition(overrides: Partial<EditionSnapshotRow> = {}): EditionSnapshotRow {
  return { id: 'ed1', workId: 'work1', isbn10: null, isbn13: '9789660395008', pageCount: 300, deletedAt: null, ...overrides };
}

function session(overrides: Partial<ReadingSessionSnapshotRow> = {}): ReadingSessionSnapshotRow {
  return {
    id: 'session1',
    userBookId: 'ub1',
    startedAt: '2026-08-01T10:00:00.000Z',
    endedAt: '2026-08-01T10:30:00.000Z',
    durationSeconds: 1800,
    pausedIntervals: '[]',
    // REREADING DATA DOCTOR (Фаза 26) — непорожній за замовчуванням (не `null`): решта тестів
    // у цьому файлі (написаних ДО Фази 26) не мають викликати новий `session_without_run`
    // просто через те, що не задають це поле явно. Значення навмисно НЕ відповідає жодному
    // run у `readingRuns` більшості тестів — `run_session_mismatch` перевіряє лише коли run
    // РЕАЛЬНО знайдений у знімку (`if (run && ...)`), тож "висячий" id тут безпечний no-op.
    readingRunId: 'run1',
    ...overrides,
  };
}

describe('runDataIntegrityCheck', () => {
  it('чиста, узгоджена БД — жодної проблеми, усі 6 категорій присутні в byCategory порожніми', () => {
    const snapshot = emptySnapshot();
    snapshot.userBooks = [userBook()];
    snapshot.editions = [edition()];
    snapshot.works = [{ id: 'work1', deletedAt: null }];
    snapshot.readingSessions = [session()];

    const report = runDataIntegrityCheck(snapshot);

    expect(report.hasIssues).toBe(false);
    expect(report.issues).toEqual([]);
    expect(Object.keys(report.byCategory).sort()).toEqual([...DATA_INTEGRITY_CATEGORIES].sort());
    for (const category of DATA_INTEGRITY_CATEGORIES) {
      expect(report.byCategory[category]).toEqual([]);
    }
  });

  describe('книги', () => {
    it('дублікат ISBN серед двох (не видалених) видань', () => {
      const snapshot = emptySnapshot();
      snapshot.editions = [
        edition({ id: 'ed1', isbn13: '9789660395008' }),
        edition({ id: 'ed2', isbn13: '9789660395008' }),
      ];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books).toHaveLength(1);
      expect(report.byCategory.books[0]?.code).toBe('duplicate_isbn_edition');
    });

    it('видалене видання з тим самим ISBN НЕ рахується дублікатом', () => {
      const snapshot = emptySnapshot();
      snapshot.editions = [
        edition({ id: 'ed1', isbn13: '9789660395008' }),
        edition({ id: 'ed2', isbn13: '9789660395008', deletedAt: '2026-01-01T00:00:00.000Z' }),
      ];
      expect(runDataIntegrityCheck(snapshot).byCategory.books).toEqual([]);
    });

    it('видання без ISBN не порівнюються між собою (null не вважається "тим самим")', () => {
      const snapshot = emptySnapshot();
      snapshot.editions = [edition({ id: 'ed1', isbn13: null }), edition({ id: 'ed2', isbn13: null })];
      expect(runDataIntegrityCheck(snapshot).byCategory.books).toEqual([]);
    });

    it('статус "Прочитано" без finishedAt — неможливий стан завершення', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ status: 'finished', finishedAt: null })];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books.map((i) => i.code)).toContain('finished_without_finished_at');
    });

    it('статус "Хочу прочитати" зі startedAt — суперечність', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ status: 'want_to_read', startedAt: '2026-08-01T00:00:00.000Z' })];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books.map((i) => i.code)).toContain('want_to_read_with_started_at');
    });

    it('дата завершення раніша за дату початку', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [
        userBook({ startedAt: '2026-08-10T00:00:00.000Z', finishedAt: '2026-08-01T00:00:00.000Z' }),
      ];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books.map((i) => i.code)).toContain('finished_before_started');
    });

    // POLYTSIA V1.6.1, Фаза 1 — Data Doctor check для P0-дефекту з
    // `docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 13 (успадкований стан з ДО фіксу
    // `UserBookRepository.updateStatus`).
    it('статус "Не дочитав" з досі встановленим finishedAt — успадкована неузгодженість', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ status: 'did_not_finish', finishedAt: '2026-08-01T00:00:00.000Z' })];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books.map((i) => i.code)).toContain('dnf_with_finished_at');
    });

    it('статус "Не дочитав" БЕЗ finishedAt (звичайний, коректний шлях після фіксу) — без проблем', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ status: 'did_not_finish', finishedAt: null })];
      expect(runDataIntegrityCheck(snapshot).byCategory.books).toEqual([]);
    });

    it('книга посилається на видалене видання', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ editionId: 'ed1' })];
      snapshot.editions = [edition({ id: 'ed1', deletedAt: '2026-01-01T00:00:00.000Z' })];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books.map((i) => i.code)).toContain('user_book_references_deleted_edition');
    });

    it('видалена (м\'яко) книга не перевіряється взагалі — уникає шуму від уже прибраних записів', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ status: 'finished', finishedAt: null, deletedAt: '2026-01-01T00:00:00.000Z' })];
      expect(runDataIntegrityCheck(snapshot).byCategory.books).toEqual([]);
    });
  });

  describe('сесії', () => {
    it('сесія без відповідної книги', () => {
      const snapshot = emptySnapshot();
      snapshot.readingSessions = [session({ userBookId: 'does-not-exist' })];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.sessions.map((i) => i.code)).toContain('session_without_valid_book');
    });

    it('сесія посилається на видалену книгу', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ deletedAt: '2026-01-01T00:00:00.000Z' })];
      snapshot.readingSessions = [session()];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.sessions.map((i) => i.code)).toContain('session_references_deleted_book');
    });

    it("від'ємна тривалість сесії", () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.readingSessions = [session({ durationSeconds: -100 })];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.sessions.map((i) => i.code)).toContain('negative_duration');
    });

    it('пошкоджений JSON у paused_intervals', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.readingSessions = [session({ pausedIntervals: '{not valid json' })];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.sessions.map((i) => i.code)).toContain('invalid_paused_intervals');
    });

    it('paused_intervals — не масив', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.readingSessions = [session({ pausedIntervals: '{"start":"a","end":"b"}' })];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.sessions.map((i) => i.code)).toContain('invalid_paused_intervals');
    });

    it('paused_intervals — end раніший за start', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.readingSessions = [
        session({
          pausedIntervals: JSON.stringify([
            { start: '2026-08-01T10:20:00.000Z', end: '2026-08-01T10:10:00.000Z' },
          ]),
        }),
      ];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.sessions.map((i) => i.code)).toContain('invalid_paused_intervals');
    });

    it('коректний paused_intervals — без проблем', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.readingSessions = [
        session({
          pausedIntervals: JSON.stringify([
            { start: '2026-08-01T10:05:00.000Z', end: '2026-08-01T10:10:00.000Z' },
          ]),
        }),
      ];
      expect(runDataIntegrityCheck(snapshot).byCategory.sessions).toEqual([]);
    });
  });

  describe('прогрес', () => {
    it("від'ємна сторінка в записі прогресу", () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.editions = [edition()];
      snapshot.readingProgress = [{ id: 'p1', userBookId: 'ub1', page: -5 }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.progress.map((i) => i.code)).toContain('negative_progress_page');
    });

    it('сторінка прогресу перевищує обсяг видання', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.editions = [edition({ pageCount: 100 })];
      snapshot.readingProgress = [{ id: 'p1', userBookId: 'ub1', page: 150 }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.progress.map((i) => i.code)).toContain('progress_exceeds_page_count');
    });

    it('page_count невідомий (null) — перевищення не перевіряється (немає з чим порівнювати)', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.editions = [edition({ pageCount: null })];
      snapshot.readingProgress = [{ id: 'p1', userBookId: 'ub1', page: 999999 }];
      expect(runDataIntegrityCheck(snapshot).byCategory.progress).toEqual([]);
    });

    it("книга з від'ємною поточною сторінкою", () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ currentPage: -1 })];
      snapshot.editions = [edition()];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.progress.map((i) => i.code)).toContain('negative_current_page');
    });

    it('поточна сторінка книги перевищує обсяг видання', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ currentPage: 500 })];
      snapshot.editions = [edition({ pageCount: 300 })];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.progress.map((i) => i.code)).toContain('current_page_exceeds_page_count');
    });
  });

  describe('щоденник', () => {
    it('нотатка посилається на неіснуючу категорію', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.notes = [{ id: 'n1', userBookId: 'ub1', sessionId: null, categoryId: 'does-not-exist' }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.journal.map((i) => i.code)).toContain('note_orphan_category');
    });

    it('нотатка посилається на видалену категорію', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.noteCategories = [{ id: 'cat1', deletedAt: '2026-01-01T00:00:00.000Z' }];
      snapshot.notes = [{ id: 'n1', userBookId: 'ub1', sessionId: null, categoryId: 'cat1' }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.journal.map((i) => i.code)).toContain('note_deleted_category');
    });

    it('нотатка з сесією, що належить ІНШІЙ книзі', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ id: 'ub1' }), userBook({ id: 'ub2', editionId: 'ed2' })];
      snapshot.readingSessions = [session({ id: 'session1', userBookId: 'ub2' })];
      snapshot.notes = [{ id: 'n1', userBookId: 'ub1', sessionId: 'session1', categoryId: null }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.journal.map((i) => i.code)).toContain('note_session_mismatch');
    });

    it('цитата з сесією, що належить ІНШІЙ книзі', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ id: 'ub1' }), userBook({ id: 'ub2', editionId: 'ed2' })];
      snapshot.readingSessions = [session({ id: 'session1', userBookId: 'ub2' })];
      snapshot.quotes = [{ id: 'q1', userBookId: 'ub1', sessionId: 'session1' }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.journal.map((i) => i.code)).toContain('quote_session_mismatch');
    });

    it('нотатка/цитата посилаються на видалену книгу', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ deletedAt: '2026-01-01T00:00:00.000Z' })];
      snapshot.notes = [{ id: 'n1', userBookId: 'ub1', sessionId: null, categoryId: null }];
      snapshot.quotes = [{ id: 'q1', userBookId: 'ub1', sessionId: null }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.journal.map((i) => i.code).sort()).toEqual([
        'note_references_deleted_book',
        'quote_references_deleted_book',
      ]);
    });
  });

  describe('полиці', () => {
    it('shelf_book посилається на неіснуючу книгу', () => {
      const snapshot = emptySnapshot();
      snapshot.shelfBooks = [{ shelfId: 'shelf1', userBookId: 'does-not-exist' }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.shelves.map((i) => i.code)).toContain('shelf_book_missing_user_book');
    });

    it('shelf_book посилається на видалену книгу', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ deletedAt: '2026-01-01T00:00:00.000Z' })];
      snapshot.shelfBooks = [{ shelfId: 'shelf1', userBookId: 'ub1' }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.shelves.map((i) => i.code)).toContain('shelf_book_deleted_user_book');
    });
  });

  describe('серії', () => {
    it('запис серії посилається на неіснуючу серію', () => {
      const snapshot = emptySnapshot();
      snapshot.seriesIds = [];
      snapshot.seriesEntries = [{ id: 'se1', seriesId: 'does-not-exist', workId: 'work1' }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.series.map((i) => i.code)).toContain('series_entry_missing_series');
    });

    it('запис серії посилається на неіснуючий твір', () => {
      const snapshot = emptySnapshot();
      snapshot.seriesIds = ['series1'];
      snapshot.seriesEntries = [{ id: 'se1', seriesId: 'series1', workId: 'does-not-exist' }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.series.map((i) => i.code)).toContain('series_entry_missing_work');
    });

    it('запис серії посилається на видалений твір', () => {
      const snapshot = emptySnapshot();
      snapshot.seriesIds = ['series1'];
      snapshot.works = [{ id: 'work1', deletedAt: '2026-01-01T00:00:00.000Z' }];
      snapshot.seriesEntries = [{ id: 'se1', seriesId: 'series1', workId: 'work1' }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.series.map((i) => i.code)).toContain('series_entry_deleted_work');
    });
  });

  // POLYTSIA V1.6, Фаза 4 («Капсула книги»).
  describe('капсули книги', () => {
    it('капсула посилається на видалену книгу', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ deletedAt: '2026-01-01T00:00:00.000Z' })];
      snapshot.bookCapsules = [{ id: 'cap1', userBookId: 'ub1', journalEntryId: null }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books.map((i) => i.code)).toContain('capsule_references_deleted_book');
    });

    it('капсула посилається на неіснуючий запис щоденника', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.bookCapsules = [{ id: 'cap1', userBookId: 'ub1', journalEntryId: 'does-not-exist' }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.journal.map((i) => i.code)).toContain('capsule_orphan_journal_entry');
    });

    it('капсула посилається на існуючу нотатку — жодної проблеми', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.notes = [{ id: 'note1', userBookId: 'ub1', sessionId: null, categoryId: null }];
      snapshot.bookCapsules = [{ id: 'cap1', userBookId: 'ub1', journalEntryId: 'note1' }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.hasIssues).toBe(false);
    });

    it('капсула без journalEntryId і на непошкоджену книгу — жодної проблеми', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.bookCapsules = [{ id: 'cap1', userBookId: 'ub1', journalEntryId: null }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.hasIssues).toBe(false);
    });
  });

  // REREADING DATA DOCTOR (POLYTSIA V1.6.1, Фаза 26, `docs/SOFT_DELETE_READINESS.md`).
  describe('прочитання (ReadingRun)', () => {
    function run(overrides: Partial<ReadingRunSnapshotRow> = {}): ReadingRunSnapshotRow {
      return {
        id: 'run1',
        userBookId: 'ub1',
        runNumber: 1,
        status: 'finished' as const,
        startedAt: '2026-08-01T00:00:00.000Z',
        finishedAt: '2026-08-02T00:00:00.000Z',
        deletedAt: null,
        ...overrides,
      };
    }

    it('повністю узгоджена книга з одним завершеним run — жодної проблеми', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ status: 'finished', finishedAt: '2026-08-02T00:00:00.000Z' })];
      snapshot.readingRuns = [run()];
      snapshot.readingSessions = [session({ readingRunId: 'run1' })];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.hasIssues).toBe(false);
    });

    it('сесія без прив’язки до жодного run (readingRunId: null)', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.readingSessions = [session({ readingRunId: null })];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.sessions.map((i) => i.code)).toContain('session_without_run');
    });

    it('сесія посилається на run ІНШОЇ книги (run/session mismatch)', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [
        userBook({ id: 'ub1', status: 'finished', finishedAt: '2026-08-02T00:00:00.000Z' }),
        userBook({ id: 'ub2', editionId: 'ed2' }),
      ];
      snapshot.readingRuns = [run({ id: 'run1', userBookId: 'ub1' })];
      snapshot.readingSessions = [session({ userBookId: 'ub2', readingRunId: 'run1' })];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.sessions.map((i) => i.code)).toContain('run_session_mismatch');
    });

    it('дві одночасно активні (in_progress) run для однієї книги', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ status: 'reading' })];
      snapshot.readingRuns = [
        run({ id: 'run1', runNumber: 1, status: 'in_progress', finishedAt: null }),
        run({ id: 'run2', runNumber: 2, status: 'in_progress', finishedAt: null }),
      ];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books.map((i) => i.code)).toContain('multiple_active_runs');
    });

    it('одна активна run — жодної проблеми multiple_active_runs', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ status: 'reading' })];
      snapshot.readingRuns = [run({ status: 'in_progress', finishedAt: null })];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books.map((i) => i.code)).not.toContain('multiple_active_runs');
    });

    it('м’яко скасовані (discard) run НЕ рахуються при пошуку дублікатів активних', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ status: 'reading' })];
      snapshot.readingRuns = [
        run({ id: 'run1', runNumber: 1, status: 'in_progress', finishedAt: null }),
        run({ id: 'run2', runNumber: 2, status: 'in_progress', finishedAt: null, deletedAt: '2026-08-03T00:00:00.000Z' }),
      ];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books.map((i) => i.code)).not.toContain('multiple_active_runs');
    });

    it('run зі статусом finished/did_not_finish, але без finishedAt', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ status: 'did_not_finish' })];
      snapshot.readingRuns = [run({ status: 'did_not_finish', finishedAt: null })];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books.map((i) => i.code)).toContain('run_finished_without_finished_at');
    });

    it('невалідна послідовність — пізніший run_number розпочався раніше за попередній', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ status: 'finished', finishedAt: '2026-08-11T00:00:00.000Z' })];
      snapshot.readingRuns = [
        run({ id: 'run1', runNumber: 1, startedAt: '2026-08-10T00:00:00.000Z', finishedAt: '2026-08-11T00:00:00.000Z' }),
        run({ id: 'run2', runNumber: 2, startedAt: '2026-08-05T00:00:00.000Z', finishedAt: '2026-08-06T00:00:00.000Z' }),
      ];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books.map((i) => i.code)).toContain('run_invalid_sequence');
    });

    it('run_number зростає РАЗОМ із started_at — жодної проблеми послідовності', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ status: 'finished', finishedAt: '2026-08-11T00:00:00.000Z' })];
      snapshot.readingRuns = [
        run({ id: 'run1', runNumber: 1, startedAt: '2026-08-01T00:00:00.000Z', finishedAt: '2026-08-02T00:00:00.000Z' }),
        run({ id: 'run2', runNumber: 2, startedAt: '2026-08-10T00:00:00.000Z', finishedAt: '2026-08-11T00:00:00.000Z' }),
      ];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books.map((i) => i.code)).not.toContain('run_invalid_sequence');
    });

    it('застаріла суперечність — найновіший run ще in_progress, але книга вже "фінішована"', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ status: 'finished', finishedAt: '2026-08-02T00:00:00.000Z' })];
      snapshot.readingRuns = [run({ status: 'in_progress', finishedAt: null })];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books.map((i) => i.code)).toContain('legacy_contradictory_status');
    });

    it('застаріла суперечність — найновіший run уже завершений, але книга досі "читається"', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook({ status: 'reading' })];
      snapshot.readingRuns = [run({ status: 'finished' })];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books.map((i) => i.code)).toContain('legacy_contradictory_status');
    });

    it('капсула/спогад/"До"/DNF-знімок посилаються на неіснуючий run', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.bookCapsules = [{ id: 'cap1', userBookId: 'ub1', journalEntryId: null, readingRunId: 'does-not-exist', deletedAt: null }];
      snapshot.bookMemories = [{ id: 'mem1', userBookId: 'ub1', readingRunId: 'does-not-exist', deletedAt: null }];
      snapshot.preReadingReflections = [{ id: 'pre1', userBookId: 'ub1', readingRunId: 'does-not-exist' }];
      snapshot.dnfReflections = [{ id: 'dnf1', userBookId: 'ub1', readingRunId: 'does-not-exist' }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books.map((i) => i.code).sort()).toEqual([
        'capsule_references_invalid_run',
        'dnf_reflection_references_invalid_run',
        'memory_references_invalid_run',
        'pre_reading_reflection_references_invalid_run',
      ]);
    });

    it('капсула/спогад посилаються на М\'ЯКО ВИДАЛЕНИЙ (discard) run — теж "невалідний"', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.readingRuns = [run({ deletedAt: '2026-08-03T00:00:00.000Z' })];
      snapshot.bookCapsules = [{ id: 'cap1', userBookId: 'ub1', journalEntryId: null, readingRunId: 'run1', deletedAt: null }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books.map((i) => i.code)).toContain('capsule_references_invalid_run');
    });

    it('М\'ЯКО ВИДАЛЕНА сама капсула — посилання на невалідний run НЕ репортується (сенсу нема, запис і так видалений)', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.bookCapsules = [
        { id: 'cap1', userBookId: 'ub1', journalEntryId: null, readingRunId: 'does-not-exist', deletedAt: '2026-08-03T00:00:00.000Z' },
      ];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.byCategory.books.map((i) => i.code)).not.toContain('capsule_references_invalid_run');
    });

    it('капсула/спогад/"До"/DNF-знімок без readingRunId (книжковий фолбек, Фази 8-11) — жодної проблеми', () => {
      const snapshot = emptySnapshot();
      snapshot.userBooks = [userBook()];
      snapshot.bookCapsules = [{ id: 'cap1', userBookId: 'ub1', journalEntryId: null, readingRunId: null, deletedAt: null }];
      snapshot.bookMemories = [{ id: 'mem1', userBookId: 'ub1', readingRunId: null, deletedAt: null }];
      const report = runDataIntegrityCheck(snapshot);
      expect(report.hasIssues).toBe(false);
    });
  });
});
