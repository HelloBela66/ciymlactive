import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { UserBookRepository } from './UserBookRepository';
import { ReadingRunRepository } from './ReadingRunRepository';

/**
 * Repository-інтеграційний тест для `UserBookRepository` — перший тест на цей репозиторій
 * (раніше не мав жодного, хоч це один з чотирьох критичних репозиторіїв, явно названих у
 * quality gate POLYTSIA V1.6). UserBook — центральна сутність "ця книга в МОЇЙ бібліотеці":
 * тести нижче навмисно приділяють особливу увагу трьом задокументованим, але неочевидним
 * поведінкам з коментарів самого репозиторію:
 *   1. `addToLibrary` — ідемпотентність за editionId (повторний виклик не створює дублікат);
 *   2. `updateStatus` — started_at/finished_at виставляються ОДИН РАЗ і не перезаписуються
 *      при подальших переходах статусу (навіть "назад" з 'finished');
 *   3. soft delete (`remove`) — видалена книга зникає з усіх вибірок (deleted_at IS NULL),
 *      але сам рядок фізично лишається в БД.
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

const NOW = '2026-01-01T00:00:00.000Z';

async function seedWork(db: SQLiteDatabase, workId: string, title = `Книга ${workId}`): Promise<void> {
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    workId,
    title,
    NOW,
    NOW,
  ]);
}

async function seedEdition(
  db: SQLiteDatabase,
  editionId: string,
  workId: string,
  title = `Книга ${workId}`,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [editionId, workId, title, 'uk', 'paperback', NOW, NOW],
  );
}

/** Заготовка work + edition, без user_book — сам user_book тести створюють через
 * `UserBookRepository.addToLibrary`, а не прямим INSERT, бо саме ця функція — предмет тестів. */
async function seedWorkAndEdition(
  db: SQLiteDatabase,
  id = 'work-1',
): Promise<{ workId: string; editionId: string }> {
  const workId = id;
  const editionId = `${id}-edition`;
  await seedWork(db, workId);
  await seedEdition(db, editionId, workId);
  return { workId, editionId };
}

describe('UserBookRepository.addToLibrary — ідемпотентність і started_at/finished_at за статусом', () => {
  it('want_to_read: не виставляє ні started_at, ні finished_at', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db);

    const userBook = await UserBookRepository.addToLibrary(db, editionId, 'want_to_read');

    expect(userBook.status).toBe('want_to_read');
    expect(userBook.startedAt).toBeNull();
    expect(userBook.finishedAt).toBeNull();
    expect(userBook.currentPage).toBe(0);
    expect(userBook.isFavorite).toBe(false);
  });

  it('reading: виставляє started_at, не виставляє finished_at', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db);

    const userBook = await UserBookRepository.addToLibrary(db, editionId, 'reading');

    expect(userBook.startedAt).not.toBeNull();
    expect(userBook.finishedAt).toBeNull();
  });

  it('finished: виставляє finished_at, АЛЕ НЕ started_at (задокументована поведінка addToLibrary)', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db);

    const userBook = await UserBookRepository.addToLibrary(db, editionId, 'finished');

    expect(userBook.finishedAt).not.toBeNull();
    expect(userBook.startedAt).toBeNull();
  });

  it('повторний виклик з тим самим editionId повертає ІСНУЮЧИЙ запис, не створює дублікат', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db);

    const first = await UserBookRepository.addToLibrary(db, editionId, 'want_to_read');
    const second = await UserBookRepository.addToLibrary(db, editionId, 'reading'); // інший статус — ігнорується

    expect(second.id).toBe(first.id);
    expect(second.status).toBe('want_to_read'); // статус НЕ змінюється повторним addToLibrary

    const all = await UserBookRepository.listAll(db);
    expect(all).toHaveLength(1);
  });
});

