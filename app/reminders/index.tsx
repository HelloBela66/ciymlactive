import React, { useState } from 'react';
import { View, Pressable, Switch } from 'react-native';
import { Stack } from 'expo-router';
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
import { reminderKindLabels, weekdayChipOptions, reminderTimeOptions } from '@/design/i18n-labels';
import { useCreateReminder, useReminders, useRemoveReminder, useToggleReminder } from '@/features/reminders/useReminders';
import type { Reminder } from '@/types/reminder';

type UiKind = 'daily' | 'weekday';
const KIND_OPTIONS: { value: UiKind; label: string }[] = [
  { value: 'daily', label: reminderKindLabels.daily },
  { value: 'weekday', label: reminderKindLabels.weekday },
];

function summarizeReminder(reminder: Reminder): string {
  const time = reminder.timeOfDay ?? '—';
  if (reminder.kind === 'daily') return `Щодня о ${time}`;
  if (reminder.kind === 'weekday' && reminder.weekdays) {
    const labels = weekdayChipOptions.filter((d) => reminder.weekdays?.includes(d.value)).map((d) => d.label);
    return `${labels.join(', ')} о ${time}`;
  }
  return reminderKindLabels[reminder.kind];
}

function ReminderRow({ reminder }: { reminder: Reminder }) {
  const theme = useTheme();
  const toggle = useToggleReminder();
  const remove = useRemoveReminder();

  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <View style={{ flex: 1 }}>
        <AppText variant="body">{reminder.message}</AppText>
        <AppText variant="caption" color="secondary">
          {summarizeReminder(reminder)}
        </AppText>
      </View>
      <Switch
        value={reminder.isEnabled}
        onValueChange={() => toggle.mutate(reminder)}
        trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
      />
      <Pressable
        onPress={() => remove.mutate(reminder)}
        accessibilityRole="button"
        accessibilityLabel="Видалити нагадування"
        hitSlop={8}
        style={{ padding: theme.spacing.xs }}
      >
        <Ionicons name="trash-outline" size={20} color={theme.colors.textTertiary} />
      </Pressable>
    </Card>
  );
}

function CreateReminderForm({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const createReminder = useCreateReminder();
  const [kind, setKind] = useState<UiKind>('daily');
  const [time, setTime] = useState<(typeof reminderTimeOptions)[number]>('20:00');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [message, setMessage] = useState('Час почитати 📖');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = message.trim().length > 0 && (kind === 'daily' || weekdays.length > 0);

  const toggleWeekday = (value: number) => {
    setWeekdays((prev) => (prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]));
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    setError(null);
    createReminder.mutate(
      { kind, timeOfDay: time, weekdays: kind === 'weekday' ? weekdays : null, message: message.trim() },
      {
        onSuccess: onDone,
        onError: (e) => setError(e instanceof Error ? e.message : 'Не вдалося створити нагадування.'),
      },
    );
  };

  return (
    <Card style={{ gap: theme.spacing.md }}>
      <ChipSelect label="Коли" value={kind} onChange={setKind} options={KIND_OPTIONS} />
      {kind === 'weekday' ? (
        <View style={{ gap: theme.spacing.xs }}>
          <AppText variant="caption" color="secondary">
            Дні тижня
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {weekdayChipOptions.map((day) => {
              const selected = weekdays.includes(day.value);
              return (
                <Pressable
                  key={day.value}
                  onPress={() => toggleWeekday(day.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={day.label}
                  style={{
                    paddingHorizontal: theme.spacing.md,
                    minHeight: theme.minTouchTarget,
                    justifyContent: 'center',
                    borderRadius: theme.radius.pill,
                    backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
                    borderWidth: 1,
                    borderColor: selected ? theme.colors.accent : theme.colors.border,
                  }}
                >
                  <AppText variant="caption" color={selected ? 'onAccent' : 'secondary'}>
                    {day.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      <ChipSelect
        label="Час"
        value={time}
        onChange={setTime}
        options={reminderTimeOptions.map((value) => ({ value, label: value }))}
      />
      <LabeledInput label="Текст нагадування" required value={message} onChangeText={setMessage} />
      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
      <Button label="Створити нагадування" onPress={handleSubmit} disabled={!canSubmit || createReminder.isPending} />
    </Card>
  );
}

/**
 * Нагадування (розділ 28 ТЗ, Milestone 5) — лише локальні сповіщення (`expo-notifications`).
 * UI пропонує `daily`/`weekday`; `custom`/`loan_return` — обмеження цього milestone
 * (докладніше — `src/types/reminder.ts` і CHANGELOG).
 */
export default function RemindersScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch } = useReminders();
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Нагадування',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <View style={{ gap: theme.spacing.md }}>
          {showForm ? (
            <CreateReminderForm onDone={() => setShowForm(false)} />
          ) : (
            <Button label="+ Нове нагадування" variant="secondary" onPress={() => setShowForm(true)} />
          )}

          {isError ? (
            <QueryErrorState onRetry={() => refetch()} />
          ) : isLoading ? (
            <AppText variant="body" color="secondary">
              Завантаження…
            </AppText>
          ) : !data || data.length === 0 ? (
            <EmptyState
              title="Поки немає нагадувань"
              description="Постав собі нагадування читати щодня чи в певні дні тижня."
            />
          ) : (
            data.map((reminder) => <ReminderRow key={reminder.id} reminder={reminder} />)
          )}
        </View>
      </ScreenContainer>
    </>
  );
}
