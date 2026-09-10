# BUILD_AND_RELEASE.md

## ВАЖЛИВА ПРИМІТКА ПРО ЦЕЙ ETAП РОЗРОБКИ

Код у цьому репозиторії написаний і перевірений вручну (структура, типи, SQL, узгодженість
API-викликів з документацією Expo SDK 57). Хмарне середовище, в якому він створювався, не
мало доступу до npm-реєстру напряму з термінала, тому перший `npm install` на реальній
машині користувача виявив кілька версій пакетів, підібраних без звірки з реєстром і які
реально не існували (докладно — `docs/ARCHITECTURE.md`, розділ 11). Це виправлено: усі
версії в `package.json` тепер звірені напряму з `registry.npmjs.org` через веб-пошук. `tsc`
проти реальних `node_modules` і `npx expo start` **ще підлягають підтвердженню** на машині
користувача — якщо після цього виправлення щось усе ще не збирається, надішли повний текст
помилки.

Перший крок для тебе (уже з виправленими версіями) —

```bash
npm install
npx expo install --fix   # вирівнює версії Expo-пакетів під SDK 57 з офіційного реєстру
npx tsc --noEmit         # перевірка типів
npx expo start           # запуск у Expo Go / dev client
```

Якщо щось не збереться — це очікувано на першій ітерації такого масштабу, і я (Claude)
виправлю помилки, як тільки побачу вивід команди вище. Це не привід сумніватися в якості
архітектури/схеми/логіки — лише в тому, що жодна команда складання не запускалась
end-to-end у поточному середовищі. Кожен наступний milestone буде так само потребувати
твого запуску `npx tsc --noEmit` (і, за бажання, вставки помилок сюди для виправлення).

## EAS Build профілі (`eas.json`)

| Профіль | Призначення | Distribution |
|---|---|---|
| development | Development client (Metro, live reload, доступ до нативних модулів) | internal |
| preview | Ad-hoc/internal build для щоденного використання на власному телефоні (основний зараз) | internal |
| production | Публічний реліз | не використовується у V1 |

```json
{
  "cli": { "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "gradleCommand": ":app:assembleDebug" },
      "ios": { "simulator": false }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "ios": { "simulator": false }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": { "production": {} }
}
```

## Перший запуск на телефоні (рекомендований шлях зараз)

1. `npx expo start` локально → відскануй QR у застосунку **Expo Go** (найшвидше, без білду,
   достатньо для M1-M6, доки немає нативних модулів поза Expo Go sandbox).
2. Коли знадобиться `expo-camera`/`expo-notifications` за межами Expo Go або native-only
   зміни — `eas build --profile preview --platform android` і/або `--platform ios`
   (потребує Apple Developer акаунту для iOS ad-hoc; Android APK можна ставити напряму).
3. **Milestone 11, Фаза 9** додала ще два нативні модулі — `react-native-view-shot`
   (захоплення картки-спогаду в зображення) і `expo-media-library` (збереження в
   фотогалерею). Обидва потребують нового нативного білда (той самий крок 2 вище) — просто
   `npx expo start`/reload JS-бандла НЕ підхопить новий нативний код у вже зібраному
   dev-client, застосунок впаде з "native module not found" при спробі відкрити картку.
   `npm install` після `git pull`/розпакування архіву — обов'язковий перший крок (нові записи
   в `package.json`).

## Середовищні змінні / секрети (п.46)

`.env` (не комітиться, є `.env.example`) — на випадок майбутнього Supabase anon key. У V1
жодних секретів немає (Google Books не потребує ключа для базового використання). Ніколи не
кладемо `service_role` Supabase ключ у мобільний білд — лише
`anon`/`publishable`, коли Supabase з'явиться.
