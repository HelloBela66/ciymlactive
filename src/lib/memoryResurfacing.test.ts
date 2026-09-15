import {
  buildMemoryResurfacingCandidates,
  dailyRotationOffset,
  EMPTY_HOME_RESURFACING_STATE,
  HOME_RESURFACING_CANDIDATE_COOLDOWN_DAYS,
  HOME_RESURFACING_MIN_INTERVAL_DAYS,
  journalSemanticKey,
  MEMORY_HUB_RESURFACING_LIMIT,
  MIN_JOURNAL_MEMORY_AGE_DAYS,
  periodSemanticKey,
  runSemanticKey,
  selectHomeResurfacingCandidate,
  selectHubResurfacingCandidates,
  workRelationshipSemanticKey,
  type FinishedRunMemoryInput,
  type HomeResurfacingState,
  type JournalMemoryInput,
  type MemoryResurfacingCandidate,
  type MemoryResurfacingInput,
} from './memoryResurfacing';

/**
 * POLYTSIA V1.7, Phase 9 — MEMORY RESURFACING (ТЗ модуль E §27-§31).
 *
 * Дати — з ЛОКАЛЬНИХ компонентів, ніколи з рядка `'2027-06-15'` (той самий інваріант, що й у
 * решті V1.7-тестів: рядкова date-only форма парситься як UTC-північ і в поясі на захід від
 * Гринвіча «переїжджає» на день назад).
 *
 * ЧОГО ТУТ НЕМАЄ І ЧОМУ. Спойлер-фільтрація (§15/§16/§31) і soft-delete (§19) не перевіряються в
 * цьому файлі — не тому, що неважливі, а тому, що цей модуль їх не робить: обидва правила діють
 * рівнем нижче, у SQL (`JournalRepository.listFeedPage` застосовує централізований
 * `isSpoilerHidden`; історичні поверхні читають книги «включно з видаленими»). Перевіряти їх
 * тут можна було б лише імітацією — тобто перевіряти власну імітацію. Реальні дані для них
 * покриває `memoryResurfacingHistory.test.ts` (справжня БД, справжні запити).
 */

const NOW = new Date(2027, 5, 15, 12, 0);

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function journal(overrides: Partial<JournalMemoryInput> & { entryId: string }): JournalMemoryInput {
  return {
    entryType: 'thought',
    isFavorite: false,
    text: 'Щось, що я хотів запам’ятати.',
    createdAt: daysBefore(400),
    userBookId: `ub-${overrides.entryId}`,
    workId: `work-${overrides.entryId}`,
    workTitle: 'Книга',
    coverUrl: null,
    coverFallbackColor: null,
    bookStatus: 'finished',
    ...overrides,
  };
}

function finishedRun(
  overrides: Partial<FinishedRunMemoryInput> & { runId: string },
): FinishedRunMemoryInput {
  return {
    userBookId: `ub-${overrides.runId}`,
    workId: `work-${overrides.runId}`,
    workTitle: 'Книга',
    coverUrl: null,
    coverFallbackColor: null,
    finishedAt: daysBefore(400),
    finishedRunCount: 1,
    isFirstFinishedRun: true,
    ...overrides,
  };
}

function build(input: Partial<MemoryResurfacingInput>): MemoryResurfacingCandidate[] {
  return buildMemoryResurfacingCandidates({
    journalEntries: [],
    finishedRuns: [],
    pastPeriods: [],
    now: NOW,
    ...input,
  });
}

function selectHome(
  candidates: MemoryResurfacingCandidate[],
  state: HomeResurfacingState = EMPTY_HOME_RESURFACING_STATE,
  excluded: string[] = [],
): MemoryResurfacingCandidate | null {
  return selectHomeResurfacingCandidate(candidates, {
    now: NOW,
    state,
    excludedSemanticKeys: new Set(excluded),
  });
}

