import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { BookMemoryRepository } from './BookMemoryRepository';
import { ReadingRunRepository } from './ReadingRunRepository';

/**
 * Repository-інтеграційний тест для `BookMemoryRepository` (POLYTSIA V1.6.1, Фаза 8 —
 * REREADING MODEL, `docs/READING_RUN.md` §"Фаза 8"). Перший спеціальний тестовий файл саме
 * для цього репозиторію. Головний предмет тестів — те, заради чого й затіяна ця фаза: після
 * перечитування `getCurrent`/`upsertCurrent` працюють із НОВИМ спогадом нового run, а старий
 * спогад попереднього run лишається в базі незайманим (не той бекенд-дефект, що описаний у
 * `docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 23, п.5, де другий `upsert` затирав перший).
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
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,'finished',0,?,?)`,
    [id, `${id}-edition`, now, now],
  );
}

describe('BookMemoryRepository.getCurrent / upsertCurrent — активний run', () => {
  it('активний run уже є → спогад прив\'язується до нього', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-1' });

    const memory = await BookMemoryRepository.upsertCurrent(db, {
      userBookId: 'ub-1',
      reflection: 'Дуже сподобалось',
      entryRefs: [],
      templateId: 'classic',
    });

    expect(memory.readingRunId).toBe(run.id);
    const current = await BookMemoryRepository.getCurrent(db, 'ub-1');
    expect(current?.id).toBe(memory.id);
    expect(current?.reflection).toBe('Дуже сподобалось');
  });

  it('повторний upsertCurrent на тому самому run оновлює запис на місці, не створює дублікат', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-2');
    await ReadingRunRepository.start(db, { userBookId: 'ub-2' });

    const first = await BookMemoryRepository.upsertCurrent(db, {
      userBookId: 'ub-2',
      reflection: 'Чернетка',
      entryRefs: [],
      templateId: 'classic',
    });
    const second = await BookMemoryRepository.upsertCurrent(db, {
      userBookId: 'ub-2',
      reflection: 'Фінальна версія',
      entryRefs: [],
      templateId: 'quote',
    });

    expect(second.id).toBe(first.id);
    expect(second.reflection).toBe('Фінальна версія');
    expect(second.templateId).toBe('quote');

    const all = await BookMemoryRepository.listByUserBookId(db, 'ub-2');
    expect(all).toHaveLength(1);
  });
});

describe('BookMemoryRepository — перечитування: новий run отримує ОКРЕМИЙ спогад, старий не затирається', () => {
  it('після нового run getCurrent повертає null (новий run ще без спогаду), старий спогад лишається доступним за id run', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-3');
    const firstRun = await ReadingRunRepository.start(db, { userBookId: 'ub-3' });

    const firstMemory = await BookMemoryRepository.upsertCurrent(db, {
      userBookId: 'ub-3',
      reflection: 'Перше прочитання: сумна кінцівка',
      entryRefs: [],
      templateId: 'classic',
    });

    await ReadingRunRepository.finish(db, firstRun.id, { status: 'finished' });
    const secondRun = await ReadingRunRepository.start(db, { userBookId: 'ub-3' });

    expect(await BookMemoryRepository.getCurrent(db, 'ub-3')).toBeNull();

    const preserved = await BookMemoryRepository.getByReadingRunId(db, firstRun.id);
    expect(preserved?.id).toBe(firstMemory.id);
    expect(preserved?.reflection).toBe('Перше прочитання: сумна кінцівка');

    expect(await BookMemoryRepository.getByReadingRunId(db, secondRun.id)).toBeNull();
  });

  it('upsertCurrent для нового run створює ОКРЕМИЙ рядок; listByUserBookId бачить обидва', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-4');
    const firstRun = await ReadingRunRepository.start(db, { userBookId: 'ub-4' });
    await BookMemoryRepository.upsertCurrent(db, {
      userBookId: 'ub-4',
      reflection: 'Перше прочитання',
      entryRefs: [],
      templateId: 'classic',
    });
    await ReadingRunRepository.finish(db, firstRun.id, { status: 'finished' });
    const secondRun = await ReadingRunRepository.start(db, { userBookId: 'ub-4' });

    const secondMemory = await BookMemoryRepository.upsertCurrent(db, {
      userBookId: 'ub-4',
      reflection: 'Перечитування: нові відтінки',
      entryRefs: [],
      templateId: 'classic',
    });

    expect(secondMemory.readingRunId).toBe(secondRun.id);
    const all = await BookMemoryRepository.listByUserBookId(db, 'ub-4');
    expect(all).toHaveLength(2);
    expect(new Set(all.map((m) => m.readingRunId))).toEqual(new Set([firstRun.id, secondRun.id]));

    // Перший спогад і досі містить оригінальний текст — не перезаписаний другим.
    const firstStillIntact = await BookMemoryRepository.getByReadingRunId(db, firstRun.id);
    expect(firstStillIntact?.reflection).toBe('Перше прочитання');
  });
});

describe('BookMemoryRepository — книга без жодного reading_run (Фаза 7 addToLibrary, не підключена)', () => {
  it('getCurrent/upsertCurrent фолбечать на "книжковий" спогад без reading_run_id, той самий підхід, що й до Фази 8', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-5'); // без жодного ReadingRunRepository.start

    expect(await BookMemoryRepository.getCurrent(db, 'ub-5')).toBeNull();

    const memory = await BookMemoryRepository.upsertCurrent(db, {
      userBookId: 'ub-5',
      reflection: 'Спогад без run',
      entryRefs: [],
      templateId: 'classic',
    });
    expect(memory.readingRunId).toBeNull();

    const second = await BookMemoryRepository.upsertCurrent(db, {
      userBookId: 'ub-5',
      reflection: 'Оновлено',
      entryRefs: [],
      templateId: 'classic',
    });
    expect(second.id).toBe(memory.id); // оновлення того самого рядка, не дублікат.

    const all = await BookMemoryRepository.listByUserBookId(db, 'ub-5');
    expect(all).toHaveLength(1);
  });
});

describe('BookMemoryRepository.remove', () => {
  it('видаляє лише вказаний рядок за id', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-6');
    await ReadingRunRepository.start(db, { userBookId: 'ub-6' });
    const memory = await BookMemoryRepository.upsertCurrent(db, {
      userBookId: 'ub-6',
      reflection: 'До видалення',
      entryRefs: [],
      templateId: 'classic',
    });

    await BookMemoryRepository.remove(db, memory.id);

    expect(await BookMemoryRepository.getCurrent(db, 'ub-6')).toBeNull();
    expect(await BookMemoryRepository.listByUserBookId(db, 'ub-6')).toHaveLength(0);
  });
});
