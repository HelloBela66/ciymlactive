import { computeProgressPercent } from './progressPercent';
import { isReadingExperienceId, type ReadingExperienceId } from '@/design/readingExperience';
import type { ReadingSession } from '@/types/readingSession';

/**
 * ТЗ Фази 7 («ЯК ЧИТАЛАСЯ КНИГА») — "Якщо даних мало (<2–3 sessions) — не показуй misleading
 * chart." ТЗ дає діапазон, а не точне число; обрано консервативний кінець діапазону (3) — дві
 * точки на шкалі не показують жодної "форми" читання (просто відрізок), тож візуалізація
 * реально стає інформативною лише від трьох сесій.
 */
export const MIN_SESSIONS_FOR_READING_EXPERIENCE_TIMELINE = 3;

/**
 * Один маркер на шкалі "Як читалася ця книга" — рівно одна завершена сесія (на відміну від
 * `computeJournalTimelineMarkers`, тут НЕ групуємо сесії в кошики за близькістю прогресу:
 * кількість сесій на книгу природно обмежена, і кожна сесія — самостійна одиниця сенсу, а не
 * довільний запис, яких може бути багато в одному місці книги).
 */
export interface ReadingExperienceMarker {
  sessionId: string;
  startedAt: string;
  /** Позиція на шкалі 0-100. */
  percent: number;
  /** Звідки взялась позиція — для збереження точності: `'progress'`, коли відомий `pageCount`
   * видання, інакше рівномірний розподіл за хронологією (`'chronological'`, докладніше —
   * `computeReadingExperienceTimeline`). */
  positionSource: 'progress' | 'chronological';
  /** `null` — сесія завершена без відповіді на "Як читалося?" (поле необов'язкове) АБО зі
   * значенням, якого ця версія застосунку не розпізнає (`isReadingExperienceId`) — обидва
   * випадки рівнозначно "без позначки" на шкалі, а не помилка. */
  experience: ReadingExperienceId | null;
}

/** Позиція однієї сесії на шкалі 0-100% (ТЗ: "Timeline приблизно відповідає progress книги").
 * Сторінка НАПРИКІНЦІ сесії (`endPage`) — те, скільки прочитано УЖЕ ПІСЛЯ цієї сесії, найближче
 * до інтуїтивного "де в книзі стався цей момент читання". `startPage` — єдиний захисний fallback
 * (завершені сесії з `ReadingSessionRepository.listByUserBookId` завжди мають `endPage` — його
 * завжди проставляє `finish()` — але тип лишається `number | null`, тож про всяк випадок). */
function progressPercentForSession(session: ReadingSession, pageCount: number | null): number | null {
  return computeProgressPercent(session.endPage ?? session.startPage, pageCount);
}

/**
 * Будує маркери шкали "Як читалася ця книга" (Book Memory screen, ТЗ Фази 7) з завершених
 * сесій читання книги. Повертає `[]`, коли сесій замало (`MIN_SESSIONS_FOR_READING_EXPERIENCE_
 * TIMELINE`) — компонент рендерить `null` рівно так само, як `JournalTimeline` при порожньому
 * результаті `computeJournalTimelineMarkers`, той самий патерн "тиха деградація, не помилка".
 *
 * ТЗ: "Timeline приблизно відповідає progress книги. Якщо session не має progress — використовуй
 * chronological position." На практиці "сесія без progress" означає не відсутність даних У
 * сесії (завершена сесія завжди має сторінку), а відсутність `pageCount` У ВИДАННЯ книги —
 * тож рішення про базис позиції ("progress" чи "chronological") приймається ОДНАКОВО для всіх
 * сесій одразу, а не по одній: змішування двох базисів в одній шкалі створило б хибне враження,
 * ніби відстані між точками щось значать, коли частина з них — просто порядковий номер.
 */
export function computeReadingExperienceTimeline(
  sessions: ReadingSession[],
  pageCount: number | null,
): ReadingExperienceMarker[] {
  if (sessions.length < MIN_SESSIONS_FOR_READING_EXPERIENCE_TIMELINE) return [];

  const chronological = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const hasProgressBasis = chronological.every((session) => progressPercentForSession(session, pageCount) != null);

  return chronological.map((session, index) => {
    const experience =
      session.readingExperience != null && isReadingExperienceId(session.readingExperience)
        ? session.readingExperience
        : null;

    if (hasProgressBasis) {
      const percent = progressPercentForSession(session, pageCount);
      // `hasProgressBasis` уже гарантує `percent != null` для кожної сесії тут — перевірка
      // нижче лише заспокоює TypeScript (`noUncheckedIndexedAccess`/строгий null-check), а не
      // виражає реальний edge case.
      return { sessionId: session.id, startedAt: session.startedAt, percent: percent ?? 0, positionSource: 'progress', experience };
    }

    // Хронологічний фолбек: рівномірно від 0 до 100 включно. Одна сесія неможлива тут
    // (`MIN_SESSIONS_FOR_READING_EXPERIENCE_TIMELINE` = 3), тож `chronological.length - 1`
    // ніколи не ділить на нуль.
    const percent = (index / (chronological.length - 1)) * 100;
    return { sessionId: session.id, startedAt: session.startedAt, percent, positionSource: 'chronological', experience };
  });
}
