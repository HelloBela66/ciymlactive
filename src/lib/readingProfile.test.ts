import {
  bucketTimeOfDay,
  computeTimeOfDayInsight,
  formatTimeOfDaySentence,
  computeAverageSessionMinutes,
  formatAverageSessionSentence,
  computeTopGenre,
  formatTopGenreSentence,
  computeTopRatedGenre,
  formatTopRatedGenreSentence,
  formatGroup,
  computeFormatInsight,
  formatFormatSentence,
  computeAveragePages,
  formatAveragePagesSentence,
  MIN_SESSIONS_FOR_TIME_OF_DAY,
  MIN_SESSIONS_FOR_AVG_DURATION,
  MIN_BOOKS_FOR_TOP_GENRE,
  MIN_RATED_BOOKS_FOR_GENRE_RATING,
  MIN_SESSIONS_PER_FORMAT_SIDE,
  MIN_BOOKS_FOR_AVG_PAGES,
} from './readingProfile';

describe('bucketTimeOfDay', () => {
  it('ділить добу на чотири межі: <6 ніч, <12 ранок, <18 день, інакше вечір', () => {
    expect(bucketTimeOfDay(0)).toBe('night');
    expect(bucketTimeOfDay(5)).toBe('night');
    expect(bucketTimeOfDay(6)).toBe('morning');
    expect(bucketTimeOfDay(11)).toBe('morning');
    expect(bucketTimeOfDay(12)).toBe('afternoon');
    expect(bucketTimeOfDay(17)).toBe('afternoon');
    expect(bucketTimeOfDay(18)).toBe('evening');
    expect(bucketTimeOfDay(23)).toBe('evening');
  });
});

describe('computeTimeOfDayInsight', () => {
  it('повертає null нижче порогу вибірки', () => {
    const hours = Array(MIN_SESSIONS_FOR_TIME_OF_DAY - 1).fill(20);
    expect(computeTimeOfDayInsight(hours)).toBeNull();
  });

  it('обирає найчастіший кошик рівно на порозі вибірки', () => {
    const hours = [...Array(6).fill(20), ...Array(4).fill(8)]; // 10 сесій, 6 вечірніх
    const insight = computeTimeOfDayInsight(hours);
    expect(insight).toEqual({ timeOfDay: 'evening', count: 6, totalSessions: 10 });
  });

  it('формує речення з правильним прислівником', () => {
    expect(formatTimeOfDaySentence({ timeOfDay: 'evening', count: 6, totalSessions: 10 })).toBe(
      'Найчастіше читаєш увечері.',
    );
    expect(formatTimeOfDaySentence({ timeOfDay: 'night', count: 6, totalSessions: 10 })).toBe(
      'Найчастіше читаєш вночі.',
    );
  });
});

describe('computeAverageSessionMinutes', () => {
  it('повертає null нижче порогу вибірки', () => {
    const durations = Array(MIN_SESSIONS_FOR_AVG_DURATION - 1).fill(1800);
    expect(computeAverageSessionMinutes(durations)).toBeNull();
  });

  it('рахує середнє в хвилинах, округлено', () => {
    // 5 сесій по 38 хвилин рівно
    const durations = Array(5).fill(38 * 60);
    expect(computeAverageSessionMinutes(durations)).toBe(38);
    expect(formatAverageSessionSentence(38)).toBe('Середня сесія — 38 хв.');
  });

  it('округлює до найближчої хвилини', () => {
    const durations = [100, 200, 300, 400, 1000]; // sum=2000s, /5=400s=6.67min -> 7
    expect(computeAverageSessionMinutes(durations)).toBe(7);
  });
});

describe('computeTopGenre', () => {
  it('повертає null нижче порогу книг', () => {
    const counts = new Map([['Фентезі', 10]]);
    expect(computeTopGenre(counts, MIN_BOOKS_FOR_TOP_GENRE - 1)).toBeNull();
  });

  it('обирає жанр з найбільшою кількістю на порозі', () => {
    const counts = new Map([
      ['Фентезі', 3],
      ['Детектив', 2],
    ]);
    expect(computeTopGenre(counts, MIN_BOOKS_FOR_TOP_GENRE)).toEqual({ name: 'Фентезі', count: 3 });
    expect(formatTopGenreSentence({ name: 'Фентезі', count: 3 })).toBe('Найчастіше читаєш жанр «Фентезі».');
  });
});

