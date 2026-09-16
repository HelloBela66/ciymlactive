'use strict';

const {
  sniffImageType,
  isRetryableStatus,
  runWithConcurrency,
  downloadCoverBytes,
  uploadCoverBytes,
  processCover,
  MAX_COVER_BYTES,
  CURATED_COVER_PREFIX,
} = require('./cover');

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const HTML_BYTES = Buffer.from('<!DOCTYPE html><html><body>404 Not Found</body></html>', 'utf8');

describe('sniffImageType', () => {
  it('розпізнає JPEG за сигнатурою FF D8 FF', () => {
    expect(sniffImageType(JPEG_BYTES)).toEqual({ mime: 'image/jpeg', extension: 'jpg' });
  });

  it('розпізнає PNG за 8-байтовою сигнатурою', () => {
    expect(sniffImageType(PNG_BYTES)).toEqual({ mime: 'image/png', extension: 'png' });
  });

  it('HTML під виглядом .jpg — null (ТЗ §16: реальна сигнатура байтів, не Content-Type/розширення)', () => {
    expect(sniffImageType(HTML_BYTES)).toBeNull();
  });

  it('порожні/закороткі байти — null, не виняток', () => {
    expect(sniffImageType(Buffer.from([]))).toBeNull();
    expect(sniffImageType(Buffer.from([0xff]))).toBeNull();
  });
});

describe('isRetryableStatus', () => {
  it('429 і 5xx — ретраюваний', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(599)).toBe(true);
  });

  it('404 і решта 4xx — НЕ ретраюваний (ретраїти зламане посилання марно, ТЗ §54)', () => {
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
  });

  it('200/300 — не ретраюваний (не мало б навіть викликатись для успіху, але про всяк випадок)', () => {
    expect(isRetryableStatus(200)).toBe(false);
    expect(isRetryableStatus(301)).toBe(false);
  });
});

describe('runWithConcurrency', () => {
  it('виконує всі задачі й повертає результати у вихідному порядку, попри паралельність', async () => {
    const tasks = [1, 2, 3, 4, 5].map((n) => () => Promise.resolve(n * 10));
    expect(await runWithConcurrency(tasks, 2)).toEqual([10, 20, 30, 40, 50]);
  });

  it('не запускає більше воркерів, ніж задач', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const tasks = Array.from({ length: 3 }, () => async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent--;
      return true;
    });
    await runWithConcurrency(tasks, 10);
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it('порожній список задач — порожній результат, не зависає', async () => {
    expect(await runWithConcurrency([], 4)).toEqual([]);
  });
});

/** Мінімальний mock `fetch`, що імітує стрім через `body.getReader()` (як реальний Node fetch). */
function mockFetchOk(bytes, status = 200) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    body: {
      getReader() {
        let done = false;
        return {
          read() {
            if (done) return Promise.resolve({ done: true, value: undefined });
            done = true;
            return Promise.resolve({ done: false, value: bytes });
          },
          // Реальний `ReadableStreamDefaultReader` (Node/undici) має `.cancel()` —
          // `downloadCoverBytes` викликає його, коли обрив стріму через перевищення
          // MAX_COVER_BYTES (`reader.cancel().catch(() => {})`); без цього методу тут мок кидає
          // "reader.cancel is not a function" замість очікуваного COVER_TOO_LARGE.
          cancel: () => Promise.resolve(),
        };
      },
    },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    text: async () => '',
    json: async () => ({}),
  });
}

function mockFetchHttpError(status) {
  return jest.fn().mockResolvedValue({ ok: false, status, text: async () => 'error body' });
}