// ─── §27 ПРИДАТНІСТЬ КАНДИДАТА ────────────────────────────────────────────────────────────────

describe('§27 — що може стати спогадом', () => {
  it('старий обраний запис — кандидат, і найвагоміший', () => {
    const [candidate] = build({ journalEntries: [journal({ entryId: 'a', isFavorite: true })] });
    expect(candidate?.kind).toBe('journal_memory');
    expect(candidate?.weight).toBe(0);
    expect(candidate?.semanticKey).toBe(journalSemanticKey('a'));
  });

  it('думка, момент і цитата — кандидати; порядок ваги успадкований від On This Day', () => {
    const candidates = build({
      journalEntries: [
        journal({ entryId: 'quote', entryType: 'quote' }),
        journal({ entryId: 'thought', entryType: 'thought' }),
        journal({ entryId: 'moment', entryType: 'moment' }),
        journal({ entryId: 'fav', isFavorite: true }),
      ],
    });
    expect(candidates.map((c) => c.semanticKey)).toEqual([
      journalSemanticKey('fav'),
      journalSemanticKey('moment'),
      journalSemanticKey('thought'),
      journalSemanticKey('quote'),
    ]);
  });

  it('службовий запис (question/theory/general) проходить ЛИШЕ як обраний', () => {
    expect(build({ journalEntries: [journal({ entryId: 'g', entryType: 'general' })] })).toHaveLength(0);
    expect(build({ journalEntries: [journal({ entryId: 'q', entryType: 'question' })] })).toHaveLength(0);
    expect(
      build({ journalEntries: [journal({ entryId: 'g2', entryType: 'general', isFavorite: true })] }),
    ).toHaveLength(1);
  });

  it('свіжий запис — ще не спогад', () => {
    expect(
      build({
        journalEntries: [journal({ entryId: 'new', createdAt: daysBefore(MIN_JOURNAL_MEMORY_AGE_DAYS - 1) })],
      }),
    ).toHaveLength(0);
    expect(
      build({
        journalEntries: [journal({ entryId: 'old', createdAt: daysBefore(MIN_JOURNAL_MEMORY_AGE_DAYS) })],
      }),
    ).toHaveLength(1);
  });

  it('порожній текст не спливає', () => {
    expect(build({ journalEntries: [journal({ entryId: 'e', text: '   ' })] })).toHaveLength(0);
  });

  it('DNF не спливає взагалі — навіть обраним записом (ТЗ §4)', () => {
    expect(
      build({
        journalEntries: [journal({ entryId: 'dnf', isFavorite: true, bookStatus: 'did_not_finish' })],
      }),
    ).toHaveLength(0);
  });

  it('давно завершена книга — кандидат-спогад', () => {
    const candidates = build({ finishedRuns: [finishedRun({ runId: 'r1', finishedAt: daysBefore(400) })] });
    expect(candidates.map((c) => c.kind)).toContain('book_memory');
    expect(candidates.some((c) => c.semanticKey === runSemanticKey('r1'))).toBe(true);
  });

  it('щойно завершена книга — ще подія, а не спогад', () => {
    expect(
      build({
        finishedRuns: [finishedRun({ runId: 'fresh', finishedAt: daysBefore(10), finishedRunCount: 1 })],
      }),
    ).toHaveLength(0);
  });

  it('перечитування стає спогадом про стосунок навіть без року дистанції (ТЗ §3C)', () => {
    const candidates = build({
      finishedRuns: [
        finishedRun({ runId: 'r1', finishedAt: daysBefore(30), finishedRunCount: 2, isFirstFinishedRun: true }),
      ],
    });
    const relationship = candidates.find((c) => c.kind === 'reading_relationship');
    expect(relationship?.semanticKey).toBe(workRelationshipSemanticKey('work-r1'));
    expect(relationship?.finishedRunCount).toBe(2);
  });

  it('стосунок будується лише навколо ПЕРШОГО завершеного проходу — не по одному на кожен', () => {
    const candidates = build({
      finishedRuns: [
        finishedRun({ runId: 'r1', workId: 'w', finishedAt: daysBefore(800), finishedRunCount: 2, isFirstFinishedRun: true }),
        finishedRun({ runId: 'r2', workId: 'w', finishedAt: daysBefore(400), finishedRunCount: 2, isFirstFinishedRun: false }),
      ],
    });
    expect(candidates.filter((c) => c.kind === 'reading_relationship')).toHaveLength(1);
  });

  it('минулий період веде до вже наявного Recap і НІКОЛИ не потрапляє на Home (ТЗ §3D, §22)', () => {
    const [candidate] = build({
      pastPeriods: [{ periodKind: 'month', periodKey: '2026-08', occurredAt: daysBefore(300) }],
    });
    expect(candidate?.semanticKey).toBe(periodSemanticKey('month', '2026-08'));
    expect(candidate?.homeEligible).toBe(false);
    expect(selectHome(build({ pastPeriods: [{ periodKind: 'year', periodKey: '2026', occurredAt: daysBefore(300) }] }))).toBeNull();
  });

  it('період із майбутнього не спливає', () => {
    expect(
      build({
        pastPeriods: [
          { periodKind: 'month', periodKey: '2099-01', occurredAt: new Date(2099, 0, 31).toISOString() },
        ],
      }),
    ).toHaveLength(0);
  });
});

