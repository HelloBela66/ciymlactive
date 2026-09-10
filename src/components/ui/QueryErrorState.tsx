import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/design/ThemeProvider';
import { AppText } from './AppText';
import { Button } from './Button';

interface QueryErrorStateProps {
  /** Необов'язково — конкретніший текст для конкретного екрана; типовий підходить для
   * більшості випадків (усі помилки запитів тут — деталі мережі/БД, не цікаві користувачу). */
  message?: string;
  onRetry: () => void;
}

/**
 * Спільний стан "не вдалось завантажити" для `useQuery` (Milestone 8 — аудит показав: 10
 * вибіркових екранів перевіряли лише `isLoading`/порожні дані, ЖОДЕН не перевіряв `isError`
 * — невдалий запит (найчастіше `getDatabase()`, що впала) назавжди лишався або спінером, або
 * порожнім станом, невідмінним від "книг справді немає". Один спільний компонент замість
 * ручного JSX в кожному з 10 екранів — і гарантія, що кнопка "Спробувати ще раз" викликає
 * саме `refetch` цього запиту (React Query сам повторює `queryFn` — тут заново намагається
 * `getDatabase()`, який після Milestone 8 фікса `client.ts` більше не застряє назавжди на
 * відхиленому промісі).
 */
export function QueryErrorState({ message, onRetry }: QueryErrorStateProps) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: theme.spacing.xxxl, gap: theme.spacing.md }}>
      <AppText variant="heading" color="secondary" style={{ textAlign: 'center' }}>
        Не вдалося завантажити дані
      </AppText>
      <AppText variant="body" color="tertiary" style={{ textAlign: 'center' }}>
        {message ?? "Перевір, чи застосунок має доступ до бази даних, і спробуй ще раз."}
      </AppText>
      <Button label="Спробувати ще раз" variant="secondary" onPress={onRetry} style={{ marginTop: theme.spacing.sm }} />
    </View>
  );
}
