import { format, parseISO } from 'date-fns';
import type { OnThisDayRawEvent } from '@/data/repositories/OnThisDayRepository';
import type {
  OnThisDayJournalPreview,
  OnThisDayMemory,
  OnThisDaySummary,
  OnThisDayYearGroup,
} from '@/types/onThisDay';

/**
 * POLYTSIA V1.6, Фаза 3 («Цей день у твоєму читанні») — уся дата-математика й пріоритети тут,
 * чистими функціями над уже отриманими даними (той самий house-патерн, що й
 * `finishPrediction.ts`/`activityHistory.ts`: жодного `new Date()`/SQL усередині, `referenceDate`
 * — явний параметр, щоб функції лишались детермінованими й тестованими без БД).
 */

const MONTH_DAY_FORMAT = 'MM-dd';

/** Локальна (не UTC) календарна дата "сьогодні" у форматі `'MM-dd'` — `date-fns#format` працює
 * в часовому поясі рушія (`п.13 ТЗ`: у продакшні — реальний пояс пристрою, у тестах —
 * `TZ=UTC`, `package.json`), той самий підхід, що вже усталений у `activityHistory.ts`. */
export function computeMonthDay(referenceDate: Date): string {
  return format(referenceDate, MONTH_DAY_FORMAT);
}

/**
 * SQLite `strftime`-модифікатор (`"+180 minutes"`/`"-300 minutes"`), що зсуває збережену UTC-
 * мітку часу до еквівалента локального часу ПЕРЕД витягом місяця/дня в
 * `OnThisDayRepository.listByMonthDay` — без цього зсуву `strftime('%m-%d', ...)` рахував би
 * UTC-дату, і сесія, що почалась пізно ввечері за місцевим часом, могла б "переїхати" на
 * сусідній день (п.13 ТЗ). `getTimezoneOffset()` повертає (UTC − local) у хвилинах, тож
 * потрібний зсув — це його заперечення.
 */
export function computeLocalOffsetModifier(referenceDate: Date): string {
  const offsetMinutes = -referenceDate.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  return `${sign}${Math.abs(offsetMinutes)} minutes`;
}

/** Локальний рік ISO-мітки часу (той самий часовий пояс рушія, що й `computeMonthDay` — обидва
 * мають "узгоджено" розуміти "зараз"/"тоді", інакше межа року могла б розійтись з межею дня). */
function localYear(iso: string): number {
  return Number(format(parseISO(iso), 'yyyy'));
}

/** П.8 ТЗ: "Пріоритет: favorite → moment → thought → quote → other note." `favorite` —
 * наскрізний прапорець (`isFavorite`), оцінюється першим незалежно від типу запису. */
function journalPreviewPriority(entry: OnThisDayJournalPreview): number {
  if (entry.isFavorite) return 0;
  if (entry.entryType === 'moment') return 1;
  if (entry.entryType === 'thought') return 2;
  if (entry.kind === 'quote') return 3;
  return 4; // question/theory/general
}

/** Щонайбільше стільки journal-preview на один спогад (п.8 ТЗ: "максимум 2–3 preview на рік" —
 * тут "на спогад", що для більшості днів те саме: як правило, один спогад на рік). */
const JOURNAL_PREVIEW_LIMIT_PER_MEMORY = 3;

interface MemoryAccumulator {
  key: string;
  year: number;
  userBookId: string;
  workId: string;
  bookTitle: string;
  coverUrl: string | null;
  coverFallbackColor: string | null;
  sessionDurationSeconds: number;
  hasSession: boolean;
  sessionPagesRead: number;
  hasPages: boolean;
  started: boolean;
  finished: boolean;
  journalEntries: OnThisDayJournalPreview[];
}

/**
 * Сирі події (`OnThisDayRepository.listByMonthDay`, уже відфільтровані за місяцем+днем, БУДЬ-
 * ЯКИЙ рік) → згруповані по (рік, книга) спогади, кожен — одна картка (п.2–3 ТЗ: кілька подій
 * одного дня однієї книги того самого року об'єднуються в ОДНУ картку, а не показуються окремо).
 * `ratingsByUserBookId` — лише оцінки книг, чий цьогорічний спогад позначено `finished`
 * (п.7 ТЗ: рейтинг — збагачення картки "завершено", не самостійна подія).
 */
