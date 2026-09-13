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

/**
 * `021_book_memory_run.ts` (POLYTSIA V1.6.1, Фаза 8, `docs/READING_RUN.md` §"Фаза 8") — rebuild
 * `book_memory` (`UNIQUE(user_book_id)` → `UNIQUE(reading_run_id)`) + JS-backfill. Той самий
 * "populated DB на версії 20, потім migrateDbIfNeeded" сценарій, що й тести 020 вище: БД
 * піднімається до версії 20 (СТАРА схема `book_memory`, ще без `reading_run_id`), книги/run'и/
 * legacy-спогади сіються напряму raw SQL, потім прогоняється сама міграція 021.
 */
const MIGRATION_021_NOW = '2026-09-13T00:00:00.000Z';

async function seedBookForMemoryMigration(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    `${id}-work`,
    `Книга ${id}`,
    MIGRATION_021_NOW,
    MIGRATION_021_NOW,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [`${id}-edition`, `${id}-work`, `Книга ${id}`, 'uk', 'paperback', MIGRATION_021_NOW, MIGRATION_021_NOW],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,'finished',0,?,?)`,
    [id, `${id}-edition`, MIGRATION_021_NOW, MIGRATION_021_NOW],
  );
}

async function seedRunForMemoryMigration(
  db: SQLiteDatabase,
  params: { id: string; userBookId: string; runNumber: number; status: string },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO reading_run (
       id, user_book_id, run_number, status, started_at, finished_at, is_legacy_backfill, created_at, updated_at
     ) VALUES (?,?,?,?,?,?,0,?,?)`,
    [
      params.id,
      params.userBookId,
      params.runNumber,
      params.status,
      MIGRATION_021_NOW,
      params.status === 'in_progress' ? null : MIGRATION_021_NOW,
      MIGRATION_021_NOW,
      MIGRATION_021_NOW,
    ],
  );
}

/** Спогад у СТАРІЙ схемі `book_memory` (версія 20 — ще без `reading_run_id`). */
async function seedLegacyMemory(db: SQLiteDatabase, id: string, userBookId: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO book_memory (id, user_book_id, reflection, entry_refs, template_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?)`,
    [id, userBookId, `Спогад ${id}`, '[]', 'classic', MIGRATION_021_NOW, MIGRATION_021_NOW],
  );
}

interface LegacyBookMemoryRow {
  id: string;
  user_book_id: string;
  reading_run_id: string | null;
}

async function getMemory(db: SQLiteDatabase, id: string): Promise<LegacyBookMemoryRow | null> {
  return db.getFirstAsync<LegacyBookMemoryRow>(`SELECT * FROM book_memory WHERE id = ?`, [id]);
}

describe('migrateDbIfNeeded — 021_book_memory_run (Фаза 8)', () => {
  it('книга з finished і in_progress run — спогад лінкується на FINISHED, не на новіший in_progress', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 20);
    await seedBookForMemoryMigration(db, 'ub-j');
    await seedRunForMemoryMigration(db, { id: 'run-j1', userBookId: 'ub-j', runNumber: 1, status: 'finished' });
    await seedRunForMemoryMigration(db, { id: 'run-j2', userBookId: 'ub-j', runNumber: 2, status: 'in_progress' });
    await seedLegacyMemory(db, 'memory-j', 'ub-j');

    const finalVersion = await migrateDbIfNeeded(db);
    expect(finalVersion).toBe(LATEST_SCHEMA_VERSION);

    const memory = await getMemory(db, 'memory-j');
    expect(memory?.reading_run_id).toBe('run-j1');
  });

  it('кілька FINISHED run — обирається найновіший (найвищий run_number), не перший знайдений', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 20);
    await seedBookForMemoryMigration(db, 'ub-n');
    await seedRunForMemoryMigration(db, { id: 'run-n1', userBookId: 'ub-n', runNumber: 1, status: 'finished' });
    await seedRunForMemoryMigration(db, { id: 'run-n2', userBookId: 'ub-n', runNumber: 2, status: 'finished' });
    await seedLegacyMemory(db, 'memory-n', 'ub-n');

    await migrateDbIfNeeded(db);

    const memory = await getMemory(db, 'memory-n');
    expect(memory?.reading_run_id).toBe('run-n2');
  });

  it('лише in_progress run (без жодного finished) — фолбек на найновіший run узагалі', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 20);
    await seedBookForMemoryMigration(db, 'ub-k');
    await seedRunForMemoryMigration(db, { id: 'run-k1', userBookId: 'ub-k', runNumber: 1, status: 'in_progress' });
    await seedLegacyMemory(db, 'memory-k', 'ub-k');

    await migrateDbIfNeeded(db);

    const memory = await getMemory(db, 'memory-k');
    expect(memory?.reading_run_id).toBe('run-k1');
  });

  it('книга без жодного reading_run — reading_run_id лишається NULL, нічого не вигадується', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 20);
    await seedBookForMemoryMigration(db, 'ub-l');
    await seedLegacyMemory(db, 'memory-l', 'ub-l');

    await migrateDbIfNeeded(db);

    const memory = await getMemory(db, 'memory-l');
    expect(memory?.reading_run_id).toBeNull();
  });

  it('стара UNIQUE(user_book_id) знята: два спогади на одну книгу (різні reading_run_id) — без конфлікту', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 20);
    await seedBookForMemoryMigration(db, 'ub-m');
    await seedRunForMemoryMigration(db, { id: 'run-m1', userBookId: 'ub-m', runNumber: 1, status: 'finished' });
    await seedRunForMemoryMigration(db, { id: 'run-m2', userBookId: 'ub-m', runNumber: 2, status: 'finished' });
    await seedLegacyMemory(db, 'memory-m1', 'ub-m');

    await migrateDbIfNeeded(db);

    // Backfill лінкує memory-m1 на run-m2 (найновіший FINISHED, п. вище) — другий спогад
    // навмисно на РЕШТУ run цієї самої книги (run-m1), яка ще без спогаду: після rebuild це
    // більше не конфлікт (стара UNIQUE(user_book_id) заборонила б будь-який другий рядок для
    // ub-m взагалі, незалежно від run).
    const linkedRun = await getMemory(db, 'memory-m1');
    expect(linkedRun?.reading_run_id).toBe('run-m2');

    await db.runAsync(
      `INSERT INTO book_memory (id, user_book_id, reading_run_id, reflection, entry_refs, template_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      ['memory-m2', 'ub-m', 'run-m1', 'Другий спогад', '[]', 'classic', MIGRATION_021_NOW, MIGRATION_021_NOW],
    );

    const rows = await db.getAllAsync<LegacyBookMemoryRow>(`SELECT * FROM book_memory WHERE user_book_id = ?`, [
      'ub-m',
    ]);
    expect(rows).toHaveLength(2);
  });

  it('нова UNIQUE(reading_run_id) ДІЄ: другий спогад на ТОЙ САМИЙ run кидає виняток', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 20);
    await seedBookForMemoryMigration(db, 'ub-o');
    await seedRunForMemoryMigration(db, { id: 'run-o1', userBookId: 'ub-o', runNumber: 1, status: 'finished' });
    await seedLegacyMemory(db, 'memory-o1', 'ub-o');
    await migrateDbIfNeeded(db);

    await expect(
      db.runAsync(
        `INSERT INTO book_memory (id, user_book_id, reading_run_id, reflection, entry_refs, template_id, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        ['memory-o2', 'ub-o', 'run-o1', 'Дубль', '[]', 'classic', MIGRATION_021_NOW, MIGRATION_021_NOW],
      ),
    ).rejects.toThrow();
  });

  it('book_memory.reading_run_id — нова колонка, індекс idx_book_memory_user_book справді створений', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 20);
    await seedBookForMemoryMigration(db, 'ub-p');
    await seedLegacyMemory(db, 'memory-p', 'ub-p');

    await migrateDbIfNeeded(db);

    const index = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_book_memory_user_book'`,
    );
    expect(index?.name).toBe('idx_book_memory_user_book');

    // Поле досі читається без винятку — sanity-check, що rebuild не втратив жодної колонки.
    const memory = await getMemory(db, 'memory-p');
    expect(memory?.user_book_id).toBe('ub-p');
  });
});