describe('UserBookRepository.getByEditionId / getById / getByIdWithDetails', () => {
  it('getByEditionId: null, якщо книги ще немає в бібліотеці', async () => {
    const db = await openMigratedTestDb();
    expect(await UserBookRepository.getByEditionId(db, 'nonexistent-edition')).toBeNull();
  });

  it('getById: null для неіснуючого id', async () => {
    const db = await openMigratedTestDb();
    expect(await UserBookRepository.getById(db, 'nonexistent-id')).toBeNull();
  });

  it('getByIdWithDetails: підвантажує edition і work (+ автори)', async () => {
    const db = await openMigratedTestDb();
    const { workId, editionId } = await seedWorkAndEdition(db, 'work-details');
    await db.runAsync(`INSERT INTO author (id, name, created_at, updated_at) VALUES (?,?,?,?)`, [
      'author-1',
      'Ліна Костенко',
      NOW,
      NOW,
    ]);
    await db.runAsync(`INSERT INTO work_author (work_id, author_id, role) VALUES (?,?,'author')`, [
      workId,
      'author-1',
    ]);
    const created = await UserBookRepository.addToLibrary(db, editionId, 'reading');

    const details = await UserBookRepository.getByIdWithDetails(db, created.id);

    expect(details).not.toBeNull();
    expect(details?.edition.id).toBe(editionId);
    expect(details?.work.id).toBe(workId);
    expect(details?.work.authors.map((a) => a.name)).toEqual(['Ліна Костенко']);
  });

  it('getByEditionIdWithDetails: той самий результат через editionId', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db, 'work-details-2');
    await UserBookRepository.addToLibrary(db, editionId, 'reading');

    const details = await UserBookRepository.getByEditionIdWithDetails(db, editionId);
    expect(details?.edition.id).toBe(editionId);
  });
});

describe('UserBookRepository.updateStatus — started_at/finished_at виставляються один раз', () => {
  it('перший перехід у reading виставляє started_at; повторний перехід у paused його НЕ змінює', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db);
    const created = await UserBookRepository.addToLibrary(db, editionId, 'want_to_read');

    await UserBookRepository.updateStatus(db, created.id, 'reading');
    const afterReading = await UserBookRepository.getById(db, created.id);
    expect(afterReading?.startedAt).not.toBeNull();
    const startedAt = afterReading?.startedAt;

    await UserBookRepository.updateStatus(db, created.id, 'paused');
    const afterPaused = await UserBookRepository.getById(db, created.id);
    expect(afterPaused?.startedAt).toBe(startedAt); // не змінився

    await UserBookRepository.updateStatus(db, created.id, 'reading');
    const afterReadingAgain = await UserBookRepository.getById(db, created.id);
    expect(afterReadingAgain?.startedAt).toBe(startedAt); // і досі не змінився
  });

  it('finished_at виставляється при переході у finished і НЕ скидається при подальшому переході назад у reading', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db);
    const created = await UserBookRepository.addToLibrary(db, editionId, 'reading');

    await UserBookRepository.updateStatus(db, created.id, 'finished');
    const finished = await UserBookRepository.getById(db, created.id);
    expect(finished?.finishedAt).not.toBeNull();
    const finishedAt = finished?.finishedAt;

    await UserBookRepository.updateStatus(db, created.id, 'reading'); // перечитування
    const rereading = await UserBookRepository.getById(db, created.id);
    expect(rereading?.status).toBe('reading');
    expect(rereading?.finishedAt).toBe(finishedAt); // стара дата завершення НЕ зникає
  });

  // POLYTSIA V1.6.1, Фаза 1 — regression test для P0-дефекту з
  // `docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 13.
  it('finished → did_not_finish СКИДАЄ finished_at (на відміну від переходу назад у reading)', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db);
    const created = await UserBookRepository.addToLibrary(db, editionId, 'reading');

    await UserBookRepository.updateStatus(db, created.id, 'finished');
    const finished = await UserBookRepository.getById(db, created.id);
    expect(finished?.finishedAt).not.toBeNull();

    await UserBookRepository.updateStatus(db, created.id, 'did_not_finish');
    const dnf = await UserBookRepository.getById(db, created.id);
    expect(dnf?.status).toBe('did_not_finish');
    expect(dnf?.finishedAt).toBeNull();
  });

  it('did_not_finish без попереднього finished_at — і далі лишається null (немає регресії для звичайного шляху)', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db);
    const created = await UserBookRepository.addToLibrary(db, editionId, 'reading');

    await UserBookRepository.updateStatus(db, created.id, 'did_not_finish');
    const dnf = await UserBookRepository.getById(db, created.id);
    expect(dnf?.finishedAt).toBeNull();
  });

  it('updateStatus на неіснуючий id — no-op, не кидає виняток', async () => {
    const db = await openMigratedTestDb();
    await expect(UserBookRepository.updateStatus(db, 'nonexistent', 'reading')).resolves.toBeUndefined();
  });
});

