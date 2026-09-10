import { format, isSameDay, subDays } from 'date-fns';
import { uk } from 'date-fns/locale';

/**
 * "Останній раз: учора о 22:41" (ТЗ Фази 8 — READING CONTINUITY, картка "Зараз читаєш" на
 * Home) — чиста функція без React/SQL, той самий принцип, що й `streaks.ts`/`sessionTiming.ts`:
 * `now` — явний параметр, не `new Date()` усередині, щоб лишатись детермінованою й тестованою.
 *
 * На відміну від приватної `dateGroupLabel` у `app/journal/index.tsx` (заголовок секції
 * списку — "Сьогодні"/"Учора" з великої літери, БЕЗ часу), тут короткий фрагмент усередині
 * речення: з малої літери, завжди з часом, і третій випадок — конкретна дата без року для
 * давніших сесій (Home не показує історію настільки давню, щоб рік був потрібним уточненням).
 */
export function formatLastReadLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  const time = format(date, 'HH:mm');
  if (isSameDay(date, now)) return `сьогодні о ${time}`;
  if (isSameDay(date, subDays(now, 1))) return `учора о ${time}`;
  return `${format(date, 'd MMMM', { locale: uk })} о ${time}`;
}
