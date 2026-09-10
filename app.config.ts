import type { ExpoConfig } from 'expo/config';

// Bundle identifier: користувач надав домен "moyapolytsya.ua"; нормалізовано у стандартний
// reverse-domain формат, який вимагають App Store / Google Play (не може містити крапку в
// кінці як TLD-first без інверсії). Якщо потрібен інший ідентифікатор — зміни лише тут,
// РАЗ, до першого EAS-білда (зміна bundle id після публікації в стору неможлива без нового
// запису застосунку).
const BUNDLE_ID = 'ua.moyapolytsya.polytsya';

// Milestone 10: одні й ті самі тексти дозволів мали задаватись у ТРЬОХ (камера) і ДВОХ
// (фотографії) різних місцях — `ios.infoPlist` напряму й окремо в конфігу кожного plugin-а
// (`expo-camera`, `expo-image-picker`), бо обидва вміють самі підмішувати власний
// `NSCameraUsageDescription`/`NSPhotoLibraryUsageDescription` у нативний Info.plist, якщо
// значення в `infoPlist` не задане. Різні рядки в різних місцях — це прихована залежність
// від порядку злиття plugin-ів Expo (хто останній записав — той і "переміг"), тому тепер це
// одна константа на кожен опис, використана всюди без варіацій.
const CAMERA_PERMISSION_TEXT =
  'Камера використовується для сканування штрихкоду ISBN і для фотографування обкладинки книги, коли її не вдалось знайти автоматично.';
const PHOTO_LIBRARY_PERMISSION_TEXT =
  'Доступ до фотографій потрібен лише тоді, коли ти сам обираєш готове фото обкладинки книги замість того, щоб сфотографувати її одразу.';
// Milestone 11 (Фаза 9) — окремий, вужчий дозвіл: "Полиця" вміє лише ДОДАВАТИ картку-спогад
// у фотогалерею (`expo-media-library`, `requestPermissionsAsync(true)` — writeOnly), не
// читає й не бачить решту фото. iOS розрізняє ці два дозволи окремими ключами Info.plist
// (`NSPhotoLibraryUsageDescription` вище — читання/вибір, `NSPhotoLibraryAddUsageDescription`
// — лише додавання), тому й текст свій, а не той самий `PHOTO_LIBRARY_PERMISSION_TEXT`.
const SAVE_PHOTO_PERMISSION_TEXT =
  'Дозвіл потрібен лише для того, щоб зберегти картку-спогад про книгу в твою фотогалерею — застосунок не читає й не бачить інші фото.';

const config: ExpoConfig = {
  name: 'Полиця',
  slug: 'polytsya',
  scheme: 'polytsya',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/images/icon.png',
  primaryColor: '#2F6F5E',
  assetBundlePatterns: ['**/*'],
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription: CAMERA_PERMISSION_TEXT,
      NSPhotoLibraryUsageDescription: PHOTO_LIBRARY_PERMISSION_TEXT,
      NSPhotoLibraryAddUsageDescription: SAVE_PHOTO_PERMISSION_TEXT,
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#2F6F5E',
    },
    // edgeToEdgeEnabled прибрано: у SDK 57 типи @expo/config-types більше не мають цього
    // поля — edge-to-edge на Android тепер типова поведінка RN 0.86, окремо вмикати не треба.
    permissions: ['CAMERA', 'POST_NOTIFICATIONS'],
  },
  web: {
    favicon: './assets/images/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    [
      // Splash screen переїхав з кореневого поля `splash` (видалене з типів ExpoConfig у
      // цій версії @expo/config-types) у конфіг власного плагіна expo-splash-screen.
      'expo-splash-screen',
      {
        image: './assets/images/splash.png',
        resizeMode: 'contain',
        backgroundColor: '#FAF9F7',
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/images/icon.png',
        color: '#2F6F5E',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: CAMERA_PERMISSION_TEXT,
      },
    ],
    [
      // Milestone 10: "Додати обкладинку" — фото книги, коли офіційної обкладинки ніде не
      // знайшлось. `expo-camera` (вище) уже дає доступ до камери для сканування ISBN, але
      // окремий `expo-image-picker` потрібен для другого шляху цієї ж фічі — вибору вже
      // готового фото з галереї, а не зйомки наживо.
      'expo-image-picker',
      {
        photosPermission: PHOTO_LIBRARY_PERMISSION_TEXT,
        cameraPermission: CAMERA_PERMISSION_TEXT,
      },
    ],
    [
      // Milestone 11 (Фаза 9) — "Зберегти в галерею" для картки-спогаду
      // (`app/memory/[workId].tsx`). `photosPermission` тут — той самий текст/ключ
      // (`NSPhotoLibraryUsageDescription`), що вже задає `expo-image-picker` вище: обидва
      // плагіни самі вміють підмішати цей ключ у нативний Info.plist, тож текст мусить бути
      // ОДНАКОВИЙ усюди (той самий урок, що описаний у коментарі біля констант нагорі файлу)
      // — реально новий дозвіл тут лише `savePhotosPermission` (`NSPhotoLibraryAddUsageDescription`).
      'expo-media-library',
      {
        photosPermission: PHOTO_LIBRARY_PERMISSION_TEXT,
        savePhotosPermission: SAVE_PHOTO_PERMISSION_TEXT,
        isAccessMediaLocationEnabled: false,
      },
    ],
    'expo-secure-store',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // Заготовка під майбутній Supabase anon key — НЕ service_role (п.46 ТЗ).
    // Читається через process.env, ніколи не хардкодиться.
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? null,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? null,
    // EAS-проєкт створено командою `eas build` (перший запуск, 2026-09-07) — оскільки конфіг
    // тут динамічний (`app.config.ts`, не статичний `app.json`), `eas` не може дописати
    // `projectId` сюди сам і вимагає це значення вручну, один раз, назавжди для цього проєкту.
    eas: {
      projectId: '5afeb115-62da-459f-9733-1563d1227ad5',
    },
  },
};

export default config;
