import type { SQLiteDatabase } from 'expo-sqlite';
import { isSpoilerHidden } from '@/lib/spoilerSafe';
import type { ActivityEvent, ActivityEventType } from '@/types/activityEvent';
import type { UserBookStatus } from '@/types/userBook';

interface ActivityEventRow {
  type: ActivityEventType;
  id: string;
  occurred_at: string;
  user_book_id: string;
  work_id: string;
  work_title: string;
  cover_url: string | null;
  cover_fallback_color: string | null;
  duration_seconds: number | null;
  rating_value: number | null;
  entry_text: string | null;
  shelf_name: string | null;
  /** ТЗ Фази 3 V1.6.1 — лише для `journal_entry`/`quote` (решта шести гілок передають `NULL`,
   * докладніше коментар біля `isActivityRowSpoilerHidden`). */
  entry_page: number | null;
  ub_status: string;
  ub_spoiler_safe_enabled: number;
  ub_current_page: number;
  edition_page_count: number | null;
}

function mapRow(row: ActivityEventRow): ActivityEvent {
  return {
    id: row.id,
    type: row.type,
    occurredAt: row.occurred_at,
    userBookId: row.user_book_id,
    workId: row.work_id,
    workTitle: row.work_title,
    coverUrl: row.cover_url,
    coverFallbackColor: row.cover_fallback_color,
    durationSeconds: row.duration_seconds,
    ratingValue: row.rating_value,
    entryText: row.entry_text,
    shelfName: row.shelf_name,
  };
}

/**
 * ТЗ Фази 3 V1.6.1 (аудит V1.6 §42 — Activity History показувала `entryText` без жодної
 * spoiler-safe перевірки) — застосовується лише до `journal_entry`/`quote` (єдині два з восьми
 * типів подій, що несуть текст запису щоденника; решта — дати/тривалості/оцінки/назви полиць,
 * самі по собі не спойлер). Той самий централізований `isSpoilerHidden`
 * (`src/lib/spoilerSafe.ts`), що й `JournalRepository`/однокнижні екрани.
 */
function isActivityRowSpoilerHidden(row: ActivityEventRow): boolean {
  if (row.type !== 'journal_entry' && row.type !== 'quote') return false;
  return isSpoilerHidden(
    { page: row.entry_page, progressPercent: null },
    {
      status: row.ub_status as UserBookStatus,
      spoilerSafeEnabled: row.ub_spoiler_safe_enabled === 1,
      currentPage: row.ub_current_page,
      pageCount: row.edition_page_count,
    },
  );
}

/** Спільні для всіх восьми гілок колонки книги (назва/обкладинка) — той самий
 * `user_book → edition → work` JOIN, що й `JournalRepository.listFeedPage`. */
const BOOK_JOIN = `JOIN edition e ON e.id = ub.edition_id JOIN work w ON w.id = e.work_id`;
const BOOK_COLUMNS = `ub.id AS user_book_id, w.id AS work_id, w.title AS work_title,
  e.cover_url AS cover_url, w.cover_fallback_color AS cover_fallback_color`;
const BOOK_ALIVE = `ub.deleted_at IS NULL AND w.deleted_at IS NULL AND e.deleted_at IS NULL`;
/** ТЗ Фази 3 V1.6.1 — той самий spoiler-контекст книги, що й `edition_page_count`/`ub_status`
 * колонки в `JournalRepository`, приєднаний тим самим уже наявним `BOOK_JOIN` без жодного
 * додаткового запиту. Усі вісім гілок мають нести однакову кількість колонок (вимога SQL
 * `UNION ALL`), тож ці чотири колонки в кінці SELECT списку — завжди присутні. */
const SPOILER_CONTEXT_COLUMNS = `ub.status AS ub_status, ub.spoiler_safe_enabled AS ub_spoiler_safe_enabled,
  ub.current_page AS ub_current_page, e.page_count AS edition_page_count`;