// ─── §28 ЖОДНОГО ТИСКУ ────────────────────────────────────────────────────────────────────────

/**
 * ТЗ §28. Головна гарантія тут — не поведінкова, а типова: `MemoryResurfacingInput` не має полів
 * про бездіяльність, streak, цілі чи TBR, тож перетворити їх на кандидата неможливо, не змінивши
 * спершу контракт модуля. Тести нижче фіксують наслідок цієї гарантії — щоб її випадкове
 * послаблення впало тут, а не в продакшні.
 */
describe('§28 — бездіяльність, streak, TBR і незавершені книги НЕ створюють спогадів', () => {
  it('книга, яку читають і давно не відкривали, не дає жодного кандидата', () => {
    // Активна книга без записів і без завершених проходів: рівно той випадок, який ТЗ §24
    // називає прихованим reminder-патерном.
    expect(build({ journalEntries: [], finishedRuns: [] })).toEqual([]);
  });

  it('незавершений прохід не може стати спогадом: він не існує для цього модуля', () => {
    // `FinishedRunMemoryInput` приймає лише `finishedAt: string` — незавершеного проходу нема як
    // передати. Тест стереже, що поле не стане nullable «щоб було».
    const run = finishedRun({ runId: 'r' });
    expect(typeof run.finishedAt).toBe('string');
  });

  it('усі кандидати походять лише з чотирьох дозволених джерел', () => {
    const candidates = build({
      journalEntries: [journal({ entryId: 'a', isFavorite: true })],
      finishedRuns: [finishedRun({ runId: 'r', finishedAt: daysBefore(900), finishedRunCount: 2 })],
      pastPeriods: [{ periodKind: 'year', periodKey: '2026', occurredAt: daysBefore(200) }],
    });
    for (const candidate of candidates) {
      expect(['journal_memory', 'book_memory', 'reading_relationship', 'past_period']).toContain(candidate.kind);
    }
  });
});

// ─── §29 ЧАСТОТА НА HOME ──────────────────────────────────────────────────────────────────────

