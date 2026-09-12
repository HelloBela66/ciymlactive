import {
  TBR_SCOPE_STATUSES,
  MAX_EXPLANATION_REASONS,
  filterCandidates,
  matchesDesiredMood,
  rankCandidates,
  pickCandidate,
  estimateMinutesToRead,
  formatSeriesStatus,
  buildPickExplanation,
  type PickerCandidate,
  type PickerFilters,
} from './onePicker';
import { FALLBACK_PAGES_PER_MINUTE } from './readingPace';

function candidate(overrides: Partial<PickerCandidate> = {}): PickerCandidate {
  return {
    userBookId: 'ub-1',
    status: 'want_to_read',
    pageCount: 300,
    genreIds: ['genre-fantasy'],
    genreNames: ['Фентезі'],
    isInSeries: false,
    isOwned: false,
    descriptionText: null,
    ...overrides,
  };
}

const BASE_FILTERS: PickerFilters = {
  genreId: null,
  timeBudget: 'medium',
  desiredMood: null,
  maxPages: null,
  seriesFilter: 'any',
  tbrScope: 'tbr',
  ownershipScope: 'any',
};

describe('filterCandidates', () => {
  it('лишає лише статуси свого TbrScope', () => {
    const candidates = [
      candidate({ userBookId: 'a', status: 'want_to_read' }),
      candidate({ userBookId: 'b', status: 'paused' }),
      candidate({ userBookId: 'c', status: 'reading' }),
    ];
    expect(filterCandidates(candidates, BASE_FILTERS).map((c) => c.userBookId)).toEqual(['a']);
    expect(
      filterCandidates(candidates, { ...BASE_FILTERS, tbrScope: 'any_unread' }).map((c) => c.userBookId),
    ).toEqual(['a', 'b']);
  });

  it('фільтрує за жанром, коли genreId заданий', () => {
    const candidates = [
      candidate({ userBookId: 'a', genreIds: ['g1'] }),
      candidate({ userBookId: 'b', genreIds: ['g2'] }),
    ];
    expect(filterCandidates(candidates, { ...BASE_FILTERS, genreId: 'g1' }).map((c) => c.userBookId)).toEqual(['a']);
  });

  it('максимальна довжина виключає лише книги з ВІДОМОЮ довжиною понад ліміт', () => {
    const candidates = [
      candidate({ userBookId: 'short', pageCount: 200 }),
      candidate({ userBookId: 'long', pageCount: 900 }),
      candidate({ userBookId: 'unknown', pageCount: null }),
    ];
    const result = filterCandidates(candidates, { ...BASE_FILTERS, maxPages: 300 }).map((c) => c.userBookId);
    expect(result).toEqual(['short', 'unknown']);
  });

  it('фільтр серійності: standalone виключає книги в серії, series виключає книги поза серією', () => {
    const candidates = [
      candidate({ userBookId: 'solo', isInSeries: false }),
      candidate({ userBookId: 'part', isInSeries: true }),
    ];
    expect(
      filterCandidates(candidates, { ...BASE_FILTERS, seriesFilter: 'standalone' }).map((c) => c.userBookId),
    ).toEqual(['solo']);
    expect(
      filterCandidates(candidates, { ...BASE_FILTERS, seriesFilter: 'series' }).map((c) => c.userBookId),
    ).toEqual(['part']);
  });

  it('ownershipScope=owned лишає лише позначені фізично своїми', () => {
    const candidates = [
      candidate({ userBookId: 'mine', isOwned: true }),
      candidate({ userBookId: 'not-mine', isOwned: false }),
    ];
    expect(
      filterCandidates(candidates, { ...BASE_FILTERS, ownershipScope: 'owned' }).map((c) => c.userBookId),
    ).toEqual(['mine']);
  });
});

describe('TBR_SCOPE_STATUSES', () => {
  it('any_unread не включає активні/завершені статуси', () => {
    expect(TBR_SCOPE_STATUSES.any_unread).not.toContain('reading');
    expect(TBR_SCOPE_STATUSES.any_unread).not.toContain('rereading');
    expect(TBR_SCOPE_STATUSES.any_unread).not.toContain('finished');
  });
});

describe('matchesDesiredMood', () => {
  it('false, коли настрій не заданий (без переваги)', () => {
    expect(matchesDesiredMood(candidate(), null)).toBe(false);
  });

  it('true, коли ключове слово настрою є серед назв жанрів', () => {
    const c = candidate({ genreNames: ['Гумор', 'Комедія'] });
    expect(matchesDesiredMood(c, 'laugh')).toBe(true);
  });

  it('true, коли ключове слово є в описі твору', () => {
    const c = candidate({ genreNames: [], descriptionText: 'Неможливо відірватися від цієї історії.' });
    expect(matchesDesiredMood(c, 'absorbed')).toBe(true);
  });

  it('false, коли жодного ключового слова немає ніде — не вигадується', () => {
    const c = candidate({ genreNames: ['Наука'], descriptionText: 'Підручник з фізики.' });
    expect(matchesDesiredMood(c, 'cry')).toBe(false);
  });
});

