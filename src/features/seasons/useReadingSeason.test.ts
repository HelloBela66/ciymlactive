import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { ReadingRunRepository } from '@/data/repositories/ReadingRunRepository';
import { UserBookRepository } from '@/data/repositories/UserBookRepository';
import { RatingRepository } from '@/data/repositories/RatingRepository';
import { BookMemoryRepository } from '@/data/repositories/BookMemoryRepository';
import { SeriesRepository } from '@/data/repositories/SeriesRepository';
import { NoteRepository } from '@/data/repositories/NoteRepository';
import { QuoteRepository } from '@/data/repositories/QuoteRepository';
import { seasonDateRange } from '@/lib/season';
import { fetchReadingSeasonData } from './useReadingSeason';
import type { ReadingRun } from '@/types/readingRun';
import type { NoteType } from '@/types/note';

/**
 * Інтеграційний тест для `fetchReadingSeasonData` (POLYTSIA V1.6.2, #167 — READING SEASONS,
 * PRODUCT REDEFINITION, `docs/READING_SEASONS.md`) — ПЕРШИЙ `features/*.test.ts` у цій кодовій
 * базі (усе попереднє покриття — на рівні repository/lib-функцій). Той самий
 * `openTestDatabase()` + `migrateDbIfNeeded()` house-патерн, що й repository-тести
 * (`ReadingRunRepository.test.ts`): функція викликається НАПРЯМУ проти реальної (better-sqlite3)
 * тестової БД, без React/React Query test harness — саме заради цього обчислення винесене в
 * окрему exported-функцію (докладніше — доккоментар над `fetchReadingSeasonData` у
 * `useReadingSeason.ts`).
 *
 * Головний фокус — ТЗ §39: "прочитані книги" сезону джерелом мають `ReadingRun.finishedAt`, НЕ
 * поточний `UserBook.status`/`finishedAt`. Кілька тестів нижче прямо доводять саме це (а не лише
 * повторюють щасливий шлях), той самий підхід, що аудит вимагає для будь-якого P0-фіксу.
 *
 * Сезон-за-замовчуванням для більшості тестів — Літо 2026 (`2026-06-01` — `2026-09-01`,
 * виключно): жодних особливих меж року, зручний "нейтральний" сезон. Межу року (зима) перевіряє
 * окремий describe нижче.
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

/** Той самий мінімальний seed work/edition/user_book, що й `ReadingRunRepository.test.ts` —
 * `status: 'reading'` за замовчуванням (СВІДОМО не `'finished'`: більшість тестів нижче доводять
 * саме те, що сезон бачить книгу через `ReadingRun`, а не через цей статус). */
async function seedUserBook(db: SQLiteDatabase, id: string, title?: string): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    `${id}-work`,
    title ?? `Книга ${id}`,
    now,
    now,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [`${id}-edition`, `${id}-work`, title ?? `Книга ${id}`, 'uk', 'paperback', now, now],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, added_at, updated_at) VALUES (?,?,?,?,?,?)`,
    [id, `${id}-edition`, 'reading', 0, now, now],
  );
}

/** Старт + фініш одного `ReadingRun` для книги — головний спосіб зробити книгу "прочитаною
 * сезону" в тестах нижче. Кожен виклик для того самого `userBookId` створює НАСТУПНИЙ run
 * (run_number 1, 2, 3...) — так і будуються тести перечитування. */
async function finishRun(
  db: SQLiteDatabase,
  userBookId: string,
  params: { finishedAt: string; startedAt?: string; status?: 'finished' | 'did_not_finish' },
): Promise<ReadingRun> {
  const run = await ReadingRunRepository.start(db, {
    userBookId,
    startedAt: params.startedAt ?? params.finishedAt,
  });
  const finished = await ReadingRunRepository.finish(db, run.id, {
    status: params.status ?? 'finished',
    finishedAt: params.finishedAt,
  });
  if (!finished) throw new Error('ReadingRunRepository.finish повернув null у тестовому сетапі');
  return finished;
}

/** `reading_session` — жоден repository-метод не приймає довільний `startedAt`/`durationSeconds`
 * (`ReadingSessionRepository.start` завжди пише `now()`), тож, як і `seedUserBook` вище для
 * work/edition/user_book, тут пряма SQL-вставка — єдиний спосіб контролювати дату сесії в тесті. */
let sessionCounter = 0;
async function seedSession(
  db: SQLiteDatabase,
  params: {
    userBookId: string;
    startedAt: string;
    durationSeconds?: number;
    startPage?: number;
    endPage?: number;
    readingExperience?: string | null;
  },
): Promise<void> {
  sessionCounter += 1;
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO reading_session (
       id, user_book_id, started_at, ended_at, goal_minutes, paused_intervals,
       start_page, end_page, duration_seconds, mood_note, reading_experience, is_edited,
       created_at, updated_at, reading_run_id
     ) VALUES (?, ?, ?, ?, NULL, '[]', ?, ?, ?, NULL, ?, 0, ?, ?, NULL)`,
    [
      `test-session-${sessionCounter}`,
      params.userBookId,
      params.startedAt,
      params.startedAt,
      params.startPage ?? 0,
      params.endPage ?? (params.startPage ?? 0) + 20,
      params.durationSeconds ?? 1800,
      params.readingExperience ?? null,
      now,
      now,
    ],
  );
}

