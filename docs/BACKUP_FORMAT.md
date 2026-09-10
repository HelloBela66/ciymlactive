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
    "note_category": [...], "note": [...], "quote": [...], "rating": [...], "book_memory": [...],
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

## CSV-експорт (додатково до JSON, для читабельності поза застосунком)

- `library.csv` — по одному рядку на `user_book`: назва, автор, статус, рейтинг, дата
  початку/завершення, видавництво, рік, сторінки.
- `reading_sessions.csv` — дата, книга, тривалість (хв), сторінки, темп.
- `notes.csv` — дата, книга, тип, текст, сторінка.

CSV — one-way (лише експорт, без імпорту назад) — це людино-читаний звіт, не формат
відновлення даних; повне відновлення завжди йде через JSON.
