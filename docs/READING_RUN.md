# READING_RUN.md — REREADING MODEL, Фаза 6 (POLYTSIA V1.6.1)

Цей документ фіксує архітектурне рішення `reading_run` і дорожню карту фаз, які його
підключають — той самий підхід, що й `docs/SPOILER_SAFE.md`/`docs/DNF_IMPROVEMENT.md`/
`docs/BEFORE_AFTER.md`: зафіксувати рішення один раз, а не пояснювати заново в кожній наступній
фазі.

## Проблема (`docs/V1_6_FULL_AUDIT_REPORT.md`, розділ 23)

Аудит V1.6 назвав це "критичним розділом": застосунок технічно **не розрізняє** перше читання
від перечитування як дві окремі події. Єдине, що існує, — `user_book.status` може приймати
значення `'rereading'` (мутабельний прапорець UI-стану, не подія й не запис історії). Наслідки,
підтверджені CODE VERIFIED (не гіпотези):

- `user_book.started_at`/`finished_at` фіксуються лише один раз і ніколи не оновлюються при
  перечитуванні — дата другого завершення не фіксується ніде.
- `reading_session` не має жодного маркера "якого це прочитання" — уся історія сесій книги
  (перше читання + будь-яка кількість перечитувань) лежить в одній плоскій, нерозділеній
  послідовності.
- Статистика й Wrapped **реально недораховують** книги: перехід `'finished'` → `'rereading'`
  прибирає книгу з `booksFinishedAllTime`/Wrapped за рік першого прочитання, хоча `finished_at`
  фізично й досі в базі (обидва запити фільтрують за поточним `status`, не за наявністю дати).
- Book Memory й Before/After (`UNIQUE(user_book_id)`) **втрачають** дані попереднього
  прочитання при повторному збереженні — другий `upsert` затирає перший безповоротно.
- Capsule свідомо НЕ пропонується для перечитування — задокументована прогалина UX
  (`src/lib/bookCapsule.ts`, `canCreateCapsule`), а не баг, саме через відсутність цієї сутності.

Мінімум 4 різних міграції/lib-файли (`012_book_capsule.ts`, `014_pre_reading_reflection.ts`,
`004_book_memory.ts`, `src/lib/bookCapsule.ts`) прямим текстом посилаються одне на одне як на
"те саме задокументоване обмеження" — очікуючи саме цю сутність.

## Рішення: `reading_run`

Одне конкретне "проходження" книги — перше читання, перечитування №2, №3... Кожен запис
`reading_session` (у майбутньому) належатиме РІВНО одному `reading_run`; `user_book.status`
лишається "поточним станом бібліотечної картки" й НЕ дублюється тут.

### Схема (`019_reading_run.ts`)

```sql
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
```

### Ключові рішення

1. **`status` свідомо НЕ дублює `UserBookStatus`** (пряма вимога ТЗ Фази 6). Лише термінальний
   результат самого прочитання: `in_progress` / `finished` / `did_not_finish`.
   `user_book.status = 'paused'` — пауза в межах того самого `in_progress` run, не нова
   сутність і не привід додавати четверте значення сюди.
2. **`run_number`** — 1, 2, 3... у межах одного `user_book_id`, монотонно зростає і ніколи не
   перевикористовується (навіть крізь `discard`), щоб бути однозначним, стабільним посиланням
   назавжди для будь-якого майбутнього FK з інших таблиць (Book Memory, Before/After, Capsule,
   DNF — Фази 8-11).
3. **Немає жорсткого DB-обмеження "лише один `in_progress` run на книгу".** Свідома
   відповідність тому самому підходу, що вже перевірено тестами
   `ReadingSessionRepository.getActiveSession` (Фаза 5): "активний" визначається запитом
   (найновіший `run_number`), а не UNIQUE-індексом на рівні схеми — стійко до накопичення
   кількох незавершених рядків, без ризику заблокувати легітимний сценарій, якого ця фаза ще
   не передбачає.
4. **`is_legacy_backfill`** — зарезервовано для Фази 6b: `true` означає, що run створено заднім
   числом із наявних `started_at`/`finished_at`/сесій/статусу, а не зафіксовано в реальний
   момент дії користувача. Ця фаза (6) стовпець лише додає — нічого ним не заповнює.
5. **`deleted_at`** — м'яке видалення, той самий сенс, що й `reading_session.deleted_at`:
   скасувати помилково розпочатий run.

### `ReadingRunRepository`

`getById`, `listByUserBookId` (найстаріший перший), `getActiveByUserBookId` (найновіший
`in_progress`, той самий "graceful" підхід, що й `getActiveSession`), `start` (обчислює
наступний `run_number`), `finish` (ідемпотентний — повторний виклик не перезаписує вже
зафіксований результат, той самий підхід, що й `ReadingSessionRepository.finish`), `discard`
(м'яке видалення).

## Свідомо ПОЗА межами Фази 6

Ця фаза — лише сама сутність (schema/domain/repository). Жоден інший файл цієї фази її не
викликає: жодна зміна продуктової поведінки. Підключення — окремими наступними фазами:

| Фаза | Що підключається |
| --- | --- |
| 6b | `reading_session.reading_run_id` (nullable — legacy-рядки), backfill: для кожного наявного `user_book` — один legacy `reading_run` best-effort з наявних `started_at`/`finished_at`/сесій/статусу, БЕЗ вигадування кількох старих перечитувань, які дані не дозволяють надійно розрізнити |
| 7 | Реальний старт/завершення run прив'язані до переходів `user_book.status`, нові сесії записують `reading_run_id` |
| 8 | Book Memory — `UNIQUE(user_book_id)` → прив'язка до run, історія спогадів замість перезапису |
| 9 | Before/After — те саме для `pre_reading_reflection` |
| 10 | Capsule/Recall — `canCreateCapsule` більше не блокує `rereading`, кожен run може мати власну капсулу |
| 11 | DNF — `dnf_reflection` прив'язується до конкретного run, що не дочитали |
| 12 | Rereading UX + порівняння прочитань — агрегований показ "як читалося цього разу vs минулого разу", використовуючи `run_number` |

До завершення Фази 6b `reading_run` існує в схемі, але жодного рядка в ній немає — таблиця
порожня на будь-якому реальному пристрої, доки не запрацює або backfill, або перший реальний
виклик `start()` з майбутньої Фази 7.
