import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { JournalRepository } from './JournalRepository';

/**
 * Repository-інтеграційні тести для нових фільтрів `JournalRepository.listPage`/`listFeedPage`
 * (POLYTSIA V1.5, Фаза 7 — JOURNAL SEARCH: query/reaction/workId/dateFrom/dateTo). Проти
 * реальної SQLite (`better-sqlite3` через `openTestDatabase()`, та сама інфраструктура, що й
 * `PersonalSearch.test.ts`, Фаза 6) — не мок, щоб перевірити саме SQL, а не мапінг рядків.
 *
 * `searchFeed` (Фаза 6, окремий "швидкий" метод для Personal Search) уже покритий
 * `PersonalSearch.test.ts` — тут лише нові фільтри `listPage`/`listFeedPage`, додані Фазою 7.
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

// Чотири різні моменти часу — щоб однозначно перевірити і сортування (найновіше зверху), і
// межі dateFrom/dateTo.
const D1 = '2026-01-01T10:00:00.000Z'; // note-1 (work-1)
const D2 = '2026-03-01T10:00:00.000Z'; // quote-1 (work-1)
const D3 = '2026-06-01T10:00:00.000Z'; // note-2 (work-2)
const D4 = '2026-09-01T10:00:00.000Z'; // quote-2 (work-2)

/** Два твори, кожен з одним записом note і одним quote — досить, щоб перевірити фільтр
 * "Книга" (`workId`, звужує до одного твору серед двох) і водночас дати різні моменти часу
 * для перевірки `dateFrom`/`dateTo`. Реакція проставлена лише на двох з чотирьох записів —
 * щоб фільтр "Реакція" мав що і звужувати, і лишати поза результатом. */
async function seedTwoBooksWithEntries(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    'work-1',
    'Відьмак: Останнє бажання',
    D1,
    D1,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at, page_count) VALUES (?,?,?,?,?,?,?,?)`,
    ['edition-1', 'work-1', 'Відьмак: Останнє бажання', 'uk', 'paperback', D1, D1, 250],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,?,?,?,?)`,
    ['user_book-1', 'edition-1', 'reading', 50, D1, D1],
  );

  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    'work-2',
    'Гаррі Поттер і філософський камінь',
    D1,
    D1,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at, page_count) VALUES (?,?,?,?,?,?,?,?)`,
    ['edition-2', 'work-2', 'Гаррі Поттер і філософський камінь', 'uk', 'paperback', D1, D1, 320],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,?,?,?,?)`,
    ['user_book-2', 'edition-2', 'reading', 10, D1, D1],
  );

  // work-1: note без реакції, quote з реакцією 'favorite'.
  await db.runAsync(
    `INSERT INTO note (id, user_book_id, type, text, tags, reaction, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    ['note-1', 'user_book-1', 'thought', 'Розмір моделі даних тут невеликий.', '[]', null, D1, D1],
  );
  await db.runAsync(
    `INSERT INTO quote (id, user_book_id, edition_id, text, comment, reaction, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    ['quote-1', 'user_book-1', 'edition-1', 'Зло є злом, Стрегоборе.', 'нагадує головну тему роману', 'favorite', D2, D2],
  );

  // work-2: note з реакцією 'funny', quote без реакції.
  await db.runAsync(
    `INSERT INTO note (id, user_book_id, type, text, tags, reaction, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    ['note-2', 'user_book-2', 'thought', 'Історія про дружбу і магію.', '[]', 'funny', D3, D3],
  );
  await db.runAsync(
    `INSERT INTO quote (id, user_book_id, edition_id, text, comment, reaction, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    ['quote-2', 'user_book-2', 'edition-2', 'Наша дружба — це сила.', null, null, D4, D4],
  );
}

describe('JournalRepository — фільтри пошуку (Фаза 7)', () => {
  it('listFeedPage: query шукає і в тексті нотатки, і в тексті/коментарі цитати', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksWithEntries(db);

    const byNoteText = await JournalRepository.listFeedPage(db, { query: 'моделі' });
    expect(byNoteText.items.map((i) => i.id)).toEqual(['note-1']);

    // 'нагадує' є лише в comment цитати, не в її тексті — підтверджує OR text/comment.
    const byQuoteComment = await JournalRepository.listFeedPage(db, { query: 'нагадує' });
    expect(byQuoteComment.items.map((i) => i.id)).toEqual(['quote-1']);

    // Обидва записи про "дружбу" — з різних книг, найновіший (quote-2) зверху.
    const byShared = await JournalRepository.listFeedPage(db, { query: 'дружб' });
    expect(byShared.items.map((i) => i.id)).toEqual(['quote-2', 'note-2']);

    const byNothing = await JournalRepository.listFeedPage(db, { query: 'щось, чого тут немає' });
    expect(byNothing.items).toEqual([]);
  });

  it('listFeedPage: reaction звужує до записів з точно такою реакцією', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksWithEntries(db);

    expect((await JournalRepository.listFeedPage(db, { reaction: 'favorite' })).items.map((i) => i.id)).toEqual([
      'quote-1',
    ]);
    expect((await JournalRepository.listFeedPage(db, { reaction: 'funny' })).items.map((i) => i.id)).toEqual([
      'note-2',
    ]);
    expect((await JournalRepository.listFeedPage(db, { reaction: 'sad' })).items).toEqual([]);
  });

  it('listFeedPage: workId звужує глобальну стрічку до записів однієї книги', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksWithEntries(db);

    const work1 = await JournalRepository.listFeedPage(db, { workId: 'work-1' });
    expect(work1.items.map((i) => i.id)).toEqual(['quote-1', 'note-1']);
    expect(work1.items.every((i) => i.workId === 'work-1')).toBe(true);

    const work2 = await JournalRepository.listFeedPage(db, { workId: 'work-2' });
    expect(work2.items.map((i) => i.id)).toEqual(['quote-2', 'note-2']);
  });

  it('listFeedPage: dateFrom/dateTo фільтрують за created_at включно з межами', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksWithEntries(db);

    // [D2 .. D3] включно — лишає рівно quote-1 (D2) і note-2 (D3).
    const middle = await JournalRepository.listFeedPage(db, { dateFrom: D2, dateTo: D3 });
    expect(middle.items.map((i) => i.id)).toEqual(['note-2', 'quote-1']);

    // Точна межа одним записом.
    const exact = await JournalRepository.listFeedPage(db, { dateFrom: D2, dateTo: D2 });
    expect(exact.items.map((i) => i.id)).toEqual(['quote-1']);

    const none = await JournalRepository.listFeedPage(db, { dateFrom: '2027-01-01T00:00:00.000Z' });
    expect(none.items).toEqual([]);
  });

  it('listFeedPage: фільтри комбінуються (workId + query)', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksWithEntries(db);

    // "дружб" є в обох книгах, але з workId лишається лише work-2.
    const combined = await JournalRepository.listFeedPage(db, { workId: 'work-2', query: 'дружб' });
    expect(combined.items.map((i) => i.id)).toEqual(['quote-2', 'note-2']);

    const noMatch = await JournalRepository.listFeedPage(db, { workId: 'work-1', query: 'дружб' });
    expect(noMatch.items).toEqual([]);
  });

  it('listPage: ті самі фільтри (query/reaction/dateFrom/dateTo) доступні й для одно-книжкового читання', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksWithEntries(db);

    const favoriteInBook1 = await JournalRepository.listPage(db, { userBookId: 'user_book-1', reaction: 'favorite' });
    expect(favoriteInBook1.items.map((i) => i.id)).toEqual(['quote-1']);

    const queryInBook1 = await JournalRepository.listPage(db, { userBookId: 'user_book-1', query: 'моделі' });
    expect(queryInBook1.items.map((i) => i.id)).toEqual(['note-1']);

    // workId — поле навмисно ігнорується `listPage` (докладніше — коментар над полем у
    // `JournalListPageOptions`): userBookId вже скопував результат на одну книгу.
    const noEffect = await JournalRepository.listPage(db, { userBookId: 'user_book-1', workId: 'work-2' });
    expect(noEffect.items.map((i) => i.id).sort()).toEqual(['note-1', 'quote-1']);
  });
});

