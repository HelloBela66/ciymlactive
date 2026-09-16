'use strict';

const {
  EXISTING_COVERS_CHUNK_SIZE,
  toUpsertBody,
  upsertChunk,
  upsertCuratedBooks,
  fetchExistingCoverUrls,
} = require('./supabaseAdmin');

const CONFIG = { supabaseUrl: 'https://project.supabase.co', serviceRoleKey: 'service-key' };

const NORMALIZED_SAMPLE = {
  id: 'kobzar-1840',
  title: 'Кобзар',
  authors: ['Тарас Шевченко'],
  isbn13: '9789660395008',
  isbn10: '9660395007',
  pageCount: 240,
  coverSourceUrl: 'https://retailer.example.com/kobzar.jpg', // НЕ має потрапити в body
  description: 'Збірка поезій.',
  genres: ['Класична література'],
  purposes: ['absorbed'],
  language: 'uk',
  isActive: true,
};

describe('toUpsertBody', () => {
  it('мапить normalized-поля в snake_case body для curated_book', () => {
    const body = toUpsertBody(NORMALIZED_SAMPLE, 'https://project.supabase.co/storage/v1/object/public/book-covers/uuid.jpg');
    expect(body).toEqual({
      id: 'kobzar-1840',
      title: 'Кобзар',
      authors: ['Тарас Шевченко'],
      isbn13: '9789660395008',
      isbn10: '9660395007',
      page_count: 240,
      cover_url: 'https://project.supabase.co/storage/v1/object/public/book-covers/uuid.jpg',
      description: 'Збірка поезій.',
      genres: ['Класична література'],
      purposes: ['absorbed'],
      language: 'uk',
      is_active: true,
    });
  });

  it('coverSourceUrl (джерело) НІКОЛИ не потрапляє в body як cover_url — лише власний Storage URL або null (ТЗ §16-17)', () => {
    const body = toUpsertBody(NORMALIZED_SAMPLE, null);
    expect(body.cover_url).toBeNull();
    expect(body.cover_url).not.toBe(NORMALIZED_SAMPLE.coverSourceUrl);
    expect(body).not.toHaveProperty('coverSourceUrl');
    expect(body).not.toHaveProperty('cover_source_url');
  });
});

describe('upsertChunk', () => {
  it('успішний upsert — POST на /rest/v1/curated_book?on_conflict=id з Prefer: resolution=merge-duplicates', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true });
    const result = await upsertChunk([toUpsertBody(NORMALIZED_SAMPLE, null)], CONFIG, fetchImpl);
    expect(result).toEqual({ ok: true });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://project.supabase.co/rest/v1/curated_book?on_conflict=id');
    expect(options.method).toBe('POST');
    expect(options.headers.Prefer).toBe('resolution=merge-duplicates,return=minimal');
    expect(options.headers.Authorization).toBe('Bearer service-key');
    expect(JSON.parse(options.body)).toEqual([toUpsertBody(NORMALIZED_SAMPLE, null)]);
  });

  it('HTTP-помилка — повертає ok:false зі статусом і деталями, не кидає виняток', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'check constraint violated' });
    const result = await upsertChunk([{ id: 'bad' }], CONFIG, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.detail).toContain('check constraint violated');
  });

  it('мережевий виняток — повертає ok:false замість викидання винятку', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('network down'));
    const result = await upsertChunk([{ id: 'x' }], CONFIG, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('network down');
  });
});

