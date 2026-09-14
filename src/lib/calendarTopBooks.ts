/**
 * КАЛЕНДАР — ВІЗУАЛЬНА КОМПОЗИЦІЯ (пост-Фаза 19, `docs/CALENDAR_2_0.md` §"Visual Day
 * Composition") — "Найчастіше цього місяця" (топ-3 книги підсумку місяця). Чиста функція, той
 * самий house-патерн, що й `calendarIntensity.ts`/`readingAggregates.ts`.
 *
 * **СВІДОМЕ РІШЕННЯ: ранжування ЗА TWORK, не за `userBookId`** (на відміну від дня-клітинки,
 * `rankBooksForDay`, яка ранжує за `userBookId`, оскільки Day Details навмисно розрізняє
 * КОНКРЕТНЕ прочитання). На рівні місяця повторне прочитання (та сама книга, кілька
 * `ReadingRun` під ОДНИМ `userBookId`) — уже й так одна група мимоволі (один `userBookId`), але
 * рідкісний край-кейс — книга видалена з бібліотеки й додана заново (новий `userBookId` того
 * самого твору) — дав би дві окремі "картки" одного твору в топі місяця без групування за
 * `workId`. Групування за `workId` — свідомий вибір цієї фази (документовано тут і в
 * `docs/CALENDAR_2_0.md`): "Найчастіше цього місяця" — про ТВІР, який найбільше читали, а не
 * про окремий рядок бібліотеки. Day Details (день) свідомо НЕ групує так — там навпаки важливо
 * не змішати два різних UserBook/прочитання одного твору в одну картку.
 */

export interface MonthSessionForTopBooks {
  userBookId: string;
  workId: string;
  durationSeconds: number | null;
}

export interface RankedMonthWork {
  workId: string;
  /** `userBookId`, чию обкладинку/деталі показати як представника твору — той, що зібрав
   * НАЙБІЛЬШЕ хвилин СЕРЕД `userBookId` цього твору за місяць (рівність — перший за порядком
   * появи у вхідному масиві, той самий "порядок вставки Map" tie-break дух, що й
   * `computeBusiestMonth`/`computeTopGenreAmong`, `readingAggregates.ts`). На практиці майже
   * завжди рівно один `userBookId` на твір. */
  representativeUserBookId: string;
  totalMinutes: number;
}

/**
 * Топ-N творів місяця за сумою хвилин читання (округлення на кожну сесію окремо, тоді сума —
 * той самий вираз, що й `sumSessionMinutes`/`rankBooksForDay`). Рівність хвилин — перемагає
 * твір, що зустрівся першим при переборі (порядок вставки `Map`, тобто порядок вхідного
 * масиву `sessions` — той самий дух, що й `computeBusiestMonth`). `limit` за замовчуванням 3
 * (ТЗ: "топ-3 книги місяця").
 */
export function rankTopBooksOfMonth(sessions: MonthSessionForTopBooks[], limit = 3): RankedMonthWork[] {
  const minutesByWork = new Map<string, number>();
  const minutesByUserBookWithinWork = new Map<string, Map<string, number>>();

  for (const session of sessions) {
    const minutes = Math.round((session.durationSeconds ?? 0) / 60);
    minutesByWork.set(session.workId, (minutesByWork.get(session.workId) ?? 0) + minutes);

    let withinWork = minutesByUserBookWithinWork.get(session.workId);
    if (!withinWork) {
      withinWork = new Map<string, number>();
      minutesByUserBookWithinWork.set(session.workId, withinWork);
    }
    withinWork.set(session.userBookId, (withinWork.get(session.userBookId) ?? 0) + minutes);
  }

  const ranked: RankedMonthWork[] = [];
  for (const [workId, totalMinutes] of minutesByWork) {
    const withinWork = minutesByUserBookWithinWork.get(workId);
    let representativeUserBookId = '';
    let representativeMinutes = -1;
    if (withinWork) {
      for (const [userBookId, minutes] of withinWork) {
        if (minutes > representativeMinutes) {
          representativeUserBookId = userBookId;
          representativeMinutes = minutes;
        }
      }
    }
    ranked.push({ workId, representativeUserBookId, totalMinutes });
  }

  return ranked.sort((a, b) => b.totalMinutes - a.totalMinutes).slice(0, limit);
}
