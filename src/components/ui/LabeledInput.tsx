import React from 'react';
import { TextInput, TextInputProps, View } from 'react-native';
import { useTheme } from '@/design/ThemeProvider';
import { AppText } from './AppText';

interface LabeledInputProps extends TextInputProps {
  label: string;
  required?: boolean;
  error?: string;
}

/**
 * Єдина текстова поле-обгортка для форм (зараз — ручне додавання книги, Milestone 1).
 * Тримає підпис/помилку/touch target консистентними, щоб кожна форма не переписувала це сама.
 */
export function LabeledInput({ label, required, error, style, ...rest }: LabeledInputProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <AppText variant="caption" color="secondary">
        {label}
        {required ? ' *' : ''}
      </AppText>
      <TextInput
        placeholderTextColor={theme.colors.textTertiary}
        style={[
          {
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            borderColor: error ? theme.colors.danger : theme.colors.border,
            paddingHorizontal: theme.spacing.md,
            minHeight: theme.minTouchTarget,
            color: theme.colors.textPrimary,
            fontSize: theme.typography.scale.body.size,
          },
          style,
        ]}
        accessibilityLabel={label}
        {...rest}
      />
      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
