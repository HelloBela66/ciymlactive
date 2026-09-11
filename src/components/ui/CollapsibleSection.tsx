import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useTheme } from '@/design/ThemeProvider';

interface CollapsibleSectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

/**
 * Згортана секція (POLYTSIA V1.6, Фаза 2 — Book Details) — той самий "+ toggle" ідіом, що вже
 * застосований для форм у `GenreTagsSection`/`JournalSection` цього ж екрана
 * (`app/work/[workId].tsx`), тут узагальнений у перевикористовуваний компонент для ЦІЛИХ
 * розділів екрана, а не лише форм усередині них. Навмисно НЕ анімований розгорт/згорт (немає
 * `LayoutAnimation`/Reanimated-переходу) — проста синхронна зміна висоти достатня тут і не додає
 * ризику зависання на слабших Android-пристроях заради суто косметичного ефекту.
 *
 * Свідомий, обмежений трейд-офф Фази 2 (а не повний редизайн з hero+вкладками): екран
 * "Деталі книги" — найскладніший і найбільш взаємопов'язаний екран застосунку (торкається
 * бібліотеки, оцінки, щоденника, історії читання, видань, жанрів/тегів, серії, прогнозу
 * завершення), тож тут навмисно обрано найдешевший спосіб дати екрану ієрархію (розгорнуто за
 * замовчуванням — основний цикл читання; згорнуто — довідкові розділи) без переписування самої
 * структури даних чи навігації — відповідно до принципу "коли нова функція конфліктує зі
 * спрощенням основного потоку — обирай спрощення".
 */
export function CollapsibleSection({ title, defaultExpanded = false, children }: CollapsibleSectionProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title}, ${expanded ? 'згорнути' : 'розгорнути'}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: theme.minTouchTarget,
        }}
      >
        <AppText variant="heading">{title}</AppText>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.textTertiary} />
      </Pressable>
      {expanded ? children : null}
    </View>
  );
}
