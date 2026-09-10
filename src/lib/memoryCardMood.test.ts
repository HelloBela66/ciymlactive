import { pickCardMood, moodSeedValues } from './memoryCardMood';

describe('pickCardMood', () => {
  it('визнає жанр з групи "dark" (Жахи/Трилер/Детектив)', () => {
    expect(pickCardMood([{ nameUk: 'Жахи' }], 'будь-яка книга').key).toBe('dark');
    expect(pickCardMood([{ nameUk: 'Трилер' }], 'будь-яка книга').key).toBe('dark');
  });

  it('визнає романтику', () => {
    expect(pickCardMood([{ nameUk: 'Романтика' }], 'будь-яка книга').key).toBe('romantic');
  });

  it('коли в книги кілька жанрів з різних груп — перемагає той, що вищий у пріоритеті', () => {
    // 'fantasy' стоїть вище за 'romantic' у списку пріоритету (`memoryCardMood.ts`).
    const mood = pickCardMood([{ nameUk: 'Романтика' }, { nameUk: 'Фентезі' }], 'книга X');
    expect(mood.key).toBe('fantasy');
  });

  it('порядок жанрів у масиві не впливає на результат (пріоритет визначає MOODS, не порядок вхідного масиву)', () => {
    const a = pickCardMood([{ nameUk: 'Романтика' }, { nameUk: 'Фентезі' }], 'книга X');
    const b = pickCardMood([{ nameUk: 'Фентезі' }, { nameUk: 'Романтика' }], 'книга X');
    expect(a.key).toBe(b.key);
  });

  it('невпізнаний (користувацький) жанр падає назад на детермінований хеш, а не кидає помилку', () => {
    const mood = pickCardMood([{ nameUk: 'Мій власний жанр' }], 'книга Y');
    expect(mood.key).toBeTruthy();
  });

  it('без жанрів — детермінований хеш за seedKey, стабільний між викликами', () => {
    const first = pickCardMood([], 'Кобзар');
    const second = pickCardMood([], 'Кобзар');
    expect(first.key).toBe(second.key);
  });

  it('undefined замість масиву жанрів поводиться так само, як порожній масив', () => {
    expect(pickCardMood(undefined, 'Кобзар').key).toBe(pickCardMood([], 'Кобзар').key);
  });

  it('різні книги без жанру, ймовірно, отримують різний вайб (не всі падають в один дефолт)', () => {
    const seeds = ['Кобзар', 'Тіні забутих предків', 'Лісова пісня', 'Момент', 'Хіба ревуть воли, як ясла повні?'];
    const moods = new Set(seeds.map((seed) => pickCardMood([], seed).key));
    expect(moods.size).toBeGreaterThan(1);
  });
});

describe('moodSeedValues', () => {
  it('той самий seedKey — той самий результат (детерміновано)', () => {
    expect(moodSeedValues('книга', 4)).toEqual(moodSeedValues('книга', 4));
  });

  it('різні seedKey зазвичай дають різний результат', () => {
    expect(moodSeedValues('книга А', 4)).not.toEqual(moodSeedValues('книга Б', 4));
  });

  it('усі значення в межах [0, 1)', () => {
    const values = moodSeedValues('перевірка діапазону', 10);
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('повертає рівно count значень', () => {
    expect(moodSeedValues('x', 0)).toHaveLength(0);
    expect(moodSeedValues('x', 3)).toHaveLength(3);
  });
});
