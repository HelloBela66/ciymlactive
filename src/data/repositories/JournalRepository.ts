import type { SQLiteDatabase } from 'expo-sqlite';
import type { JournalEntry, JournalEntryCursor, JournalEntryType, JournalFeedEntry } from '@/types/journalEntry';
import type { NoteType } from '@/types/note';

interface JournalUnionRow {
  id: string;
  kind: 'note' | 'quote';
  user_book_id: string;
  edition_id: string | null;
  session_id: string | null;
  page: number | null;
  progress_percent: number | null;
  type: string;
  category_id: string | null;
  text: string;
  comment: string | null;
  tags: string;
  is_favorite: number;
  revisit_later: number;
  reaction: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Умова фільтра за типом нотатки (Milestone 11, доповнення — виправлення після самоперевірки
 * пакету «власні категорії»): `'general'` — не лише "жодного з 4 базових типів", а й "sentinel"
 * значення `type`, яке `NoteCategoryPicker.handleSelectCustom` завжди проставляє власним
 * категоріям користувача (`categoryId` тоді непорожній, справжня назва — у `note_category`).
 * Наївний `type IN (...)` для фільтра "Загальне" тому раніше захоплював і нотатки з власними
 * категоріями (в них теж `type = 'general'`) — хоча в стрічці вони коректно показували свою
 * власну мітку, фільтр "Загальне" мав би лишати тільки СПРАВДІ нічим не позначені нотатки.
 * Тут — явний виняток лише для `'general'` (`type = 'general' AND category_id IS NULL`);
 * решта типів (`thought`/`question`/`theory`/`moment`) власних категорій не зачіпають, бо
 * `categoryId` там завжди `null`, тож для них звичайний `type = ?` лишається без змін.
 */
function buildNoteTypeCondition(
  noteTypes: NoteType[],
  params: (string | number | null)[],
  typeColumn: string,
  categoryIdColumn: string,
): string {
  const others = noteTypes.filter((t) => t !== 'general');
  const hasGeneral = others.length !== noteTypes.length;

  const conditions: string[] = [];
  if (others.length > 0) {
    conditions.push(`${typeColumn} IN (${others.map(() => '?').join(', ')})`);
    params.push(...others);
  }
  if (hasGeneral) {
    conditions.push(`(${typeColumn} = 'general' AND ${categoryIdColumn} IS NULL)`);
  }
  return `(${conditions.join(' OR ')})`;
}

function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function mapRow(row: JournalUnionRow): JournalEntry {
  return {
    id: row.id,
    kind: row.kind,
    userBookId: row.user_book_id,
    editionId: row.edition_id,
    sessionId: row.session_id,
    page: row.page,
    progressPercent: row.progress_percent,
    type: row.type as JournalEntryType,
    categoryId: row.category_id,
    text: row.text,
    comment: row.comment,
    tags: parseTags(row.tags),
    isFavorite: row.is_favorite === 1,
    revisitLater: row.revisit_later === 1,
    reaction: row.reaction,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Додаткові колонки, які `listFeedPage` приєднує через JOIN — див. коментар там-таки. */
interface FeedJoinRow {
  work_id: string;
  work_title: string;
  cover_url: string | null;
  cover_fallback_color: string | null;
  category_label: string | null;
}

function mapFeedRow(row: JournalUnionRow & FeedJoinRow): JournalFeedEntry {
  return {
    ...mapRow(row),
    workId: row.work_id,
    workTitle: row.work_title,
    coverUrl: row.cover_url,
    coverFallbackColor: row.cover_fallback_color,
    categoryLabel: row.category_label,
  };
}

export interface JournalListPageOptions {
  /** За замовчуванням 50 — глобальна стрічка (`docs/DATABASE.md`, keyset-пагінація для
   * великих обсягів). Для запиту "усе по одній книзі" передавай великий limit напряму. */
  limit?: number;
  cursor?: JournalEntryCursor | null;
  favoriteOnly?: boolean;
  /** ТЗ Фази 11 («ПОВЕРНУТИСЯ ПІЗНІШЕ») — той самий "лише позначені" фільтр, що й
   * `favoriteOnly`, лише за іншим прапорцем (`revisit_later`, `011_revisit_later.ts`). */
  revisitLaterOnly?: boolean;
  /** Якщо задано — лишає лише ці типи. `'quote'` вмикає/вимикає всю гілку `quote`
   * (у `quote` немає власного поля `type` — весь рядок за визначенням є цитатою). */
  types?: JournalEntryType[];
  userBookId?: string;
  /** Фільтр за конкретною сесією читання (Milestone 11, Фаза 3 — "записи цієї сесії" на
   * екрані активного читання). */
  sessionId?: string;
  /** Текстовий пошук (ТЗ Фази 7 — «Мій щоденник» search: text/book/type/reaction/favorite/
   * date). LIKE по `text` (і, для цитат, ще й `comment`) — перевірено окремим repository-
   * тестом (`PersonalSearch.test.ts`, Фаза 6) і аналізом обсягу даних (докладніше — коментар
   * над `listFeedPage`): для типової кількості записів одного користувача (навіть 10 000+)
   * звичайний `LIKE '%…%'` без FTS5 лишається достатньо швидким — жодного окремого
   * FTS-індексу/віртуальної таблиці тут навмисно немає. */
  query?: string;
  /** Конкретна реакція (emoji-рядок, `src/design/reactions.ts`) — фільтр "Реакція" (ТЗ Фази
   * 7). `undefined` — без фільтра. */
  reaction?: string;
  /** Лише записи одного твору — фільтр "Книга" (ТЗ Фази 7). Має сенс лише для `listFeedPage`
   * (глобальна стрічка змішує книги); `listPage` і так уже скопований на один `userBookId`
   * через поле вище, тому свій SQL-білдер це поле ігнорує. */
  workId?: string;
  /** Діапазон дат за `created_at` (включно, ISO) — фільтр "Дата" (ТЗ Фази 7). Порожні межі —
   * без обмеження з відповідного боку. */
  dateFrom?: string;
  dateTo?: string;
}

export interface JournalListPageResult {
  items: JournalEntry[];
  nextCursor: JournalEntryCursor | null;
}

/**
 * Union-читання `note`+`quote` як єдиного "JournalEntry" (Milestone 11, варіант A з аналізу
 * Фази 1 — обидві таблиці лишаються фізично окремими, об'єднання лише тут). Обидві гілки
 * SQL-запиту фільтруються/сортуються на боці SQLite (не в JS) — вимога продуктивності для
 * 10к+ записів (`docs/DATABASE.md`). Мутації (favorite/reaction/видалення) НЕ тут — вони
 * йдуть напряму через `NoteRepository`/`QuoteRepository` за `entry.kind`+`entry.id`.
 */
export const JournalRepository = {
  async listPage(db: SQLiteDatabase, options: JournalListPageOptions = {}): Promise<JournalListPageResult> {
    const limit = options.limit ?? 50;
    const favoriteOnly = options.favoriteOnly ?? false;
    const revisitLaterOnly = options.revisitLaterOnly ?? false;
    const types = options.types;
    const noteTypes = types ? types.filter((t): t is NoteType => t !== 'quote') : null;
    const includeNotesBranch = types ? noteTypes !== null && noteTypes.length > 0 : true;
    const includeQuotesBranch = types ? types.includes('quote') : true;

    const branches: string[] = [];
    // SQLite bind-параметри — тільки string/number/null (той самий тип, що `toBindValue` у
    // `BackupRepository.ts`), тож не `unknown[]`.
    const params: (string | number | null)[] = [];

    if (includeNotesBranch) {
      let sql = `SELECT id, 'note' AS kind, user_book_id, NULL AS edition_id, session_id, page,
                    progress_percent, type, category_id, text, NULL AS comment, tags, is_favorite, revisit_later, reaction,
                    created_at, updated_at
                  FROM note WHERE deleted_at IS NULL`;
      if (options.userBookId) {
        sql += ' AND user_book_id = ?';
        params.push(options.userBookId);
      }
      if (options.sessionId) {
        sql += ' AND session_id = ?';
        params.push(options.sessionId);
      }
      if (favoriteOnly) sql += ' AND is_favorite = 1';
      if (revisitLaterOnly) sql += ' AND revisit_later = 1';
      if (noteTypes && noteTypes.length > 0) {
        sql += ` AND ${buildNoteTypeCondition(noteTypes, params, 'type', 'category_id')}`;
      }
      if (options.reaction) {
        sql += ' AND reaction = ?';
        params.push(options.reaction);
      }
      if (options.query) {
        sql += ' AND text LIKE ?';
        params.push(`%${options.query.trim()}%`);
      }
      if (options.dateFrom) {
        sql += ' AND created_at >= ?';
        params.push(options.dateFrom);
      }
      if (options.dateTo) {
        sql += ' AND created_at <= ?';
        params.push(options.dateTo);
      }
      if (options.cursor) {
        sql += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
        params.push(options.cursor.createdAt, options.cursor.createdAt, options.cursor.id);
      }
      branches.push(sql);
    }

    if (includeQuotesBranch) {
      let sql = `SELECT id, 'quote' AS kind, user_book_id, edition_id, session_id, page,
                    progress_percent, 'quote' AS type, NULL AS category_id, text, comment, tags,
                    is_favorite, revisit_later, reaction, created_at, updated_at
                  FROM quote WHERE deleted_at IS NULL`;
      if (options.userBookId) {
        sql += ' AND user_book_id = ?';
        params.push(options.userBookId);
      }
      if (options.sessionId) {
        sql += ' AND session_id = ?';
        params.push(options.sessionId);
      }
      if (favoriteOnly) sql += ' AND is_favorite = 1';
      if (revisitLaterOnly) sql += ' AND revisit_later = 1';
      if (options.reaction) {
        sql += ' AND reaction = ?';
        params.push(options.reaction);
      }
      if (options.query) {
        const pattern = `%${options.query.trim()}%`;
        sql += ' AND (text LIKE ? OR comment LIKE ?)';
        params.push(pattern, pattern);
      }
      if (options.dateFrom) {
        sql += ' AND created_at >= ?';
        params.push(options.dateFrom);
      }
      if (options.dateTo) {
        sql += ' AND created_at <= ?';
        params.push(options.dateTo);
      }
      if (options.cursor) {
        sql += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
        params.push(options.cursor.createdAt, options.cursor.createdAt, options.cursor.id);
      }
      branches.push(sql);
    }

    if (branches.length === 0) return { items: [], nextCursor: null };

    // limit + 1 — щоб дізнатись, чи є наступна сторінка, без окремого COUNT-запиту.
    const sql = `${branches.join(' UNION ALL ')} ORDER BY created_at DESC, id DESC LIMIT ?`;
    params.push(limit + 1);

    const rows = await db.getAllAsync<JournalUnionRow>(sql, params);
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map(mapRow);
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;

    return { items, nextCursor };
  },

  /** Усі записи щоденника по одній книзі, найновіші зверху — для вкладки "Щоденник" на
   * екрані книги (п.9 ТЗ). Один запит з великим limit замість окремої непагінованої SQL —
   * щоб не дублювати union-логіку `listPage`. */
  async listByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<JournalEntry[]> {
    const { items } = await JournalRepository.listPage(db, { userBookId, limit: 5000 });
    return items;
  },

  /** Для екрана «Спогад про книгу» — вибір карток за принципом "обране спершу" (п.16 ТЗ). */
  async listFavoritesByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<JournalEntry[]> {
    const { items } = await JournalRepository.listPage(db, { userBookId, favoriteOnly: true, limit: 5000 });
    return items;
  },

  /** ТЗ Фази 11 («ПОВЕРНУТИСЯ ПІЗНІШЕ») — записи книги, позначені «Повернутися пізніше». Той
   * самий "малий список по одній книзі" підхід, що й `listFavoritesByUserBookId` вище —
   * використовується і для «Ти залишив N записів...» на екрані підсумку читання
   * (`app/completion/[workId].tsx`), і для секції «Повернутися до цих думок» на Book Memory
   * screen (`app/memory/[workId].tsx`). */
  async listRevisitLaterByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<JournalEntry[]> {
    const { items } = await JournalRepository.listPage(db, { userBookId, revisitLaterOnly: true, limit: 5000 });
    return items;
  },

  /** Записи, додані під час конкретної сесії читання (Фаза 3 — "щоденник" просто в екрані
   * активної сесії). Кількість завжди невелика (одна сесія), тому без пагінації. */
  async listBySessionId(db: SQLiteDatabase, sessionId: string): Promise<JournalEntry[]> {
    const { items } = await JournalRepository.listPage(db, { sessionId, limit: 500 });
    return items;
  },

  /** Лічильник для бейджа вкладки "Щоденник" на екрані книги — два дешевих `COUNT(*)`
   * замість завантаження й підрахунку в JS повних рядків. */
  async countByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<number> {
    const [noteRow, quoteRow] = await Promise.all([
      db.getFirstAsync<{ c: number }>(
        `SELECT COUNT(*) AS c FROM note WHERE user_book_id = ? AND deleted_at IS NULL`,
        [userBookId],
      ),
      db.getFirstAsync<{ c: number }>(
        `SELECT COUNT(*) AS c FROM quote WHERE user_book_id = ? AND deleted_at IS NULL`,
        [userBookId],
      ),
    ]);
    return (noteRow?.c ?? 0) + (quoteRow?.c ?? 0);
  },

  /** Загальний лічильник по всіх книгах — для картки-входу "Мій щоденник" на Home і для
   * статистики на самому екрані щоденника (Фаза 4). */
  async countAll(db: SQLiteDatabase): Promise<{ total: number; favorites: number }> {
    // SQLite-специфіка: `SUM()` над нульовою кількістю рядків повертає `NULL`, не `0`.
    const [noteRow, quoteRow] = await Promise.all([
      db.getFirstAsync<{ c: number; fav: number | null }>(
        `SELECT COUNT(*) AS c, SUM(is_favorite) AS fav FROM note WHERE deleted_at IS NULL`,
      ),
      db.getFirstAsync<{ c: number; fav: number | null }>(
        `SELECT COUNT(*) AS c, SUM(is_favorite) AS fav FROM quote WHERE deleted_at IS NULL`,
      ),
    ]);
    return {
      total: (noteRow?.c ?? 0) + (quoteRow?.c ?? 0),
      favorites: (noteRow?.fav ?? 0) + (quoteRow?.fav ?? 0),
    };
  },

  /**
   * Сторінка глобальної стрічки "Мій щоденник" (Фаза 4) — той самий union-підхід, що й
   * `listPage`, але з JOIN до `user_book`→`edition`→`work`, щоб кожен запис ніс назву й
   * обкладинку своєї книги (записи різних книг ідуть впереміш, на відміну від "щоденника
   * книги"/"записів сесії", де книга вже відома з контексту екрана). Навмисно окремий метод,
   * а не прапорець на `listPage` — інша проєкція колонок, простіше тримати окремо, ніж
   * розгалужувати один запит.
   *
   * Приєднання йде через `user_book.edition_id` для ОБОХ гілок (навіть для `quote`, у якої є
   * власний `edition_id`) — навмисно: у стрічці показуємо ту обкладинку/видання, яку
   * користувач зараз трекає для цієї книги, а не те конкретне видання, з якого колись узято
   * цитату (та сама обкладинка, що й скрізь у Бібліотеці/Home).
   *
   * ФАЗА 7 (JOURNAL SEARCH) — рішення щодо FTS5, як вимагає ТЗ ("спочатку перевір розмір
   * поточної моделі даних… не вводь FTS тільки тому, що він існує"): `query`/`reaction`/
   * `workId`/`dateFrom`/`dateTo` нижче реалізовані як звичайні `WHERE … LIKE`/`=`/`>=`/`<=`
   * без FTS5-таблиці. Причини: (1) `LIKE '%…%'` з провідним wildcard ніколи не може
   * використати B-tree індекс НАВІТЬ якби такий індекс існував — тобто звичайний `CREATE
   * INDEX` тут не допоміг би, і єдина реальна альтернатива LIKE — саме FTS5, а не "LIKE без
   * індексу" проти "LIKE з індексом"; (2) FTS5 у expo-sqlite вимагав би: окремої віртуальної
   * таблиці, тригерів синхронізації з `note`/`quote` при кожній вставці/зміні/soft-delete,
   * migration-плану (`docs/DATABASE.md`), і — найважливіше — підтвердження, що конкретний
   * SQLite-білд у поточній версії `expo-sqlite` (SDK 57) стабільно вмикає розширення FTS5 на
   * ОБОХ платформах (iOS/Android), що не перевірено в цьому середовищі (немає локального
   * `device_bash`/emulator для built-перевірки); (3) головне — продуктивність: повний
   * table scan `LIKE` по TEXT-колонці в SQLite — операція в пам'яті на вже відкритій БД,
   * практично завжди <50мс навіть на 10 000+ рядків на сучасному мобільному апаратному
   * забезпеченні (типовий порядок величини для порівнянних записів: соті частки секунди на
   * рядок), тобто ціль ТЗ "10 000+ journal entries без неприйнятної затримки" досяжна звичайним
   * `LIKE` без додаткової складності. Якщо реальний власник продукту повідомить про відчутне
   * гальмування пошуку на своєму фактичному обсязі даних — це буде конкретний сигнал
   * переглянути рішення й підготувати FTS5 migration plan окремо, а не вводити його зараз
   * профілактично.
   */
  async listFeedPage(
    db: SQLiteDatabase,
    options: Omit<JournalListPageOptions, 'userBookId' | 'sessionId'> = {},
  ): Promise<{ items: JournalFeedEntry[]; nextCursor: JournalEntryCursor | null }> {
    const limit = options.limit ?? 50;
    const favoriteOnly = options.favoriteOnly ?? false;
    const revisitLaterOnly = options.revisitLaterOnly ?? false;
    const types = options.types;
    const noteTypes = types ? types.filter((t): t is NoteType => t !== 'quote') : null;
    const includeNotesBranch = types ? noteTypes !== null && noteTypes.length > 0 : true;
    const includeQuotesBranch = types ? types.includes('quote') : true;

    const branches: string[] = [];
    const params: (string | number | null)[] = [];

    const bookJoin = `
      JOIN user_book ub ON ub.id = t.user_book_id
      JOIN edition e ON e.id = ub.edition_id
      JOIN work w ON w.id = e.work_id`;

    // LEFT JOIN note_category — резолвить назву власної категорії користувача прямо в SQL
    // (докладніше — коментар біля `categoryLabel` у `src/types/journalEntry.ts`): стрічка
    // змішує записи багатьох книг одразу, тож клієнтський резолв означав би N+1 запит на
    // категорії кожної книги окремо.
    const categoryJoin = `LEFT JOIN note_category nc ON nc.id = t.category_id`;

    if (includeNotesBranch) {
      let sql = `SELECT t.id AS id, 'note' AS kind, t.user_book_id AS user_book_id, NULL AS edition_id,
                    t.session_id AS session_id, t.page AS page, t.progress_percent AS progress_percent,
                    t.type AS type, t.category_id AS category_id, t.text AS text, NULL AS comment, t.tags AS tags,
                    t.is_favorite AS is_favorite, t.revisit_later AS revisit_later, t.reaction AS reaction,
                    t.created_at AS created_at, t.updated_at AS updated_at,
                    w.id AS work_id, w.title AS work_title, e.cover_url AS cover_url,
                    w.cover_fallback_color AS cover_fallback_color, nc.label AS category_label
                  FROM note t${bookJoin} ${categoryJoin}
                  WHERE t.deleted_at IS NULL AND ub.deleted_at IS NULL AND w.deleted_at IS NULL AND e.deleted_at IS NULL`;
      if (favoriteOnly) sql += ' AND t.is_favorite = 1';
      if (revisitLaterOnly) sql += ' AND t.revisit_later = 1';
      if (noteTypes && noteTypes.length > 0) {
        sql += ` AND ${buildNoteTypeCondition(noteTypes, params, 't.type', 't.category_id')}`;
      }
      if (options.reaction) {
        sql += ' AND t.reaction = ?';
        params.push(options.reaction);
      }
      if (options.query) {
        sql += ' AND t.text LIKE ?';
        params.push(`%${options.query.trim()}%`);
      }
      if (options.workId) {
        sql += ' AND w.id = ?';
        params.push(options.workId);
      }
      if (options.dateFrom) {
        sql += ' AND t.created_at >= ?';
        params.push(options.dateFrom);
      }
      if (options.dateTo) {
        sql += ' AND t.created_at <= ?';
        params.push(options.dateTo);
      }
      if (options.cursor) {
        sql += ' AND (t.created_at < ? OR (t.created_at = ? AND t.id < ?))';
        params.push(options.cursor.createdAt, options.cursor.createdAt, options.cursor.id);
      }
      branches.push(sql);
    }

    if (includeQuotesBranch) {
      let sql = `SELECT t.id AS id, 'quote' AS kind, t.user_book_id AS user_book_id, t.edition_id AS edition_id,
                    t.session_id AS session_id, t.page AS page, t.progress_percent AS progress_percent,
                    'quote' AS type, NULL AS category_id, t.text AS text, t.comment AS comment, t.tags AS tags,
                    t.is_favorite AS is_favorite, t.revisit_later AS revisit_later, t.reaction AS reaction,
                    t.created_at AS created_at, t.updated_at AS updated_at,
                    w.id AS work_id, w.title AS work_title, e.cover_url AS cover_url,
                    w.cover_fallback_color AS cover_fallback_color, NULL AS category_label
                  FROM quote t${bookJoin}
                  WHERE t.deleted_at IS NULL AND ub.deleted_at IS NULL AND w.deleted_at IS NULL AND e.deleted_at IS NULL`;
      if (favoriteOnly) sql += ' AND t.is_favorite = 1';
      if (revisitLaterOnly) sql += ' AND t.revisit_later = 1';
      if (options.reaction) {
        sql += ' AND t.reaction = ?';
        params.push(options.reaction);
      }
      if (options.query) {
        const pattern = `%${options.query.trim()}%`;
        sql += ' AND (t.text LIKE ? OR t.comment LIKE ?)';
        params.push(pattern, pattern);
      }
      if (options.workId) {
        sql += ' AND w.id = ?';
        params.push(options.workId);
      }
      if (options.dateFrom) {
        sql += ' AND t.created_at >= ?';
        params.push(options.dateFrom);
      }
      if (options.dateTo) {
        sql += ' AND t.created_at <= ?';
        params.push(options.dateTo);
      }
      if (options.cursor) {
        sql += ' AND (t.created_at < ? OR (t.created_at = ? AND t.id < ?))';
        params.push(options.cursor.createdAt, options.cursor.createdAt, options.cursor.id);
      }
      branches.push(sql);
    }

    if (branches.length === 0) return { items: [], nextCursor: null };

    const sql = `${branches.join(' UNION ALL ')} ORDER BY created_at DESC, id DESC LIMIT ?`;
    params.push(limit + 1);

    const rows = await db.getAllAsync<JournalUnionRow & FeedJoinRow>(sql, params);
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map(mapFeedRow);
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? { createdAt: last.createdAt, id: last.id } : null;

    return { items, nextCursor };
  },

  /**
   * Текстовий пошук по щоденнику для Global Personal Search (POLYTSIA V1.5, Фаза 6) — LIKE по
   * `text` (і, для цитат, ще й по `comment`), окремо notes/quotes: Personal Search групує їх
   * як два різні розділи результатів — "Щоденник" і "Цитати" (ТЗ Фази 6). Той самий
   * `bookJoin`/`categoryJoin`, що й `listFeedPage` вище, — щоб рядок результату ніс назву й
   * обкладинку книги без окремого N+1 запиту.
   *
   * Навмисно ОКРЕМИЙ метод, не розширення `listFeedPage`: інша вісь фільтрації (текст, не
   * тип/обране/курсор), і обидві гілки (note+quote) тут завжди потрібні одночасно, на відміну
   * від `listFeedPage`, де набір гілок залежить від `options.types`.
   *
   * `LIKE '%…%'` без FTS5 — свідомо мінімальна реалізація для Фази 6 (проста глобальна
   * знахідка, невеликий `limit`). Повний аналіз масштабованості для 10 000+ записів (чи
   * виправдана FTS5-міграція) — явно відкладений на Фазу 7 (JOURNAL SEARCH), яка ТЗ вимагає
   * спершу перевірити розмір поточної моделі даних, перш ніж вводити FTS.
   */
  async searchFeed(
    db: SQLiteDatabase,
    query: string,
    limit = 10,
  ): Promise<{ notes: JournalFeedEntry[]; quotes: JournalFeedEntry[] }> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return { notes: [], quotes: [] };
    const pattern = `%${trimmed}%`;

    const bookJoin = `
      JOIN user_book ub ON ub.id = t.user_book_id
      JOIN edition e ON e.id = ub.edition_id
      JOIN work w ON w.id = e.work_id`;
    const categoryJoin = `LEFT JOIN note_category nc ON nc.id = t.category_id`;

    const [noteRows, quoteRows] = await Promise.all([
      db.getAllAsync<JournalUnionRow & FeedJoinRow>(
        `SELECT t.id AS id, 'note' AS kind, t.user_book_id AS user_book_id, NULL AS edition_id,
                t.session_id AS session_id, t.page AS page, t.progress_percent AS progress_percent,
                t.type AS type, t.category_id AS category_id, t.text AS text, NULL AS comment, t.tags AS tags,
                t.is_favorite AS is_favorite, t.revisit_later AS revisit_later, t.reaction AS reaction,
                t.created_at AS created_at, t.updated_at AS updated_at,
                w.id AS work_id, w.title AS work_title, e.cover_url AS cover_url,
                w.cover_fallback_color AS cover_fallback_color, nc.label AS category_label
         FROM note t${bookJoin} ${categoryJoin}
         WHERE t.deleted_at IS NULL AND ub.deleted_at IS NULL AND w.deleted_at IS NULL AND e.deleted_at IS NULL
           AND t.text LIKE ?
         ORDER BY t.created_at DESC
         LIMIT ?`,
        [pattern, limit],
      ),
      db.getAllAsync<JournalUnionRow & FeedJoinRow>(
        `SELECT t.id AS id, 'quote' AS kind, t.user_book_id AS user_book_id, t.edition_id AS edition_id,
                t.session_id AS session_id, t.page AS page, t.progress_percent AS progress_percent,
                'quote' AS type, NULL AS category_id, t.text AS text, t.comment AS comment, t.tags AS tags,
                t.is_favorite AS is_favorite, t.revisit_later AS revisit_later, t.reaction AS reaction,
                t.created_at AS created_at, t.updated_at AS updated_at,
                w.id AS work_id, w.title AS work_title, e.cover_url AS cover_url,
                w.cover_fallback_color AS cover_fallback_color, NULL AS category_label
         FROM quote t${bookJoin}
         WHERE t.deleted_at IS NULL AND ub.deleted_at IS NULL AND w.deleted_at IS NULL AND e.deleted_at IS NULL
           AND (t.text LIKE ? OR t.comment LIKE ?)
         ORDER BY t.created_at DESC
         LIMIT ?`,
        [pattern, pattern, limit],
      ),
    ]);

    return { notes: noteRows.map(mapFeedRow), quotes: quoteRows.map(mapFeedRow) };
  },

  /**
   * Останній запис щоденника (нотатка чи цитата) на книгу, пакетно для списку книг (ТЗ Фази 8
   * — READING CONTINUITY, картка "Зараз читаєш" на Home: "Остання думка: …", максимум 1 запис
   * на книгу). Той самий union `note`+`quote`, що й `listPage`, звужений до `user_book_id IN
   * (…)`, але БЕЗ `bookJoin`/`categoryJoin` — виклик уже знає, про яку книгу йдеться (на
   * відміну від `listFeedPage`, де назва/обкладинка книги потрібні для змішаної стрічки). Той
   * самий "перше входження на групу" підхід у JS, що й
   * `ReadingSessionRepository.listLastCompletedByUserBookIds`.
   */
  async listLatestByUserBookIds(db: SQLiteDatabase, userBookIds: string[]): Promise<Map<string, JournalEntry>> {
    const result = new Map<string, JournalEntry>();
    if (userBookIds.length === 0) return result;

    const placeholders = userBookIds.map(() => '?').join(',');
    const sql = `
      SELECT id, 'note' AS kind, user_book_id, NULL AS edition_id, session_id, page,
             progress_percent, type, category_id, text, NULL AS comment, tags, is_favorite, revisit_later, reaction,
             created_at, updated_at
        FROM note WHERE deleted_at IS NULL AND user_book_id IN (${placeholders})
      UNION ALL
      SELECT id, 'quote' AS kind, user_book_id, edition_id, session_id, page,
             progress_percent, 'quote' AS type, NULL AS category_id, text, comment, tags,
             is_favorite, revisit_later, reaction, created_at, updated_at
        FROM quote WHERE deleted_at IS NULL AND user_book_id IN (${placeholders})
      ORDER BY created_at DESC`;

    const rows = await db.getAllAsync<JournalUnionRow>(sql, [...userBookIds, ...userBookIds]);
    for (const row of rows) {
      if (!result.has(row.user_book_id)) result.set(row.user_book_id, mapRow(row));
    }
    return result;
  },

  /**
   * Кількість записів по кожній реакції, по всій бібліотеці (Milestone 11, доповнення —
   * агрегована статистика "N смішних моментів..." на екрані щоденника). `GROUP BY reaction`
   * над union `note`+`quote`, лише непорожні (`reaction IS NOT NULL`). Ключі результату — сирі
   * рядки з БД (колонка без CHECK, `src/design/reactions.ts`); виклик сам відповідає за
   * `isReactionId`-фільтрацію нерозпізнаних значень при показі.
   *
   * ВИПРАВЛЕННЯ (незалежний аудит після Milestone 11): раніше тут рахувались УСІ `note`/
   * `quote` із `reaction`, без приєднання до `user_book` — на відміну від `listFeedPage`
   * вище, яка явно виключає записи книг, прибраних з бібліотеки (`ub.deleted_at IS NULL`).
   * `UserBookRepository.remove` лише м'яко прибирає сам `user_book`, нотатки/цитати НІКОЛИ не
   * видаляються разом з ним (це вже реальні думки користувача, не частина бібліотеки) — тож
   * без цього приєднання лічильник тут і далі рахував реакцію запису книги, яку користувач уже
   * прибрав з бібліотеки, хоча сам запис більше ніколи не з'явиться у стрічці нижче (яка саме
   * цей фільтр і застосовує) — цифри вгорі екрана суперечили списку під ними, той самий клас
   * "суперечливих цифр", що й аудит М11 п.6.2. Приєднання — той самий `bookJoin`, що й у
   * `listFeedPage` (через `user_book.edition_id`, той самий підхід, включно з `quote`).
   */
  async countsByReaction(db: SQLiteDatabase): Promise<Record<string, number>> {
    const rows = await db.getAllAsync<{ reaction: string; c: number }>(
      `SELECT reaction, COUNT(*) AS c FROM (
         SELECT t.reaction AS reaction
           FROM note t
           JOIN user_book ub ON ub.id = t.user_book_id
           JOIN edition e ON e.id = ub.edition_id
           JOIN work w ON w.id = e.work_id
          WHERE t.deleted_at IS NULL AND t.reaction IS NOT NULL
            AND ub.deleted_at IS NULL AND w.deleted_at IS NULL AND e.deleted_at IS NULL
         UNION ALL
         SELECT t.reaction AS reaction
           FROM quote t
           JOIN user_book ub ON ub.id = t.user_book_id
           JOIN edition e ON e.id = ub.edition_id
           JOIN work w ON w.id = e.work_id
          WHERE t.deleted_at IS NULL AND t.reaction IS NOT NULL
            AND ub.deleted_at IS NULL AND w.deleted_at IS NULL AND e.deleted_at IS NULL
       ) GROUP BY reaction`,
    );
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.reaction] = row.c;
    return counts;
  },
};
