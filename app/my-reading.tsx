import React from 'react';
import { View } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { QuickAction } from '@/components/ui/QuickAction';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useTheme } from '@/design/ThemeProvider';
import { currentSeasonKey, formatSeasonKey } from '@/lib/season';

/**
 * «Моє читання» (POLYTSIA V1.6.1, Фаза 15 — ANALYTICS HIERARCHY, `docs/MY_READING.md`) — новий,
 * ЄДИНИЙ хаб замість п'яти окремих рядків меню Профілю (`app/(tabs)/profile/index.tsx`), що
 * відповідали практично на те саме питання користувача: "покажи мені статистику мого читання"
 * (аудит V1.6.1, §"Пара 4" — "п'ять незалежних аналітичних екранів... без спільної
 * обчислювальної основи чи ієрархії").
 *
 * Той самий "групуй, не переобчислюй" принцип, що й `app/next-read.tsx` (Фаза 14): цей екран
 * НІЧОГО сам не рахує — усі чотири екрани (`/statistics`, `/reading-profile`, `/fingerprint`,
 * `/wrapped/[year]`, `/seasons/[seasonKey]`) лишаються повністю незміненими повноцінними
 * екранами зі своєю логікою. Друга половина Фази 15 (спільні domain-calculator'и для РЕАЛЬНО
 * дубльованого коду, `src/lib/readingAggregates.ts`) — це зміна ВСЕРЕДИНІ `useWrappedYear.ts`/
 * `useReadingSeason.ts`/`useStatistics.ts`, а не цього екрана.
 *
 * «Підсумки» — один заголовок секції з ДВОМА пунктами (Рік/Сезони), а не окрема картка кожен:
 * Wrapped і Читацькі сезони — вже повноцінні, самостійні екрани зі своїм перемикачем рік/сезон
 * всередині (жоден не є вже "міні-хабом" — перевірено перед цією фазою), тож найменша зміна тут
 * — просто дати обом по одному входу з поточним роком/сезоном, той самий розрахунок параметра,
 * що вже був у `MENU_ITEMS` Профілю до цієї фази.
 */
export default function MyReadingScreen() {
  const theme = useTheme();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Моє читання',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <AppText variant="body" color="secondary" style={{ marginBottom: theme.spacing.xl }}>
          Цифри, інсайти й підсумки твого читання — усе в одному місці.
        </AppText>

        <View style={{ gap: theme.spacing.sm }}>
          <QuickAction
            icon="bar-chart-outline"
            label="Статистика"
            description="Хвилини, сторінки, серії днів — загальні цифри"
            onPress={() => router.push('/statistics' as unknown as Href)}
          />
          <QuickAction
            icon="analytics-outline"
            label="Читацький профіль"
            description="Коли й як ти читаєш — інсайти з реальних даних"
            onPress={() => router.push('/reading-profile' as unknown as Href)}
          />
          <QuickAction
            icon="finger-print-outline"
            label="Читацький відбиток"
            description="Значки за твоїм стилем читання"
            onPress={() => router.push('/fingerprint' as unknown as Href)}
          />
        </View>

        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xl }}>
          <SectionHeader title="Підсумки" />
          <QuickAction
            icon="sparkles-outline"
            label="Рік"
            description="Підсумок поточного року"
            onPress={() =>
              router.push({
                pathname: '/wrapped/[year]',
                params: { year: String(new Date().getFullYear()) },
              } as unknown as Href)
            }
          />
          <QuickAction
            icon="leaf-outline"
            label="Сезони"
            description="Підсумок поточного сезону"
            onPress={() =>
              router.push({
                pathname: '/seasons/[seasonKey]',
                params: { seasonKey: formatSeasonKey(currentSeasonKey(new Date())) },
              } as unknown as Href)
            }
          />
        </View>
      </ScreenContainer>
    </>
  );
}
