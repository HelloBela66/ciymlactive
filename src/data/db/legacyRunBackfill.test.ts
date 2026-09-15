import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { BackupRepository } from '@/data/repositories/BackupRepository';
import type { BackupData } from '@/lib/backupSerializer';
import {
  backfillLegacyReadingRuns,
  backfillNewestFinishedRunLink,
  backfillCapsuleRunLinks,
  backfillDnfReflectionRunLinks,
  backfillAllLegacyReadingRunLinks,
} from './legacyRunBackfill';

/**
 * `src/data/db/legacyRunBackfill.ts` (POLYTSIA V1.6.1, Фаза 27) — сама доменна логіка кожної
 * окремої функції ВЖЕ вичерпно покрита `migrationRunner.test.ts` (тести 020-025: кожна гілка
 * пріоритету вибору run, усі edge cases) — цей алгоритм лише ВИНЕСЕНО сюди дослівно, не
 * переписано. Тож тут перевіряється саме те, чого міграційні тести НЕ можуть перевірити:
 * (1) що функції справді викликаються напряму (поза `migrateDbIfNeeded`) без помилок; (2) нова
 * властивість, якої в оригінальних одноразових міграціях не було й не могло бути — БЕЗПЕЧНА
 * ПОВТОРНА ВИКЛИКУВАНІСТЬ (restore може статись багато разів у житті тієї самої БД, на відміну
 * від міграції); (3) наскрізний сценарій "відновлення старого бекапу" — саме ТЗ Фази 27.
 */

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

