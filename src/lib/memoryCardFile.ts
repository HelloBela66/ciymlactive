import * as Sharing from 'expo-sharing';
// `expo-media-library/legacy` — той самий вибір, що й `expo-file-system/legacy` у
// `backupFile.ts`: стабільний promise-based API (`requestPermissionsAsync`/
// `saveToLibraryAsync`), а не новіший клас-орієнтований `Asset`-API SDK 57 (де звичайний,
// "класичний" `saveToLibraryAsync` з кореня пакета позначений deprecated і кидає виняток у
// рантаймі) — щоб не залежати від деталей нового API, які можуть відрізнятись між
// патч-версіями SDK 57.
import * as MediaLibrary from 'expo-media-library/legacy';

/**
 * Файлова частина картки-спогаду (Milestone 11, Фаза 9) — увесь код `expo-sharing`/
 * `expo-media-library` в одному місці, той самий принцип, що й `src/lib/backupFile.ts` для
 * бекапу: екран (`app/memory/[workId].tsx`) не знає про Expo File API напряму. `uri` сюди
 * приходить уже готовим — файл на диску, який щойно створив `react-native-view-shot`
 * (`captureRef`, викликається в самому екрані — потребує React-реф на View, тому лишається
 * там, а не тут).
 */
export async function shareMemoryCardImage(uri: string): Promise<boolean> {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) return false;
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Спогад про книгу' });
  return true;
}

export type SaveMemoryCardOutcome = { kind: 'saved' } | { kind: 'permission_denied'; canAskAgain: boolean };

/**
 * Зберігає вже захоплений PNG у фотогалерею пристрою. `requestPermissionsAsync(true)` —
 * `writeOnly`, той самий мінімалістичний підхід до дозволів, що й у решті застосунку
 * (докладніше — коментар біля `SAVE_PHOTO_PERMISSION_TEXT` у `app.config.ts`): застосунку
 * потрібно лише ДОДАТИ зображення, не читати чужі фото, тож на iOS це окремий, вужчий дозвіл
 * "Додавання фото" замість повного доступу до бібліотеки.
 */
export async function saveMemoryCardImageToLibrary(uri: string): Promise<SaveMemoryCardOutcome> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) {
    return { kind: 'permission_denied', canAskAgain: permission.canAskAgain };
  }
  await MediaLibrary.saveToLibraryAsync(uri);
  return { kind: 'saved' };
}
