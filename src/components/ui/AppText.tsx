import React from 'react';
import { Text, TextProps } from 'react-native';
import { useTheme } from '@/design/ThemeProvider';
import type { TypeScaleEntry } from '@/design/tokens';

interface AppTextProps extends TextProps {
  variant?: keyof typeof variantKeys;
  color?: 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'onAccent';
}

const variantKeys = {
  display: true,
  title: true,
  heading: true,
  body: true,
  caption: true,
  micro: true,
} as const;

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
