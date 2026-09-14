import React from 'react';
import { View, Pressable, SectionList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { SpoilerHiddenNotice } from '@/components/journal/SpoilerHiddenNotice';
import { useTheme } from '@/design/ThemeProvider';
import { activityEventTypeLabels } from '@/design/i18n-labels';
import { EVENT_ICON, eventDetail } from '@/design/activityEventDisplay';
import { useActivityHistory } from '@/features/activity-history/useActivityHistory';
import { groupActivityEventsByDate, type ActivityHistorySection } from '@/lib/activityHistory';
import type { ActivityEvent } from '@/types/activityEvent';

/** "Сьогодні"/"Вчора" для двох найновіших днів (як у більшості читацьких/соцмережевих
 * стрічок), інакше повна дата з роком лише коли рік не поточний — той самий принцип
 * скорочення, що й `formatDateRange` в `app/completion/[workId].tsx`. */
function formatSectionTitle(date: Date, today: Date = new Date()): string {
  const dateKey = format(date, 'yyyy-MM-dd');
  const todayKey = format(today, 'yyyy-MM-dd');
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = format(yesterday, 'yyyy-MM-dd');

  if (dateKey === todayKey) return 'Сьогодні';
  if (dateKey === yesterdayKey) return 'Вчора';

  const pattern = date.getFullYear() === today.getFullYear() ? 'd MMMM' : 'd MMMM yyyy';
  return format(date, pattern, { locale: uk });
}

function ActivityEventRow({ event }: { event: ActivityEvent }) {
  const theme = useTheme();
  const detail = eventDetail(event);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/work/[workId]', params: { workId: event.workId } })}
      accessibilityRole="button"
      accessibilityLabel={`${activityEventTypeLabels[event.type]}: ${event.workTitle}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.sm }}
    >
      <CoverThumbnail
        coverUrl={event.coverUrl}
        title={event.workTitle}
        fallbackColor={event.coverFallbackColor}
        width={40}
        height={58}
        borderRadius={theme.radius.sm}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name={EVENT_ICON[event.type]} size={14} color={theme.colors.accent} />
          <AppText variant="caption" color="accent">
            {activityEventTypeLabels[event.type]}
          </AppText>
        </View>
        <AppText variant="body" numberOfLines={1}>
          {event.workTitle}
        </AppText>
        {detail ? (
          <AppText variant="caption" color="secondary" numberOfLines={1}>
            {detail}
          </AppText>
        ) : null}
      </View>
      <AppText variant="micro" color="tertiary">
        {format(parseISO(event.occurredAt), 'HH:mm')}
      </AppText>
    </Pressable>
  );
}

/**
 * ТЗ Фази 12 (READING ACTIVITY HISTORY) — «unified read-only timeline», «Моя історія»,
 * «Entry point — Profile», «Не створюй нову bottom tab». Один-файловий маршрут (`app/history.tsx`),
 * той самий підхід, що й `app/statistics.tsx`/`app/tbr.tsx` — окремий пункт меню в Профілі, без
 * власного таба.
 *
 * Дані — повністю похідні (`useActivityHistory` → `ActivityHistoryRepository.listRecent`, один
 * SQL UNION ALL через вісім уже наявних timestamped-таблиць; докладне обґрунтування — коментар
 * там-таки). Групування по днях — `groupActivityEventsByDate` (`src/lib/activityHistory.ts`),
 * чиста функція, окремо протестована. Це справді лише перегляд (ТЗ: "Це read-only history") —
 * єдина інтерактивна дія рядка тут — перехід на сторінку книги, жодного редагування/видалення
 * самих подій із цього екрана.
 */
export default function ActivityHistoryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, refetch } = useActivityHistory();

  const sections: ActivityHistorySection[] = data ? groupActivityEventsByDate(data.items) : [];
  // POLYTSIA V1.6.2, #166 — "N приховано" індикатор (`docs/SPOILER_SAFE.md` §"Свідоме обмеження
  // Фази 3 V1.6.1"): фільтрація тут уже давно тиха, просто не мала пояснення для користувача.
  const hiddenCount = data?.hiddenCount ?? 0;

  // `ScreenContainer`'s `scroll={false}` (той самий проп/патерн, що й `app/journal/index.tsx`)
  // навмисно рендерить голий `View` без жодних відступів — екран сам відповідає за
  // горизонтальні/безпечні відступи свого контенту (докладніше — коментар у самому
  // `ScreenContainer.tsx`). Той самий набір відступів застосовано і до `SectionList`
  // (`contentContainerStyle`), і до станів завантаження/помилки/порожнього списку нижче —
  // інакше вони рендерились би впритул до країв екрана.
  const contentPadding = {
    paddingTop: theme.spacing.lg,
    paddingBottom: insets.bottom + theme.spacing.xxl,
    paddingHorizontal: theme.spacing.lg,
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Моя історія',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer scroll={false}>
        {isError ? (
          <View style={contentPadding}>
            <QueryErrorState onRetry={() => refetch()} />
          </View>
        ) : isLoading ? (
          <View style={contentPadding}>
            <AppText variant="body" color="secondary">
              Завантаження…
            </AppText>
          </View>
        ) : sections.length === 0 ? (
          <View style={contentPadding}>
            <EmptyState
              title="Тут поки порожньо"
              description="Тут з'являтимуться сесії читання, нові книги, записи щоденника й інша активність — читай і повертайся."
              actionLabel="До бібліотеки"
              onAction={() => router.push('/library')}
            />
          </View>
        ) : (
          <SectionList
            sections={sections.map((s) => ({ ...s, title: formatSectionTitle(s.date) }))}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Card style={{ paddingVertical: 0 }}>
                <ActivityEventRow event={item} />
              </Card>
            )}
            renderSectionHeader={({ section }) => (
              <AppText
                variant="heading"
                style={{
                  paddingTop: theme.spacing.lg,
                  paddingBottom: theme.spacing.sm,
                  backgroundColor: theme.colors.bg,
                }}
              >
                {section.title}
              </AppText>
            )}
            ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
            stickySectionHeadersEnabled={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ ...contentPadding, flexGrow: 1 }}
            ListFooterComponent={
              hiddenCount > 0 ? (
                <SpoilerHiddenNotice
                  hiddenCount={hiddenCount}
                  style={{ textAlign: 'center', paddingTop: theme.spacing.lg }}
                />
              ) : null
            }
          />
        )}
      </ScreenContainer>
    </>
  );
}
