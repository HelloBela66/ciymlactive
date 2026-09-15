import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { collectMemoryResurfacingCandidates } from '@/features/memory/collectMemoryResurfacingCandidates';
import { journalSemanticKey, runSemanticKey } from '@/lib/memoryResurfacing';
import { JournalRepository } from './JournalRepository';

/**
 * POLYTSIA V1.7, Phase 9 — ТЗ модуль E §19, §27, §31.
 *
 * ЧОМУ ЦЕ РЕПОЗИТОРНИЙ, А НЕ ЧИСТИЙ ТЕСТ. Дві вимоги ТЗ — spoiler-safe при перечитуванні (§31) і
 * збереження спогаду після прибирання книги з Бібліотеки (§19) — виконуються НЕ в
 * `memoryResurfacing.ts`, а в SQL. Перевіряти їх на вигаданих масивах означало б перевіряти
 * власну імітацію запиту. Тому тут справжня БД, справжні міграції і РІВНО та функція, яку
 * викликає продакшн-хук (`collectMemoryResurfacingCandidates`) — той самий підхід, що вже
 * застосований у `readingPeriodParity.test.ts`.
 *
 * Дати — з локальних компонентів через `daysBefore`, не з рядків `'2026-01-01'`.
 */

const NOW = new Date(2027, 5, 15, 12, 0);

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

async function seedBook(
  db: SQLiteDatabase,
  params: {
    id: string;
    title?: string;
    status?: string;
    currentPage?: number;
    pageCount?: number | null;
    spoilerSafeEnabled?: boolean;
    deletedAt?: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(`INSERT INTO work (id, title, created_at, updated_at) VALUES (?,?,?,?)`, [
    `${params.id}-work`,
    params.title ?? `Книга ${params.id}`,
    now,
    now,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, page_count, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      `${params.id}-edition`,
      `${params.id}-work`,
      params.title ?? `Книга ${params.id}`,
      'uk',
      'paperback',
      params.pageCount ?? 300,
      now,
      now,
    ],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, spoiler_safe_enabled, added_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      params.id,
      `${params.id}-edition`,
      params.status ?? 'finished',
      params.currentPage ?? 0,
      params.spoilerSafeEnabled === false ? 0 : 1,
      now,
      now,
      params.deletedAt ?? null,
    ],
  );
}

async function seedNote(
  db: SQLiteDatabase,
  params: {
    id: string;
    userBookId: string;
    text: string;
    page: number | null;
    createdAt: string;
    type?: string;
    isFavorite?: boolean;
    deletedAt?: string | null;
  },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO note (id, user_book_id, page, progress_percent, type, text, is_favorite, created_at, updated_at, deleted_at)
     VALUES (?,?,?,NULL,?,?,?,?,?,?)`,
    [
      params.id,
      params.userBookId,
      params.page,
      params.type ?? 'thought',
      params.text,
      params.isFavorite === false ? 0 : 1,
      params.createdAt,
      params.createdAt,
      params.deletedAt ?? null,
    ],
  );
}

async function seedFinishedRun(
  db: SQLiteDatabase,
  params: { id: string; userBookId: string; runNumber: number; finishedAt: string },
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO reading_run (id, user_book_id, run_number, status, started_at, finished_at, is_legacy_backfill, created_at, updated_at)
     VALUES (?,?,?,'finished',?,?,0,?,?)`,
    [params.id, params.userBookId, params.runNumber, params.finishedAt, params.finishedAt, now, now],
  );
}

// ─── §31 СПОЙЛЕРИ ПРИ ПЕРЕЧИТУВАННІ ───────────────────────────────────────────────────────────

