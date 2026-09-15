import {
  buildReadingRecap,
  formatRecapPeriodTitle,
  recapPeriodDayCount,
  recapPeriodFromRange,
  recapPeriodKeyOf,
  recapRangeOf,
  resolveRecapAnchor,
  shiftRecapAnchor,
  type RecapPeriod,
  type RecapPeriodKind,
  type ReadingRecapInput,
} from './readingRecap';
import { EMPTY_READING_PERIOD_SUMMARY, type ReadingPeriodSummary } from './readingPeriodSummary';

/**
 * POLYTSIA V1.7, Phase 5 — тести детермінованого шаблонізатора Recap (ТЗ §103: жодної генерації).
 *
 * Саме через те, що текст детермінований, його можна перевірити як будь-яку іншу функцію: ті самі
 * числа завжди дають той самий рядок. Головне, що тут доводиться, — не краса формулювань, а
 * ПРАВИЛА: який факт забирає заголовок, що ніколи не дублюється між заголовком і рядками, що
 * перечитування не зливається з першим прочитанням, і що порожній період не звучить як докір.
 *
 * Дати будуються з локальних компонентів — той самий принцип, що й у решті V1.7.
 */

function summary(overrides: Partial<ReadingPeriodSummary> = {}): ReadingPeriodSummary {
  return { ...EMPTY_READING_PERIOD_SUMMARY, ...overrides };
}

const WEEK: RecapPeriod = {
  kind: 'week',
  start: new Date(2026, 7, 10),
  endInclusive: new Date(2026, 7, 16),
};

const MONTH: RecapPeriod = {
  kind: 'month',
  start: new Date(2026, 7, 1),
  endInclusive: new Date(2026, 7, 31),
};

function recap(overrides: Partial<ReadingRecapInput> = {}) {
  return buildReadingRecap({ period: WEEK, summary: summary(), ...overrides });
}

function lineIds(result: ReturnType<typeof buildReadingRecap>): string[] {
  return result.lines.map((line) => line.id);
}

function lineText(result: ReturnType<typeof buildReadingRecap>, id: string): string | undefined {
  return result.lines.find((line) => line.id === id)?.text;
}

describe('formatRecapPeriodTitle', () => {
  it('тиждень усередині одного місяця не повторює назву місяця', () => {
    expect(formatRecapPeriodTitle(WEEK)).toBe('10–16 серпня');
  });

  it('тиждень через межу місяця називає обидва місяці', () => {
    const title = formatRecapPeriodTitle({
      kind: 'week',
      start: new Date(2026, 8, 28),
      endInclusive: new Date(2026, 9, 4),
    });
    expect(title).toContain('вересня');
    expect(title).toContain('жовтня');
    expect(title).not.toContain('2026');
  });

  it('тиждень через межу РОКУ показує роки — інакше заголовок був би неоднозначним', () => {
    const title = formatRecapPeriodTitle({
      kind: 'week',
      start: new Date(2026, 11, 28),
      endInclusive: new Date(2027, 0, 3),
    });
    expect(title).toContain('2026');
    expect(title).toContain('2027');
  });

  it('місяць — називний відмінок із великої літери', () => {
    expect(formatRecapPeriodTitle(MONTH)).toBe('Серпень 2026');
  });

  it('рік — саме число', () => {
    expect(
      formatRecapPeriodTitle({
        kind: 'year',
        start: new Date(2026, 0, 1),
        endInclusive: new Date(2026, 11, 31),
      }),
    ).toBe('2026');
  });
});

describe('recapPeriodDayCount', () => {
  it('тиждень — 7 днів', () => {
    expect(recapPeriodDayCount(WEEK)).toBe(7);
  });

  it('серпень — 31 день', () => {
    expect(recapPeriodDayCount(MONTH)).toBe(31);
  });

  it('лютий високосного року — 29 днів', () => {
    expect(
      recapPeriodDayCount({
        kind: 'month',
        start: new Date(2028, 1, 1),
        endInclusive: new Date(2028, 1, 29),
      }),
    ).toBe(29);
  });
});

