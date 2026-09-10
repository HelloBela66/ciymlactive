import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { ReadingSession } from '@/types/readingSession';

export interface BookStats {
  totalSeconds: number;
  sessionCount: number;
  pagesRead: number | null;
  /** Календарна відстань старт→фініш читання, `null` — коли жодної дати немає (книгу можна
   * позначити "Прочитано" й напряму з "Хочу прочитати", без старту сесії). */
  days: number | null;
  /** Темп читання (сторінок/годину), округлений до цілого — `null`, коли немає жодного
   * зафіксованого прогресу сторінок у сесіях, або немає зафіксованого часу читання (пряме
   * позначення "Прочитано" без жодної сесії таймера). Рахується від `startPage`/`endPage`
   * КОЖНОЇ сесії (скільки сторінок реально гортали), а НЕ від фіксованої довжини книги
   * (`pageCount`) — див. докладний коментар над самою функцією нижче, чому саме так. */
  pagesPerHour: number | null;
  /** ISO-дати того самого діапазону, з якого рахується `days` (та сама логіка "з сесій, з
   * фолбеком на startedAt/finishedAt" — див. коментар нижче) — для показу "12 серпня — 7
   * вересня" на підсумку читання/картці-спогаду. `null` разом із `days`. */
  dateRange: { startIso: string; endIso: string } | null;
}

/**
 * Чиста функція підрахунку статистики прочитаної книги — виділена з
 * `app/completion/[workId].tsx` (Milestone 11, Фаза 6), щоб та сама арифметика не
 * дублювалась і не розходилась між підсумком читання й карткою-спогадом (Фаза 8,
 * `app/memory/[workId].tsx`) — обидва екрани показують ті самі цифри про ту саму книгу.
 *
 * `days` рахується з `sessions`, а не з `startedAt`/`finishedAt` (аудит M11, п.6.2) —
 * `UserBookRepository.updateStatus` НАВМИСНО не перезаписує `started_at`/`finished_at` після
 * першого разу (щоб дата не "стрибала" й Wrapped не змінювався заднім числом при випадковому
 * перемиканні статусу), тож на повторному прочитанні ("Перечитую" → знову "Прочитано") ці два
 * поля й далі описують лише ПЕРШИЙ цикл читання. А `sessions` (через `useReadingHistory`)
 * повертає сесії з УСІХ циклів — і саме їх суму показують `totalSeconds`/`sessionCount`/
 * `pagesRead` на цьому ж екрані. Якщо рахувати `days` від замороженого `startedAt`/
 * `finishedAt`, підсумок після повторного прочитання показує суперечливі цифри: "5 днів", але
 * час/сторінки вже включають і другий цикл. Коли сесії є — календарний діапазон рахується від
 * НАЙРАНІШОЇ `startedAt` до НАЙПІЗНІШОЇ `endedAt` серед них: це той самий набір даних, який і
 * підсумовується вище, тож розбіжності більше немає. `startedAt`/`finishedAt` лишаються
 * фолбеком лише для рідкісного випадку без жодної сесії (пряме позначення "Прочитано"). */
export function computeBookStats(params: {
  sessions: ReadingSession[] | undefined;
  pageCount: number | null | undefined;
  currentPage: number | null | undefined;
  startedAt: string | null | undefined;
  finishedAt: string | null | undefined;
}): BookStats {
  const sessions = params.sessions ?? [];
  const totalSeconds = sessions.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
  const sessionCount = sessions.length;
  const pagesRead = params.pageCount ?? params.currentPage ?? null;
  const dateRange = computeDateRange(sessions, params.startedAt, params.finishedAt);
  const days = dateRange
    ? Math.max(1, differenceInCalendarDays(parseISO(dateRange.endIso), parseISO(dateRange.startIso)) + 1)
    : null;
  // `pagesTurned` — сума РЕАЛЬНО пройдених сторінок за кожну сесію (`endPage - startPage`,
  // від'ємне/нульове значення не рахується — захист від пошкоджених/ручноредагованих записів),
  // а НЕ фіксована довжина книги (`pagesRead`/`pageCount` вище). Навмисно окрема від `pagesRead`
  // величина — знахідка з незалежного аудиту: `pagesRead` (довжина книги) полічена ОДИН раз,
  // а `totalSeconds` вище підсумовує сесії з УСІХ циклів читання (те саме навмисне рішення, що
  // й для `days`, аудит М11 п.6.2 — інакше "Час читання" на цьому ж екрані розійшовся б із
  // "днями"). Якщо темп рахувати як `pagesRead / totalSeconds`, то на повторному прочитанні
  // (другий цикл сесій додає ще ~стільки ж totalSeconds, а книга та сама, тож pagesRead НЕ
  // подвоюється) показаний темп занижується приблизно вдвічі — хоча реальна швидкість читання
  // не змінилась, користувач просто прочитав книгу двічі. `pagesTurned`, на відміну від
  // `pagesRead`, природно ПОДВОЮЄТЬСЯ разом із `totalSeconds` на повторному прочитанні (кожен
  // цикл дає свій набір сесій зі своїми `startPage`/`endPage` від початку книги до кінця), тож
  // темп лишається коректним незалежно від кількості циклів.
  const pagesTurned = sessions.reduce((sum, s) => {
    if (s.endPage == null) return sum;
    const delta = s.endPage - s.startPage;
    return sum + (delta > 0 ? delta : 0);
  }, 0);
  const pagesPerHour = pagesTurned > 0 && totalSeconds > 0 ? Math.round(pagesTurned / (totalSeconds / 3600)) : null;

  return { totalSeconds, sessionCount, pagesRead, days, pagesPerHour, dateRange };
}

function computeDateRange(
  sessions: ReadingSession[],
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined,
): { startIso: string; endIso: string } | null {
  if (sessions.length > 0) {
    // ISO-рядки з `nowIso()` — той самий формат, лексикографічне порівняння коректно
    // збігається з хронологічним (той самий прийом, що й у `useWrappedYear.ts`).
    const minStart = sessions.map((s) => s.startedAt).reduce((min, cur) => (cur < min ? cur : min));
    const maxEnd = sessions.map((s) => s.endedAt ?? s.startedAt).reduce((max, cur) => (cur > max ? cur : max));
    return { startIso: minStart, endIso: maxEnd };
  }

  return startedAt && finishedAt ? { startIso: startedAt, endIso: finishedAt } : null;
}