async function seedFinishedBookWithSession(
  db: SQLiteDatabase,
  params: { userBookId: string; startedAt: string; finishedAt: string },
): Promise<void> {
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    `${params.userBookId}-work`,
    `Книга ${params.userBookId}`,
    params.startedAt,
    params.startedAt,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [`${params.userBookId}-edition`, `${params.userBookId}-work`, `Книга ${params.userBookId}`, 'uk', 'paperback', params.startedAt, params.startedAt],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, started_at, finished_at, current_page, added_at, updated_at)
     VALUES (?,?,'finished',?,?,0,?,?)`,
    [params.userBookId, `${params.userBookId}-edition`, params.startedAt, params.finishedAt, params.startedAt, params.finishedAt],
  );
  await db.runAsync(
    `INSERT INTO reading_session (id, user_book_id, started_at, ended_at, paused_intervals, start_page, end_page, duration_seconds, is_edited, created_at, updated_at)
     VALUES (?,?,?,?,'[]',0,10,600,0,?,?)`,
    [`${params.userBookId}-session`, params.userBookId, params.startedAt, params.finishedAt, params.startedAt, params.finishedAt],
  );
}

describe('backfillLegacyReadingRuns — пряме викликання + безпечна повторна викликуваність', () => {
  it('на книзі без жодного reading_run — створює legacy run і лінкує сесію (той самий результат, що й migration 020)', async () => {
    const db = await openMigratedTestDb();
    await seedFinishedBookWithSession(db, { userBookId: 'ub-1', startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-10T00:00:00.000Z' });

    await backfillLegacyReadingRuns(db);

    const run = await db.getFirstAsync<{ id: string; status: string; run_number: number }>(
      `SELECT id, status, run_number FROM reading_run WHERE user_book_id = 'ub-1'`,
    );
    expect(run).toMatchObject({ status: 'finished', run_number: 1 });

    const session = await db.getFirstAsync<{ reading_run_id: string | null }>(
      `SELECT reading_run_id FROM reading_session WHERE id = 'ub-1-session'`,
    );
    expect(session?.reading_run_id).toBe(run?.id);
  });

  it('повторний виклик на книзі, що вже МАЄ reading_run — безпечний no-op, не створює другий run_number = 1 (жодного UNIQUE-конфлікту)', async () => {
    const db = await openMigratedTestDb();
    await seedFinishedBookWithSession(db, { userBookId: 'ub-2', startedAt: '2026-02-01T00:00:00.000Z', finishedAt: '2026-02-10T00:00:00.000Z' });

    await backfillLegacyReadingRuns(db);
    const firstRun = await db.getFirstAsync<{ id: string }>(`SELECT id FROM reading_run WHERE user_book_id = 'ub-2'`);

    // Другий виклик — той сценарій, якого одноразова міграція 020 НІКОЛИ не бачить (вона
    // виконується рівно раз), але який реальний: restore старого бекапу може статись кілька
    // разів у житті тієї самої БД.
    await expect(backfillLegacyReadingRuns(db)).resolves.not.toThrow();

    const runs = await db.getAllAsync<{ id: string }>(`SELECT id FROM reading_run WHERE user_book_id = 'ub-2'`);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.id).toBe(firstRun?.id);
  });

  it('книга, що ВЖЕ мала reading_run ДО виклику (напр. сучасний бекап) — не чіпається; книга без run поруч — таки бекфілиться', async () => {
    const db = await openMigratedTestDb();
    await seedFinishedBookWithSession(db, { userBookId: 'ub-modern', startedAt: '2026-03-01T00:00:00.000Z', finishedAt: '2026-03-05T00:00:00.000Z' });
    await db.runAsync(
      `INSERT INTO reading_run (id, user_book_id, run_number, status, started_at, finished_at, is_legacy_backfill, created_at, updated_at)
       VALUES ('run-modern', 'ub-modern', 1, 'finished', '2026-03-01T00:00:00.000Z', '2026-03-05T00:00:00.000Z', 0, '2026-03-05T00:00:00.000Z', '2026-03-05T00:00:00.000Z')`,
    );
    await seedFinishedBookWithSession(db, { userBookId: 'ub-legacy', startedAt: '2026-04-01T00:00:00.000Z', finishedAt: '2026-04-05T00:00:00.000Z' });

    await backfillLegacyReadingRuns(db);

    const modernRuns = await db.getAllAsync<{ id: string }>(`SELECT id FROM reading_run WHERE user_book_id = 'ub-modern'`);
    expect(modernRuns).toHaveLength(1);
    expect(modernRuns[0]?.id).toBe('run-modern'); // не перезаписаний, не здубльований.

    const legacyRuns = await db.getAllAsync<{ id: string }>(`SELECT id FROM reading_run WHERE user_book_id = 'ub-legacy'`);
    expect(legacyRuns).toHaveLength(1); // сусідня книга без run — таки отримала legacy run.
  });
});

describe('backfillNewestFinishedRunLink / backfillCapsuleRunLinks / backfillDnfReflectionRunLinks — пряме викликання', () => {
  it('book_memory/pre_reading_reflection/rating без reading_run_id — лінкуються на єдиний finished run книги', async () => {
    const db = await openMigratedTestDb();
    await seedFinishedBookWithSession(db, { userBookId: 'ub-3', startedAt: '2026-05-01T00:00:00.000Z', finishedAt: '2026-05-10T00:00:00.000Z' });
    await backfillLegacyReadingRuns(db);
    const run = await db.getFirstAsync<{ id: string }>(`SELECT id FROM reading_run WHERE user_book_id = 'ub-3'`);

    await db.runAsync(
      `INSERT INTO book_memory (id, user_book_id, reflection, entry_refs, template_id, created_at, updated_at) VALUES ('memory-3','ub-3','Спогад','[]','classic','2026-05-11T00:00:00.000Z','2026-05-11T00:00:00.000Z')`,
    );
    await db.runAsync(
      `INSERT INTO pre_reading_reflection (id, user_book_id, reason_text, created_at, updated_at) VALUES ('reflection-3','ub-3','Причина','2026-05-01T00:00:00.000Z','2026-05-01T00:00:00.000Z')`,
    );
    await db.runAsync(
      `INSERT INTO rating (id, user_book_id, value, created_at, updated_at) VALUES ('rating-3','ub-3',4.5,'2026-05-11T00:00:00.000Z','2026-05-11T00:00:00.000Z')`,
    );

    await backfillNewestFinishedRunLink(db, 'book_memory');
    await backfillNewestFinishedRunLink(db, 'pre_reading_reflection');
    await backfillNewestFinishedRunLink(db, 'rating');

    expect((await db.getFirstAsync<{ reading_run_id: string }>(`SELECT reading_run_id FROM book_memory WHERE id = 'memory-3'`))?.reading_run_id).toBe(run?.id);
    expect((await db.getFirstAsync<{ reading_run_id: string }>(`SELECT reading_run_id FROM pre_reading_reflection WHERE id = 'reflection-3'`))?.reading_run_id).toBe(run?.id);
    expect((await db.getFirstAsync<{ reading_run_id: string }>(`SELECT reading_run_id FROM rating WHERE id = 'rating-3'`))?.reading_run_id).toBe(run?.id);
  });

  it('book_capsule без reading_run_id — лінкується за найближчим у часі finished run', async () => {
    const db = await openMigratedTestDb();
    await seedFinishedBookWithSession(db, { userBookId: 'ub-4', startedAt: '2026-06-01T00:00:00.000Z', finishedAt: '2026-06-10T00:00:00.000Z' });
    await backfillLegacyReadingRuns(db);
    const run = await db.getFirstAsync<{ id: string }>(`SELECT id FROM reading_run WHERE user_book_id = 'ub-4'`);

    await db.runAsync(
      `INSERT INTO book_capsule (id, user_book_id, lasting_thought, reopen_option, created_at, updated_at) VALUES ('capsule-4','ub-4','Думка','none','2026-06-11T00:00:00.000Z','2026-06-11T00:00:00.000Z')`,
    );

    await backfillCapsuleRunLinks(db);

    expect((await db.getFirstAsync<{ reading_run_id: string }>(`SELECT reading_run_id FROM book_capsule WHERE id = 'capsule-4'`))?.reading_run_id).toBe(run?.id);
  });

  it('dnf_reflection без reading_run_id — лінкується лише на did_not_finish run', async () => {
    const db = await openMigratedTestDb();
    await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES ('ub-5-work','Книга 5','2026-07-01T00:00:00.000Z','2026-07-01T00:00:00.000Z')`);
    await db.runAsync(
      `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES ('ub-5-edition','ub-5-work','Книга 5','uk','paperback','2026-07-01T00:00:00.000Z','2026-07-01T00:00:00.000Z')`,
    );
    await db.runAsync(
      // `started_at` — обов'язковий тут: DNF-книга за визначенням БУЛА розпочата (інакше
      // `backfillLegacyReadingRuns` рядок "Книга ніколи не була розпочата — legacy run не
      // створюється" її свідомо пропускає, і тест нижче не мав би на чому перевіряти
      // did_not_finish-гілку — саме це й сталось до цього виправлення).
      `INSERT INTO user_book (id, edition_id, status, started_at, current_page, added_at, updated_at) VALUES ('ub-5','ub-5-edition','did_not_finish','2026-07-02T00:00:00.000Z',0,'2026-07-01T00:00:00.000Z','2026-07-05T00:00:00.000Z')`,
    );
    await db.runAsync(
      `INSERT INTO dnf_reflection (id, user_book_id, page, created_at, updated_at) VALUES ('dnf-5','ub-5',77,'2026-07-06T00:00:00.000Z','2026-07-06T00:00:00.000Z')`,
    );

    await backfillLegacyReadingRuns(db);
    const run = await db.getFirstAsync<{ id: string; status: string }>(`SELECT id, status FROM reading_run WHERE user_book_id = 'ub-5'`);
    expect(run?.status).toBe('did_not_finish');

    await backfillDnfReflectionRunLinks(db);

    expect((await db.getFirstAsync<{ reading_run_id: string }>(`SELECT reading_run_id FROM dnf_reflection WHERE id = 'dnf-5'`))?.reading_run_id).toBe(run?.id);
  });
});