describe('§31 — перечитування: старий запис попереду поточного прогресу не спливає', () => {
  it('перший прохід завершено, другий у процесі — думка з 200-ї сторінки прихована, з 10-ї лишається', async () => {
    const db = await openMigratedTestDb();
    // Книга перечитується: перший прохід давно завершено, поточний прогрес — 50-та сторінка.
    await seedBook(db, { id: 'reread', status: 'rereading', currentPage: 50, pageCount: 300 });
    await seedFinishedRun(db, { id: 'run-1', userBookId: 'reread', runNumber: 1, finishedAt: daysBefore(800) });
    await seedNote(db, {
      id: 'early',
      userBookId: 'reread',
      text: 'Думка з початку книги.',
      page: 10,
      createdAt: daysBefore(900),
    });
    await seedNote(db, {
      id: 'spoiler',
      userBookId: 'reread',
      text: 'Думка про фінал.',
      page: 200,
      createdAt: daysBefore(850),
    });

    const candidates = await collectMemoryResurfacingCandidates(db, NOW);
    const journalKeys = candidates.filter((c) => c.kind === 'journal_memory').map((c) => c.semanticKey);

    expect(journalKeys).toContain(journalSemanticKey('early'));
    expect(journalKeys).not.toContain(journalSemanticKey('spoiler'));
  });

  it('те, що книгу колись дочитано, САМЕ ПО СОБІ не відкриває старі спойлери', async () => {
    // ТЗ §16 прямо про це: «я вже колись завершував книгу» не є дозволом показати весь старий
    // зміст під час нового проходу. Тут перевіряється не окрема гілка коду, а те, що централізована
    // політика (`isSpoilerHidden` рахує `rereading` активним) не обходиться стороною.
    const db = await openMigratedTestDb();
    await seedBook(db, { id: 'r2', status: 'rereading', currentPage: 5, pageCount: 400 });
    await seedFinishedRun(db, { id: 'run-a', userBookId: 'r2', runNumber: 1, finishedAt: daysBefore(1200) });
    await seedFinishedRun(db, { id: 'run-b', userBookId: 'r2', runNumber: 2, finishedAt: daysBefore(600) });
    await seedNote(db, { id: 'ahead', userBookId: 'r2', text: 'Пізня сцена.', page: 350, createdAt: daysBefore(1000) });

    const candidates = await collectMemoryResurfacingCandidates(db, NOW);
    expect(candidates.map((c) => c.semanticKey)).not.toContain(journalSemanticKey('ahead'));
  });

  it('із вимкненим spoiler-safe той самий запис спливає — фільтрує саме політика, а не випадковість', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, { id: 'off', status: 'rereading', currentPage: 50, pageCount: 300, spoilerSafeEnabled: false });
    await seedNote(db, { id: 'late', userBookId: 'off', text: 'Думка про фінал.', page: 200, createdAt: daysBefore(900) });

    const candidates = await collectMemoryResurfacingCandidates(db, NOW);
    expect(candidates.map((c) => c.semanticKey)).toContain(journalSemanticKey('late'));
  });

  it('для завершеної (не активної) книги спойлерів немає за визначенням', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, { id: 'done', status: 'finished', currentPage: 300, pageCount: 300 });
    await seedNote(db, { id: 'end', userBookId: 'done', text: 'Про фінал.', page: 290, createdAt: daysBefore(900) });

    const candidates = await collectMemoryResurfacingCandidates(db, NOW);
    expect(candidates.map((c) => c.semanticKey)).toContain(journalSemanticKey('end'));
  });
});

// ─── §19 ІСТОРІЯ ПЕРЕЖИВАЄ ПРИБИРАННЯ З БІБЛІОТЕКИ ───────────────────────────────────────────

describe('§19 — прибрана з Бібліотеки книга не стирає спогад', () => {
  it('думка й завершене прочитання лишаються спогадами після soft-delete книги', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, { id: 'gone', status: 'finished', deletedAt: daysBefore(5) });
    await seedFinishedRun(db, { id: 'run-gone', userBookId: 'gone', runNumber: 1, finishedAt: daysBefore(700) });
    await seedNote(db, {
      id: 'kept',
      userBookId: 'gone',
      text: 'Те, що я думав під час читання.',
      page: 40,
      createdAt: daysBefore(900),
    });

    const candidates = await collectMemoryResurfacingCandidates(db, NOW);
    const keys = candidates.map((c) => c.semanticKey);
    expect(keys).toContain(journalSemanticKey('kept'));
    expect(keys).toContain(runSemanticKey('run-gone'));
  });

  it('жива стрічка Журналу таку книгу НЕ показує — поведінка інших поверхонь не змінена', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, { id: 'gone2', status: 'finished', deletedAt: daysBefore(5) });
    await seedNote(db, { id: 'hidden', userBookId: 'gone2', text: 'Стара думка.', page: 10, createdAt: daysBefore(900) });

    const feed = await JournalRepository.listFeedPage(db);
    expect(feed.items.map((i) => i.id)).not.toContain('hidden');

    const withDeleted = await JournalRepository.listFeedPage(db, { includeDeletedBooks: true });
    expect(withDeleted.items.map((i) => i.id)).toContain('hidden');
  });

  it('видалений САМ запис лишається невидимим навіть із includeDeletedBooks', async () => {
    // Прибрати книгу з полиці й видалити конкретну думку — різні рішення користувача, і друге
    // прапорцем не скасовується.
    const db = await openMigratedTestDb();
    await seedBook(db, { id: 'alive', status: 'finished' });
    await seedNote(db, {
      id: 'erased',
      userBookId: 'alive',
      text: 'Видалена думка.',
      page: 10,
      createdAt: daysBefore(900),
      deletedAt: daysBefore(100),
    });

    const candidates = await collectMemoryResurfacingCandidates(db, NOW);
    expect(candidates.map((c) => c.semanticKey)).not.toContain(journalSemanticKey('erased'));
  });
});

