import type { SQLiteDatabase } from 'expo-sqlite';
import { generateId } from '@/lib/uuid';
import { nowIso } from '@/lib/dateUtils';
import type { BookCapsule, CapsuleReopenOption } from '@/types/bookCapsule';
import type { JournalEntryKind } from '@/types/journalEntry';
import { ReadingRunRepository } from './ReadingRunRepository';

interface BookCapsuleRow {
  id: string;
  user_book_id: string;
  reading_run_id: string | null;
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
  deleted_at: string | null;
}

function mapRow(row: BookCapsuleRow): BookCapsule {
  return {
    id: row.id,
    userBookId: row.user_book_id,
    readingRunId: row.reading_run_id,
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
    deletedAt: row.deleted_at,
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
 * «Капсула книги» (POLYTSIA V1.6, Фаза 4; REREADING MODEL, Фаза 10 — `docs/READING_RUN.md`
 * §"Фаза 10") — на відміну від `BookMemoryRepository`, НЕ upsert: `user_book_id` навмисно без
 * `UNIQUE` (`012_book_capsule.ts` — обґрунтування там-таки й у `docs/BOOK_CAPSULES.md`), тож
 * `create`/`update` — окремі операції.
 *
 * `reading_run_id` (Фаза 10, `023_book_capsule_run.ts`) резолвиться через
 * `ReadingRunRepository.getLatestByUserBookId` РІВНО ОДИН РАЗ — усередині `create`, у момент
 * фактичного створення капсули — і більше НІКОЛИ не переобчислюється: на відміну від
 * `BookMemoryRepository.upsertCurrent`/`PreReadingReflectionRepository.upsertCurrent` (де той
 * самий виклик відбувається заново при КОЖНОМУ записі, бо рядок можна редагувати повторно),
 * капсула — це знімок ОДНОГО моменту завершення, записаний назавжди. Звідси й ДВА різні
 * способи читання "поточності", свідомо не об'єднані в один:
 * - `getByUserBookId` — найновіша капсула КНИГИ ЗАГАЛОМ, незалежно від run (те, що
 *   `app/capsule/[workId].tsx`/`app/recall/[workId].tsx` показують для перегляду/recall — ці
 *   екрани навмисно доступні "у будь-який момент", а не лише для поточного run);
 * - `getCurrent` (нижче) — капсула САМЕ поточного (найновішого) run; `null`, якщо для поточного
 *   run капсули ще нема, НАВІТЬ якщо старіші капсули (з попередніх прочитань) існують — саме
 *   цей розрив і використовує `BookCapsuleSection` (`app/completion/[workId].tsx`/
 *   `app/memory/[workId].tsx`), щоб запропонувати НОВУ капсулу для щойно завершеного
 *   перечитування, не ховаючи стару.
 */
export const BookCapsuleRepository = {
  async create(db: SQLiteDatabase, params: CreateBookCapsuleParams): Promise<BookCapsule> {
    const id = generateId();
    const now = nowIso();
    const run = await ReadingRunRepository.getLatestByUserBookId(db, params.userBookId);
    const readingRunId = run?.id ?? null;

    await db.runAsync(
      `INSERT INTO book_capsule (
         id, user_book_id, reading_run_id, lasting_thought, one_sentence_memory, favorite_character_text,
         favorite_lore_entity_id, journal_entry_kind, journal_entry_id, reopen_option, reopen_at,
         opened_at, notification_identifier, completed_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      [
        id,
        params.userBookId,
        readingRunId,
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
      readingRunId,
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
      deletedAt: null,
    };
  },

  async getById(db: SQLiteDatabase, id: string): Promise<BookCapsule | null> {
    const row = await db.getFirstAsync<BookCapsuleRow>(
      `SELECT * FROM book_capsule WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    return row ? mapRow(row) : null;
  },

  /** Найновіша капсула КНИГИ ЗАГАЛОМ, незалежно від run (див. коментар над модулем) — те, що
   * перегляд/recall показують "у будь-який момент". Для капсули САМЕ поточного run — `getCurrent`
   * нижче. */
  async getByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<BookCapsule | null> {
    const row = await db.getFirstAsync<BookCapsuleRow>(
      `SELECT * FROM book_capsule WHERE user_book_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [userBookId],
    );
    return row ? mapRow(row) : null;
  },

  /** Капсула конкретного run напряму — Фаза 10, майбутнє порівняння історії (Фаза 12). Якщо
   * (теоретично, без UNIQUE) кілька капсул припадають на той самий run — найновіша. */
  async getByReadingRunId(db: SQLiteDatabase, readingRunId: string): Promise<BookCapsule | null> {
    const row = await db.getFirstAsync<BookCapsuleRow>(
      `SELECT * FROM book_capsule WHERE reading_run_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [readingRunId],
    );
    return row ? mapRow(row) : null;
  },

  /** Капсула САМЕ поточного (найновішого) run книги — `null`, якщо для цього run капсули ще
   * нема, навіть коли старіші капсули (попередніх прочитань) існують (див. коментар над
   * модулем). Книга без жодного `reading_run` (Фаза 7 `addToLibrary`, не підключена) фолбечить
   * на "книжкову" капсулу без прив'язки (`reading_run_id IS NULL`) — той самий підхід, що й
   * `BookMemoryRepository`/`PreReadingReflectionRepository`. */
  async getCurrent(db: SQLiteDatabase, userBookId: string): Promise<BookCapsule | null> {
    const run = await ReadingRunRepository.getLatestByUserBookId(db, userBookId);
    const row = run
      ? await db.getFirstAsync<BookCapsuleRow>(
          `SELECT * FROM book_capsule WHERE reading_run_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
          [run.id],
        )
      : await db.getFirstAsync<BookCapsuleRow>(
          `SELECT * FROM book_capsule WHERE user_book_id = ? AND reading_run_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
          [userBookId],
        );
    return row ? mapRow(row) : null;
  },

  /** Усі капсули книги, найновіша перша — п.30/46 ТЗ (сценарій перечитування: стара капсула не
   * повинна зникати навіть якщо з'явиться новіша). Поки що UI показує лише `getByUserBookId`
   * (найновішу), але метод потрібен вже зараз для repository-тестів і майбутнього UI списку. */
  async listByUserBookId(db: SQLiteDatabase, userBookId: string): Promise<BookCapsule[]> {
    const rows = await db.getAllAsync<BookCapsuleRow>(
      `SELECT * FROM book_capsule WHERE user_book_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
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

  /** SOFT-DELETE READINESS (POLYTSIA V1.6.1, Фаза 26, `027_soft_delete_readiness.ts`) — М'ЯКЕ
   * видалення (`deleted_at`), НЕ фізичне `DELETE`, той самий сенс, що й `user_book.remove`/
   * `reading_session.remove` тощо. Капсула несе незамінний, написаний користувачем текст —
   * фізичне стирання назавжди прибирало можливість відновлення без будь-якої користі (на
   * відміну від, скажімо, `Shelf`, який не несе історичного контенту — докладніше
   * `docs/SOFT_DELETE_READINESS.md`). Побічний ефект: `capsule_recall.book_capsule_id REFERENCES
   * book_capsule(id) ON DELETE CASCADE` (`013_capsule_recall.ts`) більше НЕ спрацьовує тут —
   * рядок `book_capsule` фізично лишається, тож recall-історія видаленої капсули відтепер теж
   * зберігається (раніше — знищувалась безповоротно разом із капсулою). Той самий ефект, що вже
   * задокументований для `book_capsule.user_book_id ON DELETE CASCADE` проти м'яко видаленого
   * `user_book` (коментар у `012_book_capsule.ts`) — навмисно, не забута деталь.
   */
  async remove(db: SQLiteDatabase, id: string): Promise<void> {
    await db.runAsync(`UPDATE book_capsule SET deleted_at = ? WHERE id = ?`, [nowIso(), id]);
  },

  /** ТЗ Фази 18 (HOME REDESIGN §HOME SHORTCUTS, «Моя пам'ять», `useMemoryIndex.ts`) — усі
   * капсули застосунку, найновіша перша. Капсул завжди мало (п.45 ТЗ Фази 4), тож повна вибірка
   * без пагінації лишається дешевою — той самий підхід, що й `ReadingSessionRepository.
   * listAllCompleted` для значно більшої таблиці сесій. */
  async listAll(db: SQLiteDatabase): Promise<BookCapsule[]> {
    const rows = await db.getAllAsync<BookCapsuleRow>(
      `SELECT * FROM book_capsule WHERE deleted_at IS NULL ORDER BY created_at DESC`,
    );
    return rows.map(mapRow);
  },

  /** П.23/46 ТЗ — капсули, чий `reopenAt` уже настав (`<= referenceDateIso`) — підготовча
   * точка інтеграції для майбутньої Фази Recall (`getDueCapsules`-еквівалент); з Фази 18
   * (HOME REDESIGN) також основа "Book Capsule ready" контекстної картки Home
   * (`src/lib/homeContext.ts#findCapsuleDueCandidate`, `openedAt`-фільтр — там же). */
  async getDue(db: SQLiteDatabase, referenceDateIso: string): Promise<BookCapsule[]> {
    const rows = await db.getAllAsync<BookCapsuleRow>(
      `SELECT * FROM book_capsule WHERE reopen_at IS NOT NULL AND reopen_at <= ? AND deleted_at IS NULL ORDER BY reopen_at ASC`,
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
      `SELECT * FROM book_capsule WHERE reopen_at IS NOT NULL AND reopen_at > ? AND deleted_at IS NULL ORDER BY reopen_at ASC`,
      [referenceDateIso],
    );
    return rows.map(mapRow);
  },
};
