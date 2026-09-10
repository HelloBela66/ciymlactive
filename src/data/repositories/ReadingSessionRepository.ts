import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import { computeElapsedMs, isCurrentlyPaused } from '@/lib/sessionTiming';
import type { PausedInterval, ReadingSession } from '@/types/readingSession';
import { UserBookRepository } from './UserBookRepository';
import { ReadingProgressRepository } from './ReadingProgressRepository';

interface ReadingSessionRow {
  id: string;
  user_book_id: string;
  started_at: string;
  ended_at: string | null;
  goal_minutes: number | null;
  paused_intervals: string;
  start_page: number;
  end_page: number | null;
  duration_seconds: number | null;
  mood_note: string | null;
  reading_experience: string | null;
  is_edited: number;
  created_at: string;
  updated_at: string;
}

function parseIntervals(raw: string): PausedInterval[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PausedInterval[]) : [];
  } catch {
    return [];
  }
}

function mapRow(row: ReadingSessionRow): ReadingSession {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    goalMinutes: row.goal_minutes,
    pausedIntervals: parseIntervals(row.paused_intervals),
    startPage: row.start_page,
    endPage: row.end_page,
    durationSeconds: row.duration_seconds,
    moodNote: row.mood_note,
    readingExperience: row.reading_experience,
    isEdited: row.is_edited === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Сесії читання (п.12 ТЗ — критичний core loop). Ключове архітектурне рішення: сесія
 * записується в SQLite ОДРАЗУ при старті (не тримається в пам'яті доти, доки користувач не
 * натисне "завершити") — тому force-quit/краш під час читання не втрачає прогрес. Живий
 * таймер на екрані — обчислення (`src/lib/sessionTiming.ts`) з `started_at` + `paused_intervals`,
 * а не накопичувальний React-стан.
 */
export const ReadingSessionRepository = {
  async getById(db: SQLiteDatabase, id: string): Promise<ReadingSession | null> {
    const row = await db.getFirstAsync<ReadingSessionRow>(
      `SELECT * FROM reading_session WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    return row ? mapRow(row) : null;
  },

  /**
   * Незавершена сесія (`ended_at IS NULL`) будь-де в застосунку. Оскільки один користувач
   * фізично читає одну книгу одночасно, активна сесія — щонайбільше одна на весь застосунок;
   * саме цей запит використовується і для "продовжити активну сесію" на Book Details, і для
   * відновлення "осиротілої" сесії при relaunch (DatabaseProvider/Home).
   */
  async getActiveSession(db: SQLiteDatabase): Promise<ReadingSession | null> {
    const row = await db.getFirstAsync<ReadingSessionRow>(
      `SELECT * FROM reading_session WHERE ended_at IS NULL AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1`,
    );
    return row ? mapRow(row) : null;
  },

  async start(
    db: SQLiteDatabase,
    params: { userBookId: string; startPage: number; goalMinutes?: number | null },
  ): Promise<ReadingSession> {
    const id = generateId();
    const now = nowIso();

    await db.runAsync(
      `INSERT INTO reading_session (
         id, user_book_id, started_at, ended_at, goal_minutes, paused_intervals,
         start_page, end_page, duration_seconds, mood_note, is_edited, created_at, updated_at
       ) VALUES (?, ?, ?, NULL, ?, '[]', ?, NULL, NULL, NULL, 0, ?, ?)`,
      [id, params.userBookId, now, params.goalMinutes ?? null, params.startPage, now, now],
    );

    return {
      id,
      userBookId: params.userBookId,
      startedAt: now,
      endedAt: null,
      goalMinutes: params.goalMinutes ?? null,
      pausedIntervals: [],
      startPage: params.startPage,
      endPage: null,
      durationSeconds: null,
      moodNote: null,
      readingExperience: null,
      isEdited: false,
      createdAt: now,
      updatedAt: now,
    };
  },

  async pause(db: SQLiteDatabase, id: string): Promise<void> {
    const session = await ReadingSessionRepository.getById(db, id);
    if (!session || session.endedAt) return;
    if (isCurrentlyPaused(session.pausedIntervals)) return;

    const intervals = [...session.pausedIntervals, { pausedAt: nowIso(), resumedAt: null }];
    await db.runAsync(`UPDATE reading_session SET paused_intervals = ?, updated_at = ? WHERE id = ?`, [
      JSON.stringify(intervals),
      nowIso(),
      id,
    ]);
  },

  async resume(db: SQLiteDatabase, id: string): Promise<void> {
    const session = await ReadingSessionRepository.getById(db, id);
    if (!session || session.endedAt) return;
    if (!isCurrentlyPaused(session.pausedIntervals)) return;

    const intervals = [...session.pausedIntervals];
    const last = intervals[intervals.length - 1];
    if (!last) return;
    intervals[intervals.length - 1] = { ...last, resumedAt: nowIso() };

    await db.runAsync(`UPDATE reading_session SET paused_intervals = ?, updated_at = ? WHERE id = ?`, [
      JSON.stringify(intervals),
      nowIso(),
      id,
    ]);
  },

  /**
   * Завершення сесії: якщо пауза лишалась відкритою (наприклад, користувач натиснув
   * "завершити" прямо з паузи), спершу тихо закриває її тим самим моментом, що й `ended_at`,
   * щоб `duration_seconds` не залежав від того, в якому стані була пауза. Оновлює
   * `user_book.current_page` тим самим `endPage` — воно лишається лише кешем
   * (docs/DATABASE.md), джерело правди — `reading_progress`.
   */
  async finish(
    db: SQLiteDatabase,
    id: string,
    params: { endPage: number; moodNote?: string | null },
  ): Promise<ReadingSession | null> {
    const session = await ReadingSessionRepository.getById(db, id);
    if (!session || session.endedAt) return session;

    const now = nowIso();
    const intervals = isCurrentlyPaused(session.pausedIntervals)
      ? session.pausedIntervals.map((interval, index) =>
          index === session.pausedIntervals.length - 1 ? { ...interval, resumedAt: now } : interval,
        )
      : session.pausedIntervals;

    const durationSeconds = Math.round(computeElapsedMs(session.startedAt, intervals, new Date(now), now) / 1000);

    // Три окремі записи (сесія, поточна сторінка книги, точка прогресу) — Milestone 8,
    // аудит: раніше йшли БЕЗ спільної транзакції, тож збій між кроком 1 і 2/3 (диск,
    // несподіваний виняток) міг лишити сесію вже позначеною завершеною (`ended_at`
    // записано), а `user_book.current_page`/`reading_progress` — ні, неузгоджений стан без
    // жодного способу відновити. Загорнуто в `withTransactionAsync`: або всі три записи
    // проходять разом, або жоден — і мутація, що впала, гарантовано НЕ лишає сесію
    // напівзавершеною.
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE reading_session
         SET ended_at = ?, paused_intervals = ?, end_page = ?, duration_seconds = ?, mood_note = ?, updated_at = ?
         WHERE id = ?`,
        [now, JSON.stringify(intervals), params.endPage, durationSeconds, params.moodNote ?? null, now, id],
      );

      await UserBookRepository.updateCurrentPage(db, session.userBookId, params.endPage);
      await ReadingProgressRepository.recordForSession(db, {
        userBookId: session.userBookId,
        sessionId: id,
        page: params.endPage,
      });
    });

    return {
      ...session,
      endedAt: now,
      pausedIntervals: intervals,
      endPage: params.endPage,
      durationSeconds,
      moodNote: params.moodNote ?? null,
      updatedAt: now,
    };
  },

  /**
   * "Як читалося?" (ТЗ Фази 9 — SESSION REFLECTION), ОКРЕМО від `finish()`: за задумом ТЗ,
   * рефлексія — необов'язковий крок ПІСЛЯ того, як сесія вже безпечно збережена (`ended_at`
   * записано), а не частина тієї самої транзакції/форми завершення — тож будь-яка проблема з
   * цим викликом НІКОЛИ не може вплинути на вже збережений прогрес сесії (`SessionReflectionPanel`,
   * `app/session/[sessionId].tsx`, навіть не чекає результату перед переходом далі).
   *
   * `value` — вільний `TEXT` без CHECK (той самий підхід, що й `note.reaction`/`shelf.theme`):
   * 5 значень фіксує лише TypeScript-тип `ReadingExperienceId`
   * (`src/design/readingExperience.ts`), UI сам відфільтровує нерозпізнані значення
   * (`isReadingExperienceId`), а не ця функція. `value: null` — свідоме "прибрати відповідь"
   * (не використовується зараз жодним UI, але симетрично з тим, як `pause`/`resume` не
   * забороняють себе викликати у "вже такому" стані — просто UPDATE, без додаткових умов).
   */
  async setReadingExperience(db: SQLiteDatabase, id: string, value: string | null): Promise<void> {
    await db.runAsync(`UPDATE reading_session SET reading_experience = ?, updated_at = ? WHERE id = ?`, [
      value,
      nowIso(),
      id,
    ]);
  },

  /** Скасувати сесію без збереження (опція відновлення "осиротілої" сесії при relaunch). */
  async discard(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`UPDATE reading_session SET deleted_at = ? WHERE id = ?`, [nowIso(), id]);
  },

  /** Історія читання конкретної книги, найновіші зверху — для Book Details. */
  async listByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<ReadingSession[]> {
    const rows = await db.getAllAsync<ReadingSessionRow>(
      `SELECT * FROM reading_session
       WHERE user_book_id = ? AND deleted_at IS NULL AND ended_at IS NOT NULL
       ORDER BY started_at DESC`,
      [userBookId],
    );
    return rows.map(mapRow);
  },

  /**
   * Завершені сесії, що почались у діапазоні [startIso, endIso) — для Календаря (Milestone 4).
   * `started_at` (не `ended_at`) — сесія "належить" дню, коли її почали, навіть якщо вона
   * випадково перетнула північ.
   */
  async listStartedBetween(db: SQLiteDatabase, startIso: string, endIso: string): Promise<ReadingSession[]> {
    const rows = await db.getAllAsync<ReadingSessionRow>(
      `SELECT * FROM reading_session
       WHERE started_at >= ? AND started_at < ? AND deleted_at IS NULL AND ended_at IS NOT NULL
       ORDER BY started_at ASC`,
      [startIso, endIso],
    );
    return rows.map(mapRow);
  },

  /**
   * Усі завершені сесії за весь час — основа для загальної статистики та streaks
   * (Milestone 5, `useStatistics.ts`/`streaks.ts`). Дані одного локального користувача,
   * тож повна вибірка без пагінації лишається дешевою; якщо це стане проблемою — перше
   * природне місце для SQL SUM/COUNT замість вибірки в JS.
   */
  async listAllCompleted(db: SQLiteDatabase): Promise<ReadingSession[]> {
    const rows = await db.getAllAsync<ReadingSessionRow>(
      `SELECT * FROM reading_session WHERE deleted_at IS NULL AND ended_at IS NOT NULL ORDER BY started_at ASC`,
    );
    return rows.map(mapRow);
  },

  /**
   * Остання ЗАВЕРШЕНА сесія на книгу, пакетно для списку книг (ТЗ Фази 8 — READING CONTINUITY,
   * картка "Зараз читаєш" на Home: "Останній раз: …", "N хв · N стор."). Той самий підхід, що
   * й `ShelfRepository.listNamesByUserBookIds` — один запит замість одного на кожну книгу
   * списку. Проста вибірка, відсортована `started_at DESC`, лишає в Map лише ПЕРШЕ (тобто
   * найновіше) входження на кожен `user_book_id` — window-функції (`ROW_NUMBER() OVER
   * (PARTITION BY …)`) тут навмисно не потрібні заради такого невеликого списку (Home показує
   * щонайбільше `HOME_READING_LIST_LIMIT` книг одразу).
   */
  async listLastCompletedByUserBookIds(
    db: SQLiteDatabase,
    userBookIds: string[],
  ): Promise<Map<string, ReadingSession>> {
    const result = new Map<string, ReadingSession>();
    if (userBookIds.length === 0) return result;

    const placeholders = userBookIds.map(() => '?').join(',');
    const rows = await db.getAllAsync<ReadingSessionRow>(
      `SELECT * FROM reading_session
       WHERE user_book_id IN (${placeholders}) AND deleted_at IS NULL AND ended_at IS NOT NULL
       ORDER BY started_at DESC`,
      userBookIds,
    );
    for (const row of rows) {
      if (!result.has(row.user_book_id)) result.set(row.user_book_id, mapRow(row));
    }
    return result;
  },
};
