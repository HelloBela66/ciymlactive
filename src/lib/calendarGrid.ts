import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
} from 'date-fns';

export interface CalendarDay {
  date: Date;
  inCurrentMonth: boolean;
  isToday: boolean;
}

/**
 * Чиста функція побудови сітки місяця (понеділок-перший тиждень, п.34 ТЗ — week_start
 * налаштовується пізніше в settings; поки що monday за замовчуванням). Немає React/SQL
 * залежностей — легко тестується і буде перевикористана статистикою (день тижня, п.30).
 */
export function buildMonthGrid(monthAnchor: Date, weekStartsOn: 0 | 1 = 1, today: Date = new Date()): CalendarDay[] {
  const start = startOfWeek(startOfMonth(monthAnchor), { weekStartsOn });
  const end = endOfWeek(endOfMonth(monthAnchor), { weekStartsOn });

  return eachDayOfInterval({ start, end }).map((date) => ({
    date,
    inCurrentMonth: isSameMonth(date, monthAnchor),
    isToday: isSameDay(date, today),
  }));
}
