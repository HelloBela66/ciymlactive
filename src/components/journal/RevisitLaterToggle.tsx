import React from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design/ThemeProvider';

interface RevisitLaterToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
  size?: number;
}

/**
 * ТЗ Фази 11 («ПОВЕРНУТИСЯ ПІЗНІШЕ») — «Користувач може позначити будь-який власний journal
 * entry»: той самий universal toggle, що й "обране" (`heart`-`Pressable`), лише інша піктограма
 * (`bookmark`) і інше значення (`revisitLater` замість `isFavorite`).
 *
 * Винесено в окремий спільний компонент, а НЕ втретє вручну продубльовано ту саму розмітку —
 * на відміну від самого "обране" (`heart`-`Pressable`), яка існує інлайн у ТРЬОХ місцях показу
 * записів щоденника (`app/journal/index.tsx`, `app/work/[workId].tsx`,
 * `app/session/[sessionId].tsx`) ще з Milestone 11. Додавати новий прапорець тим самим
 * інлайн-способем означало б учетверте копіювати один і той самий `Pressable`+`Ionicons`
 * блок — тут навпаки, один спільний компонент одразу для всіх трьох нових місць виклику, щоб
 * іконка/розмір/accessibilityLabel не розійшлись між копіями (той самий принцип, що й
 * `ReactionToggle`, `src/components/journal/ReactionPicker.tsx`).
 */
export function RevisitLaterToggle({ value, onChange, size = 16 }: RevisitLaterToggleProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="button"
      accessibilityState={{ selected: value }}
      accessibilityLabel={value ? 'Прибрати з «Повернутися пізніше»' : 'Позначити «Повернутися пізніше»'}
      hitSlop={8}
      style={{
        width: theme.minTouchTarget,
        height: theme.minTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons
        name={value ? 'bookmark' : 'bookmark-outline'}
        size={size}
        color={value ? theme.colors.accent : theme.colors.textTertiary}
      />
    </Pressable>
  );
}
