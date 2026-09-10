import React from 'react';
import { View, Pressable } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useTheme, ThemePreference } from '@/design/ThemeProvider';
import { themePreferenceLabels } from '@/design/i18n-labels';
import { useOverallStatistics } from '@/features/statistics/useStatistics';
import { pluralizeUk } from '@/lib/pluralizeUk';

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];
const DAY_FORMS = ['день', 'дні', 'днів'] as const;
const BOOK_FORMS = ['книга', 'книги', 'книг'] as const;

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface MenuItem {
  icon: IconName;
  label: string;
  onPress: () => void;
}

const MENU_ITEMS: MenuItem[] = [
  { icon: 'bar-chart-outline', label: 'Статистика', onPress: () => router.push('/statistics') },
  { icon: 'flag-outline', label: 'Цілі читання', onPress: () => router.push('/goals') },
  { icon: 'notifications-outline', label: 'Нагадування', onPress: () => router.push('/reminders') },
  { icon: 'layers-outline', label: 'TBR reality check', onPress: () => router.push('/tbr') },
  {
    icon: 'sparkles-outline',
    label: 'Wrapped',
    onPress: () =>
      router.push({ pathname: '/wrapped/[year]', params: { year: String(new Date().getFullYear()) } }),
  },
  { icon: 'cloud-upload-outline', label: 'Резервна копія', onPress: () => router.push('/backup') },
  {
    icon: 'shield-checkmark-outline',
    label: 'Перевірка даних',
    // `as unknown as Href` — той самий випадок, що й "Імпорт з Goodreads" нижче:
    // `app/data-doctor.tsx` (POLYTSIA V1.5, Фаза 5) — реальний, щойно доданий маршрут, але
    // Expo Router typed routes (`.expo/types/router.d.ts`) генеруються локально `expo
    // start`/Metro й не потрапляють у git — до першого запуску dev-сервера на новій машині
    // цей файл ще не знає про маршрут, і `tsc --noEmit` падає на самому рядковому літералі
    // `'/data-doctor'`. Явний каст прибирає цю залежність.
    onPress: () => router.push('/data-doctor' as unknown as Href),
  },
  {
    icon: 'download-outline',
    label: 'Імпорт з Goodreads',
    // `as unknown as Href` — маршрут `app/import/goodreads.tsx` реальний і валідний (Milestone 9), але
    // Expo Router typed routes (`.expo/types/router.d.ts`) генеруються локально `expo
    // start`/Metro й не потрапляють у git (`.expo/` у `.gitignore`) — одразу після
    // розпакування нового zip-архіву цей файл може ще не знати про щойно доданий маршрут,
    // доки dev-сервер не запуститься хоча б раз. Явний каст тут прибирає залежність `tsc
    // --noEmit` від того, чи встиг локальний кеш типів регенеруватись.
    onPress: () => router.push('/import/goodreads' as unknown as Href),
  },
];

function StatsSummaryCard() {
  const theme = useTheme();
  const { data } = useOverallStatistics();
  if (!data || data.totalSessions === 0) return null;

  return (
    <Pressable onPress={() => router.push('/statistics')} accessibilityRole="button" accessibilityLabel="Статистика">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">
            {data.currentStreak} {pluralizeUk(data.currentStreak, DAY_FORMS)} поспіль
          </AppText>
          <AppText variant="caption" color="secondary">
            {data.booksFinishedThisYear} {pluralizeUk(data.booksFinishedThisYear, BOOK_FORMS)} цього року ·{' '}
            {data.totalPages} стор. всього
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </Card>
    </Pressable>
  );
}

/**
 * Профіль. Statistics/Goals/Reminders — Milestone 5; TBR reality check/Wrapped/Резервна
 * копія — Milestone 6; Перевірка даних — POLYTSIA V1.5 Фаза 5 (усе — справжні екрани, доступ
 * звідси). Owned library/Loans/повні Налаштування — пізніші milestone. Перемикач теми
 * зʼявився тут уже в Milestone 0 як реальна, а не заглушкова функція — ThemeProvider
 * повністю готовий.
 */
export default function ProfileScreen() {
  const theme = useTheme();

  return (
    <ScreenContainer topInset>
      <AppText variant="title">Профіль</AppText>

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}>
        <StatsSummaryCard />

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {MENU_ITEMS.map((item, index) => (
            <Pressable
              key={item.label}
              onPress={item.onPress}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                paddingHorizontal: theme.spacing.lg,
                minHeight: theme.minTouchTarget,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: theme.colors.border,
              }}
            >
              <Ionicons name={item.icon} size={20} color={theme.colors.textSecondary} />
              <AppText variant="body" style={{ flex: 1 }}>
                {item.label}
              </AppText>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
            </Pressable>
          ))}
        </Card>
      </View>

      <Card style={{ marginTop: theme.spacing.lg }}>
        <AppText variant="heading">Тема оформлення</AppText>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          {THEME_OPTIONS.map((option) => (
            <Button
              key={option}
              label={themePreferenceLabels[option]}
              variant={theme.preference === option ? 'primary' : 'secondary'}
              onPress={() => theme.setPreference(option)}
              style={{ flex: 1, paddingHorizontal: theme.spacing.md }}
            />
          ))}
        </View>
      </Card>

      <View style={{ marginTop: theme.spacing.xl, alignItems: 'center' }}>
        <AppText variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
          Фізична бібліотека, позичені книги й повні налаштування зʼявляться в наступних
          milestone.
        </AppText>
      </View>
    </ScreenContainer>
  );
}
