import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { DataIntegrityRepository } from './DataIntegrityRepository';

/**
 * Repository-інтеграційний тест «Перевірки даних» (Фаза 5) — проти реальної SQLite
 * (`better-sqlite3` через `openTestDatabase()`, Фаза 3), не мок. Доменна логіка кожної
 * перевірки вже вичерпно покрита `src/domain/dataIntegrityDoctor.test.ts` на чистих
 * фікстурах — тут перевіряється лише те, що той тест не може: що читання з РЕАЛЬНОЇ БД
 * (назви колонок, мапінг snake_case → camelCase) справді доносить дані до доменної функції
 * без розсинхрону.
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

const NOW = '2026-09-10T12:00:00.000Z';

/** Один узгоджений твір/видання/книга — база, на яку спираються решта тестів (і валідних, і
 * навмисно зіпсованих рядків нижче). */
async function seedBaseBook(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    'work-1',
    'Тестова книга',
    NOW,
    NOW,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at, page_count) VALUES (?,?,?,?,?,?,?,?)`,
    ['edition-1', 'work-1', 'Тестова книга', 'uk', 'paperback', NOW, NOW, 300],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,?,?,?,?)`,
    ['user_book-1', 'edition-1', 'reading', 50, NOW, NOW],
  );
}

describe('DataIntegrityRepository.runCheck', () => {
  it('щойно-мігрована порожня БД — «Проблем не знайдено»', async () => {
    const db = await openMigratedTestDb();
    const report = await DataIntegrityRepository.runCheck(db);
    expect(report.hasIssues).toBe(false);
    expect(report.issues).toEqual([]);
  });

  it('узгоджені реалістичні дані — «Проблем не знайдено»', async () => {
    const db = await openMigratedTestDb();
    await seedBaseBook(db);
    await db.runAsync(
      `INSERT INTO reading_session (id, user_book_id, started_at, ended_at, start_page, end_page, duration_seconds, paused_intervals, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ['session-1', 'user_book-1', NOW, NOW, 0, 50, 1800, '[]', NOW, NOW],
    );
    await db.runAsync(
      `INSERT INTO reading_progress (id, user_book_id, session_id, page, recorded_at, created_at) VALUES (?,?,?,?,?,?)`,
      ['progress-1', 'user_book-1', 'session-1', 50, NOW, NOW],
    );
    await db.runAsync(`INSERT INTO note (id, user_book_id, session_id, text, created_at, updated_at) VALUES (?,?,?,?,?,?)`, [
      'note-1',
      'user_book-1',
      'session-1',
      'Нотатка.',
      NOW,
      NOW,
    ]);
    // POLYTSIA V1.6, Фаза 4 — капсула, коректно прив'язана до реальної нотатки цієї ж книги.
    await db.runAsync(
      `INSERT INTO book_capsule (id, user_book_id, journal_entry_kind, journal_entry_id, reopen_option, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      ['capsule-1', 'user_book-1', 'note', 'note-1', 'none', NOW, NOW],
    );

    const report = await DataIntegrityRepository.runCheck(db);
    expect(report.hasIssues).toBe(false);
  });

  it('зіпсовані дані: кожна з 6 категорій ловить бодай одну реальну проблему', async () => {
    const db = await openMigratedTestDb();
    await seedBaseBook(db);

    // --- Книги: неможливий стан завершення ---
    await db.runAsync(
      `UPDATE user_book SET status = 'finished', finished_at = NULL WHERE id = 'user_book-1'`,
    );

    // --- Сесії: сесія без валідної книги (навмисно порушує FK — симулює пошкоджену БД;
    // у застосунку з увімкненим PRAGMA foreign_keys таке недосяжне через звичайний UI, саме
    // тому "лікар" перевіряє це окремо, а не покладається лише на FK). ---
    await db.execAsync('PRAGMA foreign_keys = OFF;');
    await db.runAsync(
      `INSERT INTO reading_session (id, user_book_id, started_at, start_page, duration_seconds, paused_intervals, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      ['session-orphan', 'does-not-exist', NOW, 0, -100, '[]', NOW, NOW],
    );
    await db.execAsync('PRAGMA foreign_keys = ON;');

    // --- Прогрес: сторінка перевищує обсяг видання (edition-1.page_count = 300) ---
    await db.runAsync(
      `INSERT INTO reading_progress (id, user_book_id, page, recorded_at, created_at) VALUES (?,?,?,?,?)`,
      ['progress-bad', 'user_book-1', 9999, NOW, NOW],
    );

    // --- Щоденник: нотатка посилається на неіснуючу категорію (не FK-enforced, свідомий
    // вибір міграції 008 — не потребує PRAGMA foreign_keys = OFF) ---
    await db.runAsync(`INSERT INTO note (id, user_book_id, text, category_id, created_at, updated_at) VALUES (?,?,?,?,?,?)`, [
      'note-orphan',
      'user_book-1',
      'Нотатка з биткою категорією.',
      'does-not-exist',
      NOW,
      NOW,
    ]);

    // --- Полиці: shelf_book без валідної книги (знову навмисне порушення FK) ---
    await db.runAsync(`INSERT INTO shelf (id, name, created_at, updated_at) VALUES (?,?,?,?)`, [
      'shelf-1',
      'Полиця',
      NOW,
      NOW,
    ]);
    await db.execAsync('PRAGMA foreign_keys = OFF;');
    await db.runAsync(`INSERT INTO shelf_book (shelf_id, user_book_id, added_at) VALUES (?,?,?)`, [
      'shelf-1',
      'does-not-exist',
      NOW,
    ]);
    await db.execAsync('PRAGMA foreign_keys = ON;');

    // --- Серії: запис серії без валідної серії (навмисне порушення FK) ---
    await db.execAsync('PRAGMA foreign_keys = OFF;');
    await db.runAsync(
      `INSERT INTO series_entry (id, series_id, work_id, entry_type) VALUES (?,?,?,?)`,
      ['series-entry-orphan', 'does-not-exist', 'work-1', 'main'],
    );
    await db.execAsync('PRAGMA foreign_keys = ON;');

    // --- Капсула книги (Фаза 4): посилається на неіснуючий запис щоденника (не FK-enforced,
    // м'яке посилання — `012_book_capsule.ts` — не потребує PRAGMA foreign_keys = OFF). ---
    await db.runAsync(
      `INSERT INTO book_capsule (id, user_book_id, journal_entry_kind, journal_entry_id, reopen_option, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      ['capsule-orphan', 'user_book-1', 'note', 'does-not-exist', 'none', NOW, NOW],
    );

    const report = await DataIntegrityRepository.runCheck(db);

    expect(report.hasIssues).toBe(true);
    expect(report.byCategory.books.map((i) => i.code)).toContain('finished_without_finished_at');
    expect(report.byCategory.sessions.map((i) => i.code)).toEqual(
      expect.arrayContaining(['session_without_valid_book', 'negative_duration']),
    );
    expect(report.byCategory.progress.map((i) => i.code)).toContain('progress_exceeds_page_count');
    expect(report.byCategory.journal.map((i) => i.code)).toEqual(
      expect.arrayContaining(['note_orphan_category', 'capsule_orphan_journal_entry']),
    );
    expect(report.byCategory.shelves.map((i) => i.code)).toContain('shelf_book_missing_user_book');
    expect(report.byCategory.series.map((i) => i.code)).toContain('series_entry_missing_series');

    // Кожна з 6 категорій ТЗ справді представлена — не лише "загалом щось знайдено".
    for (const category of ['books', 'sessions', 'progress', 'journal', 'shelves', 'series'] as const) {
      expect(report.byCategory[category].length).toBeGreaterThan(0);
    }
  });
});
