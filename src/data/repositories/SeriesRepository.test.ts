import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { SeriesRepository } from './SeriesRepository';
import { AuthorRepository } from './AuthorRepository';

/**
 * Repository-інтеграційний тест для `SeriesRepository` (POLYTSIA V1.6.2, #165 — раніше без
 * жодного тесту, попри те що `addEntry` покладається на нетривіальний `ON CONFLICT ... DO
 * UPDATE` і `getByIdWithWorks` — на SQLite-специфічне сортування `position IS NULL, position
 * ASC` для "невідомого порядку в кінці списку").
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

const NOW = '2026-01-01T00:00:00.000Z';

async function seedWork(db: SQLiteDatabase, workId: string, title = `Твір ${workId}`): Promise<string> {
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    workId,
    title,
    NOW,
    NOW,
  ]);
  return workId;
}

describe('SeriesRepository.findByName / findOrCreateByName', () => {
  it('findByName повертає null, якщо серії немає', async () => {
    const db = await openMigratedTestDb();
    expect(await SeriesRepository.findByName(db, 'Немає такої')).toBeNull();
  });

  it('findOrCreateByName створює нову серію зі status="unknown" і трімить назву', async () => {
    const db = await openMigratedTestDb();
    const series = await SeriesRepository.findOrCreateByName(db, '  Відьмак  ');

    expect(series.name).toBe('Відьмак');
    expect(series.status).toBe('unknown');
    expect(series.totalKnownWorks).toBeNull();
  });

  it('findOrCreateByName повторно повертає той самий рядок, а не дублікат', async () => {
    const db = await openMigratedTestDb();
    const first = await SeriesRepository.findOrCreateByName(db, 'Гаррі Поттер');
    const second = await SeriesRepository.findOrCreateByName(db, 'Гаррі Поттер');

    expect(second.id).toBe(first.id);
    const rows = await db.getAllAsync(`SELECT * FROM series WHERE name = ?`, ['Гаррі Поттер']);
    expect(rows).toHaveLength(1);
  });
});

describe('SeriesRepository.search', () => {
  it('порожній запит повертає порожній масив без звернення до БД', async () => {
    const db = await openMigratedTestDb();
    expect(await SeriesRepository.search(db, '   ')).toEqual([]);
  });

  it('знаходить серію за частковим збігом назви', async () => {
    const db = await openMigratedTestDb();
    await SeriesRepository.findOrCreateByName(db, 'Пісня льоду і полум’я');
    await SeriesRepository.findOrCreateByName(db, 'Відьмак');

    const results = await SeriesRepository.search(db, 'льоду');
    expect(results.map((s) => s.name)).toEqual(['Пісня льоду і полум’я']);
  });
});

describe('SeriesRepository.addEntry', () => {
  it('створює новий запис серії з усіма трьома видами порядку рівними position', async () => {
    const db = await openMigratedTestDb();
    const series = await SeriesRepository.findOrCreateByName(db, 'Серія');
    const workId = await seedWork(db, 'work-1');

    const entry = await SeriesRepository.addEntry(db, { seriesId: series.id, workId, position: 2 });

    expect(entry.position).toBe(2);
    expect(entry.publicationOrder).toBe(2);
    expect(entry.chronologicalOrder).toBe(2);
    expect(entry.recommendedOrder).toBe(2);
    expect(entry.entryType).toBe('main');
  });

  it('повторний addEntry для тієї самої пари (series, work) ОНОВЛЮЄ position, а не дублює рядок', async () => {
    const db = await openMigratedTestDb();
    const series = await SeriesRepository.findOrCreateByName(db, 'Серія');
    const workId = await seedWork(db, 'work-1');

    await SeriesRepository.addEntry(db, { seriesId: series.id, workId, position: 1 });
    await SeriesRepository.addEntry(db, { seriesId: series.id, workId, position: 5 });

    const rows = await db.getAllAsync<{ position: number | null }>(
      `SELECT position FROM series_entry WHERE series_id = ? AND work_id = ?`,
      [series.id, workId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.position).toBe(5);
  });
});

describe('SeriesRepository.getContextForWork', () => {
  it('повертає null, якщо твір не в жодній серії', async () => {
    const db = await openMigratedTestDb();
    const workId = await seedWork(db, 'work-solo');
    expect(await SeriesRepository.getContextForWork(db, workId)).toBeNull();
  });

  it('повертає серію і позицію для твору в серії', async () => {
    const db = await openMigratedTestDb();
    const series = await SeriesRepository.findOrCreateByName(db, 'Серія');
    const workId = await seedWork(db, 'work-1');
    await SeriesRepository.addEntry(db, { seriesId: series.id, workId, position: 4 });

    const context = await SeriesRepository.getContextForWork(db, workId);
    expect(context?.series.id).toBe(series.id);
    expect(context?.position).toBe(4);
  });
});

describe('SeriesRepository.listWorkIdsInSeries', () => {
  it('порожній масив id повертає порожній Set без запиту до БД', async () => {
    const db = await openMigratedTestDb();
    expect((await SeriesRepository.listWorkIdsInSeries(db, [])).size).toBe(0);
  });

  it('повертає лише ті id творів, що дійсно мають запис у series_entry', async () => {
    const db = await openMigratedTestDb();
    const series = await SeriesRepository.findOrCreateByName(db, 'Серія');
    const inSeries = await seedWork(db, 'work-in-series');
    const notInSeries = await seedWork(db, 'work-not-in-series');
    await SeriesRepository.addEntry(db, { seriesId: series.id, workId: inSeries, position: 1 });

    const result = await SeriesRepository.listWorkIdsInSeries(db, [inSeries, notInSeries]);
    expect(result.has(inSeries)).toBe(true);
    expect(result.has(notInSeries)).toBe(false);
  });
});

describe('SeriesRepository.getById / getByIdWithWorks', () => {
  it('getById повертає null для неіснуючого id', async () => {
    const db = await openMigratedTestDb();
    expect(await SeriesRepository.getById(db, 'nonexistent')).toBeNull();
  });

  it('getByIdWithWorks повертає null для неіснуючої серії', async () => {
    const db = await openMigratedTestDb();
    expect(await SeriesRepository.getByIdWithWorks(db, 'nonexistent')).toBeNull();
  });

  it('getByIdWithWorks упорядковує за position ASC, а NULL-позиції — в кінці', async () => {
    const db = await openMigratedTestDb();
    const series = await SeriesRepository.findOrCreateByName(db, 'Серія');
    const workNull = await seedWork(db, 'work-null', 'Без позиції');
    const workFirst = await seedWork(db, 'work-first', 'Перша');
    const workSecond = await seedWork(db, 'work-second', 'Друга');

    // Навмисно додаємо в "неправильному" порядку, щоб перевірити, що сортує саме position,
    // а не порядок вставки.
    await SeriesRepository.addEntry(db, { seriesId: series.id, workId: workNull, position: null });
    await SeriesRepository.addEntry(db, { seriesId: series.id, workId: workSecond, position: 2 });
    await SeriesRepository.addEntry(db, { seriesId: series.id, workId: workFirst, position: 1 });

    const withWorks = await SeriesRepository.getByIdWithWorks(db, series.id);
    expect(withWorks?.entries.map((e) => e.work.title)).toEqual(['Перша', 'Друга', 'Без позиції']);
  });

  it('getByIdWithWorks підвантажує авторів кожного твору', async () => {
    const db = await openMigratedTestDb();
    const series = await SeriesRepository.findOrCreateByName(db, 'Серія');
    const workId = await seedWork(db, 'work-1');
    const author = await AuthorRepository.findOrCreateByName(db, 'Автор Серії');
    await AuthorRepository.linkToWork(db, workId, author.id);
    await SeriesRepository.addEntry(db, { seriesId: series.id, workId, position: 1 });

    const withWorks = await SeriesRepository.getByIdWithWorks(db, series.id);
    expect(withWorks?.entries[0]?.work.authors.map((a) => a.name)).toEqual(['Автор Серії']);
  });
});
