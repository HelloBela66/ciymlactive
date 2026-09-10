import type { SQLiteDatabase } from 'expo-sqlite';
import type { ActivityEvent, ActivityEventType } from '@/types/activityEvent';

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

/** Спільні для всіх восьми гілок колонки книги (назва/обкладинка) — той самий
 * `user_book → edition → work` JOIN, що й `JournalRepository.listFeedPage`. */
const BOOK_JOIN = `JOIN edition e ON e.id = ub.edition_id JOIN work w ON w.id = e.work_id`;
const BOOK_COLUMNS = `ub.id AS user_book_id, w.id AS work_id, w.title AS work_title,
  e.cover_url AS cover_url, w.cover_fallback_color AS cover_fallback_color`;
const BOOK_ALIVE = `ub.deleted_at IS NULL AND w.deleted_at IS NULL AND e.deleted_at IS NULL`;

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
      `
      SELECT 'session_completed' AS type, rs.id AS id, rs.ended_at AS occurred_at, ${BOOK_COLUMNS},
             rs.duration_seconds AS duration_seconds, NULL AS rating_value, NULL AS entry_text, NULL AS shelf_name
      FROM reading_session rs
      JOIN user_book ub ON ub.id = rs.user_book_id
      ${BOOK_JOIN}
      WHERE rs.ended_at IS NOT NULL AND rs.deleted_at IS NULL AND ${BOOK_ALIVE}

      UNION ALL

      SELECT 'book_started', ub.id || ':started', ub.started_at, ${BOOK_COLUMNS},
             NULL, NULL, NULL, NULL
      FROM user_book ub
      ${BOOK_JOIN}
      WHERE ub.started_at IS NOT NULL AND ${BOOK_ALIVE}

      UNION ALL

      SELECT 'book_finished', ub.id || ':finished', ub.finished_at, ${BOOK_COLUMNS},
             NULL, NULL, NULL, NULL
      FROM user_book ub
      ${BOOK_JOIN}
      WHERE ub.finished_at IS NOT NULL AND ${BOOK_ALIVE}

      UNION ALL

      SELECT 'book_added', ub.id || ':added', ub.added_at, ${BOOK_COLUMNS},
             NULL, NULL, NULL, NULL
      FROM user_book ub
      ${BOOK_JOIN}
      WHERE ${BOOK_ALIVE}

      UNION ALL

      SELECT 'rating_added', r.id, r.created_at, ${BOOK_COLUMNS},
             NULL, r.value, NULL, NULL
      FROM rating r
      JOIN user_book ub ON ub.id = r.user_book_id
      ${BOOK_JOIN}
      WHERE ${BOOK_ALIVE}

      UNION ALL

      SELECT 'journal_entry', n.id, n.created_at, ${BOOK_COLUMNS},
             NULL, NULL, n.text, NULL
      FROM note n
      JOIN user_book ub ON ub.id = n.user_book_id
      ${BOOK_JOIN}
      WHERE n.deleted_at IS NULL AND ${BOOK_ALIVE}

      UNION ALL

      SELECT 'quote', q.id, q.created_at, ${BOOK_COLUMNS},
             NULL, NULL, q.text, NULL
      FROM quote q
      JOIN user_book ub ON ub.id = q.user_book_id
      ${BOOK_JOIN}
      WHERE q.deleted_at IS NULL AND ${BOOK_ALIVE}

      UNION ALL

      SELECT 'shelf_addition', sb.shelf_id || ':' || sb.user_book_id, sb.added_at, ${BOOK_COLUMNS},
             NULL, NULL, NULL, s.name
      FROM shelf_book sb
      JOIN shelf s ON s.id = sb.shelf_id
      JOIN user_book ub ON ub.id = sb.user_book_id
      ${BOOK_JOIN}
      WHERE ${BOOK_ALIVE}

      ORDER BY occurred_at DESC
      LIMIT ?
      `,
      [limit],
    );
    return rows.map(mapRow);
  },
};
