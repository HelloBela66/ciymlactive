import { addYears } from 'date-fns';

/**
 * POLYTSIA V1.7, Phase 8 — MEANINGFUL READING MILESTONES (ТЗ V1.7 модуль D).
 *
 * ── ЩО ТАКЕ MILESTONE У «ПОЛИЦІ» ─────────────────────────────────────────────────────────────
 * Факт читацької біографії, а НЕ нагорода. Питання, на яке мусить відповідати кожна віха:
 * «Чи захочу я побачити цей факт через п'ять років як частину своєї читацької історії?»
 *
 * Тому тут немає й не буде: badges, рівнів, XP, progress bar, rarity, locked achievements,
 * «до наступної віхи N книг», streak-досягнень, countdown'ів і pre-milestone нагадувань
 * (ТЗ §3, §16, §25, §26). Віха дивиться НАЗАД — «це сталося», — а не вперед.
 *
 * ── DERIVED, БЕЗ НОВОЇ ТАБЛИЦІ (ТЗ §17, §18) ─────────────────────────────────────────────────
 * Віхи не зберігаються. Вони обчислюються з тієї самої історії (`reading_run`, `reading_session`),
 * що й Reading Life, Recaps і Wrapped. Звідси безкоштовно випливає ідемпотентність (§18, §34):
 * та сама історія завжди дає ті самі віхи з тими самими ідентифікаторами, а backup/restore не
 * може ані продублювати віху, ані «переобрати» 50-ту книгу.
 *
 * ── ДЕТЕРМІНІЗМ (ТЗ §6, §35) ─────────────────────────────────────────────────────────────────
 * Порядок ніколи не залежить від порядку рядків SQLite. Сортування — за `(finishedAt, runId)` і
 * `(startedAt, sessionId)`: id — persisted UUID, який переживає backup/restore, тож tie-break
 * стабільний між запусками й пристроями. Ідентифікатор віхи теж детермінований
 * (`finished_books:50`), а не згенерований рядок у БД.
 *
 * ── ЩО НЕ Є ВІХОЮ (ТЗ §3, §20, §29) ──────────────────────────────────────────────────────────
 * Кожні 10 сесій, кожні 100 сторінок, streak будь-якої довжини, виконання цілі, швидкість
 * читання, «10-та недочитана книга», рівні Reading Fingerprint. Streak лишається там, де вже
 * використовується (Статистика/Wrapped), але віхою не стає й тиску не створює: anniversary (§12)
 * — це тривалість існування історії, а не послідовність днів, і він НЕ втрачається через місяць
 * без читання.
 *
 * Чиста функція (house-стиль `lib/*.ts`): без SQL, без React, без `new Date()` без аргумента —
 * «зараз» приходить параметром.
 */

export type ReadingMilestoneKind =
  | 'finished_books'
  | 'reading_hours'
  | 'first_reread'
  | 'reading_life_anniversary';

export interface ReadingMilestone {
  /** Детермінований ключ: `finished_books:50`, `reading_hours:100`, `first_reread`,
   * `reading_life_anniversary:1`. Не рядок у БД (ТЗ §35). */
  id: string;
  kind: ReadingMilestoneKind;
  /** Коли це сталось — абсолютний instant, як і всі інші дати V1.7. */
  at: string;
  /** Порядкове число (50-та книга) чи поріг (100 годин, 1 рік); `null` для одноразових віх. */
  value: number | null;
  /** Книга, під час читання якої віху перетнуто (де це визначено). */
  userBookId: string | null;
  workId: string | null;
}

/**
 * Пороги завершених книг (ТЗ §4). Після 100 — навмисно РІДШЕ: віха на кожні 10 книг перестала б
 * бути рідкісною подією й перетворилась би на лічильник.
 *
 * `1` включено як поріг, а не як окремий вид віхи (ТЗ §13 — «перша завершена книга»): це те саме
 * питання «яка за рахунком книга», просто з іншим текстом. Окремий `kind` дав би два майже
 * однакові шляхи до однієї події.
 */
export const FINISHED_BOOK_MILESTONES = [1, 10, 25, 50, 100, 250, 500] as const;

/** Пороги часу з книгами, години (ТЗ §9). Та сама рідкісність, що й у книжкових. */
export const READING_HOUR_MILESTONES = [100, 250, 500, 1000, 2500] as const;

const SECONDS_PER_HOUR = 3600;

export interface MilestoneFinishedRunInput {
  runId: string;
  userBookId: string;
  /** Ідентичність КНИГИ (`work`), не видання: різні видання того самого твору — одна книга
   * (ТЗ §30). `null`, коли твір фізично недоступний — такий прохід не рахується (див. нижче). */
  workId: string | null;
  status: string;
  finishedAt: string | null;
}

export interface MilestoneSessionInput {
  sessionId: string;
  userBookId: string;
  startedAt: string;
  /** Canonical-тривалість без пауз (ТЗ §9): `duration_seconds`, НЕ `endedAt − startedAt`. */
  durationSeconds: number | null;
}

