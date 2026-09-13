import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded, LATEST_SCHEMA_VERSION, __applyMigrationsForTests } from './migrationRunner';
import { openTestDatabase } from './testDb';

/**
 * Repository-інтеграційні тести (POLYTSIA V1.5, Фаза 3, п.44 ТЗ) — проти РЕАЛЬНОЇ SQLite
 * (`:memory:`, без диска), не in-memory JS-мок: SQL із самих міграцій справді виконується
 * рушієм SQLite, а не просто "не кидає виняток у замоканому шарі". БД відкривається через
 * `openTestDatabase()` (`./testDb.ts`) — `better-sqlite3` під капотом, а не `expo-sqlite`;
 * докладне обґрунтування (реальна знахідка з CI) — коментар у `testDb.ts`.
 *
 * Кожен `it` відкриває свою власну `:memory:` БД — вони не діляться станом між собою (на
 * відміну від `getDatabase()` з `client.ts`, який кешує одне спільне з'єднання для
 * застосунку).
 */
describe('migrateDbIfNeeded', () => {
  it('застосовує всі міграції на порожній БД без помилок і доводить до LATEST_SCHEMA_VERSION', async () => {
    const db = await openTestDatabase();

    const finalVersion = await migrateDbIfNeeded(db);
    expect(finalVersion).toBe(LATEST_SCHEMA_VERSION);

    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(row?.user_version).toBe(LATEST_SCHEMA_VERSION);

    // Побіжна перевірка, що таблиці з РІЗНИХ міграцій (001 — базова схема, 008 — остання, що
    // додає нову таблицю) справді створені, а не лише що PRAGMA-лічильник збігся.
    const tables = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('author', 'shelf', 'note_category')
       ORDER BY name`,
    );
    expect(tables.map((t) => t.name)).toEqual(['author', 'note_category', 'shelf']);
  });

  it('повторний виклик на вже актуальній БД — без помилок, версія не змінюється (ідемпотентність)', async () => {
    const db = await openTestDatabase();

    await migrateDbIfNeeded(db);
    const secondRunVersion = await migrateDbIfNeeded(db);

    expect(secondRunVersion).toBe(LATEST_SCHEMA_VERSION);
  });

  it('нова міграція (009: shelf.theme) застосовується на seed-БД попередньої версії без втрати даних', async () => {
    const db = await openTestDatabase();

    // Готуємо БД "версії 8" — усі міграції, КРІМ найновішої (009).
    await __applyMigrationsForTests(db, LATEST_SCHEMA_VERSION - 1);
    const beforeVersion = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(beforeVersion?.user_version).toBe(LATEST_SCHEMA_VERSION - 1);

    // Реальний рядок, створений "попередньою версією застосунку" — до появи стовпця `theme`.
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO shelf (id, name, is_system, sort_order, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)`,
      ['shelf-1', 'Улюблене', now, now],
    );

    // Тепер — те саме, що відбулось би на пристрої власника продукту після оновлення
    // застосунку: `migrateDbIfNeeded` бачить, що не вистачає лише останньої міграції.
    const finalVersion = await migrateDbIfNeeded(db);
    expect(finalVersion).toBe(LATEST_SCHEMA_VERSION);

    const shelf = await db.getFirstAsync<{ id: string; name: string; theme: string }>(
      `SELECT id, name, theme FROM shelf WHERE id = ?`,
      ['shelf-1'],
    );
    expect(shelf).not.toBeNull();
    expect(shelf?.name).toBe('Улюблене');
    // ALTER TABLE ... DEFAULT 'classic' (009_shelf_theme.ts) має заднім числом проставити
    // значення й уже наявним рядкам, не лише новим.
    expect(shelf?.theme).toBe('classic');
  });

  it('нова міграція (010: reading_session.reading_experience) застосовується на seed-БД версії 9 без втрати даних', async () => {
    // POLYTSIA V1.5, Фаза 9 (SESSION REFLECTION) — той самий сценарій "populated DB", що й
    // тест 009 вище, лише для наступної міграції: на відміну від `shelf.theme`, тут БЕЗ
    // DEFAULT (поле справді необов'язкове), тож очікуваний результат — NULL, а не якесь
    // fallback-значення.
    const db = await openTestDatabase();

    await __applyMigrationsForTests(db, 9);
    const beforeVersion = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(beforeVersion?.user_version).toBe(9);

    // Мінімальний ланцюжок FK (work → edition → user_book), потрібний reading_session
    // (`PRAGMA foreign_keys = ON` у тестовій БД, `testDb.ts`), і сама сесія, створена
    // "попередньою версією застосунку" — до появи стовпця `reading_experience`.
    const now = new Date().toISOString();
    await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
      'work-1',
      'Книга 1',
      now,
      now,
    ]);
    await db.runAsync(
      `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['edition-1', 'work-1', 'Книга 1', 'uk', 'paperback', now, now],
    );
    await db.runAsync(
      `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,?,?,?,?)`,
      ['user_book-1', 'edition-1', 'reading', 0, now, now],
    );
    await db.runAsync(
      `INSERT INTO reading_session (
         id, user_book_id, started_at, ended_at, paused_intervals, start_page, end_page,
         duration_seconds, mood_note, is_edited, created_at, updated_at
       ) VALUES (?,?,?,?,'[]',?,?,?,?,0,?,?)`,
      ['session-1', 'user_book-1', now, now, 0, 10, 600, 'Гарний початок', now, now],
    );

    // Те саме, що відбулось би на пристрої власника продукту після оновлення застосунку:
    // `migrateDbIfNeeded` бачить, що не вистачає лише останньої міграції.
    const finalVersion = await migrateDbIfNeeded(db);
    expect(finalVersion).toBe(LATEST_SCHEMA_VERSION);

    const session = await db.getFirstAsync<{
      id: string;
      mood_note: string | null;
      reading_experience: string | null;
      duration_seconds: number | null;
    }>(`SELECT id, mood_note, reading_experience, duration_seconds FROM reading_session WHERE id = ?`, ['session-1']);
    expect(session).not.toBeNull();
    // Старі колонки (заповнені ще до міграції 010) не мають постраждати від rebuild — тут це
    // навіть простіше: 010 — простий `ALTER TABLE ADD COLUMN`, без rebuild узагалі.
    expect(session?.mood_note).toBe('Гарний початок');
    expect(session?.duration_seconds).toBe(600);
    // Нова колонка — без DEFAULT, тож для вже наявного рядка лишається NULL, а не якесь
    // fallback-значення (на відміну від `shelf.theme` вище).
    expect(session?.reading_experience).toBeNull();
  });

  it('нова міграція (011: note/quote.revisit_later) застосовується на seed-БД версії 10 без втрати даних', async () => {
    // POLYTSIA V1.5, Фаза 11 («ПОВЕРНУТИСЯ ПІЗНІШЕ») — той самий сценарій "populated DB", що й
    // тести 009/010 вище: старий рядок note/quote (без `revisit_later`) має після міграції
    // отримати `0`, а не NULL — це прапорцеве поле (`DEFAULT 0`), той самий вибір, що й
    // `is_favorite` у 003, а не необов'язкове поле на кшталт `reading_experience` з 010.
    const db = await openTestDatabase();

    await __applyMigrationsForTests(db, 10);
    const beforeVersion = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(beforeVersion?.user_version).toBe(10);

    const now = new Date().toISOString();
    await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
      'work-1',
      'Книга 1',
      now,
      now,
    ]);
    await db.runAsync(
      `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['edition-1', 'work-1', 'Книга 1', 'uk', 'paperback', now, now],
    );
    await db.runAsync(
      `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,?,?,?,?)`,
      ['user_book-1', 'edition-1', 'reading', 0, now, now],
    );
    // Рядки note/quote, створені "попередньою версією застосунку" — до появи стовпця
    // `revisit_later`, з уже заповненим `is_favorite` (Migration 003), щоб перевірити, що
    // rebuild його не зачепив (тут навіть простіше — 011 теж простий `ALTER TABLE ADD COLUMN`).
    await db.runAsync(
      `INSERT INTO note (id, user_book_id, type, text, is_favorite, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      ['note-1', 'user_book-1', 'thought', 'Нотатка до міграції 011', 1, now, now],
    );
    await db.runAsync(
      `INSERT INTO quote (id, user_book_id, edition_id, text, is_favorite, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      ['quote-1', 'user_book-1', 'edition-1', 'Цитата до міграції 011', 0, now, now],
    );

    const finalVersion = await migrateDbIfNeeded(db);
    expect(finalVersion).toBe(LATEST_SCHEMA_VERSION);

    const note = await db.getFirstAsync<{ id: string; text: string; is_favorite: number; revisit_later: number }>(
      `SELECT id, text, is_favorite, revisit_later FROM note WHERE id = ?`,
      ['note-1'],
    );
    const quote = await db.getFirstAsync<{ id: string; text: string; revisit_later: number }>(
      `SELECT id, text, revisit_later FROM quote WHERE id = ?`,
      ['quote-1'],
    );
    expect(note).not.toBeNull();
    expect(note?.text).toBe('Нотатка до міграції 011');
    expect(note?.is_favorite).toBe(1);
    expect(note?.revisit_later).toBe(0);
    expect(quote).not.toBeNull();
    expect(quote?.text).toBe('Цитата до міграції 011');
    expect(quote?.revisit_later).toBe(0);
  });

  it('нова міграція (018: shelf_book.user_book_id індекс) застосовується на seed-БД версії 17 без втрати даних', async () => {
    // POLYTSIA V1.6, Фаза 20 (DATABASE / MIGRATIONS) — той самий сценарій "populated DB", що й
    // тести 009/010/011 вище, лише для чистого `CREATE INDEX` (без нової колонки): існуючий
    // рядок shelf_book, створений "попередньою версією застосунку", має лишитись недоторканим,
    // а новий індекс — реально з'явитися в sqlite_master.
    const db = await openTestDatabase();

    await __applyMigrationsForTests(db, 17);
    const beforeVersion = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(beforeVersion?.user_version).toBe(17);

    const now = new Date().toISOString();
    await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
      'work-1',
      'Книга 1',
      now,
      now,
    ]);
    await db.runAsync(
      `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['edition-1', 'work-1', 'Книга 1', 'uk', 'paperback', now, now],
    );
    await db.runAsync(
      `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,?,?,?,?)`,
      ['user_book-1', 'edition-1', 'reading', 0, now, now],
    );
    await db.runAsync(`INSERT INTO shelf (id, name, is_system, sort_order, created_at, updated_at) VALUES (?,?,0,0,?,?)`, [
      'shelf-1',
      'Улюблене',
      now,
      now,
    ]);
    // Рядок shelf_book, створений "попередньою версією застосунку" — до появи індексу.
    await db.runAsync(`INSERT INTO shelf_book (shelf_id, user_book_id, added_at) VALUES (?,?,?)`, [
      'shelf-1',
      'user_book-1',
      now,
    ]);

    const finalVersion = await migrateDbIfNeeded(db);
    expect(finalVersion).toBe(LATEST_SCHEMA_VERSION);

    // Старий рядок не постраждав.
    const link = await db.getFirstAsync<{ shelf_id: string; user_book_id: string }>(
      `SELECT shelf_id, user_book_id FROM shelf_book WHERE shelf_id = ? AND user_book_id = ?`,
      ['shelf-1', 'user_book-1'],
    );
    expect(link).not.toBeNull();

    // Індекс справді створено (не лише PRAGMA-лічильник збігся).
    const index = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_shelf_book_user_book'`,
    );
    expect(index?.name).toBe('idx_shelf_book_user_book');
  });
});