/**
 * Восьмигіллевий `UNION ALL` (без `ORDER BY`/`LIMIT`/фільтра діапазону — ті додаються навколо
 * ЦІЄЇ константи двома різними способами нижче, `listRecent`/`listBetween`) — єдине джерело
 * правди для "усі вісім типів подій ТЗ", щоб два методи не тримали дві копії того самого SQL,
 * які могли б розійтись (наприклад, якщо колись з'явиться дев'ятий тип події). Кожна гілка й
 * так уже має власний `WHERE` (живість книги/soft-delete джерела) — обидва методи-обгортки
 * додають ЛИШЕ те, що відрізняє їх: `ORDER BY`+`LIMIT` для стрічки, чи `WHERE occurred_at
 * BETWEEN` для діапазону.
 */
const ACTIVITY_UNION_SQL = `
      SELECT 'session_completed' AS type, rs.id AS id, rs.ended_at AS occurred_at, ${BOOK_COLUMNS},
             rs.duration_seconds AS duration_seconds, NULL AS rating_value, NULL AS entry_text, NULL AS shelf_name,
             NULL AS entry_page, ${SPOILER_CONTEXT_COLUMNS}
      FROM reading_session rs
      JOIN user_book ub ON ub.id = rs.user_book_id
      ${BOOK_JOIN}
      WHERE rs.ended_at IS NOT NULL AND rs.deleted_at IS NULL AND ${BOOK_ALIVE}

      UNION ALL

      SELECT 'book_started', ub.id || ':started', ub.started_at, ${BOOK_COLUMNS},
             NULL, NULL, NULL, NULL,
             NULL, ${SPOILER_CONTEXT_COLUMNS}
      FROM user_book ub
      ${BOOK_JOIN}
      WHERE ub.started_at IS NOT NULL AND ${BOOK_ALIVE}

      UNION ALL

      SELECT 'book_finished', ub.id || ':finished', ub.finished_at, ${BOOK_COLUMNS},
             NULL, NULL, NULL, NULL,
             NULL, ${SPOILER_CONTEXT_COLUMNS}
      FROM user_book ub
      ${BOOK_JOIN}
      WHERE ub.finished_at IS NOT NULL AND ${BOOK_ALIVE}

      UNION ALL

      SELECT 'book_added', ub.id || ':added', ub.added_at, ${BOOK_COLUMNS},
             NULL, NULL, NULL, NULL,
             NULL, ${SPOILER_CONTEXT_COLUMNS}
      FROM user_book ub
      ${BOOK_JOIN}
      WHERE ${BOOK_ALIVE}

      UNION ALL

      SELECT 'rating_added', r.id, r.created_at, ${BOOK_COLUMNS},
             NULL, r.value, NULL, NULL,
             NULL, ${SPOILER_CONTEXT_COLUMNS}
      FROM rating r
      JOIN user_book ub ON ub.id = r.user_book_id
      ${BOOK_JOIN}
      WHERE ${BOOK_ALIVE}

      UNION ALL

      SELECT 'journal_entry', n.id, n.created_at, ${BOOK_COLUMNS},
             NULL, NULL, n.text, NULL,
             n.page AS entry_page, ${SPOILER_CONTEXT_COLUMNS}
      FROM note n
      JOIN user_book ub ON ub.id = n.user_book_id
      ${BOOK_JOIN}
      WHERE n.deleted_at IS NULL AND ${BOOK_ALIVE}

      UNION ALL

      SELECT 'quote', q.id, q.created_at, ${BOOK_COLUMNS},
             NULL, NULL, q.text, NULL,
             q.page AS entry_page, ${SPOILER_CONTEXT_COLUMNS}
      FROM quote q
      JOIN user_book ub ON ub.id = q.user_book_id
      ${BOOK_JOIN}
      WHERE q.deleted_at IS NULL AND ${BOOK_ALIVE}

      UNION ALL

      SELECT 'shelf_addition', sb.shelf_id || ':' || sb.user_book_id, sb.added_at, ${BOOK_COLUMNS},
             NULL, NULL, NULL, s.name,
             NULL, ${SPOILER_CONTEXT_COLUMNS}
      FROM shelf_book sb
      JOIN shelf s ON s.id = sb.shelf_id
      JOIN user_book ub ON ub.id = sb.user_book_id
      ${BOOK_JOIN}
      WHERE ${BOOK_ALIVE}
`;

