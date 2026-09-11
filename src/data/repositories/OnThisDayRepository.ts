import type { SQLiteDatabase } from 'expo-sqlite';
import type { OnThisDaySource } from '@/types/onThisDay';

export interface OnThisDayRawEvent {
  source: OnThisDaySource;
  id: string;
  occurredAt: string;
  userBookId: string;
  workId: string;
  workTitle: string;
  coverUrl: string | null;
  coverFallbackColor: string | null;
  sessionId: string | null;
  startPage: number | null;
  endPage: number | null;
  durationSeconds: number | null;
  entryId: string | null;
  entryKind: 'note' | 'quote' | null;
  entryType: string | null;
  entryText: string | null;
  entryPage: number | null;
  isFavorite: boolean;
}

interface OnThisDayRawRow {
  source: OnThisDaySource;
  id: string;
  occurred_at: string;
  user_book_id: string;
  work_id: string;
  work_title: string;
  cover_url: string | null;
  cover_fallback_color: string | null;
  session_id: string | null;
  start_page: number | null;
  end_page: number | null;
  duration_seconds: number | null;
  entry_id: string | null;
  entry_kind: 'note' | 'quote' | null;
  entry_type: string | null;
  entry_text: string | null;
  entry_page: number | null;
  is_favorite: number | null;
}

function mapRow(row: OnThisDayRawRow): OnThisDayRawEvent {
  return {
    source: row.source,
    id: row.id,
    occurredAt: row.occurred_at,
    userBookId: row.user_book_id,
    workId: row.work_id,
    workTitle: row.work_title,
    coverUrl: row.cover_url,
    coverFallbackColor: row.cover_fallback_color,
    sessionId: row.session_id,
    startPage: row.start_page,
    endPage: row.end_page,
    durationSeconds: row.duration_seconds,
    entryId: row.entry_id,
    entryKind: row.entry_kind,
    entryType: row.entry_type,
    entryText: row.entry_text,
    entryPage: row.entry_page,
    isFavorite: row.is_favorite === 1,
  };
}

/** Той самий `user_book → edition → work` JOIN/колонки/"жива"-умова, що й
 * `ActivityHistoryRepository` (навмисне дублювання — обидва похідні read-only репозиторії, і
 * кожен лишається читабельним самостійно, без прихованої залежності одне від одного). */
const BOOK_JOIN = `JOIN edition e ON e.id = ub.edition_id JOIN work w ON w.id = e.work_id`;
const BOOK_COLUMNS = `ub.id AS user_book_id, w.id AS work_id, w.title AS work_title,
  e.cover_url AS cover_url, w.cover_fallback_color AS cover_fallback_color`;
const BOOK_ALIVE = `ub.deleted_at IS NULL AND w.deleted_at IS NULL AND e.deleted_at IS NULL`;

/**
 * POLYTSIA V1.6, Фаза 3 («Цей день у твоєму читанні») — похідна модель, той самий підхід, що
 * й `ActivityHistoryRepository.listRecent` (один UNION ALL SQL-запит через кілька вже
 * timestamped-таблиць, без нової event-sourcing-таблиці, п.20 ТЗ). Відмінність від
 * ActivityHistory тут навмисна й суттєва: замість "N найновіших подій" тут — "усі події, чия
 * КАЛЕНДАРНА дата (місяць+день, БУДЬ-ЯКИЙ рік) збігається з сьогоднішньою" (п.1 ТЗ).
 *
 * ЛОКАЛЬНИЙ час (п.13 ТЗ): усі дати в БД — ISO-8601 UTC TEXT (`docs/DATABASE.md`), а `strftime`
 * без модифікатора рахує UTC-дату — сесія, що почалась о 23:50 за місцевим часом, могла б
 * "переїхати" на сусідній UTC-день і випасти з вибірки. `localOffsetModifier` (обчислюється в
 * `src/lib/onThisDay.ts`, наприклад `"+180 minutes"` для UTC+3) зсуває мітку часу ПЕРЕД
 * витягом місяця/дня — `strftime('%m-%d', ts, localOffsetModifier)` — так порівняння лишається
 * коректним саме для місцевого календарного дня користувача, а не UTC.
 *
 * Джерело "дня" для сесії — навмисно `started_at`, не `ended_at` (на відміну від
 * `ActivityHistoryRepository`, де для стрічки активності важливо "коли подія відбулась
 * останньою" — тут natural inverse: сесія "належить" дню, коли її РОЗПОЧАЛИ, той самий
 * принцип, що вже усталений у `ReadingSessionRepository.listStartedBetween`).
 */
