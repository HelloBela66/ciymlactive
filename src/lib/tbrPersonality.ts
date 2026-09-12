import { differenceInCalendarDays, parseISO } from 'date-fns';
import { pluralizeUk } from './pluralizeUk';

/**
 * «TBR Personality / Anti-TBR» (ТЗ Фази 17, TBR PERSONALITY / ANTI-TBR, `docs/TBR_PERSONALITY.md`)
 * — ТЗ: "Покращ TBR Reality Check. Додай playful, але respectful insights." На відміну від
 * Фази 16 (де ТЗ явно казав "Не видаляй existing logic" — окрема паралельна фіча), тут ТЗ
 * буквально каже "покращ" — тож це РОЗШИРЕННЯ вже наявного `useTbrRealityCheck`/`app/tbr.tsx`
 * (Milestone 6), не нова паралельна фіча. Уся нова логіка тут — чисті функції над уже
 * зібраними даними (жодного SQL/React), той самий принцип, що й `readingProfile.ts`/
 * `onePicker.ts`. Явних `MIN_*`-порогів вибірки тут навмисно НЕМАЄ (на відміну від Reading
 * Profile/Fingerprint) — ці речення не є статистичним висновком із ризиком хибного сигналу на
 * малій вибірці, а точним описом самого списку "Хочу прочитати" (скільки книг, яка з них
 * найдовше чекає) — сам список уже показує лише коли він непорожній
 * (`app/tbr.tsx`'s `EmptyState`), інших порогів тут не потрібно.
 */

const BOOK_FORMS = ['книга', 'книги', 'книг'] as const;
const DAY_FORMS = ['день', 'дні', 'днів'] as const;

export interface TbrWaitingBook {
  userBookId: string;
  workId: string;
  title: string;
  /** ISO-рядок `user_book.added_at` — КОЛИ книгу вперше додано (не `updated_at`, який
   * зсувається за кожної дрібної зміни книги, наприклад зміни полиці чи улюбленого). */
  addedAt: string;
}

export interface OldestWaitingInsight {
  userBookId: string;
  workId: string;
  title: string;
  daysWaiting: number;
}

/**
 * Книга з найранішим `addedAt` серед списку очікування — ISO-рядки з `nowIso()` лексикографічно
 * порівнюються коректно (той самий прийом, що й `computeDateRange` у `bookStats.ts`), тож просте
 * порівняння рядків без парсингу дат для самого ПОШУКУ мінімуму; парсинг (`parseISO`) потрібен
 * лише для фінального обчислення кількості днів.
 */
export function findOldestWaitingBook(books: TbrWaitingBook[], now: Date): OldestWaitingInsight | null {
  if (books.length === 0) return null;
  const oldest = books.reduce((min, book) => (book.addedAt < min.addedAt ? book : min));
  const daysWaiting = Math.max(0, differenceInCalendarDays(now, parseISO(oldest.addedAt)));
  return { userBookId: oldest.userBookId, workId: oldest.workId, title: oldest.title, daysWaiting };
}

/** ТЗ-приклад буквально: «41 книга чекає на тебе.» — дієслово узгоджується з числом ЗА ТИМ
 * САМИМ mod10/mod100-правилом, що й іменник (`pluralizeUk`), а не лише "однина рівно для 1":
 * 41 закінчується на 1 (і не 11), тож бере однину — "чекає", а не "чекають", попри те, що
 * число саме по собі не дорівнює 1. Проста перевірка `count === 1` була б граматично
 * неправильною вже на цьому самому прикладі з ТЗ. */
export function formatBookCountSentence(count: number): string {
  const verb = pluralizeUk(count, ['чекає', 'чекають', 'чекають']);
  return `${count} ${pluralizeUk(count, BOOK_FORMS)} ${verb} на тебе.`;
}

/** ТЗ-приклад буквально: «Найдовше чекає: …» */
export function formatOldestWaitingSentence(title: string): string {
  return `Найдовше чекає: «${title}».`;
}

/** ТЗ-приклад буквально: «Додано 427 днів тому.» — 0 днів (додано сьогодні) навмисно окрема,
 * не менш дружня фраза замість "Додано 0 днів тому", яка звучала б як помилка форматування. */
export function formatDaysWaitingSentence(days: number): string {
  if (days <= 0) return 'Додано сьогодні.';
  return `Додано ${days} ${pluralizeUk(days, DAY_FORMS)} тому.`;
}
