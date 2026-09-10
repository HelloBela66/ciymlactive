import React from 'react';
import { Pressable, StyleSheet, ViewStyle, GestureResponderEvent } from 'react-native';
import { useTheme } from '@/design/ThemeProvider';
import { AppText } from './AppText';

interface ButtonProps {
  label: string;
  onPress?: (e: GestureResponderEvent) => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
}

/**
 * Єдина кнопка застосунку. Мінімальний touch target 44pt (п.37) гарантується minHeight
 * незалежно від довжини тексту.
 */
export function Button({ label, onPress, variant = 'primary', disabled, style, accessibilityHint }: ButtonProps) {
  const theme = useTheme();

  const backgroundColor =
    variant === 'primary' ? theme.colors.accent : variant === 'secondary' ? theme.colors.accentSoft : 'transparent';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor,
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.spacing.xl,
          minHeight: theme.minTouchTarget,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <AppText variant="heading" color={variant === 'primary' ? 'onAccent' : 'accent'}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
});