/** Запис щоденника ("нотатка") зі СВОЄЮ датою `created_at` — `NoteRepository.create` завжди пише
 * `now()`, тож дату переставляємо прямим `UPDATE` одразу після створення (той самий "спершу
 * repository-виклик, потім точковий SQL для того, чого repository API не підтримує" підхід, що
 * й `seedSession` вище). */
async function createNoteAt(
  db: SQLiteDatabase,
  params: {
    userBookId: string;
    type: NoteType;
    text: string;
    createdAt: string;
    isFavorite?: boolean;
    revisitLater?: boolean;
  },
): Promise<string> {
  const note = await NoteRepository.create(db, { userBookId: params.userBookId, type: params.type, text: params.text });
  if (params.isFavorite) await NoteRepository.setFavorite(db, note.id, true);
  if (params.revisitLater) await NoteRepository.setRevisitLater(db, note.id, true);
  await db.runAsync(`UPDATE note SET created_at = ? WHERE id = ?`, [params.createdAt, note.id]);
  return note.id;
}

/** Той самий підхід, що й `createNoteAt`, для цитат. */
async function createQuoteAt(
  db: SQLiteDatabase,
  params: {
    userBookId: string;
    editionId: string;
    text: string;
    createdAt: string;
    isFavorite?: boolean;
    revisitLater?: boolean;
  },
): Promise<string> {
  const quote = await QuoteRepository.create(db, {
    userBookId: params.userBookId,
    editionId: params.editionId,
    text: params.text,
  });
  if (params.isFavorite) await QuoteRepository.setFavorite(db, quote.id, true);
  if (params.revisitLater) await QuoteRepository.setRevisitLater(db, quote.id, true);
  await db.runAsync(`UPDATE quote SET created_at = ? WHERE id = ?`, [params.createdAt, quote.id]);
  return quote.id;
}

const SEASON_ID = 'summer' as const;
const SEASON_YEAR = 2026;
const RANGE = seasonDateRange(SEASON_ID, SEASON_YEAR); // 2026-06-01T00:00:00.000Z .. 2026-09-01T00:00:00.000Z
const IN_RANGE_EARLY = '2026-06-15T10:00:00.000Z';
const IN_RANGE_MID = '2026-07-20T10:00:00.000Z';
const IN_RANGE_LATE = '2026-08-10T10:00:00.000Z';
const BEFORE_RANGE = '2026-05-20T10:00:00.000Z'; // весна — до старту літа
const AFTER_RANGE = '2026-09-15T10:00:00.000Z'; // осінь — після кінця літа

describe('fetchReadingSeasonData — порожній сезон', () => {
  it('без жодного run/сесії в діапазоні — усі поля в нейтральному "порожньому" стані', async () => {
    const db = await openMigratedTestDb();

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    // Сама межа сезону, яку `fetchReadingSeasonData` фактично використовує нижче — санітарний
    // якір для решти тестів файлу (усі вони орієнтуються на ці самі IN_RANGE_*/BEFORE_RANGE/
    // AFTER_RANGE константи).
    expect(RANGE).toEqual({ start: '2026-06-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' });

    expect(result.seasonId).toBe(SEASON_ID);
    expect(result.year).toBe(SEASON_YEAR);
    expect(result.finishedRuns).toEqual([]);
    expect(result.books).toEqual([]);
    expect(result.completedRuns).toBe(0);
    expect(result.uniqueBooksCount).toBe(0);
    expect(result.rereadBooks).toEqual([]);
    expect(result.totalPages).toBe(0);
    expect(result.totalMinutes).toBe(0);
    expect(result.activeDays).toBe(0);
    expect(result.favoriteBook).toBeNull();
    expect(result.savedThoughts).toEqual([]);
    expect(result.favoriteQuote).toBeNull();
    expect(result.bookMemoryPreview).toBeNull();
    expect(result.dominantReadingExperience).toBeNull();
    expect(result.seasonSeries).toBeNull();
    expect(result.dnfCount).toBe(0);
  });
});