describe('rankCandidates', () => {
  it('серед кандидатів з тим самим збігом настрою — ближчий за сторінками йде першим', () => {
    const near = candidate({ userBookId: 'near', pageCount: 300 });
    const far = candidate({ userBookId: 'far', pageCount: 900 });
    const ranked = rankCandidates([far, near], 300, null);
    expect(ranked.map((r) => r.candidate.userBookId)).toEqual(['near', 'far']);
  });

  it('кандидат зі збігом настрою йде перед кандидатом без збігу, навіть якщо той ближчий за сторінками', () => {
    const closeNoMood = candidate({ userBookId: 'close', pageCount: 300, genreNames: ['Наука'] });
    const farMoodMatch = candidate({ userBookId: 'far-mood', pageCount: 900, genreNames: ['Комедія'] });
    const ranked = rankCandidates([closeNoMood, farMoodMatch], 300, 'laugh');
    expect(ranked.map((r) => r.candidate.userBookId)).toEqual(['far-mood', 'close']);
  });

  it('невідома довжина сортується в кінець своєї групи, не виключається', () => {
    const known = candidate({ userBookId: 'known', pageCount: 500 });
    const unknown = candidate({ userBookId: 'unknown', pageCount: null });
    const ranked = rankCandidates([unknown, known], 300, null);
    expect(ranked.map((r) => r.candidate.userBookId)).toEqual(['known', 'unknown']);
    expect(ranked[1]!.distance).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('pickCandidate', () => {
  it('null на порожньому списку', () => {
    expect(pickCandidate([])).toBeNull();
  });

  it('обирає єдиного кандидата, коли він один', () => {
    const ranked = rankCandidates([candidate()], 300, null);
    expect(pickCandidate(ranked)?.candidate.userBookId).toBe('ub-1');
  });

  it('обирає лише серед перших poolSize (детермінований rng=1 бере останній елемент пулу)', () => {
    const candidates = Array.from({ length: 8 }, (_, i) => candidate({ userBookId: `c${i}`, pageCount: 300 + i }));
    const ranked = rankCandidates(candidates, 300, null);
    // rng, що завжди повертає значення трохи менше 1 — Math.floor(0.999 * poolSize) = poolSize - 1.
    const picked = pickCandidate(ranked, 5, () => 0.999);
    expect(picked?.candidate.userBookId).toBe('c4');
  });
});

describe('estimateMinutesToRead', () => {
  it('null, коли довжина невідома', () => {
    expect(estimateMinutesToRead(null, 1)).toBeNull();
  });

  it('рахує за заданим темпом, коли він додатний', () => {
    expect(estimateMinutesToRead(300, 1)).toBe(300);
  });

  it('використовує FALLBACK_PAGES_PER_MINUTE, коли темп 0 (немає історії читання)', () => {
    expect(estimateMinutesToRead(300, 0)).toBe(Math.round(300 / FALLBACK_PAGES_PER_MINUTE));
  });
});

describe('formatSeriesStatus', () => {
  it('"Окрема історія" для null контексту', () => {
    expect(formatSeriesStatus(null)).toBe('Окрема історія');
  });

  it('з позицією — "N-а книга серії"', () => {
    expect(formatSeriesStatus({ seriesName: 'Відьмак', position: 3 })).toBe('3-а книга серії «Відьмак»');
  });

  it('без позиції — "Частина серії"', () => {
    expect(formatSeriesStatus({ seriesName: 'Відьмак', position: null })).toBe('Частина серії «Відьмак»');
  });
});

describe('buildPickExplanation', () => {
  it('завжди містить причину часового бюджету', () => {
    const text = buildPickExplanation({ filters: BASE_FILTERS, moodMatched: false, isOwned: false });
    expect(text).toContain('у тебе є кілька вечорів на цю книгу');
  });

  it('додає причину настрою лише коли настрій заданий і збігся', () => {
    const withMood = buildPickExplanation({
      filters: { ...BASE_FILTERS, desiredMood: 'absorbed' },
      moodMatched: true,
      isOwned: false,
    });
    expect(withMood).toContain('атмосферне');

    const withoutMatch = buildPickExplanation({
      filters: { ...BASE_FILTERS, desiredMood: 'absorbed' },
      moodMatched: false,
      isOwned: false,
    });
    expect(withoutMatch).not.toContain('атмосферне');
  });

  it('додає причину володіння лише коли isOwned true', () => {
    const owned = buildPickExplanation({ filters: BASE_FILTERS, moodMatched: false, isOwned: true });
    expect(owned).toContain('уже маєш цю книгу на полиці');

    const notOwned = buildPickExplanation({ filters: BASE_FILTERS, moodMatched: false, isOwned: false });
    expect(notOwned).not.toContain('уже маєш цю книгу на полиці');
  });

  it('не більше MAX_EXPLANATION_REASONS причин навіть коли всі сигнали спрацювали', () => {
    const text = buildPickExplanation({
      filters: { ...BASE_FILTERS, desiredMood: 'absorbed', seriesFilter: 'standalone', genreId: 'g1' },
      moodMatched: true,
      isOwned: true,
    });
    // П'ять потенційних причин (час/настрій/володіння/серія/жанр) — має лишитись лише перші
    // MAX_EXPLANATION_REASONS (3): час, настрій, володіння; серія й жанр відсічені.
    expect(MAX_EXPLANATION_REASONS).toBe(3);
    expect(text).not.toContain('окрема історія');
    expect(text).not.toContain('той жанр, який ти шукаєш');
  });
});
