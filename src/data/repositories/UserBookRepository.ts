import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { UserBook, UserBookStatus, UserBookWithDetails } from '@/types/userBook';
import type { EditionWithRelations } from '@/types/edition';
import type { WorkWithAuthors } from '@/types/work';
import { EditionRepository } from './EditionRepository';
import { WorkRepository } from './WorkRepository';
import { AuthorRepository } from './AuthorRepository';
import { PublisherRepository } from './PublisherRepository';
import { TranslatorRepository } from './TranslatorRepository';
import { ReadingRunRepository } from './ReadingRunRepository';

interface UserBookRow {
  id: string;
  edition_id: string;
  status: UserBookStatus;
  started_at: string | null;
  finished_at: string | null;
  current_page: number;
  is_favorite: number;
  spoiler_safe_enabled: number;
  added_at: string;
  updated_at: string;
}

function mapRow(row: UserBookRow): UserBook {
  return {
    id: row.id,
    editionId: row.edition_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    currentPage: row.current_page,
    isFavorite: row.is_favorite === 1,
    spoilerSafeEnabled: row.spoiler_safe_enabled === 1,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
  };
}

async function attachDetails(db: SQLiteDatabase, userBook: UserBook): Promise<UserBookWithDetails | null> {
  const edition = await EditionRepository.getByIdWithRelations(db, userBook.editionId);
  if (!edition) return null;
  const work = await WorkRepository.getByIdWithAuthors(db, edition.workId);
  if (!work) return null;
  return { ...userBook, edition, work };
}

/**
 * Пакетна версія `attachDetails` для списків (Milestone 8, продуктивність — реальна знахідка
 * з аудиту: `Promise.all(rows.map(attachDetails))` робив ~5 запитів НА КОЖНУ книгу
 * (edition, publisher, translators, work, authors) — 5N+1 на весь список замість фіксованої
 * кількості. Тут та сама інформація збирається шістьма запитами IN (...) сумарно, незалежно
 * від розміру списку: по одному на edition/work/publisher/translators/authors плюс сам
 * `user_book`. Використовується `listByStatus`/`listAll` тут і `ShelfRepository.listBooksByShelf`.
 * `getByIdWithDetails`/`getByEditionIdWithDetails` (рівно ОДНА книга — не список) свідомо
 * лишились на старому `attachDetails`: там 5 запитів замість 6 не варті додаткової складності.
 */
async function attachDetailsBatch(db: SQLiteDatabase, userBooks: UserBook[]): Promise<UserBookWithDetails[]> {
  if (userBooks.length === 0) return [];

  const editionIds = [...new Set(userBooks.map((ub) => ub.editionId))];
  const editionById = await EditionRepository.listByIds(db, editionIds);

  const editions = [...editionById.values()];
  const workIds = [...new Set(editions.map((e) => e.workId))];
  const publisherIds = [...new Set(editions.map((e) => e.publisherId).filter((id): id is string => id != null))];

  const [workById, authorsByWork, publisherById, translatorsByEdition] = await Promise.all([
    WorkRepository.listByIds(db, workIds),
    AuthorRepository.listByWorkIds(db, workIds),
    PublisherRepository.listByIds(db, publisherIds),
    TranslatorRepository.listByEditionIds(db, editionIds),
  ]);

  const results: UserBookWithDetails[] = [];
  for (const userBook of userBooks) {
    const edition = editionById.get(userBook.editionId);
    if (!edition) continue; // те саме захисне пропускання, що й у singular attachDetails
    const work = workById.get(edition.workId);
    if (!work) continue;

    const workWithAuthors: WorkWithAuthors = { ...work, authors: authorsByWork.get(work.id) ?? [] };
    const editionWithRelations: EditionWithRelations = {
      ...edition,
      publisher: edition.publisherId ? publisherById.get(edition.publisherId) ?? null : null,
      translators: translatorsByEdition.get(edition.id) ?? [],
    };
    results.push({ ...userBook, edition: editionWithRelations, work: workWithAuthors });
  }
  return results;
}

/**
 * UserBook — "ця книга в МОЇЙ бібліотеці", окремо від каталогу Work/Edition (Milestone 1).
 * Один edition може мати щонайбільше один активний (не видалений) user_book — повторне
 * додавання того самого видання оновлює наявний запис, а не створює дублікат
 * (докладніше — getByEditionId, використовується формою "Додати до бібліотеки").
 */