/**
 * ТЗ Фази 12 (READING ACTIVITY HISTORY) — «Якщо timeline можна derived з існуючих timestamped
 * tables — використовуй derived model»: саме це тут і зроблено. Жодної нової таблиці, жодного
 * write-шляху — один SQL-запит, що об'єднує (UNION ALL) вісім джерел, кожне вже своєю власною
 * timestamped-колонкою (reading_session.ended_at, user_book.started_at/finished_at/added_at,
 * rating.created_at, note.created_at, quote.created_at, shelf_book.added_at), сортує спільно за
 * часом і повертає єдину, однорідну стрічку подій. Це read-only: тут немає жодного методу
 * запису — сама природа "похідної" моделі виключає write-шлях (кожна подія й так уже записана
 * своїм "рідним" репозиторієм).
 */
export const ActivityHistoryRepository = {
  /** `limit` застосовується ПІСЛЯ спільного сортування за `occurred_at DESC` (не по
   * `limit` на кожне з восьми джерел окремо) — інакше рідкісний тип події (наприклад,
   * `rating_added`) міг би витіснити частину стрічки, хоча насправді найновіші події
   * належать іншим типам. За замовчуванням 300 — з запасом на "нескінченний скрол" у
   * майбутньому (ТЗ не вимагає пагінації для Фази 12: "Це read-only history", без згадки
   * про підвантаження), і достатньо для будь-якої реалістичної активності одного користувача
   * за розумний період перегляду. */
  async listRecent(db: SQLiteDatabase, limit = 300): Promise<ActivityEvent[]> {
    const rows = await db.getAllAsync<ActivityEventRow>(
      `SELECT * FROM (${ACTIVITY_UNION_SQL}) ORDER BY occurred_at DESC LIMIT ?`,
      [limit],
    );
    // ТЗ Фази 3 V1.6.1 — фільтр ПІСЛЯ спільного сортування/LIMIT (`limit` тут — "скільки
    // найновіших подій узагалі", не "скільки видимих" — той самий свідомий вибір, що й лічильник
    // на Book Details: приховані події й далі існують і стануть видимі пізніше, стрічка просто
    // трохи коротша за `limit`, доки читання не дожене приховані записи).
    return rows.filter((row) => !isActivityRowSpoilerHidden(row)).map(mapRow);
  },

  /**
   * Календар 2.0 (Фаза 19, `docs/CALENDAR_2_0.md`) — той самий 8-branch `UNION ALL`/spoiler-safe
   * фільтр, що й `listRecent`, але замість `LIMIT` — фільтр за діапазоном `[startIso, endIso)`
   * (та сама межова умова, що й `ReadingSessionRepository.listStartedBetween`). Одним запитом
   * покриває ОБИДВІ потреби Календаря без N+1: місячна агрегація (підсумок місяця — скільки книг
   * почато/закінчено/скільки нотаток-цитат) і деталі дня (нотатки/цитати/оцінки/полиці/старт-
   * фініш книги того дня) — `session_completed` тут теж присутній, але деталі дня свідомо й далі
   * читають сесії через `ReadingSessionRepository.listStartedBetween` (уже мала книжкові деталі
   * через `UserBookRepository`, а не лише "назва книги" з `BOOK_COLUMNS`), тож для сесій ця подія
   * просто ігнорується на виклику — дублювання джерела нешкідливе (той самий рядок, просто
   * менше полів), а не додатковий запит.
   */
  async listBetween(db: SQLiteDatabase, startIso: string, endIso: string): Promise<ActivityEvent[]> {
    const rows = await db.getAllAsync<ActivityEventRow>(
      `SELECT * FROM (${ACTIVITY_UNION_SQL}) WHERE occurred_at >= ? AND occurred_at < ? ORDER BY occurred_at ASC`,
      [startIso, endIso],
    );
    return rows.filter((row) => !isActivityRowSpoilerHidden(row)).map(mapRow);
  },
};
