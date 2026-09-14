import React from 'react';
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { JournalPreview } from '@/components/ui/JournalPreview';
import { useTheme } from '@/design/ThemeProvider';
import { readingGoalTypeLabels } from '@/design/i18n-labels';
import { useDismissHomeContextCard, useHomeContextCard } from '@/features/home/useHomeContextCard';
import { describeStaleReading } from '@/lib/staleReading';
import { formatBookCountSentence, formatOldestWaitingSentence } from '@/lib/tbrPersonality';
import { OnThisDayCard } from './OnThisDayCard';
import type { CapsuleDueCandidate, GoalCandidate, StaleReadingCandidate } from '@/lib/homeContext';
import type { OldestWaitingInsight } from '@/lib/tbrPersonality';

/**
 * POLYTSIA V1.6.2, #169 (HOME CONTEXT SUPPRESSION) — маленька кнопка "×" у кутку картки, той
 * самий вигляд/розмір hit-área, що й `OnboardingHintCard.tsx` (`theme.minTouchTarget`,
 * `hitSlop`), лише без негативних `margin` (тут кнопка в кутку caption-рядка, а не заголовка на
 * всю ширину картки). Приховує ЛИШЕ ЦЮ конкретну картку до завтра (`useDismissHomeContextCard` —
 * `HomeContextSuppressionStorage`), не картку цього типу назавжди.
 */
function DismissButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Приховати на сьогодні"
      hitSlop={8}
      style={{
        minWidth: theme.minTouchTarget,
        minHeight: theme.minTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
    </Pressable>
  );
}

/**
 * Спільний "контекстний хедер" карток нижче (іконка + accent caption, тепер і кнопка приховання
 * — #169) — той самий вигляд, що й `OnThisDayCard`/`OldestWaitingCard` (`app/tbr.tsx`),
 * продубльований тут навмисно (той самий house-патерн маленького презентаційного блоку без
 * спільного стану).
 */
function ContextCardHeader({
  icon,
  label,
  onDismiss,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
        <Ionicons name={icon} size={16} color={theme.colors.accent} />
        <AppText variant="caption" color="accent">
          {label}
        </AppText>
      </View>
      <DismissButton onPress={onDismiss} />
    </View>
  );
}

function StaleReadingContextCard({ candidate, onDismiss }: { candidate: StaleReadingCandidate; onDismiss: () => void }) {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <ContextCardHeader icon="bookmark-outline" label="Давно не читав" onDismiss={onDismiss} />
      <JournalPreview title={candidate.title} coverUrl={candidate.coverUrl} coverFallbackColor={candidate.coverFallbackColor}>
        <AppText variant="caption" color="secondary">
          {describeStaleReading(candidate.info)}
        </AppText>
      </JournalPreview>
      <Button
        label="Згадати, де я зупинився"
        variant="secondary"
        onPress={() => router.push({ pathname: '/recap/[workId]', params: { workId: candidate.workId } } as unknown as Href)}
      />
    </Card>
  );
}

function CapsuleDueContextCard({ candidate, onDismiss }: { candidate: CapsuleDueCandidate; onDismiss: () => void }) {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <ContextCardHeader icon="cube-outline" label="Час згадати книгу" onDismiss={onDismiss} />
      <JournalPreview title={candidate.title} coverUrl={candidate.coverUrl} coverFallbackColor={candidate.coverFallbackColor}>
        <AppText variant="caption" color="secondary">
          Твоя капсула цієї книги вже чекає.
        </AppText>
      </JournalPreview>
      <Button
        label="Згадати книгу"
        variant="secondary"
        onPress={() => router.push({ pathname: '/recall/[workId]', params: { workId: candidate.workId } } as unknown as Href)}
      />
    </Card>
  );
}

function GoalNearCompletionContextCard({ item, onDismiss }: { item: GoalCandidate; onDismiss: () => void }) {
  const theme = useTheme();
  const ratio = item.progress.target > 0 ? Math.min(1, item.progress.current / item.progress.target) : 0;

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <ContextCardHeader icon="ribbon-outline" label="Майже готово" onDismiss={onDismiss} />
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
  onDismiss,
}: {
  bookCount: number;
  oldestWaiting: OldestWaitingInsight | null;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <ContextCardHeader icon="hourglass-outline" label="Хочу прочитати" onDismiss={onDismiss} />
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
 * #169 — `OnThisDayCard` сама лишається БЕЗ ЗМІН (`onDismiss`-пропу не приймає, і не повинна:
 * це той самий компонент, яким міг би скористатись інший екран у майбутньому). Кнопка приховання
 * тут накладена ЗОВНІ, абсолютним позиціюванням у кутку — над власним `Pressable`
 * `OnThisDayCard`, що веде на `/on-this-day` — так, щоб тап по "×" не запускав навігацію (власний
 * `Pressable` кнопки перехоплює подію першим, `zIndex` вище картки під ним).
 */
function OnThisDayContextCard({ onDismiss }: { onDismiss: () => void }) {
  const theme = useTheme();
  return (
    <View>
      <OnThisDayCard />
      <View style={{ position: 'absolute', top: theme.spacing.sm, right: theme.spacing.sm, zIndex: 1 }}>
        <DismissButton onPress={onDismiss} />
      </View>
    </View>
  );
}

/**
 * Home-слот "щонайбільше ОДНА контекстна картка" (ТЗ Фази 18, HOME REDESIGN) — сама лише
 * рендерить те, що обрала `useHomeContextCard`/`selectVisibleHomeContextCard`
 * (`src/lib/homeContext.ts`), жодної логіки пріоритезації тут немає. `onDismiss` кожного варіанта
 * (#169, HOME CONTEXT SUPPRESSION) — той самий `dismiss(card)` з `useDismissHomeContextCard`,
 * замкнений на КОНКРЕТНО ОБРАНОГО тут `card`, не на тип картки взагалі.
 */
export function HomeContextCard() {
  const card = useHomeContextCard();
  const dismiss = useDismissHomeContextCard();
  if (!card) return null;

  const onDismiss = () => dismiss(card);

  switch (card.kind) {
    case 'stale_reading':
      return <StaleReadingContextCard candidate={card.candidate} onDismiss={onDismiss} />;
    case 'capsule_due':
      return <CapsuleDueContextCard candidate={card.candidate} onDismiss={onDismiss} />;
    case 'on_this_day':
      return <OnThisDayContextCard onDismiss={onDismiss} />;
    case 'goal_near_completion':
      return <GoalNearCompletionContextCard item={card.candidate} onDismiss={onDismiss} />;
    case 'tbr_suggestion':
      return <TbrSuggestionContextCard bookCount={card.bookCount} oldestWaiting={card.oldestWaiting} onDismiss={onDismiss} />;
  }
}
