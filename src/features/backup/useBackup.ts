import { useMutation, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { format } from 'date-fns';
import { getDatabase, LATEST_SCHEMA_VERSION } from '@/data/db';
import { BackupRepository } from '@/data/repositories/BackupRepository';
import { DataIntegrityRepository } from '@/data/repositories/DataIntegrityRepository';
import type { DataIntegrityReport } from '@/domain/dataIntegrityDoctor';
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
import { backfillAllLegacyReadingRunLinks } from '@/data/db/legacyRunBackfill';

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

export interface RestoreBackupVariables {
  envelope: BackupEnvelope;
  /** PROGRESS UX FIX (POLYTSIA V1.6.2, Фаза 3) — прокидається без змін у
   * `BackupRepository.restoreAll` (докладніше — коментар там-таки); опційний, щоб не ламати
   * можливих майбутніх викликів без потреби в прогресі. */
  onProgress?: (done: number, total: number) => void;
}

export interface RestoreBackupResult {
  /** POST-RESTORE DATA DOCTOR FIX (POLYTSIA V1.6.2, Фаза 3) — `null`, лише якщо сама перевірка
   * впала (докладніше — коментар над викликом нижче); ніколи не `null` через "нема проблем" —
   * для цього є `report.hasIssues === false`. */
  integrityReport: DataIntegrityReport | null;
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
    mutationFn: async ({ envelope, onProgress }: RestoreBackupVariables): Promise<RestoreBackupResult> => {
      const db = await getDatabase();
      await BackupRepository.restoreAll(db, envelope.data, onProgress);
      // POLYTSIA V1.6.1, Фаза 27 — `restoreAll` щойно вставила рядки файлу як є: якщо файл
      // зроблено ДО Фази 6 (`reading_run` тоді ще не існувала й не входила в
      // `BACKUP_TABLE_ORDER` — реальна прогалина, знайдена й закрита саме цією фазою), щойно
      // відновлені сесії/спогади/капсули/рейтинги/нотатки "До"/DNF-знімки лишаються без
      // `reading_run`/`reading_run_id`, точнісінько як до одноразової міграції 019-025 — яка,
      // на відміну від restore, виконується РІВНО ОДИН РАЗ у житті БД і тут вдруге не
      // спрацює. `backfillAllLegacyReadingRunLinks` — той самий backfill-алгоритм цих міграцій,
      // винесений у спільний модуль (`docs/READING_RUN.md` §Restore) — заповнює прогалину
      // одразу після restore; для СВІЖОГО бекапу (де `reading_run` вже заповнена) — безпечний
      // no-op (докладніше — коментар над самою функцією). Той самий "збій допоміжного кроку не
      // позначає весь restore невдалим" підхід, що й нижче для нагадувань капсул.
      try {
        await backfillAllLegacyReadingRunLinks(db);
      } catch (error) {
        log.error('Не вдалося доповнити легасі-прочитання (ReadingRun) після відновлення', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
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
      // POST-RESTORE DATA DOCTOR FIX (POLYTSIA V1.6.2, Фаза 3) — replace-all restore може
      // принести дані з файлу, зробленого на іншому пристрої/у старішій версії застосунку, чи
      // взагалі пошкодженого стороннім редагуванням JSON — рівно той сценарій, для якого
      // Data Integrity Doctor (`DataIntegrityRepository.runCheck`, `app/data-doctor.tsx`)
      // існує, лише досі запускався ЛИШЕ вручну з Профілю. Той самий "best-effort, збій не
      // позначає весь restore невдалим" підхід, що й два кроки вище: сама перевірка НІЧОГО не
      // пише в БД (лише читає), тож її збій не ризикує щойно відновленими даними — просто UI
      // не покаже звіт. НЕ автозапуск на кожен вхід у Профіль (той принцип, що й досі, ТЗ
      // Фази 5) — це разова перевірка одразу після replace-all, найризикованішої операції з
      // усіх, де раптова суперечність даних найімовірніша.
      let integrityReport: DataIntegrityReport | null = null;
      try {
        integrityReport = await DataIntegrityRepository.runCheck(db);
      } catch (error) {
        log.error('Не вдалося перевірити цілісність даних після відновлення', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return { integrityReport };
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
    onError,
  });
}
