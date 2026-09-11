import { useMutation, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { format } from 'date-fns';
import { getDatabase, LATEST_SCHEMA_VERSION } from '@/data/db';
import { BackupRepository } from '@/data/repositories/BackupRepository';
import {
  serializeBackup,
  parseBackupJson,
  checkSchemaCompatibility,
  type BackupEnvelope,
} from '@/lib/backupSerializer';
import { writeAndShareBackupFile, pickBackupFileAsync } from '@/lib/backupFile';
import { BackupExportStatusStorage } from '@/lib/backupExportStatusStorage';
import { createLogger } from '@/lib/logger';
import { queryKeys } from '@/lib/queryKeys';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import { rebuildCapsuleRemindersAsync } from '@/features/memory/useBookCapsule';

const log = createLogger('features/backup');

/** Експорт: дамп усієї БД → JSON-конверт (`docs/BACKUP_FORMAT.md`) → файл → системний
 * "Поділитися" (щоб користувач сам обрав, куди зберегти — Файли, хмара, месенджер тощо).
 *
 * ТЗ Фази 13 (BACKUP HEALTH UX) — цей успішний виклик і є "last successful export time":
 * `exportedAt` фіксується один раз тут (той самий момент, що йде в сам конверт файлу, а не
 * повторний `new Date()` в `onSuccess`, який міг би розійтись на кілька мілісекунд) і
 * зберігається через `BackupExportStatusStorage` (докладне обґрунтування "чому не
 * `app_settings.last_backup_at`" — коментар там-таки). */
export function useExportBackup() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося створити резервну копію. Спробуй ще раз.');
  return useMutation({
    mutationFn: async () => {
      const db = await getDatabase();
      const data = await BackupRepository.exportAll(db);
      const exportedAt = new Date().toISOString();
      const json = serializeBackup({
        schemaVersion: LATEST_SCHEMA_VERSION,
        appVersion: Constants.expoConfig?.version ?? '0.0.0',
        data,
        exportedAt,
      });
      const filename = `polytsya-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;
      const result = await writeAndShareBackupFile(json, filename);
      return { ...result, exportedAt };
    },
    onSuccess: ({ exportedAt }) => {
      void BackupExportStatusStorage.setLastManualExportAt(exportedAt);
      queryClient.invalidateQueries({ queryKey: queryKeys.backupHealth.status });
    },
    onError,
  });
}

export interface PendingRestore {
  envelope: BackupEnvelope;
  summary: { works: number; userBooks: number; sessions: number; notes: number };
}

export type PickBackupResult = { kind: 'cancelled' } | { kind: 'error'; message: string } | { kind: 'ready'; pending: PendingRestore };

/** Обирає файл і одразу перевіряє/парсить його (`docs/BACKUP_FORMAT.md` §Restore, кроки 1-3)
 * — але НЕ пише в БД. UI показує підтвердження з `pending.summary` перш ніж викликати
 * `useRestoreBackup` — застосунок ніколи не перезаписує дані без явного підтвердження
 * (вимога п.35 ТЗ, без винятків). */
export function usePickBackupFile() {
  // Очікувані "поганого файлу" випадки вже повертаються як `{ kind: 'error', message }`
  // (нижче) — не кидаються, тож `onError` тут лише на неочікуваний виняток (наприклад,
  // системний пікер файлів сам відмовив несподівано).
  const onError = useMutationErrorHandler(log, 'Не вдалося відкрити файл резервної копії.');
  return useMutation<PickBackupResult, Error, void>({
    mutationFn: async () => {
      const picked = await pickBackupFileAsync();
      if (!picked) return { kind: 'cancelled' };

      const parsed = parseBackupJson(picked.content);
      if (!parsed.ok) return { kind: 'error', message: parsed.error };

      const compatibility = checkSchemaCompatibility(parsed.envelope.schemaVersion, LATEST_SCHEMA_VERSION);
      if (compatibility === 'needs_app_update') {
        return {
          kind: 'error',
          message: 'Цей файл створено новішою версією застосунку — онови застосунок, щоб відновити з нього.',
        };
      }
      if (compatibility === 'needs_data_migration') {
        return { kind: 'error', message: 'Формат файлу застарілий і поки не підтримується автоматичним оновленням.' };
      }

      return { kind: 'ready', pending: { envelope: parsed.envelope, summary: BackupRepository.summarize(parsed.envelope.data) } };
    },
    onError,
  });
}

/** Сам запис — replace-all в одній транзакції (`BackupRepository.restoreAll`) — якщо щось
 * впаде посеред запису, транзакція відкочується і бібліотека лишається такою, якою була до
 * спроби відновлення (звідси конкретний текст повідомлення нижче — це не загальне "щось
 * пішло не так", а гарантія, яку дає сам код). Після успіху інвалідує геть увесь React
 * Query кеш: replace-all міняє практично всі дані застосунку одразу, тож перелічувати
 * десятки query key namespace-ів вручну немає сенсу. */
export function useRestoreBackup() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(
    log,
    'Не вдалося відновити дані з резервної копії. Бібліотека лишилась незмінною — спробуй ще раз.',
  );
  return useMutation({
    mutationFn: async (envelope: BackupEnvelope) => {
      const db = await getDatabase();
      await BackupRepository.restoreAll(db, envelope.data);
      // POLYTSIA V1.6, Фаза 4, п.36 ТЗ — дані капсул щойно відновлено, але OS-розклад їхніх
      // сповіщень (`notification_identifier` у файлі) належить іншому запуску/пристрою: тихо
      // (без запиту дозволу) перепланувати майбутні нагадування на щойно відновлених даних.
      // `restoreAll` уже завершився успішно на цей момент (дані бібліотеки відновлені) — збій
      // САМЕ цього допоміжного кроку (напр. `expo-notifications` недоступний) не повинен
      // показувати користувачу "не вдалося відновити дані", тож ловимо тут, а не даємо
      // випливти назовні в `onError` цієї мутації.
      try {
        await rebuildCapsuleRemindersAsync(db);
      } catch (error) {
        log.error('Не вдалося перепланувати нагадування капсул після відновлення', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
    onError,
  });
}