export interface ReadingMilestonesInput {
  finishedRuns: MilestoneFinishedRunInput[];
  sessions: MilestoneSessionInput[];
  /**
   * Найраніша canonical читацька подія — початок відліку читацької історії (ТЗ §11).
   * `null`, якщо історії ще немає: тоді ювілеїв просто не буде, а не вигадана дата.
   */
  earliestReadingInstant: string | null;
  /** «Зараз» — параметром (house convention), щоб функція лишалась детермінованою. */
  now: Date;
}

/** Стабільний порядок проходів: за датою завершення, далі за id (persisted UUID) — ТЗ §6. */
function compareRuns(a: MilestoneFinishedRunInput, b: MilestoneFinishedRunInput): number {
  const byDate = (a.finishedAt ?? '').localeCompare(b.finishedAt ?? '');
  return byDate !== 0 ? byDate : a.runId.localeCompare(b.runId);
}

function compareSessions(a: MilestoneSessionInput, b: MilestoneSessionInput): number {
  const byDate = a.startedAt.localeCompare(b.startedAt);
  return byDate !== 0 ? byDate : a.sessionId.localeCompare(b.sessionId);
}

/**
 * Завершені прочитання в хронологічному порядку. DNF відсіюється тут (ТЗ §20: недочитана книга
 * не є книжковою віхою — але з Reading Life не зникає, її просто не рахують тут).
 *
 * Прохід без `workId` теж відсіюється: без ідентичності твору неможливо сказати, чи це та сама
 * книга, що вже рахувалась, — а помилитись у бік «51-ша книга замість 50-ї» гірше, ніж тихо
 * пропустити пошкоджений рядок. Трапляється лише коли edition/work фізично зникли з БД.
 */
function chronologicalFinishedRuns(runs: MilestoneFinishedRunInput[]): MilestoneFinishedRunInput[] {
  return runs
    .filter((run) => run.status === 'finished' && run.finishedAt != null && run.workId != null)
    .sort(compareRuns);
}

/**
 * КНИЖКОВІ ВІХИ (ТЗ §4-§6).
 *
 * Рахується ПЕРШЕ завершення УНІКАЛЬНОГО твору. Перечитування вже зарахованої книги НЕ робить її
 * наступною «новою завершеною книгою» (ТЗ §5): 49 творів → перечитав старе → все ще 49 →
 * завершив новий твір → 50.
 */
function buildFinishedBookMilestones(runs: MilestoneFinishedRunInput[]): ReadingMilestone[] {
  const thresholds = new Set<number>(FINISHED_BOOK_MILESTONES);
  const seenWorkIds = new Set<string>();
  const milestones: ReadingMilestone[] = [];
  let ordinal = 0;

  for (const run of runs) {
    const workId = run.workId;
    if (workId == null || seenWorkIds.has(workId)) continue;
    seenWorkIds.add(workId);
    ordinal += 1;
    if (!thresholds.has(ordinal)) continue;
    milestones.push({
      id: `finished_books:${ordinal}`,
      kind: 'finished_books',
      at: run.finishedAt as string,
      value: ordinal,
      userBookId: run.userBookId,
      workId,
    });
  }

  return milestones;
}

/**
 * ПЕРШЕ ПЕРЕЧИТУВАННЯ (ТЗ §7, §32) — рівно ОДНА віха за всю читацьку історію.
 *
 * Перечитування тут — ДРУГЕ ЗАВЕРШЕНЕ прочитання того самого твору, а не просто `run_number > 1`.
 * Різниця суттєва: «покинув, потім дочитав» дає другий прохід із `run_number = 2`, але книгу до
 * того жодного разу не було дочитано — це не повернення до прочитаного, а завершення того самого
 * наміру (ТЗ §32 прямо просить звірити це з canonical-семантикою ReadingRun).
 *
 * «10-те перечитування» тощо навмисно не створюється (ТЗ §7) — це вже лічильник, а не подія.
 */
function buildFirstRereadMilestone(runs: MilestoneFinishedRunInput[]): ReadingMilestone | null {
  const finishedWorkIds = new Set<string>();
  for (const run of runs) {
    const workId = run.workId;
    if (workId == null) continue;
    if (finishedWorkIds.has(workId)) {
      return {
        id: 'first_reread',
        kind: 'first_reread',
        at: run.finishedAt as string,
        value: null,
        userBookId: run.userBookId,
        workId,
      };
    }
    finishedWorkIds.add(workId);
  }
  return null;
}

/**
 * ЧАСОВІ ВІХИ (ТЗ §9, §10) — один накопичувальний прохід по сесіях, не окремий перерахунок на
 * кожен поріг (ТЗ §36).
 *
 * Фіксується САМЕ МОМЕНТ ПЕРЕТИНУ: сесія, під час якої сумарний час перетнув поріг, і книга, яку
 * тоді читали. Це і робить віху частиною біографії («цю позначку ти перетнув під час…»), а не
 * просто станом лічильника.
 *
 * `at` — `startedAt` тієї сесії, а не її кінець: canonical-правило V1.7 каже, що сесія належить
 * ЦІЛКОМ моменту свого початку й ніколи не ділиться. Віха успадковує те саме правило, інакше вона
 * могла б потрапити в інший день/місяць, ніж сама сесія, яка її спричинила.
 */