/**
 * ТЗ Фази 11 («ПОВЕРНУТИСЯ ПІЗНІШЕ») — `revisitLaterOnly` фільтр у `listPage`/`listFeedPage`
 * і `listRevisitLaterByUserBookId`. `seedTwoBooksWithEntries` вище нічого не проставляє в
 * `revisit_later` (стовпець `DEFAULT 0`), тож тут позначаємо конкретні рядки напряму SQL —
 * той самий підхід, що вже використовує `reaction` у сидінгу вище, лише мутація йде окремим
 * `UPDATE` після сидінгу, а не в самому INSERT (перевіряє саме шлях "користувач позначив
 * пізніше", а не "запис одразу створено позначеним").
 */
describe('JournalRepository — «Повернутися пізніше» (Фаза 11)', () => {
  it('listFeedPage: revisitLaterOnly звужує глобальну стрічку до позначених записів', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksWithEntries(db);
    await db.runAsync(`UPDATE note SET revisit_later = 1 WHERE id = ?`, ['note-1']);
    await db.runAsync(`UPDATE quote SET revisit_later = 1 WHERE id = ?`, ['quote-2']);

    const revisitLater = await JournalRepository.listFeedPage(db, { revisitLaterOnly: true });
    expect(revisitLater.items.map((i) => i.id).sort()).toEqual(['note-1', 'quote-2']);
    expect(revisitLater.items.every((i) => i.revisitLater)).toBe(true);

    // Комбінується з іншими фільтрами (workId) — той самий принцип, що й `favoriteOnly`.
    const combined = await JournalRepository.listFeedPage(db, { revisitLaterOnly: true, workId: 'work-1' });
    expect(combined.items.map((i) => i.id)).toEqual(['note-1']);
  });

  it('listPage: revisitLaterOnly звужує список записів однієї книги', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksWithEntries(db);
    await db.runAsync(`UPDATE quote SET revisit_later = 1 WHERE id = ?`, ['quote-1']);

    const revisitLater = await JournalRepository.listPage(db, { userBookId: 'user_book-1', revisitLaterOnly: true });
    expect(revisitLater.items.map((i) => i.id)).toEqual(['quote-1']);

    const none = await JournalRepository.listPage(db, { userBookId: 'user_book-2', revisitLaterOnly: true });
    expect(none.items).toEqual([]);
  });

  it('listRevisitLaterByUserBookId: повертає лише позначені записи конкретної книги', async () => {
    const db = await openMigratedTestDb();
    await seedTwoBooksWithEntries(db);
    await db.runAsync(`UPDATE note SET revisit_later = 1 WHERE id = ?`, ['note-1']);
    await db.runAsync(`UPDATE quote SET revisit_later = 1 WHERE id = ?`, ['quote-1']);
    // work-2 лишається зовсім без позначених — підтверджує, що список саме per-book, а не
    // глобальний.
    const book1 = await JournalRepository.listRevisitLaterByUserBookId(db, 'user_book-1');
    expect(book1.map((i) => i.id).sort()).toEqual(['note-1', 'quote-1']);

    const book2 = await JournalRepository.listRevisitLaterByUserBookId(db, 'user_book-2');
    expect(book2).toEqual([]);
  });
});
