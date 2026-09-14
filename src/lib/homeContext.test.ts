import {
  findStaleReadingCandidate,
  findCapsuleDueCandidate,
  listDueCapsuleCandidates,
  findGoalNearCompletionCandidate,
  selectHomeContextCard,
  getHomeContextCardSuppressionKey,
  nullifyHomeContextCandidate,
  selectVisibleHomeContextCard,
  GOAL_NEAR_COMPLETION_RATIO,
  type StaleReadingBookInput,
  type CapsuleDueCandidateInput,
  type GoalCandidate,
  type StaleReadingCandidate,
  type CapsuleDueCandidate,
  type HomeContextSelectionInput,
} from './homeContext';
import type { ReadingGoal, ReadingGoalProgress } from '@/types/readingGoal';

const NOW = new Date('2026-09-12T12:00:00.000Z');

function staleBook(overrides: Partial<StaleReadingBookInput> = {}): StaleReadingBookInput {
  return {
    userBookId: 'ub-1',
    workId: 'work-1',
    title: 'Тестова книга',
    coverUrl: null,
    coverFallbackColor: '#000000',
    lastSession: { endedAt: '2026-08-01T00:00:00.000Z', endPage: 120 },
    ...overrides,
  };
}

describe('findStaleReadingCandidate', () => {
  it('null, коли жодна книга не "давно не читана"', () => {
    const books = [staleBook({ lastSession: { endedAt: '2026-09-11T00:00:00.000Z', endPage: 10 } })];
    expect(findStaleReadingCandidate(books, NOW)).toBeNull();
  });

  it('обирає книгу з найбільшою кількістю днів очікування серед кількох кандидатів', () => {
    const books = [
      staleBook({ userBookId: 'less-stale', lastSession: { endedAt: '2026-08-20T00:00:00.000Z', endPage: 1 } }),
      staleBook({ userBookId: 'most-stale', lastSession: { endedAt: '2026-07-01T00:00:00.000Z', endPage: 1 } }),
    ];
    expect(findStaleReadingCandidate(books, NOW)?.userBookId).toBe('most-stale');
  });

  it('ігнорує книгу без завершеної сесії', () => {
    const books = [staleBook({ lastSession: null })];
    expect(findStaleReadingCandidate(books, NOW)).toBeNull();
  });
});

function dueCapsule(overrides: Partial<CapsuleDueCandidateInput> = {}): CapsuleDueCandidateInput {
  return {
    capsuleId: 'capsule-1',
    userBookId: 'ub-1',
    workId: 'work-1',
    title: 'Тестова книга',
    coverUrl: null,
    coverFallbackColor: '#000000',
    reopenAt: '2026-09-01T00:00:00.000Z',
    openedAt: null,
    ...overrides,
  };
}

