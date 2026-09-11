import { computeProgressPercent } from './progressPercent';
import type { JournalEntry } from '@/types/journalEntry';
import type { LoreEntity } from '@/types/loreEntity';
import type { UserBookStatus } from '@/types/userBook';

/**
 * SPOILER-SAFE MODE (POLYTSIA V1.6, Фаза 11) — чисті функції (`docs/SPOILER_SAFE.md`), той
 * самий house-патерн, що й `bookCapsule.ts`/`staleReading.ts`: жодного `new Date()`/SQL/React
 * усередині, `now`/поточний прогрес — завжди явний параметр.
 *
 * ТЗ: "Не видаляй записи. Тільки hide/filter." — усі функції тут ФІЛЬТРУЮТЬ масив, що вже
 * завантажений (нічого не видаляється з БД чи навіть не виключається з SQL-запиту) — той самий
 * підхід, що й `revisitLaterOnly`/`favoriteOnly` фільтри `JournalRepository`, лише застосований
 * на клієнті, а не в SQL (записів на книгу мало, `docs/BACKUP_FORMAT.md` того самого духу).
 */

/** ТЗ: "При active reading" — прапорець сам по собі нічого не приховує, доки книга не читається
 * (чи не перечитується) зараз; для вже прочитаної чи ще не розпочатої книги спойлерів по
 * визначенню немає (`finished`) чи ще нема самих записів попереду (`want_to_read`). */
export function isSpoilerSafeActive(status: UserBookStatus, spoilerSafeEnabled: boolean): boolean {
  return spoilerSafeEnabled && (status === 'reading' || status === 'rereading');
}

export interface CurrentProgress {
  currentPage: number | null;
  pageCount: number | null;
}

interface SpoilerSafePosition {
  page: number | null;
  progressPercent: number | null;
}

/**
 * Позиція запису "попереду" поточного прогресу — сторінка має пріоритет (точніша за прогрес,
 * особливо коли `pageCount` видання невідомий); відсоток — фолбек, коли сторінки нема в жодного
 * з двох боків порівняння. Коли позицію визначити неможливо (немає ні сторінки, ні відсотка з
 * будь-якого боку) — `false` (НЕ приховувати): це свідомо консервативний вибір — запис без
 * позиції не можна довести "попереду", а хибне приховування було б гірше за хибний показ (ТЗ не
 * просить приховувати "усе підозріле", лише те, що доведено попереду).
 */
function isAheadOfCurrentProgress(entry: SpoilerSafePosition, current: CurrentProgress): boolean {
  if (entry.page != null && current.currentPage != null) {
    return entry.page > current.currentPage;
  }
  const currentPercent = computeProgressPercent(current.currentPage, current.pageCount);
  if (entry.progressPercent != null && currentPercent != null) {
    return entry.progressPercent > currentPercent;
  }
  return false;
}

/** ТЗ REREADING: "Spoiler-safe mode може враховувати поточний reread progress." —
 * `current.currentPage` тут завжди `user_book.current_page`, який під час перечитування так
 * само відображає прогрес ПОТОЧНОГО прочитання (`docs/SPOILER_SAFE.md` §Перечитування) — той
 * самий інваріант, що вже використовує решта фіч (`FinishPredictionSection` тощо), нова функція
 * його не змінює. */
export function filterSpoilerSafeJournalEntries(
  entries: JournalEntry[],
  active: boolean,
  current: CurrentProgress,
): JournalEntry[] {
  if (!active) return entries;
  return entries.filter((entry) => !isAheadOfCurrentProgress(entry, current));
}

export function filterSpoilerSafeLoreEntities(
  entities: LoreEntity[],
  active: boolean,
  current: CurrentProgress,
): LoreEntity[] {
  if (!active) return entities;
  return entities.filter((entity) => !isAheadOfCurrentProgress({ page: entity.firstSeenPage, progressPercent: entity.firstSeenProgress }, current));
}
