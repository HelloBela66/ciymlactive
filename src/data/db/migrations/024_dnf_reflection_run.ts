import type { SQLiteDatabase } from 'expo-sqlite';
import { backfillDnfReflectionRunLinks } from '@/data/db/legacyRunBackfill';

/**
 * Migration 024 — REREADING MODEL, Фаза 11 (POLYTSIA V1.6.1). `docs/READING_RUN.md` §"Фаза 11"
 * — повне обґрунтування; тут стисло, що саме робить ця міграція і чому.
 *
 * ПРОБЛЕМА (задача: "Run #1 abandoned і Run #2 started пізніше — дві різні історії, старий DNF
 * snapshot не перезаписується"): `dnf_reflection` має `UNIQUE(user_book_id)`
 * (`017_dnf_reflection.ts`) — щонайбільше ОДИН знімок "Не дочитав" на книгу. Книга, яку
 * покинули, потім знову почали читати й покинули ВДРУГЕ — `captureIfMissing` бачить уже наявний
 * рядок і НІЧОГО не робить (той самий "не перезаписуємо заднім числом" запобіжник, що й
 * задокументовано в `017_dnf_reflection.ts`, п.4) — тому другий знімок (інша сторінка, інша
 * дата) просто НІКОЛИ не фіксується. Перше покинуте прочитання назавжди "маскує" друге.
 *
 * РІШЕННЯ — ЧАСТИНА 1 (schema, rebuild): той самий rebuild-ідіом, що й `021_book_memory_run.ts`/
 * `022_pre_reading_reflection_run.ts` (SQLite не підтримує ALTER TABLE для зміни UNIQUE):
 * `UNIQUE(user_book_id)` → `UNIQUE(reading_run_id)`. `_new` + `INSERT ... SELECT` + `DROP` +
 * `RENAME`, `PRAGMA foreign_keys` OFF перед транзакцією / ON у `finally`, `PRAGMA
 * foreign_key_check` одразу після rebuild. `reading_run_id` — СВІДОМО БЕЗ
 * `REFERENCES reading_run(id)` (той самий, уже задокументований у цьому проєкті урок, що й у
 * `020`/`021`/`022`) — nullable (книга без жодного run, той самий фолбек, що й у Фазах 8-10).
 *
 * РІШЕННЯ — ЧАСТИНА 2 (backfill, JS-цикл — той самий виняток із декларативного SQL, що й
 * `020`/`021`/`022`/`023`): на відміну від `021`/`022` (пріоритет "найновіший `finished` АБО
 * `did_not_finish`, інакше найновіший run узагалі"), тут — ІНША логіка, з двох причин одразу:
 *
 * 1. `dnf_reflection` МОЖЕ належати ЛИШЕ `did_not_finish`-run'у — концептуально неможливо, щоб
 *    знімок "Не дочитав" стосувався run'у, що закінчився `finished` (чи ще `in_progress`).
 *    Прив'язка до такого run'у була б архітектурно хибною, тому, на відміну від `021`/`022`,
 *    ТУТ НЕМАЄ фолбеку на "найновіший run узагалі" — лише `did_not_finish`-кандидати; якщо
 *    жодного немає, `reading_run_id` лишається `NULL` (той самий принцип "не вигадувати
 *    історію", що й скрізь у цьому проєкті), а не прив'язується до чогось напевно неправильного.
 * 2. До цієї міграції `captureIfMissing` спрацьовував ЩОНАЙБІЛЬШЕ ОДИН РАЗ на все життя книги
 *    (через старий `UNIQUE(user_book_id)`) — тобто легасі-рядок міг зафіксувати ПЕРШИЙ епізод
 *    "Не дочитав", навіть якщо книгу покидали кілька разів і найновіший `did_not_finish`-run —
 *    зовсім інший, пізніший. Тому, як і в `023_book_capsule_run.ts` (там — та сама причина:
 *    легасі-капсул могло бути кілька), збіг шукається НЕ "найновіший `did_not_finish`-run
 *    книги", а найближчий ЗА ЧАСОМ до `dnf_reflection.created_at`: `finished_at <= created_at`
 *    (той самий момент `now`, що й `captureIfMissing`/`ReadingRunRepository.finish` записують
 *    все в ОДНІЙ мутації — `useUpdateUserBookStatus`), найновіший серед таких. Якщо жодного
 *    `did_not_finish`-run з `finished_at <= created_at` нема — фолбек на НАЙНОВІШИЙ
 *    `did_not_finish`-run книги (навіть якщо він технічно ПІЗНІШЕ за created_at — краще
 *    прив'язати до правильного за ТИПОМ run'у з неідеальним часом, ніж лишити без прив'язки
 *    книгу, що точно мала бодай один такий run). Інакше — `NULL`.
 */
export const version = 24;
export const manualTransaction = true;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE dnf_reflection_new (
          id TEXT PRIMARY KEY,
          user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
          reading_run_id TEXT UNIQUE,
          page INTEGER NOT NULL,
          reason TEXT,
          note TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO dnf_reflection_new (
          id, user_book_id, reading_run_id, page, reason, note, created_at, updated_at
        )
        SELECT id, user_book_id, NULL, page, reason, note, created_at, updated_at
        FROM dnf_reflection;

        DROP TABLE dnf_reflection;

        ALTER TABLE dnf_reflection_new RENAME TO dnf_reflection;

        CREATE INDEX idx_dnf_reflection_user_book ON dnf_reflection(user_book_id);
      `);
    });

    const violations = await db.getAllAsync<Record<string, unknown>>('PRAGMA foreign_key_check');
    if (violations.length > 0) {
      throw new Error(`Migration 024: foreign_key_check знайшов порушення: ${JSON.stringify(violations)}`);
    }
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }

  // ЧАСТИНА 2 (backfill) винесена в `src/data/db/legacyRunBackfill.ts`
  // (`backfillDnfReflectionRunLinks`, POLYTSIA V1.6.1, Фаза 27) — дослівно той самий алгоритм,
  // що й тут був раніше, лише перевикористовується ще й `BackupRepository`-відновленням старих
  // бекапів.
  await db.withTransactionAsync(async () => {
    await backfillDnfReflectionRunLinks(db);
  });
}
