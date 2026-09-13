import React from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { Card } from './Card';
import { useTheme } from '@/design/ThemeProvider';

interface OnboardingHintCardProps {
  title: string;
  description: string;
  onDismiss: () => void;
}

/**
 * PROGRESSIVE ONBOARDING, Фаза 18 (`docs/PROGRESSIVE_ONBOARDING.md`) — контекстна підказка, що
 * з'являється РІВНО ОДИН РАЗ у своєму власному контексті (порожня бібліотека/перша сесія/перша
 * прочитана книга, `useOnboardingHint`), а не крок tutorial-флоу, який треба пройти. Закривається
 * одним тапом на ×, ніколи не модальне вікно — той самий "не блокує" принцип, що й
 * `docs/PRODUCT.md` §"Порожні та помилкові стани": підказку завжди можна проігнорувати й
 * продовжити користуватись застосунком.
 *
 * `theme.colors.accentSoft` як фон (той самий колір, що й `IconCircle` у `QuickAction.tsx`, і
 * "Прочитано!"-значок на `app/completion/[workId].tsx`) — досить, щоб візуально виділити
 * підказку серед звичайних `Card`, без введення нового кольору теми.
 */
export function OnboardingHintCard({ title, description, onDismiss }: OnboardingHintCardProps) {
  const theme = useTheme();

  return (
    <Card style={{ gap: theme.spacing.xs, backgroundColor: theme.colors.accentSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <AppText variant="heading" style={{ flex: 1 }}>
          {title}
        </AppText>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Закрити підказку"
          hitSlop={8}
          style={{
            minWidth: theme.minTouchTarget,
            minHeight: theme.minTouchTarget,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: -theme.spacing.sm,
            marginRight: -theme.spacing.sm,
            marginBottom: -theme.spacing.sm,
          }}
        >
          <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
        </Pressable>
      </View>
      <AppText variant="body" color="secondary">
        {description}
      </AppText>
    </Card>
  );
}
