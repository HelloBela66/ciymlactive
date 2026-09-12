import {
  BADGE_ORDER,
  MARATHON_SESSION_MINUTES_THRESHOLD,
  MIN_HOURS_FOR_SLOW_IMMERSION_BADGE,
  SLOW_IMMERSION_MAX_PAGES_PER_HOUR,
  LONG_BOOK_AVERAGE_PAGES_THRESHOLD,
  MIN_FINISHED_BOOKS_FOR_SERIES_BADGE,
  SERIES_READER_MIN_SHARE,
  MIN_FINISHED_BOOKS_FOR_GENRE_EXPLORER_BADGE,
  GENRE_EXPLORER_MIN_DISTINCT_GENRES,
  MIN_NOTES_FOR_BADGE,
  MIN_QUOTES_FOR_BADGE,
  MAX_SHARE_CARD_BADGES,
  computeGlobalPace,
  isEveningReaderBadge,
  isMarathonReaderBadge,
  isSlowImmersionBadge,
  isLongStoriesLoverBadge,
  isSeriesReaderBadge,
  isGenreExplorerBadge,
  isNoteTakerBadge,
  isQuoteCollectorBadge,
  computeFingerprintBadges,
  selectShareCardBadges,
  type FingerprintInput,
  type BadgeId,
} from './readingFingerprint';
import type { TimeOfDayInsight } from './readingProfile';

function eveningInsight(): TimeOfDayInsight {
  return { timeOfDay: 'evening', count: 10, totalSessions: 10 };
}

function morningInsight(): TimeOfDayInsight {
  return { timeOfDay: 'morning', count: 10, totalSessions: 10 };
}

const EMPTY_INPUT: FingerprintInput = {
  timeOfDay: null,
  averageSessionMinutes: null,
  averagePages: null,
  globalPace: null,
  finishedBooksInSeriesCount: 0,
  finishedBooksTotalCount: 0,
  distinctGenresCount: 0,
  notesCount: 0,
  quotesCount: 0,
};

describe('isEveningReaderBadge', () => {
  it('якщо найчастіший час доби — вечір', () => {
    expect(isEveningReaderBadge(eveningInsight())).toBe(true);
  });

  it('не якщо найчастіший час доби інший', () => {
    expect(isEveningReaderBadge(morningInsight())).toBe(false);
  });

  it('не якщо insight ще не пройшов свій поріг у Reading Profile (null)', () => {
    expect(isEveningReaderBadge(null)).toBe(false);
  });
});

describe('isMarathonReaderBadge', () => {
  it('не нижче порогу', () => {
    expect(isMarathonReaderBadge(MARATHON_SESSION_MINUTES_THRESHOLD - 1)).toBe(false);
  });

  it('так рівно на порозі', () => {
    expect(isMarathonReaderBadge(MARATHON_SESSION_MINUTES_THRESHOLD)).toBe(true);
  });

  it('не якщо null (Profile insight ще не набрав вибірки)', () => {
    expect(isMarathonReaderBadge(null)).toBe(false);
  });
});

describe('computeGlobalPace', () => {
  it('null нижче мінімуму годин, навіть якщо темп технічно рахується', () => {
    const totalSeconds = (MIN_HOURS_FOR_SLOW_IMMERSION_BADGE - 1) * 3600;
    expect(computeGlobalPace(100, totalSeconds)).toBeNull();
  });

  it('рахує сторінок/годину рівно на порозі годин', () => {
    const totalSeconds = MIN_HOURS_FOR_SLOW_IMMERSION_BADGE * 3600;
    const result = computeGlobalPace(300, totalSeconds);
    expect(result).toEqual({ pagesPerHour: 20, totalHours: MIN_HOURS_FOR_SLOW_IMMERSION_BADGE });
  });

  it('null якщо жодної сторінки не прогорнуто', () => {
    const totalSeconds = MIN_HOURS_FOR_SLOW_IMMERSION_BADGE * 3600;
    expect(computeGlobalPace(0, totalSeconds)).toBeNull();
  });
});

describe('isSlowImmersionBadge', () => {
  it('так рівно на порозі сторінок/годину', () => {
    expect(isSlowImmersionBadge({ pagesPerHour: SLOW_IMMERSION_MAX_PAGES_PER_HOUR, totalHours: 20 })).toBe(true);
  });

  it('не якщо темп швидший за поріг', () => {
    expect(isSlowImmersionBadge({ pagesPerHour: SLOW_IMMERSION_MAX_PAGES_PER_HOUR + 1, totalHours: 20 })).toBe(false);
  });

  it('не якщо null', () => {
    expect(isSlowImmersionBadge(null)).toBe(false);
  });
});

describe('isLongStoriesLoverBadge', () => {
  it('не нижче порогу', () => {
    expect(isLongStoriesLoverBadge(LONG_BOOK_AVERAGE_PAGES_THRESHOLD - 1)).toBe(false);
  });

  it('так рівно на порозі', () => {
    expect(isLongStoriesLoverBadge(LONG_BOOK_AVERAGE_PAGES_THRESHOLD)).toBe(true);
  });

  it('не якщо null', () => {
    expect(isLongStoriesLoverBadge(null)).toBe(false);
  });
});