/**
 * `022_pre_reading_reflection_run.ts` (POLYTSIA V1.6.1, Фаза 9, `docs/READING_RUN.md`
 * §"Фаза 9") — rebuild `pre_reading_reflection` (`UNIQUE(user_book_id)` → `UNIQUE(reading_run_id)`)
 * + JS-backfill. Той самий сценарій і той самий пріоритет backfill, що й у тестах 021 вище
 * (найновіший FINISHED/DID_NOT_FINISH, інакше найновіший узагалі) — з тієї самої причини:
 * `PreReadingReflectionRepository.getCurrent` читає через `getLatestByUserBookId`, тож backfill
 * мусить лінкувати наявну нотатку на run, який ця функція справді знайде.
 */
const MIGRATION_022_NOW = '2026-09-13T00:00:00.000Z';

async function seedBookForReflectionMigration(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    `${id}-work`,
    `Книга ${id}`,
    MIGRATION_022_NOW,
    MIGRATION_022_NOW,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [`${id}-edition`, `${id}-work`, `Книга ${id}`, 'uk', 'paperback', MIGRATION_022_NOW, MIGRATION_022_NOW],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,'finished',0,?,?)`,
    [id, `${id}-edition`, MIGRATION_022_NOW, MIGRATION_022_NOW],
  );
}

async function seedRunForReflectionMigration(
  db: SQLiteDatabase,
  params: { id: string; userBookId: string; runNumber: number; status: string },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO reading_run (
       id, user_book_id, run_number, status, started_at, finished_at, is_legacy_backfill, created_at, updated_at
     ) VALUES (?,?,?,?,?,?,0,?,?)`,
    [
      params.id,
      params.userBookId,
      params.runNumber,
      params.status,
      MIGRATION_022_NOW,
      params.status === 'in_progress' ? null : MIGRATION_022_NOW,
      MIGRATION_022_NOW,
      MIGRATION_022_NOW,
    ],
  );
}

