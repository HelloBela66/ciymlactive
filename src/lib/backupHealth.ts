/**
 * ТЗ Фази 13 (BACKUP HEALTH UX) — «last successful export time». Два незалежні джерела
 * можуть знати про успішний бекап (ручний експорт і, у майбутньому, авто-бекап — докладніше
 * `backupExportStatusStorage.ts`), тож "останній успішний" — це просто пізніший із двох.
 * Чиста функція (без React/SecureStore), той самий підхід, що й `groupActivityEventsByDate`
 * (Фаза 12): порівняння дат — окрема, самостійно тестована логіка, а не інлайн у хуці.
 */
export function resolveLastSuccessfulExportAt(
  lastManualExportAt: string | null,
  lastAutoBackupAt: string | null,
): string | null {
  if (!lastManualExportAt) return lastAutoBackupAt;
  if (!lastAutoBackupAt) return lastManualExportAt;
  // ISO-8601 UTC-рядки (той самий формат, що й `occurredAt` у Фазі 12) порівнюються
  // лексикографічно так само, як хронологічно — без парсингу в `Date`.
  return lastManualExportAt > lastAutoBackupAt ? lastManualExportAt : lastAutoBackupAt;
}