describe('computeTopRatedGenre', () => {
  it('пропускає жанри нижче порогу оцінених книг', () => {
    const sums = new Map([
      ['Фентезі', { sum: 5, count: 1 }], // нижче порогу — пропущено
      ['Детектив', { sum: 12, count: 3 }], // на порозі — average 4.0
    ]);
    expect(computeTopRatedGenre(sums)).toEqual({ name: 'Детектив', averageValue: 4, count: 3 });
  });

  it('повертає null, коли жоден жанр не дотягує до порогу', () => {
    const sums = new Map([['Фентезі', { sum: 5, count: MIN_RATED_BOOKS_FOR_GENRE_RATING - 1 }]]);
    expect(computeTopRatedGenre(sums)).toBeNull();
  });

  it('обирає жанр з найвищою середньою оцінкою серед тих, що дотягують', () => {
    const sums = new Map([
      ['Фентезі', { sum: 12, count: 4 }], // 3.0
      ['Детектив', { sum: 14, count: 4 }], // 3.5
    ]);
    expect(computeTopRatedGenre(sums)).toEqual({ name: 'Детектив', averageValue: 3.5, count: 4 });
    expect(formatTopRatedGenreSentence({ name: 'Детектив', averageValue: 3.5, count: 4 })).toBe(
      'Найвищу середню оцінку отримує жанр «Детектив».',
    );
  });
});

describe('formatGroup', () => {
  it('hardcover/paperback/other — фізична; ebook/audiobook — цифрова', () => {
    expect(formatGroup('hardcover')).toBe('physical');
    expect(formatGroup('paperback')).toBe('physical');
    expect(formatGroup('other')).toBe('physical');
    expect(formatGroup('ebook')).toBe('digital');
    expect(formatGroup('audiobook')).toBe('digital');
  });
});

describe('computeFormatInsight', () => {
  it('повертає null, якщо хоч одна сторона нижче свого порогу', () => {
    expect(computeFormatInsight(MIN_SESSIONS_PER_FORMAT_SIDE - 1, 100)).toBeNull();
    expect(computeFormatInsight(100, MIN_SESSIONS_PER_FORMAT_SIDE - 1)).toBeNull();
  });

  it('обирає сторону з більшою кількістю сесій, коли обидві дотягують до порогу', () => {
    expect(computeFormatInsight(10, 5)).toEqual({ preferred: 'physical', physicalCount: 10, digitalCount: 5 });
    expect(computeFormatInsight(5, 10)).toEqual({ preferred: 'digital', physicalCount: 5, digitalCount: 10 });
  });

  it('нічия йде на користь фізичних (>=), і формує відповідне речення', () => {
    const insight = computeFormatInsight(7, 7);
    expect(insight).toEqual({ preferred: 'physical', physicalCount: 7, digitalCount: 7 });
    expect(formatFormatSentence(insight!)).toBe('Частіше читаєш паперові книги.');
    expect(formatFormatSentence({ preferred: 'digital', physicalCount: 5, digitalCount: 9 })).toBe(
      'Частіше читаєш цифрові книги.',
    );
  });
});

describe('computeAveragePages', () => {
  it('повертає null нижче порогу книг', () => {
    const pages = Array(MIN_BOOKS_FOR_AVG_PAGES - 1).fill(300);
    expect(computeAveragePages(pages)).toBeNull();
  });

  it('рахує середнє округлено і формує речення з правильною формою слова', () => {
    const pages = [400, 450, 500, 490, 590]; // sum=2430, /5=486
    expect(computeAveragePages(pages)).toBe(486);
    expect(formatAveragePagesSentence(486)).toBe('Середня завершена книга — 486 сторінок.');
    expect(formatAveragePagesSentence(1)).toBe('Середня завершена книга — 1 сторінка.');
    expect(formatAveragePagesSentence(2)).toBe('Середня завершена книга — 2 сторінки.');
  });
});
