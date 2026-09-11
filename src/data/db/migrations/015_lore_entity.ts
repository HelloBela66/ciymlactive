import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Migration 015 — «Персонажі» (POLYTSIA V1.6, Фаза 9: CHARACTERS), уніфікована одразу як
 * PERSONAL LORE (Фаза 10 ТЗ) — детально описано в `docs/PERSONAL_LORE.md`.
 *
 * Ключові архітектурні рішення (повне обґрунтування — `docs/PERSONAL_LORE.md` §Архітектура):
 *
 * 1. ОДНА таблиця `lore_entity` з колонкою `type`, а не окрема `character`-таблиця. ТЗ Фази 10
 *    прямо застерігає: "Якщо Character model краще уніфікувати як LoreEntity — проаналізуй це
 *    ПЕРЕД migration. Не створюй duplicate schema лише тому, що prompt спочатку називає
 *    Character." Оскільки повний текст ТЗ (`docs/V1_6_SPEC.md`) уже показує PERSONAL LORE як
 *    пряме розширення тієї самої моделі (місця/терміни/організації на додачу до персонажів),
 *    окрема `character`-таблиця в Фазі 9 була б чистим churn, який довелось би мігрувати вже в
 *    наступній фазі — обрано чисту domain-модель одразу.
 * 2. `type` — вільний `TEXT` без CHECK (той самий підхід, що й `reading_experience`/`reaction`
 *    по всій цій БД): список типів фіксований лише на рівні TypeScript (`LoreEntityType`,
 *    `src/types/loreEntity.ts`), тож Фаза 10 зможе додати UI для `place`/`term`/`organization`
 *    без нової міграції — уже зараз підтримані на рівні схеми, просто не показані в UI Фази 9
 *    (`isLoreEntityType`/`CHARACTERS_SCOPE_TYPE` — UI-рівень, не тут).
 * 3. `work_id`, НЕ `user_book_id` — той самий рівень, що й жанри/теги (`work_genre`/`tagged_item`
 *    на `work`): персонажі належать твору, а не конкретному примірнику книжкової полиці, і
 *    ТЗ прямо називає поле `workId`. `ON DELETE CASCADE` — той самий вибір, що й `work_genre`.
 * 4. `reaction` — вільний `TEXT` без CHECK (Фаза 9 UI: подобається/не довіряю/смішний/
 *    важливий/не подобається/інше, `src/design/loreEntityReaction.ts`) — стосується лише
 *    `type = 'character'`, для інших типів лишається `NULL`; той самий "не потрібна власна
 *    таблиця на UI-специфічний набір значень" підхід, що й `note.reaction`.
 * 5. `first_seen_page`/`first_seen_progress` — обидва nullable, `first_seen_progress`
 *    обчислюється доменним шаром при створенні (`computeProgressPercent`, той самий, що й
 *    `ReadingExperienceTimeline`/recap), а не вводиться користувачем окремо (менше тертя при
 *    швидкому додаванні персонажа під час читання).
 * 6. `is_favorite` — той самий патерн, що й `user_book.is_favorite`/`note.is_favorite`.
 * 7. `journal_lore_link` — м'яка полiморфна прив'язка персонажа до запису щоденника
 *    (note/quote), той самий "entity_type/entity_id БЕЗ реального FK на entity_id" патерн, що
 *    вже є в `tagged_item` (`TagRepository.ts`) — запис може належати до одного з двох
 *    незалежних типів, тож єдиної реальної SQL REFERENCES-колонки тут бути не може.
 *    `lore_entity_id`, навпаки, РЕАЛЬНИЙ FK (`ON DELETE CASCADE`) — це завжди рівно один тип
 *    батьківської таблиці, той самий підхід, що й `capsule_recall.book_capsule_id`.
 *    `UNIQUE(lore_entity_id, entry_kind, entry_id)` — ідемпотентне зв'язування
 *    (`INSERT OR IGNORE`, той самий підхід, що й `TagRepository.addToWork`), одна пара
 *    персонаж-запис не дублюється при повторному натисканні "Пов'язати".
 * 8. Жодного NLP/entity-екстракції ніде в цій фазі (ТЗ: "Не роби NLP entity extraction") —
 *    користувач додає й пов'язує персонажів вручну, схема це й не передбачає (нема "джерела" чи
 *    "впевненості" — полів, які натякали б на автоматичне визначення).
 */
export const version = 15;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE lore_entity (
      id TEXT PRIMARY KEY,
      work_id TEXT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      first_seen_page INTEGER,
      first_seen_progress REAL,
      reaction TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX idx_lore_entity_work ON lore_entity(work_id);

    CREATE TABLE journal_lore_link (
      id TEXT PRIMARY KEY,
      lore_entity_id TEXT NOT NULL REFERENCES lore_entity(id) ON DELETE CASCADE,
      entry_kind TEXT NOT NULL CHECK (entry_kind IN ('note', 'quote')),
      entry_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (lore_entity_id, entry_kind, entry_id)
    );

    CREATE INDEX idx_journal_lore_link_entity ON journal_lore_link(lore_entity_id);
  `);
}