/**
 * ТЗ §39 — ЦЕНТРАЛЬНИЙ фікс цієї фази: джерело "прочитаних книг" сезону — `ReadingRun.finishedAt`,
 * НЕ поточний `UserBook.status`. Тести нижче навмисно лишають `user_book.status` таким, що НЕ
 * дорівнює `'finished'` (книга зараз "перечитується"), і все одно очікують, що книга потрапляє в
 * сезон — якби реалізація читала `UserBookRepository.listByStatus(db, 'finished')` (стара
 * поведінка до цієї фази), ці тести провалились би.
 */
describe('fetchReadingSeasonData — джерело "прочитано" (ТЗ §39): ReadingRun, а не UserBook.status', () => {
  it('run завершився в діапазоні — книга в сезоні, НАВІТЬ якщо user_book.status зараз не "finished"', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-src1');
    const run = await finishRun(db, 'ub-src1', { finishedAt: IN_RANGE_MID });
    // Книгу вже перечитують (типовий сценарій §39: завершена цього сезону, потім розпочате
    // нове перечитування) — статус СВІДОМО не 'finished'.
    await db.runAsync(`UPDATE user_book SET status = 'rereading' WHERE id = ?`, ['ub-src1']);

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.uniqueBooksCount).toBe(1);
    expect(result.completedRuns).toBe(1);
    expect(result.books[0]?.id).toBe('ub-src1');
    expect(result.books[0]?.status).toBe('rereading'); // деталі книги несуть ПОТОЧНИЙ статус — сезон лише обирає її за run
    expect(result.finishedRuns[0]?.run.id).toBe(run.id);
    expect(result.finishedRuns[0]?.isReread).toBe(false); // це все ще run_number 1
  });

  it('run завершився ПОЗА діапазоном — книга не в сезоні', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-src2');
    await finishRun(db, 'ub-src2', { finishedAt: BEFORE_RANGE });
    await seedUserBook(db, 'ub-src3');
    await finishRun(db, 'ub-src3', { finishedAt: AFTER_RANGE });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.uniqueBooksCount).toBe(0);
    expect(result.books).toEqual([]);
  });
});

describe('fetchReadingSeasonData — перечитування в межах ОДНОГО сезону (ТЗ §40/51)', () => {
  it('та сама книга завершена двічі в сезоні — completedRuns: 2, uniqueBooksCount: 1, книга в rereadBooks', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-reread1');
    await finishRun(db, 'ub-reread1', { finishedAt: IN_RANGE_EARLY });
    const secondRun = await finishRun(db, 'ub-reread1', { finishedAt: IN_RANGE_LATE });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.completedRuns).toBe(2); // два ПРОХОДИ
    expect(result.uniqueBooksCount).toBe(1); // одна книга
    expect(result.books.map((b) => b.id)).toEqual(['ub-reread1']);
    expect(result.rereadBooks.map((b) => b.id)).toEqual(['ub-reread1']);
    expect(secondRun.runNumber).toBe(2);
    expect(result.finishedRuns.find((e) => e.run.id === secondRun.id)?.isReread).toBe(true);
  });
});

describe('fetchReadingSeasonData — DNF не рахується "прочитаним" (ТЗ §53)', () => {
  it('run зі статусом did_not_finish у діапазоні — dnfCount: 1, книга НЕ в books/finishedRuns', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-dnf1');
    await finishRun(db, 'ub-dnf1', { finishedAt: IN_RANGE_MID, status: 'did_not_finish' });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.dnfCount).toBe(1);
    expect(result.completedRuns).toBe(0);
    expect(result.uniqueBooksCount).toBe(0);
    expect(result.books).toEqual([]);
    expect(result.finishedRuns).toEqual([]);
  });

  it('finished + did_not_finish разом у діапазоні — рахуються окремо, одне одному не заважає', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-dnf2');
    await finishRun(db, 'ub-dnf2', { finishedAt: IN_RANGE_EARLY });
    await seedUserBook(db, 'ub-dnf3');
    await finishRun(db, 'ub-dnf3', { finishedAt: IN_RANGE_MID, status: 'did_not_finish' });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.dnfCount).toBe(1);
    expect(result.completedRuns).toBe(1);
    expect(result.uniqueBooksCount).toBe(1);
    expect(result.books[0]?.id).toBe('ub-dnf2');
  });
});

