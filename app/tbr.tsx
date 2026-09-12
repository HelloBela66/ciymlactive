import React from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { useTheme } from '@/design/ThemeProvider';
import { useTbrRealityCheck } from '@/features/tbr/useTbrReality';
import { pluralizeUk } from '@/lib/pluralizeUk';
import type { TbrMinutesPerDay } from '@/lib/tbrEstimate';
import {
  formatBookCountSentence,
  formatOldestWaitingSentence,
  formatDaysWaitingSentence,
  type OldestWaitingInsight,
} from '@/lib/tbrPersonality';

const DAY_FORMS = ['день', 'дні', 'днів'] as const;
const BOOK_FORMS = ['книга', 'книги', 'книг'] as const;
const BUDGET_LABELS: { minutes: TbrMinutesPerDay; label: string }[] = [
  { minutes: 15, label: '15 хв/день' },
  { minutes: 30, label: '30 хв/день' },
  { minutes: 60, label: '60 хв/день' },
];

function formatDays(days: number): string {
  if (days === 0) return '—';
  if (days < 60) return `${days} ${pluralizeUk(days, DAY_FORMS)}`;
  const months = Math.round(days / 30);
  return `≈ ${days} ${pluralizeUk(days, DAY_FORMS)} (${months} міс.)`;
}

/**
 * Playful-картка про книгу, що найдовше чекає (ТЗ Фази 17, TBR PERSONALITY / ANTI-TBR) — тон
 * навмисно теплий, БЕЗ жодного кольору тривоги/попередження (ТЗ: "Не shame користувача") —
 * той самий нейтральний `Card`, що й решта екрана, ніякого червоного/помаранчевого акценту
 * лише через те, що книга довго чекає. CTA «Нарешті прочитати» веде на Book Details (той самий
 * "навігація, а не примусова зміна статусу" підхід, що й «Обрати цю» на `app/one-book-picker.tsx`
 * — користувач сам вирішує, коли реально почати сесію).
 */
function OldestWaitingCard({ insight }: { insight: OldestWaitingInsight }) {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name="hourglass-outline" size={18} color={theme.colors.accent} />
        <AppText variant="body" color="secondary" style={{ flex: 1 }}>
          {formatOldestWaitingSentence(insight.title)}
        </AppText>
      </View>
      <AppText variant="caption" color="tertiary">
        {formatDaysWaitingSentence(insight.daysWaiting)}
      </AppText>
      <Button
        label="Нарешті прочитати"
        variant="secondary"
        onPress={() => router.push({ pathname: '/work/[workId]', params: { workId: insight.workId } })}
      />
    </Card>
  );
}

/**
 * TBR reality check (розділ 30 ТЗ, Milestone 6) — чесна оцінка, скільки реально часу
 * знадобиться дочитати список "Хочу прочитати" за різного щоденного бюджету, а не просто
 * лічильник книг. Уся математика — `estimateTbr`/`useTbrRealityCheck`, тут лише розкладка.
 * Playful insights (ТЗ Фази 17) — `formatBookCountSentence`/`OldestWaitingCard` нижче, той
 * самий дружній, не соромливий тон, що й решта мікрокопі застосунку.
 */
export default function TbrScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch } = useTbrRealityCheck();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'TBR reality check',
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
        ) : data.bookCount === 0 ? (
          <EmptyState
            title="Список «Хочу прочитати» порожній"
            description="Додай книги зі статусом «Хочу прочитати», щоб побачити реальну оцінку часу на них."
          />
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <Card style={{ gap: theme.spacing.xs }}>
              <AppText variant="heading">{formatBookCountSentence(data.bookCount)}</AppText>
              <AppText variant="caption" color="secondary">
                {data.totalPages} сторінок з відомим обсягом
                {data.booksWithoutPageCount.length > 0
                  ? ` · ще ${data.booksWithoutPageCount.length} ${pluralizeUk(data.booksWithoutPageCount.length, BOOK_FORMS)} без відомої кількості сторінок (не враховані в оцінці)`
                  : ''}
              </AppText>
            </Card>

            {data.oldestWaiting ? <OldestWaitingCard insight={data.oldestWaiting} /> : null}

            <View style={{ gap: theme.spacing.sm }}>
              {BUDGET_LABELS.map(({ minutes, label }) => (
                <Card key={minutes} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <AppText variant="body" color="secondary">
                    {label}
                  </AppText>
                  <AppText variant="heading">{formatDays(data.estimatedDaysByMinutesPerDay[minutes])}</AppText>
                </Card>
              ))}
            </View>

            <AppText variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
              {data.usedFallbackPace
                ? 'Оцінка на основі середнього темпу читання (ще немає власної історії сесій).'
                : 'Оцінка на основі твого реального темпу читання за весь час.'}
            </AppText>
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
