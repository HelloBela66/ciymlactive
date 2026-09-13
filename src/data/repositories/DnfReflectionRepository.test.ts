import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { DnfReflectionRepository } from './DnfReflectionRepository';
import { ReadingRunRepository } from './ReadingRunRepository';

/**
 * Repository-інтеграційний тест для `DnfReflectionRepository` (POLYTSIA V1.6, Фаза 12 — DNF
 * IMPROVEMENT; REREADING MODEL, Фаза 11 — `docs/READING_RUN.md` §"Фаза 11"). Структура
 * дзеркалить `PreReadingReflectionRepository.test.ts` (Фаза 9) — та сама модель "поточний run
 * визначається сама репозиторієм", лише `captureIfMissing` замість `upsertCurrent` (рядок
 * створюється автоматично, не формою користувача). Головний предмет тестів, заради чого й
 * затіяна ця фаза: книга, покинута, потім знову прочитана і покинута ВДРУГЕ, отримує ДВА
 * окремих DNF-знімки — стара сторінка/дата/причина першого разу не втрачається.
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

describe('DnfReflectionRepository.getCurrent / captureIfMissing — поточний run', () => {
  it("run завершився did_not_finish → captureIfMissing прив'язує знімок саме до нього", async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-1' });
    await ReadingRunRepository.finish(db, run.id, { status: 'did_not_finish' });

    await DnfReflectionRepository.captureIfMissing(db, 'ub-1', 120);

    const current = await DnfReflectionRepository.getCurrent(db, 'ub-1');
    expect(current?.readingRunId).toBe(run.id);
    expect(current?.page).toBe(120);
    expect(current?.reason).toBeNull();
    expect(current?.note).toBeNull();
  });

  it('повторний виклик captureIfMissing на тому самому run НЕ перезаписує вже зафіксовану сторінку/дату', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-2');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-2' });
    await ReadingRunRepository.finish(db, run.id, { status: 'did_not_finish' });

    await DnfReflectionRepository.captureIfMissing(db, 'ub-2', 50);
    const first = await DnfReflectionRepository.getCurrent(db, 'ub-2');

    // Ще один виклик тим самим run (наприклад, повторний виклик updateStatus з тим самим
    // статусом) з ІНШОЮ сторінкою все одно нічого не змінює — рядок для цього run уже існує.
    await DnfReflectionRepository.captureIfMissing(db, 'ub-2', 200);
    const second = await DnfReflectionRepository.getCurrent(db, 'ub-2');

    expect(second?.id).toBe(first?.id);
    expect(second?.page).toBe(50);
    expect(second?.createdAt).toBe(first?.createdAt);
  });

  it('updateDetails оновлює причину й нотатку поточного run, не чіпаючи сторінку/дату створення', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-3');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-3' });
    await ReadingRunRepository.finish(db, run.id, { status: 'did_not_finish' });
    await DnfReflectionRepository.captureIfMissing(db, 'ub-3', 80);
    const before = await DnfReflectionRepository.getCurrent(db, 'ub-3');

    const updated = await DnfReflectionRepository.updateDetails(db, 'ub-3', {
      reason: 'boring',
      note: 'Занадто повільний початок.',
    });

    expect(updated?.reason).toBe('boring');
    expect(updated?.note).toBe('Занадто повільний початок.');
    expect(updated?.page).toBe(80);
    expect(updated?.createdAt).toBe(before?.createdAt);

    const fetched = await DnfReflectionRepository.getCurrent(db, 'ub-3');
    expect(fetched?.reason).toBe('boring');
    expect(fetched?.note).toBe('Занадто повільний початок.');
  });

  it('updateDetails повертає null, якщо знімка для поточного run ще нема', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-4');
    await ReadingRunRepository.start(db, { userBookId: 'ub-4' });

    const result = await DnfReflectionRepository.updateDetails(db, 'ub-4', { reason: 'other', note: null });

    expect(result).toBeNull();
  });
});

describe('DnfReflectionRepository — перечитування: новий run отримує ОКРЕМИЙ DNF-знімок, старий не перезаписується', () => {
  it('покинута вдруге книга отримує ДРУГИЙ знімок; перший лишається доступним за id свого run', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-5');

    const firstRun = await ReadingRunRepository.start(db, { userBookId: 'ub-5' });
    await ReadingRunRepository.finish(db, firstRun.id, { status: 'did_not_finish' });
    await DnfReflectionRepository.captureIfMissing(db, 'ub-5', 45);
    const firstReflection = await DnfReflectionRepository.getCurrent(db, 'ub-5');

    // Читач повернувся до книги (новий run) і покинув ЗНОВУ, на іншій сторінці.
    const secondRun = await ReadingRunRepository.start(db, { userBookId: 'ub-5' });
    await ReadingRunRepository.finish(db, secondRun.id, { status: 'did_not_finish' });
    await DnfReflectionRepository.captureIfMissing(db, 'ub-5', 210);

    const current = await DnfReflectionRepository.getCurrent(db, 'ub-5');
    expect(current?.readingRunId).toBe(secondRun.id);
    expect(current?.page).toBe(210);
    expect(current?.id).not.toBe(firstReflection?.id);

    // Перший знімок і досі в базі, цілий, доступний за id свого run.
    const preserved = await DnfReflectionRepository.getByReadingRunId(db, firstRun.id);
    expect(preserved?.id).toBe(firstReflection?.id);
    expect(preserved?.page).toBe(45);

    const all = await DnfReflectionRepository.listByUserBookId(db, 'ub-5');
    expect(all).toHaveLength(2);
    expect(new Set(all.map((r) => r.readingRunId))).toEqual(new Set([firstRun.id, secondRun.id]));
  });

  it('run, що завершився finished, НЕ отримує власного DNF-знімка й не показує чужий', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-6');

    const firstRun = await ReadingRunRepository.start(db, { userBookId: 'ub-6' });
    await ReadingRunRepository.finish(db, firstRun.id, { status: 'did_not_finish' });
    await DnfReflectionRepository.captureIfMissing(db, 'ub-6', 30);

    // Другий run книгу таки дочитали — жодного DNF-знімка для нього немає й не буде.
    const secondRun = await ReadingRunRepository.start(db, { userBookId: 'ub-6' });
    await ReadingRunRepository.finish(db, secondRun.id, { status: 'finished' });

    expect(await DnfReflectionRepository.getByReadingRunId(db, secondRun.id)).toBeNull();
    // getCurrent резолвить НАЙНОВІШИЙ run (finished) — для нього знімка нема, тож null, а НЕ
    // помилково повернутий знімок попереднього (did_not_finish) run.
    expect(await DnfReflectionRepository.getCurrent(db, 'ub-6')).toBeNull();

    const all = await DnfReflectionRepository.listByUserBookId(db, 'ub-6');
    expect(all).toHaveLength(1);
    expect(all[0]?.readingRunId).toBe(firstRun.id);
  });
});

describe('DnfReflectionRepository — книга без жодного reading_run (Фаза 7 addToLibrary, не підключена)', () => {
  it('captureIfMissing/getCurrent фолбечать на знімок без reading_run_id, той самий підхід, що й до Фази 11', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-7'); // без жодного ReadingRunRepository.start

    expect(await DnfReflectionRepository.getCurrent(db, 'ub-7')).toBeNull();

    await DnfReflectionRepository.captureIfMissing(db, 'ub-7', 15);

    const current = await DnfReflectionRepository.getCurrent(db, 'ub-7');
    expect(current?.readingRunId).toBeNull();
    expect(current?.page).toBe(15);

    // Повторний виклик все одно не перезаписує (той самий рядок).
    await DnfReflectionRepository.captureIfMissing(db, 'ub-7', 99);
    const second = await DnfReflectionRepository.getCurrent(db, 'ub-7');
    expect(second?.id).toBe(current?.id);
    expect(second?.page).toBe(15);
  });
});

describe('DnfReflectionRepository.remove', () => {
  it('видаляє лише вказаний рядок за id', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-8');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-8' });
    await ReadingRunRepository.finish(db, run.id, { status: 'did_not_finish' });
    await DnfReflectionRepository.captureIfMissing(db, 'ub-8', 10);
    const reflection = await DnfReflectionRepository.getCurrent(db, 'ub-8');

    await DnfReflectionRepository.remove(db, reflection!.id);

    expect(await DnfReflectionRepository.getCurrent(db, 'ub-8')).toBeNull();
  });
});

describe('DnfReflectionRepository — cascade delete разом із user_book', () => {
  it('видалення user_book видаляє й знімок DNF (ON DELETE CASCADE)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-9');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-9' });
    await ReadingRunRepository.finish(db, run.id, { status: 'did_not_finish' });
    await DnfReflectionRepository.captureIfMissing(db, 'ub-9', 30);

    await db.runAsync(`DELETE FROM user_book WHERE id = ?`, ['ub-9']);

    expect(await DnfReflectionRepository.getCurrent(db, 'ub-9')).toBeNull();
  });
});