/** Нотатка "До" у СТАРІЙ схемі `pre_reading_reflection` (версія 21 — ще без `reading_run_id`). */
async function seedLegacyReflection(db: SQLiteDatabase, id: string, userBookId: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO pre_reading_reflection (id, user_book_id, reason_text, expectation_text, expected_rating, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?)`,
    [id, userBookId, `Причина ${id}`, null, null, MIGRATION_022_NOW, MIGRATION_022_NOW],
  );
}

interface LegacyReflectionRow {
  id: string;
  user_book_id: string;
  reading_run_id: string | null;
}

async function getReflection(db: SQLiteDatabase, id: string): Promise<LegacyReflectionRow | null> {
  return db.getFirstAsync<LegacyReflectionRow>(`SELECT * FROM pre_reading_reflection WHERE id = ?`, [id]);
}

describe('migrateDbIfNeeded — 022_pre_reading_reflection_run (Фаза 9)', () => {
  it('книга з finished і in_progress run — нотатка лінкується на FINISHED, не на новіший in_progress', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 21);
    await seedBookForReflectionMigration(db, 'ub-q');
    await seedRunForReflectionMigration(db, { id: 'run-q1', userBookId: 'ub-q', runNumber: 1, status: 'finished' });
    await seedRunForReflectionMigration(db, { id: 'run-q2', userBookId: 'ub-q', runNumber: 2, status: 'in_progress' });
    await seedLegacyReflection(db, 'reflection-q', 'ub-q');

    const finalVersion = await migrateDbIfNeeded(db);
    expect(finalVersion).toBe(LATEST_SCHEMA_VERSION);

    const reflection = await getReflection(db, 'reflection-q');
    expect(reflection?.reading_run_id).toBe('run-q1');
  });

  it('кілька FINISHED run — обирається найновіший (найвищий run_number), не перший знайдений', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 21);
    await seedBookForReflectionMigration(db, 'ub-r');
    await seedRunForReflectionMigration(db, { id: 'run-r1', userBookId: 'ub-r', runNumber: 1, status: 'finished' });
    await seedRunForReflectionMigration(db, { id: 'run-r2', userBookId: 'ub-r', runNumber: 2, status: 'finished' });
    await seedLegacyReflection(db, 'reflection-r', 'ub-r');

    await migrateDbIfNeeded(db);

    const reflection = await getReflection(db, 'reflection-r');
    expect(reflection?.reading_run_id).toBe('run-r2');
  });

  it('лише in_progress run (без жодного finished) — фолбек на найновіший run узагалі', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 21);
    await seedBookForReflectionMigration(db, 'ub-s');
    await seedRunForReflectionMigration(db, { id: 'run-s1', userBookId: 'ub-s', runNumber: 1, status: 'in_progress' });
    await seedLegacyReflection(db, 'reflection-s', 'ub-s');

    await migrateDbIfNeeded(db);

    const reflection = await getReflection(db, 'reflection-s');
    expect(reflection?.reading_run_id).toBe('run-s1');
  });

  it('книга без жодного reading_run — reading_run_id лишається NULL, нічого не вигадується', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 21);
    await seedBookForReflectionMigration(db, 'ub-t');
    await seedLegacyReflection(db, 'reflection-t', 'ub-t');

    await migrateDbIfNeeded(db);

    const reflection = await getReflection(db, 'reflection-t');
    expect(reflection?.reading_run_id).toBeNull();
  });

  it('стара UNIQUE(user_book_id) знята: дві нотатки на одну книгу (різні reading_run_id) — без конфлікту', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 21);
    await seedBookForReflectionMigration(db, 'ub-u');
    await seedRunForReflectionMigration(db, { id: 'run-u1', userBookId: 'ub-u', runNumber: 1, status: 'finished' });
    await seedRunForReflectionMigration(db, { id: 'run-u2', userBookId: 'ub-u', runNumber: 2, status: 'finished' });
    await seedLegacyReflection(db, 'reflection-u1', 'ub-u');

    await migrateDbIfNeeded(db);

    // Backfill лінкує reflection-u1 на run-u2 (найновіший FINISHED, п. вище) — другу нотатку
    // навмисно на РЕШТУ run цієї самої книги (run-u1), яка ще без нотатки: після rebuild це
    // більше не конфлікт (стара UNIQUE(user_book_id) заборонила б будь-який другий рядок для
    // ub-u взагалі, незалежно від run).
    const linkedRun = await getReflection(db, 'reflection-u1');
    expect(linkedRun?.reading_run_id).toBe('run-u2');

    await db.runAsync(
      `INSERT INTO pre_reading_reflection (id, user_book_id, reading_run_id, reason_text, expectation_text, expected_rating, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      ['reflection-u2', 'ub-u', 'run-u1', 'Друга нотатка', null, null, MIGRATION_022_NOW, MIGRATION_022_NOW],
    );

    const rows = await db.getAllAsync<LegacyReflectionRow>(
      `SELECT * FROM pre_reading_reflection WHERE user_book_id = ?`,
      ['ub-u'],
    );
    expect(rows).toHaveLength(2);
  });

  it('нова UNIQUE(reading_run_id) ДІЄ: друга нотатка на ТОЙ САМИЙ run кидає виняток', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 21);
    await seedBookForReflectionMigration(db, 'ub-v');
    await seedRunForReflectionMigration(db, { id: 'run-v1', userBookId: 'ub-v', runNumber: 1, status: 'finished' });
    await seedLegacyReflection(db, 'reflection-v1', 'ub-v');
    await migrateDbIfNeeded(db);

    await expect(
      db.runAsync(
        `INSERT INTO pre_reading_reflection (id, user_book_id, reading_run_id, reason_text, expectation_text, expected_rating, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        ['reflection-v2', 'ub-v', 'run-v1', 'Дубль', null, null, MIGRATION_022_NOW, MIGRATION_022_NOW],
      ),
    ).rejects.toThrow();
  });

  it('pre_reading_reflection.reading_run_id — нова колонка, індекс idx_pre_reading_reflection_user_book справді створений', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 21);
    await seedBookForReflectionMigration(db, 'ub-w');
    await seedLegacyReflection(db, 'reflection-w', 'ub-w');

    await migrateDbIfNeeded(db);

    const index = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_pre_reading_reflection_user_book'`,
    );
    expect(index?.name).toBe('idx_pre_reading_reflection_user_book');

    // Поле досі читається без винятку — sanity-check, що rebuild не втратив жодної колонки.
    const reflection = await getReflection(db, 'reflection-w');
    expect(reflection?.user_book_id).toBe('ub-w');
  });
});

/**
 * `023_book_capsule_run.ts` (POLYTSIA V1.6.1, Фаза 10, `docs/READING_RUN.md` §"Фаза 10") —
 * ПРОСТА `ADD COLUMN` (на відміну від rebuild-міграцій 021/022: `book_capsule` ніколи не мала
 * `UNIQUE(user_book_id)`, тож нічого знімати) + JS-backfill за НАЙБЛИЖЧИМ у часі завершеним run
 * (а не "найновіший finished узагалі", як у 021/022) — саме тому, що капсул на книгу вже могло
 * бути КІЛЬКА ще ДО цієї міграції, і кожна мусить прив'язатись до СВОГО run, а не всі до одного.
 */
const MIGRATION_023_NOW = '2026-09-13T00:00:00.000Z';

async function seedBookForCapsuleMigration(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    `${id}-work`,
    `Книга ${id}`,
    MIGRATION_023_NOW,
    MIGRATION_023_NOW,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [`${id}-edition`, `${id}-work`, `Книга ${id}`, 'uk', 'paperback', MIGRATION_023_NOW, MIGRATION_023_NOW],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,'finished',0,?,?)`,
    [id, `${id}-edition`, MIGRATION_023_NOW, MIGRATION_023_NOW],
  );
}

async function seedRunForCapsuleMigration(
  db: SQLiteDatabase,
  params: { id: string; userBookId: string; runNumber: number; status: string; startedAt: string; finishedAt: string | null },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO reading_run (
       id, user_book_id, run_number, status, started_at, finished_at, is_legacy_backfill, created_at, updated_at
     ) VALUES (?,?,?,?,?,?,0,?,?)`,
    [
      params.id,
      params.userBookId,
      params.runNumber,
      params.status,
      params.startedAt,
      params.finishedAt,
      params.startedAt,
      params.finishedAt ?? params.startedAt,
    ],
  );
}

/** Капсула у СТАРІЙ схемі `book_capsule` (версія 22 — ще без `reading_run_id`), з явним `created_at`
 * для контролю "найближчого в часі" backfill-збігу. */
