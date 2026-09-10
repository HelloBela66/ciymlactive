import { pluralizeUk } from './pluralizeUk';

const DAYS = ['день', 'дні', 'днів'] as const;

describe('pluralizeUk', () => {
  it('1, 21, 31 — форма "один"', () => {
    expect(pluralizeUk(1, DAYS)).toBe('день');
    expect(pluralizeUk(21, DAYS)).toBe('день');
    expect(pluralizeUk(31, DAYS)).toBe('день');
  });

  it('2-4, 22-24 — форма "кілька"', () => {
    expect(pluralizeUk(2, DAYS)).toBe('дні');
    expect(pluralizeUk(3, DAYS)).toBe('дні');
    expect(pluralizeUk(4, DAYS)).toBe('дні');
    expect(pluralizeUk(22, DAYS)).toBe('дні');
  });

  it('0, 5-20, 25-30 — форма "багато"', () => {
    expect(pluralizeUk(0, DAYS)).toBe('днів');
    expect(pluralizeUk(5, DAYS)).toBe('днів');
    expect(pluralizeUk(10, DAYS)).toBe('днів');
    expect(pluralizeUk(20, DAYS)).toBe('днів');
    expect(pluralizeUk(25, DAYS)).toBe('днів');
  });

  it('11-14 — виняток, завжди "багато" незважаючи на останню цифру', () => {
    expect(pluralizeUk(11, DAYS)).toBe('днів');
    expect(pluralizeUk(12, DAYS)).toBe('днів');
    expect(pluralizeUk(13, DAYS)).toBe('днів');
    expect(pluralizeUk(14, DAYS)).toBe('днів');
    expect(pluralizeUk(111, DAYS)).toBe('днів');
    expect(pluralizeUk(112, DAYS)).toBe('днів');
  });
});
