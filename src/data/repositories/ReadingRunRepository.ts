import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import { calendarDateBounds, calendarDateOf } from '@/lib/readingCalendar';
import type { ReadingRun, ReadingRunStatus } from '@/types/readingRun';

interface ReadingRunRow {
  id: string;
  user_book_id: string;
  run_number: number;
  status: ReadingRunStatus;
  started_at: string;
  finished_at: string | null;
  is_legacy_backfill: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  /** POLYTSIA V1.7, Phase 11 (ТЗ §9) — `NULL` для legacy-рядків, і це легальний стан. */
  started_calendar_date: string | null;
  finished_calendar_date: string | null;
}

function mapRow(row: ReadingRunRow): ReadingRun {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    runNumber: row.run_number,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    isLegacyBackfill: row.is_legacy_backfill === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // SOFT-DELETE READINESS (Фаза 26) — усі публічні read-методи нижче фільтрують
    // `deleted_at IS NULL`, тож для будь-якого рядка, що доходить сюди, це завжди `null`; поле
    // проноситься все одно, щоб домен-тип чесно відповідав ТЗ (id+createdAt+updatedAt+deletedAt
    // обов'язково), а не тому, що тут колись може прийти не-NULL значення.
    deletedAt: row.deleted_at,
    // ТЗ §9 — `null` означає «ми не знаємо», а не «дати не було»: read-path сам застосує
    // задокументований fallback (`resolveEventCalendarDate`, `readingCalendar.ts`).
    startedCalendarDate: row.started_calendar_date,
    finishedCalendarDate: row.finished_calendar_date,
  };
}

/**
 * REREADING MODEL, Фаза 6 (`docs/READING_RUN.md`, `019_reading_run.ts`). Ця фаза — лише сама
 * сутність (schema/domain/repository), навмисно БЕЗ жодного виклику звідси з
 * `UserBookRepository`/`ReadingSessionRepository`/UI — те, яка саме дія користувача створює чи
 * завершує run, підключається пізніше (Фаза 7 і далі), щоб не змінювати продуктову поведінку
 * мовчки в тій самій фазі, де щойно з'явилась сама сутність.
 */