async function seedLegacyCapsule(db: SQLiteDatabase, id: string, userBookId: string, createdAt: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO book_capsule (id, user_book_id, lasting_thought, reopen_option, created_at, updated_at)
     VALUES (?,?,?,?,?,?)`,
    [id, userBookId, `Капсула ${id}`, 'none', createdAt, createdAt],
  );
}

interface LegacyCapsuleRow {
  id: string;
  user_book_id: string;
  reading_run_id: string | null;
}

async function getCapsule(db: SQLiteDatabase, id: string): Promise<LegacyCapsuleRow | null> {
  return db.getFirstAsync<LegacyCapsuleRow>(`SELECT * FROM book_capsule WHERE id = ?`, [id]);
}

describe('migrateDbIfNeeded — 023_book_capsule_run (Фаза 10)', () => {
  it('одна капсула, один finished run — лінкується на нього', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 22);
    await seedBookForCapsuleMigration(db, 'ub-x');
    await seedRunForCapsuleMigration(db, {
      id: 'run-x1',
      userBookId: 'ub-x',
      runNumber: 1,
      status: 'finished',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-10T00:00:00.000Z',
    });
    await seedLegacyCapsule(db, 'capsule-x', 'ub-x', '2026-01-11T00:00:00.000Z');

    const finalVersion = await migrateDbIfNeeded(db);
    expect(finalVersion).toBe(LATEST_SCHEMA_VERSION);

    const capsule = await getCapsule(db, 'capsule-x');
    expect(capsule?.reading_run_id).toBe('run-x1');
  });

  it('перечитування: капсула створена ПІСЛЯ другого фінішу — лінкується на найближчий (другий) run, не на перший', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 22);
    await seedBookForCapsuleMigration(db, 'ub-y');
    await seedRunForCapsuleMigration(db, {
      id: 'run-y1',
      userBookId: 'ub-y',
      runNumber: 1,
      status: 'finished',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-10T00:00:00.000Z',
    });
    await seedRunForCapsuleMigration(db, {
      id: 'run-y2',
      userBookId: 'ub-y',
      runNumber: 2,
      status: 'finished',
      startedAt: '2026-03-01T00:00:00.000Z',
      finishedAt: '2026-03-10T00:00:00.000Z',
    });
    // Одна легасі-капсула, створена невдовзі ПІСЛЯ другого фінішу.
    await seedLegacyCapsule(db, 'capsule-y', 'ub-y', '2026-03-11T00:00:00.000Z');

    await migrateDbIfNeeded(db);

    const capsule = await getCapsule(db, 'capsule-y');
    expect(capsule?.reading_run_id).toBe('run-y2');
  });

  it('дві легасі-капсули тієї самої книги — КОЖНА лінкується на СВІЙ найближчий run, не обидві на останній', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 22);
    await seedBookForCapsuleMigration(db, 'ub-z');
    await seedRunForCapsuleMigration(db, {
      id: 'run-z1',
      userBookId: 'ub-z',
      runNumber: 1,
      status: 'finished',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-10T00:00:00.000Z',
    });
    await seedRunForCapsuleMigration(db, {
      id: 'run-z2',
      userBookId: 'ub-z',
      runNumber: 2,
      status: 'finished',
      startedAt: '2026-03-01T00:00:00.000Z',
      finishedAt: '2026-03-10T00:00:00.000Z',
    });
    // Перша капсула — невдовзі після ПЕРШОГО фінішу; друга — невдовзі після ДРУГОГО.
    await seedLegacyCapsule(db, 'capsule-z1', 'ub-z', '2026-01-12T00:00:00.000Z');
    await seedLegacyCapsule(db, 'capsule-z2', 'ub-z', '2026-03-12T00:00:00.000Z');

    await migrateDbIfNeeded(db);

    expect((await getCapsule(db, 'capsule-z1'))?.reading_run_id).toBe('run-z1');
    expect((await getCapsule(db, 'capsule-z2'))?.reading_run_id).toBe('run-z2');
  });

  it('капсула СТАРІША за будь-який finished run (немає жодного run із finished_at ≤ created_at) — reading_run_id лишається NULL', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 22);
    await seedBookForCapsuleMigration(db, 'ub-aa');
    await seedRunForCapsuleMigration(db, {
      id: 'run-aa1',
      userBookId: 'ub-aa',
      runNumber: 1,
      status: 'finished',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-10T00:00:00.000Z',
    });
    // Аномалія легасі-даних: капсула "старша" за єдиний finished run цієї книги.
    await seedLegacyCapsule(db, 'capsule-aa', 'ub-aa', '2025-01-01T00:00:00.000Z');

    await migrateDbIfNeeded(db);

    expect((await getCapsule(db, 'capsule-aa'))?.reading_run_id).toBeNull();
  });

  it('книга без жодного reading_run — reading_run_id лишається NULL, нічого не вигадується', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 22);
    await seedBookForCapsuleMigration(db, 'ub-bb');
    await seedLegacyCapsule(db, 'capsule-bb', 'ub-bb', MIGRATION_023_NOW);

    await migrateDbIfNeeded(db);

    expect((await getCapsule(db, 'capsule-bb'))?.reading_run_id).toBeNull();
  });

  it('лише in_progress run (не finished/did_not_finish) — НЕ рахується кандидатом, reading_run_id лишається NULL', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 22);
    await seedBookForCapsuleMigration(db, 'ub-cc');
    await seedRunForCapsuleMigration(db, {
      id: 'run-cc1',
      userBookId: 'ub-cc',
      runNumber: 1,
      status: 'in_progress',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    });
    await seedLegacyCapsule(db, 'capsule-cc', 'ub-cc', '2026-01-05T00:00:00.000Z');

    await migrateDbIfNeeded(db);

    expect((await getCapsule(db, 'capsule-cc'))?.reading_run_id).toBeNull();
  });

  it('book_capsule.reading_run_id — нова колонка, індекс idx_book_capsule_reading_run справді створений', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 22);
    await seedBookForCapsuleMigration(db, 'ub-dd');
    await seedLegacyCapsule(db, 'capsule-dd', 'ub-dd', MIGRATION_023_NOW);

    await migrateDbIfNeeded(db);

    const index = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_book_capsule_reading_run'`,
    );
    expect(index?.name).toBe('idx_book_capsule_reading_run');

    // Поле досі читається без винятку — sanity-check, що ADD COLUMN не зламав решту колонок.
    const capsule = await getCapsule(db, 'capsule-dd');
    expect(capsule?.user_book_id).toBe('ub-dd');
  });
});

