/**
 * POLYTSIA V1.6, Фаза 3 («Цей день у твоєму читанні») — похідна (derived) модель, як і
 * `ActivityEvent` (`src/types/activityEvent.ts`): жодної нової persistent-таблиці, жодного
 * власного стану для запису/синхронізації. `OnThisDayMemory` — це один "спогад" на комбінацію
 * (рік, книга): усі події одного дня в одному й тому ж календарному році для однієї книги
 * (сесія читання, старт/фініш, нотатки/цитати) об'єднуються в ОДНУ картку, а не показуються як
 * кілька окремих — саме так побудований приклад у ТЗ ("47 хв читання • 32 сторінки" +
 * "Тоді ти зберіг цю думку" одночасно на одній картці).
 */

/** Джерело однієї "сирої" історичної події, з якої складається спогад — прямий відповідник
 * п.2 ТЗ (без окремого типу "rating": оцінка не самостійна подія, а збагачення картки
 * "завершено", п.7 ТЗ — "rating, якщо він прив'язаний до завершення книги"). */
export type OnThisDaySource = 'session' | 'started' | 'finished' | 'note' | 'quote';

/** Короткий preview одного запису щоденника (нотатки чи цитати) на картці спогаду. `page` —
 * лише для spoiler-евристики (п.17 ТЗ, розділ 3 нижче), не показується користувачу напряму.
 * `hidden` проставляється ПІЗНІШЕ, окремим кроком (`applySpoilerRules`), не тут. */
export interface OnThisDayJournalPreview {
  id: string;
  kind: 'note' | 'quote';
  entryType: string;
  text: string;
  isFavorite: boolean;
  page: number | null;
  hidden?: boolean;
}

/** Один спогад: конкретна книга в конкретному минулому році, у цю саму календарну дату. */
export interface OnThisDayMemory {
  /** `${year}:${workId}` — стабільний у межах одного обчислення ключ (React `key`, не
   * persistent id — цей запис ніде не зберігається). */
  key: string;
  year: number;
  yearsAgo: number;
  userBookId: string;
  workId: string;
  bookTitle: string;
  coverUrl: string | null;
  coverFallbackColor: string | null;
  /** Сумарно за ВСІ завершені сесії цієї книги цього дня цього року (п.14 ТЗ — "кілька сесій
   * одного дня" не мають створювати кілька карток). `null`, якщо сесій не було. */
  sessionDurationMinutes: number | null;
  sessionPagesRead: number | null;
  started: boolean;
  finished: boolean;
  /** Лише коли `finished === true` (п.7 ТЗ — рейтинг прив'язаний саме до завершення). */
  ratingValue: number | null;
  /** Відсортовано за пріоритетом (favorite → moment → thought → quote → інше, п.8 ТЗ), обрізано
   * до `JOURNAL_PREVIEW_LIMIT_PER_MEMORY` (`src/lib/onThisDay.ts`). */
  journalEntries: OnThisDayJournalPreview[];
  /** 1 (найважливіше — "завершено") … 5 (найменш важливе) — п.4 ТЗ, визначає, яка картка
   * серед кількох книг одного року стає primary на Home. */
  priority: number;
  /** Чи ця конкретна книга зараз активно читається/перечитується користувачем — заповнюється
   * ПІЗНІШЕ, разом зі spoiler-евристикою (не в `buildOnThisDaySummary`, щоб pure-функція
   * побудови спогадів лишалась незалежною від "живого" стану бібліотеки). */
  spoilerHidden?: boolean;
}

export interface OnThisDayYearGroup {
  year: number;
  yearsAgo: number;
  /** Відсортовано за `priority` зростанням (найважливіше — перше). */
  memories: OnThisDayMemory[];
}

export interface OnThisDaySummary {
  /** `'MM-dd'` — календарна дата (місяць+день), за якою відбирались усі спогади. */
  monthDay: string;
  /** Відсортовано за `yearsAgo` зростанням (найближчий минулий рік — перший), п.4 ТЗ. */
  groups: OnThisDayYearGroup[];
  totalCount: number;
}
