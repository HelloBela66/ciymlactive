import { getEditionLanguageLabel } from './i18n-labels';

/**
 * Точковий тест лише для `getEditionLanguageLabel` — єдина функція (не просто дані-константа)
 * у цьому файлі. Знайдено аудитом каталог-імпорту (`docs/OWN_CATALOG_IMPORT.md`): Book Details
 * показував `edition.language` сирим ("Мова: uk") — цей тест підтверджує фікс.
 */
describe('getEditionLanguageLabel', () => {
  it('розпізнає поширені коди незалежно від регістру', () => {
    expect(getEditionLanguageLabel('uk')).toBe('Українська');
    expect(getEditionLanguageLabel('UK')).toBe('Українська');
    expect(getEditionLanguageLabel('ukr')).toBe('Українська');
    expect(getEditionLanguageLabel('ukrainian')).toBe('Українська');
    expect(getEditionLanguageLabel('en')).toBe('Англійська');
    expect(getEditionLanguageLabel('ru')).toBe('Російська');
  });

  it('обрізає пробіли навколо коду', () => {
    expect(getEditionLanguageLabel(' uk ')).toBe('Українська');
  });

  it('нерозпізнаний код — повертає сире значення як є (не порожньо, не вигадка)', () => {
    expect(getEditionLanguageLabel('xx')).toBe('xx');
    expect(getEditionLanguageLabel('Klingon')).toBe('Klingon');
  });
});
