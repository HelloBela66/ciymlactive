import React from 'react';
import { View, Pressable } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { useTheme } from '@/design/ThemeProvider';
import { useSeriesDetails } from '@/features/series/useSeriesDetails';
import { seriesStatusLabels } from '@/design/i18n-labels';

/**
 * Series Screen (Milestone 2): усі твори серії, впорядковані за позицією
 * (докладніше — SeriesRepository.getByIdWithWorks). Різні типи порядку
 * (publication/chronological/recommended) — можливе уточнення пізніше, не потрібне зараз.
 */
export default function SeriesDetailsScreen() {
  const theme = useTheme();
  const { seriesId } = useLocalSearchParams<{ seriesId: string }>();
  const { data, isLoading, isError, refetch } = useSeriesDetails(seriesId);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: data?.series.name ?? 'Серія',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        {isError ? (
          <QueryErrorState onRetry={() => refetch()} />
        ) : isLoading ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : !data ? (
          <AppText variant="body" color="secondary">
            Серію не знайдено.
          </AppText>
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <View style={{ gap: theme.spacing.xs }}>
              <AppText variant="title">{data.series.name}</AppText>
              <AppText variant="caption" color="tertiary">
                {seriesStatusLabels[data.series.status]}
                {data.series.totalKnownWorks ? ` · ${data.series.totalKnownWorks} книг` : ''}
              </AppText>
              {data.series.description ? (
                <AppText variant="body" color="secondary">
                  {data.series.description}
                </AppText>
              ) : null}
            </View>

            <View style={{ gap: theme.spacing.sm }}>
              {data.entries.map(({ entry, work }, index) => (
                <Pressable
                  key={work.id}
                  onPress={() => router.push({ pathname: '/work/[workId]', params: { workId: work.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={work.title}
                >
                  <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: theme.radius.pill,
                        backgroundColor: theme.colors.accentSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <AppText variant="caption" color="accent">
                        {entry.position ?? index + 1}
                      </AppText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="body">{work.title}</AppText>
                      {work.authors.length > 0 ? (
                        <AppText variant="caption" color="secondary">
                          {work.authors.map((a) => a.name).join(', ')}
                        </AppText>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                  </Card>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
