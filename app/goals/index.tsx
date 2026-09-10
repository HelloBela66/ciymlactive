import React, { useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Stack } from 'expo-router';
import { startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/LabeledInput';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { useTheme } from '@/design/ThemeProvider';
import { readingGoalTypeLabels, readingGoalStatusLabels } from '@/design/i18n-labels';
import { useCreateGoal, useGoals, useRemoveGoal, useSetGoalStatus, type GoalWithProgress } from '@/features/goals/useGoals';
import type { ReadingGoalType } from '@/types/readingGoal';

// finish_book/finish_series потребують picker книги/серії, якого ще немає в UI цього
// milestone (докладніше — CHANGELOG) — тут пропонуються лише 4 типи, для яких прогрес
// рахується автоматично з наявних даних.
const GOAL_TYPE_OPTIONS: ReadingGoalType[] = ['books_per_year', 'pages', 'minutes', 'reading_days'];
type PeriodPreset = 'this_month' | 'this_year';
const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 'this_month', label: 'Цей місяць' },
  { value: 'this_year', label: 'Цей рік' },
];

function periodRange(preset: PeriodPreset): { periodStart: string; periodEnd: string } {
  const now = new Date();
  if (preset === 'this_year') {
    return { periodStart: startOfYear(now).toISOString(), periodEnd: endOfYear(now).toISOString() };
  }
  return { periodStart: startOfMonth(now).toISOString(), periodEnd: endOfMonth(now).toISOString() };
}

function GoalCard({ item }: { item: GoalWithProgress }) {
  const theme = useTheme();
  const setStatus = useSetGoalStatus();
  const remove = useRemoveGoal();
  const { goal, progress } = item;
  const ratio = progress.target > 0 ? Math.min(1, progress.current / progress.target) : 0;

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{readingGoalTypeLabels[goal.type]}</AppText>
          <AppText variant="caption" color="secondary">
            {progress.current} / {progress.target} · {readingGoalStatusLabels[goal.status]}
          </AppText>
        </View>
        {goal.status === 'active' ? (
          <Pressable
            onPress={() => remove.mutate(goal.id)}
            accessibilityRole="button"
            accessibilityLabel="Видалити ціль"
            hitSlop={8}
            style={{ padding: theme.spacing.xs }}
          >
            <Ionicons name="trash-outline" size={20} color={theme.colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

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
            backgroundColor: progress.isComplete ? theme.colors.success : theme.colors.accent,
          }}
        />
      </View>

      {goal.status === 'active' && progress.isComplete ? (
        <Button
          label="Позначити виконаною"
          variant="secondary"
          onPress={() => setStatus.mutate({ id: goal.id, status: 'completed' })}
        />
      ) : null}
      {goal.status === 'active' && !progress.isComplete ? (
        <Button
          label="Скасувати ціль"
          variant="ghost"
          onPress={() => setStatus.mutate({ id: goal.id, status: 'abandoned' })}
        />
      ) : null}
    </Card>
  );
}

function CreateGoalForm({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const createGoal = useCreateGoal();
  const [type, setType] = useState<ReadingGoalType>('books_per_year');
  const [period, setPeriod] = useState<PeriodPreset>('this_year');
  const [target, setTarget] = useState('');

  const targetNumber = Number(target);
  const canSubmit = target.trim().length > 0 && Number.isFinite(targetNumber) && targetNumber > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const { periodStart, periodEnd } = periodRange(period);
    createGoal.mutate(
      {
        type,
        target: Math.trunc(targetNumber),
        periodStart,
        periodEnd,
        relatedWorkId: null,
        relatedSeriesId: null,
      },
      { onSuccess: onDone },
    );
  };

  return (
    <Card style={{ gap: theme.spacing.md }}>
      <ChipSelect
        label="Тип цілі"
        value={type}
        onChange={setType}
        options={GOAL_TYPE_OPTIONS.map((value) => ({ value, label: readingGoalTypeLabels[value] }))}
      />
      <ChipSelect label="Період" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
      <LabeledInput
        label="Ціль (число)"
        required
        value={target}
        onChangeText={setTarget}
        keyboardType="number-pad"
        placeholder="напр. 24"
      />
      <Button label="Створити ціль" onPress={handleSubmit} disabled={!canSubmit || createGoal.isPending} />
    </Card>
  );
}

/** Цілі читання (розділ 30 ТЗ, Milestone 5). Прогрес — `useGoals()`, рахується "на льоту". */
export default function GoalsScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch } = useGoals();
  const [showForm, setShowForm] = useState(false);

  const { active, closed } = useMemo(() => {
    const list = data ?? [];
    return {
      active: list.filter((item) => item.goal.status === 'active'),
      closed: list.filter((item) => item.goal.status !== 'active'),
    };
  }, [data]);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Цілі читання',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <View style={{ gap: theme.spacing.md }}>
          {showForm ? (
            <CreateGoalForm onDone={() => setShowForm(false)} />
          ) : (
            <Button label="+ Нова ціль" variant="secondary" onPress={() => setShowForm(true)} />
          )}

          {isError ? (
            <QueryErrorState onRetry={() => refetch()} />
          ) : isLoading ? (
            <AppText variant="body" color="secondary">
              Завантаження…
            </AppText>
          ) : active.length === 0 && closed.length === 0 ? (
            <EmptyState title="Поки немає жодної цілі" description="Постав собі ціль читання — наприклад, скільки книг прочитати за рік." />
          ) : (
            <>
              {active.map((item) => (
                <GoalCard key={item.goal.id} item={item} />
              ))}
              {closed.length > 0 ? (
                <>
                  <AppText variant="caption" color="tertiary" style={{ marginTop: theme.spacing.md }}>
                    Закриті цілі
                  </AppText>
                  {closed.map((item) => (
                    <GoalCard key={item.goal.id} item={item} />
                  ))}
                </>
              ) : null}
            </>
          )}
        </View>
      </ScreenContainer>
    </>
  );
}
