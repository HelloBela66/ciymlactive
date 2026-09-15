import type { ProviderSearchOutcome } from '@/lib/providerSearchError';
import type { GoogleBooksProxyBook } from './googleBooksProxyClient';

/**
 * POLYTSIA FOUNDATION FINAL POLISH — Task B (`docs/FOUNDATION_FINAL_POLISH_REPORT.md`, §7-8).
 *
 * `isGoogleBooksProxyConfigured()`/`PROXY_ENABLED`/`SUPABASE_URL`/`SUPABASE_ANON_KEY` — усі
 * читаються з `process.env` РІВНО ОДИН РАЗ, на рівні модуля, в момент `import`. Щоб кожен тест
 * міг незалежно керувати "проксі налаштовано чи ні" й отримати ЧИСТИЙ модуль із новими значеннями
 * `process.env`, кожен тест виставляє потрібні змінні середовища, тоді `jest.resetModules()` +
 * динамічний `import()` (а не статичний `import` уверху файлу) — стандартний Jest-патерн для
 * модулів, чия поведінка залежить від оточення, зафіксованого при завантаженні; `require()` тут
 * навмисно НЕ використовується (`@typescript-eslint/no-require-imports`, проєкт лінтить проти
 * CommonJS-стилю навіть у тестах).
 */

type GoogleBooksProxyClientModule = typeof import('./googleBooksProxyClient');

async function loadClient(): Promise<GoogleBooksProxyClientModule> {
  jest.resetModules();
  return import('./googleBooksProxyClient');
}

function configureEnv(): void {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-do-not-leak-12345';
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_PROXY_ENABLED = '1';
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

describe('GoogleBooksProxyClient.search — конфігурація проксі', () => {
  it('проксі НЕ налаштовано (немає env) — success: [] одразу, fetch не викликається взагалі', async () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_BOOKS_PROXY_ENABLED;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { GoogleBooksProxyClient } = await loadClient();

    const result = await GoogleBooksProxyClient.search('дюна', undefined);

    expect(result).toEqual({ status: 'success', items: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GoogleBooksProxyClient.search — HTTP-класифікація (проксі налаштовано)', () => {
  it('2xx з книгами — success з items', async () => {
    configureEnv();
    const book: GoogleBooksProxyBook = { externalId: 'gb-1', title: 'Дюна', authors: ['Френк Герберт'] };
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { books: [book] })) as unknown as typeof fetch;
    const { GoogleBooksProxyClient } = await loadClient();

    const result = await GoogleBooksProxyClient.search('дюна', undefined);

    expect(result).toEqual({ status: 'success', items: [book] });
  });

  it('2xx, books: [] — success з ПОРОЖНІМ items (генуїнний "нічого не знайдено", НЕ помилка)', async () => {
    configureEnv();
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { books: [] })) as unknown as typeof fetch;
    const { GoogleBooksProxyClient } = await loadClient();

    const result = await GoogleBooksProxyClient.search('щосьнеіснуюче123', undefined);

    expect(result).toEqual({ status: 'success', items: [] });
  });

  it('HTTP 429 — error, kind: rate_limited', async () => {
    configureEnv();
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(429, { error: 'rate limited' })) as unknown as typeof fetch;
    const { GoogleBooksProxyClient } = await loadClient();

    const result = await GoogleBooksProxyClient.search('дюна', undefined);

    expect(result).toEqual({ status: 'error', error: { kind: 'rate_limited' } });
  });

  it('HTTP 503 — error, kind: server', async () => {
    configureEnv();
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(503, { error: 'unavailable' })) as unknown as typeof fetch;
    const { GoogleBooksProxyClient } = await loadClient();

    const result = await GoogleBooksProxyClient.search('дюна', undefined);

    expect(result).toEqual({ status: 'error', error: { kind: 'server' } });
  });

  it('мережевий збій (fetch reject, не AbortError) — error, kind: network', async () => {
    configureEnv();
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;
    const { GoogleBooksProxyClient } = await loadClient();

    const result = await GoogleBooksProxyClient.search('дюна', undefined);

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
    const { GoogleBooksProxyClient } = await loadClient();

    const promise = GoogleBooksProxyClient.search('дюна', undefined);
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
    const { GoogleBooksProxyClient } = await loadClient();

    const result = await GoogleBooksProxyClient.search('дюна', undefined);

    expect(result).toEqual({ status: 'error', error: { kind: 'invalid_response' } });
  });

  it('зовнішнє React Query скасування (signal.aborted=true) прокидається як виняток, а НЕ як success/error outcome', async () => {
    configureEnv();
    const controller = new AbortController();
    global.fetch = jest.fn(() => {
      controller.abort();
      const abortError = new Error('Aborted by caller');
      abortError.name = 'AbortError';
      return Promise.reject(abortError);
    }) as unknown as typeof fetch;
    const { GoogleBooksProxyClient } = await loadClient();

    await expect(GoogleBooksProxyClient.search('дюна', undefined, controller.signal)).rejects.toThrow();
  });
});

describe('GoogleBooksProxyClient.search — секрети ніколи не потрапляють у клієнтський результат', () => {
  it('success-outcome не містить анонімного ключа/заголовків/URL проксі', async () => {
    configureEnv();
    const book: GoogleBooksProxyBook = { externalId: 'gb-1', title: 'Дюна', authors: ['Френк Герберт'] };
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { books: [book] })) as unknown as typeof fetch;
    const { GoogleBooksProxyClient } = await loadClient();

    const result: ProviderSearchOutcome<GoogleBooksProxyBook> = await GoogleBooksProxyClient.search('дюна', undefined);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('test-anon-key-do-not-leak-12345');
    expect(serialized).not.toContain('supabase.co');
    expect(serialized).not.toMatch(/apikey|authorization/i);
  });

  it('error-outcome (429) не містить анонімного ключа/заголовків/сирого тіла відповіді', async () => {
    configureEnv();
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(429, { error: 'rate limited', apikey: 'server-side-secret' })) as unknown as typeof fetch;
    const { GoogleBooksProxyClient } = await loadClient();

    const result = await GoogleBooksProxyClient.search('дюна', undefined);
    const serialized = JSON.stringify(result);

    expect(result).toEqual({ status: 'error', error: { kind: 'rate_limited' } });
    expect(serialized).not.toContain('test-anon-key-do-not-leak-12345');
    expect(serialized).not.toContain('server-side-secret');
  });
});
