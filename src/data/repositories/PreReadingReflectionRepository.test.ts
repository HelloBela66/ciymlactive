import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { PreReadingReflectionRepository } from './PreReadingReflectionRepository';
import { ReadingRunRepository } from './ReadingRunRepository';

/**
 * Repository-інтеграційний тест для `PreReadingReflectionRepository` (POLYTSIA V1.6, Фаза 6 —
 * «До/Після»; REREADING MODEL, Фаза 9 — `docs/READING_RUN.md` §"Фаза 9"). Структура дзеркалить
 * `BookMemoryRepository.test.ts` (Фаза 8) — та сама модель "поточний run визначається сама
 * репозиторієм". Головний предмет тестів, заради чого й затіяна ця фаза: після перечитування
 * `getCurrent`/`upsertCurrent` працюють із НОВОЮ нотаткою "До" нового run, а стара нотатка
 * попереднього run лишається в базі незайманою; і — критично — нотатка лишається доступною
 * через `getCurrent` навіть ПІСЛЯ того, як її run завершився (саме так її читає екран
 * порівняння До/Після на Book Memory, `app/memory/[workId].tsx`).
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

describe('PreReadingReflectionRepository.getCurrent / upsertCurrent — поточний run', () => {
  it('run уже є (in_progress) → нотатка "До" прив\'язується до нього', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-1' });

    const reflection = await PreReadingReflectionRepository.upsertCurrent(db, {
      userBookId: 'ub-1',
      reasonText: 'Порадили друзі',
      expectationText: 'Чекаю щось легке',
      expectedRating: 4,
    });

    expect(reflection.readingRunId).toBe(run.id);
    const current = await PreReadingReflectionRepository.getCurrent(db, 'ub-1');
    expect(current?.id).toBe(reflection.id);
    expect(current?.reasonText).toBe('Порадили друзі');
    expect(current?.expectationText).toBe('Чекаю щось легке');
    expect(current?.expectedRating).toBe(4);
  });

  it('повторний upsertCurrent на тому самому run оновлює запис на місці (той самий id), а не створює другий', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-2');
    await ReadingRunRepository.start(db, { userBookId: 'ub-2' });

    const first = await PreReadingReflectionRepository.upsertCurrent(db, {
      userBookId: 'ub-2',
      reasonText: 'Причина 1',
      expectationText: null,
      expectedRating: null,
    });
    const second = await PreReadingReflectionRepository.upsertCurrent(db, {
      userBookId: 'ub-2',
      reasonText: 'Причина 2',
      expectationText: 'Тепер і очікування',
      expectedRating: 5,
    });

    expect(second.id).toBe(first.id);
    expect(second.reasonText).toBe('Причина 2');
    expect(second.expectationText).toBe('Тепер і очікування');
    expect(second.expectedRating).toBe(5);

    const all = await PreReadingReflectionRepository.listByUserBookId(db, 'ub-2');
    expect(all).toHaveLength(1);
  });

  it('created_at НЕ змінюється при повторному upsertCurrent — лишається "миттю ДО читання"', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-3');
    await ReadingRunRepository.start(db, { userBookId: 'ub-3' });

    const first = await PreReadingReflectionRepository.upsertCurrent(db, {
      userBookId: 'ub-3',
      reasonText: 'Причина',
      expectationText: null,
      expectedRating: null,
    });
    const second = await PreReadingReflectionRepository.upsertCurrent(db, {
      userBookId: 'ub-3',
      reasonText: 'Змінена причина',
      expectationText: null,
      expectedRating: null,
    });

    expect(second.createdAt).toBe(first.createdAt);
  });

  it('усі текстові поля можна лишити null — валідна нотатка тільки з expectedRating', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-4');
    await ReadingRunRepository.start(db, { userBookId: 'ub-4' });

    const reflection = await PreReadingReflectionRepository.upsertCurrent(db, {
      userBookId: 'ub-4',
      reasonText: null,
      expectationText: null,
      expectedRating: 3.5,
    });

    expect(reflection.reasonText).toBeNull();
    expect(reflection.expectationText).toBeNull();
    expect(reflection.expectedRating).toBe(3.5);
  });

  it('нотатка лишається доступною через getCurrent і ПІСЛЯ завершення свого run — так її читає порівняння До/Після на Book Memory', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-5');
    const run = await ReadingRunRepository.start(db, { userBookId: 'ub-5' });
    const reflection = await PreReadingReflectionRepository.upsertCurrent(db, {
      userBookId: 'ub-5',
      reasonText: 'Причина',
      expectationText: 'Очікування',
      expectedRating: null,
    });

    await ReadingRunRepository.finish(db, run.id, { status: 'finished' });

    const current = await PreReadingReflectionRepository.getCurrent(db, 'ub-5');
    expect(current?.id).toBe(reflection.id);
    expect(current?.reasonText).toBe('Причина');
  });
});

describe('PreReadingReflectionRepository — перечитування: новий run отримує ОКРЕМУ нотатку "До", стара не затирається', () => {
  it('після нового run getCurrent повертає null (новий run ще без нотатки), стара лишається доступною за id run', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-6');
    const firstRun = await ReadingRunRepository.start(db, { userBookId: 'ub-6' });

    const firstReflection = await PreReadingReflectionRepository.upsertCurrent(db, {
      userBookId: 'ub-6',
      reasonText: 'Перше прочитання: порадили друзі',
      expectationText: null,
      expectedRating: null,
    });

    await ReadingRunRepository.finish(db, firstRun.id, { status: 'finished' });
    const secondRun = await ReadingRunRepository.start(db, { userBookId: 'ub-6' });

    expect(await PreReadingReflectionRepository.getCurrent(db, 'ub-6')).toBeNull();

    const preserved = await PreReadingReflectionRepository.getByReadingRunId(db, firstRun.id);
    expect(preserved?.id).toBe(firstReflection.id);
    expect(preserved?.reasonText).toBe('Перше прочитання: порадили друзі');

    expect(await PreReadingReflectionRepository.getByReadingRunId(db, secondRun.id)).toBeNull();
  });

  it('upsertCurrent для нового run створює ОКРЕМИЙ рядок; listByUserBookId бачить обидва', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-7');
    const firstRun = await ReadingRunRepository.start(db, { userBookId: 'ub-7' });
    await PreReadingReflectionRepository.upsertCurrent(db, {
      userBookId: 'ub-7',
      reasonText: 'Перше прочитання',
      expectationText: null,
      expectedRating: null,
    });
    await ReadingRunRepository.finish(db, firstRun.id, { status: 'finished' });
    const secondRun = await ReadingRunRepository.start(db, { userBookId: 'ub-7' });

    const secondReflection = await PreReadingReflectionRepository.upsertCurrent(db, {
      userBookId: 'ub-7',
      reasonText: 'Перечитування: цікаво, чи так само зайде',
      expectationText: null,
      expectedRating: null,
    });

    expect(secondReflection.readingRunId).toBe(secondRun.id);
    const all = await PreReadingReflectionRepository.listByUserBookId(db, 'ub-7');
    expect(all).toHaveLength(2);
    expect(new Set(all.map((r) => r.readingRunId))).toEqual(new Set([firstRun.id, secondRun.id]));

    // Перша нотатка і досі містить оригінальний текст — не перезаписана другою.
    const firstStillIntact = await PreReadingReflectionRepository.getByReadingRunId(db, firstRun.id);
    expect(firstStillIntact?.reasonText).toBe('Перше прочитання');
  });
});

describe('PreReadingReflectionRepository — книга без жодного reading_run (Фаза 7 addToLibrary, не підключена)', () => {
  it('getCurrent/upsertCurrent фолбечать на "книжкову" нотатку без reading_run_id, той самий підхід, що й до Фази 9', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-8'); // без жодного ReadingRunRepository.start

    expect(await PreReadingReflectionRepository.getCurrent(db, 'ub-8')).toBeNull();

    const reflection = await PreReadingReflectionRepository.upsertCurrent(db, {
      userBookId: 'ub-8',
      reasonText: 'Нотатка без run',
      expectationText: null,
      expectedRating: null,
    });
    expect(reflection.readingRunId).toBeNull();

    const second = await PreReadingReflectionRepository.upsertCurrent(db, {
      userBookId: 'ub-8',
      reasonText: 'Оновлено',
      expectationText: null,
      expectedRating: null,
    });
    expect(second.id).toBe(reflection.id); // оновлення того самого рядка, не дублікат.

    const all = await PreReadingReflectionRepository.listByUserBookId(db, 'ub-8');
    expect(all).toHaveLength(1);
  });
});

describe('PreReadingReflectionRepository.remove', () => {
  it('видаляє лише вказаний рядок за id', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-9');
    await ReadingRunRepository.start(db, { userBookId: 'ub-9' });
    const reflection = await PreReadingReflectionRepository.upsertCurrent(db, {
      userBookId: 'ub-9',
      reasonText: 'До видалення',
      expectationText: null,
      expectedRating: null,
    });

    await PreReadingReflectionRepository.remove(db, reflection.id);

    expect(await PreReadingReflectionRepository.getCurrent(db, 'ub-9')).toBeNull();
    expect(await PreReadingReflectionRepository.listByUserBookId(db, 'ub-9')).toHaveLength(0);
  });
});

describe('PreReadingReflectionRepository — cascade delete разом із user_book', () => {
  it('видалення user_book видаляє й нотатку "До читання" (ON DELETE CASCADE)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-10');
    await ReadingRunRepository.start(db, { userBookId: 'ub-10' });
    await PreReadingReflectionRepository.upsertCurrent(db, {
      userBookId: 'ub-10',
      reasonText: 'Причина',
      expectationText: null,
      expectedRating: null,
    });

    await db.runAsync(`DELETE FROM user_book WHERE id = ?`, ['ub-10']);

    expect(await PreReadingReflectionRepository.getCurrent(db, 'ub-10')).toBeNull();
  });
});