describe('fetchReadingSeasonData — агрегати сесій: totalPages/totalMinutes/activeDays (ТЗ §41-44)', () => {
  it('сума хвилин і сторінок рахується по всіх сесіях діапазону', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-agg1');
    await seedSession(db, { userBookId: 'ub-agg1', startedAt: IN_RANGE_EARLY, durationSeconds: 1800, startPage: 0, endPage: 30 });
    await seedSession(db, { userBookId: 'ub-agg1', startedAt: IN_RANGE_MID, durationSeconds: 900, startPage: 30, endPage: 45 });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.totalMinutes).toBe(30 + 15);
    expect(result.totalPages).toBe(30 + 15);
  });

  it('кілька сесій того самого UTC-календарного дня рахуються як один активний день', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-agg2');
    await seedSession(db, { userBookId: 'ub-agg2', startedAt: '2026-07-01T08:00:00.000Z' });
    await seedSession(db, { userBookId: 'ub-agg2', startedAt: '2026-07-01T21:00:00.000Z' });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.activeDays).toBe(1);
  });

  it('сесії різних днів рахуються окремо', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-agg3');
    await seedSession(db, { userBookId: 'ub-agg3', startedAt: '2026-07-01T08:00:00.000Z' });
    await seedSession(db, { userBookId: 'ub-agg3', startedAt: '2026-07-02T08:00:00.000Z' });
    await seedSession(db, { userBookId: 'ub-agg3', startedAt: '2026-07-10T08:00:00.000Z' });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.activeDays).toBe(3);
  });

  it('сесії поза діапазоном сезону не враховуються', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-agg4');
    await seedSession(db, { userBookId: 'ub-agg4', startedAt: BEFORE_RANGE, durationSeconds: 3600 });
    await seedSession(db, { userBookId: 'ub-agg4', startedAt: AFTER_RANGE, durationSeconds: 3600 });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.totalMinutes).toBe(0);
    expect(result.activeDays).toBe(0);
  });
});

describe('fetchReadingSeasonData — dominantReadingExperience (поріг вибірки, ТЗ §50)', () => {
  it('менше за MIN_SESSIONS_FOR_READING_EXPERIENCE (5) розпізнаних сесій — null, навіть з одностайною відповіддю', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-exp1');
    for (let i = 0; i < 4; i += 1) {
      await seedSession(db, {
        userBookId: 'ub-exp1',
        startedAt: `2026-07-0${i + 1}T10:00:00.000Z`,
        readingExperience: 'engaging',
      });
    }

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.dominantReadingExperience).toBeNull();
  });

  it('5+ розпізнаних сесій із чіткою більшістю — повертає це значення', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-exp2');
    const values = ['engaging', 'engaging', 'engaging', 'calm', 'calm'];
    for (let i = 0; i < values.length; i += 1) {
      await seedSession(db, {
        userBookId: 'ub-exp2',
        startedAt: `2026-07-0${i + 1}T10:00:00.000Z`,
        readingExperience: values[i],
      });
    }

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.dominantReadingExperience).toBe('engaging');
  });
});

