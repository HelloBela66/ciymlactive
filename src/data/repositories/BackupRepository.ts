import type { SQLiteDatabase } from 'expo-sqlite';
import type { BackupData, BackupTableRow } from '@/lib/backupSerializer';

/**
 * Порядок таблиць — від таблиць без залежностей до тих, що на них посилаються (той самий
 * принцип, що й порядок `CREATE TABLE` у `001_base_schema.ts`; таблиці, додані пізнішими
 * міграціями — напр. `book_memory` у `004_book_memory.ts` — вставлені в список поруч зі
 * своєю батьківською таблицею `user_book`/`rating`, а не в кінець). Той самий порядок: insert
 * іде вперед (батьки перед дітьми), delete — у зворотному (діти перед батьками), тож жоден FK
 * ніколи не порушується й вимикати `PRAGMA foreign_keys` не потрібно.
 */
const BACKUP_TABLE_ORDER = [
  'author',
  'publisher',
  'translator',
  'genre',
  'book_recommendation_shown',
  'tag',
  'book_source',
  'work',
  'work_author',
  'work_genre',
  'edition',
  'edition_translator',
  'field_provenance',
  'tagged_item',
  'series',
  'series_entry',
  'user_book',
  'shelf',
  'shelf_book',
  'reading_session',
  'reading_progress',
  'note_category',
  'note',
  'quote',
  'rating',
  'book_memory',
  'owned_book',
  'loan',
  'reading_goal',
  'reminder',
  'app_settings',
] as const;

/** SQLite bind-параметри приймають лише string/number/null/Uint8Array — а дані з JSON.parse
 * типізовані як `unknown`. Ця схема не має BLOB-колонок і реальних boolean (усе INTEGER
 * 0/1), тож для неї достатньо трьох випадків; останній — про всяк випадок, а не очікуваний
 * шлях. */
function toBindValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return JSON.stringify(value);
}

/** Колонки з JSON-файлу йдуть прямо в SQL-текст (назви колонок не можна параметризувати
 * плейсхолдерами) — файл це власний бекап користувача, не мережевий вхід, але це дешева
 * перевірка на випадок пошкодженого/сторонньго файлу, тож вона тут не зайва. */
const SAFE_COLUMN_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Дамп/відновлення всієї БД для backup/restore (`docs/BACKUP_FORMAT.md`, Milestone 6).
 * Навмисно generic (SELECT-усе / INSERT з динамічним списком колонок), а не по типізованому
 * repository на таблицю — 28 таблиць, і формат бекапу однаково "сирий" (рядки як є в SQLite,
 * не доменні типи), тож типізація тут не додала б безпеки, лише 28 файлів boilerplate.
 */
export const BackupRepository = {
  async exportAll(db: SQLiteDatabase): Promise<BackupData> {
    const data: BackupData = {};
    for (const table of BACKUP_TABLE_ORDER) {
      data[table] = await db.getAllAsync<BackupTableRow>(`SELECT * FROM ${table}`);
    }
    return data;
  },

  /**
   * Replace-all restore (`docs/BACKUP_FORMAT.md` §Restore, крок 5 — merge не в V1), в одній
   * транзакції: якщо щось падає посеред вставки — повний rollback, БД лишається такою, якою
   * була до restore.
   */
  async restoreAll(db: SQLiteDatabase, data: BackupData): Promise<void> {
    await db.withTransactionAsync(async () => {
      for (const table of [...BACKUP_TABLE_ORDER].reverse()) {
        await db.runAsync(`DELETE FROM ${table}`);
      }

      for (const table of BACKUP_TABLE_ORDER) {
        const rows = data[table] ?? [];
        for (const row of rows) {
          const columns = Object.keys(row).filter((column) => SAFE_COLUMN_NAME.test(column));
          if (columns.length === 0) continue;
          const placeholders = columns.map(() => '?').join(', ');
          const values = columns.map((column) => toBindValue(row[column]));
          await db.runAsync(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, values);
        }
      }
    });
  },

  /** Швидкі лічильники для екрана підтвердження restore (без завантаження всіх рядків) —
   * `docs/BACKUP_FORMAT.md` вимагає показати "кількість книг/сесій" перед перезаписом. */
  summarize(data: BackupData): { works: number; userBooks: number; sessions: number; notes: number } {
    return {
      works: data.work?.length ?? 0,
      userBooks: data.user_book?.length ?? 0,
      sessions: data.reading_session?.length ?? 0,
      notes: data.note?.length ?? 0,
    };
  },
};
