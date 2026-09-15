import React from 'react';
import { View, Pressable } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { formatReadingPeriodOneLine } from '@/components/reading-life/ReadingPeriodStats';
import { useTheme } from '@/design/ThemeProvider';
import { useReadingLife } from '@/features/reading-life/useReadingLife';
import { pluralizeUk } from '@/lib/pluralizeUk';
import type { ReadingLifeYear } from '@/lib/readingLife';

/**
 * «Моя читацька історія» — POLYTSIA V1.7, Phase 4 (`docs/V1_7_READING_LIFE.md`, ТЗ V1.7
 * §11-§13, §96-§97). Верхній рівень навігації: Профіль → «Моє читання» → сюди → рік → місяць.
 *
 * ЧОМУ ОКРЕМА ГІЛКА, А НЕ ЩЕ ОДНА СЕКЦІЯ СТАТИСТИКИ. Статистика відповідає на питання «які в
 * мене цифри ЗАРАЗ» (за весь час, одним зрізом). Reading Life відповідає на інше: «як виглядало
 * моє читання ТОДІ». Це не той самий екран із фільтром — це інший спосіб дивитись, тому власна
 * гілка з хаба «Моє читання», а не вкладка всередині `/statistics`.
 *
 * Роки НЕ вигадуються: список складається лише з тих років, у яких реально щось відбулось
 * (`buildReadingLife`). Порожній рік між двома активними не з'являється — читацька історія не
 * зобов'язана бути безперервною, і рік із нулями виглядав би як докір, а не як факт.
 *
 * ЖОДНОГО ВЛАСНОГО ОБЧИСЛЕННЯ: і тут, і на екрані року, і на екрані місяця цифри приходять з
 * одного `useReadingLife` і одного canonical-двигуна. Докладніше — шапка
 * `src/features/reading-life/useReadingLife.ts`.
 */

const YEAR_FORMS = ['рік', 'роки', 'років'] as const;
const MONTH_FORMS = ['місяць', 'місяці', 'місяців'] as const;

function YearRow({ year }: { year: ReadingLifeYear }) {
  const theme = useTheme();
  const subtitle = formatReadingPeriodOneLine(year.summary);
  const monthCount = year.months.length;

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/reading-life/year/[year]',
          params: { year: String(year.year) },
        } as unknown as Href)
      }
      accessibilityRole="button"
      accessibilityLabel={`${year.year} рік${subtitle ? `, ${subtitle}` : ''}`}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="title">{year.year}</AppText>
          {subtitle ? (
            <AppText variant="caption" color="secondary">
              {subtitle}
            </AppText>
          ) : null}
          <AppText variant="caption" color="tertiary">
            {monthCount} {pluralizeUk(monthCount, MONTH_FORMS)} з активністю
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </Card>
    </Pressable>
  );
}

export default function ReadingLifeScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch } = useReadingLife();
  const years = data?.years ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Моя читацька історія',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer scroll>
        {isError ? (
          <QueryErrorState onRetry={() => void refetch()} />
        ) : isLoading ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : years.length === 0 ? (
          <EmptyState
            title="Історія ще попереду"
            description="Щойно ти почнеш читати, тут з'являться роки твого читацького життя."
          />
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            <AppText variant="body" color="secondary">
              {years.length} {pluralizeUk(years.length, YEAR_FORMS)} читання. Обери рік, щоб
              побачити його по місяцях.
            </AppText>
            {years.map((year) => (
              <YearRow key={year.year} year={year} />
            ))}
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
