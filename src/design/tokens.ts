/**
 * Design tokens for «Полиця».
 *
 * Принцип (див. docs/ARCHITECTURE.md, розділ 6): спокійний, преміальний, мінімалістичний UI.
 * Обкладинки книг — головний колірний елемент інтерфейсу; UI-палітра свідомо нейтральна,
 * щоб не конкурувати з ними. Ніяких вінтажних/неонових мотивів, важких градієнтів чи тіней.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Мінімальний розмір інтерактивного елемента (accessibility, п.37 ТЗ). */
export const minTouchTarget = 44;

export type FontWeight = '400' | '500' | '600' | '700';

export interface TypeScaleEntry {
  size: number;
  lineHeight: number;
  weight: FontWeight;
}

/**
 * Явний (не Record<string, ...>) тип шкали: з увімкненим noUncheckedIndexedAccess будь-який
 * доступ через індексний тип TypeScript вважає потенційно undefined, навіть для звичайного
 * `.body`. Іменовані властивості такої проблеми не мають — тому тут конкретний інтерфейс.
 */
export interface TypeScale {
  display: TypeScaleEntry;
  title: TypeScaleEntry;
  heading: TypeScaleEntry;
  body: TypeScaleEntry;
  caption: TypeScaleEntry;
  micro: TypeScaleEntry;
}

export const typography: { fontFamily: { base: string }; scale: TypeScale } = {
  // Системний шрифт: підхоплює Dynamic Type / шрифтові налаштування ОС без додаткової роботи.
  fontFamily: { base: 'System' },
  scale: {
    display: { size: 32, lineHeight: 40, weight: '700' },
    title: { size: 22, lineHeight: 28, weight: '600' },
    heading: { size: 17, lineHeight: 22, weight: '600' },
    body: { size: 15, lineHeight: 22, weight: '400' },
    caption: { size: 13, lineHeight: 18, weight: '400' },
    micro: { size: 11, lineHeight: 14, weight: '500' },
  },
};

export interface ColorPalette {
  bg: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentSoft: string;
  success: string;
  warning: string;
  danger: string;
  overlay: string;
  onAccent: string;
}

export const lightColors: ColorPalette = {
  bg: '#FAF9F7',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  border: '#E7E4DF',
  textPrimary: '#1B1B18',
  textSecondary: '#6B6862',
  textTertiary: '#9C988F',
  accent: '#2F6F5E',
  accentSoft: '#E6EFEC',
  success: '#2F6F5E',
  warning: '#B8863B',
  danger: '#B4453A',
  overlay: 'rgba(20,18,16,0.45)',
  onAccent: '#FFFFFF',
};

export const darkColors: ColorPalette = {
  bg: '#15140F',
  surface: '#1D1B16',
  surfaceRaised: '#242219',
  border: '#332F26',
  textPrimary: '#F3F1EC',
  textSecondary: '#B3AFA5',
  // Було '#7C786E' — не проходило WCAG AA (4.5:1) на жодному з трьох темних фонів (аудит
  // Milestone 8: ~4.19:1 на bg, ~3.91:1 на surface, ~3.62:1 на surfaceRaised, найгірший).
  // '#948F84' дає ≥4.95:1 на всіх трьох (перевірено окремо), лишаючись помітно тьмянішим за
  // textSecondary '#B3AFA5' — і далі читається як "третинний" текст, а не другорядний.
  textTertiary: '#948F84',
  accent: '#6FBFA6',
  accentSoft: '#1E332C',
  success: '#6FBFA6',
  warning: '#D9A85C',
  danger: '#E07567',
  overlay: 'rgba(0,0,0,0.6)',
  onAccent: '#0E1512',
};

export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

export const tokens = { spacing, radius, minTouchTarget, typography, motion } as const;