/**
 * Фаза 11 (`024_dnf_reflection_run.ts`) — на відміну від `023` (проста `ADD COLUMN`, бо
 * `book_capsule` ніколи не мала `UNIQUE(user_book_id)`), `dnf_reflection` цю UNIQUE МАЛА, тож
 * тут rebuild-ідіом, той самий, що й `021`/`022`. Backfill — ІНША логіка, ніж усі три попередні:
 * (1) кандидатом рахується ЛИШЕ `did_not_finish`-run (не "`finished` АБО `did_not_finish`", як
 * у `021`/`022`/`023`) — DNF-знімок концептуально не може належати `finished`-run'у; (2) якщо
 * жодного run із `finished_at <= created_at` немає, фолбек — НАЙНОВІШИЙ `did_not_finish`-run
 * книги (а не `NULL`, як у `023`) — той самий принцип "легасі-знімок точно належав ЯКОМУСЬ
 * did_not_finish-run'у книги, навіть якщо час трохи розходиться", докладніше —
 * `docs/READING_RUN.md` §"Фаза 11".
 */
const MIGRATION_024_NOW = '2026-09-13T00:00:00.000Z';

async function seedBookForDnfMigration(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    `${id}-work`,
    `Книга ${id}`,
    MIGRATION_024_NOW,
    MIGRATION_024_NOW,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [`${id}-edition`, `${id}-work`, `Книга ${id}`, 'uk', 'paperback', MIGRATION_024_NOW, MIGRATION_024_NOW],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,'did_not_finish',0,?,?)`,
    [id, `${id}-edition`, MIGRATION_024_NOW, MIGRATION_024_NOW],
  );
}

async function seedRunForDnfMigration(
  db: SQLiteDatabase,
  params: { id: string; userBookId: string; runNumber: number; status: string; startedAt: string; finishedAt: string | null },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO reading_run (
       id, user_book_id, run_number, status, started_at, finished_at, is_legacy_backfill, created_at, updated_at
     ) VALUES (?,?,?,?,?,?,0,?,?)`,
    [
      params.id,
      params.userBookId,
      params.runNumber,
      params.status,
      params.startedAt,
      params.finishedAt,
      params.startedAt,
      params.finishedAt ?? params.startedAt,
    ],
  );
}

/** DNF-знімок у СТАРІЙ схемі `dnf_reflection` (версія 23 — ще без `reading_run_id`, з
 * `UNIQUE(user_book_id)`), з явним `created_at` для контролю "найближчого в часі" backfill-збігу. */
