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
/**
 * ЕКСПОРТОВАНО (ТЗ Фази 3 V1.6.1 — «одна централізована spoiler-safe policy замість
 * копіпасту по екранах»): раніше приватна, тепер спільна точка правди для порівняння позиції,
 * яку перевикористовує й `onThisDay.ts#applySpoilerRules` (замість власної спрощеної евристики,
 * що порівнювала лише `page`, ігноруючи фолбек на відсоток) — той самий консервативний
 * "не можу довести → не ховати" інваріант тепер діє скрізь однаково, а не лише тут.
 */
export function isAheadOfCurrentProgress(entry: SpoilerSafePosition, current: CurrentProgress): boolean {
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

/**
 * ТЗ Фази 3 V1.6.1 — «центральна spoiler-safe policy» для БАГАТОКНИЖНИХ поверхонь (Personal
 * Search, Global Journal, Activity History, On This Day): на відміну від однокнижних екранів
 * вище (де `active`/`current` обчислюються ОДИН раз на весь екран, бо книга завжди одна), тут
 * кожен запис/подія може належати ІНШІЙ книзі з іншим статусом/прапорцем/прогресом — тому
 * потрібен контекст ПЕР-книга, а не спільний на всю поверхню.
 *
 * Навмисно один узагальнений тип контексту (а не окремий на кожну поверхню) — той самий набір
 * полів, що й `isSpoilerSafeActive`+`CurrentProgress` разом, лише зібраний в один об'єкт, щоб
 * викликам з мапою "книга → контекст" (`deriveSpoilerContext`/`isSpoilerHidden` нижче) не
 * потрібно було тягнути чотири окремі параметри.
 */
export interface SpoilerSafeBookContext {
  status: UserBookStatus;
  spoilerSafeEnabled: boolean;
  currentPage: number | null;
  pageCount: number | null;
}

/** Той самий контекст, що збирають вручну однокнижні екрани (`data.userBook.status` +
 * `data.userBook.spoilerSafeEnabled` + `data.userBook.currentPage` + `data.primaryEdition.
 * pageCount`) — тут як один хелпер для багатокнижних поверхонь, де це повторюється по кожній
 * книзі в циклі/мапі. */
export function deriveSpoilerContext(
  userBook: { status: UserBookStatus; spoilerSafeEnabled: boolean; currentPage: number | null },
  pageCount: number | null,
): SpoilerSafeBookContext {
  return {
    status: userBook.status,
    spoilerSafeEnabled: userBook.spoilerSafeEnabled,
    currentPage: userBook.currentPage,
    pageCount,
  };
}

/**
 * Єдина точка правди "приховати цей ОДИН запис/сутність зараз чи ні" — об'єднує
 * `isSpoilerSafeActive`+`isAheadOfCurrentProgress` в один виклик. Однокнижні
 * `filterSpoilerSafeJournalEntries`/`filterSpoilerSafeLoreEntities` вище НЕ переписані на цю
 * функцію (щоб не чіпати вже усталену сигнатуру `active: boolean` на десятку викликів по
 * екранах Book Details/Recap/Lore) — але семантично це той самий розрахунок; нові
 * багатокнижні місця (Personal Search/Global Journal/Activity History/On This Day) викликають
 * САМЕ цю функцію, щоб не дублювати комбінацію ще раз по-своєму.
 */
export function isSpoilerHidden(position: SpoilerSafePosition, context: SpoilerSafeBookContext): boolean {
  if (!isSpoilerSafeActive(context.status, context.spoilerSafeEnabled)) return false;
  return isAheadOfCurrentProgress(position, { currentPage: context.currentPage, pageCount: context.pageCount });
}
