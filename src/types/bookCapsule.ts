import type { JournalEntryKind } from './journalEntry';

/**
 * POLYTSIA V1.6, Фаза 4 («Капсула книги») — приватний персональний snapshot вражень від
 * прочитаної книги, щоб повернутися до нього через місяці/роки (`docs/BOOK_CAPSULES.md`).
 * НЕ review, НЕ public post, НЕ AI-summary.
 */

/** Пресет "коли нагадати" (п.8 ТЗ) — фіксований набір, без довільної дати (п.8: "для V1.6
 * достатньо preset options"). Зберігається ОКРЕМО від обчисленого `reopenAt` — потрібен сам
 * по собі, щоб знати, чи користувач ЗМІНИВ вибір при редагуванні (`bookCapsule.ts`,
 * `calculateCapsuleReopenAt`). */
export type CapsuleReopenOption = 'none' | '3_months' | '6_months' | '1_year';

/**
 * «Капсула книги» — те, що користувач сам компонує після завершення читання: одна стійка
 * думка, одне речення-формулювання, улюблений персонаж (вільний текст, доки не з'явився
 * Personal Lore), посилання на один момент щоденника, і коли повернутися.
 */
export interface BookCapsule {
  id: string;
  userBookId: string;
  /** «Що залишиться з тобою після цієї книги?» — п.4 ТЗ. */
  lastingThought: string | null;
  /** «Одним реченням: про що ця книга була для тебе?» — п.5 ТЗ, НЕ переказ сюжету. */
  oneSentenceMemory: string | null;
  /** Вільний текст (п.6 ТЗ) — доки Personal Lore/Characters (Фази 9-10) не дає структурованого
   * вибору; `favoriteLoreEntityId` нижче — місце для нього, коли з'явиться. */
  favoriteCharacterText: string | null;
  /** Заготовка під Personal Lore (Фази 9-10 ТЗ) — не заповнюється в Фазі 4, лише резервує
   * архітектуру (п.6 ТЗ: "не створюй dependency, яка блокує Book Capsule"). */
  favoriteLoreEntityId: string | null;
  /** М'яке посилання на один запис щоденника (`note`/`quote`) цієї ж книги — той самий
   * "id+kind без SQL FK" патерн, що й `BookMemoryEntryRef` (`types/bookMemory.ts`). `null` —
   * якщо запис пізніше видалено, посилання просто не резолвиться (п.7 ТЗ). */
  journalEntryKind: JournalEntryKind | null;
  journalEntryId: string | null;
  reopenOption: CapsuleReopenOption;
  /** Обчислена дата нагадування (ISO) — `null`, коли `reopenOption === 'none'`. Рахується від
   * `createdAt` цієї ж капсули (`bookCapsule.ts`, `calculateCapsuleReopenAt`) — навіть при
   * редагуванні пізніше, щоб дата не "пливла" щоразу, коли користувач лише поправив текст
   * (докладне обґрунтування — `docs/BOOK_CAPSULES.md` §Дата нагадування). */
  reopenAt: string | null;
  /** POLYTSIA V1.6, Фаза 5 («Книга через час», `docs/RECALL.md`) — коли користувач ВПЕРШЕ
   * завершив recall-флоу цієї капсули (`app/recall/[workId].tsx`: дійшов до кроку "Що ти
   * пам'ятаєш зараз?" і натиснув "Продовжити"). НЕ прив'язано до `reopenAt` — recall доступний
   * "вручну у будь-який момент" (п.5 ТЗ Фази 5), тож `openedAt` може проставитись і задовго до
   * дати нагадування. Проставляється РІВНО ОДИН РАЗ (перше проходження) — сама історія
   * recall-спроб (скільки разів, з яким текстом) росте окремо, `capsule_recall`
   * (`013_capsule_recall.ts`). `null`, доки жодного recall ще не завершено. Простий перегляд
   * капсули на `app/capsule/[workId].tsx` (власні нотатки, без recall-флоу) на це поле НЕ
   * впливає — це навмисно два різні досвіди (докладніше — `docs/RECALL.md` §Відмінність від
   * перегляду капсули). */
  openedAt: string | null;
  /** `expo-notifications` id заплановпного нагадування — `null`, коли нагадування не заплановано
   * (обрано "Без нагадування", або дозвіл на сповіщення відсутній, п.11 ТЗ). */
  notificationIdentifier: string | null;
  /** Знімок `user_book.finishedAt` на момент створення капсули (не live-посилання) — лише для
   * показу "Завершено ..." на екрані капсули. */
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Вхід створення — усе, крім службових id/дат (п.12 ТЗ, "приблизні fields"). */
export interface CreateBookCapsuleInput {
  userBookId: string;
  lastingThought: string | null;
  oneSentenceMemory: string | null;
  favoriteCharacterText: string | null;
  favoriteLoreEntityId: string | null;
  journalEntryKind: JournalEntryKind | null;
  journalEntryId: string | null;
  reopenOption: CapsuleReopenOption;
  completedAt: string | null;
}

/** Вхід редагування — той самий набір контентних полів, без `userBookId`/`completedAt` (не
 * редагуються після створення). */
export interface UpdateBookCapsuleInput {
  id: string;
  lastingThought: string | null;
  oneSentenceMemory: string | null;
  favoriteCharacterText: string | null;
  favoriteLoreEntityId: string | null;
  journalEntryKind: JournalEntryKind | null;
  journalEntryId: string | null;
  reopenOption: CapsuleReopenOption;
}
