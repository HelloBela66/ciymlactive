import { useQuery } from '@tanstack/react-query';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase } from '@/data/db';
import { RatingRepository } from '@/data/repositories/RatingRepository';
import { BookMemoryRepository } from '@/data/repositories/BookMemoryRepository';
import { SeriesRepository } from '@/data/repositories/SeriesRepository';
import { JournalRepository } from '@/data/repositories/JournalRepository';
import { summarizeReadingPeriod } from '@/features/reading-period/summarizeReadingPeriod';
import { isReadingPeriodEmpty } from '@/lib/readingPeriodSummary';
import { ReadingSessionRepository } from '@/data/repositories/ReadingSessionRepository';
import { queryKeys } from '@/lib/queryKeys';
import { seasonDateRange, formatSeasonKey } from '@/lib/season';
import { computeDominantReadingExperience } from '@/lib/readingAggregates';
import type { SeasonId } from '@/design/season';
import type { ReadingExperienceId } from '@/design/readingExperience';
import type { UserBookWithDetails } from '@/types/userBook';
import type { ReadingRun } from '@/types/readingRun';
import type { JournalFeedEntry } from '@/types/journalEntry';
import type { Series } from '@/types/series';

export interface SeasonFavoriteBook {
  userBook: UserBookWithDetails;
  ratingValue: number | null;
  isFavorite: boolean;
}

/** Один сезонний "прохід" — книга + конкретний `ReadingRun`, що завершився в межах сезону (ТЗ
 * §39). `isReread` — `run.runNumber > 1`, готовий сигнал "Перечитано" без окремого обчислення. */
export interface SeasonBookRun {
  userBook: UserBookWithDetails;
  run: ReadingRun;
  isReread: boolean;
}

export interface SeasonSeriesGroup {
  series: Series;
  books: UserBookWithDetails[];
}

export interface ReadingSeasonData {
  seasonId: SeasonId;
  year: number;

  // ТЗ §39/40 — джерело "прочитаних книг" сезону: ЗАВЕРШЕНІ run'и в діапазоні, не поточний
  // статус книги. `finishedRuns` — сирий перелік проходів (може містити ту саму книгу двічі,
  // якщо вона завершилась у цьому сезоні більш ніж раз); `books` — той самий перелік, зведений
  // до УНІКАЛЬНИХ книг (одна картка на книгу в hero/списку, навіть якщо прочитана двічі).
  finishedRuns: SeasonBookRun[];
  books: UserBookWithDetails[];
  /** = `finishedRuns.length` — скільки ПРОХОДІВ завершилось у сезоні. */
  completedRuns: number;
  /** = `books.length` — скільки РІЗНИХ книг це було. НЕ те саме, що `completedRuns`, якщо
   * якась книга завершилась двічі в сезоні (ТЗ §40: "Не рахуй одну книгу двічі в метric, який
   * називається просто «Книги», без пояснення"). */
  uniqueBooksCount: number;
  /** Підмножина `books`, що є перечитуванням у цьому сезоні (ТЗ §51). */
  rereadBooks: UserBookWithDetails[];

  // ТЗ §41-44 — компактні ключові числа (максимум 4: книги/сторінки/час/активні дні).
  totalPages: number;
  totalMinutes: number;
  activeDays: number;

  // ТЗ §45
  favoriteBook: SeasonFavoriteBook | null;

  // ТЗ §46/47 — "Що залишилося з тобою": пріоритетний ланцюжок (favorite moment → favorite
  // thought → favorite quote → revisit later → newest meaningful), максимум 4 записи.
  savedThoughts: JournalFeedEntry[];
  // ТЗ §48 — окрема секція "Цитата сезону": лише якщо є favorite quote (може перетинатись із
  // одним із `savedThoughts`, якщо цитата туди й потрапила — це нормально, обидві секції чесно
  // показують ту саму улюблену цитату, а не випадковий вибір).
  favoriteQuote: JournalFeedEntry | null;

  // ТЗ §49 — короткий preview reflection ОДНІЄЇ книги сезону, що має Book Memory (не AI).
  bookMemoryPreview: { userBook: UserBookWithDetails; reflection: string } | null;

  // ТЗ §50 — "Як читалося" (опційно, з порогом вибірки — `computeDominantReadingExperience`).
  dominantReadingExperience: ReadingExperienceId | null;

