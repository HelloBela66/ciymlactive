# PERSONAL_LORE.md — «Персонажі» (Фаза 9) → Personal Lore (Фаза 10)

POLYTSIA V1.6, Фаза 9 (CHARACTERS), схема уніфікована одразу під Фазу 10 (PERSONAL LORE). Цей
документ фіксує точну поведінку фічі й архітектурне рішення, яке інакше довелось би пояснювати
заново при кожній міграції (той самий підхід, що й `docs/BOOK_CAPSULES.md`/`docs/RECALL.md`/
`docs/BEFORE_AFTER.md`/`docs/READING_EXPERIENCE_TIMELINE.md`/`docs/STALE_READING_RECAP.md`).

## Мета

ТЗ Фази 9: приватна нотатка користувача про дійових осіб книги — ім'я, коротка примітка,
сторінка першої появи, необов'язкова реакція. НЕ довідник з видавництва, НЕ wiki, НЕ
рецензія — лише те, що читач сам занотував про персонажа під час чи після читання. ТЗ прямо
забороняє: "Не роби NLP entity extraction" — жодного автоматичного визначення дійових осіб з
тексту книги, жодного зовнішнього джерела. Користувач додає й пов'язує персонажів вручну.

## Точка входу

Компактна картка `CharactersSection` — кількість уже доданих персонажів і кнопка "Керувати
персонажами" — на ДВОХ екранах (ТЗ: "На Book Details/Memory: «Персонажі»"):

- `app/work/[workId].tsx` (Book Details) — одразу після `StaleReadingSection`, до "До читання".
- `app/memory/[workId].tsx` (Book Memory) — одразу після `RevisitLaterSection`, до капсули.

Обидва навмисно ведуть на той самий екран `app/characters/[workId].tsx`, той самий "компактна
картка + посилання на власний екран" підхід, що й `BookCapsuleSection`. Картка продубльована
локально на кожному екрані (той самий house-патерн, що й `RevisitLaterEntryLine`/
`StaleReadingSection`) — маленький презентаційний блок без спільного стану.

## Архітектура

### Чому одна таблиця `lore_entity`, а не окрема `character`

Повний текст ТЗ (`docs/V1_6_SPEC.md`) показує PERSONAL LORE (Фаза 10) як пряме розширення тієї
самої моделі — місця/терміни/організації на додачу до персонажів, і прямо застерігає:

> Architecture characters повинна бути розширювана до personal lore... Якщо Character model
> краще уніфікувати як LoreEntity — проаналізуй це ПЕРЕД migration. Не створюй duplicate schema
> лише тому, що prompt спочатку називає Character. Обери чисту domain model.

Оскільки повний текст ТЗ уже показує напрямок Фази 10, окрема `character`-таблиця в Фазі 9 була
б чистим churn, який довелось би мігрувати вже в наступній фазі. Обрано чисту модель одразу:
одна таблиця `lore_entity` з колонкою `type` (`015_lore_entity.ts`).

### Схема

```sql
CREATE TABLE lore_entity (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES work(id) ON DELETE CASCADE,
  type TEXT NOT NULL,               -- LoreEntityType: 'character' | 'place' | 'term' | 'organization'
  name TEXT NOT NULL,
  description TEXT,
  first_seen_page INTEGER,
  first_seen_progress REAL,
  reaction TEXT,                    -- LoreEntityReactionId, лише для type = 'character'
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE journal_lore_link (
  id TEXT PRIMARY KEY,
  lore_entity_id TEXT NOT NULL REFERENCES lore_entity(id) ON DELETE CASCADE,
  entry_kind TEXT NOT NULL CHECK (entry_kind IN ('note', 'quote')),
  entry_id TEXT NOT NULL,           -- м'яке посилання, без FK (той самий патерн, що й tagged_item)
  created_at TEXT NOT NULL,
  UNIQUE (lore_entity_id, entry_kind, entry_id)
);
```

Ключові рішення:

