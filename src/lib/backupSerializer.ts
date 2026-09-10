import { z } from 'zod';

export const BACKUP_APP_ID = 'polytsya';

/** Формат детально описано в `docs/BACKUP_FORMAT.md` — цей файл лише (де)серіалізує й
 * перевіряє JSON-конверт, без жодного SQL/React (п.43 ТЗ, `docs/TESTING.md`: "round-trip,
 * schemaVersion guard"). Фактичне читання/запис БД — `BackupRepository.ts`. */
const BackupEnvelopeSchema = z.object({
  schemaVersion: z.number().int().nonnegative(),
  exportedAt: z.string(),
  app: z.string(),
  appVersion: z.string(),
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

export type BackupEnvelope = z.infer<typeof BackupEnvelopeSchema>;
export type BackupTableRow = Record<string, unknown>;
export type BackupData = Record<string, BackupTableRow[]>;

export function serializeBackup(params: {
  schemaVersion: number;
  appVersion: string;
  data: BackupData;
  exportedAt?: string; // ін'єктовано для тестів/детермінізму, за замовчуванням "зараз"
}): string {
  const envelope: BackupEnvelope = {
    schemaVersion: params.schemaVersion,
    exportedAt: params.exportedAt ?? new Date().toISOString(),
    app: BACKUP_APP_ID,
    appVersion: params.appVersion,
    data: params.data,
  };
  return JSON.stringify(envelope, null, 2);
}

export type ParseBackupResult = { ok: true; envelope: BackupEnvelope } | { ok: false; error: string };

export function parseBackupJson(raw: string): ParseBackupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Файл пошкоджений або це не JSON.' };
  }

  const result = BackupEnvelopeSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: 'Це не файл резервної копії «Полиці» (неочікувана структура).' };
  }
  if (result.data.app !== BACKUP_APP_ID) {
    return { ok: false, error: 'Це не файл резервної копії «Полиці».' };
  }
  return { ok: true, envelope: result.data };
}

export type SchemaCompatibility = 'ok' | 'needs_app_update' | 'needs_data_migration';

/**
 * Мінімальна версія схеми файлу бекапу, яку ще можна відновити напряму, без окремої міграції
 * даних. Піднімай це число ЛИШЕ тоді, коли нова SQLite-міграція справді ламає зворотну
 * сумісність (перейменування/видалення колонки чи таблиці, звуження CHECK/типу тощо) —
 * `BackupRepository.restoreAll` просто вставляє рядки файлу в уже промігровану ЖИВУ схему
 * застосунку, тож суто адитивна зміна (новий дозволений варіант ENUM/CHECK, нова опційна
 * колонка) не робить старіші файли невідновлюваними. Приклад: Migration 002 додала
 * `'isbndb'` до CHECK `book_source.source_type` — бекап, зроблений до цього (де `'isbndb'` і
 * не могло зустрітись), відновлюється в новішу схему без жодних проблем.
 */
export const MIN_COMPATIBLE_BACKUP_SCHEMA_VERSION = 1;

/**
 * Порівнює `schemaVersion` файлу з поточною версією схеми застосунку (`docs/BACKUP_FORMAT.md`
 * §Restore, кроки 2-3). `needs_data_migration` спрацьовує лише коли файл старіший за
 * {@link MIN_COMPATIBLE_BACKUP_SCHEMA_VERSION} (заготовка під `src/data/backup/migrations/*`
 * для майбутньої дійсно ламаючої міграції) — не просто "файл старіший за поточну версію
 * застосунку", інакше кожна суто адитивна SQLite-міграція (як Migration 002) непотрібно
 * блокувала б відновлення цілком сумісних старих бекапів.
 */
export function checkSchemaCompatibility(fileVersion: number, currentVersion: number): SchemaCompatibility {
  if (fileVersion > currentVersion) return 'needs_app_update';
  if (fileVersion < MIN_COMPATIBLE_BACKUP_SCHEMA_VERSION) return 'needs_data_migration';
  return 'ok';
}
