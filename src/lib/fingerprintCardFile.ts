import * as Sharing from 'expo-sharing';
// `expo-media-library/legacy` — той самий вибір, що й `src/lib/seasonCardFile.ts`/
// `memoryCardFile.ts`/`backupFile.ts`: стабільний promise-based API, а не новіший
// клас-орієнтований `Asset`-API SDK 57 (де звичайний `saveToLibraryAsync` з кореня пакета
// позначений deprecated).
import * as MediaLibrary from 'expo-media-library/legacy';

/**
 * Файлова частина картки відбитку (ТЗ Фази 15) — навмисно ОКРЕМИЙ файл, не імпорт із
 * `seasonCardFile.ts`/`memoryCardFile.ts`, хоч усі три роблять майже те саме (той самий "кожен
 * `lib/*.ts` не ділиться дрібними хелперами між фічами" принцип, що вже пояснювали
 * `docs/READING_SEASONS.md`/`docs/DNF_IMPROVEMENT.md`) — лише текст діалогу тут інший ("Мій
 * читацький відбиток"), і фічі лишаються незалежними одна від одної. `uri` приходить уже
 * готовим — файл на диску, щойно створений `react-native-view-shot` (`captureRef`, викликається
 * в самому екрані `app/fingerprint.tsx`).
 */
export async function shareFingerprintCardImage(uri: string): Promise<boolean> {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) return false;
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Мій читацький відбиток' });
  return true;
}

export type SaveFingerprintCardOutcome = { kind: 'saved' } | { kind: 'permission_denied'; canAskAgain: boolean };

/** Зберігає вже захоплений PNG у фотогалерею пристрою — той самий мінімалістичний
 * `requestPermissionsAsync(true)` (`writeOnly`), що й `saveSeasonCardImageToLibrary`. */
export async function saveFingerprintCardImageToLibrary(uri: string): Promise<SaveFingerprintCardOutcome> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) {
    return { kind: 'permission_denied', canAskAgain: permission.canAskAgain };
  }
  await MediaLibrary.saveToLibraryAsync(uri);
  return { kind: 'saved' };
}
