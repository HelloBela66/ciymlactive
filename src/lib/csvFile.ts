import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

/**
 * Файлова частина CSV-експорту/Goodreads-імпорту (Milestone 9) — той самий підхід і ті самі
 * `expo-file-system`/`expo-sharing`/`expo-document-picker`, що й `src/lib/backupFile.ts`
 * (Milestone 6, уже перевірено на реальному пристрої), окремий файл лише тому, що mime-тип і
 * розширення інші (`text/csv`, а не `application/json`).
 */
export async function writeAndShareCsvFile(csv: string, filename: string): Promise<{ uri: string; shared: boolean }> {
  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '';
  const uri = `${baseDir}${filename}`;
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Бібліотека «Полиці» — CSV' });
  }
  return { uri, shared: canShare };
}

export interface PickedCsvFile {
  name: string;
  content: string;
}

/** `null` — користувач закрив вибір файлу без вибору (не помилка). Приймає й `text/comma-
 * separated-values` (деякі системи/Goodreads саме так позначають CSV), і загальний
 * `text/*` — DocumentPicker на Android інколи взагалі не проставляє точний mime для CSV. */
export async function pickCsvFileAsync(): Promise<PickedCsvFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'text/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset) return null;

  const content = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
  return { name: asset.name, content };
}
