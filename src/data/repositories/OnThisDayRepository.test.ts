import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { OnThisDayRepository } from './OnThisDayRepository';

/**
 * Repository-інтеграційний тест для `OnThisDayRepository` (POLYTSIA V1.6, Фаза 3). Той самий
 * `openMigratedTestDb()`/seed-патерн, що й `RatingRepository.test.ts`. `NO_SHIFT` — нейтральний
 * `strftime`-модифікатор ("+0 minutes"), яким тестуємо саму логіку відбору незалежно від
 * часового поясу; окремий блок нижче явно перевіряє зсув поясу (п.24 ТЗ — "local timezone
 * boundary").
 */

const NOW = '2026-01-01T00:00:00.000Z';
const NO_SHIFT = '+0 minutes';

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

async function seedBook(
  db: SQLiteDatabase,
  id: string,
  opts: { startedAt?: string | null; finishedAt?: string | null; deleted?: boolean } = {},
): Promise<void> {
  await db.runAsync(`INSERT INTO work (id, title, cover_fallback_color, created_at, updated_at) VALUES (?,?,?,?,?)`, [
    `${id}-work`,
    `Книга ${id}`,
    '#123456',
    NOW,
    NOW,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [`${id}-edition`, `${id}-work`, `Книга ${id}`, 'uk', 'paperback', NOW, NOW],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, started_at, finished_at, added_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, `${id}-edition`, 'reading', 0, opts.startedAt ?? null, opts.finishedAt ?? null, NOW, NOW, opts.deleted ? NOW : null],
  );
}

async function seedSession(
  db: SQLiteDatabase,
  id: string,
  userBookId: string,
  startedAt: string,
  opts: { endPage?: number; startPage?: number; durationSeconds?: number } = {},
): Promise<void> {
  await db.runAsync(
    `INSERT INTO reading_session (id, user_book_id, started_at, ended_at, start_page, end_page, duration_seconds, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, userBookId, startedAt, startedAt, opts.startPage ?? 1, opts.endPage ?? 30, opts.durationSeconds ?? 1800, NOW, NOW],
  );
}

async function seedNote(
  db: SQLiteDatabase,
  id: string,
  userBookId: string,
  createdAt: string,
  opts: { text?: string; isFavorite?: boolean; page?: number | null } = {},
): Promise<void> {
  await db.runAsync(
    `INSERT INTO note (id, user_book_id, type, text, is_favorite, page, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    [id, userBookId, 'general', opts.text ?? 'Нотатка', opts.isFavorite ? 1 : 0, opts.page ?? null, createdAt, createdAt],
  );
}

describe('OnThisDayRepository.listByMonthDay — відбір за місяцем+днем', () => {
  it('повертає подію лише з тим самим місяцем+днем, ігнорує рік і сусідні дні', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'a');
    await seedSession(db, 's-match', 'a', '2024-09-11T10:00:00.000Z');
    await seedSession(db, 's-other-day', 'a', '2025-09-12T10:00:00.000Z');
    await seedSession(db, 's-other-year-same-day', 'a', '2022-09-11T08:00:00.000Z');

    const rows = await OnThisDayRepository.listByMonthDay(db, '09-11', NO_SHIFT);

    expect(rows.map((r) => r.id).sort()).toEqual(['s-match', 's-other-year-same-day'].sort());
  });

  it('без збігів — порожній масив', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'a');
    await seedSession(db, 's-1', 'a', '2024-01-01T10:00:00.000Z');
    expect(await OnThisDayRepository.listByMonthDay(db, '09-11', NO_SHIFT)).toEqual([]);
  });
});

describe('OnThisDayRepository.listByMonthDay — джерела подій', () => {
  it('book_started/book_finished — за started_at/finished_at user_book', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'a', { startedAt: '2024-09-11T08:00:00.000Z', finishedAt: '2024-09-20T08:00:00.000Z' });
    await seedBook(db, 'b', { startedAt: '2023-09-11T08:00:00.000Z' });

    const rows = await OnThisDayRepository.listByMonthDay(db, '09-11', NO_SHIFT);
    const sources = rows.map((r) => r.source).sort();
    expect(sources).toEqual(['started', 'started']);
  });

  it('book_finished — за finished_at, коли він збігається з цільовим місяцем+днем', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'a', { startedAt: '2024-01-01T08:00:00.000Z', finishedAt: '2024-09-11T20:00:00.000Z' });

    const rows = await OnThisDayRepository.listByMonthDay(db, '09-11', NO_SHIFT);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe('finished');
  });

  it('нотатка/цитата — з is_favorite і page, коректно змаплені', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'a');
    await seedNote(db, 'n-1', 'a', '2024-09-11T10:00:00.000Z', { text: 'Улюблена думка', isFavorite: true, page: 55 });

    const rows = await OnThisDayRepository.listByMonthDay(db, '09-11', NO_SHIFT);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'note', entryText: 'Улюблена думка', isFavorite: true, entryPage: 55 });
  });
});

describe('OnThisDayRepository.listByMonthDay — видалені книги', () => {
  it('м\'яко видалений (deleted_at) user_book не потрапляє у вибірку, і запит не падає', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'a', { deleted: true });
    await seedSession(db, 's-1', 'a', '2024-09-11T10:00:00.000Z');

    const rows = await OnThisDayRepository.listByMonthDay(db, '09-11', NO_SHIFT);
    expect(rows).toEqual([]);
  });
});

describe('OnThisDayRepository.listByMonthDay — локальна межа доби (п.24 ТЗ)', () => {
  it('сесія, що почалась пізно ввечері за місцевим часом (UTC+3) — знаходиться за ЛОКАЛЬНИМ днем, не UTC', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, 'a');
    // 2025-09-10T21:30 UTC = 2025-09-11T00:30 за місцевим часом UTC+3 — має належати "11 вересня".
    await seedSession(db, 's-late', 'a', '2025-09-10T21:30:00.000Z');

    const withoutShift = await OnThisDayRepository.listByMonthDay(db, '09-11', NO_SHIFT);
    expect(withoutShift).toEqual([]); // UTC-дата тут насправді 09-10 — без зсуву не знаходить

    const withShift = await OnThisDayRepository.listByMonthDay(db, '09-11', '+180 minutes');
    expect(withShift.map((r) => r.id)).toEqual(['s-late']);
  });
});
