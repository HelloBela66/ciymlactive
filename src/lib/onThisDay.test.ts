import {
  applySpoilerRules,
  buildOnThisDaySummary,
  computeLocalOffsetModifier,
  computeMonthDay,
  selectHomePrimaryMemory,
} from './onThisDay';
import type { OnThisDayRawEvent } from '@/data/repositories/OnThisDayRepository';

/**
 * Чисті функції `src/lib/onThisDay.ts` (POLYTSIA V1.6, Фаза 3) — без БД, той самий підхід, що
 * й `finishPrediction.test.ts`: фікстури + явний `referenceDate`, без `new Date()` усередині
 * тестованого коду.
 */

function makeEvent(overrides: Partial<OnThisDayRawEvent>): OnThisDayRawEvent {
  return {
    source: 'session',
    id: 'evt-1',
    occurredAt: '2025-09-11T10:00:00.000Z',
    userBookId: 'ub-1',
    workId: 'work-1',
    workTitle: 'Дюна',
    coverUrl: null,
    coverFallbackColor: '#000000',
    sessionId: null,
    startPage: null,
    endPage: null,
    durationSeconds: null,
    entryId: null,
    entryKind: null,
    entryType: null,
    entryText: null,
    entryPage: null,
    isFavorite: false,
    ...overrides,
  };
}

describe('computeMonthDay', () => {
  it('формат MM-dd', () => {
    expect(computeMonthDay(new Date('2026-09-11T12:00:00.000Z'))).toBe('09-11');
  });

  it('29 лютого — не переносить на інший день', () => {
    expect(computeMonthDay(new Date('2024-02-29T12:00:00.000Z'))).toBe('02-29');
  });
});

describe('computeLocalOffsetModifier', () => {
  it('позитивний зсув для поясу "попереду" UTC (getTimezoneOffset від\'ємний)', () => {
    const date = { getTimezoneOffset: () => -180 } as unknown as Date;
    expect(computeLocalOffsetModifier(date)).toBe('+180 minutes');
  });

  it('від\'ємний зсув для поясу "позаду" UTC (getTimezoneOffset додатний)', () => {
    const date = { getTimezoneOffset: () => 300 } as unknown as Date;
    expect(computeLocalOffsetModifier(date)).toBe('-300 minutes');
  });

  it('UTC (getTimezoneOffset 0) — нульовий, але коректно знаковий зсув', () => {
    const date = { getTimezoneOffset: () => 0 } as unknown as Date;
    expect(computeLocalOffsetModifier(date)).toBe('+0 minutes');
  });
});

