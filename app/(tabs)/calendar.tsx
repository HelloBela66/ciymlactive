import React, { useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addMonths, subMonths, format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/design/ThemeProvider';
import { buildMonthGrid } from '@/lib/calendarGrid';
import { useMonthActivity } from '@/features/calendar/useCalendarSessions';

const WEEKDAY_LABELS_MON_FIRST = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const DAY_KEY_FORMAT = 'yyyy-MM-dd';

/**
 * Календар (розділ 14 ТЗ). Місяць-сітка з Milestone 0 тепер позначає дні з реальними
 * завершеними сесіями читання крапкою (Milestone 4); тап на день відкриває Day Details
 * (`app/day/[date].tsx`) зі списком сесій того дня.
 */
export default function CalendarScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());

  const days = useMemo(() => buildMonthGrid(monthAnchor, 1), [monthAnchor]);
  const { data: activeDayKeys } = useMonthActivity(days);
  const monthLabel = useMemo(
    () => format(monthAnchor, 'LLLL yyyy', { locale: uk }),
    [monthAnchor],
  );

  return (
    <ScreenContainer
      scroll={false}
      style={{ paddingHorizontal: theme.spacing.lg, paddingTop: insets.top + theme.spacing.lg }}
    >
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
          const hasActivity = activeDayKeys?.has(dayKey) ?? false;

          return (
            <Pressable
              key={day.date.toISOString()}
              onPress={() => router.push({ pathname: '/day/[date]', params: { date: dayKey } })}
              accessibilityRole="button"
              accessibilityLabel={format(day.date, 'd MMMM', { locale: uk })}
              style={{
                width: `${100 / 7}%`,
                aspectRatio: 1,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
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
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  marginTop: 2,
                  backgroundColor: hasActivity ? theme.colors.accent : 'transparent',
                }}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: theme.spacing.xl, alignItems: 'center' }}>
        <AppText variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
          Дні із сесіями читання позначені крапкою — торкнись дня, щоб побачити деталі.
        </AppText>
      </View>
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
