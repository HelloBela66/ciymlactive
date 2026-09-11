import { computeProgressPercent } from './progressPercent';

/**
 * POLYTSIA V1.6, Фаза 9-10 («Персонажі» → PERSONAL LORE) — чиста доменна логіка
 * (`docs/PERSONAL_LORE.md` §Архітектура), той самий house-патерн, що й `bookCapsule.ts`: жодного
 * `new Date()`/SQL/React усередині.
 *
 * На відміну від `pre_reading_reflection`/`book_capsule`, тут НЕМАЄ обмеження за статусом книги
 * (`canCreateCapsule`-еквівалент): персонажів можна додавати й редагувати незалежно від того,
 * читається книга зараз, уже прочитана, чи ще навіть не почата (ТЗ не ставить такої умови —
 * нотатка про діючу особу твору доречна в будь-який момент).
 */

/** Порожнє (чи лише пробіли) ім'я — не валідне; той самий trim-підхід, що й `bookCapsule.ts`. */
export function trimOrNull(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Єдина обов'язкова умова — непорожнє ім'я (опис/сторінка — необов'язкові, ТЗ не вимагає
 * жодного іншого поля для збереження). */
export function validateLoreEntityName(name: string): boolean {
  return trimOrNull(name) != null;
}

/** Нормалізує ім'я перед збереженням — trim, БЕЗ перетворення порожнього рядка на `null` (на
 * відміну від `normalizeCapsuleText`): ім'я обов'язкове, порожнє після trim — відхиляється
 * `validateLoreEntityName` ще до виклику цієї функції, а не тихо конвертується. */
export function normalizeLoreEntityName(name: string): string {
  return name.trim();
}

/** Опис — необов'язкове поле, той самий "порожній рядок → `null`" підхід, що й `normalizeCapsuleText`. */
export function normalizeLoreEntityDescription(value: string | null): string | null {
  return trimOrNull(value);
}

/**
 * «Уперше з'явився» відсоток книги — рахується від сторінки, яку вказав користувач, а не
 * вводиться окремим полем форми (`015_lore_entity.ts` п.5) — той самий `computeProgressPercent`,
 * що й `ReadingExperienceTimeline`/recap. `null`, коли сторінка чи обсяг книги невідомі.
 */
export function computeFirstSeenProgress(
  firstSeenPage: number | null,
  pageCount: number | null,
): number | null {
  return computeProgressPercent(firstSeenPage, pageCount);
}
