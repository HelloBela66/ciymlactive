import * as Sharing from 'expo-sharing';
// `expo-media-library/legacy` — той самий вибір, що й `src/lib/memoryCardFile.ts`/
// `backupFile.ts`: стабільний promise-based API, а не новіший клас-орієнтований `Asset`-API
// SDK 57 (де звичайний `saveToLibraryAsync` з кореня пакета позначений deprecated).
import * as MediaLibrary from 'expo-media-library/legacy';

/**
 * Файлова частина картки сезону (ТЗ Фази 13, «SHARE TEMPLATE») — навмисно ОКРЕМИЙ файл, не
 * імпорт із `memoryCardFile.ts`, хоч обидва роблять майже те саме (той самий "кожен `lib/*.ts`
 * не ділиться дрібними хелперами між фічами" принцип, що й приватні копії `trimOrNull` у
 * `beforeAfter.ts`/`loreEntity.ts`/`dnfReflection.ts`) — лише текст діалогу тут інший ("Мій
 * читацький сезон" замість "Спогад про книгу"), і фічі лишаються незалежними одна від одної.
 * `uri` приходить уже готовим — файл на диску, щойно створений `react-native-view-shot`
 * (`captureRef`, викликається в самому екрані `app/seasons/[seasonKey].tsx`).
 */
export async function shareSeasonCardImage(uri: string): Promise<boolean> {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) return false;
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Мій читацький сезон' });
  return true;
}

export type SaveSeasonCardOutcome = { kind: 'saved' } | { kind: 'permission_denied'; canAskAgain: boolean };

/** Зберігає вже захоплений PNG у фотогалерею пристрою — той самий мінімалістичний
 * `requestPermissionsAsync(true)` (`writeOnly`), що й `saveMemoryCardImageToLibrary`. */
export async function saveSeasonCardImageToLibrary(uri: string): Promise<SaveSeasonCardOutcome> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) {
    return { kind: 'permission_denied', canAskAgain: permission.canAskAgain };
  }
  await MediaLibrary.saveToLibraryAsync(uri);
  return { kind: 'saved' };
}
