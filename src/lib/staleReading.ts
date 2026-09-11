import { differenceInCalendarDays } from 'date-fns';
import { pluralizeUk } from './pluralizeUk';
import type { ReadingSession } from '@/types/readingSession';

/**
 * ТЗ Фази 8 («ДАВНО НЕ ЧИТАВ») не дає точного порогу — лише ілюстративний приклад ("Останнє
 * читання — 18 днів тому"). Обрано 14 днів (два тижні): досить довго, щоб не смикати за кожну
 * пропущену пару днів (ТЗ прямо застерігає "Не використовуй guilt language" — часта підказка й
 * сама по собі читалась би як тиск), і досить конкретно, щоб лишатись легко поясненим числом.
 */
export const STALE_READING_THRESHOLD_DAYS = 14;

export interface StaleReadingInfo {
  daysSinceLastSession: number;
  /** Сторінка, на якій закінчилась остання сесія — `null`, лише якщо в сесії справді немає
   * `endPage` (теоретично можливо за типом, хоч `ReadingSessionRepository.finish` завжди його
   * проставляє для завершених сесій). */
  lastPage: number | null;
}

/**
 * Чи "давно не читав" книгу зі статусом "Читаю"/"Перечитую" — і якщо так, дані для helpful
 * context (ТЗ: "current page", "Ти зупинився на стор. …"). `lastSession` — найновіша ЗАВЕРШЕНА
 * сесія книги (`ReadingSessionRepository.listByUserBookId`/`useReadingHistory`, елемент з
 * індексом 0 — список уже відсортований найновішими зверху); `null`, коли книгу взагалі ще
 * жодного разу не читали сесією (тоді "давно не читав" не застосовується — нема від чого
 * відлічувати, це просто щойно почата книга).
 */
export function computeStaleReadingInfo(
  lastSession: Pick<ReadingSession, 'endedAt' | 'endPage'> | null,
  now: Date,
): StaleReadingInfo | null {
  if (!lastSession?.endedAt) return null;

  const daysSinceLastSession = differenceInCalendarDays(now, new Date(lastSession.endedAt));
  if (daysSinceLastSession < STALE_READING_THRESHOLD_DAYS) return null;

  return { daysSinceLastSession, lastPage: lastSession.endPage };
}

/**
 * Текст підказки (ТЗ: "Останнє читання — 18 днів тому." / "Ти зупинився на стор. 418.") —
 * нейтральний, описовий тон, без "streak"/"пропустив"/окличних знаків (ТЗ: "Не використовуй
 * guilt language").
 */
export function describeStaleReading(info: StaleReadingInfo): string {
  const daysWord = pluralizeUk(info.daysSinceLastSession, ['день', 'дні', 'днів']);
  const daysLine = `Останнє читання — ${info.daysSinceLastSession} ${daysWord} тому.`;
  if (info.lastPage == null) return daysLine;
  return `${daysLine} Ти зупинився на стор. ${info.lastPage}.`;
}
