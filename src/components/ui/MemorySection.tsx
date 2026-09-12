import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { Card } from './Card';
import { useTheme } from '@/design/ThemeProvider';

interface MemorySectionProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** За замовчуванням 18 — розмір, яким уже малювалась більшість цих секцій
   * (`app/memory/[workId].tsx`); деякі екрани (`app/recall/[workId].tsx`) використовували 16. */
  iconSize?: number;
  title: string;
  /** Внутрішній `gap` картки — за замовчуванням `theme.spacing.sm` (як у більшості секцій);
   * `BeforeAfterSection` (`app/memory/[workId].tsx`) використовував `md`. */
  gap?: number;
  children: React.ReactNode;
}

/**
 * ТЗ Фази 19 (DESIGN SYSTEM EXTENSION) — картка "іконка + заголовок + вміст", яка до цієї
 * фази була продубльована вручну щонайменше 5 разів однаковою розміткою (`flexDirection: 'row'`
 * + `Ionicons` + `AppText variant="heading"` усередині `Card`): `RevisitLaterSection` і
 * `BeforeAfterSection` на `app/memory/[workId].tsx`, і три секції (улюблені моменти/цитати/думки)
 * на `app/recall/[workId].tsx`. Навмисно НЕ використана для `BookCapsuleSection`/`LoreSection`
 * (той самий файл `app/memory/[workId].tsx`) — ті мають іншу форму (іконка + опис-речення в один
 * рядок, без окремого заголовка); примусова уніфікація зробила б код менш читабельним заради
 * самої лише уніфікації (те саме застереження, що й "Не редизайнь весь application" у ТЗ Фази 19).
 */
export function MemorySection({ icon, iconSize = 18, title, gap, children }: MemorySectionProps) {
  const theme = useTheme();
  return (
    <Card style={{ gap: gap ?? theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name={icon} size={iconSize} color={theme.colors.accent} />
        <AppText variant="heading">{title}</AppText>
      </View>
      {children}
    </Card>
  );
}