  // ТЗ §52 — серія, якщо ≥2 книги сезону належать одній.
  seasonSeries: SeasonSeriesGroup | null;

  // ТЗ §53 — DNF НЕ рахується в "прочитано", лише нейтральний окремий лічильник.
  dnfCount: number;

  /**
   * POLYTSIA V1.7, Phase 10 — «у цьому сезоні нічого не записувалось», за КАНОНІЧНИМ визначенням
   * (`isReadingPeriodEmpty`, `readingPeriodSummary.ts`) — тим самим, яким користується Recap.
   *
   * До цієї фази екран сезону рахував порожнечу власною формулою
   * (`uniqueBooksCount === 0 && totalMinutes === 0`), і сезон, у якому людина не читала, але вела
   * щоденник чи кинула книгу, Recap показував як змістовний, а Сезони — як «немає даних».
   */
  isEmpty: boolean;
}

/**
 * Сезонний підсумок — POLYTSIA V1.6.2, #167 (READING SEASONS — PRODUCT REDEFINITION,
 * `docs/READING_SEASONS.md`). ЗАМІНЮЄ попередню Фазу 13 модель (той самий "derived, без нового
 * стану" принцип лишається — жодної нової таблиці, ТЗ §62): сезон більше НЕ статистичний дашборд
 * (`booksFinished`/`sessionsCount`/`topGenre`/`busiestMonth` зі старої версії), а емоційний
 * спогад про період читання (ТЗ §35, §68 — окрема продуктова роль від Statistics/Wrapped).
 *
 * Ключова зміна джерела даних (ТЗ §39): "прочитані книги" сезону тепер визначаються через
 * `ReadingRun.finishedAt`, а НЕ `UserBook.status === 'finished'`/`finishedAt` (стара версія) —
 * останнє "заморожене" на ПЕРШИЙ фініш книги (`UserBookRepository.updateStatus`) і бачить лише
 * ПОТОЧНИЙ статус, тож книга, завершена цього сезону й потім перечитана знову (статус тепер
 * `'rereading'`), раніше зникала б із сезону повністю, а друге завершення в межах ТОГО САМОГО
 * сезону було б непомітним. `ReadingRunRepository.listFinishedBetween` бачить кожен прохід
 * окремо.
 *
 * Обчислення винесене в окрему exported-функцію `fetchReadingSeasonData` (не inline в
 * `queryFn`) — POLYTSIA V1.6.2, #167, ТЗ §67: тести цього обчислення (`useReadingSeason.test.ts`)
 * викликають функцію напряму проти тестової БД (`openMigratedTestDb`, той самий house-патерн,
 * що й repository-тести), без React/React Query test harness, якого в цій кодовій базі свідомо
 * ще немає в жодному `features/*.test.ts` (усе тестове покриття — на рівні
 * repository/lib-функцій).
 */