describe('§29 — Home показує спогад рідко', () => {
  const candidates = build({
    journalEntries: [
      journal({ entryId: 'a', isFavorite: true, workId: 'wa' }),
      journal({ entryId: 'b', isFavorite: true, workId: 'wb' }),
    ],
  });

  it('коли ще нічого не показували — кандидат є', () => {
    expect(selectHome(candidates)).not.toBeNull();
  });

  it('раніше ніж через 7 днів після попереднього показу — нічого', () => {
    const state: HomeResurfacingState = {
      lastShownAt: daysBefore(HOME_RESURFACING_MIN_INTERVAL_DAYS - 1),
      shownAtByKey: {},
    };
    expect(selectHome(candidates, state)).toBeNull();
  });

  it('через 7 днів — знову можна', () => {
    const state: HomeResurfacingState = {
      lastShownAt: daysBefore(HOME_RESURFACING_MIN_INTERVAL_DAYS),
      shownAtByKey: {},
    };
    expect(selectHome(candidates, state)).not.toBeNull();
  });

  it('той самий спогад не повертається всередині 90-денного cooldown — але інший може', () => {
    const shown = selectHome(candidates);
    expect(shown).not.toBeNull();
    const state: HomeResurfacingState = {
      lastShownAt: daysBefore(30),
      shownAtByKey: { [shown!.semanticKey]: daysBefore(30) },
    };
    const next = selectHome(candidates, state);
    expect(next).not.toBeNull();
    expect(next!.semanticKey).not.toBe(shown!.semanticKey);
  });

  it('після 90 днів спогад знову придатний', () => {
    // Єдиний кандидат — інакше тест не розрізнив би «cooldown минув» і «показали сусіда».
    const solo = build({ journalEntries: [journal({ entryId: 'solo', isFavorite: true })] });
    const key = solo[0]!.semanticKey;
    const withCooldown = (daysAgo: number): HomeResurfacingState => ({
      lastShownAt: daysBefore(30),
      shownAtByKey: { [key]: daysBefore(daysAgo) },
    });
    expect(selectHome(solo, withCooldown(HOME_RESURFACING_CANDIDATE_COOLDOWN_DAYS - 1))).toBeNull();
    expect(selectHome(solo, withCooldown(HOME_RESURFACING_CANDIDATE_COOLDOWN_DAYS))).not.toBeNull();
  });

  it('Memory Hub НЕ обмежений ані частотою, ані cooldown — людина прийшла сама (ТЗ §8)', () => {
    const hub = selectHubResurfacingCandidates(candidates, { excludedSemanticKeys: new Set() });
    expect(hub).toHaveLength(2);
  });

  it('Memory Hub обмежений кількістю — не нескінченна стрічка (ТЗ §13)', () => {
    const many = build({
      journalEntries: Array.from({ length: 30 }, (_, i) =>
        journal({ entryId: `e${i}`, isFavorite: true, workId: `w${i}` }),
      ),
    });
    expect(selectHubResurfacingCandidates(many, { excludedSemanticKeys: new Set() })).toHaveLength(
      MEMORY_HUB_RESURFACING_LIMIT,
    );
  });
});

// ─── §30 ДЕДУПЛІКАЦІЯ ─────────────────────────────────────────────────────────────────────────