describe('buildOnThisDaySummary', () => {
  const REFERENCE = new Date('2026-09-11T12:00:00.000Z');

  it('рік тому — одна сесія стає одним спогадом з правильним yearsAgo', () => {
    const summary = buildOnThisDaySummary(
      [makeEvent({ source: 'session', occurredAt: '2025-09-11T10:00:00.000Z', durationSeconds: 2820, startPage: 10, endPage: 42 })],
      new Map(),
      REFERENCE,
    );

    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0]?.yearsAgo).toBe(1);
    expect(summary.groups[0]?.memories[0]?.sessionDurationMinutes).toBe(47);
    expect(summary.groups[0]?.memories[0]?.sessionPagesRead).toBe(32);
  });

  it('поточний рік (yearsAgo 0) — виключається з результату, це не "спогад"', () => {
    const summary = buildOnThisDaySummary(
      [makeEvent({ source: 'session', occurredAt: '2026-09-11T09:00:00.000Z' })],
      new Map(),
      REFERENCE,
    );
    expect(summary.groups).toHaveLength(0);
    expect(summary.totalCount).toBe(0);
  });

  it('немає подій — порожня summary', () => {
    const summary = buildOnThisDaySummary([], new Map(), REFERENCE);
    expect(summary.groups).toHaveLength(0);
    expect(summary.totalCount).toBe(0);
  });

  it('кілька років — групи відсортовані від найближчого до найдавнішого', () => {
    const summary = buildOnThisDaySummary(
      [
        makeEvent({ source: 'session', occurredAt: '2022-09-11T10:00:00.000Z', workId: 'work-old' }),
        makeEvent({ source: 'session', occurredAt: '2025-09-11T10:00:00.000Z', workId: 'work-recent' }),
        makeEvent({ source: 'session', occurredAt: '2023-09-11T10:00:00.000Z', workId: 'work-mid' }),
      ],
      new Map(),
      REFERENCE,
    );
    expect(summary.groups.map((g) => g.yearsAgo)).toEqual([1, 3, 4]);
  });

  it('кілька книг того самого дня того самого року — окремі спогади в одній групі', () => {
    const summary = buildOnThisDaySummary(
      [
        makeEvent({ source: 'finished', occurredAt: '2025-09-11T10:00:00.000Z', workId: 'work-a', workTitle: 'Книга А' }),
        makeEvent({ source: 'session', occurredAt: '2025-09-11T10:00:00.000Z', workId: 'work-b', workTitle: 'Книга Б' }),
      ],
      new Map(),
      REFERENCE,
    );
    expect(summary.groups[0]?.memories).toHaveLength(2);
    expect(summary.totalCount).toBe(2);
  });

  it('пріоритет: finished > favorite journal > session > started — обирає найважливіший тип', () => {
    const summary = buildOnThisDaySummary(
      [
        makeEvent({ source: 'started', occurredAt: '2025-09-11T08:00:00.000Z', workId: 'work-a', userBookId: 'ub-a' }),
        makeEvent({ source: 'session', occurredAt: '2025-09-11T09:00:00.000Z', workId: 'work-b', userBookId: 'ub-b' }),
        makeEvent({
          source: 'note',
          occurredAt: '2025-09-11T10:00:00.000Z',
          workId: 'work-c',
          userBookId: 'ub-c',
          entryId: 'n-1',
          entryKind: 'note',
          entryType: 'moment',
          entryText: 'Улюблений момент',
          isFavorite: true,
        }),
        makeEvent({ source: 'finished', occurredAt: '2025-09-11T11:00:00.000Z', workId: 'work-d', userBookId: 'ub-d' }),
      ],
      new Map(),
      REFERENCE,
    );

    const memories = summary.groups[0]?.memories ?? [];
    const [first, second, third, fourth] = memories;
    expect(first?.workId).toBe('work-d'); // finished
    expect(second?.workId).toBe('work-c'); // favorite journal
    expect(third?.workId).toBe('work-b'); // session
    expect(fourth?.workId).toBe('work-a'); // started
  });

  it('пріоритет 5 (найнижчий): лише нефаворитна нотатка/цитата, без finished/session/started', () => {
    const summary = buildOnThisDaySummary(
      [
        makeEvent({
          source: 'note',
          occurredAt: '2025-09-11T10:00:00.000Z',
          workId: 'work-only-note',
          entryId: 'n-1',
          entryKind: 'note',
          entryType: 'general',
          entryText: 'Просто нотатка без жодного іншого сигналу',
          isFavorite: false,
        }),
      ],
      new Map(),
      REFERENCE,
    );
    expect(summary.groups[0]?.memories[0]?.priority).toBe(5);
  });

  it('оцінка приєднується лише до завершеної книги (finished === true)', () => {
    const ratings = new Map([['ub-1', 4.5]]);
    const summary = buildOnThisDaySummary(
      [makeEvent({ source: 'finished', occurredAt: '2025-09-11T10:00:00.000Z' })],
      ratings,
      REFERENCE,
    );
    expect(summary.groups[0]?.memories[0]?.ratingValue).toBe(4.5);
  });

  it('щоденник: пріоритет favorite → moment → thought → quote → інше, обрізка до 3', () => {
    const events: OnThisDayRawEvent[] = [
      makeEvent({ source: 'note', occurredAt: '2025-09-11T10:00:00.000Z', entryId: 'e-general', entryKind: 'note', entryType: 'general', entryText: 'general' }),
      makeEvent({ source: 'quote', occurredAt: '2025-09-11T10:01:00.000Z', entryId: 'e-quote', entryKind: 'quote', entryType: 'quote', entryText: 'quote' }),
      makeEvent({ source: 'note', occurredAt: '2025-09-11T10:02:00.000Z', entryId: 'e-thought', entryKind: 'note', entryType: 'thought', entryText: 'thought' }),
      makeEvent({ source: 'note', occurredAt: '2025-09-11T10:03:00.000Z', entryId: 'e-moment', entryKind: 'note', entryType: 'moment', entryText: 'moment' }),
      makeEvent({ source: 'note', occurredAt: '2025-09-11T10:04:00.000Z', entryId: 'e-fav', entryKind: 'note', entryType: 'general', entryText: 'favorite', isFavorite: true }),
    ];
    const summary = buildOnThisDaySummary(events, new Map(), REFERENCE);
    const entries = summary.groups[0]?.memories[0]?.journalEntries ?? [];
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.id)).toEqual(['e-fav', 'e-moment', 'e-thought']);
  });

  it('29 лютого: спогад із 29.02 у високосний рік знаходиться і має правильний yearsAgo', () => {
    const leapReference = new Date('2028-02-29T12:00:00.000Z');
    const summary = buildOnThisDaySummary(
      [makeEvent({ source: 'session', occurredAt: '2024-02-29T10:00:00.000Z' })],
      new Map(),
      leapReference,
    );
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0]?.yearsAgo).toBe(4);
  });
});

