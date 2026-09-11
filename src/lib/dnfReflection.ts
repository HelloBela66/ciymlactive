import { computeProgressPercent } from './progressPercent';
import type { UserBookStatus } from '@/types/userBook';

/**
 * DNF IMPROVEMENT (POLYTSIA V1.6, Фаза 12) — чисті функції (`docs/DNF_IMPROVEMENT.md`), той
 * самий house-патерн, що й `beforeAfter.ts`/`loreEntity.ts`: жодного `new Date()`/SQL/React
 * усередині.
 */

/** Той самий "trim, порожній рядок — не заповнено" підхід, що й `beforeAfter.ts`/`loreEntity.ts`
 * (навмисно продубльований локально — той самий house-патерн). */
function trimOrNull(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeDnfNote(value: string | null): string | null {
  return trimOrNull(value);
}

/** Відсоток прогресу на момент DNF, для показу — рахується з уже зафіксованої `page`
 * (`DnfReflection.page`, завжди відома) і `pageCount` видання (може бути невідомим). Той самий
 * `computeProgressPercent`, що й решта застосунку; `null`, коли обсяг видання невідомий. */
export function computeDnfProgressPercent(page: number, pageCount: number | null): number | null {
  return computeProgressPercent(page, pageCount);
}

/** ТЗ Фази 12 ("При status «Не дочитав» додай optional reason") — форма редагування
 * причини/нотатки доступна лише поки книга РЕАЛЬНО в статусі "Не дочитав". Сама нотатка (якщо
 * вже збережена) лишається видимою й після зміни статусу (той самий "read-only спогад" підхід,
 * що й `canEditPreReadingReflection`/`PreReadingReflectionSection`) — це запис про те, що
 * трапилось, а не активна форма поточного стану книги. */
export function canEditDnfReflection(status: UserBookStatus): boolean {
  return status === 'did_not_finish';
}
