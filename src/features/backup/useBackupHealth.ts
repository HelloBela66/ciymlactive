import { useQuery } from '@tanstack/react-query';
import { getDatabase, LATEST_SCHEMA_VERSION } from '@/data/db';
import { BackupRepository, type BackupCounts } from '@/data/repositories/BackupRepository';
import { AutoBackupSettingsStorage } from '@/lib/autoBackupSettingsStorage';
import { BackupExportStatusStorage } from '@/lib/backupExportStatusStorage';
import { resolveLastSuccessfulExportAt } from '@/lib/backupHealth';
import { queryKeys } from '@/lib/queryKeys';

export interface BackupHealthStatus {
  /** `PRAGMA user_version` живої БД завжди дорівнює цьому — `getDatabase()` (виклик нижче)
   * ніколи не повертається, доки міграції не застосовані до останньої версії, тож окремий
   * SQL-запит до самої БД тут не потрібен, досить константи. */
  schemaVersion: number;
  counts: BackupCounts;
  lastSuccessfulExportAt: string | null;
}

/**
 * ТЗ Фази 13 (BACKUP HEALTH UX) — «На Backup screen покажи: last successful export time,
 * schema version, approximate counts, validation status». Перші три зібрані тут одним
 * запитом; четверте ("validation status") — окрема, за визначенням разова дія користувача
 * ("Перевірити резервну копію" на конкретному файлі), не частина фонового стану — див.
 * `usePickBackupFile` у `useBackup.ts`, який App вже перевикористовує для цього в
 * `app/backup.tsx`.
 */
export function useBackupHealth() {
  return useQuery<BackupHealthStatus>({
    queryKey: queryKeys.backupHealth.status,
    queryFn: async () => {
      const db = await getDatabase();
      const [counts, lastManualExportAt, lastAutoBackupAt] = await Promise.all([
        BackupRepository.approximateCounts(db),
        BackupExportStatusStorage.getLastManualExportAt(),
        AutoBackupSettingsStorage.getLastRunAt(),
      ]);
      return {
        schemaVersion: LATEST_SCHEMA_VERSION,
        counts,
        lastSuccessfulExportAt: resolveLastSuccessfulExportAt(lastManualExportAt, lastAutoBackupAt),
      };
    },
  });
}