describe('upsertCuratedBooks', () => {
  function item(id) {
    return { rowNumber: 1, id, body: { id } };
  }

  it('усі чанки успішні — усі рядки ok:true', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true });
    const items = [item('a'), item('b'), item('c')];
    const results = await upsertCuratedBooks(items, CONFIG, fetchImpl, 2);
    expect(results).toEqual([
      { rowNumber: 1, id: 'a', ok: true },
      { rowNumber: 1, id: 'b', ok: true },
      { rowNumber: 1, id: 'c', ok: true },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // два чанки (розмір 2): [a,b], [c]
  });

  it('чанк відхилено — fallback по одному рядку, щоб ізолювати проблемний (ТЗ §38)', async () => {
    let callCount = 0;
    const fetchImpl = jest.fn().mockImplementation(async (_url, options) => {
      callCount++;
      const rows = JSON.parse(options.body);
      if (rows.length > 1) return { ok: false, status: 409, text: async () => 'conflict' };
      // по одному: 'bad' падає, решта проходить
      if (rows[0].id === 'bad') return { ok: false, status: 400, text: async () => 'check violated' };
      return { ok: true };
    });
    const items = [item('good1'), item('bad'), item('good2')];
    const results = await upsertCuratedBooks(items, CONFIG, fetchImpl, 10);
    expect(results).toEqual([
      { rowNumber: 1, id: 'good1', ok: true },
      { rowNumber: 1, id: 'bad', ok: false, code: 'DB_UPSERT_FAILED', status: 400, detail: 'check violated' },
      { rowNumber: 1, id: 'good2', ok: true },
    ]);
    expect(callCount).toBe(4); // 1 спроба чанком + 3 по одному
  });

  it('порожній список — порожній результат, жодного HTTP-виклику', async () => {
    const fetchImpl = jest.fn();
    expect(await upsertCuratedBooks([], CONFIG, fetchImpl)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('повторний виклик із тими самими id — той самий результат (ідемпотентність через merge-duplicates, ТЗ §40)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true });
    const items = [item('kobzar-1840')];
    const first = await upsertCuratedBooks(items, CONFIG, fetchImpl);
    const second = await upsertCuratedBooks(items, CONFIG, fetchImpl);
    expect(first).toEqual(second);
  });
});

describe('fetchExistingCoverUrls', () => {
  it('повертає Map id → cover_url для знайдених рядків', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'a', cover_url: 'https://project.supabase.co/storage/v1/object/public/book-covers/a.jpg' },
        { id: 'b', cover_url: null },
      ],
    });
    const result = await fetchExistingCoverUrls(['a', 'b'], CONFIG, fetchImpl);
    expect(result.get('a')).toBe('https://project.supabase.co/storage/v1/object/public/book-covers/a.jpg');
    expect(result.get('b')).toBeNull();
    expect(result.has('c')).toBe(false);
  });

  it('запит іде до select=id,cover_url&id=in.(...)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
    await fetchExistingCoverUrls(['book-a', 'book-b'], CONFIG, fetchImpl);
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toContain('select=id,cover_url');
    expect(url).toContain('id=in.(book-a,book-b)');
  });

  // Раніше тут був протилежний тест — "best-effort, не кидає виняток, просто не додає ці id в
  // Map". Він фіксував саме ту поведінку, що на повному каталозі (29 986 книг) означала: порожня
  // мапа → всі рядки вважаються новими → всі обкладинки перезаливаються, а попередні файли
  // лишаються в bucket сиротами. Тихий пропуск тут не втрачає дані, він їх подвоює — тож
  // правильна поведінка протилежна: зупинити прогін.
  it('не-OK відповідь — кидає виняток, а не повертає порожню Map (подвоєння в Storage гірше за падіння)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 414, text: async () => 'URI Too Long' });
    await expect(fetchExistingCoverUrls(['a'], CONFIG, fetchImpl)).rejects.toThrow(/HTTP 414/);
  });

  it('виняток містить URL, статус і тіло відповіді — три різні причини розрізняються без здогадок', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'Invalid API key' });
    await expect(fetchExistingCoverUrls(['kobzar-1840'], CONFIG, fetchImpl)).rejects.toThrow(
      /rest\/v1\/curated_book\?select=id,cover_url&id=in\.\(kobzar-1840\)/,
    );
    await expect(fetchExistingCoverUrls(['kobzar-1840'], CONFIG, fetchImpl)).rejects.toThrow(/Invalid API key/);
  });

  it('падіння на середньому чанку зупиняє прогін цілком, а не лише пропускає цей чанк', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'a', cover_url: null }] })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom' });
    await expect(fetchExistingCoverUrls(['a', 'b', 'c'], CONFIG, fetchImpl, 1)).rejects.toThrow(/HTTP 500/);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // третій чанк уже не виконується
  });

  it('типовий розмір чанка — 80 id за замовчуванням (URL лишається в межах ~8 КБ на реальних слагах)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
    const ids = Array.from({ length: 161 }, (_, i) => `book-${i}`);
    await fetchExistingCoverUrls(ids, CONFIG, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 80 + 80 + 1
    expect(EXISTING_COVERS_CHUNK_SIZE).toBe(80);
  });

  it('порожній список id — порожня Map, жодного HTTP-виклику', async () => {
    const fetchImpl = jest.fn();
    const result = await fetchExistingCoverUrls([], CONFIG, fetchImpl);
    expect(result.size).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('чанкує за chunkSize (багато id — кілька запитів)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
    const ids = Array.from({ length: 5 }, (_, i) => `book-${i}`);
    await fetchExistingCoverUrls(ids, CONFIG, fetchImpl, 2);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 2+2+1
  });
});