/**
 * `020_reading_run_backfill.ts` (POLYTSIA V1.6.1, Фаза 6b, `docs/READING_RUN.md` §Backfill) —
 * той самий "populated DB на версії N-1, потім migrateDbIfNeeded" сценарій, що й тести
 * 009/010/011/018 вище, але для міграції з реальною per-row backfill-логікою (а не чистого
 * `ALTER TABLE`/`CREATE INDEX`) — кожен `it()` перевіряє одну гілку правила вибору
 * `status`/`finished_at`, задокументованого в коментарі над самою міграцією.
 */
async function seedPreBackfillScenario(db: SQLiteDatabase): Promise<void> {
  const now = '2026-06-01T00:00:00.000Z';

  async function seedBook(id: string, status: string, startedAt: string | null, finishedAt: string | null): Promise<void> {
    await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
      `${id}-work`,
      `Книга ${id}`,
      now,
      now,
    ]);
    await db.runAsync(
      `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      [`${id}-edition`, `${id}-work`, `Книга ${id}`, 'uk', 'paperback', now, now],
    );
    await db.runAsync(
      `INSERT INTO user_book (id, edition_id, status, started_at, finished_at, current_page, added_at, updated_at)
       VALUES (?,?,?,?,?,0,?,?)`,
      [id, `${id}-edition`, status, startedAt, finishedAt, now, now],
    );
  }

  async function seedSession(id: string, userBookId: string, startedAt: string, endedAt: string | null): Promise<void> {
    await db.runAsync(
      `INSERT INTO reading_session (
         id, user_book_id, started_at, ended_at, paused_intervals, start_page, end_page,
         duration_seconds, is_edited, created_at, updated_at
       ) VALUES (?,?,?,?,'[]',0,?,?,0,?,?)`,
      [id, userBookId, startedAt, endedAt, endedAt ? 10 : null, endedAt ? 600 : null, startedAt, endedAt ?? startedAt],
    );
  }

  // A: активне читання, started_at заданий — очікується in_progress, finished_at NULL.
  await seedBook('ub-a', 'reading', '2026-01-01T00:00:00.000Z', null);
  await seedSession('session-a', 'ub-a', '2026-01-01T00:00:00.000Z', null);

  // B: finished, і started_at, і finished_at на самій user_book задані — найвищий пріоритет.
  await seedBook('ub-b', 'finished', '2026-01-01T00:00:00.000Z', '2026-01-10T00:00:00.000Z');
  await seedSession('session-b', 'ub-b', '2026-01-01T00:00:00.000Z', '2026-01-10T00:00:00.000Z');

  // C: finished, але user_book.finished_at чомусь NULL (аномалія) — fallback на ended_at
  // найпізнішої сесії.
  await seedBook('ub-c', 'finished', '2026-02-01T00:00:00.000Z', null);
  await seedSession('session-c1', 'ub-c', '2026-02-01T00:00:00.000Z', '2026-02-05T00:00:00.000Z');
  await seedSession('session-c2', 'ub-c', '2026-02-06T00:00:00.000Z', '2026-02-09T00:00:00.000Z');

  // D: finished, і finished_at, і сесії відсутні — останній fallback: user_book.updated_at.
  await seedBook('ub-d', 'finished', '2026-03-01T00:00:00.000Z', null);

  // E: did_not_finish, є dnf_reflection — найточніший сигнал моменту DNF.
  await seedBook('ub-e', 'did_not_finish', '2026-04-01T00:00:00.000Z', null);
  await db.runAsync(
    `INSERT INTO dnf_reflection (id, user_book_id, page, reason, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    ['dnf-e', 'ub-e', 42, null, null, '2026-04-05T00:00:00.000Z', '2026-04-05T00:00:00.000Z'],
  );

  // F: did_not_finish, БЕЗ dnf_reflection — fallback на user_book.updated_at.
  await seedBook('ub-f', 'did_not_finish', '2026-04-10T00:00:00.000Z', null);

  // G: rereading — user_book.finished_at і досі містить дату ПЕРШОГО завершення (заморожена,
  // ніколи не оновлюється) — вона НЕ повинна потрапити в legacy run: run має бути in_progress,
  // finished_at NULL, стара дата завершення відкинута, а не тихо "перенесена".
  await seedBook('ub-g', 'rereading', '2025-01-01T00:00:00.000Z', '2025-06-01T00:00:00.000Z');

  // H: want_to_read, узагалі не розпочата (started_at NULL, без сесій) — legacy run НЕ
  // створюється взагалі, вигадувати дату старту нема з чого.
  await seedBook('ub-h', 'want_to_read', null, null);

  // I: кілька сесій (включно з м'яко скасованою) — усі мають зібратись під ОДИН run_number 1.
  await seedBook('ub-i', 'reading', '2026-05-01T00:00:00.000Z', null);
  await seedSession('session-i1', 'ub-i', '2026-05-01T00:00:00.000Z', '2026-05-02T00:00:00.000Z');
  await seedSession('session-i2', 'ub-i', '2026-05-03T00:00:00.000Z', null);
  await db.runAsync(`UPDATE reading_session SET deleted_at = ? WHERE id = ?`, [now, 'session-i2']);
}

