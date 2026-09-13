import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { formatDuration } from '@/lib/sessionTiming';
import type { ActivityEvent, ActivityEventType } from '@/types/activityEvent';

// `Ionicons` навмисно звичайний (не `import type`) імпорт — `ComponentProps<typeof Ionicons>`
// нижче потребує самого значення для `typeof`, той самий патерн, що був у `app/history.tsx` до
// піднесення цього мапінгу сюди.
type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Іконка/деталь-рядок для одного `ActivityEvent` (ТЗ Фази 12 — READING ACTIVITY HISTORY) — той
 * самий "id → вигляд" патерн, що й `src/design/readingExperience.ts`/`reactions.ts`. Піднято
 * сюди з `app/history.tsx` (Фаза 19, `docs/CALENDAR_2_0.md`) — Day Details (`app/day/[date].tsx`)
 * показує ту саму "решту семи типів подій" для одного дня й перевикористовує ту саму
 * іконку/деталь, а не власну копію (два незалежні визначення того самого мапінгу — саме той
 * клас дублювання, який `readingAggregates.ts` уже виправив для аналітичних обчислювачів).
 */
export const EVENT_ICON: Record<ActivityEventType, IconName> = {
  session_completed: 'time-outline',
  book_started: 'play-outline',
  book_finished: 'checkmark-circle-outline',
  book_added: 'add-circle-outline',
  rating_added: 'star-outline',
  journal_entry: 'create-outline',
  quote: 'chatbox-outline',
  shelf_addition: 'albums-outline',
};

/** Другий рядок картки — деталі, що різняться за типом події (ТЗ: сесія/початок/фініш/
 * додавання/оцінка/запис/цитата/полиця). `null` — коли типу нема що додати понад назву книги
 * (`book_started`/`book_finished`/`book_added` самі по собі вже все кажуть). */
export function eventDetail(event: ActivityEvent): string | null {
  switch (event.type) {
    case 'session_completed':
      return event.durationSeconds != null && event.durationSeconds > 0
        ? formatDuration(event.durationSeconds * 1000)
        : null;
    case 'rating_added':
      return event.ratingValue != null ? `${event.ratingValue.toFixed(1).replace(/\.0$/, '')} / 5` : null;
    case 'journal_entry':
    case 'quote':
      return event.entryText;
    case 'shelf_addition':
      return event.shelfName;
    case 'book_started':
    case 'book_finished':
    case 'book_added':
      return null;
  }
}