function buildReadingHourMilestones(sessions: MilestoneSessionInput[]): ReadingMilestone[] {
  const ordered = [...sessions].sort(compareSessions);
  const milestones: ReadingMilestone[] = [];
  let cumulativeSeconds = 0;
  let nextThresholdIndex = 0;

  for (const session of ordered) {
    const duration = session.durationSeconds ?? 0;
    if (duration <= 0) continue;
    const before = cumulativeSeconds;
    cumulativeSeconds += duration;

    // `while`, а не `if`: одна дуже довга сесія може перетнути кілька порогів одразу.
    while (nextThresholdIndex < READING_HOUR_MILESTONES.length) {
      const hours = READING_HOUR_MILESTONES[nextThresholdIndex] as number;
      const thresholdSeconds = hours * SECONDS_PER_HOUR;
      if (before >= thresholdSeconds || cumulativeSeconds < thresholdSeconds) break;
      milestones.push({
        id: `reading_hours:${hours}`,
        kind: 'reading_hours',
        at: session.startedAt,
        value: hours,
        userBookId: session.userBookId,
        workId: null,
      });
      nextThresholdIndex += 1;
    }
  }

  return milestones;
}

/**
 * ЮВІЛЕЇ ЧИТАЦЬКОЇ ІСТОРІЇ (ТЗ §11-§12).
 *
 * Відлік — від першої canonical читацької події, а НЕ від дати встановлення застосунку: людина
 * могла імпортувати історію, яка почалась задовго до «Полиці», і рахувати з інсталяції означало б
 * відрізати їй частину біографії.
 *
 * ЦЕ НЕ STREAK (ТЗ §12): ювілей — тривалість існування історії. Місяць без читання його не
 * скасовує, «втратити» його неможливо, і жодного тиску він не створює.
 *
 * `addYears` (date-fns), а не «+365 днів»: високосні роки інакше зсували б дату, і 29 лютого
 * коректно стає 28 лютого в невисокосному році, детерміновано.
 */
function buildAnniversaryMilestones(
  earliestReadingInstant: string | null,
  now: Date,
): ReadingMilestone[] {
  if (earliestReadingInstant == null) return [];
  const start = new Date(earliestReadingInstant);
  if (Number.isNaN(start.getTime())) return [];

  const milestones: ReadingMilestone[] = [];
  // Обмеження зверху — захист від зіпсованої дати з далекого минулого, а не продуктове рішення.
  const MAX_TRACKED_YEARS = 50;
  for (let year = 1; year <= MAX_TRACKED_YEARS; year += 1) {
    const at = addYears(start, year);
    if (at.getTime() > now.getTime()) break;
    milestones.push({
      id: `reading_life_anniversary:${year}`,
      kind: 'reading_life_anniversary',
      at: at.toISOString(),
      value: year,
      userBookId: null,
      workId: null,
    });
  }
  return milestones;
}

/**
 * Усі віхи читацької історії, у хронологічному порядку (найстаріша перша).
 *
 * Один прохід по проходах і один по сесіях (ТЗ §36) — жодного «для кожного порогу завантажити всі
 * сесії».
 */
export function buildReadingMilestones(input: ReadingMilestonesInput): ReadingMilestone[] {
  const runs = chronologicalFinishedRuns(input.finishedRuns);

  const milestones: ReadingMilestone[] = [
    ...buildFinishedBookMilestones(runs),
    ...buildReadingHourMilestones(input.sessions),
    ...buildAnniversaryMilestones(input.earliestReadingInstant, input.now),
  ];

  const firstReread = buildFirstRereadMilestone(runs);
  if (firstReread) milestones.push(firstReread);

  // Хронологічно, з детермінованим tie-break за id — щоб дві віхи одного моменту завжди йшли в
  // тому самому порядку (ТЗ §6, §34).
  return milestones.sort((a, b) => {
    const byDate = a.at.localeCompare(b.at);
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
  });
}

/**
 * Віхи, що припали на період `[startIso, endIso)` — для Recap і року Reading Life (ТЗ §21).
 *
 * Узагальнена над `{ at }`, а не прибита до `ReadingMilestone`: екрани працюють із «виглядами»
 * віх (віха + готовий текст + назва книги), і без цього їм довелося б фільтрувати сирі віхи, а
 * потім звіряти id — зайвий крок, на якому легко розійтись.
 */
export function filterMilestonesInRange<T extends { at: string }>(
  milestones: T[],
  range: { startIso: string; endIso: string },
): T[] {
  return milestones.filter((milestone) => milestone.at >= range.startIso && milestone.at < range.endIso);
}

/** Найновіша віха — кандидат на контекстну картку Home (ТЗ §21-§22). */
export function latestMilestone(milestones: ReadingMilestone[]): ReadingMilestone | null {
  return milestones.length > 0 ? (milestones[milestones.length - 1] as ReadingMilestone) : null;
}
