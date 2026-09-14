import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { ActivityHistoryRepository } from './ActivityHistoryRepository';

/**
 * Repository-інтеграційний тест для `ActivityHistoryRepository.listRecent` (POLYTSIA V1.5,
 * Фаза 12 — READING ACTIVITY HISTORY). Проти реальної SQLite (`openTestDatabase()`, та сама
 * інфраструктура, що й `JournalRepository.test.ts`), не мок — головний ризик тут саме сам
 * `UNION ALL` SQL (усі гілки мають однакову кількість/порядок стовпців, спільне сортування й
 * `LIMIT` застосовуються ПІСЛЯ об'єднання, а не по кожному джерелу окремо), не мапінг рядків.
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

// Дев'ять моментів часу — по одному на кожну подію нижче, суворо зростаючі, щоб однозначно
// перевірити сортування `occurred_at DESC` і межу `LIMIT`.
const ADDED_1 = '2026-01-01T10:00:00.000Z'; // book-1: book_added
const ADDED_2 = '2026-01-01T11:00:00.000Z'; // book-2: book_added
const STARTED_1 = '2026-01-02T10:00:00.000Z'; // book-1: book_started
const STARTED_2 = '2026-01-03T10:00:00.000Z'; // book-2: book_started
const SESSION_ENDED = '2026-01-04T10:00:00.000Z'; // book-1: session_completed
const NOTE_CREATED = '2026-01-05T10:00:00.000Z'; // book-1: journal_entry
const FINISHED_1 = '2026-01-06T10:00:00.000Z'; // book-1: book_finished
const RATING_CREATED = '2026-01-07T10:00:00.000Z'; // book-1: rating_added
const QUOTE_CREATED = '2026-01-08T10:00:00.000Z'; // book-2: quote
const SHELF_ADDED = '2026-01-09T10:00:00.000Z'; // book-2: shelf_addition

/**
 * Дві книги: book-1 пройшла через сесію/нотатку/фініш/оцінку (без цитати й полиці), book-2 —
 * через цитату/полицю (без сесії/нотатки/фінішу/оцінки). Разом — усі вісім типів подій ТЗ
 * рівно по одному разу, і жоден тип не з'являється в обох книгах одночасно (спрощує перевірку
 * "який рядок належить якій книзі").
 */
