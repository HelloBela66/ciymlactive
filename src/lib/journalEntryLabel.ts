import { journalEntryTypeLabels } from '@/design/i18n-labels';
import type { JournalEntryType } from '@/types/journalEntry';
import type { NoteCategory } from '@/types/noteCategory';

/**
 * Мітка типу/категорії запису щоденника для показу в UI (Milestone 11, доповнення — власні
 * категорії нотаток). Правило одне й те саме на всіх чотирьох екранах, де записи
 * відображаються (`app/session/[sessionId].tsx`, `app/work/[workId].tsx`,
 * `app/completion/[workId].tsx`; глобальна стрічка `app/journal/index.tsx` — окремий випадок,
 * бо резолвить мітку прямо в SQL, `JournalRepository.listFeedPage`, `categoryLabel`):
 *
 * цитата → "Цитата"; нотатка з власною категорією (`categoryId` задано) → назва цієї
 * категорії, коли вона знайдена в переданому списку (`categoriesById`, зазвичай
 * `useAllNoteCategories(userBookId)` — включно з м'яко видаленими, щоб стара нотатка не
 * лишалась без мітки); інакше → мітка вбудованого типу (`journalEntryTypeLabels`).
 *
 * Якщо `categoryId` заданий, але сама категорія з якоїсь причини не знайшлась (мапа ще не
 * завантажилась, або дані розсинхронізувались) — тихий фолбек на мітку вбудованого типу, а
 * не порожній рядок чи "undefined": користувач і так бачить розумну мітку, нехай і не ту
 * саму, що очікував.
 */
export function resolveEntryTypeLabel(
  entry: { kind: 'note' | 'quote'; type: JournalEntryType; categoryId: string | null },
  categoriesById: ReadonlyMap<string, NoteCategory>,
): string {
  if (entry.kind === 'quote') return journalEntryTypeLabels.quote;
  if (entry.categoryId) {
    const category = categoriesById.get(entry.categoryId);
    if (category) return category.label;
  }
  return journalEntryTypeLabels[entry.type as keyof typeof journalEntryTypeLabels] ?? entry.type;
}

/** Хелпер для побудови `categoriesById` з масиву (`useAllNoteCategories`'s `data`). */
export function categoriesToMap(categories: NoteCategory[] | undefined): Map<string, NoteCategory> {
  return new Map((categories ?? []).map((c) => [c.id, c]));
}
