import { rankJournalEntriesForDay, type JournalPriorityInput } from './calendarJournalPriority';

function entry(overrides: Partial<JournalPriorityInput> & { id: string }): JournalPriorityInput & { id: string } {
  return {
    isFavorite: false,
    kind: 'note',
    type: 'general',
    createdAt: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('rankJournalEntriesForDay', () => {
  it('порожній список — порожній результат', () => {
    expect(rankJournalEntriesForDay([])).toEqual([]);
  });

  it('обране завжди першим, незалежно від типу', () => {
    const favorite = entry({ id: 'a', isFavorite: true, kind: 'note', type: 'general' });
    const moment = entry({ id: 'b', kind: 'note', type: 'moment' });
    const result = rankJournalEntriesForDay([moment, favorite]);
    expect(result.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('пріоритет: обране → момент → думка → цитата → інше', () => {
    const other = entry({ id: 'other', kind: 'note', type: 'question' });
    const quote = entry({ id: 'quote', kind: 'quote', type: 'quote' });
    const thought = entry({ id: 'thought', kind: 'note', type: 'thought' });
    const moment = entry({ id: 'moment', kind: 'note', type: 'moment' });
    const favorite = entry({ id: 'favorite', isFavorite: true, kind: 'note', type: 'general' });

    const result = rankJournalEntriesForDay([other, quote, thought, moment, favorite], 10);
    expect(result.map((e) => e.id)).toEqual(['favorite', 'moment', 'thought', 'quote', 'other']);
  });

  it('у межах однакового пріоритету — новіші перші', () => {
    const older = entry({ id: 'older', kind: 'note', type: 'moment', createdAt: '2026-01-01T08:00:00.000Z' });
    const newer = entry({ id: 'newer', kind: 'note', type: 'moment', createdAt: '2026-01-01T20:00:00.000Z' });
    const result = rankJournalEntriesForDay([older, newer]);
    expect(result.map((e) => e.id)).toEqual(['newer', 'older']);
  });

  it('обрізає до limit (за замовчуванням 3)', () => {
    const entries = [
      entry({ id: '1', isFavorite: true }),
      entry({ id: '2', isFavorite: true }),
      entry({ id: '3', isFavorite: true }),
      entry({ id: '4', isFavorite: true }),
    ];
    expect(rankJournalEntriesForDay(entries)).toHaveLength(3);
  });

  it('не мутує вхідний масив', () => {
    const a = entry({ id: 'a', kind: 'note', type: 'general' });
    const b = entry({ id: 'b', isFavorite: true });
    const input = [a, b];
    rankJournalEntriesForDay(input);
    expect(input).toEqual([a, b]);
  });
});
