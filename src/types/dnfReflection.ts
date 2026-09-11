/**
 * DNF IMPROVEMENT (POLYTSIA V1.6, Фаза 12) — приватна нотатка "чому не дочитав", прив'язана до
 * книги зі статусом "Не дочитав". Щонайбільше один рядок на книгу (`017_dnf_reflection.ts`,
 * `UNIQUE(user_book_id)`), докладніше — `docs/DNF_IMPROVEMENT.md`.
 */
export interface DnfReflection {
  id: string;
  userBookId: string;
  /** Знімок `user_book.current_page` у МИТЬ переходу статусу в "Не дочитав" — завжди відома
   * (на відміну від `LoreEntity.firstSeenPage`), тому не nullable. Відсоток для показу
   * рахується окремо з `pageCount` видання (`computeProgressPercent`) — не зберігається тут. */
  page: number;
  /** Вільний рядок — фіксований лише на рівні `DnfReasonId` (`src/design/dnfReason.ts`);
   * `null`, коли причину не обрано (ТЗ: "optional reason"). */
  reason: string | null;
  /** Довільна нотатка (ТЗ: "Optional free text") — незалежна від `reason`. */
  note: string | null;
  /** "Дата" з ТЗ — момент, коли книгу залишили (перехід статусу), НЕ момент, коли дописали
   * причину/нотатку; ніколи не змінюється після першого запису (`captureIfMissing`). */
  createdAt: string;
  updatedAt: string;
}
