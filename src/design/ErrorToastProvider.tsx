import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeProvider';
import { AppText } from '@/components/ui/AppText';

interface ErrorToastContextValue {
  /** Показує коротке повідомлення про помилку внизу екрана на кілька секунд (чи доки
   * користувач сам не торкнеться — тоді ховається одразу). */
  showError: (message: string) => void;
}

const ErrorToastContext = createContext<ErrorToastContextValue | null>(null);

const AUTO_HIDE_MS = 5000;

/**
 * Мінімальний глобальний тост для помилок мутацій (Milestone 8 — аудит показав: ЖОДНА з ~29
 * `useMutation` у застосунку не мала `onError`, тож збій (мережа, диск, SQLite-обмеження
 * тощо) або тихо губився в `isError`-прапорці, який на практиці ніхто не перевіряв, або
 * вилітав у консоль/термінал необробленим промісом — реальний приклад саме такого краху,
 * який побачив користувач: CHECK constraint при збереженні книги через ISBNdb (виправлено
 * окремо, Migration 002 + try/catch у `app/import/review.tsx`, але сам клас проблеми —
 * "мутація впала, а користувач про це не дізнався" — лишався всюди інде).
 *
 * Один спільний тост, підключений через `useErrorToast()` у кожному хуку мутацій
 * (`onError: (error) => showError('...')`), простіше підтримувати і гарантує, що жодна нова
 * мутація не "забуде" показати помилку, на відміну від ручного `isError`-рендеру в кожному з
 * ~20 екранів окремо (той підхід і далі лишається на екранах, де вже був, — тост цьому не
 * заважає, а лише додає гарантований мінімум).
 */
export function ErrorToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((next: string) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setMessage(next);
    hideTimer.current = setTimeout(() => setMessage(null), AUTO_HIDE_MS);
  }, []);

  const dismiss = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setMessage(null);
  }, []);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  return (
    <ErrorToastContext.Provider value={{ showError }}>
      {children}
      {message ? <ErrorToastBanner message={message} onDismiss={dismiss} /> : null}
    </ErrorToastContext.Provider>
  );
}

function ErrorToastBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: insets.bottom + theme.spacing.lg,
        alignItems: 'center',
        paddingHorizontal: theme.spacing.lg,
      }}
    >
      <Pressable
        onPress={onDismiss}
        accessibilityRole="alert"
        accessibilityLabel={message}
        style={{
          backgroundColor: theme.colors.danger,
          borderRadius: theme.radius.md,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          maxWidth: 480,
          minHeight: theme.minTouchTarget,
          justifyContent: 'center',
        }}
      >
        <AppText variant="caption" color="onAccent" style={{ textAlign: 'center' }}>
          {message}
        </AppText>
      </Pressable>
    </View>
  );
}

export function useErrorToast(): ErrorToastContextValue {
  const ctx = useContext(ErrorToastContext);
  if (!ctx) {
    throw new Error('useErrorToast() використано поза межами <ErrorToastProvider>.');
  }
  return ctx;
}
