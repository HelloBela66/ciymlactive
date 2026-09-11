import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 012 — «Капсула книги» (POLYTSIA V1.6, Фаза 4: BOOK CAPSULE). Нова таблиця
 * `book_capsule` — детально описано в `docs/BOOK_CAPSULES.md`.
 *
 * Ключові архітектурні рішення (повне обґрунтування — `docs/BOOK_CAPSULES.md` §Архітектура):
 *
 * 1. `user_book_id` БЕЗ `UNIQUE` (на відміну від `book_memory.user_book_id`,
 *    `004_book_memory.ts`): застосунок не має окремої сутності "прочитання"/"reading run"
 *    (`user_book.finished_at` — це дата ПЕРШОГО завершення й ніколи не оновлюється при
 *    перечитуванні, `UserBookRepository.updateStatus`), тож капсулу неможливо надійно
 *    прив'язати до конкретного прочитання. Щоб не заблокувати майбутнє перечитування
 *    другою капсулою, унікальність тут НЕ вводиться — тимчасове рішення, явно задокументоване
 *    як обмеження (п.13/30 ТЗ Фази 4).
 * 2. `journal_entry_kind`/`journal_entry_id` — М'ЯКЕ (не SQL FK) посилання на `note`/`quote`,
 *    той самий патерн, що вже усталений для `book_memory.entry_refs` (JSON-масив `{id,kind}`
 *    без FK, `004_book_memory.ts`): полів двох незалежних таблиць (`note`/`quote`) не можна
 *    одним SQL FK описати. Видалення позначеного запису щоденника НЕ видаляє й не ламає
 *    капсулу — читання просто не знаходить запис і показує картку без цієї секції (те саме
 *    "лениве" узгодження, що й у `book_memory`).
 * 3. `favorite_lore_entity_id` — порожня, ще не використовувана колонка "про запас": Personal
 *    Lore/Characters (Фази 9-10 ТЗ) ще не реалізовано. Коли з'явиться, `favorite_character_text`
 *    (вільний текст, доступний вже зараз) і це поле зможуть співіснувати — Capsule не залежить
 *    від Lore ні зараз, ні структурно в майбутньому.
 * 4. `reopen_option` зберігається ОКРЕМО від обчисленого `reopen_at` — потрібно знати, чи
 *    користувач ЗМІНИВ пресет при редагуванні (щоб перепланувати сповіщення лише тоді, коли
 *    це справді потрібно, п.17 ТЗ), а не лише яка вийшла підсумкова дата.
 * 5. `notification_identifier` — той самий патерн, що й `reminder.notification_identifier`
 *    (`001_base_schema.ts`): повертається `expo-notifications` при плануванні, зберігається
 *    для подальшого скасування/ідемпотентного перепланування.
 * 6. `completed_at` — знімок `user_book.finished_at` НА МОМЕНТ СТВОРЕННЯ капсули (не live
 *    посилання): чисто інформаційне поле для показу "Завершено ..." на екрані капсули, не
 *    ключ для пошуку/унікальності (див. п.1 вище).
 *
 * `ON DELETE CASCADE` на `user_book_id` — той самий вибір, що й `book_memory` — застосунок
 * лише м'яко видаляє `user_book` (`deleted_at`), тож CASCADE тут ніколи фактично не
 * спрацьовує при звичайному використанні; про capsule-після-soft-delete окремо піклується
 * `dataIntegrityDoctor.ts` (`capsule_references_deleted_book`), той самий підхід, що й для
 * `reading_session`/`note`/`quote` проти видаленої книги.
 */
export const version = 12;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE book_capsule (
      id TEXT PRIMARY KEY,
      user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
      lasting_thought TEXT,
      one_sentence_memory TEXT,
      favorite_character_text TEXT,
      favorite_lore_entity_id TEXT,
      journal_entry_kind TEXT CHECK (journal_entry_kind IN ('note','quote')),
      journal_entry_id TEXT,
      reopen_option TEXT NOT NULL DEFAULT 'none' CHECK (reopen_option IN ('none','3_months','6_months','1_year')),
      reopen_at TEXT,
      opened_at TEXT,
      notification_identifier TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX idx_book_capsule_user_book ON book_capsule(user_book_id);
    CREATE INDEX idx_book_capsule_reopen_at ON book_capsule(reopen_at);
  `);
}
