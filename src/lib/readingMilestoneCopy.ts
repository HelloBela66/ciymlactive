import { differenceInCalendarMonths } from 'date-fns';
import { pluralizeUk } from './pluralizeUk';
import type { ReadingMilestone } from './readingMilestones';

/**
 * POLYTSIA V1.7, Phase 8 — тексти віх (ТЗ V1.7 §15, §16, §38).
 *
 * ── ТОН ──────────────────────────────────────────────────────────────────────────────────────
 * Фактологічно, тепло, спокійно. Віха констатує: «це стало частиною твоєї читацької історії».
 * Заборонено: «Неймовірно!», «Ти чемпіон!», «Так тримати!», «Не зупиняйся!», «Наступна ціль —
 * 100 книг!» і будь-який наказовий спосіб.
 *
 * ── ЖОДНОЇ НАСТУПНОЇ ЦІЛІ (ТЗ §16) ───────────────────────────────────────────────────────────
 * Тут фізично немає функції, яка б рахувала «скільки лишилось до наступної віхи», і не буде:
 * `50 / 100` чи «до наступної віхи 50 книг» перетворили б спогад на прогрес-бар. Віха дивиться
 * назад.
 *
 * Окремо від `readingMilestones.ts` (де самі обчислення) — щоб текст можна було перевірити
 * тестом, не піднімаючи UI, і щоб формулювання жили в ОДНОМУ місці для всіх поверхонь
 * (Reading Life, Recap, Home).
 */

const HOUR_FORMS = ['година', 'години', 'годин'] as const;
const YEAR_FORMS = ['рік', 'роки', 'років'] as const;
const MONTH_FORMS = ['місяць', 'місяці', 'місяців'] as const;

/**
 * Порядковий числівник жіночого роду для «книга»: 10-та, 25-та, 50-та. Усі пороги
 * (`FINISHED_BOOK_MILESTONES`) закінчуються на 0 або 5, тож форма завжди «-та» — окремої таблиці
 * відмінювання не потрібно, і вигадувати її «на майбутнє» тут не варто: новий поріг усе одно
 * потребуватиме свідомого рішення, а не автоматичного правила.
 */
function ordinalBookLabel(value: number): string {
  return value === 1 ? 'Перша' : `${value}-та`;
}

export interface MilestoneCopy {
  title: string;
  /** Друга фраза — контекст події. `null`, коли книга невідома й додати нема чого. */
  description: string | null;
}

/**
 * `bookTitle` — назва книги, під час/через яку віху перетнуто. Може бути `null` (ювілей ні з якою
 * книгою не пов'язаний; книга могла фізично зникнути з БД) — тоді опис просто коротший, а не
 * зламаний рядок із «undefined».
 */
export function formatMilestoneCopy(
  milestone: ReadingMilestone,
  bookTitle: string | null,
): MilestoneCopy {
  switch (milestone.kind) {
    case 'finished_books': {
      const value = milestone.value ?? 0;
      if (value === 1) {
        return {
          title: 'Перша завершена книга',
          description: bookTitle
            ? `Твоя читацька історія у «Полиці» почалася з «${bookTitle}».`
            : 'Так почалася твоя читацька історія у «Полиці».',
        };
      }
      return {
        title: `${ordinalBookLabel(value)} завершена книга`,
        description: bookTitle
          ? `Це ${value}-та книга у твоїй читацькій історії — «${bookTitle}».`
          : `Це ${value}-та книга у твоїй читацькій історії.`,
      };
    }

    case 'reading_hours': {
      const hours = milestone.value ?? 0;
      return {
        title: `${hours} ${pluralizeUk(hours, HOUR_FORMS)} із книгами`,
        description: bookTitle
          ? `Цю позначку ти перетнув під час читання «${bookTitle}».`
          : 'Стільки часу ти вже провів із книгами.',
      };
    }

    case 'first_reread':
      return {
        title: 'Перше перечитування',
        description: bookTitle
          ? `Уперше ти повернувся до книги, яку вже дочитав, — «${bookTitle}».`
          : 'Уперше ти повернувся до книги, яку вже дочитав.',
      };

    case 'reading_life_anniversary': {
      const years = milestone.value ?? 0;
      return {
        title:
          years === 1
            ? 'Рік твоєї читацької історії'
            : `${years} ${pluralizeUk(years, YEAR_FORMS)} твоєї читацької історії`,
        description: null,
      };
    }
  }
}

/**
 * «через 2 роки», «через 2 роки 4 місяці», «через 5 місяців» — ТЗ §8: повернення до книги
 * вимірюється людською тривалістю, а не «через 854 дні».
 *
 * Рахується між ПРОХОДАМИ (`ReadingRun`), а не між подіями бібліотеки. Місяці — календарні
 * (`differenceInCalendarMonths`), тож «з 15 січня по 14 лютого» чесно читається як «менш ніж
 * місяць», а не округлюється вгору.
 *
 * `null`, коли проміжок менший за місяць: «через 3 дні» — це не повернення через роки, і робити з
 * нього подію не варто.
 */
export function formatReturnGap(fromIso: string, toIso: string): string | null {
  const totalMonths = differenceInCalendarMonths(new Date(toIso), new Date(fromIso));
  if (totalMonths < 1) return null;

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  if (years === 0) return `через ${months} ${pluralizeUk(months, MONTH_FORMS)}`;
  if (months === 0) return `через ${years} ${pluralizeUk(years, YEAR_FORMS)}`;
  return `через ${years} ${pluralizeUk(years, YEAR_FORMS)} ${months} ${pluralizeUk(months, MONTH_FORMS)}`;
}