// ─── §27 ПРИДАТНІСТЬ НА СПРАВЖНІХ ДАНИХ ──────────────────────────────────────────────────────

describe('§27 — придатність кандидата на справжній історії', () => {
  it('DNF-книга не дає спогадів, хоч би які записи в ній лишились', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, { id: 'dnf', status: 'did_not_finish' });
    await seedNote(db, { id: 'dnf-note', userBookId: 'dnf', text: 'Чому я кинув.', page: 30, createdAt: daysBefore(900) });

    const candidates = await collectMemoryResurfacingCandidates(db, NOW);
    expect(candidates.map((c) => c.semanticKey)).not.toContain(journalSemanticKey('dnf-note'));
  });

  it('незавершений прохід активної книги не створює спогаду (ТЗ §28)', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, { id: 'active', status: 'reading', currentPage: 10 });
    await db.runAsync(
      `INSERT INTO reading_run (id, user_book_id, run_number, status, started_at, finished_at, is_legacy_backfill, created_at, updated_at)
       VALUES ('run-open','active',1,'in_progress',?,NULL,0,?,?)`,
      [daysBefore(900), daysBefore(900), daysBefore(900)],
    );

    const candidates = await collectMemoryResurfacingCandidates(db, NOW);
    expect(candidates).toEqual([]);
  });

  it('перечитана книга дає спогад про стосунок із правильною кількістю прочитань', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, { id: 'twice', status: 'finished' });
    await seedFinishedRun(db, { id: 'tw-1', userBookId: 'twice', runNumber: 1, finishedAt: daysBefore(1000) });
    await seedFinishedRun(db, { id: 'tw-2', userBookId: 'twice', runNumber: 2, finishedAt: daysBefore(400) });

    const candidates = await collectMemoryResurfacingCandidates(db, NOW);
    const relationship = candidates.find((c) => c.kind === 'reading_relationship');
    expect(relationship?.finishedRunCount).toBe(2);
    // Рівно один стосунок на твір, а не по одному на кожен прохід.
    expect(candidates.filter((c) => c.kind === 'reading_relationship')).toHaveLength(1);
  });

  it('минулий місяць із завершеною книгою пропонується як Recap, поточний — ні', async () => {
    const db = await openMigratedTestDb();
    await seedBook(db, { id: 'periods', status: 'finished' });
    // Завершення в минулому місяці й у поточному.
    await seedFinishedRun(db, {
      id: 'past',
      userBookId: 'periods',
      runNumber: 1,
      finishedAt: new Date(2026, 7, 20, 12, 0).toISOString(),
    });
    await seedFinishedRun(db, {
      id: 'current',
      userBookId: 'periods',
      runNumber: 2,
      finishedAt: new Date(2027, 5, 2, 12, 0).toISOString(),
    });

    const candidates = await collectMemoryResurfacingCandidates(db, NOW);
    const periodKeys = candidates.filter((c) => c.kind === 'past_period').map((c) => c.periodKey);
    expect(periodKeys).toContain('2026-08');
    expect(periodKeys).toContain('2026');
    expect(periodKeys).not.toContain('2027-06');
    expect(periodKeys).not.toContain('2027');
  });
});
