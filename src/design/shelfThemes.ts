import type { ImageSourcePropType } from 'react-native';
import type { ShelfThemeId } from '@/types/shelf';

/**
 * Тематичне оформлення полиць (Milestone 11, доповнення13) — власник продукту надіслав референс
 * із 10 повністю ілюстрованими зображеннями книжкових полиць (сезони + жанри) і попросив
 * ЗАМІНИТИ ними попередню векторну систему (кольорові "корінці" + іконка Ionicons,
 * `ShelfIllustration.tsx` — видалений цією зміною) ПОВНІСТЮ: реальні зображення замість
 * намальованих прямокутників, скрізь, де оформлення полиці показується.
 *
 * Самі 10 файлів (`assets/images/shelves/shelf_<id>.webp`) — вирізані з наданого власником
 * продукту референсного зображення (не згенеровані заново: у цій сесії немає інструменту
 * генерації зображень), кожен по одній "панелі" з сітки 2×5, яку показав референс. WebP замість
 * PNG — та сама причина, що зазвичай для растрових асетів у мобільних застосунках: помітно
 * менший розмір файлу (~30-57 КБ на тему замість значно більшого PNG) без втрати якості на
 * маленькій картці, а Expo (`getDefaultConfig`, Metro) підтримує `.webp` в `require()` одразу,
 * без додаткової конфігурації.
 *
 * КРИТИЧНО (пряма вимога власника продукту): жодна назва категорії/теми НЕ "запечена" в саме
 * зображення — кожен файл лише ілюстрація (книги на полиці + тематичний декор), без напису.
 * Назва полиці (введена користувачем) і кількість книг — завжди звичайний текст UI поверх/під
 * картинкою (`ShelfThemeCard`), незалежний від обраної візуальної теми: користувач може обрати
 * вигляд `dark_romance`, а назвати полицю "Улюблені книги" — і саме це побачить у бібліотеці.
 */
export const SHELF_THEME_IMAGES: Record<ShelfThemeId, ImageSourcePropType> = {
  classic: require('../../assets/images/shelves/shelf_classic.webp'),
  dark_romance: require('../../assets/images/shelves/shelf_dark_romance.webp'),
  romance: require('../../assets/images/shelves/shelf_romance.webp'),
  autumn: require('../../assets/images/shelves/shelf_autumn.webp'),
  winter: require('../../assets/images/shelves/shelf_winter.webp'),
  summer: require('../../assets/images/shelves/shelf_summer.webp'),
  spring: require('../../assets/images/shelves/shelf_spring.webp'),
  thriller_horror: require('../../assets/images/shelves/shelf_thriller_horror.webp'),
  fantasy: require('../../assets/images/shelves/shelf_fantasy.webp'),
  detective: require('../../assets/images/shelves/shelf_detective.webp'),
};

/** Порядок тем у пікері вибору (`app/shelf/new.tsx`) — класична спочатку (це й дефолт), далі
 * дев'ять тематичних у тому ж порядку рядків, що показав референс власника продукту (зверху
 * вниз, зліва направо: дарк романи, романтика, осінь, зима, літо, весна, трилери та жахи,
 * фентезі, детективи). */
export const SHELF_THEME_ORDER: ShelfThemeId[] = [
  'classic',
  'dark_romance',
  'romance',
  'autumn',
  'winter',
  'summer',
  'spring',
  'thriller_horror',
  'fantasy',
  'detective',
];

export const DEFAULT_SHELF_THEME: ShelfThemeId = 'classic';

