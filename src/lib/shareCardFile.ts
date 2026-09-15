import * as Sharing from 'expo-sharing';
// `expo-media-library/legacy` — той самий вибір, що й `expo-file-system/legacy` у
// `backupFile.ts`: стабільний promise-based API (`requestPermissionsAsync`/
// `saveToLibraryAsync`), а не новіший клас-орієнтований `Asset`-API SDK 57 (де звичайний,
// "класичний" `saveToLibraryAsync` з кореня пакета позначений deprecated і кидає виняток у
// рантаймі) — щоб не залежати від деталей нового API, які можуть відрізнятись між
// патч-версіями SDK 57.
import * as MediaLibrary from 'expo-media-library/legacy';
import type { SaveShareCardOutcome } from './shareCardMessages';

/**
 * POLYTSIA V1.7, Phase 5 — SHARE INFRASTRUCTURE CONSOLIDATION (ТЗ V1.7 §13, §98).
 *
 * ЄДИНЕ місце, де застосунок торкається `expo-sharing`/`expo-media-library` для карток-поділитися
 * (бекап має власний `backupFile.ts` — інший потік, інші дозволи, свідомо не змішується).
 *
 * ── ЩО ТУТ БУЛО ДО ЦЬОГО І ЧОМУ РІШЕННЯ ЗМІНЕНО ──────────────────────────────────────────────
 * Існували ТРИ майже ідентичні файли: `memoryCardFile.ts` (Milestone 11, Фаза 9),
 * `seasonCardFile.ts` (Фаза 13) і `fingerprintCardFile.ts` (Фаза 15) — по ~35 рядків кожен, з
 * однаковими `Sharing.isAvailableAsync()`/`shareAsync`/`requestPermissionsAsync(true)`/
 * `saveToLibraryAsync` і однаковим типом результату. Відрізнявся РІВНО один рядок — текст
 * `dialogTitle`.
 *
 * Кожен із них НАВМИСНО дублював попередній, і коментарі це прямо пояснювали: house-принцип
 * «кожен `lib/*.ts` не ділиться дрібними хелперами між фічами» (той самий, за яким існують
 * приватні копії `trimOrNull` у `beforeAfter.ts`/`loreEntity.ts`/`dnfReflection.ts`). Для двох
 * копій це було розумно: фічі лишались незалежними, ціна — десяток рядків.
 *
 * V1.7 (§13/§98) це рішення ПЕРЕГЛЯДАЄ, і не заднім числом: ТЗ вимагає консолідувати
 * share-інфраструктуру ПЕРЕД тим, як додавати нові картки. Три копії — межа, на якій аргумент
 * «незалежність фіч» перестає працювати: четверта (Recap) означала б, що зміна поведінки дозволів
 * чи міграція на новий Expo-API потребує чотирьох однакових правок, кожна з власним шансом
 * розійтись. Різниця між фічами (`dialogTitle`) стає параметром — це не «спільний хелпер заради
 * економії рядків», а один спосіб робити одну системну дію.
 *
 * `trimOrNull`-копії при цьому лишаються як були: там дублюється ЧИСТА функція на два рядки без
 * зовнішніх залежностей, тут — інтеграція з нативним API й політикою дозволів. Це різні випадки.
 *
 * `uri` сюди завжди приходить уже готовим — файл на диску, щойно створений
 * `react-native-view-shot` (`captureRef` потребує React-рефа на View, тож живе в
 * `useShareCard.ts`, а не тут).
 */

/**
 * Спільні опції захоплення — PNG, максимальна якість. Той самий знімок іде і на «Поділитися», і
 * на «Зберегти в галерею».
 *
 * Без `result` — типове значення `'tmpfile'` (реальний файл на диску з розширенням `.png` у URI),
 * навмисно НЕ `'base64'`/`'data-uri'`: і `Sharing.shareAsync`, і `MediaLibrary.saveToLibraryAsync`
 * нижче чекають саме `file://`-шлях з розширенням, а не рядок даних.
 */
export const SHARE_CARD_CAPTURE_OPTIONS = { format: 'png', quality: 1 } as const;

/**
 * Показує системний діалог «Поділитися». `false` — на цьому пристрої такого діалогу немає
 * (`isAvailableAsync`); це не помилка, і викликач показує нейтральний статус
 * (`describeShareOutcome`, `shareCardMessages.ts`).
 */
export async function shareCardImage(uri: string, dialogTitle: string): Promise<boolean> {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) return false;
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle });
  return true;
}

/**
 * Зберігає вже захоплений PNG у фотогалерею пристрою. `requestPermissionsAsync(true)` —
 * `writeOnly`, той самий мінімалістичний підхід до дозволів, що й у решті застосунку
 * (докладніше — коментар біля `SAVE_PHOTO_PERMISSION_TEXT` у `app.config.ts`): застосунку
 * потрібно лише ДОДАТИ зображення, не читати чужі фото, тож на iOS це окремий, вужчий дозвіл
 * «Додавання фото» замість повного доступу до бібліотеки.
 */
export async function saveCardImageToLibrary(uri: string): Promise<SaveShareCardOutcome> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) {
    return { kind: 'permission_denied', canAskAgain: permission.canAskAgain };
  }
  await MediaLibrary.saveToLibraryAsync(uri);
  return { kind: 'saved' };
}
