import {
  runDataIntegrityCheck,
  DATA_INTEGRITY_CATEGORIES,
  type DataIntegritySnapshot,
  type UserBookSnapshotRow,
  type EditionSnapshotRow,
  type ReadingSessionSnapshotRow,
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
});
