import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { RatingRepository } from './RatingRepository';
import { ReadingRunRepository } from './ReadingRunRepository';

/**
 * Repository-інтеграційний тест для `RatingRepository` — REREADING MODEL, Фаза 12
 * (`docs/READING_RUN.md` §"Фаза 12"). Структура дзеркалить `DnfReflectionRepository.test.ts`
 * (Фаза 11) — та сама модель "поточний run визначається сама репозиторієм" для `getCurrent`/
 * `upsertCurrent`, плюс окремий блок для батч-методу `listByUserBookIds`, якого немає у DNF:
 * тут важливо перевірити, що зовнішні споживачі (Wrapped/Сезони/Профіль/"Цього дня") і далі
 * отримують РІВНО одну, найновішу оцінку на книгу, навіть коли рядків тепер кілька (по одному
 * на run).
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

async function seedUserBook(db: SQLiteDatabase, id: string): Promise<void> {
  const now = new Date().toISOString();
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
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,'reading',0,?,?)`,
    [id, `${id}-edition`, now, now],
  );
}

describe('RatingRepository.getCurrent / upsertCurrent — поточний run', () => {
  it('null, якщо оцінки для поточного run ще немає', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    await ReadingRunRepository.start(db, { userBookId: 'ub-1' });

    expect(await RatingRepository.getCurrent(db, 'ub-1')).toBeNull();
  });

  it('перший виклик upsertCurrent створює новий рядок, прив\'язаний до поточного run', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-2');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-2' });

    const rating = await RatingRepository.upsertCurrent(db, { userBookId: 'ub-2', value: 4.5, review: 'Дуже добре' });

    expect(rating.value).toBe(4.5);
    expect(rating.review).toBe('Дуже добре');
    expect(rating.readingRunId).toBe(run.id);

    const fetched = await RatingRepository.getCurrent(db, 'ub-2');
    expect(fetched?.id).toBe(rating.id);
  });

  it('повторний виклик upsertCurrent на тому самому run ОНОВЛЮЄ той самий рядок, а не створює другий', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-3');
    await ReadingRunRepository.start(db, { userBookId: 'ub-3' });

    const first = await RatingRepository.upsertCurrent(db, { userBookId: 'ub-3', value: 3, review: null });
    const second = await RatingRepository.upsertCurrent(db, { userBookId: 'ub-3', value: 5, review: 'Змінив думку' });

    expect(second.id).toBe(first.id);
    expect(second.value).toBe(5);
    expect(second.review).toBe('Змінив думку');

    const fetched = await RatingRepository.getCurrent(db, 'ub-3');
    expect(fetched?.value).toBe(5);
  });

  it('review можна не вказувати — зберігається як null', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-4');
    await ReadingRunRepository.start(db, { userBookId: 'ub-4' });

    const rating = await RatingRepository.upsertCurrent(db, { userBookId: 'ub-4', value: 2 });
    expect(rating.review).toBeNull();
  });
});

describe('RatingRepository — перечитування: новий run отримує ОКРЕМУ оцінку, стара не перезаписується', () => {
  it('друге прочитання отримує ВЛАСНУ оцінку; перша лишається доступною за id свого run', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-5');

    const firstRun = await ReadingRunRepository.start(db, { userBookId: 'ub-5' });
    await ReadingRunRepository.finish(db, firstRun.id, { status: 'finished' });
    const firstRating = await RatingRepository.upsertCurrent(db, { userBookId: 'ub-5', value: 3, review: 'Непогано' });

    // Читач перечитує книгу (новий run) і оцінює її інакше.
    const secondRun = await ReadingRunRepository.start(db, { userBookId: 'ub-5' });
    await ReadingRunRepository.finish(db, secondRun.id, { status: 'finished' });

    // Поки нова оцінка не поставлена — getCurrent резолвить НАЙНОВІШИЙ run, для якого рядка
    // ще нема, тож null, а НЕ помилково повернута оцінка попереднього прочитання.
    expect(await RatingRepository.getCurrent(db, 'ub-5')).toBeNull();

    const secondRating = await RatingRepository.upsertCurrent(db, { userBookId: 'ub-5', value: 5, review: 'Тепер шедевр' });

    const current = await RatingRepository.getCurrent(db, 'ub-5');
    expect(current?.readingRunId).toBe(secondRun.id);
    expect(current?.value).toBe(5);
    expect(current?.id).not.toBe(firstRating.id);

    // Перша оцінка і досі в базі, ціла, доступна за id свого run.
    const preserved = await RatingRepository.getByReadingRunId(db, firstRun.id);
    expect(preserved?.id).toBe(firstRating.id);
    expect(preserved?.value).toBe(3);
    expect(preserved?.review).toBe('Непогано');

    const all = await RatingRepository.listByUserBookId(db, 'ub-5');
    expect(all).toHaveLength(2);
    expect(new Set(all.map((r) => r.readingRunId))).toEqual(new Set([firstRun.id, secondRun.id]));
    expect(secondRating.id).not.toBe(firstRating.id);
  });
});

describe('RatingRepository — книга без жодного reading_run (Фаза 7 addToLibrary, не підключена)', () => {
  it('getCurrent/upsertCurrent фолбечать на оцінку без reading_run_id, той самий підхід, що й до Фази 12', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-6'); // без жодного ReadingRunRepository.start

    expect(await RatingRepository.getCurrent(db, 'ub-6')).toBeNull();

    const rating = await RatingRepository.upsertCurrent(db, { userBookId: 'ub-6', value: 4 });
    expect(rating.readingRunId).toBeNull();

    const fetched = await RatingRepository.getCurrent(db, 'ub-6');
    expect(fetched?.id).toBe(rating.id);
    expect(fetched?.readingRunId).toBeNull();
  });
});

describe('RatingRepository.listByUserBookIds — батч для списків (Wrapped/Сезони/Профіль/"Цього дня")', () => {
  it('повертає Map лише для книг, що МАЮТЬ оцінку — інші відсутні в результаті', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-7');
    await seedUserBook(db, 'ub-8');
    await ReadingRunRepository.start(db, { userBookId: 'ub-7' });
    await RatingRepository.upsertCurrent(db, { userBookId: 'ub-7', value: 4 });
    // ub-8 без оцінки

    const result = await RatingRepository.listByUserBookIds(db, ['ub-7', 'ub-8']);
    expect(result.size).toBe(1);
    expect(result.get('ub-7')?.value).toBe(4);
    expect(result.has('ub-8')).toBe(false);
  });

  it('книга з кількома оцінками (по одній на run) — повертає НАЙНОВІШУ, а не випадкову', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-9');

    const firstRun = await ReadingRunRepository.start(db, { userBookId: 'ub-9' });
    await ReadingRunRepository.finish(db, firstRun.id, { status: 'finished' });
    await RatingRepository.upsertCurrent(db, { userBookId: 'ub-9', value: 2 });

    const secondRun = await ReadingRunRepository.start(db, { userBookId: 'ub-9' });
    await ReadingRunRepository.finish(db, secondRun.id, { status: 'finished' });
    await RatingRepository.upsertCurrent(db, { userBookId: 'ub-9', value: 5 });

    const result = await RatingRepository.listByUserBookIds(db, ['ub-9']);
    expect(result.get('ub-9')?.value).toBe(5);
    expect(result.get('ub-9')?.readingRunId).toBe(secondRun.id);
  });

  it('порожній масив id повертає порожню Map', async () => {
    const db = await openMigratedTestDb();
    expect((await RatingRepository.listByUserBookIds(db, [])).size).toBe(0);
  });
});

describe('RatingRepository.remove', () => {
  it('видаляє рядок за id, getCurrent повертає null після цього', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-10');
    await ReadingRunRepository.start(db, { userBookId: 'ub-10' });
    const rating = await RatingRepository.upsertCurrent(db, { userBookId: 'ub-10', value: 5 });

    await RatingRepository.remove(db, rating.id);

    expect(await RatingRepository.getCurrent(db, 'ub-10')).toBeNull();
  });
});

describe('RatingRepository — cascade delete разом із user_book', () => {
  it('видалення user_book видаляє й оцінку (ON DELETE CASCADE)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-11');
    await ReadingRunRepository.start(db, { userBookId: 'ub-11' });
    await RatingRepository.upsertCurrent(db, { userBookId: 'ub-11', value: 3 });

    await db.runAsync(`DELETE FROM user_book WHERE id = ?`, ['ub-11']);

    expect(await RatingRepository.getCurrent(db, 'ub-11')).toBeNull();
  });
});
