import React from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { Card } from './Card';
import { useTheme } from '@/design/ThemeProvider';

const ICON_CIRCLE_SIZE = 44;

function IconCircle({ icon }: { icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: ICON_CIRCLE_SIZE,
        height: ICON_CIRCLE_SIZE,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={20} color={theme.colors.accent} />
    </View>
  );
}

interface QuickActionProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  /** `'row'` (за замовчуванням) — повноширинна `Card` з описом і шевроном (`TomorrowEntryPointCard`
   * тощо, `app/(tabs)/index.tsx`). `'tile'` — компактна колонка іконка+підпис без `Card`
   * (`HomeShortcuts`, той самий файл). */
  variant?: 'row' | 'tile';
  /** Лише для `variant="row"`. */
  description?: string;
  accessibilityLabel?: string;
}

/**
 * ТЗ Фази 19 (DESIGN SYSTEM EXTENSION) — "іконка-коло + підпис", найдубльованіший патерн з усіх
 * знайдених аудитом: той самий 44×44 `accentSoft`-круг був скопійований 4 рази в одному файлі
 * (`app/(tabs)/index.tsx`) у двох трохи різних формах — компактна плитка (`HomeShortcuts`) і
 * повноширинний рядок-картка з описом і шевроном (`TomorrowEntryPointCard`/
 * `OnePickerEntryPointCard`/`TrendsEntryPointCard`).
 */
export function QuickAction({
  icon,
  label,
  onPress,
  variant = 'row',
  description,
  accessibilityLabel,
}: QuickActionProps) {
  const theme = useTheme();

  if (variant === 'tile') {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        style={{ flex: 1, alignItems: 'center', gap: theme.spacing.xs, paddingVertical: theme.spacing.xs }}
      >
        <IconCircle icon={icon} />
        <AppText variant="micro" color="secondary" style={{ textAlign: 'center' }}>
          {label}
        </AppText>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <IconCircle icon={icon} />
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{label}</AppText>
          {description ? (
            <AppText variant="caption" color="secondary">
              {description}
            </AppText>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </Card>
    </Pressable>
  );
}
