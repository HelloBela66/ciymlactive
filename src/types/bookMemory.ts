import type { JournalEntryKind } from './journalEntry';

/** Посилання на конкретний запис щоденника (`note`/`quote`), а не копія його тексту —
 * `book_memory.entry_refs`, докладніше `004_book_memory.ts`. */
export interface BookMemoryEntryRef {
  id: string;
  kind: JournalEntryKind;
}

/**
 * Який із заготовлених шаблонів картки-спогаду обрав користувач (Milestone 11, Фаза 8,
 * `005_book_memory_template.ts`). Простий рядковий union, а не Zod-схема/`keyof typeof` —
 * той самий стиль, що й `JournalEntryKind` вище: підписи для UI — окремо в
 * `src/design/i18n-labels.ts` (`memoryCardTemplateLabels`), сам вигляд шаблону — в
 * `src/components/memory/MemoryCardPreview.tsx`. У SQLite — БЕЗ CHECK на ці значення
 * (докладніше — коментар у міграції), тож розширення списку новим шаблоном ніколи не
 * вимагатиме rebuild-міграції, лише новий case у TypeScript.
 */
export type MemoryCardTemplateId = 'classic' | 'quote' | 'stats' | 'minimal' | 'beforeAfter';

/**
 * «Спогад про книгу» (Milestone 11, Фаза 7-8) — те, що користувач сам компонує на екрані
 * підсумку читання: власна коротка рефлексія + вибрані записи щоденника (Фаза 7) + обраний
 * шаблон вигляду картки (Фаза 8, `templateId`). Саме зображення картки (захоплення в PNG для
 * шерингу/збереження) — Фаза 9, тут його ще немає.
 */
export interface BookMemory {
  id: string;
  userBookId: string;
  /** REREADING MODEL, Фаза 8 (`docs/READING_RUN.md`) — до якого `reading_run` (конкретного
   * прочитання) належить цей спогад. `null` — книга взагалі не має жодного `reading_run`
   * (Фаза 7 `addToLibrary`, свідомо не підключена) — той самий "книжковий" фолбек, що діяв ДО
   * цієї фази для всіх спогадів. */
  readingRunId: string | null;
  /** `null` — користувач нічого не написав, лишив тільки вибрані записи (теж валідний спогад). */
  reflection: string | null;
  entryRefs: BookMemoryEntryRef[];
  templateId: MemoryCardTemplateId;
  createdAt: string;
  updatedAt: string;
  /** SOFT-DELETE READINESS (POLYTSIA V1.6.1, Фаза 26, `027_soft_delete_readiness.ts`) —
   * `BookMemoryRepository.remove` тепер м'яко видаляє. `null` для будь-якого рядка, що доходить
   * до звичайного UI (публічні read-методи репозиторія фільтрують `deleted_at IS NULL`). */
  deletedAt: string | null;
}