describe('selectHomePrimaryMemory', () => {
  const REFERENCE = new Date('2026-09-11T12:00:00.000Z');

  it('немає спогадів — null', () => {
    expect(selectHomePrimaryMemory(buildOnThisDaySummary([], new Map(), REFERENCE))).toBeNull();
  });

  it('обирає найближчий рік і рахує moreCount по всій вибірці', () => {
    const summary = buildOnThisDaySummary(
      [
        makeEvent({ source: 'session', occurredAt: '2025-09-11T10:00:00.000Z', workId: 'work-recent' }),
        makeEvent({ source: 'session', occurredAt: '2024-09-11T10:00:00.000Z', workId: 'work-old' }),
      ],
      new Map(),
      REFERENCE,
    );
    const selection = selectHomePrimaryMemory(summary);
    expect(selection?.primary.workId).toBe('work-recent');
    expect(selection?.moreCount).toBe(1);
    expect(selection?.booksReadCount).toBe(1);
  });

  it('booksReadCount рахує лише книги primary-року (кілька книг того самого дня)', () => {
    const summary = buildOnThisDaySummary(
      [
        makeEvent({ source: 'finished', occurredAt: '2025-09-11T10:00:00.000Z', workId: 'work-a' }),
        makeEvent({ source: 'session', occurredAt: '2025-09-11T10:00:00.000Z', workId: 'work-b' }),
      ],
      new Map(),
      REFERENCE,
    );
    expect(selectHomePrimaryMemory(summary)?.booksReadCount).toBe(2);
  });
});

describe('applySpoilerRules', () => {
  const REFERENCE = new Date('2026-09-11T12:00:00.000Z');

  function summaryWithEntry(page: number | null, isFavorite = false) {
    return buildOnThisDaySummary(
      [
        makeEvent({
          source: 'note',
          occurredAt: '2025-09-11T10:00:00.000Z',
          workId: 'work-active',
          entryId: 'n-1',
          entryKind: 'note',
          entryType: 'general',
          entryText: 'Секретний поворот сюжету',
          entryPage: page,
          isFavorite,
        }),
      ],
      new Map(),
      REFERENCE,
    );
  }

  it('порожня мапа активних книг — нічого не змінює', () => {
    const summary = summaryWithEntry(200);
    const result = applySpoilerRules(summary, new Map());
    expect(result).toBe(summary);
  });

  it('запис ДАЛІ за поточну сторінку активної книги — ховається', () => {
    const summary = summaryWithEntry(200);
    const result = applySpoilerRules(summary, new Map([['work-active', 50]]));
    const entry = result.groups[0]?.memories[0]?.journalEntries[0];
    expect(entry?.hidden).toBe(true);
    expect(entry?.text).toBe('');
    expect(result.groups[0]?.memories[0]?.spoilerHidden).toBe(true);
  });

  it('запис ДО поточної сторінки — лишається видимим', () => {
    const summary = summaryWithEntry(10);
    const result = applySpoilerRules(summary, new Map([['work-active', 50]]));
    const entry = result.groups[0]?.memories[0]?.journalEntries[0];
    expect(entry?.hidden).toBeUndefined();
    expect(entry?.text).toBe('Секретний поворот сюжету');
  });

  it('запис без сторінки — ніколи не ховається (немає надійних даних)', () => {
    const summary = summaryWithEntry(null);
    const result = applySpoilerRules(summary, new Map([['work-active', 1]]));
    expect(result.groups[0]?.memories[0]?.journalEntries[0]?.hidden).toBeUndefined();
  });

  it('книга НЕ в мапі активних (наприклад, вже прочитана) — фільтрація не застосовується', () => {
    const summary = summaryWithEntry(200);
    const result = applySpoilerRules(summary, new Map([['other-work', 1]]));
    expect(result.groups[0]?.memories[0]?.journalEntries[0]?.hidden).toBeUndefined();
  });
});