async function seedLegacyDnfReflection(
  db: SQLiteDatabase,
  id: string,
  userBookId: string,
  createdAt: string,
  page = 50,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO dnf_reflection (id, user_book_id, page, created_at, updated_at) VALUES (?,?,?,?,?)`,
    [id, userBookId, page, createdAt, createdAt],
  );
}

interface LegacyDnfReflectionRow {
  id: string;
  user_book_id: string;
  reading_run_id: string | null;
  page: number;
}

async function getDnfReflectionRow(db: SQLiteDatabase, id: string): Promise<LegacyDnfReflectionRow | null> {
  return db.getFirstAsync<LegacyDnfReflectionRow>(`SELECT * FROM dnf_reflection WHERE id = ?`, [id]);
}

describe('migrateDbIfNeeded — 024_dnf_reflection_run (Фаза 11)', () => {
  it('один знімок, один did_not_finish run з finished_at ≤ created_at — лінкується на нього', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 23);
    await seedBookForDnfMigration(db, 'ub-x');
    await seedRunForDnfMigration(db, {
      id: 'run-x1',
      userBookId: 'ub-x',
      runNumber: 1,
      status: 'did_not_finish',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-10T00:00:00.000Z',
    });
    await seedLegacyDnfReflection(db, 'dnf-x', 'ub-x', '2026-01-10T00:05:00.000Z', 88);

    const finalVersion = await migrateDbIfNeeded(db);
    expect(finalVersion).toBe(LATEST_SCHEMA_VERSION);

    const row = await getDnfReflectionRow(db, 'dnf-x');
    expect(row?.reading_run_id).toBe('run-x1');
    expect(row?.page).toBe(88);
  });

  it('два did_not_finish run — легасі-знімок (записаний невдовзі після ПЕРШОГО) лінкується на найближчий (перший), не на найновіший', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 23);
    await seedBookForDnfMigration(db, 'ub-y');
    await seedRunForDnfMigration(db, {
      id: 'run-y1',
      userBookId: 'ub-y',
      runNumber: 1,
      status: 'did_not_finish',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-10T00:00:00.000Z',
    });
    await seedRunForDnfMigration(db, {
      id: 'run-y2',
      userBookId: 'ub-y',
      runNumber: 2,
      status: 'did_not_finish',
      startedAt: '2026-03-01T00:00:00.000Z',
      finishedAt: '2026-03-10T00:00:00.000Z',
    });
    // ДО Фази 11 captureIfMissing спрацьовував ЩОНАЙБІЛЬШЕ раз на все життя книги — легасі-рядок
    // зафіксував ПЕРШИЙ епізод "Не дочитав", хоча найновіший did_not_finish-run книги — другий.
    await seedLegacyDnfReflection(db, 'dnf-y', 'ub-y', '2026-01-10T00:05:00.000Z', 40);

    await migrateDbIfNeeded(db);

    const row = await getDnfReflectionRow(db, 'dnf-y');
    expect(row?.reading_run_id).toBe('run-y1');
  });

  it('знімок СТАРІШИЙ за будь-який did_not_finish run (жоден finished_at ≤ created_at) — фолбек на НАЙНОВІШИЙ did_not_finish run, НЕ NULL', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 23);
    await seedBookForDnfMigration(db, 'ub-z');
    await seedRunForDnfMigration(db, {
      id: 'run-z1',
      userBookId: 'ub-z',
      runNumber: 1,
      status: 'did_not_finish',
      startedAt: '2026-03-01T00:00:00.000Z',
      finishedAt: '2026-03-10T00:00:00.000Z',
    });
    await seedRunForDnfMigration(db, {
      id: 'run-z2',
      userBookId: 'ub-z',
      runNumber: 2,
      status: 'did_not_finish',
      startedAt: '2026-05-01T00:00:00.000Z',
      finishedAt: '2026-05-10T00:00:00.000Z',
    });
    // Аномалія легасі-даних: знімок "старіший" за ОБИДВА did_not_finish run — на відміну від
    // `023` (де це дало б NULL), тут фолбек — найновіший did_not_finish run книги (run-z2).
    await seedLegacyDnfReflection(db, 'dnf-z', 'ub-z', '2026-01-01T00:00:00.000Z', 20);

    await migrateDbIfNeeded(db);

    const row = await getDnfReflectionRow(db, 'dnf-z');
    expect(row?.reading_run_id).toBe('run-z2');
  });

  it('книга має лише finished run (жодного did_not_finish) — reading_run_id лишається NULL', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 23);
    await seedBookForDnfMigration(db, 'ub-aa');
    await seedRunForDnfMigration(db, {
      id: 'run-aa1',
      userBookId: 'ub-aa',
      runNumber: 1,
      status: 'finished',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-10T00:00:00.000Z',
    });
    // Легасі-дані з часів до Фази 6 (reading_run) могли лишити DNF-знімок навіть на книзі, чий
    // ЄДИНИЙ відомий run зрештою вважається finished (наприклад, ручна корекція статусу) —
    // finished-run НІКОЛИ не рахується кандидатом для DNF-знімка.
    await seedLegacyDnfReflection(db, 'dnf-aa', 'ub-aa', '2026-01-05T00:00:00.000Z', 15);

    await migrateDbIfNeeded(db);

    expect((await getDnfReflectionRow(db, 'dnf-aa'))?.reading_run_id).toBeNull();
  });

  it('книга без жодного reading_run — reading_run_id лишається NULL, нічого не вигадується', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 23);
    await seedBookForDnfMigration(db, 'ub-bb');
    await seedLegacyDnfReflection(db, 'dnf-bb', 'ub-bb', MIGRATION_024_NOW, 5);

    await migrateDbIfNeeded(db);

    expect((await getDnfReflectionRow(db, 'dnf-bb'))?.reading_run_id).toBeNull();
  });

  it('лише in_progress run (не did_not_finish) — НЕ рахується кандидатом, reading_run_id лишається NULL', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 23);
    await seedBookForDnfMigration(db, 'ub-cc');
    await seedRunForDnfMigration(db, {
      id: 'run-cc1',
      userBookId: 'ub-cc',
      runNumber: 1,
      status: 'in_progress',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    });
    await seedLegacyDnfReflection(db, 'dnf-cc', 'ub-cc', '2026-01-05T00:00:00.000Z', 7);

    await migrateDbIfNeeded(db);

    expect((await getDnfReflectionRow(db, 'dnf-cc'))?.reading_run_id).toBeNull();
  });

  it('dnf_reflection.reading_run_id — нова колонка, індекс idx_dnf_reflection_user_book справді створений', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 23);
    await seedBookForDnfMigration(db, 'ub-dd');
    await seedLegacyDnfReflection(db, 'dnf-dd', 'ub-dd', MIGRATION_024_NOW, 3);

    await migrateDbIfNeeded(db);

    const index = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_dnf_reflection_user_book'`,
    );
    expect(index?.name).toBe('idx_dnf_reflection_user_book');

    // Поле досі читається без винятку — sanity-check, що rebuild не зламав решту колонок.
    const row = await getDnfReflectionRow(db, 'dnf-dd');
    expect(row?.user_book_id).toBe('ub-dd');
    expect(row?.page).toBe(3);
  });
});

/**
 * `025_rating_run.ts` (POLYTSIA V1.6.1, Фаза 12, `docs/READING_RUN.md` §"Фаза 12") — rebuild
 * `rating` (`UNIQUE(user_book_id)` → `UNIQUE(reading_run_id)`) + JS-backfill. Структура й сам
 * пріоритет backfill дзеркалять `021_book_memory_run` (НЕ `024_dnf_reflection_run` — рейтинг,
 * на відміну від DNF-знімка, не обмежений лише `did_not_finish` run: найновіший
 * `finished`/`did_not_finish` run, інакше найновіший run узагалі, інакше `NULL`).
 */
const MIGRATION_025_NOW = '2026-09-13T00:00:00.000Z';

async function seedBookForRatingMigration(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    `${id}-work`,
    `Книга ${id}`,
    MIGRATION_025_NOW,
    MIGRATION_025_NOW,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [`${id}-edition`, `${id}-work`, `Книга ${id}`, 'uk', 'paperback', MIGRATION_025_NOW, MIGRATION_025_NOW],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,'finished',0,?,?)`,
    [id, `${id}-edition`, MIGRATION_025_NOW, MIGRATION_025_NOW],
  );
}

async function seedRunForRatingMigration(
  db: SQLiteDatabase,
  params: { id: string; userBookId: string; runNumber: number; status: string },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO reading_run (
       id, user_book_id, run_number, status, started_at, finished_at, is_legacy_backfill, created_at, updated_at
     ) VALUES (?,?,?,?,?,?,0,?,?)`,
    [
      params.id,
      params.userBookId,
      params.runNumber,
      params.status,
      MIGRATION_025_NOW,
      params.status === 'in_progress' ? null : MIGRATION_025_NOW,
      MIGRATION_025_NOW,
      MIGRATION_025_NOW,
    ],
  );
}

