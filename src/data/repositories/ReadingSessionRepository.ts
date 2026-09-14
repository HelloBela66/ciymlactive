import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import { computeElapsedMs, isCurrentlyPaused } from '@/lib/sessionTiming';
import type { PausedInterval, ReadingSession } from '@/types/readingSession';
import type { UserBookStatus } from '@/types/userBook';
import type { ReadingRunStatus } from '@/types/readingRun';
import { UserBookRepository } from './UserBookRepository';
import { ReadingProgressRepository } from './ReadingProgressRepository';
import { ReadingRunRepository } from './ReadingRunRepository';

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
  reading_run_id: string | null;
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
    readingRunId: row.reading_run_id,
  };
}

/**
 * P0 FIX (POLYTSIA V1.6.2, Фаза 1 — підтверджений дефект, ТЗ V1.6.2 розділи 5-6): визначає,
 * яким має стати `user_book.status`, коли користувач тисне "Почати читання"
 * (`ReadingControls`/`SessionLaunchScreen`, обидва йдуть через `ReadingSessionRepository.start`
 * нижче, НІКОЛИ через `UserBookRepository.updateStatus`). До цієї фази `start()` створювала
 * run+сесію, узагалі не чіпаючи статус — книгу можна було "почати читати" з натиснутої кнопки,
 * лишаючи `status = 'want_to_read'`, або перечитати вже `finished`/`did_not_finish` книгу, не
 * переводячи її в `rereading` — рівно той "примарний" стан (активний run, але статус йому
 * суперечить), який `dataIntegrityDoctor.ts` (`legacy_contradictory_status`) уже вміє знаходити,
 * хибно вважаючи це можливим лише для даних ДО Фази 7.
 *
 * Правило: уже "читацький" статус (`reading`/`rereading`) лишається БЕЗ ЗМІН завжди — навіть
 * якщо активного run ЧОМУСЬ немає (аномалія даних): книга й так каже "це читання/перечитування",
 * `start()` лише гарантує їй run (окрема гілка нижче), не вигадує інший статус. Інакше: якщо для
 * книги вже є активний run (`hasActiveRun`) — це ПРОДОВЖЕННЯ вже триваючого проходу (типово —
 * відновлення з ручного `status = 'paused'`) — новий статус визначається самим типом цього run
 * (`runNumber > 1` → це повторне прочитання). Якщо активного run немає — це СТАРТ НОВОГО проходу:
 * `finished` → `rereading` (той самий цільовий статус, що вже виставляє чіп "Перечитати",
 * `handleStatusChange('rereading')` у `app/work/[workId].tsx` — книга вже раз дочитана, це
 * свідомий ПОВТОРНИЙ прохід). `did_not_finish` → `reading`, НЕ `rereading` (рішення власника
 * продукту): це не перечитування — книга ще жодного разу не була дочитана, це продовження ТОГО
 * САМОГО, ще не завершеного, читацького наміру з місця, де його покинули (`startPage` й так
 * підставляється з `currentPage`, докладніше — `ReadingControls`/`SessionLaunchScreen`, кнопка
 * там показує "Дочитати" саме для цього статусу). Будь-який інший стан (найчастіше
 * `want_to_read`) → `reading`, перший старт.
 */
function inferStatusForSessionStart(
  currentStatus: UserBookStatus,
  hasActiveRun: boolean,
  activeRunNumber: number | null,
): UserBookStatus {
  if (currentStatus === 'reading' || currentStatus === 'rereading') return currentStatus;
  if (hasActiveRun) {
    return activeRunNumber != null && activeRunNumber > 1 ? 'rereading' : 'reading';
  }
  if (currentStatus === 'finished') return 'rereading';
  return 'reading';
}

/**
 * READING RUN CANCEL/DISCARD FIX (POLYTSIA V1.6.2, Фаза 2). Дзеркальна до
 * `inferStatusForSessionStart` вище логіка — "яким має СТАТИ статус, якщо run, що його щойно
 * вивів start(), тепер прибирається" (докладніше — `discard()` нижче). Обчислюється з
 * НАЙНОВІШОГО з решти живих run книги (того, що лишається ПІСЛЯ видалення скасованого):
 * немає жодного — книгу ще ЖОДНОГО разу реально не читали, це був відмінений перший старт ->
 * `want_to_read`; найновіший `finished` -> `finished`; `did_not_finish` -> `did_not_finish`;
 * `in_progress` (кілька сесій того самого проходу, одну з яких скасовують, а не останню) ->
 * `reading`/`rereading` за тим самим правилом номера проходу, що й у `inferStatusForSessionStart`.
 */
