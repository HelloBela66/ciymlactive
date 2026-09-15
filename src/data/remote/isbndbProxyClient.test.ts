import type { ProviderSearchOutcome } from '@/lib/providerSearchError';
import type { IsbndbProxyBook } from './isbndbProxyClient';

/**
 * POLYTSIA FOUNDATION FINAL POLISH — Task B (`docs/FOUNDATION_FINAL_POLISH_REPORT.md`, §7-8, §12
 * доповнення після реального прогону CI). Дзеркальний тест до `googleBooksProxyClient.test.ts`
 * (той самий `callProxy` контракт, той самий `jest.resetModules()` + `require()` патерн для
 * env-залежного модуля — ПОВНЕ пояснення "чому саме `require()`, а не динамічний `import()`"
 * (`import()` пройшов локальний `npm test`, але зламав CI під `jest-expo`/`babel-preset-expo`)
 * лишається коментарем там-таки, не дублюється тут).
 */

type IsbndbProxyClientModule = typeof import('./isbndbProxyClient');

async function loadClient(): Promise<IsbndbProxyClientModule> {
  jest.resetModules();
  // Динамічний import() ламає CI під jest-expo (див. коментар над файлом
  // googleBooksProxyClient.test.ts); require() — єдиний робочий спосіб перезавантажити цей
  // env-залежний модуль між тестами.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- require() навмисний, див. коментар вище
  return require('./isbndbProxyClient') as IsbndbProxyClientModule;
}

function configureEnv(): void {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-do-not-leak-12345';
  process.env.EXPO_PUBLIC_ISBNDB_PROXY_ENABLED = '1';
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const originalEnv = { ...process.env };

afterEach(() => {
  jest.useRealTimers();
  process.env = { ...originalEnv };
  delete (global as { fetch?: unknown }).fetch;
});

describe('IsbndbProxyClient.search — конфігурація проксі', () => {
  it('проксі НЕ налаштовано (ISBNdb вимкнений/не задеплоєний) — success: [] одразу, fetch не викликається', async () => {
    delete process.env.EXPO_PUBLIC_ISBNDB_PROXY_ENABLED;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { IsbndbProxyClient } = await loadClient();

    const result = await IsbndbProxyClient.search('дюна', undefined);

    expect(result).toEqual({ status: 'success', items: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('IsbndbProxyClient.search — HTTP-класифікація (проксі налаштовано)', () => {
  it('2xx з книгами — success з items', async () => {
    configureEnv();
    const book: IsbndbProxyBook = { externalId: 'isbndb-1', title: 'Дюна', authors: ['Френк Герберт'] };
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { books: [book] })) as unknown as typeof fetch;
    const { IsbndbProxyClient } = await loadClient();

    const result = await IsbndbProxyClient.search('дюна', undefined);

    expect(result).toEqual({ status: 'success', items: [book] });
  });

  it('2xx, books: [] — success з ПОРОЖНІМ items (генуїнний "нічого не знайдено", НЕ помилка)', async () => {
    configureEnv();
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { books: [] })) as unknown as typeof fetch;
    const { IsbndbProxyClient } = await loadClient();

    const result = await IsbndbProxyClient.search('щосьнеіснуюче123', undefined);

    expect(result).toEqual({ status: 'success', items: [] });
  });

  it('HTTP 429 — error, kind: rate_limited', async () => {
    configureEnv();
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(429, { error: 'rate limited' })) as unknown as typeof fetch;
    const { IsbndbProxyClient } = await loadClient();

    const result = await IsbndbProxyClient.search('дюна', undefined);

    expect(result).toEqual({ status: 'error', error: { kind: 'rate_limited' } });
  });

  it('HTTP 500 — error, kind: server', async () => {
    configureEnv();
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(500, { error: 'internal' })) as unknown as typeof fetch;
    const { IsbndbProxyClient } = await loadClient();

    const result = await IsbndbProxyClient.search('дюна', undefined);

    expect(result).toEqual({ status: 'error', error: { kind: 'server' } });
  });

  it('мережевий збій (fetch reject, не AbortError) — error, kind: network', async () => {
    configureEnv();
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;
    const { IsbndbProxyClient } = await loadClient();

    const result = await IsbndbProxyClient.search('дюна', undefined);

    expect(result).toEqual({ status: 'error', error: { kind: 'network' } });
  });

  it('клієнтський timeout (внутрішній AbortController спрацьовує раніше відповіді) — error, kind: timeout', async () => {
    configureEnv();
    jest.useFakeTimers();
    global.fetch = jest.fn((_url: string, options?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          const abortError = new Error('The operation was aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      });
    }) as unknown as typeof fetch;
    const { IsbndbProxyClient } = await loadClient();

    const promise = IsbndbProxyClient.search('дюна', undefined);
    jest.advanceTimersByTime(15_000);
    const result = await promise;

    expect(result).toEqual({ status: 'error', error: { kind: 'timeout' } });
  });

  it('2xx, але тіло не є валідним JSON — error, kind: invalid_response', async () => {
    configureEnv();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
      text: async () => '<html>не JSON</html>',
    }) as unknown as typeof fetch;
    const { IsbndbProxyClient } = await loadClient();

    const result = await IsbndbProxyClient.search('дюна', undefined);

    expect(result).toEqual({ status: 'error', error: { kind: 'invalid_response' } });
  });
});

describe('IsbndbProxyClient.search — секрети (платний ISBNdb-ключ, анонімний ключ) ніколи не потрапляють у клієнтський результат', () => {
  it('success-outcome не містить анонімного ключа/заголовків/URL проксі', async () => {
    configureEnv();
    const book: IsbndbProxyBook = { externalId: 'isbndb-1', title: 'Дюна', authors: ['Френк Герберт'] };
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { books: [book] })) as unknown as typeof fetch;
    const { IsbndbProxyClient } = await loadClient();

    const result: ProviderSearchOutcome<IsbndbProxyBook> = await IsbndbProxyClient.search('дюна', undefined);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('test-anon-key-do-not-leak-12345');
    expect(serialized).not.toContain('supabase.co');
    expect(serialized).not.toMatch(/apikey|authorization/i);
  });

  it('error-outcome (500) не містить анонімного ключа/платного ISBNdb-ключа/сирого тіла відповіді', async () => {
    configureEnv();
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(500, { error: 'internal', isbndbApiKey: 'paid-secret-key-server-only' })) as unknown as typeof fetch;
    const { IsbndbProxyClient } = await loadClient();

    const result = await IsbndbProxyClient.search('дюна', undefined);
    const serialized = JSON.stringify(result);

    expect(result).toEqual({ status: 'error', error: { kind: 'server' } });
    expect(serialized).not.toContain('test-anon-key-do-not-leak-12345');
    expect(serialized).not.toContain('paid-secret-key-server-only');
  });
});