describe('isSeriesReaderBadge', () => {
  it('не нижче мінімальної кількості завершених книг, навіть якщо всі вони в серіях', () => {
    const total = MIN_FINISHED_BOOKS_FOR_SERIES_BADGE - 1;
    expect(isSeriesReaderBadge(total, total)).toBe(false);
  });

  it('не якщо частка нижча порогу', () => {
    const total = MIN_FINISHED_BOOKS_FOR_SERIES_BADGE * 10;
    const inSeries = Math.ceil(total * SERIES_READER_MIN_SHARE) - 1;
    expect(isSeriesReaderBadge(inSeries, total)).toBe(false);
  });

  it('так рівно на порозі частки й кількості', () => {
    const total = MIN_FINISHED_BOOKS_FOR_SERIES_BADGE;
    const inSeries = Math.ceil(total * SERIES_READER_MIN_SHARE);
    expect(isSeriesReaderBadge(inSeries, total)).toBe(true);
  });
});

describe('isGenreExplorerBadge', () => {
  it('не нижче мінімальної кількості завершених книг', () => {
    const total = MIN_FINISHED_BOOKS_FOR_GENRE_EXPLORER_BADGE - 1;
    expect(isGenreExplorerBadge(GENRE_EXPLORER_MIN_DISTINCT_GENRES + 10, total)).toBe(false);
  });

  it('не якщо унікальних жанрів менше порогу', () => {
    expect(
      isGenreExplorerBadge(GENRE_EXPLORER_MIN_DISTINCT_GENRES - 1, MIN_FINISHED_BOOKS_FOR_GENRE_EXPLORER_BADGE),
    ).toBe(false);
  });

  it('так рівно на обох порогах', () => {
    expect(
      isGenreExplorerBadge(GENRE_EXPLORER_MIN_DISTINCT_GENRES, MIN_FINISHED_BOOKS_FOR_GENRE_EXPLORER_BADGE),
    ).toBe(true);
  });
});

describe('isNoteTakerBadge / isQuoteCollectorBadge', () => {
  it('не нижче порогу нотаток', () => {
    expect(isNoteTakerBadge(MIN_NOTES_FOR_BADGE - 1)).toBe(false);
  });

  it('так рівно на порозі нотаток', () => {
    expect(isNoteTakerBadge(MIN_NOTES_FOR_BADGE)).toBe(true);
  });

  it('не нижче порогу цитат', () => {
    expect(isQuoteCollectorBadge(MIN_QUOTES_FOR_BADGE - 1)).toBe(false);
  });

  it('так рівно на порозі цитат', () => {
    expect(isQuoteCollectorBadge(MIN_QUOTES_FOR_BADGE)).toBe(true);
  });
});

describe('computeFingerprintBadges', () => {
  it('порожній список, коли жоден бейдж не пройшов поріг', () => {
    expect(computeFingerprintBadges(EMPTY_INPUT)).toEqual([]);
  });

  it('повертає лише кваліфіковані бейджі у фіксованому порядку BADGE_ORDER', () => {
    const input: FingerprintInput = {
      ...EMPTY_INPUT,
      notesCount: MIN_NOTES_FOR_BADGE,
      timeOfDay: eveningInsight(),
      averageSessionMinutes: MARATHON_SESSION_MINUTES_THRESHOLD,
    };
    // Вхід навмисно заданий у "неправильному" порядку (нотатки першими) — результат все одно
    // мусить іти в порядку BADGE_ORDER (evening_reader, marathon_reader, ..., note_taker).
    expect(computeFingerprintBadges(input)).toEqual(['evening_reader', 'marathon_reader', 'note_taker']);
  });

  it('усі вісім бейджів одночасно, якщо кожен пройшов поріг', () => {
    const input: FingerprintInput = {
      timeOfDay: eveningInsight(),
      averageSessionMinutes: MARATHON_SESSION_MINUTES_THRESHOLD,
      averagePages: LONG_BOOK_AVERAGE_PAGES_THRESHOLD,
      globalPace: { pagesPerHour: SLOW_IMMERSION_MAX_PAGES_PER_HOUR, totalHours: 20 },
      finishedBooksInSeriesCount: MIN_FINISHED_BOOKS_FOR_GENRE_EXPLORER_BADGE,
      finishedBooksTotalCount: MIN_FINISHED_BOOKS_FOR_GENRE_EXPLORER_BADGE,
      distinctGenresCount: GENRE_EXPLORER_MIN_DISTINCT_GENRES,
      notesCount: MIN_NOTES_FOR_BADGE,
      quotesCount: MIN_QUOTES_FOR_BADGE,
    };
    expect(computeFingerprintBadges(input)).toEqual(BADGE_ORDER);
  });
});

describe('selectShareCardBadges', () => {
  it('не обрізає, коли бейджів не більше максимуму', () => {
    const badges: BadgeId[] = BADGE_ORDER.slice(0, MAX_SHARE_CARD_BADGES);
    expect(selectShareCardBadges(badges)).toEqual(badges);
  });

  it('обрізає до MAX_SHARE_CARD_BADGES, лишаючи найпріоритетніші першими', () => {
    expect(selectShareCardBadges(BADGE_ORDER)).toEqual(BADGE_ORDER.slice(0, MAX_SHARE_CARD_BADGES));
    expect(selectShareCardBadges(BADGE_ORDER)).toHaveLength(MAX_SHARE_CARD_BADGES);
  });
});
