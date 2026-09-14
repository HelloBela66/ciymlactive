/**
 * КАЛЕНДАР — ВІЗУАЛЬНА КОМПОЗИЦІЯ (пост-Фаза 19) — "Збережено цього дня" (Day Details):
 * коли того дня записів щоденника більше, ніж влазить у компактну секцію (макс. 3), який саме
 * показати першим. ТЗ: пріоритет "обране → момент → думка → цитата → інше".
 *
 * Чиста функція, той самий house-патерн, що й решта `calendarX.ts`-файлів. `isFavorite` —
 * найвищий пріоритет незалежно від типу (запис, який користувач сам виділив як важливий,
 * важливіший за будь-яку евристику типу запису). Далі — `NoteType` "moment"/"thought" (два з
 * п'яти вбудованих типів нотатки, `src/types/note.ts`) — інтуїтивно "найбільш querying дня"
 * записи. Цитата — після нотаток-momента/думки, але перед рештою нотаток (`question`/`theory`/
 * `general`), яким немає окремого рангу в ТЗ — усі три "інше".
 */

export interface JournalPriorityInput {
  isFavorite: boolean;
  kind: 'note' | 'quote';
  /** `NoteType | 'quote'` (`JournalEntryType`, `src/types/journalEntry.ts`) — рядок, не enum
   * тут, щоб не тягнути залежність на конкретний тип лише заради порівняння двох рядкових
   * значень. */
  type: string;
  createdAt: string;
}

function journalPriorityRank(entry: JournalPriorityInput): number {
  if (entry.isFavorite) return 0;
  if (entry.kind === 'note' && entry.type === 'moment') return 1;
  if (entry.kind === 'note' && entry.type === 'thought') return 2;
  if (entry.kind === 'quote') return 3;
  return 4;
}

/**
 * Впорядковує записи щоденника дня за пріоритетом (обране → момент → думка → цитата → інше),
 * у межах ОДНАКОВОГО пріоритету — новіші перші (`createdAt` спадання), і обрізає до `limit`
 * (ТЗ: "максимум 2-3 записи" — тут задано 3 як верхня межа, конкретна кількість, а не "плаваюче
 * 2 чи 3"). Не мутує вхідний масив.
 */
export function rankJournalEntriesForDay<T extends JournalPriorityInput>(entries: T[], limit = 3): T[] {
  return [...entries]
    .sort((a, b) => {
      const rankDiff = journalPriorityRank(a) - journalPriorityRank(b);
      if (rankDiff !== 0) return rankDiff;
      if (a.createdAt === b.createdAt) return 0;
      return a.createdAt > b.createdAt ? -1 : 1;
    })
    .slice(0, limit);
}
