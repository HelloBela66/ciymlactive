import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Тонка обгортка над `expo-notifications` (розділ 28 ТЗ — лише локальні нагадування, без
 * push/сервера). Тримає весь код планування/скасування в одному місці, щоб
 * `ReminderRepository`/`useReminders.ts` не знали про Expo API напряму.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let channelReady = false;

/** Android вимагає notification channel до першого запланованого сповіщення. */
async function ensureAndroidChannelAsync(): Promise<void> {
  if (Platform.OS !== 'android' || channelReady) return;
  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Нагадування читати',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  channelReady = true;
}

export async function requestNotificationPermissionAsync(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function parseTimeOfDay(timeOfDay: string): { hour: number; minute: number } {
  const [hourStr, minuteStr] = timeOfDay.split(':');
  return { hour: Number(hourStr) || 0, minute: Number(minuteStr) || 0 };
}

/** Планує щоденне сповіщення о `timeOfDay` ('HH:mm'). Повертає id для подальшого скасування. */
export async function scheduleDailyReminderAsync(timeOfDay: string, message: string): Promise<string> {
  await ensureAndroidChannelAsync();
  const { hour, minute } = parseTimeOfDay(timeOfDay);
  return Notifications.scheduleNotificationAsync({
    content: { title: 'Полиця', body: message },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
}

/** Планує повторюване сповіщення в обрані дні тижня (JS `Date#getDay()`: 0=неділя..6=субота).
 * `expo-notifications` не має "кількох днів тижня" одним тригером — плануємо по одному
 * `WEEKLY`-тригеру на кожен обраний день і повертаємо всі id, склеєні через кому (той самий
 * рядок пізніше розбирається назад для скасування — див. `cancelReminderAsync`). */
export async function scheduleWeekdayReminderAsync(
  weekdays: number[],
  timeOfDay: string,
  message: string,
): Promise<string> {
  await ensureAndroidChannelAsync();
  const { hour, minute } = parseTimeOfDay(timeOfDay);
  const ids = await Promise.all(
    weekdays.map((weekday) =>
      Notifications.scheduleNotificationAsync({
        content: { title: 'Полиця', body: message },
        // expo-notifications WEEKLY-тригер рахує дні як 1=неділя..7=субота (на 1 більше за
        // JS Date#getDay()) — конвертація тут, а не в даних, які лишаються в JS-конвенції.
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: weekday + 1, hour, minute },
      }),
    ),
  );
  return ids.join(',');
}

export async function cancelReminderAsync(notificationIdentifier: string | null): Promise<void> {
  if (!notificationIdentifier) return;
  const ids = notificationIdentifier.split(',').filter(Boolean);
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}
