import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { BookCapsule, CapsuleReopenOption } from '@/types/bookCapsule';
import type { JournalEntryKind } from '@/types/journalEntry';

interface BookCapsuleRow {
  id: string;
  user_book_id: string;
  lasting_thought: string | null;
  one_sentence_memory: string | null;
  favorite_character_text: string | null;
  favorite_lore_entity_id: string | null;
  journal_entry_kind: JournalEntryKind | null;
  journal_entry_id: string | null;
  reopen_option: CapsuleReopenOption;
  reopen_at: string | null;
  opened_at: string | null;
  notification_identifier: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: BookCapsuleRow): BookCapsule {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    lastingThought: row.lasting_thought,
    oneSentenceMemory: row.one_sentence_memory,
    favoriteCharacterText: row.favorite_character_text,
    favoriteLoreEntityId: row.favorite_lore_entity_id,
    journalEntryKind: row.journal_entry_kind,
    journalEntryId: row.journal_entry_id,
    reopenOption: row.reopen_option,
    reopenAt: row.reopen_at,
    openedAt: row.opened_at,
    notificationIdentifier: row.notification_identifier,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateBookCapsuleParams {
  userBookId: string;
  lastingThought: string | null;
  oneSentenceMemory: string | null;
  favoriteCharacterText: string | null;
  favoriteLoreEntityId: string | null;
  journalEntryKind: JournalEntryKind | null;
  journalEntryId: string | null;
  reopenOption: CapsuleReopenOption;
  /** Уже обчислена доменним шаром (`calculateCapsuleReopenAt`) — репозиторій сам жодної дати
   * не рахує (п.47 ТЗ, "domain service", не тут). */
  reopenAt: string | null;
  notificationIdentifier: string | null;
  completedAt: string | null;
}

export interface UpdateBookCapsuleParams {
  id: string;
  lastingThought: string | null;
  oneSentenceMemory: string | null;
  favoriteCharacterText: string | null;
  favoriteLoreEntityId: string | null;
  journalEntryKind: JournalEntryKind | null;
  journalEntryId: string | null;
  reopenOption: CapsuleReopenOption;
  reopenAt: string | null;
  notificationIdentifier: string | null;
}

/**
 * «Капсула книги» (POLYTSIA V1.6, Фаза 4) — на відміну від `BookMemoryRepository`, НЕ upsert:
 * `user_book_id` навмисно без `UNIQUE` (`012_book_capsule.ts` — обґрунтування там-таки й у
 * `docs/BOOK_CAPSULES.md`), тож `create`/`update` — окремі операції, а "поточна" капсула книги
 * — найновіша за `created_at` (`getByUserBookId`).
 */
export const BookCapsuleRepository = {
  async create(db: SQLiteDatabase, params: CreateBookCapsuleParams): Promise<BookCapsule> {
    const id = generateId();
    const now = nowIso();

    await db.runAsync(
      `INSERT INTO book_capsule (
         id, user_book_id, lasting_thought, one_sentence_memory, favorite_character_text,
         favorite_lore_entity_id, journal_entry_kind, journal_entry_id, reopen_option, reopen_at,
         opened_at, notification_identifier, completed_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      [
        id,
        params.userBookId,
        params.lastingThought,
        params.oneSentenceMemory,
        params.favoriteCharacterText,
        params.favoriteLoreEntityId,
        params.journalEntryKind,
        params.journalEntryId,
        params.reopenOption,
        params.reopenAt,
        params.notificationIdentifier,
        params.completedAt,
        now,
        now,
      ],
    );

    return {
      id,
      userBookId: params.userBookId,
      lastingThought: params.lastingThought,
      oneSentenceMemory: params.oneSentenceMemory,
      favoriteCharacterText: params.favoriteCharacterText,
      favoriteLoreEntityId: params.favoriteLoreEntityId,
      journalEntryKind: params.journalEntryKind,
      journalEntryId: params.journalEntryId,
      reopenOption: params.reopenOption,
      reopenAt: params.reopenAt,
      openedAt: null,
      notificationIdentifier: params.notificationIdentifier,
      completedAt: params.completedAt,
      createdAt: now,
      updatedAt: now,
    };
  },

  async getById(db: SQLiteDatabase, id: string): Promise<BookCapsule | null> {
    const row = await db.getFirstAsync<BookCapsuleRow>(`SELECT * FROM book_capsule WHERE id = ?`, [id]);
    return row ? mapRow(row) : null;
  },

  /** "Поточна" капсула книги — найновіша за `created_at` (див. коментар над модулем). */
  async getByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<BookCapsule | null> {
    const row = await db.getFirstAsync<BookCapsuleRow>(
      `SELECT * FROM book_capsule WHERE user_book_id = ? ORDER BY created_at DESC LIMIT 1`,
      [userBookId],
    );
    return row ? mapRow(row) : null;
  },

  /** Усі капсули книги, найновіша перша — п.30/46 ТЗ (сценарій перечитування: стара капсула не
   * повинна зникати навіть якщо з'явиться новіша). Поки що UI показує лише `getByUserBookId`
   * (найновішу), але метод потрібен вже зараз для repository-тестів і майбутнього UI списку. */
  async listByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<BookCapsule[]> {
    const rows = await db.getAllAsync<BookCapsuleRow>(
      `SELECT * FROM book_capsule WHERE user_book_id = ? ORDER BY created_at DESC`,
      [userBookId],
    );
    return rows.map(mapRow);
  },

  async update(db: SQLiteDatabase, params: UpdateBookCapsuleParams): Promise<void> {
    await db.runAsync(
      `UPDATE book_capsule SET
         lasting_thought = ?, one_sentence_memory = ?, favorite_character_text = ?,
         favorite_lore_entity_id = ?, journal_entry_kind = ?, journal_entry_id = ?,
         reopen_option = ?, reopen_at = ?, notification_identifier = ?, updated_at = ?
       WHERE id = ?`,
      [
        params.lastingThought,
        params.oneSentenceMemory,
        params.favoriteCharacterText,
        params.favoriteLoreEntityId,
        params.journalEntryKind,
        params.journalEntryId,
        params.reopenOption,
        params.reopenAt,
        params.notificationIdentifier,
        nowIso(),
        params.id,
      ],
    );
  },

  /** П.19 ТЗ — "viewed" стан (переглянуто ПІСЛЯ настання `reopenAt`), окремо від редагування
   * контенту вище. */
  async markOpened(db: SQLiteDatabase, id: string, openedAt: string): Promise<void> {
    await db.runAsync(`UPDATE book_capsule SET opened_at = ? WHERE id = ?`, [openedAt, id]);
  },

  /** Лише оновлення `notification_identifier` — окремий метод, а не повний `update`, для
   * "тихого" перепланування після відновлення бекапу (п.36 ТЗ, `useRestoreBackup`), де решта
   * контенту капсули не змінюється. */
  async setNotificationIdentifier(db: SQLiteDatabase, id: string, notificationIdentifier: string | null): Promise<void> {
    await db.runAsync(`UPDATE book_capsule SET notification_identifier = ? WHERE id = ?`, [
      notificationIdentifier,
      id,
    ]);
  },

  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`DELETE FROM book_capsule WHERE id = ?`, [id]);
  },

  /** ТЗ Фази 18 (HOME REDESIGN §HOME SHORTCUTS, «Моя пам'ять», `useMemoryIndex.ts`) — усі
   * капсули застосунку, найновіша перша. Капсул завжди мало (п.45 ТЗ Фази 4), тож повна вибірка
   * без пагінації лишається дешевою — той самий підхід, що й `ReadingSessionRepository.
   * listAllCompleted` для значно більшої таблиці сесій. */
  async listAll(db: SQLiteDatabase): Promise<BookCapsule[]> {
    const rows = await db.getAllAsync<BookCapsuleRow>(`SELECT * FROM book_capsule ORDER BY created_at DESC`);
    return rows.map(mapRow);
  },

  /** П.23/46 ТЗ — капсули, чий `reopenAt` уже настав (`<= referenceDateIso`) — підготовча
   * точка інтеграції для майбутньої Фази Recall (`getDueCapsules`-еквівалент); з Фази 18
   * (HOME REDESIGN) також основа "Book Capsule ready" контекстної картки Home
   * (`src/lib/homeContext.ts#findCapsuleDueCandidate`, `openedAt`-фільтр — там же). */
  async getDue(db: SQLiteDatabase, referenceDateIso: string): Promise<BookCapsule[]> {
    const rows = await db.getAllAsync<BookCapsuleRow>(
      `SELECT * FROM book_capsule WHERE reopen_at IS NOT NULL AND reopen_at <= ? ORDER BY reopen_at ASC`,
      [referenceDateIso],
    );
    return rows.map(mapRow);
  },

  /** Капсули з нагадуванням у МАЙБУТНЬОМУ відносно `referenceDateIso` — п.36 ТЗ: після
   * відновлення бекапу дані капсули відновлюються, але OS-розклад сповіщень — ні
   * (`useRestoreBackup`, rebuild крок). Минулі `reopenAt` свідомо виключені (п.36: "Не
   * scheduling notifications для reopenAt у минулому"). */
  async listWithFutureReminder(db: SQLiteDatabase, referenceDateIso: string): Promise<BookCapsule[]> {
    const rows = await db.getAllAsync<BookCapsuleRow>(
      `SELECT * FROM book_capsule WHERE reopen_at IS NOT NULL AND reopen_at > ? ORDER BY reopen_at ASC`,
      [referenceDateIso],
    );
    return rows.map(mapRow);
  },
};