describe('навігація періодами — ключ ↔ дата ↔ діапазон', () => {
  const KINDS: RecapPeriodKind[] = ['week', 'month', 'year'];

  it('round-trip ключ → якір → той самий ключ для всіх трьох періодів', () => {
    for (const [kind, key] of [
      ['week', '2026-08-10'],
      ['month', '2026-08'],
      ['year', '2026'],
    ] as const) {
      const anchor = resolveRecapAnchor(kind, key);
      expect(anchor).not.toBeNull();
      expect(recapPeriodKeyOf(kind, anchor as Date)).toBe(key);
    }
  });

  it('БУДЬ-ЯКИЙ день тижня дає ключ його понеділка, а не себе', () => {
    expect(recapPeriodKeyOf('week', new Date(2026, 7, 13, 18, 0))).toBe('2026-08-10');
  });

  it('якір лежить усередині власного діапазону в кожному з періодів', () => {
    for (const kind of KINDS) {
      const anchor = new Date(2026, 7, 13, 12, 0);
      const range = recapRangeOf(kind, anchor);
      expect(anchor.toISOString() >= range.startIso).toBe(true);
      expect(anchor.toISOString() < range.endIso).toBe(true);
    }
  });

  it('недовірений ключ із маршруту дає null, а не «майже правильну» дату', () => {
    expect(resolveRecapAnchor('week', '2026-08')).toBeNull();
    expect(resolveRecapAnchor('week', '2026-02-30')).toBeNull();
    expect(resolveRecapAnchor('month', '2026-13')).toBeNull();
    expect(resolveRecapAnchor('year', '26')).toBeNull();
    expect(resolveRecapAnchor('year', 'рік')).toBeNull();
  });

  it('попередній період межує з поточним без щілини й перекриття', () => {
    for (const kind of KINDS) {
      const anchor = new Date(2026, 7, 13, 12, 0);
      const current = recapRangeOf(kind, anchor);
      const previous = recapRangeOf(kind, shiftRecapAnchor(kind, anchor, -1));
      expect(previous.endIso).toBe(current.startIso);
    }
  });

  it('зсув на тиждень назад від понеділка 1-го числа не промахується повз понеділок', () => {
    const anchor = resolveRecapAnchor('week', '2026-08-10') as Date;
    expect(recapPeriodKeyOf('week', shiftRecapAnchor('week', anchor, -1))).toBe('2026-08-03');
    expect(recapPeriodKeyOf('week', shiftRecapAnchor('week', anchor, 1))).toBe('2026-08-17');
  });

  it('попередній місяць/рік — саме попередній, включно з переходом через межу року', () => {
    const jan = resolveRecapAnchor('month', '2027-01') as Date;
    expect(recapPeriodKeyOf('month', shiftRecapAnchor('month', jan, -1))).toBe('2026-12');
    const year = resolveRecapAnchor('year', '2027') as Date;
    expect(recapPeriodKeyOf('year', shiftRecapAnchor('year', year, -1))).toBe('2026');
  });

  it('`recapPeriodFromRange` дає ОСТАННІЙ день періоду, а не наступний після нього', () => {
    const period = recapPeriodFromRange('week', recapRangeOf('week', new Date(2026, 7, 13)));
    expect(period.start.getDate()).toBe(10);
    expect(period.endInclusive.getDate()).toBe(16);
    expect(recapPeriodDayCount(period)).toBe(7);
    expect(formatRecapPeriodTitle(period)).toBe('10–16 серпня');
  });

  it('`recapPeriodFromRange` для місяця дає рівно його довжину', () => {
    const feb = recapPeriodFromRange('month', recapRangeOf('month', new Date(2028, 1, 15)));
    expect(recapPeriodDayCount(feb)).toBe(29);
    const august = recapPeriodFromRange('month', recapRangeOf('month', new Date(2026, 7, 15)));
    expect(recapPeriodDayCount(august)).toBe(31);
  });
});

describe('порожній період — констатація, а не докір', () => {
  const result = recap();

  it('позначений як порожній і не має жодного рядка фактів', () => {
    expect(result.isEmpty).toBe(true);
    expect(result.lines).toEqual([]);
  });

  it('говорить про відсутність ЗАПИСІВ, а не про бездіяльність людини', () => {
    expect(result.headline).toBe('Цього тижня читання не записувалось.');
    expect(result.headline).not.toMatch(/нічого не прочитав|спробуй|не здавайся|на жаль/i);
  });

  it('для місяця й року — та сама конструкція з відповідним словом', () => {
    expect(buildReadingRecap({ period: MONTH, summary: summary() }).headline).toBe(
      'Цього місяця читання не записувалось.',
    );
  });
});