async function seedTwoBooksAcrossAllEventTypes(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(
    `INSERT INTO work (id, title, cover_fallback_color, created_at, updated_at) VALUES (?,?,?,?,?)`,
    ['work-1', 'Відьмак: Останнє бажання', '#334455', ADDED_1, ADDED_1],
  );
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, cover_url, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    ['edition-1', 'work-1', 'Відьмак: Останнє бажання', 'uk', 'paperback', 'https://covers.example/1.jpg', ADDED_1, ADDED_1],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, started_at, finished_at, current_page, added_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    ['user_book-1', 'edition-1', 'finished', STARTED_1, FINISHED_1, 250, ADDED_1, FINISHED_1],
  );

  await db.runAsync(
    `INSERT INTO work (id, title, cover_fallback_color, created_at, updated_at) VALUES (?,?,?,?,?)`,
    ['work-2', 'Гаррі Поттер і філософський камінь', '#556677', ADDED_2, ADDED_2],
  );
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, cover_url, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    ['edition-2', 'work-2', 'Гаррі Поттер і філософський камінь', 'uk', 'paperback', null, ADDED_2, ADDED_2],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, started_at, current_page, added_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    ['user_book-2', 'edition-2', 'reading', STARTED_2, 10, ADDED_2, STARTED_2],
  );

  await db.runAsync(
    `INSERT INTO reading_session (id, user_book_id, started_at, ended_at, start_page, duration_seconds, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    ['session-1', 'user_book-1', STARTED_1, SESSION_ENDED, 0, 1800, STARTED_1, SESSION_ENDED],
  );

  await db.runAsync(
    `INSERT INTO note (id, user_book_id, type, text, tags, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    ['note-1', 'user_book-1', 'thought', 'Цікава глава.', '[]', NOTE_CREATED, NOTE_CREATED],
  );

  await db.runAsync(
    `INSERT INTO rating (id, user_book_id, value, created_at, updated_at) VALUES (?,?,?,?,?)`,
    ['rating-1', 'user_book-1', 4.5, RATING_CREATED, RATING_CREATED],
  );

  await db.runAsync(
    `INSERT INTO quote (id, user_book_id, edition_id, text, tags, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    ['quote-1', 'user_book-2', 'edition-2', 'Класна цитата.', '[]', QUOTE_CREATED, QUOTE_CREATED],
  );

  await db.runAsync(`INSERT INTO shelf (id, name, sort_order, created_at, updated_at) VALUES (?,?,?,?,?)`, [
    'shelf-1',
    'Улюблені',
    0,
    SHELF_ADDED,
    SHELF_ADDED,
  ]);
  await db.runAsync(`INSERT INTO shelf_book (shelf_id, user_book_id, added_at) VALUES (?,?,?)`, [
    'shelf-1',
    'user_book-2',
    SHELF_ADDED,
  ]);
}

describe('ActivityHistoryRepository.listRecent', () => {
  it('повертає рівно по одній події кожного з восьми типів ТЗ, найновіша перша', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksAcrossAllEventTypes(db);

    const { items: events } = await ActivityHistoryRepository.listRecent(db);

    expect(events).toHaveLength(10);
    expect(events.map((e) => e.type).sort()).toEqual(
      [
        'book_added',
        'book_added',
        'book_finished',
        'book_started',
        'book_started',
        'journal_entry',
        'quote',
        'rating_added',
        'session_completed',
        'shelf_addition',
      ].sort(),
    );

    // `occurred_at DESC` через усе об'єднання одразу, не по кожному джерелу окремо.
    expect(events.map((e) => e.type)).toEqual([
      'shelf_addition',
      'quote',
      'rating_added',
      'book_finished',
      'journal_entry',
      'session_completed',
      'book_started',
      'book_started',
      'book_added',
      'book_added',
    ]);
  });

  it('кожен тип події несе правильні деталі й правильну книгу', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksAcrossAllEventTypes(db);

    const { items: events } = await ActivityHistoryRepository.listRecent(db);
    const byType = new Map(events.map((e) => [e.type, e]));

    const session = byType.get('session_completed');
    expect(session?.userBookId).toBe('user_book-1');
    expect(session?.durationSeconds).toBe(1800);
    expect(session?.ratingValue).toBeNull();
    expect(session?.entryText).toBeNull();

    const rating = byType.get('rating_added');
    expect(rating?.userBookId).toBe('user_book-1');
    expect(rating?.ratingValue).toBe(4.5);
    expect(rating?.durationSeconds).toBeNull();

    const journalEntry = byType.get('journal_entry');
    expect(journalEntry?.userBookId).toBe('user_book-1');
    expect(journalEntry?.entryText).toBe('Цікава глава.');

    const quote = byType.get('quote');
    expect(quote?.userBookId).toBe('user_book-2');
    expect(quote?.entryText).toBe('Класна цитата.');

    const shelfAddition = byType.get('shelf_addition');
    expect(shelfAddition?.userBookId).toBe('user_book-2');
    expect(shelfAddition?.shelfName).toBe('Улюблені');
    expect(shelfAddition?.id).toBe('shelf-1:user_book-2');

    const bookFinished = byType.get('book_finished');
    expect(bookFinished?.userBookId).toBe('user_book-1');
    expect(bookFinished?.id).toBe('user_book-1:finished');
    expect(bookFinished?.entryText).toBeNull();
    expect(bookFinished?.shelfName).toBeNull();

    // Обкладинка/назва книги приходять з `work`/`edition`, не лише сирі id.
    const bookAddedEvents = events.filter((e) => e.type === 'book_added');
    const book1Added = bookAddedEvents.find((e) => e.userBookId === 'user_book-1');
    expect(book1Added?.workTitle).toBe('Відьмак: Останнє бажання');
    expect(book1Added?.coverUrl).toBe('https://covers.example/1.jpg');
    expect(book1Added?.coverFallbackColor).toBe('#334455');
    const book2Added = bookAddedEvents.find((e) => e.userBookId === 'user_book-2');
    expect(book2Added?.workTitle).toBe('Гаррі Поттер і філософський камінь');
    // book-2 без власної обкладинки — `cover_url IS NULL`, не порожній рядок.
    expect(book2Added?.coverUrl).toBeNull();
  });

  it('limit застосовується ПІСЛЯ спільного сортування, а не по кожному джерелу окремо', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksAcrossAllEventTypes(db);

    const { items: topThree } = await ActivityHistoryRepository.listRecent(db, 3);
    expect(topThree.map((e) => e.type)).toEqual(['shelf_addition', 'quote', 'rating_added']);
  });

  it('м\'яко видалена книга зникає з усіх своїх подій одразу (deleted_at на user_book)', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksAcrossAllEventTypes(db);
    await db.runAsync(`UPDATE user_book SET deleted_at = ? WHERE id = ?`, [SHELF_ADDED, 'user_book-1']);

    const { items: events } = await ActivityHistoryRepository.listRecent(db);
    expect(events.every((e) => e.userBookId === 'user_book-2')).toBe(true);
    expect(events.map((e) => e.type).sort()).toEqual(['book_added', 'book_started', 'quote', 'shelf_addition'].sort());
  });

  it('м\'яко видалений note/quote зникає зі стрічки, решта подій книги лишається', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksAcrossAllEventTypes(db);
    await db.runAsync(`UPDATE note SET deleted_at = ? WHERE id = ?`, [SHELF_ADDED, 'note-1']);

    const { items: events } = await ActivityHistoryRepository.listRecent(db);
    expect(events.some((e) => e.type === 'journal_entry')).toBe(false);
    // Решта подій book-1 (додавання/старт/сесія/фініш/оцінка) лишаються на місці.
    expect(events.filter((e) => e.userBookId === 'user_book-1')).toHaveLength(5);
  });

  it('без активності повертає порожній масив', async () => {
    const db = await openMigratedTestDb();
    expect((await ActivityHistoryRepository.listRecent(db)).items).toEqual([]);
    expect((await ActivityHistoryRepository.listRecent(db)).hiddenCount).toBe(0);
  });
});

/**
 * ТЗ Фази 3 V1.6.1 (аудит V1.6 §42 — Activity History показувала `entryText` для
 * `journal_entry`/`quote` без жодної spoiler-safe перевірки, на відміну від однокнижних
 * екранів). Лише ці два типи подій несуть текст запису — решта шести (сесія/старт/фініш/
 * додавання/оцінка/полиця) не спойлер за визначенням і тому не фільтруються.
 */
describe('ActivityHistoryRepository.listRecent — spoiler-safe фільтрація (Фаза 3 V1.6.1)', () => {
  const T1 = '2026-02-01T10:00:00.000Z';
  const T2 = '2026-02-02T10:00:00.000Z';
  const T3 = '2026-02-03T10:00:00.000Z';

  async function seedOneBookWithAheadAndBehindEntries(
    db: SQLiteDatabase,
    spoilerSafeEnabled: 0 | 1,
  ): Promise<void> {
    await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
      'work-1',
      'Книга',
      T1,
      T1,
    ]);
    await db.runAsync(
      `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at, page_count) VALUES (?,?,?,?,?,?,?,?)`,
      ['edition-1', 'work-1', 'Книга', 'uk', 'paperback', T1, T1, 400],
    );
    await db.runAsync(
      `INSERT INTO user_book (id, edition_id, status, current_page, spoiler_safe_enabled, added_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['user_book-1', 'edition-1', 'reading', 50, spoilerSafeEnabled, T1, T1],
    );
    await db.runAsync(
      `INSERT INTO note (id, user_book_id, type, page, text, tags, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      ['note-ahead', 'user_book-1', 'thought', 300, 'Спойлер з кінця.', '[]', T2, T2],
    );
    await db.runAsync(
      `INSERT INTO quote (id, user_book_id, edition_id, page, text, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['quote-behind', 'user_book-1', 'edition-1', 10, 'Цитата з початку.', T3, T3],
    );
  }

  it('ховає journal_entry/quote попереду прогресу активної книги з увімкненим прапорцем', async () => {
    const db = await openMigratedTestDb();
    await seedOneBookWithAheadAndBehindEntries(db, 1);

    const { items: events, hiddenCount } = await ActivityHistoryRepository.listRecent(db);
    const ids = events.map((e) => e.id);
    expect(ids).not.toContain('note-ahead');
    expect(ids).toContain('quote-behind');
    // POLYTSIA V1.6.2, #166 — "N приховано" індикатор для Activity History: рівно
    // `note-ahead` сховано.
    expect(hiddenCount).toBe(1);
  });

  it('нічого не ховає, коли власник вимкнув прапорець для цієї книги', async () => {
    const db = await openMigratedTestDb();
    await seedOneBookWithAheadAndBehindEntries(db, 0);

    const { items: events, hiddenCount } = await ActivityHistoryRepository.listRecent(db);
    const ids = events.map((e) => e.id);
    expect(ids).toContain('note-ahead');
    expect(ids).toContain('quote-behind');
    expect(hiddenCount).toBe(0);
  });
});