export const UserBookRepository = {
  async getByEditionId(db: SQLiteDatabase, editionId: string): Promise<UserBook | null> {
    const row = await db.getFirstAsync<UserBookRow>(
      `SELECT * FROM user_book WHERE edition_id = ? AND deleted_at IS NULL LIMIT 1`,
      [editionId],
    );
    return row ? mapRow(row) : null;
  },

  /**
   * REREADING MODEL, Фаза 7 (`docs/READING_RUN.md`) — СВІДОМО не створює `reading_run`, на
   * відміну від `updateStatus` нижче. Причина: `useImportGoodreadsCsv.ts` викликає саме цей
   * метод, а одразу ПІСЛЯ нього — `applyImportedDates`, який перезаписує щойно виставлений
   * `started_at` РЕАЛЬНОЮ історичною датою з CSV. Якби `addToLibrary` тут же створював run
   * (із `startedAt = now`, бо саме "зараз" — єдина дата, яку ця функція взагалі знає), той run
   * лишився б із хибною датою старту (сьогодні замість реальної дати з імпорту) — саме той клас
   * "вигаданих" даних, якого свідомо уникає backfill. Це не втрата покриття для "нових reading
   * sessions" (ціль Фази 7): `addToLibrary` сесій не створює, а `ReadingSessionRepository.start`
   * нижче має власний "graceful" фолбек — якщо книгу додано напряму зі статусом
   * 'reading'/'finished' і активного run ще немає, перший реальний старт сесії (або перший
   * подальший виклик `updateStatus`) створить його сам, із коректною на той момент датою.
   */
  async addToLibrary(db: SQLiteDatabase, editionId: string, status: UserBookStatus): Promise<UserBook> {
    const existing = await UserBookRepository.getByEditionId(db, editionId);
    if (existing) return existing;

    const id = generateId();
    const now = nowIso();
    const startedAt = status === 'reading' || status === 'rereading' ? now : null;
    const finishedAt = status === 'finished' ? now : null;

    await db.runAsync(
      `INSERT INTO user_book (id, edition_id, status, started_at, finished_at, current_page, is_favorite, spoiler_safe_enabled, added_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, 1, ?, ?)`,
      [id, editionId, status, startedAt, finishedAt, now, now],
    );

    return {
      id,
      editionId,
      status,
      startedAt,
      finishedAt,
      currentPage: 0,
      isFavorite: false,
      spoilerSafeEnabled: true,
      addedAt: now,
      updatedAt: now,
    };
  },

  async getById(db: SQLiteDatabase, id: string): Promise<UserBook | null> {
    const row = await db.getFirstAsync<UserBookRow>(
      `SELECT * FROM user_book WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    return row ? mapRow(row) : null;
  },

  async getByIdWithDetails(db: SQLiteDatabase, id: string): Promise<UserBookWithDetails | null> {
    const userBook = await UserBookRepository.getById(db, id);
    if (!userBook) return null;
    return attachDetails(db, userBook);
  },

  async getByEditionIdWithDetails(db: SQLiteDatabase, editionId: string): Promise<UserBookWithDetails | null> {
    const userBook = await UserBookRepository.getByEditionId(db, editionId);
    if (!userBook) return null;
    return attachDetails(db, userBook);
  },

  /** Пакетний вибір за списком id, зі збереженням порядку `ids` (важливо для
   * `ShelfRepository.listBooksByShelf` — порядок `shelf_book.added_at DESC`, а `WHERE id IN
   * (...)` сам по собі порядок не гарантує). */
  async listByIds(db: SQLiteDatabase, ids: string[]): Promise<UserBook[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.getAllAsync<UserBookRow>(
      `SELECT * FROM user_book WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      ids,
    );
    const byId = new Map(rows.map((row) => [row.id, mapRow(row)]));
    return ids.map((id) => byId.get(id)).filter((ub): ub is UserBook => ub != null);
  },

  /** Пакетна версія `getByIdWithDetails` для списків — `attachDetailsBatch` замість N
   * окремих `attachDetails` (Milestone 8, продуктивність). Використовується
   * `ShelfRepository.listBooksByShelf`. */
  async listWithDetailsByIds(db: SQLiteDatabase, ids: string[]): Promise<UserBookWithDetails[]> {
    const userBooks = await UserBookRepository.listByIds(db, ids);
    return attachDetailsBatch(db, userBooks);
  },

  /** POLYTSIA POST-V1.6.2 FOUNDATION CLOSURE — Calendar soft-delete consistency.
   *
   * Варіант `listByIds`, що НЕ фільтрує `deleted_at IS NULL` — для читальних моделей, яким
   * потрібна історична правда, а не поточний стан полиці (Calendar: місячна сітка й деталі дня
   * мають показувати ту саму активність читання за книгою, яку користувач згодом прибрав з
   * бібліотеки — видалення книги не повинно стирати легітимну історію читання). Порядок `ids`
   * зберігається так само, як у `listByIds`.
   *
   * НЕ використовувати там, де потрібен саме "поточний стан бібліотеки" (Library tab,
   * Статистика тощо) — для цього лишається `listByIds`/`listByStatus`/`listAll`.
   */
  async listByIdsIncludingDeleted(db: SQLiteDatabase, ids: string[]): Promise<UserBook[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.getAllAsync<UserBookRow>(
      `SELECT * FROM user_book WHERE id IN (${placeholders})`,
      ids,
    );
    const byId = new Map(rows.map((row) => [row.id, mapRow(row)]));
    return ids.map((id) => byId.get(id)).filter((ub): ub is UserBook => ub != null);
  },

  /** Пакетна версія `listByIdsIncludingDeleted` з деталями — `attachDetailsBatch` вже гарантовано
   * (і навмисно, ще до цього фіксу) пропускає елементи, чий Edition/Work сам не знайдений
   * (`if (!edition) continue` / `if (!work) continue`), тож книга з м'яко видаленими
   * Edition/Work тут коректно не потрапить у результат — без жодних змін у самому
   * `attachDetailsBatch`. */
  async listWithDetailsByIdsIncludingDeleted(db: SQLiteDatabase, ids: string[]): Promise<UserBookWithDetails[]> {
    const userBooks = await UserBookRepository.listByIdsIncludingDeleted(db, ids);
    return attachDetailsBatch(db, userBooks);
  },

  /**
   * Оновлення статусу. `started_at`/`finished_at` виставляються автоматично при першому
   * переході в 'reading'/'rereading' чи 'finished' (і не перезаписуються, якщо вже стоять) —
   * щоб дата початку/завершення читання не "стрибала" при випадкових перемиканнях статусу.
   *
   * P0 FIX (POLYTSIA V1.6.1, Фаза 1 — підтверджений дефект з `docs/V1_6_FULL_AUDIT_REPORT.md`,
   * розділ 13): перехід у `did_not_finish` ЗАВЖДИ скидає `finished_at`, навіть якщо книга вже
   * мала дату завершення (наприклад: "Прочитано" → "Не дочитав", чи перечитування, яке
   * покинули, коли `finished_at` лишався від першого прочитання). Без цього Activity
   * History/On This Day (обидва читають саме `user_book.finished_at`) продовжували показувати
   * хибну подію "книгу завершено" для книги, яку користувач щойно позначив як НЕ дочитану.
   * Це навмисно мінімальний, локальний фікс на рівні єдиного поля `user_book.finished_at`, а
   * НЕ повноцінна модель історії читання — user_book лишається "поточним станом полиці", не
   * записом кожного окремого прочитання. Правильне, run-aware джерело правди (кожен цикл
   * читання матиме власні `finishedAt`/`abandonedAt`, і "було завершено вперше, потім покинуто
   * при перечитуванні" стане виразним без цього спеціального випадку) з'явиться разом із
   * ReadingRun (POLYTSIA V1.6.1, Фаза 6+) — до того моменту цей рядок лишається необхідним.
   */
  async updateStatus(db: SQLiteDatabase, id: string, status: UserBookStatus): Promise<void> {
    const current = await UserBookRepository.getById(db, id);
    if (!current) return;

    const now = nowIso();
    const startedAt =
      current.startedAt ?? ((status === 'reading' || status === 'rereading') ? now : null);
    const finishedAt =
      status === 'did_not_finish' ? null : current.finishedAt ?? (status === 'finished' ? now : null);

    // REREADING MODEL, Фаза 7 (`docs/READING_RUN.md`) — саме тут (єдина точка входу для будь-якої
    // зміни `status`, `useUpdateUserBookStatus`) реальний старт/завершення `reading_run`
    // прив'язується до переходу статусу. "Graceful" підхід — той самий принцип, що й усюди в цій
    // сутності (жодного жорсткого UNIQUE, лише запит активного run):
    //   - перехід у 'reading'/'rereading' БЕЗ уже активного run -> новий прохід (перший старт
    //     АБО повторний після 'finished'/'did_not_finish') -> ReadingRunRepository.start.
    //     Перехід 'paused' -> 'reading' сюди навмисно НЕ потрапляє: активний run уже є (пауза
    //     лишається в межах того самого проходу, docs/READING_RUN.md §"Ключові рішення" п.1).
    //   - перехід у 'finished'/'did_not_finish' З активним run -> ReadingRunRepository.finish
    //     (ідемпотентно). Якщо активного run немає (книгу додано напряму зі статусом
    //     'reading'/'finished' через addToLibrary, яку ця фаза СВІДОМО НЕ підключає — див.
    //     коментар над addToLibrary нижче) — свідомо нічого не вигадуємо, той самий принцип "не
    //     вигадувати історію", що й у 020_reading_run_backfill.ts.
    const activeRun = await ReadingRunRepository.getActiveByUserBookId(db, id);

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE user_book SET status = ?, started_at = ?, finished_at = ?, updated_at = ? WHERE id = ?`,
        [status, startedAt, finishedAt, now, id],
      );

      if ((status === 'reading' || status === 'rereading') && !activeRun) {
        await ReadingRunRepository.start(db, { userBookId: id, startedAt: now });
      } else if ((status === 'finished' || status === 'did_not_finish') && activeRun) {
        await ReadingRunRepository.finish(db, activeRun.id, { status, finishedAt: now });
      }
    });
  },

  async updateCurrentPage(db: SQLiteDatabase, id: string, currentPage: number): Promise<void> {
    await db.runAsync(`UPDATE user_book SET current_page = ?, updated_at = ? WHERE id = ?`, [
      Math.max(0, Math.trunc(currentPage)),
      nowIso(),
      id,
    ]);
  },

  async setFavorite(db: SQLiteDatabase, id: string, isFavorite: boolean): Promise<void> {
    await db.runAsync(`UPDATE user_book SET is_favorite = ?, updated_at = ? WHERE id = ?`, [
      isFavorite ? 1 : 0,
      nowIso(),
      id,
    ]);
  },

  /** SPOILER-SAFE MODE (Фаза 11) — той самий патерн, що й `setFavorite` вище. */
  async setSpoilerSafeEnabled(db: SQLiteDatabase, id: string, spoilerSafeEnabled: boolean): Promise<void> {
    await db.runAsync(`UPDATE user_book SET spoiler_safe_enabled = ?, updated_at = ? WHERE id = ?`, [
      spoilerSafeEnabled ? 1 : 0,
      nowIso(),
      id,
    ]);
  },

  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`UPDATE user_book SET deleted_at = ? WHERE id = ?`, [nowIso(), id]);
  },

  /** Проставляє реальні історичні дати з імпорту (Goodreads CSV, Milestone 9) — на відміну
   * від `addToLibrary`/`updateStatus` (які виставляють `started_at`/`finished_at` як "зараз"
   * при переході статусу, бо для звичайного використання застосунку іншої дати просто не
   * існує), тут дати вже відомі з файлу. `COALESCE(?, ...)` — кожен параметр `null` лишає
   * відповідне поле незмінним, а не затирає його: не кожен рядок Goodreads-експорту має і
   * "Date Read", і "Date Added". */
  async applyImportedDates(
    db: SQLiteDatabase,
    id: string,
    params: { startedAt?: string | null; finishedAt?: string | null; addedAt?: string | null },
  ): Promise<void> {
    await db.runAsync(
      `UPDATE user_book
       SET started_at = COALESCE(?, started_at),
           finished_at = COALESCE(?, finished_at),
           added_at = COALESCE(?, added_at),
           updated_at = ?
       WHERE id = ?`,
      [params.startedAt ?? null, params.finishedAt ?? null, params.addedAt ?? null, nowIso(), id],
    );
  },

  /** Усі книги користувача з певним статусом, найновіші зверху — для вкладки Бібліотека.
   * Пакетне довантаження деталей (`attachDetailsBatch`) — фіксована кількість запитів
   * незалежно від розміру бібліотеки (Milestone 8, продуктивність, було 5N+1). */
  async listByStatus(db: SQLiteDatabase, status: UserBookStatus): Promise<UserBookWithDetails[]> {
    const rows = await db.getAllAsync<UserBookRow>(
      `SELECT * FROM user_book WHERE status = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [status],
    );
    return attachDetailsBatch(db, rows.map(mapRow));
  },

  /** Усі книги користувача незалежно від статусу — рахунки/групування на Бібліотеці. */
  async listAll(db: SQLiteDatabase): Promise<UserBookWithDetails[]> {
    const rows = await db.getAllAsync<UserBookRow>(
      `SELECT * FROM user_book WHERE deleted_at IS NULL ORDER BY updated_at DESC`,
    );
    return attachDetailsBatch(db, rows.map(mapRow));
  },

  /** Легкий вибір без деталей видання/твору — для статистики, якій потрібні лише
   * status/finishedAt (Milestone 8, продуктивність: `useOverallStatistics` рахував лише
   * кількість/дати завершених книг, але через `listByStatus` тягнув усі 5 запитів на книгу
   * даремно). */
  async listStatusOnly(db: SQLiteDatabase, status: UserBookStatus): Promise<UserBook[]> {
    const rows = await db.getAllAsync<UserBookRow>(
      `SELECT * FROM user_book WHERE status = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [status],
    );
    return rows.map(mapRow);
  },
};