describe('заголовок — найсильніший наявний факт', () => {
  it('одна дочитана книга називається на ім\'я', () => {
    const result = recap({
      summary: summary({ finishedRunCount: 1, firstTimeFinishCount: 1, readingMinutes: 200 }),
      finishedBooks: [{ title: 'Тигролови', isReread: false }],
    });
    expect(result.headline).toBe('Ти дочитав «Тигролови».');
  });

  it('дві-три книги перелічуються, більше — рахуються', () => {
    const three = recap({
      summary: summary({ finishedRunCount: 3, firstTimeFinishCount: 3 }),
      finishedBooks: [
        { title: 'А', isReread: false },
        { title: 'Б', isReread: false },
        { title: 'В', isReread: false },
      ],
    });
    expect(three.headline).toBe('Ти дочитав «А», «Б» і «В».');

    const four = recap({
      summary: summary({ finishedRunCount: 4, firstTimeFinishCount: 4 }),
      finishedBooks: [
        { title: 'А', isReread: false },
        { title: 'Б', isReread: false },
        { title: 'В', isReread: false },
        { title: 'Г', isReread: false },
      ],
    });
    expect(four.headline).toBe('Ти дочитав 4 книги.');
  });

  it('перечитування бере заголовок лише коли перших прочитань немає', () => {
    const rereadOnly = recap({
      summary: summary({ finishedRunCount: 1, rereadFinishCount: 1 }),
      finishedBooks: [{ title: 'Тигролови', isReread: true }],
    });
    expect(rereadOnly.headline).toBe('Ти перечитав «Тигролови».');
  });

  it('без завершень заголовок говорить про час, а не про книги', () => {
    const result = recap({ summary: summary({ sessionCount: 5, activeDays: 4, readingMinutes: 200 }) });
    expect(result.headline).toBe('Ти читав 4 дні — разом 3 год 20 хв.');
  });

  it('лише записи щоденника, без жодного сеансу — окремий випадок, не порожній період', () => {
    const result = recap({ summary: summary({ journalCount: 3 }) });
    expect(result.isEmpty).toBe(false);
    expect(result.headline).toContain('сеансів не записано');
    expect(result.headline).toContain('3 записи');
  });
});

