import React from 'react';
import { View } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { QuickAction } from '@/components/ui/QuickAction';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useTheme } from '@/design/ThemeProvider';

/**
 * «Що читати далі?» (POLYTSIA V1.6.1, Фаза 14 — RECOMMENDATION CONSOLIDATION,
 * `docs/NEXT_READ.md`) — новий, ЄДИНИЙ вхід на Home замість трьох окремих великих карток
 * (`TomorrowEntryPointCard`/`OnePickerEntryPointCard`/`TrendsEntryPointCard`,
 * `app/(tabs)/index.tsx`), що досі відповідали практично на те саме питання користувача
 * трьома різними, ніяк не пов'язаними між собою шляхами (аудит V1.6.1, §18/§44 — "Три різні
 * алгоритми відповідають на практично те саме питання").
 *
 * ТЗ прямо забороняє видаляти будь-яку з існуючих рекомендаційних логік ("без видалення
 * алгоритмів") — цей екран НІЧОГО не переобчислює сам: він лише групує чотири вже наявні,
 * незмінені екрани під двома змістовними заголовками:
 *
 * - **«З моєї полиці»** (primary flow) — обидві фічі, що обирають з уже наявної бібліотеки
 *   користувача: «Обери мені книгу» (`/one-book-picker`, Фаза 16) і «TBR reality check»
 *   (`/tbr`, Milestone 6/Фаза 17). До цієї фази TBR reality check НЕ мала жодного безумовного
 *   входу з Home — лише пункт меню Профілю і найнижчий пріоритет серед 5 кандидатів
 *   контекстної картки (`selectHomeContextCard`, `docs/HOME_REDESIGN.md`) — тут вона вперше
 *   стає рівноправним учасником "що читати далі", а не фактично похованою фічею.
 * - **«Знайти нову книгу»** (secondary flow) — обидві фічі із зовнішнім джерелом кандидатів:
 *   «Що почитати завтра?» (`/tomorrow`, Milestone 11) і «Тренди» (`/trends`, Milestone 11).
 *
 * Контекстна картка Home (`HomeContextCard`, `tbr_suggestion` включно) лишається ПОЗА межами
 * цієї фази — це окремий, ТЗ-обов'язковий "один слот" механізм (Фаза 18), а не одна з трьох
 * великих карток, про які йдеться в ТЗ Фази 14.
 */
export default function NextReadScreen() {
  const theme = useTheme();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Що читати далі?',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <AppText variant="body" color="secondary" style={{ marginBottom: theme.spacing.xl }}>
          Обери, з чого почати: підбір з уже наявної полиці або пошук чогось нового.
        </AppText>

        <View style={{ gap: theme.spacing.sm }}>
          <SectionHeader title="З моєї полиці" />
          <QuickAction
            icon="shuffle-outline"
            label="Обери мені книгу"
            description="Час, настрій, довжина — одна книга з твоєї полиці"
            onPress={() => router.push('/one-book-picker' as unknown as Href)}
          />
          <QuickAction
            icon="layers-outline"
            label="TBR reality check"
            description="Скільки книг чекає і скільки часу реально піде на них"
            onPress={() => router.push('/tbr' as unknown as Href)}
          />
        </View>

        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xl }}>
          <SectionHeader title="Знайти нову книгу" />
          <QuickAction
            icon="sparkles"
            label="Що почитати завтра?"
            description="Жанр, час і настрій — підберемо конкретну книгу"
            onPress={() => router.push('/tomorrow' as unknown as Href)}
          />
          <QuickAction
            icon="trending-up"
            label="Тренди"
            description="Топ-10 книг, які зараз найчастіше додають"
            onPress={() => router.push('/trends' as unknown as Href)}
          />
        </View>
      </ScreenContainer>
    </>
  );
}
