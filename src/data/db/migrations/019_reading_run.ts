import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 019 — REREADING MODEL, Фаза 6 (POLYTSIA V1.6.1). Нова таблиця `reading_run` —
 * докладне архітектурне обґрунтування в `docs/READING_RUN.md`.
 *
 * `docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 23 ("REREADING MODEL — критичний розділ"):
 * застосунок технічно НЕ розрізняє перше читання від перечитування — існує лише мутабельний
 * `user_book.status = 'rereading'`, без жодного запису історії. Аудит прямо називає це
 * HYPOTHESIS-висновком, на який неодноразово посилаються коментарі мінімум 4 інших міграцій/
 * lib-файлів (`012_book_capsule.ts`, `014_pre_reading_reflection.ts`, `004_book_memory.ts`,
 * `src/lib/bookCapsule.ts`) як на "те саме задокументоване обмеження".
 *
 * Ця міграція вводить сутність, яка закриває цю прогалину, — і НІЧОГО БІЛЬШЕ: жодна інша
 * таблиця, репозиторій чи UI цієї фази не торкається. Свідомо мінімальний перший крок
 * (`ReadingRun schema/domain` — ТЗ Фази 6), окремо від:
 * - Фази 6b — nullable `reading_session.reading_run_id` + backfill legacy-рядків;
 * - Фази 7 — фактичне "прив'язування" нових сесій/переходів статусу до конкретного run;
 * - Фаз 8-11 — те саме для Book Memory / Before-After / Capsule-Recall / DNF.
 *
 * Ключові рішення (повне обґрунтування — `docs/READING_RUN.md` §Архітектура):
 *
 * 1. **`user_book_id` — REFERENCES ... ON DELETE CASCADE**, той самий рівень, що й
 *    `reading_session`/`dnf_reflection`: run належить конкретній книзі користувача, не твору.
 * 2. **`run_number`** — 1, 2, 3... в межах одного `user_book_id`, монотонно зростає (ніколи не
 *    перевикористовується, навіть якщо проміжний run пізніше "скасовано" через `discard`) —
 *    `UNIQUE(user_book_id, run_number)` без урахування `deleted_at`, щоб номер лишався
 *    однозначним посиланням назавжди для будь-якого майбутнього FK з інших таблиць.
 * 3. **`status`** — СВІДОМО НЕ дублює `UserBookStatus` (пряма вимога ТЗ Фази 6): лише термінальний
 *    результат самого прочитання (`in_progress`/`finished`/`did_not_finish`), а не поточний
 *    UI-стан книги. `user_book.status = 'paused'` — це пауза в межах того самого `in_progress`
 *    run, не нова сутність.
 * 4. **Немає жорсткого DB-обмеження "лише один `in_progress` run на книгу".** Свідома
 *    відповідність тому самому підходу, що вже перевірено й задокументовано тестами
 *    `ReadingSessionRepository.getActiveSession` (Фаза 5): "активний" визначається запитом
 *    (найновіший за `run_number`), а не UNIQUE-індексом — так само стійко до накопичення кількох
 *    незавершених рядків, без ризику, що сам констрейнт заблокує легітимний майбутній сценарій,
 *    який ця фаза ще не передбачає.
 * 5. **`is_legacy_backfill`** — прапорець "цей run створено заднім числом бекфілом Фази 6b, а не
 *    зафіксовано в реальний момент дії користувача". Уся ця фаза (019) НІЧОГО не бекфілить —
 *    прапорець лише зарезервовано тут заздалегідь, щоб Фазі 6b не знадобилась ще одна міграція
 *    лише заради одного стовпця.
 * 6. **`deleted_at`** — м'яке видалення, той самий сенс, що й `reading_session.deleted_at`
 *    ("скасувати" помилково розпочатий run, наприклад одразу відмінений перехід у
 *    `rereading` — відновлення "осиротілого" стану, а не форма UI).
 */
export const version = 19;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE reading_run (
      id TEXT PRIMARY KEY,
      user_book_id TEXT NOT NULL REFERENCES user_book(id) ON DELETE CASCADE,
      run_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress','finished','did_not_finish')),
      started_at TEXT NOT NULL,
      finished_at TEXT,
      is_legacy_backfill INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      UNIQUE (user_book_id, run_number)
    );

    CREATE INDEX idx_reading_run_user_book ON reading_run(user_book_id);
  `);
}