export const OnThisDayRepository = {
  async listByMonthDay(db: SQLiteDatabase, monthDay: string, localOffsetModifier: string): Promise<OnThisDayRawEvent[]> {
    const rows = await db.getAllAsync<OnThisDayRawRow>(
      `
      SELECT 'session' AS source, rs.id AS id, rs.started_at AS occurred_at, ${BOOK_COLUMNS},
             rs.id AS session_id, rs.start_page AS start_page, rs.end_page AS end_page,
             rs.duration_seconds AS duration_seconds,
             NULL AS entry_id, NULL AS entry_kind, NULL AS entry_type, NULL AS entry_text,
             NULL AS entry_page, NULL AS is_favorite
      FROM reading_session rs
      JOIN user_book ub ON ub.id = rs.user_book_id
      ${BOOK_JOIN}
      WHERE rs.ended_at IS NOT NULL AND rs.deleted_at IS NULL AND ${BOOK_ALIVE}
        AND strftime('%m-%d', rs.started_at, ?) = ?

      UNION ALL

      SELECT 'started', ub.id || ':started', ub.started_at, ${BOOK_COLUMNS},
             NULL, NULL, NULL, NULL,
             NULL, NULL, NULL, NULL, NULL, NULL
      FROM user_book ub
      ${BOOK_JOIN}
      WHERE ub.started_at IS NOT NULL AND ${BOOK_ALIVE}
        AND strftime('%m-%d', ub.started_at, ?) = ?

      UNION ALL

      SELECT 'finished', ub.id || ':finished', ub.finished_at, ${BOOK_COLUMNS},
             NULL, NULL, NULL, NULL,
             NULL, NULL, NULL, NULL, NULL, NULL
      FROM user_book ub
      ${BOOK_JOIN}
      WHERE ub.finished_at IS NOT NULL AND ${BOOK_ALIVE}
        AND strftime('%m-%d', ub.finished_at, ?) = ?

      UNION ALL

      SELECT 'note', n.id, n.created_at, ${BOOK_COLUMNS},
             NULL, NULL, NULL, NULL,
             n.id, 'note', n.type, n.text, n.page, n.is_favorite
      FROM note n
      JOIN user_book ub ON ub.id = n.user_book_id
      ${BOOK_JOIN}
      WHERE n.deleted_at IS NULL AND ${BOOK_ALIVE}
        AND strftime('%m-%d', n.created_at, ?) = ?

      UNION ALL

      SELECT 'quote', q.id, q.created_at, ${BOOK_COLUMNS},
             NULL, NULL, NULL, NULL,
             q.id, 'quote', 'quote', q.text, q.page, q.is_favorite
      FROM quote q
      JOIN user_book ub ON ub.id = q.user_book_id
      ${BOOK_JOIN}
      WHERE q.deleted_at IS NULL AND ${BOOK_ALIVE}
        AND strftime('%m-%d', q.created_at, ?) = ?

      ORDER BY occurred_at DESC
      `,
      [
        localOffsetModifier, monthDay,
        localOffsetModifier, monthDay,
        localOffsetModifier, monthDay,
        localOffsetModifier, monthDay,
        localOffsetModifier, monthDay,
      ],
    );
    return rows.map(mapRow);
  },
};
