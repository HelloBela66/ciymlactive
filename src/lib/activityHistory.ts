import { format, parseISO } from 'date-fns';
import type { ActivityEvent } from '@/types/activityEvent';

export interface ActivityHistorySection {
  /** 'yyyy-MM-dd', той самий формат, що й `DAY_KEY_FORMAT` у `useStatistics.ts`. */
  dateKey: string;
  date: Date;
  /** Поле навмисно зветься `data`, а не `events` — react-native's `SectionList` вимагає саме
   * це ім'я (`SectionListData<ItemT>` розширює `{ data: ItemT[] }`) для прямої передачі секцій
   * у проп `sections` без додаткового мапінгу в екрані (`app/history.tsx`). */
  data: ActivityEvent[];
}

/**
 * Чиста функція групування (ТЗ Фази 12: «Group by date») — без React/SQL залежностей, той
 * самий підхід, що й `buildMonthGrid`/`computeJournalTimelineMarkers`. Не покладається на
 * порядок вхідного масиву: сортує події за `occurredAt` (найновіше — перше) сама, тож дає
 * коректний результат навіть якщо викликач передав `events` у довільному порядку — а вже
 * впорядковані секції/дні також ідуть від найновішого до найстарішого.
 */
export function groupActivityEventsByDate(events: ActivityEvent[]): ActivityHistorySection[] {
  const sorted = [...events].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));

  const order: string[] = [];
  const byDateKey = new Map<string, ActivityEvent[]>();
  for (const event of sorted) {
    const dateKey = format(parseISO(event.occurredAt), 'yyyy-MM-dd');
    const list = byDateKey.get(dateKey);
    if (list) {
      list.push(event);
    } else {
      byDateKey.set(dateKey, [event]);
      order.push(dateKey);
    }
  }

  return order.map((dateKey) => ({
    dateKey,
    date: parseISO(dateKey),
    data: byDateKey.get(dateKey) ?? [],
  }));
}
