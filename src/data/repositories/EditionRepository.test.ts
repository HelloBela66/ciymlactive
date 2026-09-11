import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { EditionRepository } from './EditionRepository';

/**
 * Repository-інтеграційний тест для `EditionRepository` — перший тест на цей репозиторій
 * (критичний за quality gate POLYTSIA V1.6). Особлива увага — `listAllIsbnKeys`, яка навмисно
 * обчислює ОБИДВА еквіваленти ISBN (10 і 13) через `isbnEquivalents()`, а не читає буквальні
 * значення колонок (задокументований фікс аудиту M11 п.6.6 — без цього рекомендація могла
 * запропонувати вже наявну книгу як "нову", якщо джерела не узгоджені щодо того, яке з двох
 * полів ISBN заповнено).
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

const NOW = '2026-01-01T00:00:00.000Z';

// Класична пара ISBN-10/ISBN-13 одного видання (0-306-40615-2 / 978-0-306-40615-7) —
// стандартний приклад коректної контрольної цифри для обох стандартів.
const ISBN_10 = '0306406152';
const ISBN_13 = '9780306406157';

async function seedWork(db: SQLiteDatabase, workId = 'work-1'): Promise<string> {
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    workId,
    `Твір ${workId}`,
    NOW,
    NOW,
  ]);
  return workId;
}

describe('EditionRepository.create', () => {
  it('застосовує дефолти: format="paperback", language="uk", коли не вказано', async () => {
    const db = await openMigratedTestDb();
    const workId = await seedWork(db);

    const edition = await EditionRepository.create(db, { workId, title: 'Тестове видання' });

    expect(edition.format).toBe('paperback');
    expect(edition.language).toBe('uk');
    expect(edition.title).toBe('Тестове видання');
  });

  it('поважає явно вказані значення замість дефолтів', async () => {
    const db = await openMigratedTestDb();
    const workId = await seedWork(db);

    const edition = await EditionRepository.create(db, {
      workId,
      title: 'English Edition',
      format: 'ebook',
      language: 'en',
      isbn13: ISBN_13,
    });

    expect(edition.format).toBe('ebook');
    expect(edition.language).toBe('en');
    expect(edition.isbn13).toBe(ISBN_13);
  });
});

describe('EditionRepository.setCoverUrl / getById', () => {
  it('setCoverUrl оновлює coverUrl наявного видання', async () => {
    const db = await openMigratedTestDb();
    const workId = await seedWork(db);
    const edition = await EditionRepository.create(db, { workId, title: 'Книга' });

    await EditionRepository.setCoverUrl(db, edition.id, 'file:///local/cover.jpg');

    const updated = await EditionRepository.getById(db, edition.id);
    expect(updated?.coverUrl).toBe('file:///local/cover.jpg');
  });

  it('getById повертає null для неіснуючого id', async () => {
    const db = await openMigratedTestDb();
    expect(await EditionRepository.getById(db, 'nonexistent')).toBeNull();
  });
});

describe('EditionRepository.getByIdWithRelations', () => {
  it("publisher — null, translators — порожній масив, коли нічого не прив'язано", async () => {
    const db = await openMigratedTestDb();
    const workId = await seedWork(db);
    const edition = await EditionRepository.create(db, { workId, title: 'Книга без деталей' });

    const withRelations = await EditionRepository.getByIdWithRelations(db, edition.id);
    expect(withRelations?.publisher).toBeNull();
    expect(withRelations?.translators).toEqual([]);
  });

  it("підвантажує publisher і translators, коли прив'язані", async () => {
    const db = await openMigratedTestDb();
    const workId = await seedWork(db);
    await db.runAsync(`INSERT INTO publisher (id, name, created_at, updated_at) VALUES (?,?,?,?)`, [
      'pub-1',
      'Видавництво "Старий Лев"',
      NOW,
      NOW,
    ]);
    const edition = await EditionRepository.create(db, {
      workId,
      title: 'Книга з видавцем',
      publisherId: 'pub-1',
    });
    await db.runAsync(`INSERT INTO translator (id, name, created_at, updated_at) VALUES (?,?,?,?)`, [
      'tr-1',
      'Перекладач Перекладенко',
      NOW,
      NOW,
    ]);
    await db.runAsync(`INSERT INTO edition_translator (edition_id, translator_id) VALUES (?,?)`, [
      edition.id,
      'tr-1',
    ]);

    const withRelations = await EditionRepository.getByIdWithRelations(db, edition.id);
    expect(withRelations?.publisher?.name).toBe('Видавництво "Старий Лев"');
    expect(withRelations?.translators.map((t) => t.name)).toEqual(['Перекладач Перекладенко']);
  });
});

describe('EditionRepository.getByIsbn', () => {
  it('знаходить видання за isbn13', async () => {
    const db = await openMigratedTestDb();
    const workId = await seedWork(db);
    await EditionRepository.create(db, { workId, title: 'Книга', isbn13: ISBN_13 });

    const found = await EditionRepository.getByIsbn(db, ISBN_13);
    expect(found?.isbn13).toBe(ISBN_13);
  });

  it('знаходить видання за isbn10', async () => {
    const db = await openMigratedTestDb();
    const workId = await seedWork(db);
    await EditionRepository.create(db, { workId, title: 'Книга', isbn10: ISBN_10 });

    const found = await EditionRepository.getByIsbn(db, ISBN_10);
    expect(found?.isbn10).toBe(ISBN_10);
  });

  it('повертає null, якщо жодне видання не збігається', async () => {
    const db = await openMigratedTestDb();
    expect(await EditionRepository.getByIsbn(db, '0000000000')).toBeNull();
  });
});

describe('EditionRepository.listByIds', () => {
  it('повертає Map, ключ — id, виключає неіснуючі', async () => {
    const db = await openMigratedTestDb();
    const workId = await seedWork(db);
    const e1 = await EditionRepository.create(db, { workId, title: 'Видання 1' });
    const e2 = await EditionRepository.create(db, { workId, title: 'Видання 2' });

    const result = await EditionRepository.listByIds(db, [e1.id, e2.id, 'nonexistent']);
    expect(result.size).toBe(2);
    expect(result.get(e1.id)?.title).toBe('Видання 1');
  });

  it('порожній масив id повертає порожню Map без запиту до БД', async () => {
    const db = await openMigratedTestDb();
    expect((await EditionRepository.listByIds(db, [])).size).toBe(0);
  });
});

describe('EditionRepository.listAllIsbnKeys — обидва ISBN-еквіваленти, навіть якщо збережено лише один', () => {
  it('видання збережене лише з isbn10 — Set містить і isbn10, і обчислений isbn13', async () => {
    const db = await openMigratedTestDb();
    const workId = await seedWork(db);
    await EditionRepository.create(db, { workId, title: 'Лише ISBN10', isbn10: ISBN_10 });

    const keys = await EditionRepository.listAllIsbnKeys(db);
    expect(keys.has(ISBN_10)).toBe(true);
    expect(keys.has(ISBN_13)).toBe(true);
  });

  it('видання збережене лише з isbn13 — Set містить і isbn13, і обчислений isbn10', async () => {
    const db = await openMigratedTestDb();
    const workId = await seedWork(db);
    await EditionRepository.create(db, { workId, title: 'Лише ISBN13', isbn13: ISBN_13 });

    const keys = await EditionRepository.listAllIsbnKeys(db);
    expect(keys.has(ISBN_13)).toBe(true);
    expect(keys.has(ISBN_10)).toBe(true);
  });

  it('без жодного видання з ISBN повертає порожній Set', async () => {
    const db = await openMigratedTestDb();
    const workId = await seedWork(db);
    await EditionRepository.create(db, { workId, title: 'Без ISBN' });

    expect((await EditionRepository.listAllIsbnKeys(db)).size).toBe(0);
  });
});

describe('EditionRepository.listByWorkId / listByWorkIdWithRelations', () => {
  it('повертає лише видання цього твору, у порядку created_at ASC', async () => {
    const db = await openMigratedTestDb();
    const workA = await seedWork(db, 'work-a');
    const workB = await seedWork(db, 'work-b');
    const eA1 = await EditionRepository.create(db, { workId: workA, title: 'A - перше видання' });
    await EditionRepository.create(db, { workId: workB, title: 'B - інший твір' });
    const eA2 = await EditionRepository.create(db, { workId: workA, title: 'A - друге видання' });

    const editions = await EditionRepository.listByWorkId(db, workA);
    expect(editions.map((e) => e.id)).toEqual([eA1.id, eA2.id]);
  });

  it('listByWorkIdWithRelations повертає порожній масив для твору без видань', async () => {
    const db = await openMigratedTestDb();
    const workId = await seedWork(db, 'work-empty');
    expect(await EditionRepository.listByWorkIdWithRelations(db, workId)).toEqual([]);
  });
});
