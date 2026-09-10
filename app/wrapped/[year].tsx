import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { useTheme } from '@/design/ThemeProvider';
import { useWrappedYear } from '@/features/wrapped/useWrappedYear';
import { formatDuration } from '@/lib/sessionTiming';
import { pluralizeUk } from '@/lib/pluralizeUk';

const DAY_FORMS = ['день', 'дні', 'днів'] as const;
const BOOK_FORMS = ['книга', 'книги', 'книг'] as const;

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
 * Річний Wrapped (розділ 30 ТЗ, Milestone 6). Дані — `useWrappedYear`, тут лише розкладка;
 * рік перемикається локальною стрілкою (як Календар), без нового екрана на кожен рік.
 */
export default function WrappedScreen() {
  const theme = useTheme();
  const { year: yearParam } = useLocalSearchParams<{ year: string }>();
  const [year, setYear] = useState(() => {
    const parsed = Number(yearParam);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : new Date().getFullYear();
  });
  const { data, isLoading } = useWrappedYear(year);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: `Wrapped ${year}`,
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: theme.spacing.lg,
          }}
        >
          <Pressable
            onPress={() => setYear((y) => y - 1)}
            accessibilityRole="button"
            accessibilityLabel="Попередній рік"
            hitSlop={8}
            style={{ width: theme.minTouchTarget, height: theme.minTouchTarget, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.textSecondary} />
          </Pressable>
          <AppText variant="title">{year}</AppText>
          <Pressable
            onPress={() => setYear((y) => y + 1)}
            accessibilityRole="button"
            accessibilityLabel="Наступний рік"
            hitSlop={8}
            style={{ width: theme.minTouchTarget, height: theme.minTouchTarget, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-forward" size={22} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        {isLoading || !data ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : data.booksFinished.length === 0 && data.totalMinutes === 0 ? (
          <EmptyState
            title={`Немає даних за ${year} рік`}
            description="Читай книги протягом року, щоб побачити тут підсумки."
          />
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <StatTile
                label={`${pluralizeUk(data.booksFinished.length, BOOK_FORMS)} прочитано`}
                value={String(data.booksFinished.length)}
              />
              <StatTile label="Час читання" value={formatDuration(data.totalMinutes * 60 * 1000)} />
            </View>

            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <StatTile label="Сторінок прочитано" value={String(data.totalPages)} />
              <StatTile
                label="Найдовша серія"
                value={`${data.longestStreak} ${pluralizeUk(data.longestStreak, DAY_FORMS)}`}
              />
            </View>

            {data.topAuthor ? (
              <Card style={{ gap: theme.spacing.xs }}>
                <AppText variant="caption" color="secondary">
                  Автор року
                </AppText>
                <AppText variant="heading">{data.topAuthor.name}</AppText>
                <AppText variant="caption" color="tertiary">
                  {data.topAuthor.count} {pluralizeUk(data.topAuthor.count, BOOK_FORMS)} прочитано
                </AppText>
              </Card>
            ) : null}

            {data.topGenre ? (
              <Card style={{ gap: theme.spacing.xs }}>
                <AppText variant="caption" color="secondary">
                  Жанр року
                </AppText>
                <AppText variant="heading">{data.topGenre.name}</AppText>
                <AppText variant="caption" color="tertiary">
                  {data.topGenre.count} {pluralizeUk(data.topGenre.count, BOOK_FORMS)} прочитано
                </AppText>
              </Card>
            ) : null}

            {data.topRatedBook ? (
              <Card style={{ gap: theme.spacing.xs }}>
                <AppText variant="caption" color="secondary">
                  Найкраща оцінка року
                </AppText>
                <AppText variant="heading">{data.topRatedBook.title}</AppText>
                <AppText variant="caption" color="tertiary">
                  {data.topRatedBook.value} з 5
                </AppText>
              </Card>
            ) : null}

            {data.busiestMonth ? (
              <Card style={{ gap: theme.spacing.xs }}>
                <AppText variant="caption" color="secondary">
                  Найактивніший місяць
                </AppText>
                <AppText variant="heading" style={{ textTransform: 'capitalize' }}>
                  {format(new Date(Date.UTC(year, data.busiestMonth.month - 1, 1)), 'LLLL', { locale: uk })}
                </AppText>
              </Card>
            ) : null}

            {data.booksFinished.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="heading">Прочитані книги</AppText>
                {data.booksFinished.map((ub) => (
                  <Pressable
                    key={ub.id}
                    onPress={() => router.push({ pathname: '/work/[workId]', params: { workId: ub.work.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={ub.work.title}
                  >
                    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                      <CoverThumbnail
                        coverUrl={ub.edition.coverUrl}
                        title={ub.work.title}
                        fallbackColor={ub.work.coverFallbackColor}
                        width={32}
                        height={46}
                      />
                      <View style={{ flex: 1 }}>
                        <AppText variant="body">{ub.work.title}</AppText>
                        {ub.work.authors.length > 0 ? (
                          <AppText variant="caption" color="secondary">
                            {ub.work.authors.map((a) => a.name).join(', ')}
                          </AppText>
                        ) : null}
                      </View>
                    </Card>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
