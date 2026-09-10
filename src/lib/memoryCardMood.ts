import type { Genre } from '@/types/genre';

/**
 * "Вайб" картки-спогаду — тематичне оформлення на основі жанру книги (доповнення до
 * Milestone 11 Фази 10, за прямим запитом власника продукту: "якщо книга дарк роман —
 * щось пов'язане з тематикою, якщо романтика — щось романтичне"). НЕ замінює головний
 * акцентний колір картки (`work.coverFallbackColor`, використовується для риски/смужки/
 * медальйонів статистики скрізь у `MemoryCardPreview.tsx`) — лише додає тонкий тематичний
 * водяний знак поверх, тож дизайн лишається впізнаваним для книги (колір обкладинки), і
 * водночас відчутно різним за настроєм для різних жанрів.
 *
 * `icon` типізовано як звичайний `string`, не `Ionicons`-специфічний тип — ця бібліотека
 * навмисно UI-агностична (той самий принцип, що й решта `src/lib/*`); компонент, що
 * рендерить іконку, застосовує власний вужчий тип.
 */
export interface CardMood {
  key: string;
  icon: string;
  /** Приглушений тематичний акцент для водяного знаку (сам по собі, без картки, ніде не
   * використовується) — підібраний у тій самій "спокійній" палітрі, що й
   * `coverFallback.ts`, не яскравий/неоновий. */
  tint: string;
}

/** Порядок масиву — порядок пріоритету: коли в книги кілька жанрів одразу (наприклад
 * "Фентезі" + "Романтика"), перемагає той вайб, що стоїть вище. */
const MOODS: readonly CardMood[] = [
  { key: 'dark', icon: 'moon', tint: '#4A4560' },
  { key: 'fantasy', icon: 'sparkles', tint: '#6E5B9E' },
  { key: 'romantic', icon: 'heart', tint: '#B4607A' },
  { key: 'adventurous', icon: 'compass-outline', tint: '#B8763B' },
  { key: 'playful', icon: 'happy-outline', tint: '#C99A3B' },
  { key: 'poetic', icon: 'leaf-outline', tint: '#7A8C5B' },
  { key: 'cerebral', icon: 'bulb-outline', tint: '#5B7A8C' },
];

const DEFAULT_MOOD: CardMood = { key: 'poetic', icon: 'leaf-outline', tint: '#7A8C5B' };

/** Жанри звірені за `genre.name_uk` (`GenreRepository.ts`, `SEED_GENRES`) — точний рядок, а
 * не `slug`, щоб не залежати від деталей `slugify()`. Власні (користувацькі) жанри в цей
 * список не потраплять — для них картка падає назад на детермінований хеш нижче, тож книга
 * все одно матиме стабільний, лише не тематично "вгаданий" вайб. */
const MOOD_GENRES: Record<string, readonly string[]> = {
  dark: ['Жахи', 'Трилер', 'Детектив'],
  fantasy: ['Фентезі', 'Наукова фантастика'],
  romantic: ['Романтика'],
  adventurous: ['Пригоди', 'Історичний роман'],
  playful: ['Дитяча література', 'Підліткова література', 'Комікси та графічні романи', 'Гумор'],
  poetic: ['Поезія', 'Класична література', 'Драма', 'Сучасна проза'],
  cerebral: [
    'Нон-фікшн',
    'Біографія та мемуари',
    'Історія',
    'Психологія',
    'Саморозвиток',
    'Бізнес',
    'Наука',
    'Філософія',
    'Публіцистика',
  ],
};

/** Той самий алгоритм хешування, що й `pickCoverFallbackColor` (`coverFallback.ts`) —
 * навмисно один і той самий прийом для будь-якого "детерміновано за рядком" вибору в
 * застосунку, а не окремий для кожного нового місця. */
function hashString(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Обирає вайб картки: за жанрами книги, коли вони є й впізнавані (перший пріоритетний
 * збіг) — інакше детерміновано за `seedKey` (id твору), щоб та сама книга завжди мала той
 * самий вайб, а різні книги без впізнаваного жанру все одно різнились між собою, а не всі
 * підпадали під один "нейтральний" вигляд.
 */
export function pickCardMood(genres: Pick<Genre, 'nameUk'>[] | undefined, seedKey: string): CardMood {
  if (genres && genres.length > 0) {
    const names = new Set(genres.map((g) => g.nameUk));
    const matched = MOODS.find((mood) => MOOD_GENRES[mood.key]?.some((name) => names.has(name)));
    if (matched) return matched;
  }
  const index = hashString(seedKey) % MOODS.length;
  return MOODS[index] ?? DEFAULT_MOOD;
}

/**
 * `count` детермінованих псевдовипадкових чисел у [0, 1) за `seedKey` — та сама книга завжди
 * дає той самий розкид (не "миготить" при кожному ре-рендері картки), різні книги — різний.
 * xorshift32, засіяний `hashString(seedKey)` — проста рівномірна послідовність для розкладки
 * водяного знаку по картці, не для криптографії.
 */
export function moodSeedValues(seedKey: string, count: number): number[] {
  let state = hashString(seedKey) || 1;
  const values: number[] = [];
  for (let i = 0; i < count; i += 1) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    // Ділення саме на 2^32 (не 2^32-1) — результат гарантовано < 1 навіть коли `state`
    // дорівнює максимальному 32-бітному значенню (0xFFFFFFFF), а не лише "майже завжди".
    values.push(state / 4294967296);
  }
  return values;
}