describe('backfillAllLegacyReadingRunLinks — наскрізний сценарій "відновлення старого V1.6 бекапу" (ТЗ Фази 27)', () => {
  /** Файл бекапу, зроблений ДО Фази 6 (`reading_run` іще не існувала, `BACKUP_TABLE_ORDER` її
   * не містив) — жодного ключа `reading_run` у `data`, і жоден рядок сесії/спогаду/капсули/
   * рейтингу/нотатки "До"/DNF-знімка не має поля `reading_run_id` (динамічний INSERT
   * `restoreAll` просто пропускає відсутню колонку — лишається NULL). */
  function buildOldV16BackupData(): BackupData {
    const t0 = '2026-01-01T00:00:00.000Z';
    return {
      work: [
        { id: 'ub-finished-work', title: 'Прочитана книга', created_at: t0, updated_at: t0 },
        { id: 'ub-dnf-work', title: 'Покинута книга', created_at: t0, updated_at: t0 },
      ],
      edition: [
        { id: 'ub-finished-edition', work_id: 'ub-finished-work', title: 'Прочитана книга', language: 'uk', format: 'paperback', created_at: t0, updated_at: t0 },
        { id: 'ub-dnf-edition', work_id: 'ub-dnf-work', title: 'Покинута книга', language: 'uk', format: 'paperback', created_at: t0, updated_at: t0 },
      ],
      user_book: [
        {
          id: 'ub-finished', edition_id: 'ub-finished-edition', status: 'finished',
          started_at: '2026-01-01T00:00:00.000Z', finished_at: '2026-01-10T00:00:00.000Z',
          current_page: 300, added_at: t0, updated_at: '2026-01-10T00:00:00.000Z',
        },
        {
          id: 'ub-dnf', edition_id: 'ub-dnf-edition', status: 'did_not_finish',
          started_at: '2026-02-01T00:00:00.000Z', finished_at: null,
          current_page: 50, added_at: t0, updated_at: '2026-02-05T00:00:00.000Z',
        },
      ],
      // Сесії — БЕЗ `reading_run_id` (старий бекап не знав про це поле).
      reading_session: [
        {
          id: 'session-legacy-1', user_book_id: 'ub-finished', started_at: '2026-01-01T00:00:00.000Z',
          ended_at: '2026-01-10T00:00:00.000Z', paused_intervals: '[]', start_page: 0, end_page: 300,
          duration_seconds: 3600, is_edited: 0, created_at: t0, updated_at: t0,
        },
      ],
      rating: [
        { id: 'rating-legacy-1', user_book_id: 'ub-finished', value: 4.5, created_at: '2026-01-11T00:00:00.000Z', updated_at: '2026-01-11T00:00:00.000Z' },
      ],
      book_memory: [
        { id: 'memory-legacy-1', user_book_id: 'ub-finished', reflection: 'Спогад', entry_refs: '[]', template_id: 'classic', created_at: '2026-01-12T00:00:00.000Z', updated_at: '2026-01-12T00:00:00.000Z' },
      ],
      pre_reading_reflection: [
        { id: 'reflection-legacy-1', user_book_id: 'ub-finished', reason_text: 'Порадили', created_at: t0, updated_at: t0 },
      ],
      book_capsule: [
        { id: 'capsule-legacy-1', user_book_id: 'ub-finished', lasting_thought: 'Думка', reopen_option: 'none', created_at: '2026-01-13T00:00:00.000Z', updated_at: '2026-01-13T00:00:00.000Z' },
      ],
      dnf_reflection: [
        { id: 'dnf-legacy-1', user_book_id: 'ub-dnf', page: 50, created_at: '2026-02-06T00:00:00.000Z', updated_at: '2026-02-06T00:00:00.000Z' },
      ],
    };
  }

  it('після restoreAll (без reading_run у файлі) — сесії/спогади/капсула/рейтинг/нотатка "До"/DNF без зв\'язку; після backfillAllLegacyReadingRunLinks — усі коректно прив\'язані', async () => {
    const db = await openMigratedTestDb();
    await BackupRepository.restoreAll(db, buildOldV16BackupData());

    // Одразу після restoreAll (до backfill) — точнісінько стан, який self-описово впіймав би
    // `session_without_run` (Фаза 26 Data Doctor) на кожній з двох книг.
    const sessionBeforeBackfill = await db.getFirstAsync<{ reading_run_id: string | null }>(
      `SELECT reading_run_id FROM reading_session WHERE id = 'session-legacy-1'`,
    );
    expect(sessionBeforeBackfill?.reading_run_id).toBeNull();
    expect(await db.getAllAsync(`SELECT id FROM reading_run`)).toEqual([]);

    await backfillAllLegacyReadingRunLinks(db);

    const finishedRun = await db.getFirstAsync<{ id: string; status: string }>(
      `SELECT id, status FROM reading_run WHERE user_book_id = 'ub-finished'`,
    );
    expect(finishedRun?.status).toBe('finished');
    const dnfRun = await db.getFirstAsync<{ id: string; status: string }>(
      `SELECT id, status FROM reading_run WHERE user_book_id = 'ub-dnf'`,
    );
    expect(dnfRun?.status).toBe('did_not_finish');

    expect((await db.getFirstAsync<{ reading_run_id: string }>(`SELECT reading_run_id FROM reading_session WHERE id = 'session-legacy-1'`))?.reading_run_id).toBe(finishedRun?.id);
    expect((await db.getFirstAsync<{ reading_run_id: string }>(`SELECT reading_run_id FROM rating WHERE id = 'rating-legacy-1'`))?.reading_run_id).toBe(finishedRun?.id);
    expect((await db.getFirstAsync<{ reading_run_id: string }>(`SELECT reading_run_id FROM book_memory WHERE id = 'memory-legacy-1'`))?.reading_run_id).toBe(finishedRun?.id);
    expect((await db.getFirstAsync<{ reading_run_id: string }>(`SELECT reading_run_id FROM pre_reading_reflection WHERE id = 'reflection-legacy-1'`))?.reading_run_id).toBe(finishedRun?.id);
    expect((await db.getFirstAsync<{ reading_run_id: string }>(`SELECT reading_run_id FROM book_capsule WHERE id = 'capsule-legacy-1'`))?.reading_run_id).toBe(finishedRun?.id);
    expect((await db.getFirstAsync<{ reading_run_id: string }>(`SELECT reading_run_id FROM dnf_reflection WHERE id = 'dnf-legacy-1'`))?.reading_run_id).toBe(dnfRun?.id);

    // Наступний export з ЦІЄЇ (уже доповненої) БД тепер несе reading_run — той самий файл,
    // відновлений ЗНОВУ пізніше, уже НЕ потребував би backfill (перевіряється тестом нижче).
    const reExported = await BackupRepository.exportAll(db);
    expect(reExported.reading_run).toHaveLength(2);
  });

  it('на СУЧАСНОМУ бекапі (reading_run + усі зв\'язки вже в файлі) — виклик після restoreAll нічого не змінює (no-op)', async () => {
    const sourceDb = await openMigratedTestDb();
    await seedFinishedBookWithSession(sourceDb, { userBookId: 'ub-modern-2', startedAt: '2026-08-01T00:00:00.000Z', finishedAt: '2026-08-10T00:00:00.000Z' });
    await backfillLegacyReadingRuns(sourceDb);
    await backfillNewestFinishedRunLink(sourceDb, 'rating');
    await sourceDb.runAsync(
      `INSERT INTO rating (id, user_book_id, value, created_at, updated_at) VALUES ('rating-modern-2','ub-modern-2',5,'2026-08-11T00:00:00.000Z','2026-08-11T00:00:00.000Z')`,
    );
    await backfillNewestFinishedRunLink(sourceDb, 'rating');
    const exported = await BackupRepository.exportAll(sourceDb);
    expect(exported.reading_run).toHaveLength(1);
    expect(exported.rating?.[0]?.reading_run_id).not.toBeNull();

    const targetDb = await openMigratedTestDb();
    await BackupRepository.restoreAll(targetDb, exported);
    await backfillAllLegacyReadingRunLinks(targetDb);

    const reExported = await BackupRepository.exportAll(targetDb);
    // Жодного нового/здубльованого run, жоден reading_run_id не перепризначений — той самий
    // рядок, що прийшов у файлі.
    expect(reExported.reading_run).toHaveLength(1);
    expect(reExported.reading_run?.[0]?.id).toBe(exported.reading_run?.[0]?.id);
    expect(reExported.rating?.[0]?.reading_run_id).toBe(exported.rating?.[0]?.reading_run_id);
  });

  /** POLYTSIA POST-V1.6.2 FOUNDATION CLOSURE — Restore success/semantic-repair invariant.
   *
   * `useRestoreBackup` (`src/features/backup/useBackup.ts`) тепер, якщо цей виклик впаде
   * ПЕРШИЙ раз (напр. тимчасовий збій), повідомляє користувача й пропонує повторити
   * відновлення ще раз із того самого файлу — а це, зі свого боку, викликає
   * `backfillAllLegacyReadingRunLinks` ЗНОВУ на БД, де backfill уже частково (чи повністю)
   * відбувся першого разу. Це підтверджує саме ту гарантію, на якій тримається текст
   * повідомлення користувачу: ПОВТОРНИЙ виклик після часткового чи повного успіху — завжди
   * безпечний no-op, без дублікатів run/зв'язків, незалежно від того, на якому кроці стався
   * (гіпотетичний) збій першого разу. */
  it('повторний виклик backfillAllLegacyReadingRunLinks (симуляція retry після збою) — безпечний no-op, без дублікатів', async () => {
    const db = await openMigratedTestDb();
    await BackupRepository.restoreAll(db, buildOldV16BackupData());

    await backfillAllLegacyReadingRunLinks(db);
    const afterFirstCall = await BackupRepository.exportAll(db);
    expect(afterFirstCall.reading_run).toHaveLength(2);

    // Retry — точнісінько те, що зробить користувач, натиснувши "Спробувати ще раз" після
    // повідомлення про збій обов'язкового відновлення історії перечитувань.
    await backfillAllLegacyReadingRunLinks(db);
    const afterSecondCall = await BackupRepository.exportAll(db);

    expect(afterSecondCall.reading_run).toHaveLength(2);
    expect(afterSecondCall.reading_run?.map((r) => r.id).sort()).toEqual(afterFirstCall.reading_run?.map((r) => r.id).sort());
    expect(afterSecondCall.reading_session?.[0]?.reading_run_id).toBe(afterFirstCall.reading_session?.[0]?.reading_run_id);
    expect(afterSecondCall.rating?.[0]?.reading_run_id).toBe(afterFirstCall.rating?.[0]?.reading_run_id);
    expect(afterSecondCall.book_memory?.[0]?.reading_run_id).toBe(afterFirstCall.book_memory?.[0]?.reading_run_id);
    expect(afterSecondCall.dnf_reflection?.[0]?.reading_run_id).toBe(afterFirstCall.dnf_reflection?.[0]?.reading_run_id);
  });
});
