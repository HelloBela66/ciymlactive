import type { SQLiteDatabase } from 'expo-sqlite';
import { backfillNewestFinishedRunLink } from '@/data/db/legacyRunBackfill';

/**
 * Migration 022 — REREADING MODEL, Фаза 9 (POLYTSIA V1.6.1). `docs/READING_RUN.md` — повне
 * обґрунтування; тут стисло, що саме робить ця міграція і чому. Дзеркалить
 * `021_book_memory_run.ts` (Фаза 8) майже один-в-один — та сама проблема, те саме рішення,
 * інша таблиця.
 *
 * ПРОБЛЕМА (`docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 23, п.6, CODE VERIFIED):
 * `pre_reading_reflection` має `UNIQUE(user_book_id)` (`014_pre_reading_reflection.ts`) —
 * щонайбільше ОДНА нотатка "До читання" на книгу. Перечитування книги (новий `reading_run`,
 * Фаза 6) не отримує власної нотатки "До" — новий `upsert` перезаписав би стару, а форма
 * взагалі недоступна повторно (`canEditPreReadingReflection` дозволяє запис лише за
 * `status === 'reading'`, `docs/BEFORE_AFTER.md` §"Відоме обмеження").
 *
 * РІШЕННЯ — ЧАСТИНА 1 (schema, rebuild): `user_book_id` перестає бути унікальним (кожен run
 * книги може мати власну нотатку "До"), з'являється нова колонка `reading_run_id TEXT UNIQUE`
 * — нове обмеження "щонайбільше одна нотатка НА RUN" замість старого "щонайбільше одна на
 * книгу". Той самий rebuild-ідіом, що й `021_book_memory_run.ts`/`002_book_source_isbndb.ts`:
 * `PRAGMA foreign_keys` вимикається ПЕРЕД транзакцією, rebuild — в одній ручній транзакції,
 * `PRAGMA foreign_key_check` одразу після, `foreign_keys` вмикається назад у `finally`.
 * `reading_run_id` — СВІДОМО БЕЗ `REFERENCES reading_run(id)`, той самий уже задокументований у
 * проєкті урок (`008_note_category.ts`, `020_reading_run_backfill.ts`, `021_book_memory_run.ts`):
 * FK з rebuild-таблиці ризикує мовчки обнулитись при майбутньому rebuild `reading_run`.
 * `reading_run` ніколи не видаляється жорстко (лише `discard()`), тож посилання ніколи фізично
 * не "звисає" в порожнечу навіть без SQL FK. `user_book_id NOT NULL REFERENCES user_book(id)
 * ON DELETE CASCADE` лишається — той самий сенс, що й раніше.
 *
 * `reading_run_id` — NULLABLE: книга без жодного `reading_run` (Фаза 7 `addToLibrary`, свідомо
 * не підключена) і далі може мати "книжкову" нотатку без прив'язки до run — той самий фолбек,
 * що `PreReadingReflectionRepository.getCurrent`/`upsertCurrent` використовують. `UNIQUE` на
 * nullable-колонці в SQLite не забороняє кілька `NULL`.
 *
 * РІШЕННЯ — ЧАСТИНА 2 (backfill наявних рядків, JS-цикл — той самий виняток із декларативного
 * SQL, що й `020_reading_run_backfill.ts`/`021_book_memory_run.ts`): пріоритет вибору "якого
 * run" тут той самий, що й у Фазі 8, і з тієї самої причини — `PreReadingReflectionRepository
 * .getCurrent`/`upsertCurrent` (нижче) читають через `ReadingRunRepository.getLatestByUserBookId`
 * (найновіший run книги НЕЗАЛЕЖНО від статусу), а не `getActiveByUserBookId`: екран порівняння
 * До/Після на Book Memory (`app/memory/[workId].tsx`) показує нотатку "До" вже ПІСЛЯ завершення
 * читання, коли run більше не `in_progress` — тож backfill мусить лінкувати наявну нотатку саме
 * до того run, який `getLatestByUserBookId` знайде, інакше вона "зникне" з порівняння. Пріоритет:
 * (1) найновіший `finished`/`did_not_finish` run книги; (2) якщо такого немає — найновіший run
 * узагалі (навіть `in_progress`); (3) якщо книга взагалі не має жодного run — `reading_run_id`
 * лишається `NULL` (той самий принцип "не вигадувати історію", що й у Фазах 6b/8).
 */
export const version = 22;
export const manualTransaction = true;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE pre_reading_reflection_new (
          id TEXT PRIMARY KEY,
          user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
          reading_run_id TEXT UNIQUE,
          reason_text TEXT,
          expectation_text TEXT,
          expected_rating REAL CHECK (
            expected_rating IS NULL
            OR (expected_rating >= 0.5 AND expected_rating <= 5 AND (expected_rating * 2) = CAST(expected_rating * 2 AS INTEGER))
          ),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO pre_reading_reflection_new (
          id, user_book_id, reading_run_id, reason_text, expectation_text, expected_rating, created_at, updated_at
        )
        SELECT id, user_book_id, NULL, reason_text, expectation_text, expected_rating, created_at, updated_at
        FROM pre_reading_reflection;

        DROP TABLE pre_reading_reflection;

        ALTER TABLE pre_reading_reflection_new RENAME TO pre_reading_reflection;

        CREATE INDEX idx_pre_reading_reflection_user_book ON pre_reading_reflection(user_book_id);
      `);
    });

    const violations = await db.getAllAsync<Record<string, unknown>>('PRAGMA foreign_key_check');
    if (violations.length > 0) {
      throw new Error(`Migration 022: foreign_key_check знайшов порушення: ${JSON.stringify(violations)}`);
    }
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }

  // ЧАСТИНА 2 (backfill) винесена в `src/data/db/legacyRunBackfill.ts`
  // (`backfillNewestFinishedRunLink`, POLYTSIA V1.6.1, Фаза 27) — дослівно той самий алгоритм,
  // що й тут був раніше, лише перевикористовується ще й `BackupRepository`-відновленням старих
  // бекапів.
  await db.withTransactionAsync(async () => {
    await backfillNewestFinishedRunLink(db, 'pre_reading_reflection');
  });
}
