import { formatMonthName } from './calendarFormat';
import { formatTimeAgo, getElapsedCalendarPeriod } from './elapsedPeriod';
import { pluralizeUk } from './pluralizeUk';
import { parseReadingMonthKey } from './readingCalendar';
import type { MemoryResurfacingCandidate } from './memoryResurfacing';
import type { JournalEntryType } from '@/types/journalEntry';

/**
 * POLYTSIA V1.7, Phase 9 — тексти спогадів (ТЗ модуль E §25, §26).
 *
 * ── ТОН ──────────────────────────────────────────────────────────────────────────────────────
 * Спокійно, тепло, фактологічно, memory-first. Речення КОНСТАТУЄ, що щось було, і на цьому
 * зупиняється.
 *
 * Заборонено (ТЗ §25): «Час повернутися!», «Не забудь!», «Ти давно цього не читав!», «Ми
 * сумували!», «Продовжуй читати!» — і взагалі наказовий спосіб. Тут фізично немає жодного рядка з
 * викличником і жодної фрази про бездіяльність: цей модуль не знає, коли людина востаннє читала,
 * бо `MemoryResurfacingCandidate` такого поля не має (`memoryResurfacing.ts`).
 *
 * ── CTA (ТЗ §26) ─────────────────────────────────────────────────────────────────────────────
 * Дія веде В СПОГАД, а не вимагає читати: «Згадати»/«Переглянути». Слово «Продовжити» тут
 * заборонене — воно належить активному читанню, і в ambient-спогаді читалось би як вимога.
 *
 * Окремо від `memoryResurfacing.ts` (де відбір) — щоб формулювання перевірялись тестом без UI й
 * жили в одному місці для ОБОХ поверхонь (Memory Hub і Home).
 */

const YEAR_FORMS = ['рік', 'роки', 'років'] as const;
const TIME_FORMS = ['раз', 'рази', 'разів'] as const;

export interface MemoryResurfacingCopy {
  title: string;
  /** Друга фраза — контекст спогаду. `null`, коли додати нема чого. */
  description: string | null;
  /** Підпис дії (ТЗ §26). */
  cta: string;
}

/**
 * «цю цитату» / «цю думку» / «цей момент» / «цей запис» — щоб речення не звучало як шаблон із
 * підставленим іменником. `question`/`theory`/`general` потрапляють сюди лише як обране
 * (`isMeaningfulJournalEntry`), і для них нейтральне «цей запис» — найчесніше.
 */
function journalMemoryNoun(entryType: JournalEntryType | null): string {
  switch (entryType) {
    case 'quote':
      return 'цю цитату';
    case 'thought':
      return 'цю думку';
    case 'moment':
      return 'цей момент';
    default:
      return 'цей запис';
  }
}

/** «Твій серпень 2026» / «Твій 2027 у читанні» (ТЗ §3D). */
function formatPeriodTitle(candidate: MemoryResurfacingCandidate): string {
  if (candidate.periodKind === 'year') return `Твій ${candidate.periodKey ?? ''} у читанні`.trim();
  const parsed = candidate.periodKey != null ? parseReadingMonthKey(candidate.periodKey) : null;
  if (!parsed) return 'Твій період у читанні';
  return `Твій ${formatMonthName(parsed.year, parsed.month).toLowerCase()} ${parsed.year}`;
}

/**
 * `now` приходить параметром, а не береться з годинника (той самий house-принцип, що й решта
 * `lib/*.ts` у V1.7): інакше «два роки тому» не можна було б перевірити тестом.
 */
export function formatMemoryResurfacingCopy(
  candidate: MemoryResurfacingCandidate,
  now: Date,
): MemoryResurfacingCopy {
  const timeAgo = formatTimeAgo(getElapsedCalendarPeriod(candidate.occurredAt, now.toISOString()));

  switch (candidate.kind) {
    case 'journal_memory':
      return {
        title: `${capitalize(timeAgo)} ти зберіг ${journalMemoryNoun(candidate.entryType)}`,
        description: candidate.bookTitle ? `Із «${candidate.bookTitle}».` : null,
        cta: 'Переглянути',
      };

    case 'book_memory':
      return {
        title: candidate.bookTitle
          ? `${capitalize(timeAgo)} ти завершив «${candidate.bookTitle}»`
          : `${capitalize(timeAgo)} ти завершив книгу`,
        description: 'Із твоєї читацької історії.',
        cta: 'Згадати',
      };

    case 'reading_relationship': {
      const count = candidate.finishedRunCount ?? 1;
      if (count >= 2) {
        return {
          title: candidate.bookTitle
            ? `До «${candidate.bookTitle}» ти вже повертався`
            : 'До цієї книги ти вже повертався',
          description: `Ти завершував її ${count} ${pluralizeUk(count, TIME_FORMS)}.`,
          cta: 'Згадати',
        };
      }
      const years = getElapsedCalendarPeriod(candidate.occurredAt, now.toISOString()).years;
      return {
        title: candidate.bookTitle
          ? `Минуло ${years} ${pluralizeUk(years, YEAR_FORMS)} від твого першого читання «${candidate.bookTitle}»`
          : `Минуло ${years} ${pluralizeUk(years, YEAR_FORMS)} від першого читання`,
        description: null,
        cta: 'Згадати',
      };
    }

    case 'past_period':
      return {
        title: formatPeriodTitle(candidate),
        description: 'Із твоєї читацької історії.',
        cta: 'Переглянути',
      };
  }
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}
