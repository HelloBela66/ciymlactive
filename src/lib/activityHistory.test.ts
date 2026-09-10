import { groupActivityEventsByDate } from './activityHistory';
import type { ActivityEvent } from '@/types/activityEvent';

/** Мінімальна фабрика події — лише `id`/`occurredAt`/`type` різняться в тестах нижче, решта —
 * стабільні заглушки, той самий підхід, що й `entry()` у `journalTimeline.test.ts`. */
function event(overrides: Partial<ActivityEvent> & Pick<ActivityEvent, 'id' | 'occurredAt'>): ActivityEvent {
  return {
    type: 'journal_entry',
    userBookId: 'ub-1',
    workId: 'work-1',
    workTitle: 'Книга',
    coverUrl: null,
    coverFallbackColor: null,
    durationSeconds: null,
    ratingValue: null,
    entryText: null,
    shelfName: null,
    ...overrides,
  };
}

describe('groupActivityEventsByDate', () => {
  it('returns an empty array for no events', () => {
    expect(groupActivityEventsByDate([])).toEqual([]);
  });

  it('groups events on the same calendar day into one section', () => {
    const sections = groupActivityEventsByDate([
      event({ id: 'a', occurredAt: '2026-03-01T08:00:00.000Z' }),
      event({ id: 'b', occurredAt: '2026-03-01T20:30:00.000Z' }),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.dateKey).toBe('2026-03-01');
    expect(sections[0]?.data.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('splits events across different calendar days into separate sections', () => {
    const sections = groupActivityEventsByDate([
      event({ id: 'a', occurredAt: '2026-03-01T08:00:00.000Z' }),
      event({ id: 'b', occurredAt: '2026-03-02T08:00:00.000Z' }),
    ]);
    expect(sections.map((s) => s.dateKey)).toEqual(['2026-03-02', '2026-03-01']);
  });

  it('orders sections newest-day-first regardless of input order', () => {
    const sections = groupActivityEventsByDate([
      event({ id: 'old', occurredAt: '2026-01-01T00:00:00.000Z' }),
      event({ id: 'new', occurredAt: '2026-06-01T00:00:00.000Z' }),
      event({ id: 'mid', occurredAt: '2026-03-01T00:00:00.000Z' }),
    ]);
    expect(sections.map((s) => s.dateKey)).toEqual(['2026-06-01', '2026-03-01', '2026-01-01']);
  });

  it('orders events within a section newest-first regardless of input order', () => {
    const sections = groupActivityEventsByDate([
      event({ id: 'earlier', occurredAt: '2026-03-01T08:00:00.000Z' }),
      event({ id: 'later', occurredAt: '2026-03-01T20:00:00.000Z' }),
      event({ id: 'middle', occurredAt: '2026-03-01T14:00:00.000Z' }),
    ]);
    expect(sections[0]?.data.map((e) => e.id)).toEqual(['later', 'middle', 'earlier']);
  });

  it('date field parses back to the same calendar day as dateKey', () => {
    const sections = groupActivityEventsByDate([event({ id: 'a', occurredAt: '2026-12-31T23:59:59.000Z' })]);
    expect(sections[0]?.dateKey).toBe('2026-12-31');
  });
});
