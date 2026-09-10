import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@/design/ThemeProvider';
import { AppText } from './AppText';

interface ChipOption<T extends string> {
  value: T;
  label: string;
}

interface ChipSelectProps<T extends string> {
  label: string;
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Блокує всі чипи (наприклад, поки триває мутація зміни статусу) — запобігає подвійному
   * тапу, що встиг би відправити другий запит до завершення першого (Milestone 10 fix6,
   * `docs/STATUS_V1.md` п. 3.1). За замовчуванням `false` — решта викликів ChipSelect у
   * застосунку цю поведінку не потребують і не змінюються. */
  disabled?: boolean;
}

/** Одиночний вибір з невеликого набору значень (формат видання тощо) — рядок "таблеток". */
export function ChipSelect<T extends string>({ label, options, value, onChange, disabled }: ChipSelectProps<T>) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <AppText variant="caption" color="secondary">
        {label}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: !!disabled }}
              accessibilityLabel={option.label}
              style={{
                paddingHorizontal: theme.spacing.md,
                minHeight: theme.minTouchTarget,
                justifyContent: 'center',
                borderRadius: theme.radius.pill,
                backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
                borderWidth: 1,
                borderColor: selected ? theme.colors.accent : theme.colors.border,
                opacity: disabled ? 0.6 : 1,
              }}
            >
              <AppText variant="caption" color={selected ? 'onAccent' : 'secondary'}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
