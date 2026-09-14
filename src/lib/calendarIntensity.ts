import { sumSessionMinutes, type SessionMinutesInput } from './readingAggregates';

/**
 * Календар 2.0 (POLYTSIA V1.6.1, Фаза 19, `docs/CALENDAR_2_0.md`) — чисті функції для двох
 * правил дня-клітинки: "які книги й у якому порядку показати" (primary/secondary/+N) і
 * "наскільки насичений день читанням" (intensity). Той самий house-патерн, що й
 * `calendarGrid.ts`/`spoilerSafe.ts`/`readingAggregates.ts`: жодного `new Date()`/SQL/React
 * тут — уже завантажений (одним запитом на весь видимий діапазон, `ReadingSessionRepository.
 * listStartedBetween`) список сесій ОДНОГО дня передається як звичайний масив.
 *
 * **ВІЗУАЛЬНА КОМПОЗИЦІЯ КАЛЕНДАРЯ (пост-Фаза 19)** — `rankBooksForDay` замінює колишню
 * "лише переможець" `selectPrimaryBookForDay` на повне ранжування всіх книг дня, потрібне для
 * cover-стеку (primary+secondary+"+N", `CalendarBookStack`). Разом з ранжуванням ЗМІНЕНО й
 * сам tie-break ланцюжок (свідоме, задокументоване рішення цієї фази, не випадковість):
 *
 * - СТАРИЙ (до цієї фази): сума хвилин → рівність → перемагає книга з РАНІШЕ розпочатою
 *   сесією дня.
 * - НОВИЙ (ця фаза, ТЗ "Візуальна композиція"): сума хвилин → сума сторінок → кількість
 *   сесій → НАЙНОВІША активність дня (а не найраніша).
 *
 * Два нові проміжні рівні (сторінки, сесії) — заради стабільнішого й "чеснішого" вибору, коли
 * дві книги того дня мають однакову суму хвилин (наприклад, дві короткі сесії по 10хв різних
 * книг): сторінки — точніший сигнал реального прогресу за рівний час, кількість сесій —
 * наступний сигнал "з якою книгою повертались частіше". Останній рівень (найновіша активність,
 * не найраніша) — свідома зміна духу тай-брейка: "яка книга останньою була в руках сьогодні"
 * ближче до природної інтуїції "що я читав/читаю зараз", ніж "яку почав раніше". Ужиток
 * СТАРОГО tie-break (лише сума хвилин → найраніший старт) існував лише один рівень і жодного
 * зовнішнього UI явно не документував tie-break як продуктове рішення — зміна тут безпечна й
 * задокументована, а не мовчазна (докладніше — `docs/CALENDAR_2_0.md` §"Visual Day
 * Composition").
 */

export interface DaySessionSummary {
  userBookId: string;
  durationSeconds: number | null;
  /** Для суми сторінок книги за день (tie-break рівень 2) — той самий вираз, що й
   * `sumSessionPages`/`SessionPagesInput`, тут рахований по групах (на книгу), а не плоским
   * підсумком. */
  startPage: number;
  endPage: number | null;
  /** Для tie-break рівня 4 (найновіша активність) — той самий сенс, що й раніше, лише тепер
   * шукаємо МАКСИМУМ (найпізніший старт сесії книги за день), а не мінімум. */
  startedAt: string;
}

/** Одна книга дня з повним підсумком (для ранжування й для показу в UI — "2 книги · 1 год
 * 12 хв", `ReadingDayBookCard` тощо). */
export interface RankedDayBook {
  userBookId: string;
  totalMinutes: number;
  totalPages: number;
  sessionCount: number;
  /** Найпізніший `startedAt` серед сесій ЦІЄЇ книги за день — tie-break рівень 4. */
  latestActivityAt: string;
}

/**
 * ПОВНЕ РАНЖУВАННЯ книг дня — найкраща книга (майбутній "primary") першою, tie-break
 * ланцюжок: сума хвилин → сума сторінок → кількість сесій → найновіша активність (усі —
 * спадання, "більше"/"пізніше" перемагає). Книги, що лишаються рівними за всіма чотирма
 * рівнями одночасно (вкрай рідкісний збіг) — впорядковуються за порядком першої появи у
 * вхідному масиві (стабільне сортування ES2019+, детерміновано, хоч і без продуктового сенсу
 * на цьому останньому кроці — такого практичного збігу очікувати не варто).
 *
 * Порожній масив сесій → порожній результат (не `null` — на відміну від колишньої
 * `selectPrimaryBookForDay`, тут немає "одного переможця", є список, і порожній список — це
 * вже коректна, самодостатня відповідь "книг не було").
 */
