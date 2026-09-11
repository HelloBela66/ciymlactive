import { differenceInCalendarDays, differenceInMonths } from 'date-fns';
import { pluralizeUk } from './pluralizeUk';

/**
 * POLYTSIA V1.6, Фаза 5 («Книга через час») — уся доменна логіка чистими функціями без
 * SQL/React, той самий house-патерн, що й `bookCapsule.ts`/`onThisDay.ts`: `now`/значення —
 * явний параметр, жодного `new Date()` усередині.
 */

/** П.39 ТЗ (той самий підхід, що й `bookCapsule.ts#normalizeCapsuleText`) — trim, порожній
 * рядок (чи лише пробіли) — це "не заповнено", не валідний контент. */
export function normalizeRecallText(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * «Ти прочитав цю книгу N місяців тому.» (Фаза 5 ТЗ, крок Flow). Місяці — для більшості
 * випадків (найчастіший діапазон капсули: 3 місяці — кілька років); менше місяця — дні (капсулу
 * можна прочитати одразу після створення, п.5 ТЗ "вручну у будь-який момент"); від року —
 * округлені роки, щоб не казати "14 місяців тому". Навмисно `differenceInMonths` (день-чутлива
 * кількість ПОВНИХ місяців), а НЕ `differenceInCalendarMonths` (лише різниця номерів
 * місяця/року, без урахування дня): останній для 31 серпня → 11 вересня порахував би "1 місяць"
 * (серпень→вересень — це вже інший календарний місяць), хоча минуло лише 11 днів — жодного
 * повного місяця ще не пройшло. `differenceInCalendarDays` для гілки днів — той самий
 * calendar-correct підхід, що й `calculateCapsuleReopenAt` (`bookCapsule.ts`).
 */
export function formatTimeSinceFinished(finishedAtIso: string, now: Date): string {
  const finishedAt = new Date(finishedAtIso);
  const months = differenceInMonths(now, finishedAt);

  if (months >= 12) {
    const years = Math.floor(months / 12);
    return `${years} ${pluralizeUk(years, ['рік', 'роки', 'років'])} тому`;
  }
  if (months >= 1) {
    return `${months} ${pluralizeUk(months, ['місяць', 'місяці', 'місяців'])} тому`;
  }

  const days = differenceInCalendarDays(now, finishedAt);
  if (days <= 0) return 'сьогодні';
  return `${days} ${pluralizeUk(days, ['день', 'дні', 'днів'])} тому`;
}
