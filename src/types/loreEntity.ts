import type { JournalEntryKind } from './journalEntry';

/**
 * POLYTSIA V1.6, Фаза 9-10 («Персонажі» → PERSONAL LORE) — уніфікована модель одразу
 * (`015_lore_entity.ts`, `docs/PERSONAL_LORE.md` §Архітектура). Фаза 9 UI показує лише
 * `'character'` — решта типів уже підтримані схемою, з'являться в UI Фази 10 без нової міграції.
 */
export type LoreEntityType = 'character' | 'place' | 'term' | 'organization';

const LORE_ENTITY_TYPE_ORDER: LoreEntityType[] = ['character', 'place', 'term', 'organization'];

/** `type` — вільний `TEXT` без CHECK (`015_lore_entity.ts`) — той самий захисний патерн, що й
 * `isReactionId`/`isReadingExperienceId`: значення з БД, якого ця версія застосунку не знає,
 * трактується явно, а не приймається наосліп. Немає UI-рівня "невідомий тип" — на практиці
 * лишень запобіжник для майбутніх версій схеми. */
export function isLoreEntityType(value: string): value is LoreEntityType {
  return (LORE_ENTITY_TYPE_ORDER as string[]).includes(value);
}

/** «Персонаж»/елемент особистого лору твору — приватна нотатка користувача про діючу особу
 * (чи, з Фази 10, місце/термін/організацію) книги. НЕ довідник з видавництва, НЕ wiki — лише
 * те, що користувач сам занотував (ТЗ: "Не роби NLP entity extraction"). */
export interface LoreEntity {
  id: string;
  workId: string;
  type: LoreEntityType;
  name: string;
  description: string | null;
  firstSeenPage: number | null;
  /** Обчислено доменним шаром при створенні (`computeProgressPercent`), не вводиться окремим
   * полем форми — див. коментар у `015_lore_entity.ts`. */
  firstSeenProgress: number | null;
  /** Фаза 9 UI: одна з `LoreEntityReactionId` (`src/design/loreEntityReaction.ts`) або `null`.
   * Стосується лише персонажів — для інших типів (Фаза 10) лишається `null`. */
  reaction: string | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Вхід створення — `firstSeenProgress` рахується доменним шаром (`src/lib/loreEntity.ts`), не
 * приймається тут напряму, тому в інпуті лише сторінка. */
export interface CreateLoreEntityInput {
  workId: string;
  type: LoreEntityType;
  name: string;
  description: string | null;
  firstSeenPage: number | null;
}

/** Вхід редагування — `type`/`workId` не редагуються після створення (той самий "клас поля"
 * підхід, що й `UpdateBookCapsuleInput` без `userBookId`). */
export interface UpdateLoreEntityInput {
  id: string;
  name: string;
  description: string | null;
  firstSeenPage: number | null;
  reaction: string | null;
}

/** Один "зв'язок" персонажа із записом щоденника (`journal_lore_link`) — той самий "id+kind без
 * SQL FK на сам запис" патерн, що й `BookCapsule.journalEntryId`/`journalEntryKind`. */
export interface JournalLoreLink {
  id: string;
  loreEntityId: string;
  entryKind: JournalEntryKind;
  entryId: string;
  createdAt: string;
}
