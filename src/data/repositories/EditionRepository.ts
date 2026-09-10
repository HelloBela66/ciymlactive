import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import { isbnEquivalents } from '@/lib/isbn';
import type { Edition, EditionFormatValue, EditionWithRelations } from '@/types/edition';
import { PublisherRepository } from './PublisherRepository';
import { TranslatorRepository } from './TranslatorRepository';

interface EditionRow {
  id: string;
  work_id: string;
  title: string;
  subtitle: string | null;
  isbn10: string | null;
  isbn13: string | null;
  language: string;
  publisher_id: string | null;
  publication_date: string | null;
  publication_year: number | null;
  page_count: number | null;
  format: EditionFormatValue;
  cover_url: string | null;
  description_override: string | null;
  source_id: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: EditionRow): Edition {
  return {
    id: row.id,
    workId: row.work_id,
    title: row.title,
    subtitle: row.subtitle,
    isbn10: row.isbn10,
    isbn13: row.isbn13,
    language: row.language,
    publisherId: row.publisher_id,
    publicationDate: row.publication_date,
    publicationYear: row.publication_year,
    pageCount: row.page_count,
    format: row.format,
    coverUrl: row.cover_url,
    descriptionOverride: row.description_override,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateEditionInput {
  workId: string;
  title: string;
  subtitle?: string | null;
  isbn10?: string | null;
  isbn13?: string | null;
  language?: string;
  publisherId?: string | null;
  publicationDate?: string | null;
  publicationYear?: number | null;
  pageCount?: number | null;
  format?: EditionFormatValue;
  coverUrl?: string | null;
  descriptionOverride?: string | null;
  sourceId?: string | null;
  sourceUrl?: string | null;
}

/**
 * Edition — конкретне видання твору (докладніше — docs/DATABASE.md, розділ Work vs Edition).
 * У Milestone 1 переважна більшість книг матиме рівно одне edition (створене разом із work
 * у bookDraftRepository), але repository навмисно не припускає цього — множинні видання
 * (переклади, перевидання) з'являються без зміни цього шару в наступних milestone.
 */
export const EditionRepository = {
  async create(db: SQLiteDatabase, input: CreateEditionInput): Promise<Edition> {
    const id = generateId();
    const now = nowIso();
    const format: EditionFormatValue = input.format ?? 'paperback';
    const language = input.language ?? 'uk';

    await db.runAsync(
      `INSERT INTO edition (
         id, work_id, title, subtitle, isbn10, isbn13, language, publisher_id,
         publication_date, publication_year, page_count, format, cover_url,
         description_override, source_id, source_url, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.workId,
        input.title,
        input.subtitle ?? null,
        input.isbn10 ?? null,
        input.isbn13 ?? null,
        language,
        input.publisherId ?? null,
        input.publicationDate ?? null,
        input.publicationYear ?? null,
        input.pageCount ?? null,
        format,
        input.coverUrl ?? null,
        input.descriptionOverride ?? null,
        input.sourceId ?? null,
        input.sourceUrl ?? null,
        now,
        now,
      ],
    );

    return {
      id,
      workId: input.workId,
      title: input.title,
      subtitle: input.subtitle ?? null,
      isbn10: input.isbn10 ?? null,
      isbn13: input.isbn13 ?? null,
      language,
      publisherId: input.publisherId ?? null,
      publicationDate: input.publicationDate ?? null,
      publicationYear: input.publicationYear ?? null,
      pageCount: input.pageCount ?? null,
      format,
      coverUrl: input.coverUrl ?? null,
      descriptionOverride: input.descriptionOverride ?? null,
      sourceId: input.sourceId ?? null,
      sourceUrl: input.sourceUrl ?? null,
      createdAt: now,
      updatedAt: now,
    };
  },

  /** "Додати обкладинку" (Milestone 10) — власне фото користувача, коли жоден провайдер її
   * не мав. Приймає готовий URL/URI (локальний `file://` одразу після зйомки, згодом,
   * можливо, замінений на публічний `https://` після фонового завантаження в Supabase
   * Storage, `src/data/remote/coverStorageClient.ts`) — сам запис не знає й не має знати,
   * звідки саме це значення прийшло. */
  async setCoverUrl(db: SQLiteDatabase, id: string, coverUrl: string): Promise<void> {
    await db.runAsync(`UPDATE edition SET cover_url = ?, updated_at = ? WHERE id = ?`, [coverUrl, nowIso(), id]);
  },

  async getById(db: SQLiteDatabase, id: string): Promise<Edition | null> {
    const row = await db.getFirstAsync<EditionRow>(
      `SELECT * FROM edition WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    return row ? mapRow(row) : null;
  },

  async getByIdWithRelations(db: SQLiteDatabase, id: string): Promise<EditionWithRelations | null> {
    const edition = await EditionRepository.getById(db, id);
    if (!edition) return null;
    const [publisher, translators] = await Promise.all([
      edition.publisherId ? PublisherRepository.getById(db, edition.publisherId) : Promise.resolve(null),
      TranslatorRepository.listByEditionId(db, edition.id),
    ]);
    return { ...edition, publisher, translators };
  },

  /** Пошук за ISBN (10 чи 13) — перший крок ISBN-flow (docs/BOOK_PROVIDERS.md): книга вже
   * могла бути додана раніше, перш ніж питати зовнішні провайдери. */
  async getByIsbn(db: SQLiteDatabase, isbn: string): Promise<Edition | null> {
    const row = await db.getFirstAsync<EditionRow>(
      `SELECT * FROM edition WHERE (isbn10 = ? OR isbn13 = ?) AND deleted_at IS NULL LIMIT 1`,
      [isbn, isbn],
    );
    return row ? mapRow(row) : null;
  },

  /** Пакетний варіант `getById` для списків (Milestone 8, продуктивність) — один запит на
   * весь список замість одного на рядок, викликається з `UserBookRepository.attachDetailsBatch`.
   * Повертає "сирі" Edition без publisher/translators — їх сам виклик батчить окремо. */
  async listByIds(db: SQLiteDatabase, ids: string[]): Promise<Map<string, Edition>> {
    const result = new Map<string, Edition>();
    if (ids.length === 0) return result;
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.getAllAsync<EditionRow>(
      `SELECT * FROM edition WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      ids,
    );
    for (const row of rows) result.set(row.id, mapRow(row));
    return result;
  },

  /** Усі ISBN уже в бібліотеці (ОБИДВА формати — і збережений, і математично перерахований,
   * навіть коли в БД є лише один) — для "Що почитати завтра?" (Milestone 11, доповнення):
   * рекомендація ніколи не пропонує книгу, яку користувач уже додав, незалежно від того, за
   * яким саме форматом ISBN вона колись прийшла в бібліотеку.
   *
   * Аудит M11, п.6.6: раніше в `Set` йшли лише буквальні значення `isbn10`/`isbn13` колонок —
   * якщо власне видання збережене з лише `isbn10` (звичайна ситуація для старіших видань чи
   * ручного вводу), а кандидат на рекомендацію тієї самої книги прийшов з лише `isbn13`
   * (провайдери непослідовні щодо того, яке поле заповнюють), `recommendationBookKey` (який
   * бере `isbn13` першим) ніколи не збігався з таким `Set` — застосунок міг порадити вже
   * наявну книгу як "нову". Той самий клас проблеми вже лагодили для спільного каталогу
   * (п. 3.5, `catalogSync.ts`) — тут використано ту саму готову функцію `isbnEquivalents()`
   * (`src/lib/isbn.ts`), а не буквальне зчитування колонок. */
  async listAllIsbnKeys(db: SQLiteDatabase): Promise<Set<string>> {
    const rows = await db.getAllAsync<{ isbn10: string | null; isbn13: string | null }>(
      `SELECT isbn10, isbn13 FROM edition WHERE deleted_at IS NULL`,
    );
    const keys = new Set<string>();
    for (const row of rows) {
      // Кожен з двох (коли є) конвертується в СВІЙ еквівалент — не лише навпаки з іншого,
      // бо теоретично колонки можуть містити взаємно НЕузгоджені значення (дані з різних
      // джерел/ручний ввід); беремо все, що можемо отримати з будь-якого з двох полів.
      if (row.isbn13) {
        const { isbn10, isbn13 } = isbnEquivalents(row.isbn13);
        if (isbn13) keys.add(isbn13);
        if (isbn10) keys.add(isbn10);
      }
      if (row.isbn10) {
        const { isbn10, isbn13 } = isbnEquivalents(row.isbn10);
        if (isbn13) keys.add(isbn13);
        if (isbn10) keys.add(isbn10);
      }
    }
    return keys;
  },

  async listByWorkId(db: SQLiteDatabase, workId: string): Promise<Edition[]> {
    const rows = await db.getAllAsync<EditionRow>(
      `SELECT * FROM edition WHERE work_id = ? AND deleted_at IS NULL ORDER BY created_at ASC`,
      [workId],
    );
    return rows.map(mapRow);
  },

  /** Усі видання твору разом з видавництвом/перекладачами — для Book Details (Milestone 1). */
  async listByWorkIdWithRelations(db: SQLiteDatabase, workId: string): Promise<EditionWithRelations[]> {
    const editions = await EditionRepository.listByWorkId(db, workId);
    if (editions.length === 0) return [];
    return Promise.all(
      editions.map(async (edition) => {
        const [publisher, translators] = await Promise.all([
          edition.publisherId ? PublisherRepository.getById(db, edition.publisherId) : Promise.resolve(null),
          TranslatorRepository.listByEditionId(db, edition.id),
        ]);
        return { ...edition, publisher, translators };
      }),
    );
  },
};