/**
 * Календар 2.0 (Фаза 19, `docs/CALENDAR_2_0.md`) — `listBetween` перевикористовує той самий
 * `ACTIVITY_UNION_SQL`/spoiler-safe фільтр, що вже перевірений вище для `listRecent`; ці тести
 * зосереджені на тому, що дійсно відрізняється — межі діапазону `[startIso, endIso)` і порядок
 * `ASC` (а не `DESC`).
 */
describe('ActivityHistoryRepository.listBetween', () => {
  it('повертає лише події в межах [startIso, endIso), відсортовані найстаріша перша', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksAcrossAllEventTypes(db);

    // [STARTED_1, FINISHED_1) — включає started_1/started_2/session_ended/note_created,
    // виключає added_1/added_2 (раніше діапазону) і finished_1/rating/quote/shelf (на межі чи пізніше).
    const events = await ActivityHistoryRepository.listBetween(db, STARTED_1, FINISHED_1);

    expect(events.map((e) => e.type)).toEqual(['book_started', 'book_started', 'session_completed', 'journal_entry']);
  });

  it('верхня межа виключна: подія РІВНО в endIso не потрапляє', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksAcrossAllEventTypes(db);

    const events = await ActivityHistoryRepository.listBetween(db, ADDED_1, FINISHED_1);
    expect(events.some((e) => e.type === 'book_finished')).toBe(false);
  });

  it('нижня межа включна: подія РІВНО в startIso потрапляє', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksAcrossAllEventTypes(db);

    const events = await ActivityHistoryRepository.listBetween(db, FINISHED_1, RATING_CREATED);
    expect(events.some((e) => e.type === 'book_finished')).toBe(true);
  });

  it('поза діапазоном будь-якої активності — порожній масив', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksAcrossAllEventTypes(db);

    const events = await ActivityHistoryRepository.listBetween(
      db,
      '2025-01-01T00:00:00.000Z',
      '2025-02-01T00:00:00.000Z',
    );
    expect(events).toEqual([]);
  });

  it('та сама spoiler-safe фільтрація journal_entry/quote, що й listRecent', async () => {
    const db = await openMigratedTestDb();
    const T1 = '2026-02-01T10:00:00.000Z';
    const T2 = '2026-02-02T10:00:00.000Z';
    const T3 = '2026-02-03T10:00:00.000Z';
    await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, ['work-1', 'Книга', T1, T1]);
    await db.runAsync(
      `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at, page_count) VALUES (?,?,?,?,?,?,?,?)`,
      ['edition-1', 'work-1', 'Книга', 'uk', 'paperback', T1, T1, 400],
    );
    await db.runAsync(
      `INSERT INTO user_book (id, edition_id, status, current_page, spoiler_safe_enabled, added_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['user_book-1', 'edition-1', 'reading', 50, 1, T1, T1],
    );
    await db.runAsync(
      `INSERT INTO note (id, user_book_id, type, page, text, tags, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      ['note-ahead', 'user_book-1', 'thought', 300, 'Спойлер з кінця.', '[]', T2, T2],
    );
    await db.runAsync(
      `INSERT INTO quote (id, user_book_id, edition_id, page, text, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['quote-behind', 'user_book-1', 'edition-1', 10, 'Цитата з початку.', T3, T3],
    );

    const events = await ActivityHistoryRepository.listBetween(db, T1, '2026-02-10T00:00:00.000Z');
    const ids = events.map((e) => e.id);
    expect(ids).not.toContain('note-ahead');
    expect(ids).toContain('quote-behind');
  });
});

/**
 * КАЛЕНДАР, ВІЗУАЛЬНА КОМПОЗИЦІЯ (пост-Фаза 19) — Day Details' "Збережено цього дня" потребує
 * не лише видимі записи (`listBetween`), а й ЧИСЛО прихованих, щоб чесно написати "Ще N
 * записів приховано...", а не мовчки показати менше записів без пояснення.
 */
describe('ActivityHistoryRepository.countSpoilerHiddenJournalBetween', () => {
  const T1 = '2026-02-01T10:00:00.000Z';
  const T2 = '2026-02-02T10:00:00.000Z';
  const T3 = '2026-02-03T10:00:00.000Z';

  async function seedOneBookWithAheadAndBehindEntries(db: SQLiteDatabase, spoilerSafeEnabled: 0 | 1): Promise<void> {
    await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, ['work-1', 'Книга', T1, T1]);
    await db.runAsync(
      `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at, page_count) VALUES (?,?,?,?,?,?,?,?)`,
      ['edition-1', 'work-1', 'Книга', 'uk', 'paperback', T1, T1, 400],
    );
    await db.runAsync(
      `INSERT INTO user_book (id, edition_id, status, current_page, spoiler_safe_enabled, added_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['user_book-1', 'edition-1', 'reading', 50, spoilerSafeEnabled, T1, T1],
    );
    await db.runAsync(
      `INSERT INTO note (id, user_book_id, type, page, text, tags, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      ['note-ahead', 'user_book-1', 'thought', 300, 'Спойлер з кінця.', '[]', T2, T2],
    );
    await db.runAsync(
      `INSERT INTO quote (id, user_book_id, edition_id, page, text, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['quote-behind', 'user_book-1', 'edition-1', 10, 'Цитата з початку.', T3, T3],
    );
  }

  it('рахує рівно приховані journal_entry/quote діапазону (тут — 1, note-ahead)', async () => {
    const db = await openMigratedTestDb();
    await seedOneBookWithAheadAndBehindEntries(db, 1);

    const count = await ActivityHistoryRepository.countSpoilerHiddenJournalBetween(
      db,
      T1,
      '2026-02-10T00:00:00.000Z',
    );
    expect(count).toBe(1);
  });

  it('0, коли власник вимкнув прапорець (нічого не приховано)', async () => {
    const db = await openMigratedTestDb();
    await seedOneBookWithAheadAndBehindEntries(db, 0);

    const count = await ActivityHistoryRepository.countSpoilerHiddenJournalBetween(
      db,
      T1,
      '2026-02-10T00:00:00.000Z',
    );
    expect(count).toBe(0);
  });

  it('0 поза діапазоном дат', async () => {
    const db = await openMigratedTestDb();
    await seedOneBookWithAheadAndBehindEntries(db, 1);

    const count = await ActivityHistoryRepository.countSpoilerHiddenJournalBetween(
      db,
      '2025-01-01T00:00:00.000Z',
      '2025-02-01T00:00:00.000Z',
    );
    expect(count).toBe(0);
  });

  it('не рахує неспойлерні типи подій (session_completed/book_started тощо) — вони ніколи не приховані', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksAcrossAllEventTypes(db);

    const count = await ActivityHistoryRepository.countSpoilerHiddenJournalBetween(db, ADDED_1, SHELF_ADDED);
    expect(count).toBe(0);
  });
});