describe('fetchReadingSeasonData — favoriteBook (ТЗ §45)', () => {
  it('обране (isFavorite) переважає над вищою оцінкою неулюбленої книги', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-fav1');
    await finishRun(db, 'ub-fav1', { finishedAt: IN_RANGE_EARLY });
    await RatingRepository.upsertCurrent(db, { userBookId: 'ub-fav1', value: 5 });

    await seedUserBook(db, 'ub-fav2');
    await finishRun(db, 'ub-fav2', { finishedAt: IN_RANGE_MID });
    await RatingRepository.upsertCurrent(db, { userBookId: 'ub-fav2', value: 2 });
    await UserBookRepository.setFavorite(db, 'ub-fav2', true);

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.favoriteBook?.userBook.id).toBe('ub-fav2');
    expect(result.favoriteBook?.isFavorite).toBe(true);
  });

  it('серед кількох обраних перемагає найвища оцінка', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-fav3');
    await finishRun(db, 'ub-fav3', { finishedAt: IN_RANGE_EARLY });
    await RatingRepository.upsertCurrent(db, { userBookId: 'ub-fav3', value: 3 });
    await UserBookRepository.setFavorite(db, 'ub-fav3', true);

    await seedUserBook(db, 'ub-fav4');
    await finishRun(db, 'ub-fav4', { finishedAt: IN_RANGE_MID });
    await RatingRepository.upsertCurrent(db, { userBookId: 'ub-fav4', value: 5 });
    await UserBookRepository.setFavorite(db, 'ub-fav4', true);

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.favoriteBook?.userBook.id).toBe('ub-fav4');
    expect(result.favoriteBook?.ratingValue).toBe(5);
  });

  it('жодної обраної книги — пул звужується до всіх книг сезону, перемагає найвища оцінка', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-fav5');
    await finishRun(db, 'ub-fav5', { finishedAt: IN_RANGE_EARLY });
    await RatingRepository.upsertCurrent(db, { userBookId: 'ub-fav5', value: 3 });

    await seedUserBook(db, 'ub-fav6');
    await finishRun(db, 'ub-fav6', { finishedAt: IN_RANGE_MID });
    await RatingRepository.upsertCurrent(db, { userBookId: 'ub-fav6', value: 4.5 });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.favoriteBook?.userBook.id).toBe('ub-fav6');
    expect(result.favoriteBook?.isFavorite).toBe(false);
  });

  it('нічия за оцінкою серед обраних — перемагає перша зустрінута (найновіший фініш, порядок `books`)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-fav7');
    await finishRun(db, 'ub-fav7', { finishedAt: IN_RANGE_EARLY }); // старіший фініш
    await RatingRepository.upsertCurrent(db, { userBookId: 'ub-fav7', value: 4 });
    await UserBookRepository.setFavorite(db, 'ub-fav7', true);

    await seedUserBook(db, 'ub-fav8');
    await finishRun(db, 'ub-fav8', { finishedAt: IN_RANGE_LATE }); // новіший фініш
    await RatingRepository.upsertCurrent(db, { userBookId: 'ub-fav8', value: 4 });
    await UserBookRepository.setFavorite(db, 'ub-fav8', true);

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    // `books` — найновіший фініш спочатку, тож `ub-fav8` зустрічається першим у переборі.
    expect(result.favoriteBook?.userBook.id).toBe('ub-fav8');
  });
});

/**
 * ТЗ §49 — `bookMemoryPreview` має брати спогад, прив'язаний до КОНКРЕТНОГО run'у, що
 * завершився в сезоні, а НЕ "поточний" спогад книги (`BookMemoryRepository.getCurrent`), який
 * може вже належати ПІЗНІШОМУ перечитуванню поза вікном сезону — саме той сценарій, що прямо
 * документує `BookMemoryRepository.listByReadingRunIds`.
 */
describe('fetchReadingSeasonData — bookMemoryPreview прив\'язаний до RUN, не до книги (ТЗ §49)', () => {
  it('спогад пізнішого перечитування (поза сезоном) НЕ підміняє спогад run, що завершився в сезоні', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-mem1');

    // Run №1 — завершується В СЕЗОНІ, отримує свій спогад.
    await finishRun(db, 'ub-mem1', { finishedAt: IN_RANGE_EARLY });
    await BookMemoryRepository.upsertCurrent(db, {
      userBookId: 'ub-mem1',
      reflection: 'Спогад про перше прочитання',
      entryRefs: [],
      templateId: 'classic',
    });

    // Run №2 — перечитування ПІСЛЯ сезону, отримує ІНШИЙ спогад (тепер він "поточний" для книги).
    await finishRun(db, 'ub-mem1', { finishedAt: AFTER_RANGE, startedAt: IN_RANGE_LATE });
    await BookMemoryRepository.upsertCurrent(db, {
      userBookId: 'ub-mem1',
      reflection: 'Спогад про перечитування — вже поза сезоном',
      entryRefs: [],
      templateId: 'classic',
    });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    // Сезон бачить лише run №1 (він один завершився в діапазоні).
    expect(result.uniqueBooksCount).toBe(1);
    expect(result.bookMemoryPreview?.userBook.id).toBe('ub-mem1');
    expect(result.bookMemoryPreview?.reflection).toBe('Спогад про перше прочитання');
  });

  it('немає жодного book memory на run сезону — null, а не спогад "найновішого" run книги', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-mem2');
    await finishRun(db, 'ub-mem2', { finishedAt: IN_RANGE_EARLY });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.bookMemoryPreview).toBeNull();
  });
});

