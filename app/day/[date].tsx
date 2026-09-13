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
import { EmptyState } from '@/components/ui/EmptyState';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { useTheme } from '@/design/ThemeProvider';
import { activityEventTypeLabels } from '@/design/i18n-labels';
import { EVENT_ICON, eventDetail } from '@/design/activityEventDisplay';
import { useDaySessions } from '@/features/calendar/useCalendarSessions';
import { sumSessionMinutes, sumSessionPages } from '@/lib/readingAggregates';
import { formatDuration } from '@/lib/sessionTiming';
import type { ActivityEvent } from '@/types/activityEvent';

/**
 * ДЕТАЛІ ДНЯ (POLYTSIA V1.6.1, Фаза 19 — КАЛЕНДАР 2.0, `docs/CALENDAR_2_0.md`). Значно
 * змістовніша версія попереднього "лише список сесій": підсумок дня, сесії (з позначкою
 * прочитання при перечитуванні), і решта подій ТЗ, що сталися того дня (початок/фініш
 * книги, нотатки/цитати — вже spoiler-safe відфільтровані на рівні репозиторію, оцінки,
 * додавання на полицю).
 *
 * Свідомо ЛИШИВСЯ окремим route-екраном (`app/day/[date]`), а не перетворений на модальний
 * sheet, хоча оригінальний `docs/ARCHITECTURE.md` (розділ 6, ще з Milestone 0) називав
 * `DaySummarySheet` — ТЗ цієї фази перелічує ЗМІСТ деталей дня ("summary/books/sessions/
 * journal preview/start-finish events"), а не вимагає конкретно навігаційної оболонки; заміна
 * route на sheet зачепила б і deep-linking (`/day/[date]` як самостійний URL), і кнопку "назад",
 * не будучи явно потрібною для жодної вимоги цієї фази — той самий "не змінюй мовчки те, чого
 * не просили" принцип, що й вибір НЕ переставляти Home shortcuts у Фазі 17.
 */
export default function DayDetailsScreen() {
  const theme = useTheme();
  const { date } = useLocalSearchParams<{ date: string }>();
  const parsedDate = useMemo(() => (date ? parse(date, 'yyyy-MM-dd', new Date()) : undefined), [date]);
  const { data, isLoading, isError, refetch } = useDaySessions(parsedDate);

  const title = parsedDate ? format(parsedDate, 'd MMMM yyyy', { locale: uk }) : 'День';
  const sessions = data?.sessions ?? [];
  const otherEvents = data?.otherEvents ?? [];
  const isEmpty = sessions.length === 0 && otherEvents.length === 0;

  // Залежність саме на `data` (не на `sessions` — `data?.sessions ?? []` вище створює НОВИЙ
  // масив-referenced на кожен рендер навіть коли `data` не змінився, через `?? []` фолбек), щоб
  // цей `useMemo` реально мемоізував, а не перераховував на кожен рендер (react-hooks/
  // exhaustive-deps, знайдено ESLint).
  const summary = useMemo(() => {
    const daySessions = data?.sessions ?? [];
    if (daySessions.length === 0) return null;
    const rawSessions = daySessions.map((s) => s.session);
    const distinctBooksCount = new Set(daySessions.map((s) => s.userBook.id)).size;
    return {
      totalMinutes: sumSessionMinutes(rawSessions),
      totalPages: sumSessionPages(rawSessions),
      distinctBooksCount,
    };
  }, [data]);

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
        ) : isEmpty ? (
          <EmptyState
            title="Цього дня не було активності"
            description="Тут з'являться сесії читання, нові книги, записи щоденника та інша активність того дня."
          />
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            {summary ? (
              <Card style={{ gap: theme.spacing.xs }}>
                <AppText variant="heading">Підсумок дня</AppText>
                <AppText variant="body" color="secondary">
                  {formatDuration(summary.totalMinutes * 60 * 1000)}
                  {' · '}
                  {summary.totalPages} стор.
                  {' · '}
                  {summary.distinctBooksCount} {summary.distinctBooksCount === 1 ? 'книга' : 'книг'}
                </AppText>
              </Card>
            ) : null}

            {sessions.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="heading">Сесії читання</AppText>
                {sessions.map(({ session, userBook }) => {
                  const runNumber = data?.runNumberBySessionId.get(session.id);
                  return (
                    <Pressable
                      key={session.id}
                      onPress={() => router.push({ pathname: '/work/[workId]', params: { workId: userBook.work.id } })}
                      accessibilityRole="button"
                      accessibilityLabel={
                        runNumber
                          ? `${userBook.work.title}, перечитування, прохід ${runNumber}`
                          : userBook.work.title
                      }
                    >
                      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                        <CoverThumbnail
                          coverUrl={userBook.edition.coverUrl}
                          title={userBook.work.title}
                          fallbackColor={userBook.work.coverFallbackColor}
                          width={40}
                          height={58}
                        />
                        <View style={{ flex: 1, gap: 2 }}>
                          <AppText variant="body">{userBook.work.title}</AppText>
                          <AppText variant="caption" color="secondary">
                            {session.durationSeconds != null ? formatDuration(session.durationSeconds * 1000) : '—'}
                            {' · '}
                            {session.startPage}
                            {session.endPage != null ? ` → ${session.endPage}` : ''}
                          </AppText>
                          {runNumber ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                              <Ionicons name="repeat" size={12} color={theme.colors.accent} />
                              <AppText variant="micro" color="accent">
                                Перечитування, прохід {runNumber}
                              </AppText>
                            </View>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                      </Card>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {otherEvents.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="heading">Інша активність</AppText>
                {otherEvents.map((event) => (
                  <DayEventRow key={event.id} event={event} />
                ))}
              </View>
            ) : null}
          </View>
        )}
      </ScreenContainer>
    </>
  );
}

/** Рядок "решти семи типів подій" дня (початок/фініш книги, нотатка/цитата — вже spoiler-safe,
 * оцінка, полиця) — той самий `EVENT_ICON`/`eventDetail`, що й `app/history.tsx`'s
 * `ActivityEventRow` (`src/design/activityEventDisplay.ts`), лише без CoverThumbnail (сесії
 * вище вже несуть обкладинку — тут переважно короткі текстові події). */
function DayEventRow({ event }: { event: ActivityEvent }) {
  const theme = useTheme();
  const detail = eventDetail(event);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/work/[workId]', params: { workId: event.workId } })}
      accessibilityRole="button"
      accessibilityLabel={`${activityEventTypeLabels[event.type]}: ${event.workTitle}`}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <Ionicons name={EVENT_ICON[event.type]} size={16} color={theme.colors.accent} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText variant="caption" color="accent">
              {activityEventTypeLabels[event.type]}
            </AppText>
          </View>
          <AppText variant="body" numberOfLines={1}>
            {event.workTitle}
          </AppText>
          {detail ? (
            <AppText variant="caption" color="secondary" numberOfLines={2}>
              {detail}
            </AppText>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}
