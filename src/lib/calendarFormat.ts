import { pluralizeUk } from './pluralizeUk';

/**
 * КАЛЕНДАР — ВІЗУАЛЬНА КОМПОЗИЦІЯ ТА REDESIGN ДНЯ ЧИТАННЯ (пост-Фаза 19, продовження
 * `docs/CALENDAR_2_0.md`). Чиста функція форматування — той самий house-патерн, що й
 * `calendarGrid.ts`/`calendarIntensity.ts`: жодного `new Date()`/SQL/React тут.
 *
 * ЧОМУ НОВА ФУНКЦІЯ, А НЕ `sessionTiming.ts#formatDuration`: та функція форматує `HH:MM:SS`
 * (годинник живого таймера сесії — "01:12:00") — правильно для екрана активного читання, але
 * нечитабельно як компактна метрика дня/картки книги ("2 книги · 01:12:00" виглядає як
 * секундомір, не як підсумок читання). Ця фаза (ТЗ, приклади рядків "1 год 12 хв", "2 книги ·
 * 1 год 12 хв") явно хоче людський, "розмовний" формат — окрема, малесенька функція, не зміна
 * `formatDuration` (яка й далі лишається як є для живого таймера, нею користуються session-
 * екрани, що цієї фази не стосуються).
 *
 * Плюралізація ("1 книга/2 книги/5 книг") — НЕ нова тут: перевикористано вже наявний, тестований
 * `src/lib/pluralizeUk.ts` (Milestone 5) — знайдений уже ПІСЛЯ першої чернетки цього файлу, яка
 * була помилково почала дублювати той самий алгоритм локально; виправлено до першого коміту цієї
 * фази, лишень імпорт, без другої копії тієї самої логіки.
 */

/**
 * Компактний людський запис тривалості в хвилинах — "45 хв", "1 год", "1 год 12 хв". Години
 * показуються лише коли є хоч одна повна година; хвилини-залишок показуються лише коли вони
 * ненульові (тобто "1 год", не "1 год 0 хв"). Захисно: `<= 0` → `"0 хв"` (не має траплятись у
 * реальному UI — метрика рендериться лише для дня/книги з реальною активністю, — але чесний
 * результат замість `NaN`/від'ємного рядка для будь-якого захисного виклику).
 */
export function formatCompactDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes === 0) return '0 хв';

  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;

  if (hours === 0) return `${remainderMinutes} хв`;
  if (remainderMinutes === 0) return `${hours} год`;
  return `${hours} год ${remainderMinutes} хв`;
}

const HOUR_FORMS = ['година', 'години', 'годин'] as const;
const MINUTE_FORMS = ['хвилина', 'хвилини', 'хвилин'] as const;

/**
 * Повна, "розмовна" форма тривалості для accessibility-описів ("1 година 12 хвилин") — на
 * відміну від компактної `formatCompactDuration` ("1 год 12 хв"): ТЗ явно розрізняє два
 * формати ("1 год 12 хв" — видимий текст клітинки; "1 година 12 хвилин" — приклад
 * accessibility-рядка), скорочення "год"/"хв" читач екрана може вимовити незрозуміло
 * (наприклад, як окремі літери), повні слова — завжди однозначні. Плюралізація — той самий
 * наявний `pluralizeUk` (`src/lib/pluralizeUk.ts`), не нова.
 */
export function formatDurationForAccessibility(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes === 0) return `0 ${pluralizeUk(0, MINUTE_FORMS)}`;

  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${pluralizeUk(hours, HOUR_FORMS)}`);
  if (remainderMinutes > 0 || hours === 0) parts.push(`${remainderMinutes} ${pluralizeUk(remainderMinutes, MINUTE_FORMS)}`);
  return parts.join(' ');
}
