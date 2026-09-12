import React from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { useTheme } from '@/design/ThemeProvider';
import { readingGoalTypeLabels } from '@/design/i18n-labels';
import { useHomeContextCard } from '@/features/home/useHomeContextCard';
import { describeStaleReading } from '@/lib/staleReading';
import { formatBookCountSentence, formatOldestWaitingSentence } from '@/lib/tbrPersonality';
import { OnThisDayCard } from './OnThisDayCard';
import type { CapsuleDueCandidate, GoalCandidate, StaleReadingCandidate } from '@/lib/homeContext';
import type { OldestWaitingInsight } from '@/lib/tbrPersonality';

/**
 * Спільний "контекстний хедер" карток нижче (іконка + accent caption) — той самий вигляд, що й
 * `OnThisDayCard`/`OldestWaitingCard` (`app/tbr.tsx`), продубльований тут навмисно (той самий
 * house-патерн маленького презентаційного блоку без спільного стану).
 */
function ContextCardHeader({ icon, label }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
      <Ionicons name={icon} size={16} color={theme.colors.accent} />
      <AppText variant="caption" color="accent">
        {label}
      </AppText>
    </View>
  );
}

function StaleReadingContextCard({ candidate }: { candidate: StaleReadingCandidate }) {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <ContextCardHeader icon="bookmark-outline" label="Давно не читав" />
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <CoverThumbnail
          coverUrl={candidate.coverUrl}
          title={candidate.title}
          fallbackColor={candidate.coverFallbackColor}
          width={48}
          height={70}
          borderRadius={theme.radius.sm}
        />
        <View style={{ flex: 1, gap: theme.spacing.xs, justifyContent: 'center' }}>
          <AppText variant="body">{candidate.title}</AppText>
          <AppText variant="caption" color="secondary">
            {describeStaleReading(candidate.info)}
          </AppText>
        </View>
      </View>
      <Button
        label="Згадати, де я зупинився"
        variant="secondary"
        onPress={() => router.push({ pathname: '/recap/[workId]', params: { workId: candidate.workId } } as unknown as Href)}
      />
    </Card>
  );
}

function CapsuleDueContextCard({ candidate }: { candidate: CapsuleDueCandidate }) {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <ContextCardHeader icon="cube-outline" label="Час згадати книгу" />
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <CoverThumbnail
          coverUrl={candidate.coverUrl}
          title={candidate.title}
          fallbackColor={candidate.coverFallbackColor}
          width={48}
          height={70}
          borderRadius={theme.radius.sm}
        />
        <View style={{ flex: 1, gap: theme.spacing.xs, justifyContent: 'center' }}>
          <AppText variant="body">{candidate.title}</AppText>
          <AppText variant="caption" color="secondary">
            Твоя капсула цієї книги вже чекає.
          </AppText>
        </View>
      </View>
      <Button
        label="Згадати книгу"
        variant="secondary"
        onPress={() => router.push({ pathname: '/recall/[workId]', params: { workId: candidate.workId } } as unknown as Href)}
      />
    </Card>
  );
}

function GoalNearCompletionContextCard({ item }: { item: GoalCandidate }) {
  const theme = useTheme();
  const ratio = item.progress.target > 0 ? Math.min(1, item.progress.current / item.progress.target) : 0;

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <ContextCardHeader icon="ribbon-outline" label="Майже готово" />
      <AppText variant="body">
        {readingGoalTypeLabels[item.goal.type]}: {item.progress.current} / {item.progress.target}
      </AppText>
      <View
        style={{
          height: 8,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.accentSoft,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${ratio * 100}%`,
            height: '100%',
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.accent,
          }}
        />
      </View>
      <Button label="Переглянути ціль" variant="secondary" onPress={() => router.push('/goals')} />
    </Card>
  );
}

function TbrSuggestionContextCard({
  bookCount,
  oldestWaiting,
}: {
  bookCount: number;
  oldestWaiting: OldestWaitingInsight | null;
}) {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <ContextCardHeader icon="hourglass-outline" label="Хочу прочитати" />
      <AppText variant="body">{formatBookCountSentence(bookCount)}</AppText>
      {oldestWaiting ? (
        <AppText variant="caption" color="secondary">
          {formatOldestWaitingSentence(oldestWaiting.title)}
        </AppText>
      ) : null}
      <Button
        label="Нарешті прочитати"
        variant="secondary"
        onPress={() => router.push('/tbr' as unknown as Href)}
      />
    </Card>
  );
}

/**
 * Home-слот "щонайбільше ОДНА контекстна картка" (ТЗ Фази 18, HOME REDESIGN) — сама лише
 * рендерить те, що обрала `useHomeContextCard`/`selectHomeContextCard`
 * (`src/lib/homeContext.ts`), жодної логіки пріоритезації тут немає. Варіант `on_this_day`
 * повторно використовує вже наявну `OnThisDayCard` без змін (не дублює її вміст) — той самий
 * компонент, що й раніше рендерився тут напряму, до появи конкуренції за слот у цій фазі.
 */
export function HomeContextCard() {
  const card = useHomeContextCard();
  if (!card) return null;

  switch (card.kind) {
    case 'stale_reading':
      return <StaleReadingContextCard candidate={card.candidate} />;
    case 'capsule_due':
      return <CapsuleDueContextCard candidate={card.candidate} />;
    case 'on_this_day':
      return <OnThisDayCard />;
    case 'goal_near_completion':
      return <GoalNearCompletionContextCard item={card.candidate} />;
    case 'tbr_suggestion':
      return <TbrSuggestionContextCard bookCount={card.bookCount} oldestWaiting={card.oldestWaiting} />;
  }
}
