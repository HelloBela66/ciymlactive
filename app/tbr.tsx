import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { useTheme } from '@/design/ThemeProvider';
import { useTbrRealityCheck } from '@/features/tbr/useTbrReality';
import { pluralizeUk } from '@/lib/pluralizeUk';
import type { TbrMinutesPerDay } from '@/lib/tbrEstimate';

const DAY_FORMS = ['день', 'дні', 'днів'] as const;
const BOOK_FORMS = ['книга', 'книги', 'книг'] as const;
const BUDGET_LABELS: { minutes: TbrMinutesPerDay; label: string }[] = [
  { minutes: 15, label: '15 хв/день' },
  { minutes: 30, label: '30 хв/день' },
  { minutes: 60, label: '60 хв/день' },
];

function formatDays(days: number): string {
  if (days === 0) return '—';
  if (days < 60) return `${days} ${pluralizeUk(days, DAY_FORMS)}`;
  const months = Math.round(days / 30);
  return `≈ ${days} ${pluralizeUk(days, DAY_FORMS)} (${months} міс.)`;
}

/**
 * TBR reality check (розділ 30 ТЗ, Milestone 6) — чесна оцінка, скільки реально часу
 * знадобиться дочитати список "Хочу прочитати" за різного щоденного бюджету, а не просто
 * лічильник книг. Уся математика — `estimateTbr`/`useTbrRealityCheck`, тут лише розкладка.
 */
export default function TbrScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch } = useTbrRealityCheck();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'TBR reality check',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        {isError ? (
          <QueryErrorState onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : data.bookCount === 0 ? (
          <EmptyState
            title="Список «Хочу прочитати» порожній"
            description="Додай книги зі статусом «Хочу прочитати», щоб побачити реальну оцінку часу на них."
          />
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <Card style={{ gap: theme.spacing.xs }}>
              <AppText variant="heading">
                {data.bookCount} {pluralizeUk(data.bookCount, BOOK_FORMS)} у списку
              </AppText>
              <AppText variant="caption" color="secondary">
                {data.totalPages} сторінок з відомим обсягом
                {data.booksWithoutPageCount.length > 0
                  ? ` · ще ${data.booksWithoutPageCount.length} ${pluralizeUk(data.booksWithoutPageCount.length, BOOK_FORMS)} без відомої кількості сторінок (не враховані в оцінці)`
                  : ''}
              </AppText>
            </Card>

            <View style={{ gap: theme.spacing.sm }}>
              {BUDGET_LABELS.map(({ minutes, label }) => (
                <Card key={minutes} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <AppText variant="body" color="secondary">
                    {label}
                  </AppText>
                  <AppText variant="heading">{formatDays(data.estimatedDaysByMinutesPerDay[minutes])}</AppText>
                </Card>
              ))}
            </View>

            <AppText variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
              {data.usedFallbackPace
                ? 'Оцінка на основі середнього темпу читання (ще немає власної історії сесій).'
                : 'Оцінка на основі твого реального темпу читання за весь час.'}
            </AppText>
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