1. **`work_id`, не `user_book_id`.** Персонажі належать твору, а не конкретному примірнику
   книжкової полиці — той самий рівень, що й жанри/теги (`work_genre`/`tagged_item` на `work`).
   Екран доступний і для книг, які ще не додані в бібліотеку.
2. **`type` — вільний `TEXT` без CHECK.** Список типів фіксований лише на рівні TypeScript
   (`LoreEntityType`, `src/types/loreEntity.ts`) — той самий "не потрібна нова міграція заради
   нового значення" підхід, що й `reading_experience`/`note.reaction` по всій цій БД. Схема вже
   підтримує всі чотири типи; Фаза 9 UI показує лише `'character'` — `place`/`term`/
   `organization` з'являться в UI Фази 10 без нової міграції.
3. **`reaction`.** Фаза 9 UI: подобається / не довіряю / смішний / важливий / не подобається /
   інше (`LoreEntityReactionId`, `src/design/loreEntityReaction.ts`) — стосується лише
   персонажів, для інших типів (Фаза 10) лишається `null`.
4. **`first_seen_page`/`first_seen_progress`.** Обидва nullable; `first_seen_progress`
   обчислюється доменним шаром (`computeFirstSeenProgress`, `src/lib/loreEntity.ts`, той самий
   `computeProgressPercent`, що й `ReadingExperienceTimeline`/recap) при створенні/редагуванні
   — не окреме поле форми, менше тертя при швидкому додаванні персонажа під час читання.
5. **`journal_lore_link`.** М'яка полiморфна прив'язка персонажа до запису щоденника
   (`note`/`quote`) — той самий "entity_type/entity_id БЕЗ реального FK на сам запис" патерн,
   що вже є в `tagged_item` (`TagRepository.ts`): запис може належати до одного з двох
   незалежних типів, тож єдиної SQL `REFERENCES`-колонки тут бути не може. `lore_entity_id`,
   навпаки, РЕАЛЬНИЙ FK (`ON DELETE CASCADE`) — завжди рівно один тип батьківської таблиці, той
   самий підхід, що й `capsule_recall.book_capsule_id`. `UNIQUE(lore_entity_id, entry_kind,
   entry_id)` — ідемпотентне зв'язування (`INSERT OR IGNORE`), одна пара персонаж-запис не
   дублюється при повторному натисканні "Пов'язати".
6. **Жодного NLP.** Схема не передбачає "джерела" чи "впевненості" визначення — полів, які
   натякали б на автоматичне визначення; користувач додає й пов'язує персонажів вручну через
   `app/characters/[workId]/[entityId].tsx`.

### Екрани

- `app/characters/[workId].tsx` — список персонажів твору + форма швидкого додавання (ім'я,
  коротка примітка, сторінка першої появи).
- `app/characters/[workId]/[entityId].tsx` — деталі персонажа: редагування імені/опису, чипи
  реакції, перемикач "обране", ручний список зв'язаних записів щоденника (чекбокс-пікер із
  усього щоденника книги), видалення персонажа. Сам персонаж знаходиться фільтром по вже
  завантаженому `useLoreEntities(workId)` — окремого запиту "по одному id" немає (той самий
  підхід, що вже усталений для дрібних деталей, які й так завантажені списком поруч).

## Бекап

`lore_entity`/`journal_lore_link` — реальні дані користувача, входять у `BACKUP_TABLE_ORDER`
(`BackupRepository.ts`): `lore_entity` одразу після `work_genre` (лише реальний FK на `work`,
уже присутній раніше в масиві), `journal_lore_link` — ближче до кінця, поруч із `capsule_recall`
(потребує і `lore_entity`, і `note`/`quote` вище себе для коректного insert-порядку при
restore).

## Приватність

Жодних мережевих викликів, жодного AI/LLM-аналізу — той самий принцип, що й решта memory-фіч
(`docs/BOOK_CAPSULES.md` §Приватність). Персонажі — це нотатки користувача, а не дані, отримані
чи збагачені ззовні.
