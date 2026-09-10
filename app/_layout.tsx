import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from '@/design/ThemeProvider';
import { ErrorToastProvider } from '@/design/ErrorToastProvider';
import { DatabaseProvider } from '@/data/db/DatabaseProvider';
import { queryClient } from '@/lib/queryClient';
import { runAutoBackupIfDue } from '@/lib/autoBackup';
import { createLogger } from '@/lib/logger';

const log = createLogger('app/_layout');

/**
 * Root layout. Порядок провайдерів важливий:
 * SafeArea/Gesture (нативна інфраструктура) → Theme (щоб DatabaseProvider міг стилізувати
 * свій loading/error стан) → Database (гейт до готовності SQLite) → QueryClient →
 * ErrorToast (глобальні тости помилок мутацій, Milestone 8) → навігаційний Stack.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <DatabaseProvider>
            <QueryClientProvider client={queryClient}>
              <ErrorToastProvider>
                <ThemedNavigation />
              </ErrorToastProvider>
            </QueryClientProvider>
          </DatabaseProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedNavigation() {
  const theme = useTheme();

  // Автобекап (Milestone 9) — цей компонент монтується лише ПІСЛЯ того, як `DatabaseProvider`
  // (батьківський у дереві вище) підтвердить готовність БД, тож тут безпечно одразу читати
  // з неї. `hasRunRef` — не проти повторного виклику самої функції (вона й так ідемпотентна:
  // перевіряє `isEnabled`/`getLastRunAt` і мовчки виходить, якщо бекап ще не потрібен), а
  // проти зайвого читання SecureStore при кожному ре-рендері цього компонента (наприклад,
  // після зміни теми).
  const hasRunRef = useRef(false);
  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;
    void runAutoBackupIfDue();
  }, []);

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

/**
 * Expo Router автоматично використовує компонент з ЦИМ ІМ'ЯМ, експортований з файлу layout,
 * як межу відлову помилок рендеру для всього піддерева цього маршруту (Milestone 8 — аудит
 * показав: такого не було ЖОДНОГО в застосунку, тож будь-яка непіймана помилка рендеру
 * валила весь застосунок на нативний "red screen" без жодного способу відновитись, не
 * перезапускаючи застосунок вручну).
 *
 * Навмисно НЕ використовує `useTheme()`/токени кольору — ця межа мусить надійно
 * відрендеритись, навіть якщо сама помилка сталась усередині `ThemeProvider` чи вище нього в
 * дереві (тобто контекст теми на момент показу цієї межі не гарантовано доступний) — кольори
 * тут захардкоджені (ті самі значення, що й `lightColors` у `src/design/tokens.ts`, але
 * навмисно скопійовані, а не імпортовані, щоб не тягнути залежність, яка сама могла впасти).
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  log.error('Непіймана помилка рендеру', { message: error.message, stack: error.stack });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Щось пішло не так</Text>
      <Text style={styles.message}>
        Застосунок наштовхнувся на неочікувану помилку. Спробуй ще раз — жодні дані при цьому
        не втрачаються, усе зберігається в локальній базі одразу під час дії, а не лише в
        пам&apos;яті екрана.
      </Text>
      <Pressable onPress={retry} accessibilityRole="button" accessibilityLabel="Спробувати ще раз" style={styles.button}>
        <Text style={styles.buttonText}>Спробувати ще раз</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#FAF9F7' },
  title: { fontSize: 20, fontWeight: '600', color: '#1B1B18', marginBottom: 12, textAlign: 'center' },
  message: { fontSize: 15, color: '#6B6862', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  button: {
    backgroundColor: '#2F6F5E',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