/** Усі 10 зображень вирізані з референсу з ОДНАКОВИМ співвідношенням сторін (1200×195 px,
 * ≈6.15:1) — жодна тема не виглядає розтягнутою/сплюснутою поруч з іншими. `ShelfThemeCard`
 * застосовує це через `aspectRatio` у стилі `Image` (а не жорстко прописаний `height`) РАЗОМ із
 * `contentFit="contain"` (не `"cover"`), щоб коректно масштабуватись під будь-яку ширину картки
 * (пікер — велика 2-колонкова сітка; бібліотека — компактна горизонтальна стрічка), показуючи
 * зображення ПОВНІСТЮ, а не обрізаючи його під контейнер.
 *
 * Доповнення15 (власник продукту, докладний технічний звіт): доповнення14 звузило проблему
 * (перестало різати "фірмовий" декор рівно по контуру кадру), але не усунуло її по суті —
 * `contentFit="cover"` за визначенням масштабує зображення так, щоб ЗАПОВНИТИ контейнер, і
 * обрізає все, що не влазить, а кожна тема має свій оригінальний кадр значно ширший (~6.15:1),
 * ніж підібраний вручну "безпечний" кадр 3.2:1 доповнення14 — тобто частина композиції (не лише
 * "фірмовий" елемент скраю, а взагалі частина ширини) губилась структурно, самим підходом
 * "вирізати вузьке вікно з широкого рядка", а не через невдалий вибір конкретного вікна.
 *
 * Правильне рішення — не підбирати ЩЕ ОДНЕ вужче "безпечне" вікно кадру, а взагалі перестати
 * обрізати: усі 10 файлів тепер це ПОВНА "панель" референсу від краю до краю (той самий
 * `914×144-154`-піксельний рядок, що показав власник продукту, лише вирівняний до єдиного
 * `1200×195` — легке масштабування (до ~3.4%) під спільне співвідношення сторін, не crop), а
 * `ShelfThemeCard` показує це `contentFit="contain"` — зображення завжди ціле, з відступом від
 * рамки картки, якщо реальна ширина картки не дає рівно `6.15:1`, а не обрізаним під рамку. */
export const SHELF_THEME_ASPECT_RATIO = 1200 / 195;

function isShelfThemeId(value: string): value is ShelfThemeId {
  return (SHELF_THEME_ORDER as string[]).includes(value);
}

/** Старі значення `theme` (до доповнення13), яких більше немає серед `ShelfThemeId`, — власник
 * продукту прямо попросив прибрати "Історичне"/"Драму"/"Комедію" з набору 10, а "Детектив/
 * трилер" (`mystery`) перейменувати й розділити на власне "Детективи" (`detective`) та
 * "Трилери та жахи" (`thriller_horror`) як окремі теми. Полиці, вже збережені в БД користувача
 * зі старим значенням (`shelf.theme` — вільний `TEXT` без CHECK, `009_shelf_theme.ts`), мусять
 * і надалі відкриватись коректно, а не показувати порожнє/зламане оформлення: `mystery`
 * мапиться на найближчий візуальний відповідник (`detective`), решта — на нейтральний
 * `'classic'`, той самий безпечний фолбек, що вже застосовувався для взагалі нерозпізнаних
 * значень. */
const LEGACY_THEME_MAP: Partial<Record<string, ShelfThemeId>> = {
  mystery: 'detective',
  historical: 'classic',
  drama: 'classic',
  comedy: 'classic',
};

/** Приводить сире значення з БД (`shelf.theme` — звичайний `string`, не звужений `ShelfThemeId`,
 * див. коментар у `src/types/shelf.ts`) до одного з 10 чинних `ShelfThemeId`: чинне значення —
 * без змін; старе (до доповнення13) — через `LEGACY_THEME_MAP`; будь-що інше нерозпізнане
 * (пошкоджені дані, тема з майбутньої версії застосунку) — безпечний фолбек `DEFAULT_SHELF_THEME`.
 * Єдина точка входу для консумерів (`ShelfThemeCard` і сам `getShelfThemeImage` нижче) — ніхто з
 * них не мусить сам знати про старі значення чи падати на нерозпізнаних. */
export function normalizeShelfThemeId(themeId: string): ShelfThemeId {
  if (isShelfThemeId(themeId)) return themeId;
  return LEGACY_THEME_MAP[themeId] ?? DEFAULT_SHELF_THEME;
}

/** Готове зображення за сирим `shelf.theme` — завжди повертає щось показуване (на відміну від
 * попередньої `getShelfThemeVisual`, яка могла повернути `null` для класичної/нерозпізнаної
 * теми): усі 10 тем, включно з `'classic'`, тепер мають власне зображення, тож консумерам
 * (`ShelfThemeCard`) більше не потрібна окрема "векторна" гілка для класичної теми. */
export function getShelfThemeImage(themeId: string): ImageSourcePropType {
  return SHELF_THEME_IMAGES[normalizeShelfThemeId(themeId)];
}
