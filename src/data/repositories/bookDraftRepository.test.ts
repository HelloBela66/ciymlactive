import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import type { NormalizedBookDraft } from '@/types/bookDraft';
import { createWorkAndEditionFromDraft } from './bookDraftRepository';
import { WorkRepository } from './WorkRepository';
import { EditionRepository } from './EditionRepository';
import { AuthorRepository } from './AuthorRepository';
import { SeriesRepository } from './SeriesRepository';
import { PublisherRepository } from './PublisherRepository';
import { TranslatorRepository } from './TranslatorRepository';

/**
 * Repository-інтеграційний тест для `createWorkAndEditionFromDraft` (POLYTSIA V1.6.2, #165 —
 * найризикованіший файл з нульовим покриттям per аудит: єдиний багатотабличний
 * write-шлях у кодовій базі, і сам коментар у файлі явно каже "все — в одній транзакції".
 * Перевіряємо: (1) щасливий шлях з усіма опційними полями, (2) мінімальний драфт без
 * серії/видавництва/перекладачів, (3) дедублікація автора/серії/видавництва/перекладача за
 * іменем (не створює дублікат, якщо такий вже є), (4) атомарність — падіння всередині
 * транзакції не лишає "наполовину доданої" книги (той самий патерн відкату, що вже
 * використаний у BackupRepository.test.ts/ReadingSessionRepository.test.ts).
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

function buildDraft(overrides: Partial<NormalizedBookDraft> = {}): NormalizedBookDraft {
  return {
    title: 'Дефолтна назва',
    authors: [],
    translators: [],
    language: 'uk',
    format: 'paperback',
    source: { sourceType: 'manual', sourceName: 'Ручне введення' },
    ...overrides,
  };
}

async function countRows(
  db: SQLiteDatabase,
  table: string,
  where: string,
  params: (string | number | null)[],
): Promise<number> {
  const row = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) as c FROM ${table} WHERE ${where}`, params);
  return row?.c ?? 0;
}

describe('createWorkAndEditionFromDraft — щасливий шлях (усі опційні поля)', () => {
  it('створює Work+Edition і всі пов’язані сутності з одного драфту', async () => {
    const db = await openMigratedTestDb();
    const draft = buildDraft({
      title: 'Тіні забутих предків',
      originalTitle: 'Тіні забутих предків (оригінал)',
      description: 'Опис',
      originalLanguage: 'uk',
      firstPublishedYear: 1911,
      authors: ['Михайло Коцюбинський', 'Другий Автор'],
      isbn10: '0306406152',
      isbn13: '9780306406157',
      publisher: 'Видавництво "Старий Лев"',
      translators: ['Перекладач Перекладенко'],
      publicationYear: 2020,
      pageCount: 150,
      coverUrl: 'https://example.com/cover.jpg',
      seriesName: 'Українська класика',
      seriesPosition: 3,
      source: {
        sourceType: 'google_books',
        sourceName: 'Google Books',
        sourceUrl: 'https://books.google.com/books?id=abc123',
        externalId: 'abc123',
      },
    });

    const result = await createWorkAndEditionFromDraft(db, draft);

    const work = await WorkRepository.getByIdWithAuthors(db, result.workId);
    expect(work?.title).toBe('Тіні забутих предків');
    expect(work?.originalTitle).toBe('Тіні забутих предків (оригінал)');
    expect(work?.firstPublishedYear).toBe(1911);
    expect(work?.authors.map((a) => a.name).sort()).toEqual(['Другий Автор', 'Михайло Коцюбинський']);

    const edition = await EditionRepository.getByIdWithRelations(db, result.editionId);
    expect(edition?.workId).toBe(result.workId);
    expect(edition?.isbn10).toBe('0306406152');
    expect(edition?.isbn13).toBe('9780306406157');
    expect(edition?.publisher?.name).toBe('Видавництво "Старий Лев"');
    expect(edition?.translators.map((t) => t.name)).toEqual(['Перекладач Перекладенко']);
    expect(edition?.sourceUrl).toBe('https://books.google.com/books?id=abc123');

    const seriesContext = await SeriesRepository.getContextForWork(db, result.workId);
    expect(seriesContext?.series.name).toBe('Українська класика');
    expect(seriesContext?.position).toBe(3);

    // book_source — provenance-запис прив'язаний саме через edition.sourceId (не через FK
    // на work), перевіряємо напряму по таблиці, бо BookSourceRepository не має getById.
    const sourceRow = await db.getFirstAsync<{
      source_type: string;
      source_name: string;
      source_url: string | null;
      external_id: string | null;
    }>(`SELECT * FROM book_source WHERE id = ?`, [edition?.sourceId ?? null]);
    expect(sourceRow?.source_type).toBe('google_books');
    expect(sourceRow?.source_name).toBe('Google Books');
    expect(sourceRow?.external_id).toBe('abc123');
  });
});

describe('createWorkAndEditionFromDraft — мінімальний драфт (без серії/видавництва/перекладачів)', () => {
  it('пропускає опційні гілки без помилок: publisherId=null, немає серії, немає перекладачів/авторів', async () => {
    const db = await openMigratedTestDb();
    const draft = buildDraft({ title: 'Мінімальна книга' });

    const result = await createWorkAndEditionFromDraft(db, draft);

    const work = await WorkRepository.getByIdWithAuthors(db, result.workId);
    expect(work?.authors).toEqual([]);

    const edition = await EditionRepository.getByIdWithRelations(db, result.editionId);
    expect(edition?.publisher).toBeNull();
    expect(edition?.publisherId).toBeNull();
    expect(edition?.translators).toEqual([]);

    const seriesContext = await SeriesRepository.getContextForWork(db, result.workId);
    expect(seriesContext).toBeNull();
  });
});

describe('createWorkAndEditionFromDraft — дедублікація за іменем', () => {
  it('перевикористовує наявних автора/серію/видавництво/перекладача замість дублювання', async () => {
    const db = await openMigratedTestDb();

    const existingAuthor = await AuthorRepository.findOrCreateByName(db, 'Спільний Автор');
    const existingSeries = await SeriesRepository.findOrCreateByName(db, 'Спільна Серія');
    const existingPublisher = await PublisherRepository.findOrCreateByName(db, 'Спільне Видавництво');
    const existingTranslator = await TranslatorRepository.findOrCreateByName(db, 'Спільний Перекладач');

    // Ті самі імена, але з зайвими пробілами — findOrCreateByName у всіх репозиторіях трімить
    // перед порівнянням, тож це має все одно резолвитись у ТІ САМІ рядки.
    const draft = buildDraft({
      title: 'Книга з наявними довідниками',
      authors: ['  Спільний Автор  '],
      translators: ['  Спільний Перекладач  '],
      publisher: '  Спільне Видавництво  ',
      seriesName: '  Спільна Серія  ',
      seriesPosition: 1,
    });

    const result = await createWorkAndEditionFromDraft(db, draft);

    const work = await WorkRepository.getByIdWithAuthors(db, result.workId);
    expect(work?.authors).toHaveLength(1);
    expect(work?.authors[0]?.id).toBe(existingAuthor.id);
    expect(await countRows(db, 'author', 'name = ?', ['Спільний Автор'])).toBe(1);

    const seriesContext = await SeriesRepository.getContextForWork(db, result.workId);
    expect(seriesContext?.series.id).toBe(existingSeries.id);
    expect(await countRows(db, 'series', 'name = ?', ['Спільна Серія'])).toBe(1);

    const edition = await EditionRepository.getByIdWithRelations(db, result.editionId);
    expect(edition?.publisherId).toBe(existingPublisher.id);
    expect(await countRows(db, 'publisher', 'name = ?', ['Спільне Видавництво'])).toBe(1);
    expect(edition?.translators.map((t) => t.id)).toEqual([existingTranslator.id]);
    expect(await countRows(db, 'translator', 'name = ?', ['Спільний Перекладач'])).toBe(1);
  });
});

describe('createWorkAndEditionFromDraft — атомарність (відкат при падінні всередині транзакції)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('падіння EditionRepository.create не лишає ні Work, ні автора, ні серію, ні book_source', async () => {
    const db = await openMigratedTestDb();
    const draft = buildDraft({
      title: 'Книга, що не має вціліти',
      authors: ['Автор, що не має вціліти'],
      seriesName: 'Серія, що не має вціліти',
      publisher: 'Видавництво, що не має вціліти',
    });

    const sourceCountBefore = await countRows(db, 'book_source', '1 = 1', []);

    jest.spyOn(EditionRepository, 'create').mockRejectedValueOnce(new Error('симульований збій запису edition'));

    await expect(createWorkAndEditionFromDraft(db, draft)).rejects.toThrow('симульований збій запису edition');

    expect(await countRows(db, 'work', 'title = ?', ['Книга, що не має вціліти'])).toBe(0);
    expect(await countRows(db, 'author', 'name = ?', ['Автор, що не має вціліти'])).toBe(0);
    expect(await countRows(db, 'series', 'name = ?', ['Серія, що не має вціліти'])).toBe(0);
    expect(await countRows(db, 'publisher', 'name = ?', ['Видавництво, що не має вціліти'])).toBe(0);
    expect(await countRows(db, 'book_source', '1 = 1', [])).toBe(sourceCountBefore);
  });

  it('падіння TranslatorRepository.linkToEdition не лишає ні Edition, ні перекладача', async () => {
    const db = await openMigratedTestDb();
    const draft = buildDraft({
      title: 'Книга без перекладача, що не має вціліти',
      translators: ['Перекладач, що не має вціліти'],
    });

    jest
      .spyOn(TranslatorRepository, 'linkToEdition')
      .mockRejectedValueOnce(new Error('симульований збій зв’язку перекладача'));

    await expect(createWorkAndEditionFromDraft(db, draft)).rejects.toThrow('симульований збій зв’язку перекладача');

    expect(await countRows(db, 'work', 'title = ?', ['Книга без перекладача, що не має вціліти'])).toBe(0);
    expect(
      await countRows(db, 'edition', 'title = ?', ['Книга без перекладача, що не має вціліти']),
    ).toBe(0);
    expect(await countRows(db, 'translator', 'name = ?', ['Перекладач, що не має вціліти'])).toBe(0);
  });
});