describe('downloadCoverBytes', () => {
  it('успішне завантаження JPEG — повертає байти', async () => {
    const fetchImpl = mockFetchOk(JPEG_BYTES);
    const result = await downloadCoverBytes('https://example.com/cover.jpg', fetchImpl);
    expect(result.ok).toBe(true);
    expect(Buffer.from(result.bytes)).toEqual(JPEG_BYTES);
  });

  it('404 — не ретраїть, одразу повертає COVER_HTTP_ERROR', async () => {
    const fetchImpl = mockFetchHttpError(404);
    const result = await downloadCoverBytes('https://example.com/missing.jpg', fetchImpl);
    expect(result).toEqual({ ok: false, code: 'COVER_HTTP_ERROR', detail: 'HTTP 404' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('файл більший за ліміт — COVER_TOO_LARGE, без ретраю (не транзієнтна причина)', async () => {
    const bigBytes = Buffer.alloc(MAX_COVER_BYTES + 1, 0xff);
    const fetchImpl = mockFetchOk(bigBytes);
    const result = await downloadCoverBytes('https://example.com/huge.jpg', fetchImpl);
    expect(result).toEqual({ ok: false, code: 'COVER_TOO_LARGE' });
  });

  it('500 — ретраїть (транзієнтна причина, ТЗ §54), зрештою повертає помилку, якщо весь час 500', async () => {
    const fetchImpl = mockFetchHttpError(500);
    const result = await downloadCoverBytes('https://example.com/flaky.jpg', fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('COVER_HTTP_ERROR');
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1); // хоч би одна повторна спроба
  }, 10000);

  it('мережевий timeout (AbortError) — ретраюваний, зрештою COVER_DOWNLOAD_FAILED', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchImpl = jest.fn().mockRejectedValue(abortError);
    const result = await downloadCoverBytes('https://example.com/timeout.jpg', fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('COVER_DOWNLOAD_FAILED');
    expect(result.detail).toBe('timeout');
  }, 10000);
});

describe('uploadCoverBytes', () => {
  it('успішний upload — повертає власний public URL, ніколи URL джерела', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    const config = { supabaseUrl: 'https://project.supabase.co', serviceRoleKey: 'service-key' };
    const result = await uploadCoverBytes(JPEG_BYTES, { mime: 'image/jpeg', extension: 'jpg' }, 'kobzar-1840', config, fetchImpl);
    expect(result.ok).toBe(true);
    expect(result.url).toBe(
      'https://project.supabase.co/storage/v1/object/public/book-covers/curated/kobzar-1840.jpg',
    );
  });

  it('шлях об\'єкта — детермінований `curated/{id}.{ext}`, а не випадковий uuid у корені bucket', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    const config = { supabaseUrl: 'https://project.supabase.co', serviceRoleKey: 'service-key' };
    await uploadCoverBytes(PNG_BYTES, { mime: 'image/png', extension: 'png' }, 'kobzar-1840', config, fetchImpl);
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://project.supabase.co/storage/v1/object/book-covers/curated/kobzar-1840.png');
    expect(CURATED_COVER_PREFIX).toBe('curated/');
  });

  it('той самий id двічі — той САМИЙ шлях (повторний прогін перезаписує, а не плодить сиріт)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    const config = { supabaseUrl: 'https://project.supabase.co', serviceRoleKey: 'service-key' };
    const first = await uploadCoverBytes(JPEG_BYTES, { mime: 'image/jpeg', extension: 'jpg' }, 'kobzar-1840', config, fetchImpl);
    const second = await uploadCoverBytes(JPEG_BYTES, { mime: 'image/jpeg', extension: 'jpg' }, 'kobzar-1840', config, fetchImpl);
    expect(first.url).toBe(second.url);
    expect(fetchImpl.mock.calls[0][0]).toBe(fetchImpl.mock.calls[1][0]);
  });

  it('запит іде з x-upsert:true і Authorization: Bearer service_role (ТЗ §51)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    const config = { supabaseUrl: 'https://project.supabase.co', serviceRoleKey: 'service-key' };
    await uploadCoverBytes(PNG_BYTES, { mime: 'image/png', extension: 'png' }, 'kobzar-1840', config, fetchImpl);
    const [, options] = fetchImpl.mock.calls[0];
    // `true`, на відміну від `cover-upload/index.ts`: шлях тут детермінований, тож перезапис —
    // очікувана поведінка повторного прогону, а не ознака, що щось пішло не так.
    expect(options.headers['x-upsert']).toBe('true');
    expect(options.headers.Authorization).toBe('Bearer service-key');
    expect(options.headers['Content-Type']).toBe('image/png');
  });

  it('HTTP-помилка при upload — COVER_UPLOAD_FAILED, не кидає виняток', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden' });
    const config = { supabaseUrl: 'https://project.supabase.co', serviceRoleKey: 'bad-key' };
    const result = await uploadCoverBytes(JPEG_BYTES, { mime: 'image/jpeg', extension: 'jpg' }, 'kobzar-1840', config, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('COVER_UPLOAD_FAILED');
  });

  // Помилка ВИКЛИКУ (не прокинули id), а не подія даних — тому виняток, а не { ok: false }.
  // Без цієї перевірки `id === undefined` дав би шлях `curated/undefined.jpg`: один об'єкт на
  // весь каталог, перезаписаний 30 тисяч разів, і жодного сліду в звіті.
  it('кривий або відсутній id — кидає виняток, а не пише в curated/undefined.{ext}', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    const config = { supabaseUrl: 'https://project.supabase.co', serviceRoleKey: 'service-key' };
    const jpg = { mime: 'image/jpeg', extension: 'jpg' };

    await expect(uploadCoverBytes(JPEG_BYTES, jpg, undefined, config, fetchImpl)).rejects.toThrow(/слаг книги/);
    await expect(uploadCoverBytes(JPEG_BYTES, jpg, '', config, fetchImpl)).rejects.toThrow(/слаг книги/);
    // Слаг із роздільником шляху не може пройти ID_PATTERN — саме тому шлях тут можна будувати
    // з id, на відміну від `cover-upload/index.ts`, куди рядок приходить від клієнта.
    await expect(uploadCoverBytes(JPEG_BYTES, jpg, '../secret', config, fetchImpl)).rejects.toThrow(/слаг книги/);
    await expect(uploadCoverBytes(JPEG_BYTES, jpg, 'a'.repeat(101), config, fetchImpl)).rejects.toThrow(/слаг книги/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // Прямий захист від помилки, що виникла б при оновленні сигнатури: старий виклик
  // `uploadCoverBytes(bytes, type, config, fetchImpl)` передасть config туди, де очікується id.
  it('старий порядок аргументів (без id) падає одразу, а не пише кудись не туди', async () => {
    const config = { supabaseUrl: 'https://project.supabase.co', serviceRoleKey: 'service-key' };
    const fetchImpl = jest.fn();
    await expect(
      uploadCoverBytes(JPEG_BYTES, { mime: 'image/jpeg', extension: 'jpg' }, config, fetchImpl),
    ).rejects.toThrow(/слаг книги/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('processCover — повний конвеєр (ТЗ §16, кроки download→validate→upload)', () => {
  const config = { supabaseUrl: 'https://project.supabase.co', serviceRoleKey: 'service-key' };

  it('валідний JPEG — успіх, повертає власний URL', async () => {
    const fetchImpl = jest.fn();
    fetchImpl.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => { let d = false; return { read: () => (d ? Promise.resolve({ done: true }) : ((d = true), Promise.resolve({ done: false, value: JPEG_BYTES }))) }; } },
    });
    fetchImpl.mockResolvedValueOnce({ ok: true, text: async () => '' });
    const result = await processCover('https://retailer.example.com/cover.jpg', 'kobzar-1840', config, fetchImpl);
    expect(result.ok).toBe(true);
    expect(result.url).toContain('project.supabase.co/storage/v1/object/public/book-covers/');
  });

  it('валідний PNG — успіх', async () => {
    const fetchImpl = jest.fn();
    fetchImpl.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => { let d = false; return { read: () => (d ? Promise.resolve({ done: true }) : ((d = true), Promise.resolve({ done: false, value: PNG_BYTES }))) }; } },
    });
    fetchImpl.mockResolvedValueOnce({ ok: true, text: async () => '' });
    const result = await processCover('https://retailer.example.com/cover.png', 'kobzar-1840', config, fetchImpl);
    expect(result.ok).toBe(true);
  });

  it('404 з джерела — помилка COVER_HTTP_ERROR, upload взагалі не викликається', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 404, text: async () => '' });
    const result = await processCover('https://retailer.example.com/missing.jpg', 'kobzar-1840', config, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('COVER_HTTP_ERROR');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('HTML під виглядом .jpg (ретейлер повернув сторінку помилки з кодом 200) — COVER_INVALID_IMAGE, upload не викликається', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: { getReader: () => { let d = false; return { read: () => (d ? Promise.resolve({ done: true }) : ((d = true), Promise.resolve({ done: false, value: HTML_BYTES }))) }; } },
    });
    const result = await processCover('https://retailer.example.com/fake.jpg', 'kobzar-1840', config, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('COVER_INVALID_IMAGE');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('завеликий файл — COVER_TOO_LARGE, upload не викликається', async () => {
    const bigBytes = Buffer.alloc(MAX_COVER_BYTES + 1024, 0x00);
    JPEG_BYTES.copy(bigBytes, 0);
    const fetchImpl = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          let d = false;
          return {
            read: () => (d ? Promise.resolve({ done: true }) : ((d = true), Promise.resolve({ done: false, value: bigBytes }))),
            cancel: () => Promise.resolve(),
          };
        },
      },
    });
    const result = await processCover('https://retailer.example.com/huge.jpg', 'kobzar-1840', config, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('COVER_TOO_LARGE');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('той самий cover_url оброблений двічі поспіль дає той самий тип результату (детермінована, ідемпотентна логіка — сама мережа мокнута однаково)', async () => {
    const makeFetch = () => {
      const f = jest.fn();
      f.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { getReader: () => { let d = false; return { read: () => (d ? Promise.resolve({ done: true }) : ((d = true), Promise.resolve({ done: false, value: JPEG_BYTES }))) }; } },
      });
      f.mockResolvedValueOnce({ ok: true, text: async () => '' });
      return f;
    };
    const first = await processCover('https://retailer.example.com/cover.jpg', 'kobzar-1840', config, makeFetch());
    const second = await processCover('https://retailer.example.com/cover.jpg', 'kobzar-1840', config, makeFetch());
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });
});
