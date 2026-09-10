import * as FileSystem from 'expo-file-system/legacy';

const COVERS_DIR = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ''}covers/`;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(COVERS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(COVERS_DIR, { intermediates: true });
  }
}

/**
 * Копіює тимчасовий файл фото обкладинки (з `expo-image-picker` — камера чи галерея) у
 * постійне сховище застосунку (Milestone 10) — той самий принцип, що й `src/lib/autoBackup.ts`
 * (`documentDirectory` + власна підтека). Тимчасові URI, які повертає `expo-image-picker`,
 * система може прибрати будь-коли після того, як екран отримав результат — зберігати їх
 * напряму як `Edition.coverUrl` означало б, що обкладинка зникне після перезапуску
 * застосунку. Ім'я файлу містить `editionId` і час — не перезаписує попередню спробу того
 * самого видання, якщо користувач переробляє фото ще раз до збереження.
 */
export async function persistCoverPhoto(sourceUri: string, editionId: string): Promise<string> {
  await ensureDir();
  const destUri = `${COVERS_DIR}${editionId}-${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  return destUri;
}