describe('fetchReadingSeasonData — seasonSeries (ТЗ §52)', () => {
  it('менше 2 книг сезону в одній серії — null', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-ser1');
    await finishRun(db, 'ub-ser1', { finishedAt: IN_RANGE_EARLY });
    const series = await SeriesRepository.findOrCreateByName(db, 'Одиночна серія');
    await SeriesRepository.addEntry(db, { seriesId: series.id, workId: 'ub-ser1-work', position: 1 });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.seasonSeries).toBeNull();
  });

  it('≥2 книги сезону в одній серії — заповнюється, несе обидві книги', async () => {
    const db = await openMigratedTestDb();
    const series = await SeriesRepository.findOrCreateByName(db, 'Дилогія');

    await seedUserBook(db, 'ub-ser2');
    await finishRun(db, 'ub-ser2', { finishedAt: IN_RANGE_EARLY });
    await SeriesRepository.addEntry(db, { seriesId: series.id, workId: 'ub-ser2-work', position: 1 });

    await seedUserBook(db, 'ub-ser3');
    await finishRun(db, 'ub-ser3', { finishedAt: IN_RANGE_MID });
    await SeriesRepository.addEntry(db, { seriesId: series.id, workId: 'ub-ser3-work', position: 2 });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.seasonSeries?.series.id).toBe(series.id);
    expect(result.seasonSeries?.books.map((b) => b.id).sort()).toEqual(['ub-ser2', 'ub-ser3']);
  });

  it('кілька серій-кандидатів — перемагає НАЙБІЛЬША група', async () => {
    const db = await openMigratedTestDb();
    const small = await SeriesRepository.findOrCreateByName(db, 'Маленька серія');
    const big = await SeriesRepository.findOrCreateByName(db, 'Велика серія');

    await seedUserBook(db, 'ub-ser4');
    await finishRun(db, 'ub-ser4', { finishedAt: IN_RANGE_EARLY });
    await SeriesRepository.addEntry(db, { seriesId: small.id, workId: 'ub-ser4-work', position: 1 });

    await seedUserBook(db, 'ub-ser5');
    await finishRun(db, 'ub-ser5', { finishedAt: IN_RANGE_EARLY });
    await SeriesRepository.addEntry(db, { seriesId: small.id, workId: 'ub-ser5-work', position: 2 });

    await seedUserBook(db, 'ub-ser6');
    await finishRun(db, 'ub-ser6', { finishedAt: IN_RANGE_MID });
    await SeriesRepository.addEntry(db, { seriesId: big.id, workId: 'ub-ser6-work', position: 1 });

    await seedUserBook(db, 'ub-ser7');
    await finishRun(db, 'ub-ser7', { finishedAt: IN_RANGE_MID });
    await SeriesRepository.addEntry(db, { seriesId: big.id, workId: 'ub-ser7-work', position: 2 });

    await seedUserBook(db, 'ub-ser8');
    await finishRun(db, 'ub-ser8', { finishedAt: IN_RANGE_LATE });
    await SeriesRepository.addEntry(db, { seriesId: big.id, workId: 'ub-ser8-work', position: 3 });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.seasonSeries?.series.id).toBe(big.id);
    expect(result.seasonSeries?.books).toHaveLength(3);
  });
});

/**
 * ТЗ §46-48 — "Що залишилося з тобою": пріоритетний ланцюжок favorite moment → favorite thought
 * → favorite quote → revisit later → newest-meaningful fallback, максимум 4 УНІКАЛЬНІ записи.
 */
