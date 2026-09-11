import type { UserBookStatus } from '@/types/userBook';
import type { PreReadingReflection } from '@/types/preReadingReflection';

/**
 * POLYTSIA V1.6, Фаза 6 («До/Після») — уся доменна логіка чистими функціями без SQL/React, той
 * самий house-патерн, що й `bookCapsule.ts`/`recall.ts`.
 */

/** П.39-стиль правило (той самий підхід, що й `normalizeCapsuleText`/`normalizeRecallText`) —
 * trim, порожній рядок (чи лише пробіли) — це "не заповнено", не валідний контент. */
function trimOrNull(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeReflectionText(value: string | null): string | null {
  return trimOrNull(value);
}

export interface PreReadingReflectionContentInput {
  reasonText: string | null;
  expectationText: string | null;
  expectedRating: number | null;
}

/** Порожня нотатка "До читання" заборонена — потрібне хоча б одне з трьох полів (той самий
 * дух, що й `validateCapsuleContent`). */
export function validatePreReadingReflectionContent(input: PreReadingReflectionContentInput): boolean {
  return (
    trimOrNull(input.reasonText) != null ||
    trimOrNull(input.expectationText) != null ||
    input.expectedRating != null
  );
}

/** ТЗ Фази 6 ("для книги, яку користувач тільки починає... НЕ блокуй start reading"): форма
 * доступна лише поки книга РЕАЛЬНО "Читаю". Навмисно НЕ поширюється на `finished`/`rereading` —
 * писати "до" заднім числом, уже знаючи фінал книги, підважило б сам сенс порівняння
 * До/Після (`docs/BEFORE_AFTER.md` §Відомі обмеження); і НЕ на `paused`/`want_to_read` — форма
 * запрошує саме в момент старту, а не будь-коли. */
export function canEditPreReadingReflection(status: UserBookStatus): boolean {
  return status === 'reading';
}

/** Короткий "before"-текст для шаблону картки-спогаду (ТЗ Фази 6, SHARE CARD: "short before") —
 * очікування пріоритетніше за причину: воно конкретніше відповідає на "чого чекав від
 * читання", ближче до "short after" (`book_memory.reflection`), з яким його показують поруч. */
export function pickBeforeCardText(reflection: Pick<PreReadingReflection, 'reasonText' | 'expectationText'> | null): string | null {
  if (!reflection) return null;
  return reflection.expectationText ?? reflection.reasonText;
}
