import React from 'react';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { useTheme } from '@/design/ThemeProvider';
import { formatCompactDuration } from '@/lib/calendarFormat';
import { pluralizeUk } from '@/lib/pluralizeUk';
import type { UserBookWithDetails } from '@/types/userBook';

/**
 * КАЛЕНДАР — ВІЗУАЛЬНА КОМПОЗИЦІЯ ТА REDESIGN ДНЯ ЧИТАННЯ (пост-Фаза 19) — "Книги, прочитані
 * цього дня" на `app/day/[date].tsx`. Обкладинка/назва/автор/компактна метрика (час · сторінки
 * · сесії) — та сама "картка книги" мова, що й решта застосунку (`CoverThumbnail`+`AppText`),
 * не нова візуальна система.
 */

const SESSION_FORMS = ['сесія', 'сесії', 'сесій'] as const;
const PAGE_FORMS = ['сторінка', 'сторінки', 'сторінок'] as const;

export interface ReadingDayBookCardProps {
  userBook: UserBookWithDetails;
  totalMinutes: number;
  totalPages: number;
  sessionCount: number;
  /** ТЗ: "primary картка трохи більша" — головна книга дня (перша в ранжуванні) отримує
   * трохи більшу обкладинку/типографіку, не окремий інший дизайн. */
  isPrimary?: boolean;
}

export function ReadingDayBookCard({ userBook, totalMinutes, totalPages, sessionCount, isPrimary }: ReadingDayBookCardProps) {
  const theme = useTheme();
  const coverWidth = isPrimary ? 56 : 48;
  const coverHeight = isPrimary ? 82 : 70;
  const authors = userBook.work.authors.map((a) => a.name).join(', ');

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/work/[workId]', params: { workId: userBook.work.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${userBook.work.title}${authors ? `, ${authors}` : ''}`}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <CoverThumbnail
          coverUrl={userBook.edition.coverUrl}
          title={userBook.work.title}
          fallbackColor={userBook.work.coverFallbackColor}
          width={coverWidth}
          height={coverHeight}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant={isPrimary ? 'heading' : 'body'} numberOfLines={1}>
            {userBook.work.title}
          </AppText>
          {authors ? (
            <AppText variant="caption" color="secondary" numberOfLines={1}>
              {authors}
            </AppText>
          ) : null}
          <AppText variant="caption" color="tertiary">
            {formatCompactDuration(totalMinutes)}
            {' · '}
            {totalPages} {pluralizeUk(totalPages, PAGE_FORMS)}
            {' · '}
            {sessionCount} {pluralizeUk(sessionCount, SESSION_FORMS)}
          </AppText>
        </View>
      </Card>
    </Pressable>
  );
}
