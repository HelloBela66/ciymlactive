import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { WorkRepository } from './WorkRepository';
import { SeriesRepository } from './SeriesRepository';
import { ShelfRepository } from './ShelfRepository';
import { JournalRepository } from './JournalRepository';

/**
 * Repository-інтеграційні тести для нових методів «Глобального особистого пошуку» (POLYTSIA
 * V1.5, Фаза 6): `SeriesRepository.search`, `ShelfRepository.search`,
 * `JournalRepository.searchFeed`. Проти реальної SQLite (`better-sqlite3` через
 * `openTestDatabase()`, інфраструктура Фази 3), не мок — так само, як
 * `DataIntegrityRepository.test.ts` (Фаза 5). `WorkRepository.search` (домен "Книги") уже
 * використовується в пошуку з Milestone 1 — тут лише один тест поруч з новими доменами, для
 * симетрії покриття всіх п'яти доменів Personal Search разом.
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

const NOW = '2026-09-10T12:00:00.000Z';

/** Один твір/видання/книга + по одному запису в кожному з доменів пошуку — досить, щоб
 * перевірити, що кожен метод справді фільтрує за текстом і несе очікувані супутні дані
 * (bookCount полиці, назва/обкладинка книги для нотатки й цитати). */
async function seedSearchableData(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    'work-1',
    'Відьмак: Останнє бажання',
    NOW,
    NOW,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at, page_count) VALUES (?,?,?,?,?,?,?,?)`,
    ['edition-1', 'work-1', 'Відьмак: Останнє бажання', 'uk', 'paperback', NOW, NOW, 250],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,?,?,?,?)`,
    ['user_book-1', 'edition-1', 'reading', 50, NOW, NOW],
  );

  await db.runAsync(
    `INSERT INTO series (id, name, description, status, total_known_works, cover_url, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    ['series-1', 'Сага про Відьмака', null, 'completed', 8, null, NOW, NOW],
  );

  await db.runAsync(
    `INSERT INTO shelf (id, name, description, is_system, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    ['shelf-1', 'Темне фентезі', null, 0, 0, NOW, NOW],
  );
  await db.runAsync(`INSERT INTO shelf_book (shelf_id, user_book_id, added_at) VALUES (?,?,?)`, [
    'shelf-1',
    'user_book-1',
    NOW,
  ]);

  await db.runAsync(
    `INSERT INTO note (id, user_book_id, type, text, tags, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    ['note-1', 'user_book-1', 'thought', 'Геральт — цікавий приклад морального релятивізму.', '[]', NOW, NOW],
  );
  await db.runAsync(
    `INSERT INTO quote (id, user_book_id, edition_id, text, comment, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    ['quote-1', 'user_book-1', 'edition-1', 'Зло є злом, Стрегоборе.', null, NOW, NOW],
  );
}

describe('Global Personal Search (Фаза 6)', () => {
  it('SeriesRepository.search — знаходить серію за частиною назви, порожній запит — порожній результат', async () => {
    const db = await openMigratedTestDb();
    await seedSearchableData(db);

    const found = await SeriesRepository.search(db, 'Відьмака');
    expect(found.map((s) => s.id)).toEqual(['series-1']);

    expect(await SeriesRepository.search(db, 'Гаррі Поттер')).toEqual([]);
    expect(await SeriesRepository.search(db, '')).toEqual([]);
  });

  it('ShelfRepository.search — знаходить полицю за частиною назви й повертає bookCount', async () => {
    const db = await openMigratedTestDb();
    await seedSearchableData(db);

    const found = await ShelfRepository.search(db, 'Темне');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: 'shelf-1', bookCount: 1 });

    expect(await ShelfRepository.search(db, 'Немає такої полиці')).toEqual([]);
  });

  it('JournalRepository.searchFeed — окремо знаходить нотатки й цитати за текстом, з даними книги', async () => {
    const db = await openMigratedTestDb();
    await seedSearchableData(db);

    const byNoteText = await JournalRepository.searchFeed(db, 'релятивізму');
    expect(byNoteText.notes.map((n) => n.id)).toEqual(['note-1']);
    expect(byNoteText.quotes).toEqual([]);
    expect(byNoteText.notes[0]).toMatchObject({ workId: 'work-1', workTitle: 'Відьмак: Останнє бажання' });

    const byQuoteText = await JournalRepository.searchFeed(db, 'Стрегоборе');
    expect(byQuoteText.quotes.map((q) => q.id)).toEqual(['quote-1']);
    expect(byQuoteText.notes).toEqual([]);

    expect(await JournalRepository.searchFeed(db, 'щось, чого тут немає')).toEqual({ notes: [], quotes: [] });
  });

  it('WorkRepository.search — домен "Книги" поруч з новими доменами (поведінка не змінена)', async () => {
    const db = await openMigratedTestDb();
    await seedSearchableData(db);

    const found = await WorkRepository.search(db, 'Відьмак');
    expect(found.map((w) => w.id)).toEqual(['work-1']);
  });
});