export function buildOnThisDaySummary(
  rawEvents: OnThisDayRawEvent[],
  ratingsByUserBookId: Map<string, number>,
  referenceDate: Date,
): OnThisDaySummary {
  const monthDay = computeMonthDay(referenceDate);
  const currentYear = localYear(referenceDate.toISOString());

  const byKey = new Map<string, MemoryAccumulator>();

  for (const event of rawEvents) {
    const eventYear = localYear(event.occurredAt);
    const key = `${eventYear}:${event.workId}`;
    let acc = byKey.get(key);
    if (!acc) {
      acc = {
        key,
        year: eventYear,
        userBookId: event.userBookId,
        workId: event.workId,
        bookTitle: event.workTitle,
        coverUrl: event.coverUrl,
        coverFallbackColor: event.coverFallbackColor,
        sessionDurationSeconds: 0,
        hasSession: false,
        sessionPagesRead: 0,
        hasPages: false,
        started: false,
        finished: false,
        journalEntries: [],
      };
      byKey.set(key, acc);
    }

    switch (event.source) {
      case 'session':
        acc.hasSession = true;
        if (event.durationSeconds != null) acc.sessionDurationSeconds += event.durationSeconds;
        if (event.startPage != null && event.endPage != null && event.endPage >= event.startPage) {
          acc.hasPages = true;
          acc.sessionPagesRead += event.endPage - event.startPage;
        }
        break;
      case 'started':
        acc.started = true;
        break;
      case 'finished':
        acc.finished = true;
        break;
      case 'note':
      case 'quote':
        acc.journalEntries.push({
          id: event.entryId ?? event.id,
          kind: event.entryKind ?? 'note',
          entryType: event.entryType ?? 'general',
          text: event.entryText ?? '',
          isFavorite: event.isFavorite,
          page: event.entryPage,
        });
        break;
    }
  }

  const memories: OnThisDayMemory[] = [];
  for (const acc of byKey.values()) {
    const sortedEntries = [...acc.journalEntries].sort(
      (a, b) => journalPreviewPriority(a) - journalPreviewPriority(b),
    );
    const cappedEntries = sortedEntries.slice(0, JOURNAL_PREVIEW_LIMIT_PER_MEMORY);
    const hasFavoriteJournal = sortedEntries.some((e) => e.isFavorite);
    const ratingValue = acc.finished ? ratingsByUserBookId.get(acc.userBookId) ?? null : null;

    // П.4 ТЗ: "book finished → meaningful journal/favorite moment → completed reading session →
    // book started → rating" — нижче число = вищий пріоритет.
    let priority = 5;
    if (acc.finished) priority = 1;
    else if (hasFavoriteJournal) priority = 2;
    else if (acc.hasSession) priority = 3;
    else if (acc.started) priority = 4;

    memories.push({
      key: acc.key,
      year: acc.year,
      yearsAgo: currentYear - acc.year,
      userBookId: acc.userBookId,
      workId: acc.workId,
      bookTitle: acc.bookTitle,
      coverUrl: acc.coverUrl,
      coverFallbackColor: acc.coverFallbackColor,
      sessionDurationMinutes: acc.hasSession ? Math.round(acc.sessionDurationSeconds / 60) : null,
      sessionPagesRead: acc.hasPages ? acc.sessionPagesRead : null,
      started: acc.started,
      finished: acc.finished,
      ratingValue,
      journalEntries: cappedEntries,
      priority,
    });
  }

  const byYear = new Map<number, OnThisDayMemory[]>();
  for (const memory of memories) {
    const list = byYear.get(memory.year) ?? [];
    list.push(memory);
    byYear.set(memory.year, list);
  }

  const groups: OnThisDayYearGroup[] = [...byYear.entries()]
    // `yearsAgo < 1` — це сьогоднішня активність ПОТОЧНОГО року, не спогад "з попереднього
    // року або раніше" (п.1 ТЗ) — навмисно виключено, а не лише "малоймовірне" (щойно
    // записана сьогодні нотатка теж технічно збігається за місяцем+днем).
    .filter(([year]) => currentYear - year >= 1)
    .map(([year, yearMemories]) => ({
      year,
      yearsAgo: currentYear - year,
      memories: [...yearMemories].sort((a, b) => a.priority - b.priority || a.bookTitle.localeCompare(b.bookTitle)),
    }))
    .sort((a, b) => a.yearsAgo - b.yearsAgo);

  return {
    monthDay,
    groups,
    totalCount: groups.reduce((sum, g) => sum + g.memories.length, 0),
  };
}

