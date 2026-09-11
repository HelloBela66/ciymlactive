import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 014 — «До/Після» (POLYTSIA V1.6, Фаза 6: BEFORE/AFTER). Нова таблиця
 * `pre_reading_reflection` — детально описано в `docs/BEFORE_AFTER.md`.
 *
 * Ключові архітектурні рішення (повне обґрунтування — `docs/BEFORE_AFTER.md` §Архітектура):
 *
 * 1. `UNIQUE(user_book_id)` — щонайбільше один рядок на книгу, той самий сенс, що й
 *    `rating`/`book_memory` (`001_base_schema.ts`/`004_book_memory.ts`): це НЕ накопичувана
 *    історія (на відміну від `capsule_recall`), а один живий стан "чого чекав від ЦІЄЇ
 *    книги", тому запис — upsert. Той самий відомий компроміс, що вже задокументовано для
 *    `book_capsule` при перечитуванні (`012_book_capsule.ts` п.1): друге проходження
 *    `rereading` перезаписало б попередню рефлексію, а не завело нову — прийнятно для V1.6,
 *    задокументоване обмеження.
 * 2. `reason_text`/`expectation_text` — два окремі nullable текстові поля, один-в-один із
 *    двома питаннями ТЗ Фази 6 ("Чому хочеш прочитати цю книгу?" / "Чого очікуєш?"). Третій
 *    рядок ТЗ ("Який настрій/очікування?") трактується як уточнення ДРУГОГО питання (той
 *    самий текст, ширше сформульований), а не окреме третє поле — навмисне спрощення
 *    («коли нова функція конфліктує зі спрощенням... обирай спрощення», головний принцип
 *    продукту): третє окреме поле дублювало б "Чого очікуєш?" майже дослівно.
 * 3. `expected_rating` — той самий CHECK, що й `rating.value` (крок 0.5, 0.5-5), лише
 *    додатково `IS NULL` у диз'юнкції — на відміну від фактичної оцінки, очікувана оцінка
 *    справді необов'язкова (ТЗ: "Expected rating optional").
 * 4. Немає окремого поля/таблиці для "після" — ТЗ прямо каже "Book Memory МОЖЕ показати"
 *    порівняння До/Після, а не збирати ще один текст. "Після" на екрані порівняння —
 *    вже наявні `book_memory.reflection` (Фаза 7 ТЗ) і `rating.value` (п.23 ТЗ), обидва
 *    записуються там, де й раніше (Completion screen) — нуль нового UI для "після" і нуль
 *    дублювання вже зібраних даних (той самий дух, що й PHASE 20 ТЗ: "Не створюй таблицю для
 *    derived analytics, якщо дані можна безпечно обчислити").
 * 5. `created_at` НЕ оновлюється при повторному збереженні (лише `updated_at`) — саме
 *    `created_at` лишається "миттю ДО читання", навіть якщо користувач кілька разів підправив
 *    текст, доки книга ще в статусі "Читаю".
 *
 * `ON DELETE CASCADE` на `user_book_id` — той самий вибір, що й `rating`/`book_memory`/
 * `book_capsule`: застосунок лише м'яко видаляє `user_book` (`deleted_at`), тож CASCADE тут
 * ніколи фактично не спрацьовує при звичайному використанні.
 */
export const version = 14;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE pre_reading_reflection (
      id TEXT PRIMARY KEY,
      user_book_id TEXT NOT NULL UNIQUE REFERENCES user_book(id) ON DELETE CASCADE,
      reason_text TEXT,
      expectation_text TEXT,
      expected_rating REAL CHECK (
        expected_rating IS NULL
        OR (expected_rating >= 0.5 AND expected_rating <= 5 AND (expected_rating * 2) = CAST(expected_rating * 2 AS INTEGER))
      ),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}
