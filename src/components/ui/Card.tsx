import React from 'react';
import { View, ViewProps } from 'react-native';
import { useTheme } from '@/design/ThemeProvider';

/** Делікатна картка: тонкий border замість важких тіней (принцип "без надмірних shadows"). */
export function Card({ style, ...rest }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth: StyleSheetHairline,
          borderColor: theme.colors.border,
          padding: theme.spacing.lg,
        },
        style,
      ]}
      {...rest}
    />
  );
}

// Тонка, але видима лінія на обох платформах (0 інколи зникає на деяких Android-щільностях).
const StyleSheetHairline = 1;
