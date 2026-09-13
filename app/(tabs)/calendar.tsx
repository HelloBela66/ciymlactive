import React, { useMemo, useState } from 'react';
import { View, Pressable, useWindowDimensions } from 'react-native';
import { addMonths, subMonths, format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { useTheme } from '@/design/ThemeProvider';
import { buildMonthGrid, type CalendarDay } from '@/lib/calendarGrid';
import { formatDuration } from '@/lib/sessionTiming';
import { useMonthCalendarData, useMonthSummary, type DayCalendarStats } from '@/features/calendar/useCalendarSessions';
import type { DayIntensityLevel } from '@/lib/calendarIntensity';

const WEEKDAY_LABELS_MON_FIRST = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const DAY_KEY_FORMAT = 'yyyy-MM-dd';
/** Одна межа "вузького екрана" для всього дня-клітинки (Фаза 19) — той самий дух, що й
 * `useWindowDimensions`-обчислення в `app/(tabs)/library/index.tsx`'s `GRID_COLUMNS`: клітинка
 * сама по собі вже адаптивна (`width: '${100/7}%'`), але фіксований розмір ОБКЛАДИНКИ всередині
 * — ні, тож цей екран рахує його від фактичної ширини екрана, а не хардкодить один розмір. */
function computeCoverSize(windowWidth: number, horizontalPadding: number): number {
  const cellWidth = (windowWidth - horizontalPadding * 2) / 7;
  return Math.round(Math.max(20, Math.min(34, cellWidth - 16)));
}

function intensityLabel(intensity: DayIntensityLevel): string {
  if (intensity === 0) return 'без читання';
  if (intensity === 1) return 'невелика активність читання';
  if (intensity === 2) return 'середня активність читання';
  return 'висока активність читання';
}

function buildDayAccessibilityLabel(day: CalendarDay, stats: DayCalendarStats | undefined): string {
  const dateLabel = format(day.date, 'd MMMM', { locale: uk });
  if (!stats || stats.intensity === 0) return `${dateLabel}, ${intensityLabel(0)}`;
  const bookPart = stats.primaryUserBook ? `, ${stats.primaryUserBook.work.title}` : '';
  return `${dateLabel}, ${intensityLabel(stats.intensity)}${bookPart}`;
}

/**
 * КАЛЕНДАР 2.0 (POLYTSIA V1.6.1, Фаза 19, `docs/CALENDAR_2_0.md`) — місяць-сітка з обкладинкою
 * "головної" книги дня й індикатором інтенсивності читання (дедалі більше крапок) замість
 * колишньої єдиної крапки-ознаки "була якась активність". Підсумок місяця — під сіткою. Тап на
 * день і далі відкриває Day Details (`app/day/[date].tsx`), тепер значно змістовніший
 * (докладніше — коментар над тим файлом і `docs/CALENDAR_2_0.md` §"Чому лишився route, не
 * sheet").
 */
export default function CalendarScreen() {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());

  const days = useMemo(() => buildMonthGrid(monthAnchor, 1), [monthAnchor]);
  const { data: dayStatsByKey } = useMonthCalendarData(days);
  const { data: monthSummary } = useMonthSummary(monthAnchor);
  const monthLabel = useMemo(() => format(monthAnchor, 'LLLL yyyy', { locale: uk }), [monthAnchor]);
  const coverSize = useMemo(
    () => computeCoverSize(windowWidth, theme.spacing.lg),
    [windowWidth, theme.spacing.lg],
  );
  const ringSize = coverSize + 4;

  // Фаза 19 (`docs/CALENDAR_2_0.md`) — раніше `scroll={false}` (сітка з 6 рядків завжди
  // вміщалась на екрані без прокрутки). Тепер під сіткою додано підсумок місяця (нова вимога
  // ТЗ), і на менших екранах/великих системних шрифтах сума вже не завжди вміщається — тож
  // тут свідомо `scroll` за замовчуванням (=true), той самий `topInset` патерн, що й
  // Бібліотека/Пошук/Профіль (`ScreenContainer.tsx`, коментар над `topInset`) для "голого" таба
  // без нативного хедера.
  return (
    <ScreenContainer topInset>
      <AppText variant="title">Календар</AppText>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: theme.spacing.lg,
          marginBottom: theme.spacing.md,
        }}
      >
        <MonthNavButton icon="chevron-back" onPress={() => setMonthAnchor((d) => subMonths(d, 1))} />
        <AppText variant="heading" style={{ textTransform: 'capitalize' }}>
          {monthLabel}
        </AppText>
        <MonthNavButton icon="chevron-forward" onPress={() => setMonthAnchor((d) => addMonths(d, 1))} />
      </View>

      <View style={{ flexDirection: 'row' }}>
        {WEEKDAY_LABELS_MON_FIRST.map((label) => (
          <View key={label} style={{ flex: 1, alignItems: 'center', paddingVertical: theme.spacing.xs }}>
            <AppText variant="micro" color="tertiary">
              {label}
            </AppText>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {days.map((day) => {
          const dayKey = format(day.date, DAY_KEY_FORMAT);
          const stats = dayStatsByKey?.get(dayKey);
          const intensity = stats?.intensity ?? 0;
          const primaryUserBook = day.inCurrentMonth ? stats?.primaryUserBook ?? null : null;

          return (
            <Pressable
              key={day.date.toISOString()}
              onPress={() => router.push({ pathname: '/day/[date]', params: { date: dayKey } })}
              accessibilityRole="button"
              accessibilityLabel={buildDayAccessibilityLabel(day, stats)}
              style={{
                width: `${100 / 7}%`,
                aspectRatio: 1,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: day.inCurrentMonth ? 1 : 0.4,
              }}
            >
              {primaryUserBook ? (
                <View
                  style={{
                    width: ringSize,
                    height: ringSize,
                    borderRadius: theme.radius.sm + 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: day.isToday ? 2 : 0,
                    borderColor: theme.colors.accent,
                  }}
                >
                  <CoverThumbnail
                    coverUrl={primaryUserBook.edition.coverUrl}
                    title={primaryUserBook.work.title}
                    fallbackColor={primaryUserBook.work.coverFallbackColor}
                    width={coverSize}
                    height={coverSize}
                    borderRadius={theme.radius.sm}
                    hideFallbackLetter
                  />
                  <View
                    style={{
                      position: 'absolute',
                      top: -6,
                      left: -6,
                      minWidth: 18,
                      height: 18,
                      paddingHorizontal: 3,
                      borderRadius: 9,
                      backgroundColor: theme.colors.surfaceRaised,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AppText variant="micro" color="secondary">
                      {day.date.getDate()}
                    </AppText>
                  </View>
                </View>
              ) : (
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: theme.radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: day.isToday ? theme.colors.accent : 'transparent',
                  }}
                >
                  <AppText
                    variant="body"
                    color={day.isToday ? 'onAccent' : day.inCurrentMonth ? 'primary' : 'tertiary'}
                  >
                    {day.date.getDate()}
                  </AppText>
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 2, marginTop: 3, height: 4 }}>
                {intensity > 0
                  ? Array.from({ length: intensity }).map((_, index) => (
                      <View
                        key={index}
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: theme.colors.accent,
                        }}
                      />
                    ))
                  : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {monthSummary && (monthSummary.activeDaysCount > 0 || monthSummary.booksStartedCount > 0 || monthSummary.booksFinishedCount > 0) ? (
        <Card style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xs }}>
          <AppText variant="heading">Підсумок місяця</AppText>
          <AppText variant="body" color="secondary">
            {formatDuration(monthSummary.totalMinutes * 60 * 1000)}
            {' · '}
            {monthSummary.totalPages} стор.
            {' · '}
            {monthSummary.distinctBooksCount} {monthSummary.distinctBooksCount === 1 ? 'книга' : 'книг'}
            {' · '}
            {monthSummary.activeDaysCount} {monthSummary.activeDaysCount === 1 ? 'день' : 'днів'} читання
          </AppText>
          {monthSummary.booksStartedCount > 0 || monthSummary.booksFinishedCount > 0 ? (
            <AppText variant="caption" color="tertiary">
              Почато: {monthSummary.booksStartedCount} · Завершено: {monthSummary.booksFinishedCount}
            </AppText>
          ) : null}
        </Card>
      ) : (
        <View style={{ marginTop: theme.spacing.xl, alignItems: 'center' }}>
          <AppText variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
            Дні із сесіями читання позначені обкладинкою книги — торкнись дня, щоб побачити деталі.
          </AppText>
        </View>
      )}
    </ScreenContainer>
  );
}

function MonthNavButton({ icon, onPress }: { icon: 'chevron-back' | 'chevron-forward'; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={icon === 'chevron-back' ? 'Попередній місяць' : 'Наступний місяць'}
      onPress={onPress}
      hitSlop={8}
      style={{
        width: theme.minTouchTarget,
        height: theme.minTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={22} color={theme.colors.textSecondary} />
    </Pressable>
  );
}
