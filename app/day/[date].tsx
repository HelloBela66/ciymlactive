import React, { useMemo } from 'react';
import { View, Pressable } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { parse, format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { useTheme } from '@/design/ThemeProvider';
import { useDaySessions } from '@/features/calendar/useCalendarSessions';
import { formatDuration } from '@/lib/sessionTiming';

/** Деталі дня (Milestone 4): усі завершені сесії читання цього дня, з переходом на книгу. */
export default function DayDetailsScreen() {
  const theme = useTheme();
  const { date } = useLocalSearchParams<{ date: string }>();
  const parsedDate = useMemo(() => (date ? parse(date, 'yyyy-MM-dd', new Date()) : undefined), [date]);
  const { data: sessions, isLoading, isError, refetch } = useDaySessions(parsedDate);

  const title = parsedDate ? format(parsedDate, 'd MMMM yyyy', { locale: uk }) : 'День';

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title,
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
        ) : !sessions || sessions.length === 0 ? (
          <AppText variant="body" color="secondary">
            Цього дня не було сесій читання.
          </AppText>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            {sessions.map(({ session, userBook }) => (
              <Pressable
                key={session.id}
                onPress={() => router.push({ pathname: '/work/[workId]', params: { workId: userBook.work.id } })}
                accessibilityRole="button"
                accessibilityLabel={userBook.work.title}
              >
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                  <CoverThumbnail
                    coverUrl={userBook.edition.coverUrl}
                    title={userBook.work.title}
                    fallbackColor={userBook.work.coverFallbackColor}
                    width={40}
                    height={58}
                  />
                  <View style={{ flex: 1 }}>
                    <AppText variant="body">{userBook.work.title}</AppText>
                    <AppText variant="caption" color="secondary">
                      {session.durationSeconds != null ? formatDuration(session.durationSeconds * 1000) : '—'}
                      {' · '}
                      {session.startPage}
                      {session.endPage != null ? ` → ${session.endPage}` : ''}
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
