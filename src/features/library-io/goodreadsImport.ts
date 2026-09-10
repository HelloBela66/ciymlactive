import { parseCsv } from '@/lib/csv';
import type { NormalizedBookDraft } from '@/types/bookDraft';
import type { UserBookStatus } from '@/types/userBook';
import type { EditionFormatValue } from '@/types/edition';

/** Три стандартні "ексклюзивні" полиці Goodreads (кожна книга рівно на одній) — усе інше в
 * стовпці "Bookshelves" (нижче) — довільні полиці користувача. Ключі — саме slug-и, якими
 * Goodreads позначає їх у CSV (не локалізовані назви, які користувач міг собі показувати на
 * сайті). */
const EXCLUSIVE_SHELF_STATUS: Record<string, UserBookStatus> = {
  read: 'finished',
  'currently-reading': 'reading',
  'to-read': 'want_to_read',
};

export interface GoodreadsImportRow {
  draft: NormalizedBookDraft;
  status: UserBookStatus;
  ratingValue: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  addedAt: string | null;
  shelfNames: string[];
}

export interface GoodreadsParseResult {
  rows: GoodreadsImportRow[];
  totalDataRows: number;
  skippedCount: number;
}

/** Прибирає Excel-формулу захисту, якою Goodreads огортає ISBN у своєму CSV-експорті —
 * `="9781234567890"` замість просто `9781234567890` (щоб Excel не "розумнішав" і не обрізав
 * провідні нулі чи не показував число в науковій нотації). */
function stripExcelGuard(value: string): string {
  const match = /^="?(.*?)"?$/.exec(value.trim());
  // `match[1]` — захоплена група `(.*?)` в патерні вище завжди присутня, коли сам `match`
  // не `null` (регулярка не має розгалужень, де ця група могла б не спрацювати), тож
  // `?? value` тут суто для типів (`noUncheckedIndexedAccess` не знає цього напевно) —
  // насправді недосяжний фолбек.
  return (match ? match[1] ?? value : value).trim();
}

/** Goodreads пише дати як "yyyy/MM/dd" (або лишає поле порожнім, якщо дата невідома). */
function parseGoodreadsDate(raw: string): string | null {
  const match = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseOptionalInt(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function mapBinding(raw: string): EditionFormatValue {
  const value = raw.trim().toLowerCase();
  if (value.includes('audio')) return 'audiobook';
  if (value.includes('kindle') || value.includes('e-book') || value.includes('ebook')) return 'ebook';
  if (value.includes('hardcover') || value.includes('hardback') || value.includes('library binding')) return 'hardcover';
  if (value.includes('paperback')) return 'paperback';
  return 'other';
}

function splitNames(raw: string): string[] {
  return raw
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/**
 * Розбирає й нормалізує Goodreads CSV-експорт ("My Books" → "Export Library" на сайті
 * Goodreads) у список готових до збереження рядків (Milestone 9). Чиста функція — без БД чи
 * React Native, легко перевірити напряму (`node -e`, як і `csv.ts`/`slugify.ts`).
 *
 * Дизайн-рішення (докладніше — `docs/PRODUCT.md`/обговорення Milestone 9):
 * - `Exclusive Shelf` (read/currently-reading/to-read) → статус книги в застосунку;
 *   довільні власні полиці зі стовпця `Bookshelves` → полиці застосунку (`Shelf`), НЕ жанри
 *   — Goodreads-полиці зазвичай особисті ("хочу перечитати", "у поїздку"), а не жанрова
 *   класифікація, для якої в застосунку є окрема курована фіча (`GenreRepository`).
 * - Джерело книги позначається як `manual` (не окремий тип у `BookSourceTypeSchema`) — дані
 *   з CSV НЕ перевіряються повторно через платний ISBNdb, а `sourceName` нижче все одно
 *   зберігає походження "Goodreads (CSV-імпорт)" для довідки.
 * - Пропускає лише рядки без назви (`title`) — усе інше має розумний дефолт, щоб один
 *   неочікуваний чи порожній стовпець не губив книгу мовчки.
 */
export function parseGoodreadsCsv(text: string): GoodreadsParseResult {
  const table = parseCsv(text);
  // `table[0]` (`noUncheckedIndexedAccess`) — TS не звужує тип індексованого доступу лише
  // за перевіркою `.length` вище, тож перевіряємо сам `header` на `undefined` явно (той
  // самий випадок за формою, коли файл порожній чи має лише один рядок).
  const header = table[0];
  if (!header) return { rows: [], totalDataRows: 0, skippedCount: 0 };

  const dataRows = table.slice(1);
  const columnIndex = new Map(header.map((name, index) => [name.trim(), index]));

  const get = (row: string[], columnName: string): string => {
    const index = columnIndex.get(columnName);
    if (index == null) return '';
    return row[index]?.trim() ?? '';
  };

  const rows: GoodreadsImportRow[] = [];
  let skippedCount = 0;

  for (const row of dataRows) {
    const title = get(row, 'Title');
    if (title.length === 0) {
      skippedCount++;
      continue;
    }

    const authors = [get(row, 'Author'), ...splitNames(get(row, 'Additional Authors'))].filter(
      (name) => name.length > 0,
    );

    const isbn13 = stripExcelGuard(get(row, 'ISBN13')).replace(/[^0-9Xx]/g, '');
    const isbn10 = stripExcelGuard(get(row, 'ISBN')).replace(/[^0-9Xx]/g, '');

    const exclusiveShelf = get(row, 'Exclusive Shelf').toLowerCase();
    const status = EXCLUSIVE_SHELF_STATUS[exclusiveShelf] ?? 'want_to_read';

    const shelfNames = splitNames(get(row, 'Bookshelves')).filter(
      (name) => !(name.toLowerCase() in EXCLUSIVE_SHELF_STATUS),
    );

    const myRating = parseOptionalInt(get(row, 'My Rating'));
    const ratingValue = myRating != null && myRating >= 1 && myRating <= 5 ? myRating : null;

    const addedAt = parseGoodreadsDate(get(row, 'Date Added'));
    const finishedAt = parseGoodreadsDate(get(row, 'Date Read'));

    const draft: NormalizedBookDraft = {
      title,
      authors,
      isbn10: isbn10.length > 0 ? isbn10 : undefined,
      isbn13: isbn13.length > 0 ? isbn13 : undefined,
      publisher: get(row, 'Publisher') || undefined,
      publicationYear: parseOptionalInt(get(row, 'Year Published')),
      firstPublishedYear: parseOptionalInt(get(row, 'Original Publication Year')),
      pageCount: parseOptionalInt(get(row, 'Number of Pages')),
      language: 'uk',
      format: mapBinding(get(row, 'Binding')),
      translators: [],
      source: { sourceType: 'manual', sourceName: 'Goodreads (CSV-імпорт)' },
    };

    rows.push({
      draft,
      status,
      ratingValue,
      // "Почато читати" з Goodreads не експортується взагалі (сайт його й сам не завжди
      // знає) — лишаємо `null`, `createWorkAndEditionFromDraft`/`addToLibrary` виставить його
      // автоматично лише для статусу 'reading' (як "зараз", єдине розумне наближення).
      startedAt: null,
      finishedAt,
      addedAt,
      shelfNames,
    });
  }

  return { rows, totalDataRows: dataRows.length, skippedCount };
}
