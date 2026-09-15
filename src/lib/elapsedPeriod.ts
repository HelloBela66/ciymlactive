import { differenceInCalendarDays, differenceInMonths } from 'date-fns';
import { pluralizeUk } from './pluralizeUk';

/**
 * POLYTSIA V1.7, Phase 9 — ОДИН розрахунок «скільки минуло», багато формулювань (ТЗ модуль E §17).
 *
 * ── ЩО САМЕ БУЛО НЕ ТАК ──────────────────────────────────────────────────────────────────────
 * До цієї фази «скільки минуло» рахували ДВІ функції з різною семантикою місяця:
 *
 *   `recall.ts#formatTimeSinceFinished`  → `differenceInMonths`          («3 місяці тому»)
 *   `readingMilestoneCopy.ts#formatReturnGap` → `differenceInCalendarMonths` («через 3 місяці»)
 *
 * На тих самих двох датах вони розходились. 15 січня → 14 лютого: `differenceInMonths` дає 0
 * (повного місяця ще не минуло), `differenceInCalendarMonths` дає 1 (січень і лютий — різні
 * календарні місяці). Тобто `formatReturnGap` казав «через 1 місяць» там, де минуло 30 днів —
 * ПОПРИ те, що його власний докблок обіцяв протилежне («з 15 січня по 14 лютого чесно читається
 * як менш ніж місяць»). Це був мій недогляд у Phase 8, а не свідомий вибір: коментар описував
 * поведінку `differenceInMonths`, а код викликав `differenceInCalendarMonths`.
 *
 * Канонічним обрано `differenceInMonths` (кількість ПОВНИХ місяців, чутлива до дня) — той бік,
 * що вже був правильно обґрунтований у `recall.ts` і якого очікував докблок `formatReturnGap`.
 *
 * ── ЩО ТУТ СВІДОМО НЕ ЗРОБЛЕНО (ТЗ §17) ──────────────────────────────────────────────────────
 * Формулювання НЕ зведені в одну функцію. «3 місяці тому» і «через 3 місяці» — різні речення з
 * різних поверхонь (Recall дивиться назад від завершення книги; Book Relationship Timeline міряє
 * проміжок МІЖ двома проходами), і склеювати їх прапорцем на кшталт `direction: 'ago' | 'gap'`
 * означало б зробити copy налаштуванням. Спільним стає лише РОЗРАХУНОК; текст лишається там, де
 * живе його поверхня.
 *
 * Модуль чистий у house-сенсі: жодного `new Date()` усередині — обидві межі приходять параметром.
 */

const DAY_FORMS = ['день', 'дні', 'днів'] as const;
const MONTH_FORMS = ['місяць', 'місяці', 'місяців'] as const;
const YEAR_FORMS = ['рік', 'роки', 'років'] as const;

export interface ElapsedCalendarPeriod {
  /** Кількість ПОВНИХ місяців між межами (`differenceInMonths`). Ніколи не від'ємна. */
  totalMonths: number;
  /** `totalMonths` розкладені на роки й залишок місяців — для «2 роки 4 місяці». */
  years: number;
  months: number;
  /**
   * Календарні дні між межами. Може бути ≤ 0, коли `to` не пізніший за `from` (однаковий день,
   * або зворотний порядок дат через пошкоджені дані) — формати нижче трактують це як «сьогодні»,
   * а не як від'ємну тривалість.
   */
  days: number;
}

/**
 * ЄДИНЕ джерело розрахунку для всіх «скільки минуло» у V1.7 (ТЗ §17).
 *
 * `totalMonths` приводиться до невід'ємного: зворотний порядок дат — це зіпсовані дані, і
 * «-3 місяці тому» було б гіршою відповіддю, ніж «сьогодні». `days` навмисно НЕ приводиться —
 * формати розрізняють «той самий день» і «майбутнє» однаково («сьогодні»), але сирого значення
 * не втрачають для викликів, яким воно потрібне.
 *
 * Календарна семантика дня — та сама, що в усьому V1.7 (ТЗ §18): `date-fns` рахує в поясі
 * рушія, тобто в локальному календарі пристрою, а не в UTC (`readingCalendar.ts`).
 */
export function getElapsedCalendarPeriod(fromIso: string, toIso: string): ElapsedCalendarPeriod {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const totalMonths = Math.max(0, differenceInMonths(to, from));
  return {
    totalMonths,
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days: differenceInCalendarDays(to, from),
  };
}

/**
 * «сьогодні» / «11 днів тому» / «3 місяці тому» / «2 роки тому» — погляд НАЗАД від події.
 *
 * Від року й далі — округлені роки без залишку («1 рік тому» і для 12, і для 14 місяців):
 * «1 рік 2 місяці тому» — це точність, якої спогад не потребує. Поведінка збережена один в один
 * із дофазового `recall.ts#formatTimeSinceFinished`, який лишається тонкою обгорткою над цією
 * функцією (ТЗ §17: один розрахунок, різні формати — не «одна функція на всі фрази»).
 */
export function formatTimeAgo(period: ElapsedCalendarPeriod): string {
  if (period.totalMonths >= 12) {
    return `${period.years} ${pluralizeUk(period.years, YEAR_FORMS)} тому`;
  }
  if (period.totalMonths >= 1) {
    return `${period.totalMonths} ${pluralizeUk(period.totalMonths, MONTH_FORMS)} тому`;
  }
  if (period.days <= 0) return 'сьогодні';
  return `${period.days} ${pluralizeUk(period.days, DAY_FORMS)} тому`;
}

/**
 * «через 5 місяців» / «через 2 роки» / «через 2 роки 4 місяці» — проміжок МІЖ двома подіями
 * (ТЗ модуль D §8: повернення до книги міряється людською тривалістю, ніколи «через 854 дні»).
 *
 * `null`, коли не минуло й місяця: «через 3 дні» — це не повернення через роки, і робити з нього
 * подію не варто. Саме тут жила розбіжність, описана вгорі модуля: тепер поріг «місяць» означає
 * ПОВНИЙ місяць, тож 15 січня → 14 лютого чесно дає `null`.
 */
export function formatElapsedGap(period: ElapsedCalendarPeriod): string | null {
  if (period.totalMonths < 1) return null;
  if (period.years === 0) {
    return `через ${period.months} ${pluralizeUk(period.months, MONTH_FORMS)}`;
  }
  if (period.months === 0) {
    return `через ${period.years} ${pluralizeUk(period.years, YEAR_FORMS)}`;
  }
  return `через ${period.years} ${pluralizeUk(period.years, YEAR_FORMS)} ${period.months} ${pluralizeUk(period.months, MONTH_FORMS)}`;
}

