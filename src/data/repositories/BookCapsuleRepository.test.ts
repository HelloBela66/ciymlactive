import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '@/data/db/migrationRunner';
import { openTestDatabase } from '@/data/db/testDb';
import { BookCapsuleRepository } from './BookCapsuleRepository';

/**
 * Repository-інтеграційний тест для `BookCapsuleRepository` (POLYTSIA V1.6, Фаза 4 — «Капсула
 * книги»). Той самий `openMigratedTestDb()`/seed-патерн, що й `OnThisDayRepository.test.ts`.
 */

const NOW = '2026-01-01T00:00:00.000Z';

async function openMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = await openTestDatabase();
  await migrateDbIfNeeded(db);
  return db;
}

async function seedUserBook(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync(`INSERT INTO work (id, title, cover_fallback_color, created_at, updated_at) VALUES (?,?,?,?,?)`, [
    `${id}-work`,
    `Книга ${id}`,
    '#123456',
    NOW,
    NOW,
  ]);
  await db.runAsync(
    `INSERT INTO edition (id, work_id, title, language, format, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [`${id}-edition`, `${id}-work`, `Книга ${id}`, 'uk', 'paperback', NOW, NOW],
  );
  await db.runAsync(
    `INSERT INTO user_book (id, edition_id, status, current_page, started_at, finished_at, added_at, updated_at)
     VALUES (?, ?, 'finished', 0, ?, ?, ?, ?)`,
    [id, `${id}-edition`, NOW, NOW, NOW, NOW],
  );
}

async function seedNote(db: SQLiteDatabase, id: string, userBookId: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO note (id, user_book_id, type, text, tags, created_at, updated_at) VALUES (?, ?, 'general', ?, '[]', ?, ?)`,
    [id, userBookId, 'Нотатка', NOW, NOW],
  );
}

