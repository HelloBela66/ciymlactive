import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { useTheme } from '@/design/ThemeProvider';
import { useReadingProfile } from '@/features/readingProfile/useReadingProfile';
import {
  formatTimeOfDaySentence,
  formatAverageSessionSentence,
  formatTopGenreSentence,
  formatTopRatedGenreSentence,
  formatFormatSentence,
  formatAveragePagesSentence,
} from '@/lib/readingProfile';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface InsightRow {
  key: string;
  icon: IconName;
  text: string;
}

function InsightCard({ icon, text }: { icon: IconName; text: string }) {
  const theme = useTheme();
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={18} color={theme.colors.accent} />
      </View>
      <AppText variant="body" style={{ flex: 1 }}>
        {text}
      </AppText>
    </Card>
  );
}

/**
 * «Мій читацький профіль» (ТЗ Фази 14, READING PROFILE, `docs/READING_PROFILE.md`) — PRIVATE
 * analytics, не public profile: список коротких, обґрунтованих даними речень, а не dashboard
 * із цифрами (ТЗ: "Показуй тільки insights, які реально можна обґрунтувати даними"). Уся
 * логіка порогів вибірки — у `useReadingProfile`/`src/lib/readingProfile.ts`; тут лише
 * фільтрація `null`-полів (insight нижче порогу) і розкладка того, що лишилось, у картки.
 */
export default function ReadingProfileScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch } = useReadingProfile();

  const rows: InsightRow[] = [];
  if (data?.timeOfDay) {
    rows.push({ key: 'timeOfDay', icon: 'time-outline', text: formatTimeOfDaySentence(data.timeOfDay) });
  }
  if (data?.averageSessionMinutes != null) {
    rows.push({
      key: 'averageSession',
      icon: 'hourglass-outline',
      text: formatAverageSessionSentence(data.averageSessionMinutes),
    });
  }
  if (data?.topGenre) {
    rows.push({ key: 'topGenre', icon: 'book-outline', text: formatTopGenreSentence(data.topGenre) });
  }
  if (data?.topRatedGenre) {
    rows.push({
      key: 'topRatedGenre',
      icon: 'star-outline',
      text: formatTopRatedGenreSentence(data.topRatedGenre),
    });
  }
  if (data?.format) {
    rows.push({
      key: 'format',
      icon: data.format.preferred === 'physical' ? 'book-outline' : 'phone-portrait-outline',
      text: formatFormatSentence(data.format),
    });
  }
  if (data?.averagePages != null) {
    rows.push({
      key: 'averagePages',
      icon: 'document-text-outline',
      text: formatAveragePagesSentence(data.averagePages),
    });
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Мій читацький профіль',
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
        ) : rows.length === 0 ? (
          <EmptyState
            title="Профіль ще збирається"
            description="Читай і фіксуй сесії — перші висновки з'являться, коли даних набереться достатньо."
          />
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <AppText variant="caption" color="tertiary">
              Лише для тебе — ці висновки ніхто інший не бачить.
            </AppText>
            <View style={{ gap: theme.spacing.sm }}>
              {rows.map((row) => (
                <InsightCard key={row.key} icon={row.icon} text={row.text} />
              ))}
            </View>
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
