import React from 'react';
import { Text, TextProps } from 'react-native';
import { useTheme } from '@/design/ThemeProvider';
import type { TypeScaleEntry } from '@/design/tokens';

type AppTextVariant = 'display' | 'title' | 'heading' | 'body' | 'caption' | 'micro';

interface AppTextProps extends TextProps {
  variant?: AppTextVariant;
  color?: 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'onAccent';
}

/**
 * Єдиний текстовий компонент застосунку: гарантує, що всі написи використовують
 * typography-шкалу з design tokens, а не довільні розміри по фічах.
 */
export function AppText({ variant = 'body', color = 'primary', style, ...rest }: AppTextProps) {
  const theme = useTheme();
  const scale: TypeScaleEntry = theme.typography.scale[variant] ?? theme.typography.scale.body;
  const colorMap = {
    primary: theme.colors.textPrimary,
    secondary: theme.colors.textSecondary,
    tertiary: theme.colors.textTertiary,
    accent: theme.colors.accent,
    danger: theme.colors.danger,
    onAccent: theme.colors.onAccent,
  } as const;

  return (
    <Text
      style={[
        {
          fontSize: scale.size,
          lineHeight: scale.lineHeight,
          fontWeight: scale.weight,
          color: colorMap[color],
        },
        style,
      ]}
      {...rest}
    />
  );
}
