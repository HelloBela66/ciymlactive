import * as Network from 'expo-network';

/**
 * OFFLINE UX (POLYTSIA V1.6.1, Фаза 20, `docs/OFFLINE_UX.md`) — реалізує намір, задокументований
 * ще в `docs/LOCAL_FIRST.md` §"Offline-індикатор" ("`NetInfo`-подібний стан через `expo-network`,
 * делікатний inline-banner лише на екрані пошуку/сканера"), але ніколи не підключений до коду
 * (аудит V1.6.1, §39.1, CODE VERIFIED — жодного імпорту `expo-network`/`NetInfo` в усьому
 * репозиторії до цієї фази).
 *
 * `expo-network` (не `@react-native-community/netinfo`) — єдина мережева залежність, яка вже
 * входить в Expo Go й не потребує нативного лінкування/конфіг-плагіна, той самий "лише
 * `expo-*`-пакети" підхід, що й решта `package.json` (жоден `@react-native-community/*` пакет
 * зараз не використовується).
 *
 * Доки перший реальний стан ще не прийшов (`isConnected`/`isInternetReachable` обидва
 * `undefined` — SDK документує це як можливий стан ДО першої перевірки), хук оптимістично НЕ
 * вважає користувача офлайн — той самий "не показуй новий стан, доки не підтверджено" принцип,
 * що й `isLibraryEmpty`/`useOnboardingHint` (Фази 17/18): інакше кожен мережевий екран на
 * частку секунди хибно блимнув би офлайн-банером при кожному відкритті, доки перевірка не
 * встигла відповісти.
 *
 * `isInternetReachable === false` (не лише `isConnected === false`) — Wi-Fi БЕЗ реального
 * інтернету (наприклад, портал автентифікації готелю/кафе, що вимагає входу в браузері, перш
 * ніж пропустити будь-який інший трафік) — реалістичний сценарій, який голий `isConnected`
 * пропустив би: `isConnected` там залишається `true` (пристрій підключений до Wi-Fi мережі), хоча
 * жоден запит до Google Books/ISBNdb/Supabase насправді не пройде.
 */
export function useIsOffline(): boolean {
  const state = Network.useNetworkState();
  return state.isConnected === false || state.isInternetReachable === false;
}
