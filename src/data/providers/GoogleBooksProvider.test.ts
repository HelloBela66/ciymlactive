/**
 * POLYTSIA FOUNDATION FINAL POLISH — Task B (`docs/FOUNDATION_FINAL_POLISH_REPORT.md`, §7-8, §12
 * доповнення після реального прогону CI).
 *
 * `GoogleBooksProvider` — єдиний провайдер із ДВОМА шляхами (проксі налаштовано / прямий
 * анонімний fallback, докладніше — коментар над файлом), обидва мусять узгоджено пропускати
 * `ProviderSearchOutcome` (не голий масив) до `useProviderSearch`/`search.tsx`. Той самий
 * `jest.resetModules()` + `require()` патерн, що й `googleBooksProxyClient.test.ts` —
 * `isGoogleBooksProxyConfigured()` читає `process.env` на рівні модуля; ПОВНЕ пояснення "чому
 * саме `require()`, а не динамічний `import()`" (`import()` пройшов локальний `npm test`, але
 * зламав CI під `jest-expo`/`babel-preset-expo`) лишається коментарем там-таки, не дублюється тут.
 *
 * Другий блок тестів — РЕГРЕСІЙНИЙ тест на конкретний баг, знайдений і виправлений У МЕЖАХ
 * цього ж пасу (не поза його рамками): `lookupByISBN`'s прямий (без проксі) шлях індексував
 * `fetchVolumesDirect(...)[0]` так, ніби той повертав голий масив — після переходу
 * `fetchVolumesDirect` на `ProviderSearchOutcome` це завжди повертало `undefined`, тобто
 * ISBN-лукап без налаштованого проксі мовчки ЗАВЖДИ повертав `null`, незалежно від реальної
 * відповіді Google Books.
 */

type GoogleBooksProviderModule = typeof import('./GoogleBooksProvider');

async function loadProvider(): Promise<GoogleBooksProviderModule> {
  jest.resetModules();
  // Динамічний import() ламає CI під jest-expo (див. коментар над файлом
  // googleBooksProxyClient.test.ts); require() — єдиний робочий спосіб перезавантажити цей
  // env-залежний модуль між тестами.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- require() навмисний, див. коментар вище
  return require('./GoogleBooksProvider') as GoogleBooksProviderModule;
}

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  delete (global as { fetch?: unknown }).fetch;
});

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('GoogleBooksProvider.searchBooks — проксі НЕ налаштовано (прямий анонімний шлях)', () => {
  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_GOOGLE_BOOKS_PROXY_ENABLED;
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  });

  it('успішна відповідь Google Books API — success з мапленими книгами', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        items: [{ id: 'vol-1', volumeInfo: { title: 'Дюна', authors: ['Френк Герберт'] } }],
      }),
    ) as unknown as typeof fetch;
    const { GoogleBooksProvider } = await loadProvider();

    const result = await GoogleBooksProvider.searchBooks('дюна', undefined);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.title).toBe('Дюна');
    }
  });

  it('HTTP 503 від Google Books — error, kind: server (не тихий success: [])', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(503, { error: 'unavailable' })) as unknown as typeof fetch;
    const { GoogleBooksProvider } = await loadProvider();

    const result = await GoogleBooksProvider.searchBooks('дюна', undefined);

    expect(result).toEqual({ status: 'error', error: { kind: 'server' } });
  });

  it('мережевий збій — error, kind: network', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;
    const { GoogleBooksProvider } = await loadProvider();

    const result = await GoogleBooksProvider.searchBooks('дюна', undefined);

    expect(result).toEqual({ status: 'error', error: { kind: 'network' } });
  });

  describe('lookupByISBN — РЕГРЕСІЙНИЙ тест (fetchVolumesDirect тепер ProviderSearchOutcome, не голий масив)', () => {
    it('Google Books реально знаходить видання за ISBN — повертає книгу, НЕ null', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        jsonResponse(200, {
          items: [
            {
              id: 'vol-isbn-1',
              volumeInfo: {
                title: 'Дюна',
                authors: ['Френк Герберт'],
                industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780441172719' }],
              },
            },
          ],
        }),
      ) as unknown as typeof fetch;
      const { GoogleBooksProvider } = await loadProvider();

      const result = await GoogleBooksProvider.lookupByISBN('9780441172719');

      expect(result).not.toBeNull();
      expect(result?.title).toBe('Дюна');
      expect(result?.isbn13).toBe('9780441172719');
    });

    it('Google Books не має видання за цим ISBN (items: []) — коректний null, без падіння', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { items: [] })) as unknown as typeof fetch;
      const { GoogleBooksProvider } = await loadProvider();

      const result = await GoogleBooksProvider.lookupByISBN('0000000000000');

      expect(result).toBeNull();
    });

    it('Google Books відповідає помилкою (500) — null, а не виняток', async () => {
      global.fetch = jest.fn().mockResolvedValue(jsonResponse(500, { error: 'internal' })) as unknown as typeof fetch;
      const { GoogleBooksProvider } = await loadProvider();

      const result = await GoogleBooksProvider.lookupByISBN('9780441172719');

      expect(result).toBeNull();
    });
  });
});

describe('GoogleBooksProvider.searchBooks — проксі налаштовано', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.EXPO_PUBLIC_GOOGLE_BOOKS_PROXY_ENABLED = '1';
  });

  it('проксі повертає книги — success', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, { books: [{ externalId: 'gb-1', title: 'Дюна', authors: ['Френк Герберт'] }] }),
    ) as unknown as typeof fetch;
    const { GoogleBooksProvider } = await loadProvider();

    const result = await GoogleBooksProvider.searchBooks('дюна', undefined);

    expect(result.status).toBe('success');
    if (result.status === 'success') expect(result.items[0]?.title).toBe('Дюна');
  });

  it('проксі повертає 429 — error, kind: rate_limited (проксі-шлях, не прямий)', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(429, { error: 'rate limited' })) as unknown as typeof fetch;
    const { GoogleBooksProvider } = await loadProvider();

    const result = await GoogleBooksProvider.searchBooks('дюна', undefined);

    expect(result).toEqual({ status: 'error', error: { kind: 'rate_limited' } });
  });
});
