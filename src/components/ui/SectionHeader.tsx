import React from 'react';
import { View } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from '@/design/ThemeProvider';

interface SectionHeaderProps {
  title: React.ReactNode;
  trailing?: React.ReactNode;
  /** `'split'` (за замовчуванням) — заголовок ліворуч, `trailing` притиснутий до правого краю
   * (`justifyContent: 'space-between'`) — так виглядав заголовок `CurrentlyReadingList`
   * (`app/(tabs)/index.tsx`) з посиланням "Усі (N)". `'inline'` — заголовок і `trailing` поруч
   * ліворуч (`alignItems: 'baseline'`, невеликий `gap`) — так виглядав заголовок `YearSection`
   * (`app/on-this-day.tsx`) з підписом "N років тому" одразу біля року. */
  layout?: 'split' | 'inline';
}

/**
 * ТЗ Фази 19 (DESIGN SYSTEM EXTENSION) — рядок "заголовок + опційний елемент праворуч",
 * продубльований до цієї фази на `CurrentlyReadingList` (`app/(tabs)/index.tsx`) і
 * `YearSection` (`app/on-this-day.tsx`) двома трохи різними розкладками (див. `layout` вище) —
 * обидві реальні, тому обидві підтримані пропом, а не вгадані наперед.
 */
export function SectionHeader({ title, trailing, layout = 'split' }: SectionHeaderProps) {
  const theme = useTheme();

  if (layout === 'inline') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm }}>
        <AppText variant="heading">{title}</AppText>
        {trailing}
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <AppText variant="heading">{title}</AppText>
      {trailing}
    </View>
  );
}