interface LegacyRunRow {
  id: string;
  user_book_id: string;
  run_number: number;
  status: string;
  started_at: string;
  finished_at: string | null;
  is_legacy_backfill: number;
}

async function migrateWithBackfillScenario(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await __applyMigrationsForTests(db, 19);
  await seedPreBackfillScenario(db);
  const finalVersion = await migrateDbIfNeeded(db);
  expect(finalVersion).toBe(LATEST_SCHEMA_VERSION);
  return db;
}

async function getRun(db: SQLiteDatabase, userBookId: string): Promise<LegacyRunRow | null> {
  return db.getFirstAsync<LegacyRunRow>(`SELECT * FROM reading_run WHERE user_book_id = ?`, [userBookId]);
}

describe('migrateDbIfNeeded — 020_reading_run_backfill (Фаза 6b)', () => {
  it('reading/rereading — in_progress, finished_at NULL; стара дата ПЕРШОГО завершення НЕ переноситься', async () => {
    const db = await migrateWithBackfillScenario();

    const runA = await getRun(db, 'ub-a');
    expect(runA).toMatchObject({ run_number: 1, status: 'in_progress', finished_at: null, is_legacy_backfill: 1 });
    expect(runA?.started_at).toBe('2026-01-01T00:00:00.000Z');

    const runG = await getRun(db, 'ub-g');
    expect(runG).toMatchObject({ status: 'in_progress', finished_at: null });
    expect(runG?.started_at).toBe('2025-01-01T00:00:00.000Z'); // started_at книги ЗБЕРІГАЄТЬСЯ.
  });

  it('finished — пріоритет: user_book.finished_at → останній ended_at сесії → user_book.updated_at', async () => {
    const db = await migrateWithBackfillScenario();

    const runB = await getRun(db, 'ub-b');
    expect(runB?.status).toBe('finished');
    expect(runB?.finished_at).toBe('2026-01-10T00:00:00.000Z'); // з user_book, не з сесії.

    const runC = await getRun(db, 'ub-c');
    expect(runC?.finished_at).toBe('2026-02-09T00:00:00.000Z'); // найпізніший ended_at (session-c2).

    const runD = await getRun(db, 'ub-d');
    expect(runD?.finished_at).toBe('2026-06-01T00:00:00.000Z'); // user_book.updated_at (`now`) — останній fallback.
  });

  it('did_not_finish — пріоритет: dnf_reflection.created_at → user_book.updated_at', async () => {
    const db = await migrateWithBackfillScenario();

    const runE = await getRun(db, 'ub-e');
    expect(runE?.status).toBe('did_not_finish');
    expect(runE?.finished_at).toBe('2026-04-05T00:00:00.000Z'); // з dnf_reflection.

    const runF = await getRun(db, 'ub-f');
    expect(runF?.finished_at).toBe('2026-06-01T00:00:00.000Z'); // user_book.updated_at (`now`).
  });

  it('want_to_read без started_at і без сесій — legacy run НЕ створюється', async () => {
    const db = await migrateWithBackfillScenario();
    expect(await getRun(db, 'ub-h')).toBeNull();
  });

  it('кілька сесій книги (включно з м\'яко скасованою) — усі отримують той самий reading_run_id', async () => {
    const db = await migrateWithBackfillScenario();
    const run = await getRun(db, 'ub-i');
    expect(run).not.toBeNull();

    const sessions = await db.getAllAsync<{ id: string; reading_run_id: string | null }>(
      `SELECT id, reading_run_id FROM reading_session WHERE user_book_id = ? ORDER BY id`,
      ['ub-i'],
    );
    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => s.reading_run_id === run?.id)).toBe(true);
  });

  it('reading_session.reading_run_id — нова колонка, індекс справді створений', async () => {
    const db = await migrateWithBackfillScenario();
    const index = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_reading_session_reading_run'`,
    );
    expect(index?.name).toBe('idx_reading_session_reading_run');
  });
});
