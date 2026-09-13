import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 027 — SOFT-DELETE READINESS (POLYTSIA V1.6.1, Фаза 26). `docs/SOFT_DELETE_READINESS.md`
 * — повне обґрунтування; тут стисло, що саме робить ця міграція і чому.
 *
 * `docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 54 (готовність до V2/sync), CODE VERIFIED знахідка:
 * `deleted_at` soft-delete вже є на `user_book`/`edition`/`work`/`note`/`quote`/`note_category`/
 * `lore_entity`/`reading_session`/`reading_run` — але БЕЗ `book_capsule`/`book_memory`/`rating`,
 * трьох таблиць, що зберігають так само незамінний, написаний користувачем текст (лишаючу думку,
 * речення-спогад, вільний текст про персонажа, рефлексію, рецензію в оцінці), яких
 * `BookCapsuleRepository.remove`/`BookMemoryRepository.remove`/`RatingRepository.remove` ДОСІ
 * стирали фізично (`DELETE FROM ...`) без жодної можливості відновлення. Розділ 90/розділ 5531-
 * 5536 (пункт 10 рекомендацій) прямо називає це прогалиною, яку варто закрити "перед тим, як
 * ускладнювати модель синхронізацією" — точно те, що робить ця фаза.
 *
 * Просте `ALTER TABLE ... ADD COLUMN deleted_at TEXT` (без `rebuild`, на відміну від
 * `021`/`022`/`023`/`024`/`025` — ті мали справу з UNIQUE-обмеженнями, яких SQLite не дає
 * змінити без rebuild; тут лише додається nullable-колонка, що SQLite підтримує напряму) — для
 * всіх наявних рядків нове значення `NULL` (== "не видалено"), той самий сенс, що вже
 * встановлений для кожної іншої `deleted_at`-колонки в цій схемі. Жодного backfill не потрібно.
 *
 * `Shelf`/`ReadingGoal`/`Reminder` (решта трьох сутностей зі списку ТЗ Фази 26) СВІДОМО НЕ
 * отримують `deleted_at` цією міграцією — докладне обґрунтування для кожної окремо (уже наявний
 * код-коментар "чому саме жорстко" у відповідному репозиторії, тут лише посилання, не
 * повторення) — `docs/SOFT_DELETE_READINESS.md` §"Свідомо не зроблено".
 */
export const version = 27;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    ALTER TABLE book_capsule ADD COLUMN deleted_at TEXT;
    ALTER TABLE book_memory ADD COLUMN deleted_at TEXT;
    ALTER TABLE rating ADD COLUMN deleted_at TEXT;
  `);
}