/** Оцінка у СТАРІЙ схемі `rating` (версія 24 — ще без `reading_run_id`). */
async function seedLegacyRating(db: SQLiteDatabase, id: string, userBookId: string, value: number): Promise<void> {
  await db.runAsync(
    `INSERT INTO rating (id, user_book_id, value, review, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
    [id, userBookId, value, null, MIGRATION_025_NOW, MIGRATION_025_NOW],
  );
}

interface LegacyRatingRow {
  id: string;
  user_book_id: string;
  reading_run_id: string | null;
  value: number;
}

async function getRatingRow(db: SQLiteDatabase, id: string): Promise<LegacyRatingRow | null> {
  return db.getFirstAsync<LegacyRatingRow>(`SELECT * FROM rating WHERE id = ?`, [id]);
}

describe('migrateDbIfNeeded — 025_rating_run (Фаза 12)', () => {
  it('книга з finished і in_progress run — оцінка лінкується на FINISHED, не на новіший in_progress', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 24);
    await seedBookForRatingMigration(db, 'ub-j');
    await seedRunForRatingMigration(db, { id: 'run-j1', userBookId: 'ub-j', runNumber: 1, status: 'finished' });
    await seedRunForRatingMigration(db, { id: 'run-j2', userBookId: 'ub-j', runNumber: 2, status: 'in_progress' });
    await seedLegacyRating(db, 'rating-j', 'ub-j', 4);

    const finalVersion = await migrateDbIfNeeded(db);
    expect(finalVersion).toBe(LATEST_SCHEMA_VERSION);

    const rating = await getRatingRow(db, 'rating-j');
    expect(rating?.reading_run_id).toBe('run-j1');
  });

  it('кілька FINISHED run — обирається найновіший (найвищий run_number), не перший знайдений', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 24);
    await seedBookForRatingMigration(db, 'ub-n');
    await seedRunForRatingMigration(db, { id: 'run-n1', userBookId: 'ub-n', runNumber: 1, status: 'finished' });
    await seedRunForRatingMigration(db, { id: 'run-n2', userBookId: 'ub-n', runNumber: 2, status: 'finished' });
    await seedLegacyRating(db, 'rating-n', 'ub-n', 3.5);

    await migrateDbIfNeeded(db);

    const rating = await getRatingRow(db, 'rating-n');
    expect(rating?.reading_run_id).toBe('run-n2');
  });

  it('did_not_finish run теж рахується кандидатом — оцінка кинутої, але оціненої книги лінкується на нього', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 24);
    await seedBookForRatingMigration(db, 'ub-q');
    await seedRunForRatingMigration(db, { id: 'run-q1', userBookId: 'ub-q', runNumber: 1, status: 'did_not_finish' });
    await seedLegacyRating(db, 'rating-q', 'ub-q', 1.5);

    await migrateDbIfNeeded(db);

    const rating = await getRatingRow(db, 'rating-q');
    expect(rating?.reading_run_id).toBe('run-q1');
  });

  it('лише in_progress run (без жодного finished/did_not_finish) — фолбек на найновіший run узагалі', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 24);
    await seedBookForRatingMigration(db, 'ub-k');
    await seedRunForRatingMigration(db, { id: 'run-k1', userBookId: 'ub-k', runNumber: 1, status: 'in_progress' });
    await seedLegacyRating(db, 'rating-k', 'ub-k', 5);

    await migrateDbIfNeeded(db);

    const rating = await getRatingRow(db, 'rating-k');
    expect(rating?.reading_run_id).toBe('run-k1');
  });

  it('книга без жодного reading_run — reading_run_id лишається NULL, нічого не вигадується', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 24);
    await seedBookForRatingMigration(db, 'ub-l');
    await seedLegacyRating(db, 'rating-l', 'ub-l', 2);

    await migrateDbIfNeeded(db);

    const rating = await getRatingRow(db, 'rating-l');
    expect(rating?.reading_run_id).toBeNull();
  });

  it('стара UNIQUE(user_book_id) знята: дві оцінки на одну книгу (різні reading_run_id) — без конфлікту', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 24);
    await seedBookForRatingMigration(db, 'ub-m');
    await seedRunForRatingMigration(db, { id: 'run-m1', userBookId: 'ub-m', runNumber: 1, status: 'finished' });
    await seedRunForRatingMigration(db, { id: 'run-m2', userBookId: 'ub-m', runNumber: 2, status: 'finished' });
    await seedLegacyRating(db, 'rating-m1', 'ub-m', 3);

    await migrateDbIfNeeded(db);

    // Backfill лінкує rating-m1 на run-m2 (найновіший FINISHED, п. вище) — друга оцінка
    // навмисно на РЕШТУ run цієї самої книги (run-m1), яка ще без оцінки: після rebuild це
    // більше не конфлікт (стара UNIQUE(user_book_id) заборонила б будь-який другий рядок для
    // ub-m взагалі, незалежно від run).
    const linked = await getRatingRow(db, 'rating-m1');
    expect(linked?.reading_run_id).toBe('run-m2');

    await db.runAsync(
      `INSERT INTO rating (id, user_book_id, reading_run_id, value, review, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['rating-m2', 'ub-m', 'run-m1', 4.5, null, MIGRATION_025_NOW, MIGRATION_025_NOW],
    );

    const rows = await db.getAllAsync<LegacyRatingRow>(`SELECT * FROM rating WHERE user_book_id = ?`, ['ub-m']);
    expect(rows).toHaveLength(2);
  });

  it('нова UNIQUE(reading_run_id) ДІЄ: друга оцінка на ТОЙ САМИЙ run кидає виняток', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 24);
    await seedBookForRatingMigration(db, 'ub-o');
    await seedRunForRatingMigration(db, { id: 'run-o1', userBookId: 'ub-o', runNumber: 1, status: 'finished' });
    await seedLegacyRating(db, 'rating-o1', 'ub-o', 4);
    await migrateDbIfNeeded(db);

    await expect(
      db.runAsync(
        `INSERT INTO rating (id, user_book_id, reading_run_id, value, review, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
        ['rating-o2', 'ub-o', 'run-o1', 5, null, MIGRATION_025_NOW, MIGRATION_025_NOW],
      ),
    ).rejects.toThrow();
  });

  it('rating.reading_run_id — нова колонка, індекс idx_rating_user_book справді створений', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 24);
    await seedBookForRatingMigration(db, 'ub-p');
    await seedLegacyRating(db, 'rating-p', 'ub-p', 4);

    await migrateDbIfNeeded(db);

    const index = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_rating_user_book'`,
    );
    expect(index?.name).toBe('idx_rating_user_book');

    // Поле досі читається без винятку — sanity-check, що rebuild не втратив жодної колонки.
    const rating = await getRatingRow(db, 'rating-p');
    expect(rating?.user_book_id).toBe('ub-p');
    expect(rating?.value).toBe(4);
  });
});