export async function fetchReadingSeasonData(
  db: SQLiteDatabase,
  seasonId: SeasonId,
  year: number,
): Promise<ReadingSeasonData> {
  const range = seasonDateRange(seasonId, year);

  // ── POLYTSIA V1.7, Phase 7: СЕЗОНИ НА CANONICAL-ДВИГУНІ ────────────────────────────────────
  // До цієї фази Сезони брали ті самі три repository-методи, ту саму History Preservation — і
  // рахували хвилини/сторінки/активні дні/DNF ВЛАСНИМ кодом. Формули збігалися з
  // `computeReadingPeriodSummary` рядок у рядок, але жодна з них не була покрита
  // parity-тестом: на питання «скільки я читав цього літа» відповідала копія, яку ніщо не
  // тримало в синхроні з оригіналом. V1.7 називає це «п'ятою відповіддю», і саме так вона й
  // виглядає, поки не розійдеться.
  //
  // Тепер вибірка й базові числа — `summarizeReadingPeriod` (той самий код, що й у Recap,
  // Wrapped і Reading Life, і той самий, який викликає parity-тест). Тут лишається ЛИШЕ те, що
  // справді специфічне для сезону: книга сезону, збережені думки, цитата, спогад, серія,
  // «як читалося».
  //
  // Що НЕ змінилось: `...IncludingDeleted` (§61 — історичний Сезон переживає soft-delete книги)
  // і range-bound вибірка (ТЗ §65) — обидва тепер усередині спільної функції.
  const { summary, books: periodBooks } = await summarizeReadingPeriod(db, {
    startIso: range.start,
    endIso: range.end,
  });

  // `reading_experience` — сезон-специфічна метрика («Як читалося», ТЗ §50), якої немає в
  // canonical-підсумку: їй потрібні самі рядки сесій, а не агрегати. Тому окремий, той самий
  // range-bound запит.
  const sessions = await ReadingSessionRepository.listStartedBetween(db, range.start, range.end);

  const dnfCount = summary.dnfRunCount; // ТЗ §53

  const finishedRuns: SeasonBookRun[] = periodBooks
    .filter((entry) => entry.run.status === 'finished')
    .map((entry) => ({
      userBook: entry.userBook,
      run: entry.run,
      isReread: entry.run.runNumber > 1,
    }));

  // Унікальні книги сезону, найновіший фініш зверху (природний порядок для hero-обкладинок).
  const seenBookIds = new Set<string>();
  const books: UserBookWithDetails[] = [];
  const rereadUserBookIds = new Set<string>();
  for (const entry of [...finishedRuns].reverse()) {
    if (entry.isReread) rereadUserBookIds.add(entry.userBook.id);
    if (!seenBookIds.has(entry.userBook.id)) {
      seenBookIds.add(entry.userBook.id);
      books.push(entry.userBook);
    }
  }
  const rereadBooks = books.filter((ub) => rereadUserBookIds.has(ub.id));

  // Базові числа — з canonical-підсумку, не з власної формули (див. коментар вище).
  const totalMinutes = summary.readingMinutes;
  const totalPages = summary.pagesRead;
  const activeDays = summary.activeDays;
  const dominantReadingExperience = computeDominantReadingExperience(sessions);

  // ТЗ §45 — "Книга сезону": обране пріоритетне над найвищою оцінкою (той самий вибір, що й
  // стара версія/Wrapped `topRatedBook`), лише тепер над УНІКАЛЬНИМИ книгами сезону.
  const ratingByUserBookId = await RatingRepository.listByUserBookIds(db, books.map((ub) => ub.id));
  const favoritesFinished = books.filter((ub) => ub.isFavorite);
  const favoritePool = favoritesFinished.length > 0 ? favoritesFinished : books;
  let favoriteBook: ReadingSeasonData['favoriteBook'] = null;
  for (const ub of favoritePool) {
    const ratingValue = ratingByUserBookId.get(ub.id)?.value ?? null;
    if (!favoriteBook || (ratingValue ?? -1) > (favoriteBook.ratingValue ?? -1)) {
      favoriteBook = { userBook: ub, ratingValue, isFavorite: ub.isFavorite };
    }
  }

  // ТЗ §49 — book memory preview: спогад, прив'язаний САМЕ до run'у, що завершився в сезоні
  // (не "поточний" спогад книги взагалі, який міг стосуватись пізнішого перечитування поза
  // вікном сезону). Береться перший знайдений (порядок `finishedRuns`, найстаріший спочатку).
  const memoryByRunId = await BookMemoryRepository.listByReadingRunIds(
    db,
    finishedRuns.map((entry) => entry.run.id),
  );
  let bookMemoryPreview: ReadingSeasonData['bookMemoryPreview'] = null;
  for (const entry of finishedRuns) {
    const memory = memoryByRunId.get(entry.run.id);
    if (memory?.reflection) {
      bookMemoryPreview = { userBook: entry.userBook, reflection: memory.reflection };
      break;
    }
  }

  // ТЗ §52 — серія, якщо ≥2 книги сезону належать одній. Малий N (книги сезону — завжди
  // невелика вибірка, 3-місячне вікно), тож `getContextForWork` на кожну книгу окремо
  // (паралельно, `Promise.all`) замість окремого batch-методу — той самий виняток, що ТЗ
  // прямо дозволяє ("Тільки якщо data очевидна. Не будуй окремий Season Series Engine").
  const seriesContexts = await Promise.all(books.map((ub) => SeriesRepository.getContextForWork(db, ub.work.id)));
  const seriesGroups = new Map<string, SeasonSeriesGroup>();
  books.forEach((ub, index) => {
    const context = seriesContexts[index];
    if (!context) return;
    const existing = seriesGroups.get(context.series.id);
    if (existing) {
      existing.books.push(ub);
    } else {
      seriesGroups.set(context.series.id, { series: context.series, books: [ub] });
    }
  });
  let seasonSeries: SeasonSeriesGroup | null = null;
  for (const group of seriesGroups.values()) {
    if (group.books.length >= 2 && (!seasonSeries || group.books.length > seasonSeries.books.length)) {
      seasonSeries = group;
    }
  }

  // ТЗ §46/47 — "Що залишилося з тобою": пріоритетний ланцюжок, максимум 4 унікальні записи.
  // Один невеликий, обмежений набір запитів (НЕ journal feed, ТЗ §47) — не по одному на
  // книгу (ТЗ §66).
  const dateToInclusive = new Date(new Date(range.end).getTime() - 1).toISOString();
  const [favoriteMoments, favoriteThoughts, favoriteQuotes, revisitLater] = await Promise.all([
    JournalRepository.listFeedPage(db, {
      dateFrom: range.start,
      dateTo: dateToInclusive,
      favoriteOnly: true,
      types: ['moment'],
      limit: 2,
    }),
    JournalRepository.listFeedPage(db, {
      dateFrom: range.start,
      dateTo: dateToInclusive,
      favoriteOnly: true,
      types: ['thought'],
      limit: 2,
    }),
    JournalRepository.listFeedPage(db, {
      dateFrom: range.start,
      dateTo: dateToInclusive,
      favoriteOnly: true,
      types: ['quote'],
      limit: 2,
    }),
    JournalRepository.listFeedPage(db, {
      dateFrom: range.start,
      dateTo: dateToInclusive,
      revisitLaterOnly: true,
      limit: 2,
    }),
  ]);

  const MAX_SAVED_THOUGHTS = 4;
  const savedThoughts: JournalFeedEntry[] = [];
  const seenEntryIds = new Set<string>();
  for (const bucket of [favoriteMoments.items, favoriteThoughts.items, favoriteQuotes.items, revisitLater.items]) {
    for (const entry of bucket) {
      if (savedThoughts.length >= MAX_SAVED_THOUGHTS) break;
      if (seenEntryIds.has(entry.id)) continue;
      seenEntryIds.add(entry.id);
      savedThoughts.push(entry);
    }
  }
  // "Newest meaningful entry" — останній крок пріоритету (ТЗ §47), лише як fallback, коли
  // жодного favorite/revisit-later запису не знайшлось: сезон не повинен мовчати про особисту
  // пам'ять лише тому, що жоден запис не позначено обраним.
  if (savedThoughts.length === 0) {
    const { items: newest } = await JournalRepository.listFeedPage(db, {
      dateFrom: range.start,
      dateTo: dateToInclusive,
      limit: 1,
    });
    if (newest[0]) savedThoughts.push(newest[0]);
  }

  // ТЗ §48 — "Цитата сезону": ЛИШЕ favorite quote, ніколи випадкова (`section hidden`, якщо
  // немає — `favoriteQuote: null`, екран сам вирішує не малювати секцію).
  const favoriteQuote = favoriteQuotes.items[0] ?? null;

  return {
    seasonId,
    year,
    finishedRuns,
    books,
    completedRuns: finishedRuns.length,
    uniqueBooksCount: books.length,
    rereadBooks,
    totalPages,
    totalMinutes,
    activeDays,
    favoriteBook,
    savedThoughts,
    favoriteQuote,
    bookMemoryPreview,
    dominantReadingExperience,
    seasonSeries,
    dnfCount,
    isEmpty: isReadingPeriodEmpty(summary),
  };
}

/** React Query-обгортка над `fetchReadingSeasonData` — тонкий шар, що лише дістає з'єднання з БД
 * і формує `queryKey` (`queryKeys.seasons.bySeasonKey`, той самий ключ, що й до рефакторингу).
 * Уся логіка обчислення — у `fetchReadingSeasonData` вище, тестованій напряму без цього хука. */
export function useReadingSeason(seasonId: SeasonId, year: number) {
  return useQuery<ReadingSeasonData>({
    queryKey: queryKeys.seasons.bySeasonKey(formatSeasonKey({ seasonId, year })),
    queryFn: async () => {
      const db = await getDatabase();
      return fetchReadingSeasonData(db, seasonId, year);
    },
  });
}
