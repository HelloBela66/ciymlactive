import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';
import { getDatabase, LATEST_SCHEMA_VERSION } from '@/data/db';
import { BackupRepository } from '@/data/repositories/BackupRepository';
import { serializeBackup } from '@/lib/backupSerializer';
import { AutoBackupSettingsStorage } from '@/lib/autoBackupSettingsStorage';
import { createLogger } from '@/lib/logger';

const log = createLogger('lib/autoBackup');

const AUTO_BACKUP_DIR = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ''}auto-backups/`;
/** Раз на ~3 дні достатньо для "про всяк випадок" резервної копії — це не заміна ручного
 * експорту (`useExportBackup`) перед чимось ризикованим, а страховка від втрати телефону/
 * випадкового видалення застосунку між рідкими ручними бекапами. */
const INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
/** Скільки останніх авто-бекапів лишати на диску — старіші видаляються (ротація), інакше
 * `auto-backups/` росла б необмежено. */
const KEEP_COUNT = 5;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(AUTO_BACKUP_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(AUTO_BACKUP_DIR, { intermediates: true });
  }
}

/** Імена файлів мають вигляд `auto-<ISO-час-з-заміненими :/.>.json` — лексикографічне
 * сортування рядків такого вигляду збігається з хронологічним, тож окремо парсити дати не
 * потрібно. */
async function rotateOldFiles(): Promise<void> {
  const files = await FileSystem.readDirectoryAsync(AUTO_BACKUP_DIR);
  const backupFiles = files.filter((name) => name.startsWith('auto-') && name.endsWith('.json')).sort();
  const excess = backupFiles.length - KEEP_COUNT;
  if (excess <= 0) return;

  const toDelete = backupFiles.slice(0, excess);
  await Promise.all(
    toDelete.map(async (name) => {
      try {
        await FileSystem.deleteAsync(`${AUTO_BACKUP_DIR}${name}`, { idempotent: true });
      } catch (error) {
        log.warn('Не вдалося видалити старий авто-бекап', {
          file: name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
}

/**
 * Тихе (без діалогів/UI) авто-резервне копіювання (Milestone 9) — викликається один раз при
 * старті застосунку (`app/_layout.tsx`, після готовності БД). На відміну від `useExportBackup`
 * нічого не пише в `expo-sharing` — файл лишається лише в `auto-backups/` цього застосунку,
 * ротується (`KEEP_COUNT`) і призначений як остання страховка, а не як спосіб перенести дані
 * на інший пристрій (для цього — ручний експорт).
 *
 * Навмисно повністю "тиха" — жодного throw назовні, жодного тосту про помилку: якщо це
 * впаде, користувач і так має ручний бекап, а переривати роботу застосунку через фонову
 * страхову дію було б гірше, ніж просто спробувати ще раз наступного запуску.
 */
export async function runAutoBackupIfDue(): Promise<void> {
  try {
    const enabled = await AutoBackupSettingsStorage.isEnabled();
    if (!enabled) return;

    const lastRunAt = await AutoBackupSettingsStorage.getLastRunAt();
    if (lastRunAt) {
      const elapsed = Date.now() - new Date(lastRunAt).getTime();
      if (Number.isFinite(elapsed) && elapsed < INTERVAL_MS) return;
    }

    const db = await getDatabase();
    const data = await BackupRepository.exportAll(db);
    const json = serializeBackup({
      schemaVersion: LATEST_SCHEMA_VERSION,
      appVersion: Constants.expoConfig?.version ?? '0.0.0',
      data,
    });

    await ensureDir();
    const nowIso = new Date().toISOString();
    const filename = `auto-${nowIso.replace(/[:.]/g, '-')}.json`;
    await FileSystem.writeAsStringAsync(`${AUTO_BACKUP_DIR}${filename}`, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    await rotateOldFiles();
    await AutoBackupSettingsStorage.setLastRunAt(nowIso);
    log.info('Авто-бекап створено', { filename });
  } catch (error) {
    log.warn('Автоматичне резервне копіювання не вдалося', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