describe('рядки не дублюють заголовок', () => {
  it('час і активні дні не повторюються, якщо їх уже сказав заголовок', () => {
    const result = recap({ summary: summary({ sessionCount: 5, activeDays: 4, readingMinutes: 200 }) });
    expect(lineIds(result)).not.toContain('time');
    expect(lineIds(result)).not.toContain('activeDays');
  });

  it('а якщо заголовок про книгу — час і дні виходять окремими рядками', () => {
    const result = recap({
      summary: summary({
        finishedRunCount: 1,
        firstTimeFinishCount: 1,
        sessionCount: 5,
        activeDays: 4,
        readingMinutes: 200,
      }),
      finishedBooks: [{ title: 'Тигролови', isReread: false }],
    });
    expect(lineText(result, 'activeDays')).toBe('Читав 4 дні із 7.');
    expect(lineText(result, 'time')).toBe('Разом — 3 год 20 хв.');
    expect(lineIds(result)).not.toContain('finished');
  });

  it('жоден факт не з\'являється двічі', () => {
    const result = recap({
      summary: summary({
        finishedRunCount: 3,
        firstTimeFinishCount: 2,
        rereadFinishCount: 1,
        dnfRunCount: 1,
        sessionCount: 9,
        activeDays: 5,
        readingMinutes: 300,
        pagesRead: 240,
        journalCount: 4,
        pagesPerHour: 48,
      }),
      finishedBooks: [
        { title: 'А', isReread: false },
        { title: 'Б', isReread: false },
        { title: 'В', isReread: true },
      ],
    });
    const ids = lineIds(result);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('перечитування ніколи не зливається з першим прочитанням (ТЗ §25)', () => {
  it('окремий рядок, навіть коли заголовок розповів про дочитані вперше', () => {
    const result = recap({
      summary: summary({ finishedRunCount: 2, firstTimeFinishCount: 1, rereadFinishCount: 1 }),
      finishedBooks: [
        { title: 'Нова', isReread: false },
        { title: 'Стара', isReread: true },
      ],
    });
    expect(result.headline).toBe('Ти дочитав «Нова».');
    expect(lineText(result, 'reread')).toBe('Повернувся до «Стара».');
  });
});

describe('відкладені книги — рішення, не поразка', () => {
  it('формулювання нейтральне', () => {
    const result = recap({ summary: summary({ dnfRunCount: 1, sessionCount: 2, activeDays: 2, readingMinutes: 60 }) });
    expect(lineText(result, 'dnf')).toBe('Відкладено 1 книгу.');
    expect(lineText(result, 'dnf')).not.toMatch(/кинув|покинув|не подужав|здався/i);
  });

  it('відкладена книга сама по собі не робить період порожнім', () => {
    expect(recap({ summary: summary({ dnfRunCount: 1 }) }).isEmpty).toBe(false);
  });
});

describe('темп і тривалість показуються лише коли їх є з чого порахувати', () => {
  it('без сторінок темпу немає (ТЗ §28)', () => {
    const result = recap({ summary: summary({ sessionCount: 2, activeDays: 2, readingMinutes: 60 }) });
    expect(lineIds(result)).not.toContain('pace');
  });

  it('сесії без записаної тривалості не дають «0 хв»', () => {
    const result = recap({
      summary: summary({ finishedRunCount: 1, firstTimeFinishCount: 1, sessionCount: 3, activeDays: 2 }),
      finishedBooks: [{ title: 'А', isReread: false }],
    });
    expect(lineText(result, 'time')).toBe('3 сеанси без записаної тривалості.');
    expect(JSON.stringify(result)).not.toContain('0 хв');
  });
});

describe('порівняння з попереднім періодом — симетричне й без наказів', () => {
  const current = summary({ sessionCount: 5, activeDays: 4, readingMinutes: 200 });

  it('більше — констатація', () => {
    const result = recap({ summary: current, previousSummary: summary({ readingMinutes: 160 }) });
    expect(lineText(result, 'comparison')).toBe('На 40 хв більше, ніж попереднього тижня.');
  });

  it('менше — ТАКА САМА констатація, без докору й наказового способу', () => {
    const result = recap({ summary: current, previousSummary: summary({ readingMinutes: 250 }) });
    expect(lineText(result, 'comparison')).toBe('На 50 хв менше, ніж попереднього тижня.');
    expect(lineText(result, 'comparison')).not.toMatch(/спробуй|варто|треба|на жаль|менше, ніж хотілось/i);
  });

  it('порівну — теж рядок, а не мовчання', () => {
    const result = recap({ summary: current, previousSummary: summary({ readingMinutes: 200 }) });
    expect(lineText(result, 'comparison')).toBe('Стільки ж часу, скільки попереднього тижня.');
  });

  it('порівняння з порожнім попереднім періодом НЕ показується', () => {
    expect(lineIds(recap({ summary: current, previousSummary: summary() }))).not.toContain('comparison');
    expect(lineIds(recap({ summary: current, previousSummary: null }))).not.toContain('comparison');
    expect(lineIds(recap({ summary: current }))).not.toContain('comparison');
  });

  it('місяць порівнюється з місяцем, а не з тижнем', () => {
    const result = buildReadingRecap({
      period: MONTH,
      summary: current,
      previousSummary: summary({ readingMinutes: 160 }),
    });
    expect(lineText(result, 'comparison')).toContain('попереднього місяця');
  });
});

describe('детермінованість (ТЗ §103)', () => {
  it('той самий вхід двічі дає побайтово той самий результат', () => {
    const input: ReadingRecapInput = {
      period: WEEK,
      summary: summary({
        finishedRunCount: 2,
        firstTimeFinishCount: 1,
        rereadFinishCount: 1,
        sessionCount: 7,
        activeDays: 5,
        readingMinutes: 321,
        pagesRead: 180,
        journalCount: 2,
        pagesPerHour: 33.6,
      }),
      previousSummary: summary({ readingMinutes: 100 }),
      finishedBooks: [
        { title: 'Перша', isReread: false },
        { title: 'Друга', isReread: true },
      ],
    };
    expect(JSON.stringify(buildReadingRecap(input))).toBe(JSON.stringify(buildReadingRecap(input)));
  });
});
