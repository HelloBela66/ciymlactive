import { classifyHttpStatus, describeProviderSearchError, type ProviderSearchErrorKind } from './providerSearchError';

/**
 * POLYTSIA FOUNDATION FINAL POLISH — Task B (`docs/FOUNDATION_FINAL_POLISH_REPORT.md`, §7).
 * Чисті функції, спільна класифікація помилок пошукових провайдерів.
 */

describe('providerSearchError.classifyHttpStatus', () => {
  it('429 → rate_limited', () => {
    expect(classifyHttpStatus(429)).toBe('rate_limited');
  });

  it('500..599 → server (межі діапазону включно)', () => {
    expect(classifyHttpStatus(500)).toBe('server');
    expect(classifyHttpStatus(503)).toBe('server');
    expect(classifyHttpStatus(599)).toBe('server');
  });

  it('інші не-OK статуси (400, 404, 600) → unknown', () => {
    expect(classifyHttpStatus(400)).toBe('unknown');
    expect(classifyHttpStatus(404)).toBe('unknown');
    expect(classifyHttpStatus(600)).toBe('unknown');
  });
});

describe('providerSearchError.describeProviderSearchError', () => {
  const ALL_KINDS: ProviderSearchErrorKind[] = ['network', 'timeout', 'rate_limited', 'server', 'invalid_response', 'unknown'];

  it('кожен kind дає непорожній, не технічний текст — жодного HTTP-коду/stack trace/секрету всередині', () => {
    for (const kind of ALL_KINDS) {
      const message = describeProviderSearchError(kind, 'Google Books');
      expect(message.length).toBeGreaterThan(0);
      expect(message).toContain('Google Books');
      // §16 ТЗ — ніколи сирий HTTP-статус чи слово "Error"/"stack" в тексті для користувача.
      expect(message).not.toMatch(/\b\d{3}\b/); // жоден 3-значний код (429/500/503 тощо)
      expect(message.toLowerCase()).not.toMatch(/stack|exception|undefined|null/);
    }
  });

  it('server/invalid_response/unknown навмисно діляться одним і тим самим спільним, м\'яким формулюванням', () => {
    const server = describeProviderSearchError('server', 'ISBNdb');
    const invalid = describeProviderSearchError('invalid_response', 'ISBNdb');
    const unknown = describeProviderSearchError('unknown', 'ISBNdb');
    expect(server).toBe(invalid);
    expect(invalid).toBe(unknown);
  });

  it('rate_limited/timeout/network мають ВІДМІННІ одне від одного формулювання (не один спільний текст на всі випадки)', () => {
    const messages = new Set([
      describeProviderSearchError('rate_limited', 'X'),
      describeProviderSearchError('timeout', 'X'),
      describeProviderSearchError('network', 'X'),
      describeProviderSearchError('server', 'X'),
    ]);
    expect(messages.size).toBe(4);
  });
});
