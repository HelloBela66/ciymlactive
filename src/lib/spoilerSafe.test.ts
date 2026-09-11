import { filterSpoilerSafeJournalEntries, filterSpoilerSafeLoreEntities, isSpoilerSafeActive } from './spoilerSafe';
import type { JournalEntry } from '@/types/journalEntry';
import type { LoreEntity } from '@/types/loreEntity';

function makeEntry(overrides: Partial<JournalEntry>): JournalEntry {
  return {
    id: 'entry-1',
    kind: 'note',
    userBookId: 'ub-1',
    editionId: null,
    sessionId: null,
    page: null,
    progressPercent: null,
    type: 'general',
    categoryId: null,
    text: 'Текст',
    comment: null,
    tags: [],
    isFavorite: false,
    revisitLater: false,
    reaction: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeEntity(overrides: Partial<LoreEntity>): LoreEntity {
  return {
    id: 'lore-1',
    workId: 'work-1',
    type: 'character',
    name: 'Персонаж',
    description: null,
    firstSeenPage: null,
    firstSeenProgress: null,
    reaction: null,
    isFavorite: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isSpoilerSafeActive', () => {
  it('is active only for reading/rereading when enabled', () => {
    expect(isSpoilerSafeActive('reading', true)).toBe(true);
    expect(isSpoilerSafeActive('rereading', true)).toBe(true);
    expect(isSpoilerSafeActive('finished', true)).toBe(false);
    expect(isSpoilerSafeActive('want_to_read', true)).toBe(false);
    expect(isSpoilerSafeActive('paused', true)).toBe(false);
    expect(isSpoilerSafeActive('did_not_finish', true)).toBe(false);
  });

  it('is inactive when the per-book flag is off, regardless of status', () => {
    expect(isSpoilerSafeActive('reading', false)).toBe(false);
    expect(isSpoilerSafeActive('rereading', false)).toBe(false);
  });
});

describe('filterSpoilerSafeJournalEntries', () => {
  const current = { currentPage: 100, pageCount: 400 };

  it('returns all entries unchanged when inactive', () => {
    const entries = [makeEntry({ id: 'a', page: 300 })];
    expect(filterSpoilerSafeJournalEntries(entries, false, current)).toEqual(entries);
  });

  it('hides an entry whose page is ahead of current page', () => {
    const entries = [makeEntry({ id: 'a', page: 300 })];
    expect(filterSpoilerSafeJournalEntries(entries, true, current)).toEqual([]);
  });

  it('keeps an entry whose page is at or behind current page', () => {
    const atPage = makeEntry({ id: 'a', page: 100 });
    const behindPage = makeEntry({ id: 'b', page: 50 });
    expect(filterSpoilerSafeJournalEntries([atPage, behindPage], true, current)).toEqual([atPage, behindPage]);
  });

  it('falls back to progressPercent when the entry has no page', () => {
    // current 100/400 = 25%.
    const ahead = makeEntry({ id: 'a', page: null, progressPercent: 50 });
    const behind = makeEntry({ id: 'b', page: null, progressPercent: 10 });
    expect(filterSpoilerSafeJournalEntries([ahead, behind], true, current)).toEqual([behind]);
  });

  it('keeps an entry with no determinable position (conservative default)', () => {
    const noPosition = makeEntry({ id: 'a', page: null, progressPercent: null });
    expect(filterSpoilerSafeJournalEntries([noPosition], true, current)).toEqual([noPosition]);
  });

  it('keeps everything when the current page itself is unknown and entries have only pages', () => {
    const entries = [makeEntry({ id: 'a', page: 300 })];
    expect(filterSpoilerSafeJournalEntries(entries, true, { currentPage: null, pageCount: 400 })).toEqual(entries);
  });
});

describe('filterSpoilerSafeLoreEntities', () => {
  const current = { currentPage: 100, pageCount: 400 };

  it('hides a lore entity first seen ahead of current page', () => {
    const entities = [makeEntity({ id: 'a', firstSeenPage: 300 })];
    expect(filterSpoilerSafeLoreEntities(entities, true, current)).toEqual([]);
  });

  it('keeps a lore entity first seen at or behind current page', () => {
    const entities = [makeEntity({ id: 'a', firstSeenPage: 50 })];
    expect(filterSpoilerSafeLoreEntities(entities, true, current)).toEqual(entities);
  });

  it('returns all entities unchanged when inactive', () => {
    const entities = [makeEntity({ id: 'a', firstSeenPage: 300 })];
    expect(filterSpoilerSafeLoreEntities(entities, false, current)).toEqual(entities);
  });
});
