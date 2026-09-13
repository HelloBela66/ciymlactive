import type { SQLiteDatabase } from 'expo-sqlite';
import { backfillNewestFinishedRunLink } from '@/data/db/legacyRunBackfill';

/**
 * Migration 025 — REREADING MODEL, Фаза 12 (POLYTSIA V1.6.1). `docs/READING_RUN.md`
 * §"Фаза 12" — повне обґрунтування; тут стисло, що саме робить ця міграція і чому.
 *
 * ПРОБЛЕМА: `rating` мала `UNIQUE(user_book_id)` — щонайбільше ОДНА оцінка на книгу.
 * `RatingRepository.upsert` перезаписував її БЕЗПОВОРОТНО при кожному новому виклику —
 * перечитування книги (нова, вища чи нижча оцінка) стирало оцінку попереднього прочитання без
 * сліду. На відміну від Capsule/Memory/Before-After/DNF (Фази 8-11), рейтинг не був навіть
 * ЗГАДАНИЙ у жодній із попередніх фаз REREADING MODEL чи в аудиті — ця прогалина виявлена лише
 * зараз, при проєктуванні порівняння прочитань ("Як змінилася книга для тебе", Фаза 12 ТЗ), яке
 * прямо вимагає рейтинг як одну з осей порівняння: без прив'язки до run порівнювати НІЧЕГО —
 * оцінка завжди лише одна, найновіша.
 *
 * РІШЕННЯ — schema (rebuild, той самий ідіом, що й `021`/`022`/`024`): `UNIQUE(user_book_id)` →
 * `UNIQUE(reading_run_id)`. `reading_run_id` — nullable, СВІДОМО без SQL `REFERENCES` (той
 * самий урок, що й у `020`-`024`).
 *
 * РІШЕННЯ — backfill: той самий пріоритет, що й `021`/`022` (НЕ обмежений лише
 * `did_not_finish`, на відміну від `024` — рейтинг, на відміну від DNF-знімка, цілком може
 * стосуватись і `finished`, і `did_not_finish` run'у, книгу можна оцінити навіть не дочитавши):
 * для кожного наявного рейтингу — найновіший `finished`/`did_not_finish` run книги, інакше
 * найновіший run узагалі, інакше `reading_run_id` лишається `NULL`.
 *
 * ВАЖЛИВО — зовнішні читачі `RatingRepository.listByUserBookIds` (Wrapped/Сезони/Профіль
 * читача/"Цього дня") НЕ торкаються цієї міграції напряму, але сам метод оновлений (окремо від
 * схеми) повертати НАЙНОВІШУ оцінку книги серед (тепер можливо кількох) рядків — той самий
 * принцип, що й `BookCapsuleRepository.getByUserBookId` (Фаза 10): зовнішні споживачі й далі
 * отримують "оцінку книги", просто тепер це явно "найновіша", а не "єдина можлива". Детальніше
 * — коментар над `RatingRepository` у самому репозиторії.
 */
export const version = 25;
export const manualTransaction = true;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE rating_new (
          id TEXT PRIMARY KEY,
          user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
          reading_run_id TEXT UNIQUE,
          value REAL NOT NULL CHECK (value >= 0.5 AND value <= 5 AND (value * 2) = CAST(value * 2 AS INTEGER)),
          review TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO rating_new (
          id, user_book_id, reading_run_id, value, review, created_at, updated_at
        )
        SELECT id, user_book_id, NULL, value, review, created_at, updated_at
        FROM rating;

        DROP TABLE rating;

        ALTER TABLE rating_new RENAME TO rating;

        CREATE INDEX idx_rating_user_book ON rating(user_book_id);
      `);
    });

    const violations = await db.getAllAsync<Record<string, unknown>>('PRAGMA foreign_key_check');
    if (violations.length > 0) {
      throw new Error(`Migration 025: foreign_key_check знайшов порушення: ${JSON.stringify(violations)}`);
    }
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }

  // ЧАСТИНА 2 (backfill) винесена в `src/data/db/legacyRunBackfill.ts`
  // (`backfillNewestFinishedRunLink`, POLYTSIA V1.6.1, Фаза 27) — дослівно той самий алгоритм,
  // що й тут був раніше, лише перевикористовується ще й `BackupRepository`-відновленням старих
  // бекапів.
  await db.withTransactionAsync(async () => {
    await backfillNewestFinishedRunLink(db, 'rating');
  });
}