/**
 * `026_hot_query_indexes.ts` (POLYTSIA V1.6.1, Фаза 24: PERFORMANCE / INDEX AUDIT,
 * `docs/PERFORMANCE_AUDIT.md`) — той самий "чистий CREATE/DROP INDEX, без нової колонки і без
 * per-row backfill" клас міграції, що й `018_shelf_book_index.ts` (тест 018 вище): існуючі рядки
 * мають лишитись недоторканими, нові індекси — реально з'явитися в `sqlite_master`, а старі
 * (тепер надлишкові — композит покриває їх за leftmost-prefix rule) — реально зникнути. На
 * відміну від 018 (один новий індекс на одній таблиці), тут п'ять нових індексів на чотирьох
 * таблицях і чотири видалених — тому трохи більше тестів, ніж у 018, але без окремого тесту на
 * кожен individual index (це вже перевірено емпірично бенчмарком, не по одному в кожному it()).
 */
const MIGRATION_026_NOW = '2026-09-13T00:00:00.000Z';

describe('migrateDbIfNeeded — 026_hot_query_indexes (Фаза 24)', () => {
  async function seedPreMigration026Data(db: SQLiteDatabase): Promise<void> {
    await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
      'work-1',
      'Книга 1',
      MIGRATION_026_NOW,
      MIGRATION_026_NOW,
    ]);
    // Видання з isbn10 БЕЗ isbn13 — саме той рядок, який до цієї міграції змушував
    // `EditionRepository.getByIsbn` падати в повний SCAN (нема індексу на isbn10).
    await db.runAsync(
      `INSERT INTO edition (id, work_id, title, isbn10, isbn13, language, format, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      ['edition-1', 'work-1', 'Книга 1', '1234567890', null, 'uk', 'paperback', MIGRATION_026_NOW, MIGRATION_026_NOW],
    );
    await db.runAsync(
      `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,'reading',0,?,?)`,
      ['ub-1', 'edition-1', MIGRATION_026_NOW, MIGRATION_026_NOW],
    );
    await db.runAsync(
      `INSERT INTO note (id, user_book_id, type, text, created_at, updated_at) VALUES (?,?,'general',?,?,?)`,
      ['note-1', 'ub-1', 'Нотатка до міграції 026', MIGRATION_026_NOW, MIGRATION_026_NOW],
    );
    await db.runAsync(
      `INSERT INTO quote (id, user_book_id, edition_id, text, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      ['quote-1', 'ub-1', 'edition-1', 'Цитата до міграції 026', MIGRATION_026_NOW, MIGRATION_026_NOW],
    );
    await db.runAsync(
      `INSERT INTO reading_session (
         id, user_book_id, started_at, ended_at, paused_intervals, start_page, end_page,
         duration_seconds, is_edited, created_at, updated_at
       ) VALUES (?,?,?,?,'[]',?,?,?,0,?,?)`,
      ['session-1', 'ub-1', MIGRATION_026_NOW, MIGRATION_026_NOW, 10, 25, 600, MIGRATION_026_NOW, MIGRATION_026_NOW],
    );
  }

  it('старі рядки (edition/user_book/note/quote/reading_session) лишаються недоторканими після міграції', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 25);
    await seedPreMigration026Data(db);

    const finalVersion = await migrateDbIfNeeded(db);
    expect(finalVersion).toBe(LATEST_SCHEMA_VERSION);

    const edition = await db.getFirstAsync<{ isbn10: string | null; isbn13: string | null }>(
      `SELECT isbn10, isbn13 FROM edition WHERE id = ?`,
      ['edition-1'],
    );
    expect(edition).toEqual({ isbn10: '1234567890', isbn13: null });

    // Сам запит getByIsbn (лише isbn10, без isbn13) і далі знаходить рядок — не лише індекс
    // з'явився, а й поведінка читання не зламана.
    const found = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM edition WHERE (isbn10 = ? OR isbn13 = ?) AND deleted_at IS NULL LIMIT 1`,
      ['1234567890', '1234567890'],
    );
    expect(found?.id).toBe('edition-1');

    const note = await db.getFirstAsync<{ text: string }>(`SELECT text FROM note WHERE id = ?`, ['note-1']);
    expect(note?.text).toBe('Нотатка до міграції 026');

    const quote = await db.getFirstAsync<{ text: string }>(`SELECT text FROM quote WHERE id = ?`, ['quote-1']);
    expect(quote?.text).toBe('Цитата до міграції 026');

    const session = await db.getFirstAsync<{ start_page: number }>(
      `SELECT start_page FROM reading_session WHERE id = ?`,
      ['session-1'],
    );
    expect(session?.start_page).toBe(10);
  });

  it('усі 5 нових композитних/одноколонкових індексів справді створені', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 25);
    await seedPreMigration026Data(db);
    await migrateDbIfNeeded(db);

    const names = [
      'idx_edition_isbn10',
      'idx_user_book_status_updated_at',
      'idx_note_user_book_created_at',
      'idx_quote_user_book_created_at',
      'idx_session_user_book_started_at',
    ];
    const rows = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name IN (${names.map(() => '?').join(',')}) ORDER BY name`,
      names,
    );
    expect(rows.map((r) => r.name)).toEqual([...names].sort());
  });

  it('старі надлишкові одноколонкові індекси видалені (композит покриває їх за leftmost-prefix); idx_edition_isbn13 лишається', async () => {
    const db = await openTestDatabase();
    await __applyMigrationsForTests(db, 25);
    await seedPreMigration026Data(db);
    await migrateDbIfNeeded(db);

    const dropped = ['idx_user_book_status', 'idx_note_user_book', 'idx_quote_user_book', 'idx_session_user_book'];
    const stillThere = await db.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name IN (${dropped.map(() => '?').join(',')})`,
      dropped,
    );
    expect(stillThere).toHaveLength(0);

    // isbn13 — НЕ видалений: MULTI-INDEX OR потребує ОБИДВА одноколонкові індекси (isbn10 і
    // isbn13), композит тут не застосовний (два різні стовпці в диз'юнкції, не filter+sort
    // однієї таблиці).
    const isbn13Index = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_edition_isbn13'`,
    );
    expect(isbn13Index?.name).toBe('idx_edition_isbn13');
  });
});
