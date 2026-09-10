import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

/**
 * Файлова частина backup/restore (розділ 35+ ТЗ, `docs/BACKUP_FORMAT.md`) — увесь код
 * `expo-file-system`/`expo-sharing`/`expo-document-picker` в одному місці, щоб
 * `useBackup.ts` не знав про Expo File API напряму (той самий принцип, що й
 * `src/lib/notifications.ts` для нагадувань). Використовує `expo-file-system/legacy` —
 * стабільний promise-based API (writeAsStringAsync/readAsStringAsync), а не новіший
 * синхронний `File`/`Directory` API, щоб не залежати від деталей, які можуть відрізнятись
 * між патч-версіями SDK 57.
 */
export async function writeAndShareBackupFile(json: string, filename: string): Promise<{ uri: string; shared: boolean }> {
  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '';
  const uri = `${baseDir}${filename}`;
  await FileSystem.writeAsStringAsync(uri, json, { encoding: FileSystem.EncodingType.UTF8 });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Резервна копія «Полиці»' });
  }
  return { uri, shared: canShare };
}

export interface PickedBackupFile {
  name: string;
  content: string;
}

/** `null` — користувач закрив вибір файлу без вибору (не помилка). */
export async function pickBackupFileAsync(): Promise<PickedBackupFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  const content = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
  return { name: asset.name, content };
}
