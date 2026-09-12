import React from 'react';
import { View } from 'react-native';
import { AppText } from './AppText';
import { CoverThumbnail } from './CoverThumbnail';
import { useTheme } from '@/design/ThemeProvider';

interface JournalPreviewProps {
  title: string;
  coverUrl: string | null | undefined;
  coverFallbackColor: string | null | undefined;
  /** Рядки під назвою (автори, короткий preview спогаду, факти сесії тощо) — різні на кожному
   * екрані, тому передаються через `children`, а не жорстко зашиті тут. */
  children?: React.ReactNode;
}

/**
 * ТЗ Фази 19 (DESIGN SYSTEM EXTENSION) — рядок "обкладинка 48×70 + назва + додаткові рядки",
 * продубльований до цієї фази щонайменше 4 рази однаковою розміткою: `MemoryIndexRow`
 * (`app/memory/index.tsx`), `MemoryCard` (`app/on-this-day.tsx`), і два місця на
 * `src/components/home/OnThisDayCard.tsx`/`HomeContextCard.tsx`. Навмисно НЕ включає власну
 * `Card`/`Pressable`-обгортку — кожен виклик лишає собі контроль над тим, чим огорнути рядок
 * (одні — просто `Card`, інші — `Card` із заголовком/кнопкою до чи після), бо ці обгортки на
 * кожному екрані реально різні.
 */
export function JournalPreview({ title, coverUrl, coverFallbackColor, children }: JournalPreviewProps) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
      <CoverThumbnail
        coverUrl={coverUrl}
        title={title}
        fallbackColor={coverFallbackColor}
        width={48}
        height={70}
        borderRadius={theme.radius.sm}
      />
      <View style={{ flex: 1, gap: theme.spacing.xs, justifyContent: 'center' }}>
        <AppText variant="body">{title}</AppText>
        {children}
      </View>
    </View>
  );
}
