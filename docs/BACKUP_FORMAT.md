# BACKUP_FORMAT.md

## Формат JSON-експорту

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-09-06T20:00:00.000Z",
  "app": "polytsya",
  "appVersion": "0.1.0",
  "data": {
    "author": [...], "publisher": [...], "translator": [...], "genre": [...],
    "book_recommendation_shown": [...], "tag": [...],
    "work": [...], "work_author": [...], "work_genre": [...],
    "edition": [...], "edition_translator": [...], "book_source": [...], "field_provenance": [...],
    "series": [...], "series_entry": [...],
    "user_book": [...], "shelf": [...], "shelf_book": [...],
    "reading_session": [...], "reading_progress": [...],
    "note_category": [...], "note": [...], "quote": [...], "rating": [...],
    "pre_reading_reflection": [...], "book_memory": [...],
    "book_capsule": [...], "capsule_recall": [...],
    "owned_book": [...], "loan": [...],
    "reading_goal": [...], "reminder": [...],
    "app_settings": [...]
  }
}
```

`schemaVersion` — номер останньої застосованої SQLite-міграції (див. `DATABASE.md`), НЕ
версія самого застосунку. Порядок таблиць у `data` відповідає порядку створення (батьки
перед дітьми), щоб restore міг вставляти послідовно без вимкнення FK.

## Restore

1. Показати підтвердження з деталями файлу (дата експорту, кількість книг/сесій) —
   **завжди** перед перезаписом, без винятків (вимога п.35).
2. Якщо `schemaVersion` файлу > поточної в застосунку → відмова, повідомлення про потребу
   оновити застосунок.
3. Якщо `schemaVersion` менша за `MIN_COMPATIBLE_BACKUP_SCHEMA_VERSION`
   (`src/lib/backupSerializer.ts`) → застосувати послідовність **data-міграцій** (не
   плутати зі схемними SQLite-міграціями) з `src/data/backup/migrations/*`, які приводять
   JSON до поточної форми, перш ніж вставляти. Якщо ж вона менша за поточну, але НЕ менша за
   `MIN_COMPATIBLE_BACKUP_SCHEMA_VERSION` — файл відновлюється напряму без жодної
   data-міграції: `restoreAll` (`BackupRepository.ts`) просто вставляє рядки в уже
   промігровану живу SQLite-схему, тож суто адитивна SQLite-міграція (новий дозволений
   варіант CHECK/ENUM, нова опційна колонка — наприклад, Migration 002, яка додала
   `'isbndb'` до `book_source.source_type`) не вимагає окремої data-міграції й не робить
   старіші файли невідновлюваними. `MIN_COMPATIBLE_BACKUP_SCHEMA_VERSION` піднімається лише
   для дійсно ламаючих SQLite-міграцій (перейменування/видалення колонки чи таблиці,
   звуження типу тощо).
4. Вставка в транзакції: якщо щось падає — повний rollback, стан БД до restore незмінний.
5. Наразі restore — це **replace all** (простіше й безпечніше за merge для одного
   користувача); merge-режим — можлива майбутня функція, не в V1.
6. POLYTSIA V1.6, Фаза 4 — одразу після вставки `rebuildCapsuleRemindersAsync`
   (`src/features/memory/useBookCapsule.ts`) тихо (без системного запиту дозволу) перепланує
   `expo-notifications`-нагадування для щойно відновлених капсул книги, чий `reopenAt` — у
   майбутньому: `notification_identifier` у файлі належить іншому запуску/пристрою, тож сам по
   собі нічого вже не заплановує. Минулі `reopenAt` свідомо пропускаються. Збій саме цього кроку
   не позначає весь restore невдалим (докладніше — `docs/BOOK_CAPSULES.md` §Бекап).
7. POLYTSIA V1.6, Фаза 5 — `capsule_recall` (історія "спроб згадати" капсулу, `docs/RECALL.md`)
   відновлюється звичайною вставкою, без окремого post-restore кроку: на відміну від капсул
   вище, у записів recall немає ні `expo-notifications`-стану, ні будь-чого прив'язаного до
   конкретного пристрою/запуску.
8. POLYTSIA V1.6, Фаза 6 — `pre_reading_reflection` (нотатка "До читання", `docs/BEFORE_AFTER.md`)
   відновлюється звичайною вставкою, той самий "без окремого кроку" випадок, що й `capsule_recall`
   вище.

## Backup Health UX (Фаза 13)

Екран «Резервна копія» (`app/backup.tsx`) показує стан копіювання окремою карткою
(`useBackupHealth`, `src/features/backup/useBackupHealth.ts`), не лише кнопки дій:

- **schema version** — та сама `LATEST_SCHEMA_VERSION`, що йде в `schemaVersion` файлу вище;
- **approximate counts** — `BackupRepository.approximateCounts`: `SELECT COUNT(*)` по
  `work`/`user_book`/`reading_session`/`note` (рахує всі рядки, включно з м'яко видаленими —
  той самий підхід, що й `summarize`/`exportAll`, без фільтра по `deleted_at`);
- **last successful export time** — час останнього УСПІШНОГО ручного експорту, зафіксований у
  момент завершення `useExportBackup` і збережений через `expo-secure-store`
  (`src/lib/backupExportStatusStorage.ts`), а НЕ через `app_settings.last_backup_at`: ця
  колонка існує в схемі, але жоден код застосунку її не записує — використання її тут лише
  завело б в оману. Якщо колись з'явиться реальний автобекап-таск (сьогодні
  `AutoBackupSettingsStorage.setLastRunAt` — мертвий код, ніким не викликається), обидва
  джерела об'єднує чиста функція `resolveLastSuccessfulExportAt`
  (`src/lib/backupHealth.ts`) — бере пізніше з двох.

Формулювання цієї картки ніколи не каже, що копія «збережена в хмарі» — застосунок повністю
офлайн, файл лишається там, куди його зберіг сам користувач через системне «Поділитися».

Окрема дія — **«Перевірити резервну копію»**: parse/validate обраного файлу (кроки 2-3 з
розділу Restore вище — перевірка `schemaVersion`/сумісності) БЕЗ кроків 4-5 (без вставки в БД).
Технічно це той самий `usePickBackupFile`, що й перший крок звичайного відновлення (обидва лише
читають і парсять файл), але UI на цій кнопці ніколи не відкриває діалог підтвердження заміни
даних — результат або «Резервна копія справна» (з деталями файлу), або конкретне user-friendly
повідомлення про проблему (несумісна версія, пошкоджений файл тощо).

## CSV-експорт (додатково до JSON, для читабельності поза застосунком)

- `library.csv` — по одному рядку на `user_book`: назва, автор, статус, рейтинг, дата
  початку/завершення, видавництво, рік, сторінки.
- `reading_sessions.csv` — дата, книга, тривалість (хв), сторінки, темп.
- `notes.csv` — дата, книга, тип, текст, сторінка.

CSV — one-way (лише експорт, без імпорту назад) — це людино-читаний звіт, не формат
відновлення даних; повне відновлення завжди йде через JSON.
