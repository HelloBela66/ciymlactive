import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDatabase } from '@/data/db';
import { ReminderRepository } from '@/data/repositories/ReminderRepository';
import { queryKeys } from '@/lib/queryKeys';
import { createLogger } from '@/lib/logger';
import { useMutationErrorHandler } from '@/lib/useMutationErrorHandler';
import { useErrorToast } from '@/design/ErrorToastProvider';
import {
  cancelReminderAsync,
  requestNotificationPermissionAsync,
  scheduleDailyReminderAsync,
  scheduleWeekdayReminderAsync,
} from '@/lib/notifications';
import type { CreateReminderInput, Reminder } from '@/types/reminder';

const log = createLogger('features/reminders');

export function useReminders() {
  return useQuery<Reminder[]>({
    queryKey: queryKeys.reminders.all,
    queryFn: async () => {
      const db = await getDatabase();
      return ReminderRepository.listAll(db);
    },
  });
}

async function scheduleFor(input: Pick<CreateReminderInput, 'kind' | 'timeOfDay' | 'weekdays' | 'message'>) {
  if (input.kind === 'daily') {
    return scheduleDailyReminderAsync(input.timeOfDay, input.message);
  }
  return scheduleWeekdayReminderAsync(input.weekdays ?? [], input.timeOfDay, input.message);
}

/** На відміну від решти мутацій цього файлу, тут `onError` НЕ використовує спільний
 * `useMutationErrorHandler` з фіксованим текстом: `mutationFn` сама кидає зрозуміле,
 * готове до показу повідомлення ("Дозвіл на сповіщення не надано — увімкни його в
 * налаштуваннях пристрою") — саме його й варто показати користувачу як є, а не ховати за
 * загальним "Не вдалося створити нагадування". Для решти (неочікуваних) помилок — той самий
 * фолбек-текст, що дав би `useMutationErrorHandler`. */
function useReminderErrorHandler(fallbackMessage: string) {
  const { showError } = useErrorToast();
  return (error: unknown) => {
    log.error('Мутація нагадування впала', { error: error instanceof Error ? error.message : String(error) });
    showError(error instanceof Error && error.message ? error.message : fallbackMessage);
  };
}

/** Просить дозвіл на нотифікації (якщо ще не наданий), планує реальне локальне сповіщення
 * і лише потім записує рядок у SQLite з отриманим `notification_identifier` — щоб у базі
 * ніколи не лишалось "нагадування", яке насправді не заплановане в ОС. */
export function useCreateReminder() {
  const queryClient = useQueryClient();
  const onError = useReminderErrorHandler('Не вдалося створити нагадування.');
  return useMutation({
    mutationFn: async (input: CreateReminderInput) => {
      const granted = await requestNotificationPermissionAsync();
      if (!granted) {
        throw new Error('Дозвіл на сповіщення не надано — увімкни його в налаштуваннях пристрою.');
      }
      const notificationIdentifier = await scheduleFor(input);
      const db = await getDatabase();
      return ReminderRepository.create(db, {
        kind: input.kind,
        timeOfDay: input.timeOfDay,
        weekdays: input.kind === 'weekday' ? input.weekdays : null,
        message: input.message,
        notificationIdentifier,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders.all });
    },
    onError,
  });
}

export function useToggleReminder() {
  const queryClient = useQueryClient();
  const onError = useReminderErrorHandler('Не вдалося змінити нагадування.');
  return useMutation({
    mutationFn: async (reminder: Reminder) => {
      const db = await getDatabase();
      if (reminder.isEnabled) {
        await cancelReminderAsync(reminder.notificationIdentifier);
        await ReminderRepository.setEnabled(db, reminder.id, false, null);
        return;
      }

      const granted = await requestNotificationPermissionAsync();
      if (!granted) {
        throw new Error('Дозвіл на сповіщення не надано — увімкни його в налаштуваннях пристрою.');
      }
      const notificationIdentifier = await scheduleFor({
        kind: reminder.kind === 'weekday' ? 'weekday' : 'daily',
        timeOfDay: reminder.timeOfDay ?? '20:00',
        weekdays: reminder.weekdays,
        message: reminder.message,
      });
      await ReminderRepository.setEnabled(db, reminder.id, true, notificationIdentifier);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders.all });
    },
    onError,
  });
}

export function useRemoveReminder() {
  const queryClient = useQueryClient();
  const onError = useMutationErrorHandler(log, 'Не вдалося видалити нагадування.');
  return useMutation({
    mutationFn: async (reminder: Reminder) => {
      await cancelReminderAsync(reminder.notificationIdentifier);
      const db = await getDatabase();
      await ReminderRepository.remove(db, reminder.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders.all });
    },
    onError,
  });
}
