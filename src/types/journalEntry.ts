import type { NoteType } from './note';

/** Яка фізична таблиця стоїть за записом — потрібно, щоб UI знав, який репозиторій/мутацію
 * викликати для favorite/reaction/видалення (`note` і `quote` лишаються окремими таблицями,
 * докладніше — `003_journal_entry_extensions.ts`, Фаза 1 аналізу Milestone 11). */
export type JournalEntryKind = 'note' | 'quote';

/** Шість типів запису щоденника (п.1 ТЗ Milestone 11): п'ять — варіанти `note.type`,
 * шостий (`'quote'`) — це просто будь-який рядок `quote` (там немає власного поля `type`,
 * весь рядок цитата за визначенням). */
export type JournalEntryType = NoteType | 'quote';

/**
 * Уніфікована read-модель "запис щоденника" — union `note`+`quote` на рівні читання
 * (варіант A з аналізу Фази 1, підтверджений користувачем). Немає власної таблиці; будь-яка
 * мутація (favorite/reaction/видалення/редагування) все одно йде через `NoteRepository`
 * або `QuoteRepository` за `kind`+`id`.
 */
export interface JournalEntry {
  id: string;
  kind: JournalEntryKind;
  userBookId: string;
  /** Лише для `kind: 'quote'` — у `note` такого поля немає. */
  editionId: string | null;
  sessionId: string | null;
  page: number | null;
  progressPercent: number | null;
  type: JournalEntryType;
  /** Лише для `kind: 'note'` — власна категорія користувача (`NoteCategory`), коли обрана
   * замість/на додачу до вбудованого `type`. `null` для `quote` і для нотаток без власної
   * категорії. Резолв назви — `resolveEntryTypeLabel`, `src/lib/journalEntryLabel.ts`. */
  categoryId: string | null;
  text: string;
  /** Лише для `kind: 'quote'` — власний коментар користувача до цитати. */
  comment: string | null;
  tags: string[];
  isFavorite: boolean;
  // POLYTSIA V1.5, Фаза 11 («ПОВЕРНУТИСЯ ПІЗНІШЕ») — «Ти залишив N записів, до яких хотів
  // повернутися». Той самий boolean-прапорець-патерн, що й `isFavorite` вище, лише інша UI-дія
  // («Повернутися пізніше» замість «Обране»); `011_revisit_later.ts`.
  revisitLater: boolean;
  reaction: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Курсор keyset-пагінації глобального стрічки щоденника (`docs/DATABASE.md` — keyset,
 * не OFFSET, для великих обсягів). `created_at` окремо може повторюватись (два записи в ту
 * саму секунду), тож `id` — тай-брейкер. */
export interface JournalEntryCursor {
  createdAt: string;
  id: string;
}

/**
 * `JournalEntry` + інформація про книгу (Фаза 4, Milestone 11) — потрібна лише глобальній
 * стрічці "Мій щоденник" (`app/journal/index.tsx`): на відміну від "щоденника цієї книги"
 * чи "записів цієї сесії" (де книга і так відома з контексту екрана), тут записи різних книг
 * впереміш, і без назви/обкладинки незрозуміло, про яку книгу йдеться. `JournalRepository.listFeedPage`
 * додає ці поля прямо в SQL (JOIN user_book→edition→work), а не окремим запитом на книгу —
 * інакше N+1 при 50+ записах на сторінці.
 */
export interface JournalFeedEntry extends JournalEntry {
  workId: string;
  workTitle: string;
  coverUrl: string | null;
  coverFallbackColor: string | null;
  /** Назва власної категорії, коли `categoryId` задано — резолвлена прямо в SQL (`LEFT JOIN
   * note_category`), а не окремим запитом: стрічка змішує записи БАГАТЬОХ книг одразу, тож
   * клієнтський резолв (як у `resolveEntryTypeLabel` для однокнижкових екранів) означав би
   * підвантажувати категорії кожної книги окремо (N+1). `null`, коли `categoryId` немає, або
   * коли рядок `note_category` вже фізично не існує (не повинно траплятись — категорії
   * лише м'яко видаляються, `008_note_category.ts`). */
  categoryLabel: string | null;
}
