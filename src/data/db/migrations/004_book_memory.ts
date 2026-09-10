import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 004 — «Спогад про книгу» (Milestone 11, Фаза 7): нова таблиця `book_memory`.
 *
 * Свідомо ЛЕГКА таблиця на цьому етапі — лише те, що вибирає сам користувач (текст-рефлексія
 * + які записи щоденника він хоче показати поруч), БЕЗ жодних полів про вигляд картки
 * (шаблон/колір/шрифт) чи готове зображення — це прийде окремою адитивною міграцією у Фазі 8
 * («Memory Card model + templates»), коли з'явиться сам конструктор картки. Розділяти дані
 * "що показати" (ця міграція) і "як показати" (Фаза 8) — той самий принцип, що вже
 * використано для `note`/`quote`: мінімальна поверхня зараз, розширення пізніше без
 * переробки вже наявного.
 *
 * `entry_refs` — JSON-масив `{id, kind}` (той самий `JournalEntryKind`, що й у решті
 * щоденника), а НЕ копія тексту записів: `note`/`quote` лишаються єдиним джерелом правди,
 * спогад лише посилається на них за id. Якщо позначений запис пізніше відредаговано чи
 * видалено — читання спогаду (`BookMemoryRepository`/UI) просто фільтрує посилання проти
 * актуального списку записів книги, без окремого механізму очищення "осиротілих" id (той
 * самий підхід, що вже усталений у проєкті — напр. `reading_progress` як єдине джерело
 * правди для прогресу, а не кеш, що синхронізується вручну).
 *
 * `UNIQUE(user_book_id)` — щонайбільше один спогад на книгу (той самий патерн, що й `rating`,
 * `001_base_schema.ts`): екран підсумку читання (`app/completion/[workId].tsx`) ревізитується,
 * тож спогад — це те, що редагують і повертаються переглянути, а не список записів, що
 * накопичується.
 */
export const version = 4;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE book_memory (
      id TEXT PRIMARY KEY,
      user_book_id TEXT NOT NULL UNIQUE REFERENCES user_book(id) ON DELETE CASCADE,
      reflection TEXT,
      entry_refs TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}