export const ReadingRunRepository = {
  async getById(db: SQLiteDatabase, id: string): Promise<ReadingRun | null> {
    const row = await db.getFirstAsync<ReadingRunRow>(
      `SELECT * FROM reading_run WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    return row ? mapRow(row) : null;
  },

  /** Усі run'и книги, найстаріший перший (природний порядок "прочитання №1, №2, ..."). */
  async listByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<ReadingRun[]> {
    const rows = await db.getAllAsync<ReadingRunRow>(
      `SELECT * FROM reading_run WHERE user_book_id = ? AND deleted_at IS NULL ORDER BY run_number ASC`,
      [userBookId],
    );
    return rows.map(mapRow);
  },

  /**
   * "Активний" run книги — той самий принцип, що й `ReadingSessionRepository.getActiveSession`
   * (Фаза 5, підтверджено тестами): найновіший за `run_number` серед `in_progress`, а не
   * жорсткий UNIQUE-констрейнт у схемі (докладніше — коментар у `019_reading_run.ts`, п.4).
   */
  async getActiveByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<ReadingRun | null> {
    const row = await db.getFirstAsync<ReadingRunRow>(
      `SELECT * FROM reading_run
       WHERE user_book_id = ? AND status = 'in_progress' AND deleted_at IS NULL
       ORDER BY run_number DESC LIMIT 1`,
      [userBookId],
    );
    return row ? mapRow(row) : null;
  },

  /**
   * Найновіший run книги НЕЗАЛЕЖНО від статусу (на відміну від `getActiveByUserBookId` вище,
   * яка бачить лише `in_progress`) — REREADING MODEL, Фаза 8 (`docs/READING_RUN.md`):
   * `BookMemoryRepository` потребує "останній прохід цієї книги", а не лише "активний",
   * оскільки спогад пишеться ПІСЛЯ переходу в `finished`/`did_not_finish` (той момент, коли
   * `updateStatus`, Фаза 7, уже завершив run — він більше не `in_progress`).
   */
  async getLatestByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<ReadingRun | null> {
    const row = await db.getFirstAsync<ReadingRunRow>(
      `SELECT * FROM reading_run
       WHERE user_book_id = ? AND deleted_at IS NULL
       ORDER BY run_number DESC LIMIT 1`,
      [userBookId],
    );
    return row ? mapRow(row) : null;
  },

  /**
   * Створює наступний run для книги: `run_number` = (максимальний наявний, включно з
   * `deleted_at`, щоб номери ніколи не перевикористовувались) + 1. Не перевіряє, чи вже є
   * `in_progress` run для цієї книги — той самий свідомий вибір "без жорсткого гейту в
   * репозиторії", що й п.4 у `019_reading_run.ts`; коли з'явиться реальний викликач (Фаза 7),
   * саме він вирішує, чи можна стартувати новий run.
   */
  async start(
    db: SQLiteDatabase,
    params: { userBookId: string; startedAt?: string },
  ): Promise<ReadingRun> {
    const maxRow = await db.getFirstAsync<{ maxRunNumber: number | null }>(
      `SELECT MAX(run_number) AS maxRunNumber FROM reading_run WHERE user_book_id = ?`,
      [params.userBookId],
    );
    const runNumber = (maxRow?.maxRunNumber ?? 0) + 1;

    const id = generateId();
    const now = nowIso();
    const startedAt = params.startedAt ?? now;

    // POLYTSIA V1.7, Phase 11 (ТЗ §9, §6) — календарна дата старту фіксується ОДИН раз, у поясі,
    // активному саме зараз, і надалі ніколи не перераховується з `started_at` у поточному поясі.
    const startedCalendarDate = calendarDateOf(new Date(startedAt));

    await db.runAsync(
      `INSERT INTO reading_run (
         id, user_book_id, run_number, status, started_at, finished_at,
         is_legacy_backfill, created_at, updated_at, started_calendar_date
       ) VALUES (?, ?, ?, 'in_progress', ?, NULL, 0, ?, ?, ?)`,
      [id, params.userBookId, runNumber, startedAt, now, now, startedCalendarDate],
    );

    return {
      id,
      userBookId: params.userBookId,
      runNumber,
      status: 'in_progress',
      startedAt,
      finishedAt: null,
      isLegacyBackfill: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      startedCalendarDate,
      finishedCalendarDate: null,
    };
  },

  /**
   * Завершує run — ідемпотентно, той самий "вже завершений → нічого не робити" підхід, що й
   * `ReadingSessionRepository.finish` (Фаза 5): повторний виклик не перезаписує вже зафіксований
   * `finished_at`/`status`.
   */
  async finish(
    db: SQLiteDatabase,
    id: string,
    params: { status: 'finished' | 'did_not_finish'; finishedAt?: string },
  ): Promise<ReadingRun | null> {
    const existing = await ReadingRunRepository.getById(db, id);
    if (!existing || existing.finishedAt) return existing;

    const now = nowIso();
    const finishedAt = params.finishedAt ?? now;
    // ТЗ §7 — записується з календарною семантикою МОМЕНТУ ЗАВЕРШЕННЯ; пізніше не derive'иться.
    const finishedCalendarDate = calendarDateOf(new Date(finishedAt));

    await db.runAsync(
      `UPDATE reading_run
         SET status = ?, finished_at = ?, updated_at = ?, finished_calendar_date = ?
       WHERE id = ?`,
      [params.status, finishedAt, now, finishedCalendarDate, id],
    );

    return { ...existing, status: params.status, finishedAt, updatedAt: now, finishedCalendarDate };
  },

  /** М'яке видалення — помилково розпочатий run (наприклад, одразу скасований перехід у
   * "Перечитую"). `run_number` НЕ перевикористовується (`start()` рахує з урахуванням
   * видалених рядків). */
  async discard(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`UPDATE reading_run SET deleted_at = ? WHERE id = ?`, [nowIso(), id]);
  },

  /**
   * Пакетний вибір за списком id (Календар 2.0, Фаза 19, `docs/CALENDAR_2_0.md`) — "run-aware
   * day details": `app/day/[date].tsx` показує позначку "Перечитування, прохід №N" на сесіях
   * дня, коли `session.readingRunId` вказує на run із `runNumber > 1`. Той самий "один IN-запит
   * замість N окремих" підхід, що й `UserBookRepository.listByIds` — днів із сесіями кількох
   * різних `reading_run_id` мало, але навіть це лишається одним запитом, не N.
   */
  async listByIds(db: SQLiteDatabase, ids: string[]): Promise<Map<string, ReadingRun>> {
    const result = new Map<string, ReadingRun>();
    if (ids.length === 0) return result;

    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.getAllAsync<ReadingRunRow>(
      `SELECT * FROM reading_run WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      ids,
    );
    for (const row of rows) result.set(row.id, mapRow(row));
    return result;
  },

  /**
   * Run'и, чий `startedAt` АБО `finishedAt` потрапляє в `[startIso, endIso)` — КАЛЕНДАР,
   * ВІЗУАЛЬНА КОМПОЗИЦІЯ (пост-Фаза 19, `docs/CALENDAR_2_0.md` §"Visual Day Composition"):
   * "почав читати"/"завершив" позначки дня-клітинки й timeline-пункти Day Details мають брати
   * дати САМЕ з ReadingRun (кожен прохід має власні `startedAt`/`finishedAt`), а НЕ з
   * `user_book.started_at`/`finished_at` (`ActivityHistoryRepository`'s `book_started`/
   * `book_finished` гілки) — те поле "заморожене" на ПЕРШИЙ старт і ПЕРШИЙ незмінений фініш
   * книги (`UserBookRepository.updateStatus`, докладніше коментар там-таки), тож для
   * перечитаної книги НЕ відображає дату старту/фінішу кожного окремого проходу — рівно та
   * проблема, якої це нове поле уникає.
   *
   * POLYTSIA FOUNDATION FINAL POLISH — Calendar Historical Consistency, Gap B (закритий gap з
   * `POST_V1_6_2_FINAL_AUDIT_REPORT.md`, розділ 7): цей метод БІЛЬШЕ НЕ фільтрує `ub.deleted_at
   * IS NULL`. До цього фіксу тут БУВ `JOIN user_book ... AND ub.deleted_at IS NULL` — той самий
   * History Preservation Principle, що вже діє для сесій/обкладинок у `useCalendarSessions.ts`
   * (`listWithDetailsByIdsIncludingDeleted`), тоді ще НЕ застосований до start/finish-подій:
   * видалення книги з бібліотеки прибирало tiny start/finish індикатор клітинки-дня й пункт
   * таймлайну Day Details для неї, хоча сама подія (реальний прохід читання) лишалась
   * легітимною історією. `JOIN user_book` сам лишається (гарантує, що `user_book_id` рядка
   * реально існує — захист від "сирітського" run, а не перевірка "жива чи ні"), лише умова на
   * `deleted_at` знята.
   *
   * НЕ зачіпає `listFinishedBetween` нижче — той метод обслуговує ЛИШЕ Reading Seasons (#167,
   * `useReadingSeason.ts`), яку цей polish pass explicitly НЕ чіпає (ТЗ FOUNDATION FINAL
   * POLISH, п.25 "Seasons — НЕ ЧІПАТИ"); обидва методи раніше мали ідентичний
   * `ub.deleted_at IS NULL`-guard лише тому, що обидва писались в один момент (Фаза
   * 19/#167), а не тому, що вони мусять лишатись синхронізованими назавжди — Calendar і
   * Seasons мають право на різну historical-семантику.
   *
   * Один запит на весь запитаний діапазон (сітка місяця чи один день) — той самий "діапазон
   * замість по одному" підхід, що й `ActivityHistoryRepository.listBetween`.
   */
  async listStartedOrFinishedBetween(db: SQLiteDatabase, startIso: string, endIso: string): Promise<ReadingRun[]> {
    // ТЗ §9 — те саме двогілкове правило, застосоване окремо до старту й до завершення: у
    // Календарі прохід видно і в день початку, і в день завершення, і кожна з цих дат має власну
    // персистентність.
    const { startDate, endDate } = calendarDateBounds({ startIso, endIso });
    const rows = await db.getAllAsync<ReadingRunRow>(
      `SELECT rr.* FROM reading_run rr
       JOIN user_book ub ON ub.id = rr.user_book_id
       WHERE rr.deleted_at IS NULL
         AND (
           (rr.started_calendar_date IS NOT NULL AND rr.started_calendar_date >= ? AND rr.started_calendar_date <= ?)
           OR (rr.started_calendar_date IS NULL AND rr.started_at >= ? AND rr.started_at < ?)
           OR (rr.finished_calendar_date IS NOT NULL AND rr.finished_calendar_date >= ? AND rr.finished_calendar_date <= ?)
           OR (rr.finished_calendar_date IS NULL AND rr.finished_at >= ? AND rr.finished_at < ?)
         )
       ORDER BY rr.started_at ASC`,
      [startDate, endDate, startIso, endIso, startDate, endDate, startIso, endIso],
    );
    return rows.map(mapRow);
  },

  /**
   * `userBookId` усіх книг, що мають ≥2 ЗАВЕРШЕНИХ (`status = 'finished'`) run — тобто книг, які
   * реально можна порівняти на `app/reread-comparison/[workId].tsx` (`selectComparableRuns`,
   * `useReadingRunsDetail.ts`, той самий поріг ≥2 `finished`). Фаза 16 (MEMORY HUB HIERARCHY,
   * `docs/MEMORY_HUB.md`) додала цей метод для розділу "Перечитання" на
   * `app/memory/index.tsx` — до цієї фази "чи є що порівняти" перевірялось лише ПОЧИНАЮЧИ з
   * конкретної книги (Book Details/Book Memory), не як глобальний перелік. `GROUP BY ... HAVING`
   * замість тягнути всі `reading_run` рядки й рахувати в JS — книг завжди набагато менше за
   * рядків прочитань, але фільтрація в SQL однаково дешевша й точніша.
   */
  async listUserBookIdsWithMultipleFinishedRuns(db: SQLiteDatabase): Promise<string[]> {
    const rows = await db.getAllAsync<{ user_book_id: string }>(
      `SELECT user_book_id FROM reading_run
       WHERE status = 'finished' AND deleted_at IS NULL
       GROUP BY user_book_id
       HAVING COUNT(*) >= 2`,
    );
    return rows.map((row) => row.user_book_id);
  },

  /**
   * Run'и, що ЗАВЕРШИЛИСЬ (`status IN ('finished', 'did_not_finish')`) у діапазоні
   * `[startIso, endIso)` — POLYTSIA V1.6.2, #167 (READING SEASONS — PRODUCT REDEFINITION, ТЗ
   * §39: "Use ReadingRun finish date. Не current UserBook `finished_at`, якщо ReadingRun
   * available"). До цієї фази сезон визначав "прочитані книги" через
   * `UserBookRepository.listByStatus(db, 'finished')` — поточний СТАТУС книги, а не факт
   * завершення run у вікні сезону: книга, що завершилась улітку, а потім перечитувалась і зараз
   * має статус `'rereading'`, випадала б із літнього сезону повністю (`listByStatus('finished')`
   * бачить лише книги, чий ПОТОЧНИЙ статус — `'finished'`), і повторне завершення в межах ТОГО
   * САМОГО сезону було б взагалі непомітним (`user_book` — один рядок на книгу, не на прохід).
   * `run_number > 1` на кожному рядку результату — вже готовий сигнал "це перечитування" (ТЗ
   * §39: "small indicator: «Перечитано»"), без окремого запиту.
   *
   * `JOIN user_book ... deleted_at IS NULL` soft-delete guard — ЗНЯТО у POLYTSIA V1.7
   * (`docs/V1_7_READING_LIFE.md`).
   *
   * ІСТОРІЯ РІШЕННЯ (щоб цей рядок не «повернули назад» як недогляд). FOUNDATION FINAL POLISH
   * зняв той самий guard у `listStartedOrFinishedBetween` вище заради Calendar Historical
   * Consistency, але тут залишив його НАВМИСНО: метод обслуговував лише Reading Seasons (#167),
   * а ТЗ того пасу прямо забороняло чіпати Сезони, тож питання «чи має Сезон бачити прочитання
   * книги, яку згодом прибрали з Бібліотеки» було свідомо відкладене як окреме продуктове
   * рішення. V1.7 (§61) це рішення ПРИЙНЯЛА: **історичний Сезон переживає soft-delete книги.**
   *
   * Обґрунтування: Сезон — емоційний знімок минулого, а не запит до живої Бібліотеки. Якщо
   * людина прочитала книгу влітку 2026, а у 2028 прибрала її з Бібліотеки, «Літо 2026» не
   * повинно переписувати минуле — це та сама History Preservation, що вже діє для Календаря.
   * Той самий метод тепер обслуговує ще й canonical-агрегацію періодів V1.7
   * (`src/lib/readingPeriodSummary.ts`), якій потрібна рівно ця семантика, тож розбіжність між
   * «періодом» і «сезоном» була б новим джерелом двох різних відповідей на одне питання.
   *
   * `JOIN` (уже без умови на `deleted_at`) лишається: для ФІЗИЧНО видаленого `user_book` рядок
   * просто не приєднається — та сама тиха деградація, що й у `listStartedOrFinishedBetween`,
   * а не помилка. Library-орієнтовані запити (`UserBookRepository.listAll`/`listByStatus`/
   * `listByIds`) — БЕЗ ЗМІН, і далі alive-only: soft-deleted книга НІКОЛИ не повертається в
   * Бібліотеку, лише в історичні поверхні.
   */
  async listFinishedBetween(db: SQLiteDatabase, startIso: string, endIso: string): Promise<ReadingRun[]> {
    /**
     * POLYTSIA V1.7, Phase 11 (ТЗ §9) — дві явні гілки для змішаного набору; обґрунтування,
     * чому саме дві, а не `COALESCE(...strftime...)` — у `ReadingSessionRepository.listStartedBetween`
     * (коротко: один поточний offset неправильний для рядків, записаних за іншого DST).
     */
    const { startDate, endDate } = calendarDateBounds({ startIso, endIso });
    const rows = await db.getAllAsync<ReadingRunRow>(
      `SELECT rr.* FROM reading_run rr
       JOIN user_book ub ON ub.id = rr.user_book_id
       WHERE rr.deleted_at IS NULL
         AND rr.status IN ('finished', 'did_not_finish')
         AND (
           (rr.finished_calendar_date IS NOT NULL AND rr.finished_calendar_date >= ? AND rr.finished_calendar_date <= ?)
           OR (rr.finished_calendar_date IS NULL AND rr.finished_at >= ? AND rr.finished_at < ?)
         )
       ORDER BY rr.finished_at ASC`,
      [startDate, endDate, startIso, endIso],
    );
    return rows.map(mapRow);
  },

  /**
   * Усі завершені прочитання за ВЕСЬ час — POLYTSIA V1.7, Phase 4 (Reading Life,
   * `docs/V1_7_READING_LIFE.md`). Той самий `WHERE`, той самий `JOIN` і та сама семантика
   * «завершилось = `finished_at` + `status IN ('finished','did_not_finish')`», що й
   * `listFinishedBetween` вище — лише без обмеження діапазону.
   *
   * НАВМИСНО дублює умову, а не «діапазон від початку часів»: виклик із літералами на кшталт
   * `'0000-01-01'`/`'9999-12-31'` був би магічними межами, що мовчки залежать від формату
   * зберігання, тоді як окремий метод чесно каже «за весь час» і лишається під тим самим
   * коментарем про soft-delete (§61: історична поверхня переживає видалення книги з Бібліотеки).
   *
   * Reading Life групує ці рядки за ЛОКАЛЬНИМ місяцем завершення в JS (`readingMonthKey`) — з
   * тієї самої причини, що й сесії: SQL не знає часового поясу пристрою
   * (`ReadingSessionRepository.listAllCompletedMetrics`).
   */
  /**
   * Найраніший `started_at` серед ЖИВИХ проходів — друга можлива точка відліку читацької історії
   * (POLYTSIA V1.7, Phase 8, ТЗ §11). Потрібна поруч із сесійною: імпортована/legacy-історія
   * (`is_legacy_backfill`) може мати проходи, старіші за будь-яку записану сесію, і рахувати
   * ювілей від першої СЕСІЇ означало б відрізати людині частину її ж біографії.
   *
   * Без `JOIN user_book`: тут потрібна лише дата, а книга може бути й soft-deleted — історія
   * від цього не молодшає (§19).
   */
  async getEarliestStartInstant(db: SQLiteDatabase): Promise<string | null> {
    const row = await db.getFirstAsync<{ earliest: string | null }>(
      `SELECT MIN(started_at) AS earliest FROM reading_run WHERE deleted_at IS NULL`,
    );
    return row?.earliest ?? null;
  },

  async listAllFinished(db: SQLiteDatabase): Promise<ReadingRun[]> {
    const rows = await db.getAllAsync<ReadingRunRow>(
      `SELECT rr.* FROM reading_run rr
       JOIN user_book ub ON ub.id = rr.user_book_id
       WHERE rr.deleted_at IS NULL
         AND rr.status IN ('finished', 'did_not_finish')
         AND rr.finished_at IS NOT NULL
       ORDER BY rr.finished_at ASC`,
    );
    return rows.map(mapRow);
  },
};