function computeStatusAfterRunRemoval(latestRemainingRun: { status: ReadingRunStatus; runNumber: number } | null): UserBookStatus {
  if (!latestRemainingRun) return 'want_to_read';
  if (latestRemainingRun.status === 'finished') return 'finished';
  if (latestRemainingRun.status === 'did_not_finish') return 'did_not_finish';
  return latestRemainingRun.runNumber > 1 ? 'rereading' : 'reading';
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

  /**
   * REREADING MODEL, Фаза 7 (`docs/READING_RUN.md`) — нова сесія ЗАВЖДИ належить якомусь
   * `ReadingRun`. "Graceful" підхід, той самий принцип, що й `getActiveSession` вище /
   * `ReadingRunRepository.getActiveByUserBookId`: активний run шукається запитом, а не жорстким
   * UNIQUE. Якщо активного run немає — створює новий сама (той самий "запасний" фолбек, що й
   * раніше: `ReadingControls`/`SessionLaunchScreen` викликають САМЕ цей метод, не
   * `UserBookRepository.updateStatus`).
   *
   * P0 FIX (POLYTSIA V1.6.2, Фаза 1 — див. `inferStatusForSessionStart` вище): на відміну від
   * попередньої поведінки ("фолбек НЕ чіпає user_book.status", свідомо поза обсягом Фази 7),
   * тепер `start()` САМА виставляє коректний `user_book.status` за тим самим правилом, що й
   * `UserBookRepository.updateStatus` для явної зміни статусу — інакше кнопка "Почати читання"
   * могла лишити книгу з активним прочитанням, але статусом `want_to_read`/`finished`/
   * `did_not_finish`, що суперечить (`dataIntegrityDoctor.ts`, `legacy_contradictory_status`).
   * `started_at` виставляється лише якщо ще не було (той самий захист від "стрибка" дати, що й
   * у `updateStatus`) — `finished_at` тут навмисно НЕ чіпається: цільовий статус зі списку вище
   * ніколи не `finished`/`did_not_finish`, тож старе поле лишається як є (той самий "заморожений
   * `finished_at`" принцип, що документує `docs/READING_RUN.md`).
   *
   * Усі записи (можливе оновлення статусу + можливе створення run + сама сесія) — в одній
   * транзакції: `ReadingRunRepository.start`/`finish` не відкривають власних транзакцій, тож
   * безпечно викликати їх усередині цієї.
   */
  async start(
    db: SQLiteDatabase,
    params: { userBookId: string; startPage: number; goalMinutes?: number | null },
  ): Promise<ReadingSession> {
    const id = generateId();
    const now = nowIso();

    const existingActiveRun = await ReadingRunRepository.getActiveByUserBookId(db, params.userBookId);
    let readingRunId = existingActiveRun?.id ?? null;
    const userBook = await UserBookRepository.getById(db, params.userBookId);

    await db.withTransactionAsync(async () => {
      if (!readingRunId) {
        const newRun = await ReadingRunRepository.start(db, {
          userBookId: params.userBookId,
          startedAt: now,
        });
        readingRunId = newRun.id;
      }

      if (userBook) {
        const targetStatus = inferStatusForSessionStart(
          userBook.status,
          existingActiveRun != null,
          existingActiveRun?.runNumber ?? null,
        );
        if (targetStatus !== userBook.status) {
          await db.runAsync(`UPDATE user_book SET status = ?, started_at = ?, updated_at = ? WHERE id = ?`, [
            targetStatus,
            userBook.startedAt ?? now,
            now,
            params.userBookId,
          ]);
        }
      }

      await db.runAsync(
        `INSERT INTO reading_session (
           id, user_book_id, started_at, ended_at, goal_minutes, paused_intervals,
           start_page, end_page, duration_seconds, mood_note, is_edited, created_at, updated_at,
           reading_run_id
         ) VALUES (?, ?, ?, NULL, ?, '[]', ?, NULL, NULL, NULL, 0, ?, ?, ?)`,
        [id, params.userBookId, now, params.goalMinutes ?? null, params.startPage, now, now, readingRunId],
      );
    });

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
      readingRunId,
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

  /**
   * Скасувати сесію без збереження (опція відновлення "осиротілої" сесії при relaunch, і кнопка
   * "Скасувати сесію" на активному екрані читання, `app/session/[sessionId].tsx`).
   *
   * READING RUN CANCEL/DISCARD FIX (POLYTSIA V1.6.2, Фаза 2 — прогалина, яку виявив і зробив
   * реально видимою P0 FIX Фази 1): до цієї фази скасування сесії чіпало ЛИШЕ саму сесію — run,
   * який ця сесія (можливо) щойно створила разом зі стартом (`start()` вище), лишався
   * `in_progress` НАЗАВЖДИ, без жодної живої сесії всередині. Це вже було можливо й раніше
   * (задокументована "graceful" властивість), але Фаза 1 зробила це видимим по-новому: тепер
   * `start()` ще й змінює `user_book.status`, тож "тапнув 'Почати читання' не на ту книжку,
   * одразу натиснув 'Скасувати сесію'" лишало книгу видимо позначеною "Читаю"/"Перечитую" в
   * Бібліотеці й на Головній — назавжди, без реального способу це відмінити з UI.
   *
   * Правило: якщо ПІСЛЯ видалення цієї сесії її run не має ЖОДНОЇ іншої живої сесії, і сам run
   * ще НІКОЛИ не завершувався (`finishedAt == null` — активний екран сесії й так показує лише
   * незавершені сесії незавершеного run, тож це завжди так для реального виклику з UI, але
   * перевіряємо явно, а не покладаємось на це) — це була відмінена спроба, а не реальна
   * історія: сам run теж м'яко видаляється (`ReadingRunRepository.discard`), а
   * `user_book.status` повертається до того, що диктує решта live-історії прочитань книги
   * (`computeStatusAfterRunRemoval` вище — дзеркальна логіка до `inferStatusForSessionStart`).
   * Якщо в run лишились інші живі сесії (звичайний "скасував ОДНУ сесію посеред багатосесійного
   * читання") — run і статус НЕ чіпаються, той самий принцип "не вигадувати й не руйнувати
   * реальну історію", що й усюди в цій сутності.
   */
  async discard(db: SQLiteDatabase, id: string): Promise<void> {
    const session = await ReadingSessionRepository.getById(db, id);
    if (!session) return;

    await db.withTransactionAsync(async () => {
      await db.runAsync(`UPDATE reading_session SET deleted_at = ? WHERE id = ?`, [nowIso(), id]);

      if (!session.readingRunId) return; // легасі сесія без run (до Фази 7) — прибирати більше нічого

      const run = await ReadingRunRepository.getById(db, session.readingRunId);
      if (!run || run.finishedAt) return; // run уже завершений — це реальна історія, не чіпаємо

      const remaining = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM reading_session WHERE reading_run_id = ? AND deleted_at IS NULL`,
        [session.readingRunId],
      );
      if ((remaining?.count ?? 0) > 0) return; // у run лишились інші живі сесії — не чіпаємо

      await ReadingRunRepository.discard(db, session.readingRunId);

      const userBook = await UserBookRepository.getById(db, session.userBookId);
      if (!userBook) return;

      const latestRemainingRun = await ReadingRunRepository.getLatestByUserBookId(db, session.userBookId);
      const fallbackStatus = computeStatusAfterRunRemoval(latestRemainingRun);
      if (fallbackStatus === userBook.status) return;

      // 'want_to_read' несумісний з непорожнім started_at (dataIntegrityDoctor.ts,
      // want_to_read_with_started_at) — якщо відкочуємось аж до "ще не починали", started_at
      // теж повертається в null. Це безпечно: єдиний спосіб опинитись тут із fallbackStatus
      // 'want_to_read' — коли скасований run був ПЕРШИМ і ЄДИНИМ для книги, тож ДО start()
      // started_at так і так був null (сама Фаза 1 виставляє його лише коли він ще не стояв).
      const fallbackStartedAt = fallbackStatus === 'want_to_read' ? null : userBook.startedAt;

      await db.runAsync(`UPDATE user_book SET status = ?, started_at = ?, updated_at = ? WHERE id = ?`, [
        fallbackStatus,
        fallbackStartedAt,
        nowIso(),
        session.userBookId,
      ]);
    });
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
   * Завершені сесії, що почались у діапазоні [startIso, endIso) — спершу для Календаря
   * (Milestone 4), тепер також `ReadingGoalRepository.getProgress` (POLYTSIA V1.5, Фаза 15 —
   * PERFORMANCE REVIEW): раніше прогрес цілі рахувався через `listAllCompleted(db).filter(...)`
   * — повне `SELECT *` по ВСІХ завершених сесіях (5000+ рядків на заявленому в ТЗ сценарії),
   * з фільтром по періоду в JS, ПОВТОРНО на кожну ціль (`useGoals` рахує прогрес усіх цілей
   * одним `Promise.all`) — N цілей типу minutes/pages/reading_days означали N повних сканувань
   * усієї історії сесій замість N вузьких запитів. Період цілі відомий заздалегідь, тож той
   * самий `WHERE started_at >= ? AND started_at < ?`, що вже існував тут для календаря,
   * закриває обидва випадки одним методом — нового SQL не знадобилось.
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
   *
   * Навмисно НЕ використовується там, де відомий вузький діапазон дат (`listStartedBetween`
   * вище) — саме таке некероване використання (повна вибірка + `.filter()` по періоду в JS)
   * раніше було в `ReadingGoalRepository.getProgress`, виправлено у Фазі 15.
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