/**
 * REREADING MODEL, Фаза 7 (`docs/READING_RUN.md`) — `updateStatus` тепер прив'язує реальний
 * старт/завершення `reading_run` до переходу статусу. Тести нижче — прямі, через
 * `ReadingRunRepository`, окремо від тестів вище (які навмисно не чіпались, щоб лишити
 * незмінною вже наявну перевірку started_at/finished_at).
 */
describe('UserBookRepository.updateStatus — прив\'язка reading_run (Фаза 7)', () => {
  it("want_to_read → reading: створює run №1 (in_progress)", async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db, 'run-a');
    const created = await UserBookRepository.addToLibrary(db, editionId, 'want_to_read');

    await UserBookRepository.updateStatus(db, created.id, 'reading');

    const active = await ReadingRunRepository.getActiveByUserBookId(db, created.id);
    expect(active?.runNumber).toBe(1);
    expect(active?.status).toBe('in_progress');
    expect(active?.startedAt).not.toBeNull();
    expect(active?.isLegacyBackfill).toBe(false);
  });

  it("reading → paused → reading: НЕ створює новий run, лишається той самий (пауза в межах одного проходу)", async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db, 'run-b');
    const created = await UserBookRepository.addToLibrary(db, editionId, 'want_to_read');

    await UserBookRepository.updateStatus(db, created.id, 'reading');
    const firstRun = await ReadingRunRepository.getActiveByUserBookId(db, created.id);

    await UserBookRepository.updateStatus(db, created.id, 'paused');
    await UserBookRepository.updateStatus(db, created.id, 'reading');

    const runs = await ReadingRunRepository.listByUserBookId(db, created.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.id).toBe(firstRun?.id);
  });

  it('reading → finished: завершує активний run (status=finished, finishedAt виставлено)', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db, 'run-c');
    const created = await UserBookRepository.addToLibrary(db, editionId, 'want_to_read');

    await UserBookRepository.updateStatus(db, created.id, 'reading');
    await UserBookRepository.updateStatus(db, created.id, 'finished');

    expect(await ReadingRunRepository.getActiveByUserBookId(db, created.id)).toBeNull();
    const runs = await ReadingRunRepository.listByUserBookId(db, created.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('finished');
    expect(runs[0]?.finishedAt).not.toBeNull();
  });

  it('finished → rereading: створює ДРУГИЙ run (run_number=2), перший лишається finished', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db, 'run-d');
    const created = await UserBookRepository.addToLibrary(db, editionId, 'want_to_read');

    await UserBookRepository.updateStatus(db, created.id, 'reading');
    await UserBookRepository.updateStatus(db, created.id, 'finished');
    await UserBookRepository.updateStatus(db, created.id, 'rereading');

    const runs = await ReadingRunRepository.listByUserBookId(db, created.id);
    expect(runs).toHaveLength(2);
    expect(runs[0]?.runNumber).toBe(1);
    expect(runs[0]?.status).toBe('finished');
    expect(runs[1]?.runNumber).toBe(2);
    expect(runs[1]?.status).toBe('in_progress');
  });

  it('rereading → did_not_finish: завершує ДРУГИЙ run зі статусом did_not_finish; did_not_finish → reading створює ТРЕТІЙ', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db, 'run-e');
    const created = await UserBookRepository.addToLibrary(db, editionId, 'want_to_read');

    await UserBookRepository.updateStatus(db, created.id, 'reading');
    await UserBookRepository.updateStatus(db, created.id, 'finished');
    await UserBookRepository.updateStatus(db, created.id, 'rereading');
    await UserBookRepository.updateStatus(db, created.id, 'did_not_finish');

    let runs = await ReadingRunRepository.listByUserBookId(db, created.id);
    expect(runs).toHaveLength(2);
    expect(runs[1]?.status).toBe('did_not_finish');
    expect(runs[1]?.finishedAt).not.toBeNull();

    await UserBookRepository.updateStatus(db, created.id, 'reading');
    runs = await ReadingRunRepository.listByUserBookId(db, created.id);
    expect(runs).toHaveLength(3);
    expect(runs[2]?.runNumber).toBe(3);
    expect(runs[2]?.status).toBe('in_progress');
  });

  it("книга додана напряму статусом 'reading' через addToLibrary (без run, Фаза 7 свідомо не підключає addToLibrary) → finished НІЧОГО не вигадує", async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db, 'run-f');
    const created = await UserBookRepository.addToLibrary(db, editionId, 'reading');

    expect(await ReadingRunRepository.listByUserBookId(db, created.id)).toHaveLength(0);

    await expect(UserBookRepository.updateStatus(db, created.id, 'finished')).resolves.toBeUndefined();

    expect(await ReadingRunRepository.listByUserBookId(db, created.id)).toHaveLength(0);
    expect((await UserBookRepository.getById(db, created.id))?.status).toBe('finished');
  });
});

