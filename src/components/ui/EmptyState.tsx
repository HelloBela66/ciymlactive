import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/design/ThemeProvider';
import { AppText } from './AppText';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Кожен порожній екран пропонує наступну дію (п.39 ТЗ) — цей компонент робить це
 * структурним правилом, а не домовленістю, яку легко забути в окремій фічі.
 */
export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: theme.spacing.xxxl, gap: theme.spacing.md }}>
      <AppText variant="heading" color="secondary" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      {description ? (
        <AppText variant="body" color="tertiary" style={{ textAlign: 'center' }}>
          {description}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={{ marginTop: theme.spacing.sm }} />
      ) : null}
    </View>
  );
}