describe('fetchReadingSeasonData — savedThoughts / favoriteQuote: пріоритетний ланцюжок (ТЗ §46-48)', () => {
  it('по одному запису на кожен рівень пріоритету — порядок у savedThoughts відповідає ланцюжку', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-chain1');
    await finishRun(db, 'ub-chain1', { finishedAt: IN_RANGE_MID });

    await createNoteAt(db, {
      userBookId: 'ub-chain1',
      type: 'moment',
      text: 'Момент',
      createdAt: IN_RANGE_EARLY,
      isFavorite: true,
    });
    await createNoteAt(db, {
      userBookId: 'ub-chain1',
      type: 'thought',
      text: 'Думка',
      createdAt: IN_RANGE_EARLY,
      isFavorite: true,
    });
    await createQuoteAt(db, {
      userBookId: 'ub-chain1',
      editionId: 'ub-chain1-edition',
      text: 'Цитата',
      createdAt: IN_RANGE_EARLY,
      isFavorite: true,
    });
    await createNoteAt(db, {
      userBookId: 'ub-chain1',
      type: 'question',
      text: 'Повернутися пізніше',
      createdAt: IN_RANGE_EARLY,
      revisitLater: true,
    });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.savedThoughts.map((e) => e.text)).toEqual(['Момент', 'Думка', 'Цитата', 'Повернутися пізніше']);
    expect(result.favoriteQuote?.text).toBe('Цитата');
  });

  it('максимум 4 унікальні записи — п\'ятий кандидат (сягнувши ліміту) не потрапляє', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-chain2');
    await finishRun(db, 'ub-chain2', { finishedAt: IN_RANGE_MID });

    await createNoteAt(db, { userBookId: 'ub-chain2', type: 'moment', text: 'Момент 1', createdAt: IN_RANGE_EARLY, isFavorite: true });
    await createNoteAt(db, { userBookId: 'ub-chain2', type: 'moment', text: 'Момент 2', createdAt: IN_RANGE_MID, isFavorite: true });
    await createNoteAt(db, { userBookId: 'ub-chain2', type: 'thought', text: 'Думка 1', createdAt: IN_RANGE_EARLY, isFavorite: true });
    await createNoteAt(db, { userBookId: 'ub-chain2', type: 'thought', text: 'Думка 2', createdAt: IN_RANGE_MID, isFavorite: true });
    // Ліміт уже вичерпано двома буккетами вище (2 + 2 = 4) — ця обрана цитата в savedThoughts НЕ
    // потрапляє, хоча `favoriteQuote` (окреме поле, рахується незалежно) її все одно бачить.
    await createQuoteAt(db, {
      userBookId: 'ub-chain2',
      editionId: 'ub-chain2-edition',
      text: 'П\'ята — цитата',
      createdAt: IN_RANGE_LATE,
      isFavorite: true,
    });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.savedThoughts).toHaveLength(4);
    expect(result.savedThoughts.some((e) => e.text === 'П\'ята — цитата')).toBe(false);
    expect(result.favoriteQuote?.text).toBe('П\'ята — цитата');
  });

  it('той самий запис, що потрапляє під ДВА фільтри (favorite thought + revisit later) — рахується лише один раз', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-chain3');
    await finishRun(db, 'ub-chain3', { finishedAt: IN_RANGE_MID });

    await createNoteAt(db, {
      userBookId: 'ub-chain3',
      type: 'thought',
      text: 'І обране, і "повернутися пізніше"',
      createdAt: IN_RANGE_EARLY,
      isFavorite: true,
      revisitLater: true,
    });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.savedThoughts).toHaveLength(1);
  });

  it('немає жодного обраного/"повернутися пізніше" — fallback на найновіший запис сезону', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-chain4');
    await finishRun(db, 'ub-chain4', { finishedAt: IN_RANGE_MID });
    await createNoteAt(db, { userBookId: 'ub-chain4', type: 'thought', text: 'Звичайна нотатка', createdAt: IN_RANGE_EARLY });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.savedThoughts.map((e) => e.text)).toEqual(['Звичайна нотатка']);
    expect(result.favoriteQuote).toBeNull();
  });

  it('запис поза діапазоном сезону не потрапляє ні в savedThoughts, ні у fallback', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-chain5');
    await finishRun(db, 'ub-chain5', { finishedAt: IN_RANGE_MID });
    await createNoteAt(db, { userBookId: 'ub-chain5', type: 'thought', text: 'Занадто рано', createdAt: BEFORE_RANGE });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.savedThoughts).toEqual([]);
  });
});

