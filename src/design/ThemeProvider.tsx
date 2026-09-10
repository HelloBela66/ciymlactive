import React, { createContext, useContext, useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Appearance, ColorSchemeName, AccessibilityInfo } from 'react-native';
import { darkColors, lightColors, ColorPalette, spacing, radius, typography, motion, minTouchTarget } from './tokens';
import { ThemePreferenceStorage } from '@/lib/themePreferenceStorage';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Theme {
  colors: ColorPalette;
  scheme: 'light' | 'dark';
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  motion: typeof motion;
  minTouchTarget: number;
  reduceMotionEnabled: boolean;
}

interface ThemeContextValue extends Theme {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Appearance.getColorScheme() у типах RN повертає ColorSchemeName, який в деяких версіях
// лишає можливість null/undefined (немає системного значення) — тому тут навмисно ширший
// тип, а не точний ColorSchemeName.
type SystemScheme = ColorSchemeName | null | undefined;

function resolveScheme(preference: ThemePreference, system: SystemScheme): 'light' | 'dark' {
  if (preference === 'system') return system === 'dark' ? 'dark' : 'light';
  return preference;
}

/**
 * ThemeProvider: тримає вибір теми (system/light/dark) і reduceMotion-прапорець, і персистить
 * `preference` через `ThemePreferenceStorage` (`expo-secure-store`, Milestone 8 — аудит
 * показав: Profile-екран уже мав робочий пікер, що викликав `setPreference`, але значення
 * ніде не зберігалось і скидалось на `'system'` при кожному перезапуску застосунку). Перша
 * версія цього фікса персистила через SQLite (`app_settings.theme`) — на реальному пристрої
 * підтвердилось, що вибір усе одно не переживав перезапуск (детальніше — коментар у
 * `themePreferenceStorage.ts`), тому персистентність перенесено на `expo-secure-store`, який
 * не залежить від готовності БД чи порядку міграцій.
 *
 * Читання при монтуванні (`useEffect` нижче) — "best effort": `ThemePreferenceStorage.load`
 * повертає `null` замість кидання помилки, якщо щось не так; тоді просто лишаємо дефолтний
 * `'system'`.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [systemScheme, setSystemScheme] = useState<SystemScheme>(() => Appearance.getColorScheme());
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  // Захист від того, щоб фонове читання при монтуванні не перезаписало вибір, який
  // користувач встиг зробити (малоймовірно, зважаючи на швидкість запиту, але дешево
  // перевірити) — записуємо в стан лише якщо користувач ще нічого сам не міняв.
  const userChangedRef = useRef(false);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystemScheme(colorScheme));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduceMotionEnabled).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotionEnabled);
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await ThemePreferenceStorage.load();
      if (!cancelled && saved && !userChangedRef.current) {
        setPreferenceState(saved);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    userChangedRef.current = true;
    setPreferenceState(next);
    void ThemePreferenceStorage.save(next);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme = resolveScheme(preference, systemScheme);
    return {
      preference,
      setPreference,
      scheme,
      colors: scheme === 'dark' ? darkColors : lightColors,
      spacing,
      radius,
      typography,
      motion,
      minTouchTarget,
      reduceMotionEnabled,
    };
  }, [preference, systemScheme, reduceMotionEnabled, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme() використано поза межами <ThemeProvider>.');
  }
  return ctx;
}
