import React from 'react';
import { View, Pressable } from 'react-native';
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  ReadingPeriodStats,
  formatReadingPeriodOneLine,
} from '@/components/reading-life/ReadingPeriodStats';
import { useTheme } from '@/design/ThemeProvider';
import { useReadingLifeYear } from '@/features/reading-life/useReadingLife';
import type { ReadingLifeMonth } from '@/lib/readingLife';

/**
 * Рік читацької історії — POLYTSIA V1.7, Phase 4 (`docs/V1_7_READING_LIFE.md`, ТЗ V1.7 §12).
 *
 * НЕ ДРУГИЙ WRAPPED. Wrapped (`app/wrapped/[year].tsx`) — це «підсумок-свято»: топ-автор, топ-жанр,
 * найкраще оцінена книга, картка для поширення. Цей екран — навігація: підсумок року рівно
 * настільки, щоб зрозуміти, куди заходити далі, і список місяців. Вони не конкурують і не
 * дублюють обчислень: обидва беруть базові цифри з одного canonical-двигуна
 * (`computeReadingPeriodSummary`) — Wrapped через `useWrappedYear`, цей екран через
 * `useReadingLife`, тож «скільки я читав у 2026» має ОДНУ відповідь на обох.
 *
 * Показуються лише місяці з активністю (порожні не малюються — див. `app/reading-life/index.tsx`).
 */

function monthLabel(month: ReadingLifeMonth): string {
  // Дата-конструктор із ЛОКАЛЬНИХ компонентів — той самий принцип, що й скрізь у V1.7: назва
  // місяця не має залежати від того, як `yyyy-MM` виглядав би в UTC.
  return format(new Date(month.year, month.month - 1, 1), 'LLLL', { locale: uk });
}

function MonthRow({ month }: { month: ReadingLifeMonth }) {
  const theme = useTheme();
  const subtitle = formatReadingPeriodOneLine(month.summary);
  const label = monthLabel(month);

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/reading-life/month/[monthKey]',
          params: { monthKey: month.monthKey },
        } as unknown as Href)
      }
      accessibilityRole="button"
      accessibilityLabel={`${label}${subtitle ? `, ${subtitle}` : ''}`}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading" style={{ textTransform: 'capitalize' }}>
            {label}
          </AppText>
          {subtitle ? (
            <AppText variant="caption" color="secondary">
              {subtitle}
            </AppText>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </Card>
    </Pressable>
  );
}

export default function ReadingLifeYearScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ year: string }>();
  // Параметр маршруту — недовірений вхід: `Number('abc')` дасть `NaN`, який ніколи не збігається
  // з жодним роком історії, тож екран коректно покаже «нічого не знайдено», а не впаде.
  const year = Number(params.year);
  const { year: yearData, isLoading, isError, refetch } = useReadingLifeYear(year);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: Number.isFinite(year) ? String(year) : 'Рік',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer scroll>
        {isError ? (
          <QueryErrorState onRetry={refetch} />
        ) : isLoading ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : !yearData ? (
          <EmptyState
            title="Цього року в історії немає"
            description="У цьому році не записано жодного читання, запису чи завершеної книги."
          />
        ) : (
          <View style={{ gap: theme.spacing.xl }}>
            <Card style={{ gap: theme.spacing.md }}>
              <AppText variant="caption" color="tertiary">
                Підсумок року
              </AppText>
              <ReadingPeriodStats summary={yearData.summary} />
            </Card>

            <View style={{ gap: theme.spacing.sm }}>
              <SectionHeader title="Місяці" />
              {yearData.months.map((month) => (
                <MonthRow key={month.monthKey} month={month} />
              ))}
            </View>
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