/**
 * ТЗ §67 — "видалена книга" не повинна ламати сезон. Два різні рівні "видалення" дають дві різні
 * поведінки нижче, і важливо тестувати саме той, що реально проходить крізь
 * `fetchReadingSeasonData` до рядка `if (!userBook) continue`:
 *
 * - м'яко видалений `user_book` НІКОЛИ не потрапляє навіть у `runsInRange` — сам
 *   `ReadingRunRepository.listFinishedBetween` вже робить `JOIN user_book ... AND ub.deleted_at
 *   IS NULL` (докладніше — коментар над цим методом), тож результат порожній ще ДО
 *   `UserBookRepository.listWithDetailsByIds`;
 * - м'яко видалене (чи фізично відсутнє) `edition` цієї книги — user_book сам лишається живим
 *   (проходить JOIN вище), run потрапляє у `finishedRunRows`, але
 *   `UserBookRepository.listWithDetailsByIds` → `attachDetailsBatch` не знаходить edition
 *   (`EditionRepository.listByIds` теж фільтрує `deleted_at IS NULL`) і мовчки пропускає книгу —
 *   САМЕ це і ловить `if (!userBook) continue` у `fetchReadingSeasonData`.
 *
 * Обидва випадки мають дати той самий видимий результат для користувача (книга тихо зникає, без
 * падіння) — тестуються окремо, щоб показати, що жоден із двох шляхів не кидає виняток.
 */
describe('fetchReadingSeasonData — видалена книга пропускається мовчки (ТЗ §67)', () => {
  it('м\'яко видалений user_book — run навіть не потрапляє в runsInRange (listFinishedBetween сам фільтрує)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-del1');
    await finishRun(db, 'ub-del1', { finishedAt: IN_RANGE_MID });
    await db.runAsync(`UPDATE user_book SET deleted_at = ? WHERE id = ?`, [new Date().toISOString(), 'ub-del1']);

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    expect(result.books).toEqual([]);
    expect(result.finishedRuns).toEqual([]);
    expect(result.completedRuns).toBe(0);
    expect(result.uniqueBooksCount).toBe(0);
  });

  it('живий user_book, але видалене edition — run проходить у finishedRunRows, книга мовчки відсіюється в listWithDetailsByIds', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-del2');
    await finishRun(db, 'ub-del2', { finishedAt: IN_RANGE_EARLY });
    // user_book.deleted_at лишається NULL — сам run пройде `listFinishedBetween`.
    await db.runAsync(`UPDATE edition SET deleted_at = ? WHERE id = ?`, [
      new Date().toISOString(),
      'ub-del2-edition',
    ]);

    await seedUserBook(db, 'ub-del3');
    await finishRun(db, 'ub-del3', { finishedAt: IN_RANGE_MID });

    const result = await fetchReadingSeasonData(db, SEASON_ID, SEASON_YEAR);

    // ub-del2 мовчки пропущена (нема ні в books, ні в finishedRuns) — жодного винятку.
    expect(result.books.map((b) => b.id)).toEqual(['ub-del3']);
    expect(result.finishedRuns.map((e) => e.userBook.id)).toEqual(['ub-del3']);
    expect(result.completedRuns).toBe(1);
    expect(result.uniqueBooksCount).toBe(1);
  });
});

describe('fetchReadingSeasonData — зима перетинає межу календарного року', () => {
  it('run, завершений у грудні попереднього року, і run, завершений у лютому поточного — ОБИДВА в "Зимі" цього року', async () => {
    const db = await openMigratedTestDb();
    const winterRange = seasonDateRange('winter', 2027);
    expect(winterRange).toEqual({ start: '2026-12-01T00:00:00.000Z', end: '2027-03-01T00:00:00.000Z' });

    await seedUserBook(db, 'ub-winter1');
    await finishRun(db, 'ub-winter1', { finishedAt: '2026-12-15T00:00:00.000Z' });

    await seedUserBook(db, 'ub-winter2');
    await finishRun(db, 'ub-winter2', { finishedAt: '2027-02-10T00:00:00.000Z' });

    const result = await fetchReadingSeasonData(db, 'winter', 2027);

    expect(result.uniqueBooksCount).toBe(2);
    expect(result.completedRuns).toBe(2);
    expect(result.books.map((b) => b.id).sort()).toEqual(['ub-winter1', 'ub-winter2']);
  });

  it('run, завершений у листопаді (перед зимою) чи березні (після зими) — НЕ в "Зимі" 2027', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-winter3');
    await finishRun(db, 'ub-winter3', { finishedAt: '2026-11-30T23:00:00.000Z' });
    await seedUserBook(db, 'ub-winter4');
    await finishRun(db, 'ub-winter4', { finishedAt: '2027-03-01T00:00:00.000Z' });

    const result = await fetchReadingSeasonData(db, 'winter', 2027);

    expect(result.uniqueBooksCount).toBe(0);
  });
});