/**
 * П.4–5 ТЗ: найближчий минулий рік із хоч одним спогадом → у ньому — найвищий пріоритет →
 * primary card на Home. `moreCount` — решта спогадів (усі роки, усі книги) для «Ще N спогадів»
 * (п.5 ТЗ). `null`, коли спогадів немає взагалі (п.19 ТЗ — Home тоді НІЧОГО не показує).
 */
export function selectHomePrimaryMemory(
  summary: OnThisDaySummary,
): { primary: OnThisDayMemory; moreCount: number; booksReadCount: number } | null {
  if (summary.groups.length === 0) return null;
  // `noUncheckedIndexedAccess`: індекс `[0]` типується як `T | undefined`, але інваріант тут
  // гарантований самою побудовою — `groups` щойно перевірено на непорожність, а кожна група
  // в `buildOnThisDaySummary` створюється лише з непорожнім `memories` (групу без жодного
  // спогаду просто не додають до `byYear`).
  const nearestGroup = summary.groups[0]!;
  const primary = nearestGroup.memories[0]!;
  return {
    primary,
    moreCount: summary.totalCount - 1,
    // П.14 ТЗ ("Цього дня ти читав 2 книги") — рахуємо лише в межах primary-року, не всієї
    // вибірки: secondary summary стосується того самого "цього дня", що й сама primary-картка.
    booksReadCount: nearestGroup.memories.length,
  };
}

/**
 * П.17 ТЗ (SPOILER SAFETY) — самодостатня, спрощена евристика Фази 3: повноцінний "spoiler-safe
 * mode" — окрема майбутня Фаза 12 ТЗ, якої ще немає. Тут: якщо конкретна книга спогаду ЗАРАЗ
 * активно читається/перечитується (`activePageByWorkId` містить її `workId` — заповнюється
 * викликаючим кодом лише зі статусів 'reading'/'rereading', книг "завершено" там немає), і
 * запис щоденника прив'язаний до сторінки, яка лежить ДАЛІ за поточний прогрес користувача —
 * текст цього запису ховається (позначається `hidden`, `text` очищується), решта картки
 * (сесія/старт/фініш) лишається видимою — сторінки самі по собі не "спойлер". Запис БЕЗ
 * прив'язаної сторінки ніколи не ховається (немає надійного способу визначити, чи він "далі",
 * п.15 ТЗ — "не вигадуй" там, де схема не дає точної відповіді).
 */
export function applySpoilerRules(
  summary: OnThisDaySummary,
  activePageByWorkId: Map<string, number>,
): OnThisDaySummary {
  if (activePageByWorkId.size === 0) return summary;

  const groups = summary.groups.map((group) => ({
    ...group,
    memories: group.memories.map((memory) => {
      const currentPage = activePageByWorkId.get(memory.workId);
      if (currentPage == null || memory.journalEntries.length === 0) return memory;

      let changed = false;
      const journalEntries = memory.journalEntries.map((entry) => {
        if (entry.page != null && entry.page > currentPage) {
          changed = true;
          return { ...entry, text: '', hidden: true };
        }
        return entry;
      });

      return changed ? { ...memory, journalEntries, spoilerHidden: true } : memory;
    }),
  }));

  return { ...summary, groups };
}
