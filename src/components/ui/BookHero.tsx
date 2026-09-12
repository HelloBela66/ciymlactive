import React from 'react';
import { View } from 'react-native';
import { AppText } from './AppText';
import { CoverThumbnail } from './CoverThumbnail';
import { useTheme } from '@/design/ThemeProvider';

interface BookHeroProps {
  title: string;
  authors: string;
  coverUrl: string | null | undefined;
  coverFallbackColor: string | null | undefined;
  /** Додаткові рядки під авторами (дата створення капсули, "прочитав N тому" + оцінка на
   * recall тощо) — різні на кожному екрані, тому передаються через `children`, а не жорстко
   * зашиті тут. */
  children?: React.ReactNode;
}

/**
 * ТЗ Фази 19 (DESIGN SYSTEM EXTENSION) — центрована "обкладинка + назва + автори", яка до цієї
 * фази була продубльована буквально однаковою розміткою на `app/capsule/[workId].tsx` і
 * `app/recall/[workId].tsx` (обкладинка 96×140, `radius.md`, той самий `alignItems: 'center'`
 * стовпець).
 */
export function BookHero({ title, authors, coverUrl, coverFallbackColor, children }: BookHeroProps) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
      <CoverThumbnail
        coverUrl={coverUrl}
        title={title}
        fallbackColor={coverFallbackColor}
        width={96}
        height={140}
        borderRadius={theme.radius.md}
      />
      <AppText variant="title" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      {authors ? (
        <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
          {authors}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}
