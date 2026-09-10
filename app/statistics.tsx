import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { useTheme } from '@/design/ThemeProvider';
import { useOverallStatistics } from '@/features/statistics/useStatistics';
import { formatDuration } from '@/lib/sessionTiming';

function StatTile({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <Card style={{ flex: 1, gap: theme.spacing.xs }}>
      <AppText variant="title">{value}</AppText>
      <AppText variant="caption" color="secondary">
        {label}
      </AppText>
    </Card>
  );
}

/**
 * Statistics dashboard (розділ 30 ТЗ, Milestone 5). Усі цифри рахуються "на льоту" з
 * `reading_session`/`user_book` через `useOverallStatistics` — тут лише розкладка по картках,
 * без власної бізнес-логіки (п.43 ТЗ).
 */
export default function StatisticsScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch } = useOverallStatistics();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Статистика',
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
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <StatTile label="Поточна серія днів" value={String(data.currentStreak)} />
              <StatTile label="Найдовша серія" value={String(data.longestStreak)} />
            </View>

            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <StatTile label="Загальний час читання" value={formatDuration(data.totalMinutes * 60 * 1000)} />
              <StatTile label="Сторінок прочитано" value={String(data.totalPages)} />
            </View>

            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <StatTile label="Книг прочитано цього року" value={String(data.booksFinishedThisYear)} />
              <StatTile label="Книг прочитано всього" value={String(data.booksFinishedAllTime)} />
            </View>

            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <StatTile label="Сесій читання" value={String(data.totalSessions)} />
              <StatTile label="Днів із читанням" value={String(data.activeDaysCount)} />
            </View>

            <AppText variant="caption" color="tertiary" style={{ textAlign: 'center', marginTop: theme.spacing.sm }}>
              "Сторінок прочитано" — сума приросту сторінок за сесіями (може не збігатись з
              фактичним обсягом книги, якщо сторінку вказано неточно).
            </AppText>
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