describe('findCapsuleDueCandidate', () => {
  it('null, коли reopenAt ще в майбутньому', () => {
    const capsules = [dueCapsule({ reopenAt: '2026-12-01T00:00:00.000Z' })];
    expect(findCapsuleDueCandidate(capsules, NOW)).toBeNull();
  });

  it('null, коли reopenAt відсутній (без нагадування)', () => {
    const capsules = [dueCapsule({ reopenAt: null })];
    expect(findCapsuleDueCandidate(capsules, NOW)).toBeNull();
  });

  it('ігнорує вже переглянуту капсулу (openedAt задано)', () => {
    const capsules = [dueCapsule({ openedAt: '2026-09-05T00:00:00.000Z' })];
    expect(findCapsuleDueCandidate(capsules, NOW)).toBeNull();
  });

  it('серед кількох due-капсул обирає найдовше прострочену (найраніший reopenAt)', () => {
    const capsules = [
      dueCapsule({ capsuleId: 'newer', reopenAt: '2026-09-10T00:00:00.000Z' }),
      dueCapsule({ capsuleId: 'oldest', reopenAt: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(findCapsuleDueCandidate(capsules, NOW)?.capsuleId).toBe('oldest');
  });
});

describe('listDueCapsuleCandidates', () => {
  it('порожній масив, коли жодна капсула не due', () => {
    const capsules = [dueCapsule({ reopenAt: '2026-12-01T00:00:00.000Z' })];
    expect(listDueCapsuleCandidates(capsules, NOW)).toEqual([]);
  });

  it('виключає переглянуті (openedAt задано) і без reopenAt', () => {
    const capsules = [
      dueCapsule({ capsuleId: 'opened', openedAt: '2026-09-05T00:00:00.000Z' }),
      dueCapsule({ capsuleId: 'no-reminder', reopenAt: null }),
    ];
    expect(listDueCapsuleCandidates(capsules, NOW)).toEqual([]);
  });

  it('повертає УСІ due-капсули, найдовше прострочена перша', () => {
    const capsules = [
      dueCapsule({ capsuleId: 'newer', reopenAt: '2026-09-10T00:00:00.000Z' }),
      dueCapsule({ capsuleId: 'oldest', reopenAt: '2026-01-01T00:00:00.000Z' }),
      dueCapsule({ capsuleId: 'middle', reopenAt: '2026-06-01T00:00:00.000Z' }),
    ];
    expect(listDueCapsuleCandidates(capsules, NOW).map((c) => c.capsuleId)).toEqual(['oldest', 'middle', 'newer']);
  });

  it('перший елемент — той самий, що повертає findCapsuleDueCandidate', () => {
    const capsules = [
      dueCapsule({ capsuleId: 'newer', reopenAt: '2026-09-10T00:00:00.000Z' }),
      dueCapsule({ capsuleId: 'oldest', reopenAt: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(listDueCapsuleCandidates(capsules, NOW)[0]?.capsuleId).toBe(findCapsuleDueCandidate(capsules, NOW)?.capsuleId);
  });
});

function goal(overrides: Partial<ReadingGoal> = {}, progressOverrides: Partial<ReadingGoalProgress> = {}): GoalCandidate {
  return {
    goal: {
      id: 'goal-1',
      type: 'books_per_year',
      target: 10,
      periodStart: '2026-01-01T00:00:00.000Z',
      periodEnd: '2026-12-31T00:00:00.000Z',
      relatedWorkId: null,
      relatedSeriesId: null,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    },
    progress: { current: 8, target: 10, isComplete: false, ...progressOverrides },
  };
}

describe('findGoalNearCompletionCandidate', () => {
  it('null, коли жодна ціль не досягла порогу', () => {
    const goals = [goal({}, { current: 5, target: 10, isComplete: false })];
    expect(findGoalNearCompletionCandidate(goals)).toBeNull();
  });

  it(`обирає ціль рівно на порозі ${GOAL_NEAR_COMPLETION_RATIO * 100}%`, () => {
    const goals = [goal({}, { current: 8, target: 10, isComplete: false })];
    expect(findGoalNearCompletionCandidate(goals)?.goal.id).toBe('goal-1');
  });

  it('ігнорує вже виконану ціль (isComplete)', () => {
    const goals = [goal({}, { current: 10, target: 10, isComplete: true })];
    expect(findGoalNearCompletionCandidate(goals)).toBeNull();
  });

  it('ігнорує неактивну ціль (completed/abandoned статус)', () => {
    const goals = [goal({ status: 'abandoned' }, { current: 9, target: 10, isComplete: false })];
    expect(findGoalNearCompletionCandidate(goals)).toBeNull();
  });

  it('серед кількох цілей над порогом обирає найближчу до виконання', () => {
    const goals = [
      goal({ id: 'lower' }, { current: 8, target: 10, isComplete: false }),
      goal({ id: 'higher' }, { current: 19, target: 20, isComplete: false }),
    ];
    expect(findGoalNearCompletionCandidate(goals)?.goal.id).toBe('higher');
  });

  it('захисно ігнорує target <= 0 (не дає йому "виграти" слот через Infinity)', () => {
    const goals = [
      goal({ id: 'zero-target' }, { current: 5, target: 0, isComplete: false }),
      goal({ id: 'negative-target' }, { current: 5, target: -1, isComplete: false }),
    ];
    expect(findGoalNearCompletionCandidate(goals)).toBeNull();
  });
});

const STALE_CANDIDATE: StaleReadingCandidate = {
  userBookId: 'ub-stale',
  workId: 'work-stale',
  title: 'Давно не читана',
  coverUrl: null,
  coverFallbackColor: '#000000',
  info: { daysSinceLastSession: 20, lastPage: 42 },
};

const CAPSULE_CANDIDATE: CapsuleDueCandidate = {
  capsuleId: 'capsule-1',
  userBookId: 'ub-capsule',
  workId: 'work-capsule',
  title: 'Капсула готова',
  coverUrl: null,
  coverFallbackColor: '#000000',
  reopenAt: '2026-09-01T00:00:00.000Z',
};

const GOAL_CANDIDATE: GoalCandidate = goal({}, { current: 9, target: 10, isComplete: false });

describe('selectHomeContextCard', () => {
  it('null, коли жоден кандидат не застосовується', () => {
    expect(
      selectHomeContextCard({
        staleReading: null,
        capsuleDue: null,
        onThisDayAvailable: false,
        goalNearCompletion: null,
        tbrBookCount: 0,
        tbrOldestWaiting: null,
      }),
    ).toBeNull();
  });

  it('stale reading перекриває всі інші сигнали (найвищий пріоритет)', () => {
    const result = selectHomeContextCard({
      staleReading: STALE_CANDIDATE,
      capsuleDue: CAPSULE_CANDIDATE,
      onThisDayAvailable: true,
      goalNearCompletion: GOAL_CANDIDATE,
      tbrBookCount: 5,
      tbrOldestWaiting: null,
    });
    expect(result).toEqual({ kind: 'stale_reading', candidate: STALE_CANDIDATE });
  });

  it('capsule due переважає on this day/goal/TBR, коли stale reading відсутній', () => {
    const result = selectHomeContextCard({
      staleReading: null,
      capsuleDue: CAPSULE_CANDIDATE,
      onThisDayAvailable: true,
      goalNearCompletion: GOAL_CANDIDATE,
      tbrBookCount: 5,
      tbrOldestWaiting: null,
    });
    expect(result).toEqual({ kind: 'capsule_due', candidate: CAPSULE_CANDIDATE });
  });

  it('on this day переважає goal/TBR, коли stale reading і capsule due відсутні', () => {
    const result = selectHomeContextCard({
      staleReading: null,
      capsuleDue: null,
      onThisDayAvailable: true,
      goalNearCompletion: GOAL_CANDIDATE,
      tbrBookCount: 5,
      tbrOldestWaiting: null,
    });
    expect(result).toEqual({ kind: 'on_this_day' });
  });

  it('goal near completion переважає TBR, коли вищі пріоритети відсутні', () => {
    const result = selectHomeContextCard({
      staleReading: null,
      capsuleDue: null,
      onThisDayAvailable: false,
      goalNearCompletion: GOAL_CANDIDATE,
      tbrBookCount: 5,
      tbrOldestWaiting: null,
    });
    expect(result).toEqual({ kind: 'goal_near_completion', candidate: GOAL_CANDIDATE });
  });

  it('TBR suggestion — останній у пріоритеті, лише коли bookCount > 0', () => {
    const result = selectHomeContextCard({
      staleReading: null,
      capsuleDue: null,
      onThisDayAvailable: false,
      goalNearCompletion: null,
      tbrBookCount: 3,
      tbrOldestWaiting: null,
    });
    expect(result).toEqual({ kind: 'tbr_suggestion', bookCount: 3, oldestWaiting: null });
  });

  it('null замість TBR suggestion, коли bookCount дорівнює 0', () => {
    const result = selectHomeContextCard({
      staleReading: null,
      capsuleDue: null,
      onThisDayAvailable: false,
      goalNearCompletion: null,
      tbrBookCount: 0,
      tbrOldestWaiting: null,
    });
    expect(result).toBeNull();
  });
});

/**
 * POLYTSIA V1.6.2, #169 (HOME CONTEXT SUPPRESSION) — `getHomeContextCardSuppressionKey`/
 * `nullifyHomeContextCandidate`/`selectVisibleHomeContextCard`.
 */
describe('getHomeContextCardSuppressionKey', () => {
  it('stale_reading — ключ по userBookId конкретного кандидата', () => {
    expect(getHomeContextCardSuppressionKey({ kind: 'stale_reading', candidate: STALE_CANDIDATE })).toBe(
      `stale_reading:${STALE_CANDIDATE.userBookId}`,
    );
  });

  it('capsule_due — ключ по capsuleId конкретного кандидата', () => {
    expect(getHomeContextCardSuppressionKey({ kind: 'capsule_due', candidate: CAPSULE_CANDIDATE })).toBe(
      `capsule_due:${CAPSULE_CANDIDATE.capsuleId}`,
    );
  });

  it('goal_near_completion — ключ по goal.id конкретного кандидата', () => {
    expect(getHomeContextCardSuppressionKey({ kind: 'goal_near_completion', candidate: GOAL_CANDIDATE })).toBe(
      `goal_near_completion:${GOAL_CANDIDATE.goal.id}`,
    );
  });

  it('on_this_day — фіксований ключ (немає стабільного "хто саме", спогад ротується щодня сам)', () => {
    expect(getHomeContextCardSuppressionKey({ kind: 'on_this_day' })).toBe('on_this_day');
  });

  it('tbr_suggestion — фіксований ключ (немає одного стабільного кандидата, пропозиція по всьому пулу)', () => {
    expect(getHomeContextCardSuppressionKey({ kind: 'tbr_suggestion', bookCount: 3, oldestWaiting: null })).toBe(
      'tbr_suggestion',
    );
  });

  it('різні кандидати ОДНОГО типу дають РІЗНІ ключі — приховання одного не чіпає іншого', () => {
    const other: StaleReadingCandidate = { ...STALE_CANDIDATE, userBookId: 'ub-other' };
    expect(getHomeContextCardSuppressionKey({ kind: 'stale_reading', candidate: STALE_CANDIDATE })).not.toBe(
      getHomeContextCardSuppressionKey({ kind: 'stale_reading', candidate: other }),
    );
  });
});

const FULL_INPUT: HomeContextSelectionInput = {
  staleReading: STALE_CANDIDATE,
  capsuleDue: CAPSULE_CANDIDATE,
  onThisDayAvailable: true,
  goalNearCompletion: GOAL_CANDIDATE,
  tbrBookCount: 3,
  tbrOldestWaiting: null,
};

describe('nullifyHomeContextCandidate', () => {
  it('stale_reading — обнуляє лише staleReading, решта полів без змін', () => {
    expect(nullifyHomeContextCandidate(FULL_INPUT, 'stale_reading')).toEqual({ ...FULL_INPUT, staleReading: null });
  });

  it('capsule_due — обнуляє лише capsuleDue', () => {
    expect(nullifyHomeContextCandidate(FULL_INPUT, 'capsule_due')).toEqual({ ...FULL_INPUT, capsuleDue: null });
  });

  it('on_this_day — обнуляє onThisDayAvailable у false', () => {
    expect(nullifyHomeContextCandidate(FULL_INPUT, 'on_this_day')).toEqual({ ...FULL_INPUT, onThisDayAvailable: false });
  });

  it('goal_near_completion — обнуляє лише goalNearCompletion', () => {
    expect(nullifyHomeContextCandidate(FULL_INPUT, 'goal_near_completion')).toEqual({
      ...FULL_INPUT,
      goalNearCompletion: null,
    });
  });

  it('tbr_suggestion — обнуляє tbrBookCount у 0', () => {
    expect(nullifyHomeContextCandidate(FULL_INPUT, 'tbr_suggestion')).toEqual({ ...FULL_INPUT, tbrBookCount: 0 });
  });
});

describe('selectVisibleHomeContextCard', () => {
  it('без приглушених ключів — та сама картка, що й selectHomeContextCard', () => {
    expect(selectVisibleHomeContextCard(FULL_INPUT, new Set())).toEqual(selectHomeContextCard(FULL_INPUT));
  });

  it('приглушений переможець-кандидат — провалюється до наступного за пріоритетом', () => {
    const key = getHomeContextCardSuppressionKey({ kind: 'stale_reading', candidate: STALE_CANDIDATE });
    expect(selectVisibleHomeContextCard(FULL_INPUT, new Set([key]))).toEqual({
      kind: 'capsule_due',
      candidate: CAPSULE_CANDIDATE,
    });
  });

  it('приглушені всі кандидати по черзі — null, а не помилка/зациклення', () => {
    const keys = new Set([
      getHomeContextCardSuppressionKey({ kind: 'stale_reading', candidate: STALE_CANDIDATE }),
      getHomeContextCardSuppressionKey({ kind: 'capsule_due', candidate: CAPSULE_CANDIDATE }),
      getHomeContextCardSuppressionKey({ kind: 'on_this_day' }),
      getHomeContextCardSuppressionKey({ kind: 'goal_near_completion', candidate: GOAL_CANDIDATE }),
      getHomeContextCardSuppressionKey({ kind: 'tbr_suggestion', bookCount: 3, oldestWaiting: null }),
    ]);
    expect(selectVisibleHomeContextCard(FULL_INPUT, keys)).toBeNull();
  });

  it('приглушення чужого кандидата ТОГО Ж типу не впливає — свій кандидат і далі показується', () => {
    const otherBookKey = getHomeContextCardSuppressionKey({
      kind: 'stale_reading',
      candidate: { ...STALE_CANDIDATE, userBookId: 'ub-completely-different' },
    });
    expect(selectVisibleHomeContextCard(FULL_INPUT, new Set([otherBookKey]))).toEqual({
      kind: 'stale_reading',
      candidate: STALE_CANDIDATE,
    });
  });

  it('null вхід (жодного кандидата) лишається null незалежно від приглушених ключів', () => {
    const empty: HomeContextSelectionInput = {
      staleReading: null,
      capsuleDue: null,
      onThisDayAvailable: false,
      goalNearCompletion: null,
      tbrBookCount: 0,
      tbrOldestWaiting: null,
    };
    expect(selectVisibleHomeContextCard(empty, new Set(['stale_reading:anything']))).toBeNull();
  });
});
