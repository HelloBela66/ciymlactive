/**
 * DNF IMPROVEMENT (POLYTSIA V1.6, Фаза 12); REREADING MODEL, Фаза 11 (POLYTSIA V1.6.1,
 * `024_dnf_reflection_run.ts`, `docs/READING_RUN.md` §"Фаза 11") — приватна нотатка "чому не
 * дочитав", прив'язана до книги зі статусом "Не дочитав". Щонайбільше ОДИН рядок НА RUN
 * (`UNIQUE(reading_run_id)` — до Фази 11 було `UNIQUE(user_book_id)`: щонайбільше один на
 * книгу, і друге покинуте прочитання просто НІКОЛИ не фіксувалось, бо `captureIfMissing`
 * бачив уже наявний рядок першого покинутого прочитання й нічого не робив), докладніше —
 * `docs/DNF_IMPROVEMENT.md`.
 */
export interface DnfReflection {
  id: string;
  userBookId: string;
  /** Run, чиєму переходу в `did_not_finish` належить цей знімок — резолвиться ДИНАМІЧНО, той
   * самий підхід, що й `BookMemory`/`PreReadingReflection` (НЕ фіксується один раз назавжди,
   * на відміну від `BookCapsule.readingRunId`): `DnfReflectionRepository.getCurrent`/
   * `captureIfMissing` самі щоразу резолвлять поточний run через
   * `ReadingRunRepository.getLatestByUserBookId`. `null` — книга без жодного `reading_run`
   * (той самий фолбек, що й у Фазах 8-10). */
  readingRunId: string | null;
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
   * причину/нотатку; ніколи не змінюється після першого запису (`captureIfMissing`). Кожен run
   * тепер має власну дату — перечитування більше не блокує новий знімок. */
  createdAt: string;
  updatedAt: string;
}