describe('BookCapsuleRepository', () => {
  it('create — повертає капсулу з усіма полями, opened_at і notification_identifier null за замовчуванням', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');

    const capsule = await BookCapsuleRepository.create(db, {
      userBookId: 'ub-1',
      lastingThought: 'Ця книга навчила мене чекати.',
      oneSentenceMemory: null,
      favoriteCharacterText: null,
      favoriteLoreEntityId: null,
      journalEntryKind: null,
      journalEntryId: null,
      reopenOption: 'none',
      reopenAt: null,
      notificationIdentifier: null,
      completedAt: NOW,
    });

    expect(capsule.userBookId).toBe('ub-1');
    expect(capsule.lastingThought).toBe('Ця книга навчила мене чекати.');
    expect(capsule.openedAt).toBeNull();
    expect(capsule.notificationIdentifier).toBeNull();
    expect(capsule.reopenOption).toBe('none');
  });

  it('getById / getByUserBookId — читають щойно створену капсулу', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    const created = await BookCapsuleRepository.create(db, {
      userBookId: 'ub-1',
      lastingThought: 'Думка',
      oneSentenceMemory: null,
      favoriteCharacterText: null,
      favoriteLoreEntityId: null,
      journalEntryKind: null,
      journalEntryId: null,
      reopenOption: 'none',
      reopenAt: null,
      notificationIdentifier: null,
      completedAt: null,
    });

    const byId = await BookCapsuleRepository.getById(db, created.id);
    expect(byId?.id).toBe(created.id);

    const byUserBook = await BookCapsuleRepository.getByUserBookId(db, 'ub-1');
    expect(byUserBook?.id).toBe(created.id);
  });

  it('getByUserBookId — коли капсули немає, повертає null', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    expect(await BookCapsuleRepository.getByUserBookId(db, 'ub-1')).toBeNull();
  });

  it('update — оновлює контент і reopen-поля, updatedAt змінюється', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    const created = await BookCapsuleRepository.create(db, {
      userBookId: 'ub-1',
      lastingThought: 'Стара думка',
      oneSentenceMemory: null,
      favoriteCharacterText: null,
      favoriteLoreEntityId: null,
      journalEntryKind: null,
      journalEntryId: null,
      reopenOption: 'none',
      reopenAt: null,
      notificationIdentifier: null,
      completedAt: null,
    });

    await BookCapsuleRepository.update(db, {
      id: created.id,
      lastingThought: 'Нова думка',
      oneSentenceMemory: 'Одним реченням',
      favoriteCharacterText: null,
      favoriteLoreEntityId: null,
      journalEntryKind: null,
      journalEntryId: null,
      reopenOption: '6_months',
      reopenAt: '2026-07-01T00:00:00.000Z',
      notificationIdentifier: 'notif-1',
    });

    const updated = await BookCapsuleRepository.getById(db, created.id);
    expect(updated?.lastingThought).toBe('Нова думка');
    expect(updated?.oneSentenceMemory).toBe('Одним реченням');
    expect(updated?.reopenOption).toBe('6_months');
    expect(updated?.reopenAt).toBe('2026-07-01T00:00:00.000Z');
    expect(updated?.notificationIdentifier).toBe('notif-1');
  });

  it('nullable поля — усі текстові/reopen-поля коректно зберігаються як null', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    const created = await BookCapsuleRepository.create(db, {
      userBookId: 'ub-1',
      lastingThought: null,
      oneSentenceMemory: null,
      favoriteCharacterText: 'Пол Атрідес',
      favoriteLoreEntityId: null,
      journalEntryKind: null,
      journalEntryId: null,
      reopenOption: 'none',
      reopenAt: null,
      notificationIdentifier: null,
      completedAt: null,
    });
    expect(created.lastingThought).toBeNull();
    expect(created.oneSentenceMemory).toBeNull();
    expect(created.reopenAt).toBeNull();
    expect(created.completedAt).toBeNull();
  });

  it('journal-зв’язок — journalEntryKind/journalEntryId зберігаються й читаються', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    await seedNote(db, 'note-1', 'ub-1');

    const created = await BookCapsuleRepository.create(db, {
      userBookId: 'ub-1',
      lastingThought: null,
      oneSentenceMemory: null,
      favoriteCharacterText: null,
      favoriteLoreEntityId: null,
      journalEntryKind: 'note',
      journalEntryId: 'note-1',
      reopenOption: 'none',
      reopenAt: null,
      notificationIdentifier: null,
      completedAt: null,
    });

    expect(created.journalEntryKind).toBe('note');
    expect(created.journalEntryId).toBe('note-1');
  });

  it('видалення позначеного запису щоденника НЕ видаляє й не ламає капсулу (м’яке посилання, без SQL FK)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    await seedNote(db, 'note-1', 'ub-1');

    const created = await BookCapsuleRepository.create(db, {
      userBookId: 'ub-1',
      lastingThought: null,
      oneSentenceMemory: null,
      favoriteCharacterText: null,
      favoriteLoreEntityId: null,
      journalEntryKind: 'note',
      journalEntryId: 'note-1',
      reopenOption: 'none',
      reopenAt: null,
      notificationIdentifier: null,
      completedAt: null,
    });

    await db.runAsync(`UPDATE note SET deleted_at = ? WHERE id = ?`, [NOW, 'note-1']);

    const stillThere = await BookCapsuleRepository.getById(db, created.id);
    expect(stillThere).not.toBeNull();
    // Посилання лишається як є (лениве узгодження, той самий підхід, що й `book_memory.entry_refs`)
    // — саме читання UI-шаром фільтрує проти актуального списку записів, не цей репозиторій.
    expect(stillThere?.journalEntryId).toBe('note-1');
  });

  it('remove — видаляє рядок; getById більше нічого не повертає', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    const created = await BookCapsuleRepository.create(db, {
      userBookId: 'ub-1',
      lastingThought: 'Думка',
      oneSentenceMemory: null,
      favoriteCharacterText: null,
      favoriteLoreEntityId: null,
      journalEntryKind: null,
      journalEntryId: null,
      reopenOption: 'none',
      reopenAt: null,
      notificationIdentifier: null,
      completedAt: null,
    });

    await BookCapsuleRepository.remove(db, created.id);
    expect(await BookCapsuleRepository.getById(db, created.id)).toBeNull();
  });

  it('кілька книг — капсули різних userBookId не змішуються', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    await seedUserBook(db, 'ub-2');
    await BookCapsuleRepository.create(db, {
      userBookId: 'ub-1',
      lastingThought: 'Про книгу 1',
      oneSentenceMemory: null,
      favoriteCharacterText: null,
      favoriteLoreEntityId: null,
      journalEntryKind: null,
      journalEntryId: null,
      reopenOption: 'none',
      reopenAt: null,
      notificationIdentifier: null,
      completedAt: null,
    });
    await BookCapsuleRepository.create(db, {
      userBookId: 'ub-2',
      lastingThought: 'Про книгу 2',
      oneSentenceMemory: null,
      favoriteCharacterText: null,
      favoriteLoreEntityId: null,
      journalEntryKind: null,
      journalEntryId: null,
      reopenOption: 'none',
      reopenAt: null,
      notificationIdentifier: null,
      completedAt: null,
    });

    expect((await BookCapsuleRepository.getByUserBookId(db, 'ub-1'))?.lastingThought).toBe('Про книгу 1');
    expect((await BookCapsuleRepository.getByUserBookId(db, 'ub-2'))?.lastingThought).toBe('Про книгу 2');
  });

  it('перечитування (п.13/30 ТЗ) — друга капсула тієї самої книги НЕ витісняє першу; getByUserBookId бере найновішу, listByUserBookId — обидві', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');

    const first = await BookCapsuleRepository.create(db, {
      userBookId: 'ub-1',
      lastingThought: 'Перше прочитання',
      oneSentenceMemory: null,
      favoriteCharacterText: null,
      favoriteLoreEntityId: null,
      journalEntryKind: null,
      journalEntryId: null,
      reopenOption: 'none',
      reopenAt: null,
      notificationIdentifier: null,
      completedAt: null,
    });
    // Різний `createdAt` гарантується вручну (обидва створюються з тим самим `nowIso()` у
    // тесті теоретично можуть збігтись до мілісекунди) — після другого `create` явно
    // перевіряємо ЗМІСТ, а не покладаємось на сортування за рівним таймстемпом.
    const second = await BookCapsuleRepository.create(db, {
      userBookId: 'ub-1',
      lastingThought: 'Перечитання',
      oneSentenceMemory: null,
      favoriteCharacterText: null,
      favoriteLoreEntityId: null,
      journalEntryKind: null,
      journalEntryId: null,
      reopenOption: 'none',
      reopenAt: null,
      notificationIdentifier: null,
      completedAt: null,
    });

    const all = await BookCapsuleRepository.listByUserBookId(db, 'ub-1');
    expect(all).toHaveLength(2);
    expect(new Set(all.map((c) => c.id))).toEqual(new Set([first.id, second.id]));

    // Стара капсула не змінилась.
    const firstAfter = await BookCapsuleRepository.getById(db, first.id);
    expect(firstAfter?.lastingThought).toBe('Перше прочитання');
  });

  it('getDue — повертає лише капсули з reopenAt у минулому/зараз, не в майбутньому', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    await seedUserBook(db, 'ub-2');

    const due = await BookCapsuleRepository.create(db, {
      userBookId: 'ub-1',
      lastingThought: 'Due',
      oneSentenceMemory: null,
      favoriteCharacterText: null,
      favoriteLoreEntityId: null,
      journalEntryKind: null,
      journalEntryId: null,
      reopenOption: '3_months',
      reopenAt: '2026-01-01T00:00:00.000Z',
      notificationIdentifier: null,
      completedAt: null,
    });
    await BookCapsuleRepository.create(db, {
      userBookId: 'ub-2',
      lastingThought: 'Не ще',
      oneSentenceMemory: null,
      favoriteCharacterText: null,
      favoriteLoreEntityId: null,
      journalEntryKind: null,
      journalEntryId: null,
      reopenOption: '1_year',
      reopenAt: '2030-01-01T00:00:00.000Z',
      notificationIdentifier: null,
      completedAt: null,
    });

    const dueList = await BookCapsuleRepository.getDue(db, '2026-06-01T00:00:00.000Z');
    expect(dueList).toHaveLength(1);
    expect(dueList[0]?.id).toBe(due.id);
  });

  it('listWithFutureReminder — повертає лише капсули з reopenAt у майбутньому (для rebuild після restore)', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    await seedUserBook(db, 'ub-2');

    await BookCapsuleRepository.create(db, {
      userBookId: 'ub-1',
      lastingThought: 'Минуле',
      oneSentenceMemory: null,
      favoriteCharacterText: null,
      favoriteLoreEntityId: null,
      journalEntryKind: null,
      journalEntryId: null,
      reopenOption: '3_months',
      reopenAt: '2026-01-01T00:00:00.000Z',
      notificationIdentifier: null,
      completedAt: null,
    });
    const future = await BookCapsuleRepository.create(db, {
      userBookId: 'ub-2',
      lastingThought: 'Майбутнє',
      oneSentenceMemory: null,
      favoriteCharacterText: null,
      favoriteLoreEntityId: null,
      journalEntryKind: null,
      journalEntryId: null,
      reopenOption: '1_year',
      reopenAt: '2030-01-01T00:00:00.000Z',
      notificationIdentifier: null,
      completedAt: null,
    });

    const futureList = await BookCapsuleRepository.listWithFutureReminder(db, '2026-06-01T00:00:00.000Z');
    expect(futureList).toHaveLength(1);
    expect(futureList[0]?.id).toBe(future.id);
  });

  it('markOpened / setNotificationIdentifier — точкові оновлення без зміни решти полів', async () => {
    const db = await openMigratedTestDb();
    await seedUserBook(db, 'ub-1');
    const created = await BookCapsuleRepository.create(db, {
      userBookId: 'ub-1',
      lastingThought: 'Думка',
      oneSentenceMemory: null,
      favoriteCharacterText: null,
      favoriteLoreEntityId: null,
      journalEntryKind: null,
      journalEntryId: null,
      reopenOption: 'none',
      reopenAt: null,
      notificationIdentifier: null,
      completedAt: null,
    });

    await BookCapsuleRepository.markOpened(db, created.id, '2026-09-11T00:00:00.000Z');
    await BookCapsuleRepository.setNotificationIdentifier(db, created.id, 'notif-xyz');

    const after = await BookCapsuleRepository.getById(db, created.id);
    expect(after?.openedAt).toBe('2026-09-11T00:00:00.000Z');
    expect(after?.notificationIdentifier).toBe('notif-xyz');
    expect(after?.lastingThought).toBe('Думка');
  });
});
