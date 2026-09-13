import { sumSessionMinutes, type SessionMinutesInput } from './readingAggregates';

/**
 * Календар 2.0 (POLYTSIA V1.6.1, Фаза 19, `docs/CALENDAR_2_0.md`) — чисті функції для двох
 * нових правил дня-клітинки: "який обкладинка книги показати" (primary book) і "наскільки
 * насичений день читанням" (intensity). Той самий house-патерн, що й `calendarGrid.ts`/
 * `spoilerSafe.ts`/`readingAggregates.ts`: жодного `new Date()`/SQL/React тут — уже
 * завантажений (одним запитом на весь видимий діапазон, `ReadingSessionRepository.
 * listStartedBetween`) список сесій ОДНОГО дня передається як звичайний масив.
 */

export interface DaySessionSummary {
  userBookId: string;
  durationSeconds: number | null;
  /** Для tie-break між книгами з однаковою сумою хвилин за день (нижче). */
  startedAt: string;
}

/**
 * PRIMARY BOOK RULE — яку книгу показати обкладинкою клітинки дня, коли того дня читали
 * кілька книг. Перемагає книга з найбільшою сумою хвилин ЗА ЦЕЙ ДЕНЬ (той самий підхід
 * "округлення на кожну сесію окремо, тоді сума", що й `sumSessionMinutes` вище — рахується
 * тут по групах, бо `sumSessionMinutes` рахує лише плаский підсумок, а тут потрібен підсумок
 * НА КОЖНУ книгу). Рівність (однакова сума хвилин) — перемагає книга, чия сесія ЗА ЦЕЙ ДЕНЬ
 * почалась раніше — той самий "хто перший" tie-break дух, що й `computeBusiestMonth`/
 * `computeTopGenreAmong` (readingAggregates.ts), тут явно за `startedAt`, бо вхід тут
 * посесійний (не по книгах заздалегідь згрупований). `null`, якщо того дня сесій нема.
 */
export function selectPrimaryBookForDay(sessions: DaySessionSummary[]): string | null {
  if (sessions.length === 0) return null;

  const minutesByBook = new Map<string, number>();
  const firstStartByBook = new Map<string, string>();
  for (const session of sessions) {
    const minutes = Math.round((session.durationSeconds ?? 0) / 60);
    minutesByBook.set(session.userBookId, (minutesByBook.get(session.userBookId) ?? 0) + minutes);
    const existingFirstStart = firstStartByBook.get(session.userBookId);
    if (!existingFirstStart || session.startedAt < existingFirstStart) {
      firstStartByBook.set(session.userBookId, session.startedAt);
    }
  }

  let winnerBookId: string | null = null;
  let winnerMinutes = -1;
  let winnerFirstStart = '';
  for (const [userBookId, minutes] of minutesByBook) {
    const firstStart = firstStartByBook.get(userBookId) ?? '';
    const winsOnMinutes = minutes > winnerMinutes;
    const winsOnTieBreak = minutes === winnerMinutes && firstStart < winnerFirstStart;
    if (winnerBookId === null || winsOnMinutes || winsOnTieBreak) {
      winnerBookId = userBookId;
      winnerMinutes = minutes;
      winnerFirstStart = firstStart;
    }
  }
  return winnerBookId;
}

/** 0 = без читання, 1-3 = зростаюча інтенсивність. Значення — індекс у "сходинку" непрозорості
 * UI малює поверх `theme.colors.accent` (`app/(tabs)/calendar.tsx`) — свідомо БЕЗ нових
 * кольорів дизайн-токенів (`src/design/tokens.ts` — лише один "зелений" акцент на всю палітру,
 * докладніше `docs/CALENDAR_2_0.md`). */
export type DayIntensityLevel = 0 | 1 | 2 | 3;

/**
 * Пороги (хвилини за день) — продуктове рішення цієї фази, немає аналога в ТЗ дослівно:
 * "низька" (1) — до пів години (коротка сесія чи перерваний "уривок"), "середня" (2) — до
 * півтори години (типова повноцінна сесія), "висока" (3) — довше (кілька сесій чи довге
 * занурення). Той самий дух, що й `readingProfile.ts`'s `MIN_BOOKS_FOR_TOP_GENRE` — явний,
 * названий поріг, а не магічне число всередині виразу.
 */
const INTENSITY_LIGHT_MAX_MINUTES = 30;
const INTENSITY_MEDIUM_MAX_MINUTES = 90;

export function computeDayIntensity(totalMinutes: number): DayIntensityLevel {
  if (totalMinutes <= 0) return 0;
  if (totalMinutes <= INTENSITY_LIGHT_MAX_MINUTES) return 1;
  if (totalMinutes <= INTENSITY_MEDIUM_MAX_MINUTES) return 2;
  return 3;
}

/** Сума хвилин ОДНОГО дня — тонка обгортка над `sumSessionMinutes` (той самий вираз, лише
 * перевикористаний), щоб виклику з `useCalendarSessions.ts` не потрібно було імпортувати обидва
 * модулі окремо для однієї клітинки. */
export function sumMinutesForDay(sessions: SessionMinutesInput[]): number {
  return sumSessionMinutes(sessions);
}