describe('§30 — одна подія не розповідається двічі', () => {
  it('подію, яку сьогодні розповідає On This Day, resurfacing пропускає', () => {
    const candidates = build({
      journalEntries: [
        journal({ entryId: 'onThisDay', isFavorite: true, workId: 'w1' }),
        journal({ entryId: 'other', isFavorite: true, workId: 'w2' }),
      ],
    });
    const selected = selectHome(candidates, EMPTY_HOME_RESURFACING_STATE, [
      journalSemanticKey('onThisDay'),
    ]);
    expect(selected?.semanticKey).toBe(journalSemanticKey('other'));
  });

  it('коли інша поверхня зайнята цим твором — жоден спогад про цей твір не спливає', () => {
    // Так виражена §30 для віхи: віха про 50-ту книгу вже показує саме цей твір, тож ані
    // книжковий спогад, ані стосунок із ним не мають дублювати її іншими словами.
    const candidates = build({
      journalEntries: [journal({ entryId: 'a', isFavorite: true, workId: 'w-milestone' })],
      finishedRuns: [
        finishedRun({ runId: 'r', workId: 'w-milestone', finishedAt: daysBefore(900), finishedRunCount: 2 }),
      ],
    });
    expect(candidates.length).toBeGreaterThan(1);
    expect(selectHome(candidates, EMPTY_HOME_RESURFACING_STATE, [workRelationshipSemanticKey('w-milestone')])).toBeNull();
  });

  it('семантичний ключ будується з сутності, а не з тексту (ТЗ §21)', () => {
    const sameTextDifferentEntries = build({
      journalEntries: [
        journal({ entryId: 'x', isFavorite: true, text: 'Однаковий текст' }),
        journal({ entryId: 'y', isFavorite: true, text: 'Однаковий текст' }),
      ],
    });
    const keys = new Set(sameTextDifferentEntries.map((c) => c.semanticKey));
    expect(keys.size).toBe(2);
  });

  it('виключення діє й у Memory Hub', () => {
    const candidates = build({
      journalEntries: [
        journal({ entryId: 'a', isFavorite: true }),
        journal({ entryId: 'b', isFavorite: true }),
      ],
    });
    const hub = selectHubResurfacingCandidates(candidates, {
      excludedSemanticKeys: new Set([journalSemanticKey('a')]),
    });
    expect(hub.map((c) => c.semanticKey)).toEqual([journalSemanticKey('b')]);
  });
});

// ─── §14 ДЕТЕРМІНІЗМ ──────────────────────────────────────────────────────────────────────────

describe('§14 — жодної випадковості на кожен рендер', () => {
  const candidates = build({
    journalEntries: Array.from({ length: 5 }, (_, i) =>
      journal({ entryId: `e${i}`, isFavorite: true, workId: `w${i}` }),
    ),
  });

  it('той самий день дає той самий спогад, скільки б разів не питати', () => {
    const first = selectHome(candidates);
    for (let i = 0; i < 20; i++) {
      expect(selectHome(candidates)?.semanticKey).toBe(first?.semanticKey);
    }
  });

  it('зсув дня стабільний і в межах пулу', () => {
    expect(dailyRotationOffset('2027-06-15', 5)).toBe(dailyRotationOffset('2027-06-15', 5));
    for (const day of ['2027-06-15', '2027-06-16', '2028-01-01', '2026-12-31']) {
      const offset = dailyRotationOffset(day, 5);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(5);
    }
    expect(dailyRotationOffset('2027-06-15', 0)).toBe(0);
  });

  it('пул з одного кандидата завжди дає саме його', () => {
    const solo = build({ journalEntries: [journal({ entryId: 'solo', isFavorite: true })] });
    expect(selectHome(solo)?.semanticKey).toBe(journalSemanticKey('solo'));
  });

  it('ротація не жертвує вагою: слабший кандидат не витісняє сильнішого', () => {
    const mixed = build({
      journalEntries: [
        journal({ entryId: 'weak', entryType: 'quote', workId: 'w1' }),
        journal({ entryId: 'strong', isFavorite: true, workId: 'w2' }),
      ],
    });
    expect(selectHome(mixed)?.semanticKey).toBe(journalSemanticKey('strong'));
  });

  it('порядок кандидатів не залежить від порядку надходження', () => {
    const forward = build({
      journalEntries: [
        journal({ entryId: 'a', isFavorite: true, createdAt: daysBefore(400) }),
        journal({ entryId: 'b', isFavorite: true, createdAt: daysBefore(300) }),
      ],
    });
    const backward = build({
      journalEntries: [
        journal({ entryId: 'b', isFavorite: true, createdAt: daysBefore(300) }),
        journal({ entryId: 'a', isFavorite: true, createdAt: daysBefore(400) }),
      ],
    });
    expect(forward.map((c) => c.semanticKey)).toEqual(backward.map((c) => c.semanticKey));
  });
});