describe('UserBookRepository.updateCurrentPage / setFavorite', () => {
  it("updateCurrentPage: оновлює сторінку, від'ємне значення обрізається до 0", async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db);
    const created = await UserBookRepository.addToLibrary(db, editionId, 'reading');

    await UserBookRepository.updateCurrentPage(db, created.id, 42);
    expect((await UserBookRepository.getById(db, created.id))?.currentPage).toBe(42);

    await UserBookRepository.updateCurrentPage(db, created.id, -5);
    expect((await UserBookRepository.getById(db, created.id))?.currentPage).toBe(0);
  });

  it('setFavorite: перемикає прапорець в обидва боки', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db);
    const created = await UserBookRepository.addToLibrary(db, editionId, 'want_to_read');

    await UserBookRepository.setFavorite(db, created.id, true);
    expect((await UserBookRepository.getById(db, created.id))?.isFavorite).toBe(true);

    await UserBookRepository.setFavorite(db, created.id, false);
    expect((await UserBookRepository.getById(db, created.id))?.isFavorite).toBe(false);
  });

  it('setSpoilerSafeEnabled: за замовчуванням true (DEFAULT 1), перемикається в обидва боки', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db);
    const created = await UserBookRepository.addToLibrary(db, editionId, 'reading');

    expect((await UserBookRepository.getById(db, created.id))?.spoilerSafeEnabled).toBe(true);

    await UserBookRepository.setSpoilerSafeEnabled(db, created.id, false);
    expect((await UserBookRepository.getById(db, created.id))?.spoilerSafeEnabled).toBe(false);

    await UserBookRepository.setSpoilerSafeEnabled(db, created.id, true);
    expect((await UserBookRepository.getById(db, created.id))?.spoilerSafeEnabled).toBe(true);
  });
});

describe("UserBookRepository.remove — м'яке видалення", () => {
  it('після remove книга зникає з getById/getByEditionId/listAll/listByStatus', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db);
    const created = await UserBookRepository.addToLibrary(db, editionId, 'reading');

    await UserBookRepository.remove(db, created.id);

    expect(await UserBookRepository.getById(db, created.id)).toBeNull();
    expect(await UserBookRepository.getByEditionId(db, editionId)).toBeNull();
    expect(await UserBookRepository.listAll(db)).toHaveLength(0);
    expect(await UserBookRepository.listByStatus(db, 'reading')).toHaveLength(0);
  });
});

