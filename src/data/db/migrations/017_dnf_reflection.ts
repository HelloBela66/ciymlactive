import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 017 — DNF IMPROVEMENT (POLYTSIA V1.6, Фаза 12). Нова таблиця `dnf_reflection` —
 * детально описано в `docs/DNF_IMPROVEMENT.md`.
 *
 * Той самий "щонайбільше один рядок на книгу" підхід, що й `pre_reading_reflection`
 * (`014_pre_reading_reflection.ts`): `UNIQUE(user_book_id)`, `ON DELETE CASCADE`.
 *
 * Ключові рішення (повне обґрунтування — `docs/DNF_IMPROVEMENT.md` §Архітектура):
 *
 * 1. `page` — `NOT NULL`, а не nullable. На відміну від `lore_entity.first_seen_page`
 *    (користувач міг і не вказати сторінку), тут сторінка ЗАВЖДИ відома — це просто знімок
 *    `user_book.current_page` (уже `NOT NULL INTEGER` з дефолтом 0) у МИТЬ переходу статусу в
 *    "Не дочитав", а не поле, яке заповнює користувач. Рядок узагалі не потребує окремого
 *    `progress_percent` — відсоток для показу рахується на льоту з `page`/`pageCount` видання
 *    (`computeProgressPercent`, той самий підхід, що й решта екранів), бо `page` тут ніколи не
 *    буває `null`.
 * 2. `reason` — вільний `TEXT` без CHECK, той самий "не потрібна нова міграція заради нового
 *    значення" підхід, що й `lore_entity.type`/`note.reaction`: фіксований список (7 причин ТЗ)
 *    живе лише в TypeScript (`DnfReasonId`, `src/design/dnfReason.ts`).
 * 3. `note` — окреме вільне поле (ТЗ: "Optional free text"), незалежне від `reason`: користувач
 *    може лишити нотатку без вибору причини, обрати причину без нотатки, чи і те, і те.
 * 4. `created_at` фіксується РІВНО ОДИН раз — автоматично, при самому переході статусу в "Не
 *    дочитав" (`DnfReflectionRepository.captureIfMissing`, викликається з
 *    `useUpdateUserBookStatus`), а не при першому явному збереженні причини/нотатки
 *    користувачем. Це і є "date" з ТЗ ("Зберігай: page/progress; date; reason; note") —
 *    момент, коли книгу залишили, а не момент, коли хтось повернувся дописати деталі. Повторні
 *    переходи в той самий статус (чи назад і знову) НЕ перезаписують уже зафіксовані
 *    `page`/`created_at` — той самий "не перезаписуємо заднім числом" дух, що й
 *    `user_book.started_at`/`finished_at`.
 */
export const version = 17;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE dnf_reflection (
      id TEXT PRIMARY KEY,
      user_book_id TEXT NOT NULL UNIQUE REFERENCES user_book(id) ON DELETE CASCADE,
      page INTEGER NOT NULL,
      reason TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}