export function rankBooksForDay(sessions: DaySessionSummary[]): RankedDayBook[] {
  const byBook = new Map<string, RankedDayBook>();

  for (const session of sessions) {
    const minutes = Math.round((session.durationSeconds ?? 0) / 60);
    const pages = Math.max(0, session.endPage != null ? session.endPage - session.startPage : 0);
    const existing = byBook.get(session.userBookId);
    if (existing) {
      existing.totalMinutes += minutes;
      existing.totalPages += pages;
      existing.sessionCount += 1;
      if (session.startedAt > existing.latestActivityAt) existing.latestActivityAt = session.startedAt;
    } else {
      byBook.set(session.userBookId, {
        userBookId: session.userBookId,
        totalMinutes: minutes,
        totalPages: pages,
        sessionCount: 1,
        latestActivityAt: session.startedAt,
      });
    }
  }

  return [...byBook.values()].sort((a, b) => {
    if (b.totalMinutes !== a.totalMinutes) return b.totalMinutes - a.totalMinutes;
    if (b.totalPages !== a.totalPages) return b.totalPages - a.totalPages;
    if (b.sessionCount !== a.sessionCount) return b.sessionCount - a.sessionCount;
    // ISO 8601 рядки (той самий формат по всій БД) порівнюються лексикографічно так само, як
    // хронологічно — без потреби парсити в `Date` заради самого порівняння.
    if (b.latestActivityAt !== a.latestActivityAt) return b.latestActivityAt > a.latestActivityAt ? 1 : -1;
    return 0;
  });
}

/**
 * ВІЗУАЛЬНА КОМПОЗИЦІЯ (пост-Фаза 19) — резолвить перші (максимум) два `userBookId`
 * ранжування в реальні об'єкти книги (`byId`), для cover-стеку дня (місяць-сітка й Day
 * Details). Ущільнює В МЕЖАХ переданої пари: якщо перший `userBookId` не знайдений (наприклад,
 * книга м'яко видалена з бібліотеки ПІСЛЯ того, як сесія вже була записана), другий природно
 * "підіймається" на позицію `primary`, а не лишає видиму "діру" (`primary: null, secondary:
 * <книга>`) — компонент cover-стеку так і так очікує "спереду щось є чи нічого", не "спереду
 * порожньо, а позаду щось є". Але ЗА МЕЖІ переданої пари НЕ виходить: якщо ОБИДВІ передані
 * `userBookId` не знайдені, а книга третього місця в повному ранжуванні (`rankBooksForDay`)
 * існує — вона тут не з'явиться (виклик передає лише перші два id, книжкові деталі третього й
 * далі взагалі не завантажуються) — той самий "не можу знайти в уже завантаженому наборі → не
 * показую, без ускладнення batching-запиту заради рідкісного краю" принцип, що й
 * `CoverThumbnail`'s `onError`-фолбек. Узагальнена (generic), не прив'язана до конкретного
 * доменного типу — легко тестується без жодного імпорту `UserBookWithDetails`.
 */
export function compactPrimarySecondary<T>(
  topTwoUserBookIds: string[],
  byId: Map<string, T>,
): { primary: T | null; secondary: T | null } {
  const resolved = topTwoUserBookIds.map((id) => byId.get(id)).filter((item): item is T => item !== undefined);
  return { primary: resolved[0] ?? null, secondary: resolved[1] ?? null };
}

/**
 * PRIMARY BOOK RULE — тонка обгортка над `rankBooksForDay` (перший елемент ранжування, чи
 * `null`, якщо сесій нема) — та сама сигнатура/семантика, що й до цієї фази, для викликів,
 * яким потрібна лише "головна" книга дня, без повного стеку (наразі — жодного, залишено для
 * симетрії з `computeDayIntensity`/`sumMinutesForDay` нижче й на випадок майбутнього
 * односкладного виклику).
 */
export function selectPrimaryBookForDay(sessions: DaySessionSummary[]): string | null {
  return rankBooksForDay(sessions)[0]?.userBookId ?? null;
}

/** 0 = без читання, 1-3 = зростаюча інтенсивність. Значення — індекс у "сходинку" непрозорості
 * UI малює поверх `theme.colors.accent` (`app/(tabs)/calendar.tsx`) — свідомо БЕЗ нових
 * кольорів дизайн-токенів (`src/design/tokens.ts` — лише один "зелений" акцент на всю палітру,
 * докладніше `docs/CALENDAR_2_0.md`). */
export type DayIntensityLevel = 0 | 1 | 2 | 3;

/**
 * Пороги (хвилини за день) — продуктове рішення Фази 19, лишені БЕЗ ЗМІН цією фазою (Візуальна
 * композиція): вже тестовані/усталені, ТЗ цієї фази прямо просить перевикористати наявні
 * пороги, а не вигадувати нові поверх ілюстративних чисел самого ТЗ. "низька" (1) — до пів
 * години (коротка сесія чи перерваний "уривок"), "середня" (2) — до півтори години (типова
 * повноцінна сесія), "висока" (3) — довше (кілька сесій чи довге занурення).
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