describe('UserBookRepository.applyImportedDates — COALESCE: null-поля лишають існуюче значення', () => {
  it('передані значення перезаписують, null-поля — ні', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db);
    const created = await UserBookRepository.addToLibrary(db, editionId, 'want_to_read');
    const originalAddedAt = created.addedAt;

    await UserBookRepository.applyImportedDates(db, created.id, {
      startedAt: '2025-05-01T00:00:00.000Z',
      finishedAt: null, // не чіпати
      addedAt: null, // не чіпати
    });

    const afterFirst = await UserBookRepository.getById(db, created.id);
    expect(afterFirst?.startedAt).toBe('2025-05-01T00:00:00.000Z');
    expect(afterFirst?.finishedAt).toBeNull();
    expect(afterFirst?.addedAt).toBe(originalAddedAt);

    await UserBookRepository.applyImportedDates(db, created.id, {
      finishedAt: '2025-06-01T00:00:00.000Z',
    });

    const afterSecond = await UserBookRepository.getById(db, created.id);
    expect(afterSecond?.startedAt).toBe('2025-05-01T00:00:00.000Z'); // лишився з першого виклику
    expect(afterSecond?.finishedAt).toBe('2025-06-01T00:00:00.000Z');
  });
});

describe('UserBookRepository.listByIds / listWithDetailsByIds — порядок і виключення видалених', () => {
  it('listByIds: результат у порядку переданих ids, не порядку вставки', async () => {
    const db = await openMigratedTestDb();
    const { editionId: e1 } = await seedWorkAndEdition(db, 'work-a');
    const { editionId: e2 } = await seedWorkAndEdition(db, 'work-b');
    const { editionId: e3 } = await seedWorkAndEdition(db, 'work-c');
    const ub1 = await UserBookRepository.addToLibrary(db, e1, 'want_to_read');
    const ub2 = await UserBookRepository.addToLibrary(db, e2, 'want_to_read');
    const ub3 = await UserBookRepository.addToLibrary(db, e3, 'want_to_read');

    const result = await UserBookRepository.listByIds(db, [ub3.id, ub1.id, ub2.id]);
    expect(result.map((ub) => ub.id)).toEqual([ub3.id, ub1.id, ub2.id]);
  });

  it('listByIds: пропускає видалені й неіснуючі id, не кидає виняток', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db);
    const created = await UserBookRepository.addToLibrary(db, editionId, 'want_to_read');
    await UserBookRepository.remove(db, created.id);

    const result = await UserBookRepository.listByIds(db, [created.id, 'nonexistent']);
    expect(result).toEqual([]);
  });

  it('listWithDetailsByIds: кожен елемент має edition+work, як getByIdWithDetails', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db, 'work-batch');
    const created = await UserBookRepository.addToLibrary(db, editionId, 'want_to_read');

    const result = await UserBookRepository.listWithDetailsByIds(db, [created.id]);
    expect(result).toHaveLength(1);
    expect(result[0]?.edition.id).toBe(editionId);
  });
});

describe('UserBookRepository.listByStatus / listAll / listStatusOnly', () => {
  it('listByStatus: лише книги заданого статусу', async () => {
    const db = await openMigratedTestDb();
    const { editionId: e1 } = await seedWorkAndEdition(db, 'work-x');
    const { editionId: e2 } = await seedWorkAndEdition(db, 'work-y');
    await UserBookRepository.addToLibrary(db, e1, 'reading');
    await UserBookRepository.addToLibrary(db, e2, 'want_to_read');

    const reading = await UserBookRepository.listByStatus(db, 'reading');
    expect(reading).toHaveLength(1);
    expect(reading[0]?.edition.id).toBe(e1);
  });

  it('listAll: усі книги незалежно від статусу, без видалених', async () => {
    const db = await openMigratedTestDb();
    const { editionId: e1 } = await seedWorkAndEdition(db, 'work-x2');
    const { editionId: e2 } = await seedWorkAndEdition(db, 'work-y2');
    await UserBookRepository.addToLibrary(db, e1, 'reading');
    const toRemove = await UserBookRepository.addToLibrary(db, e2, 'want_to_read');
    await UserBookRepository.remove(db, toRemove.id);

    const all = await UserBookRepository.listAll(db);
    expect(all).toHaveLength(1);
    expect(all[0]?.edition.id).toBe(e1);
  });

  it('listStatusOnly: легкий вибір без edition/work, лише поля UserBook', async () => {
    const db = await openMigratedTestDb();
    const { editionId } = await seedWorkAndEdition(db, 'work-light');
    await UserBookRepository.addToLibrary(db, editionId, 'finished');

    const result = await UserBookRepository.listStatusOnly(db, 'finished');
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('edition');
    expect(result[0]?.status).toBe('finished');
  });
});
