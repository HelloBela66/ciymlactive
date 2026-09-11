import { addMonths, addYears } from 'date-fns';
import type { CapsuleReopenOption } from '@/types/bookCapsule';
import type { UserBookStatus } from '@/types/userBook';

/**
 * POLYTSIA V1.6, Фаза 4 («Капсула книги») — уся доменна логіка (валідація, дата нагадування,
 * прийнятність книги) тут, чистими функціями без SQL/React (той самий house-патерн, що й
 * `onThisDay.ts`/`finishPrediction.ts`: `referenceDate`/`createdAt` — явний параметр, жодного
 * `new Date()` усередині).
 */

/** П.39 ТЗ: trim, порожній рядок (чи лише пробіли) — це "не заповнено", не валідний контент. */
function trimOrNull(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface CapsuleContentInput {
  lastingThought: string | null;
  oneSentenceMemory: string | null;
  favoriteCharacterText: string | null;
  journalEntryId: string | null;
}

/**
 * П.14 ТЗ: порожня капсула заборонена — потрібне хоча б одне з чотирьох "змістовних" полів
 * (`reopenAt` сам по собі — НЕ контент, навмисно тут відсутній). Той самий trim-підхід, що й
 * `favoriteCharacterText`/`lastingThought`/`oneSentenceMemory` нижче при збереженні — порожні
 * після trim рядки не рахуються.
 */
export function validateCapsuleContent(input: CapsuleContentInput): boolean {
  return (
    trimOrNull(input.lastingThought) != null ||
    trimOrNull(input.oneSentenceMemory) != null ||
    trimOrNull(input.favoriteCharacterText) != null ||
    input.journalEntryId != null
  );
}

/** Нормалізує текстове поле капсули перед збереженням (п.39 ТЗ — trim, порожній → `null`). Те
 * саме правило застосовується до `lastingThought`/`oneSentenceMemory`/`favoriteCharacterText`
 * в репозиторії/хуках перед `create`/`update`. */
export function normalizeCapsuleText(value: string | null): string | null {
  return trimOrNull(value);
}

/**
 * П.9 ТЗ: дата нагадування рахується від дати СТВОРЕННЯ капсули (не від дати завершення книги
 * — користувач міг завершити книгу 1 січня, а капсулу створити 10 січня, і саме 10 січня —
 * момент свідомого рішення "нагадай мені через N"). Той самий якір лишається й при
 * РЕДАГУВАННІ капсули пізніше (зміна `reopenOption` через кілька місяців): `calculateCapsuleReopenAt`
 * завжди приймає ОРИГІНАЛЬНИЙ `createdAt` капсули, а не момент редагування — інакше дата
 * "пливла" б щоразу, коли користувач лише поправив текст, і поведінка стала б залежною від
 * того, коли саме відбулось редагування (докладніше — `docs/BOOK_CAPSULES.md`).
 *
 * `date-fns#addMonths`/`addYears` — той самий calendar-correct arithmetic, що вже усталений у
 * `finishPrediction.ts` (`addDays`): місяць/рік, а не фіксовані 90/180/365 днів (п.37 ТЗ), з
 * природним clamp на кінець місяця для дат на зразок 31 серпня (п.37) і 29 лютого (п.38 —
 * `addYears` дає 28 лютого наступного невисокосного року, той самий "розумний" leap-year
 * clamp, який ТЗ явно рекомендує).
 */
export function calculateCapsuleReopenAt(option: CapsuleReopenOption, createdAt: Date): string | null {
  switch (option) {
    case '3_months':
      return addMonths(createdAt, 3).toISOString();
    case '6_months':
      return addMonths(createdAt, 6).toISOString();
    case '1_year':
      return addYears(createdAt, 1).toISOString();
    case 'none':
      return null;
  }
}

/** П.33 ТЗ: за замовчуванням капсула створюється лише для `finished` книг — НЕ для DNF (п.33,
 * власна DNF-концепція вже існує окремо) і НЕ для `rereading` (п.13/30 — перечитування поки
 * не має надійного способу прив'язати нову капсулу до нового прочитання, тож нова капсула під
 * час активного перечитування свідомо не пропонується; вже створена капсула лишається
 * доступною для перегляду/редагування незалежно від поточного статусу книги). */
export function canCreateCapsule(status: UserBookStatus): boolean {
  return status === 'finished';
}

/** П.23 ТЗ (підготовка до майбутньої Фази Recall): капсула "due", коли `reopenAt` заданий і
 * вже настав відносно `referenceDate`. */
export function isCapsuleDue(capsule: { reopenAt: string | null }, referenceDate: Date): boolean {
  return capsule.reopenAt != null && capsule.reopenAt <= referenceDate.toISOString();
}
