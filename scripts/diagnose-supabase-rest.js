#!/usr/bin/env node
'use strict';

/**
 * ОДНОРАЗОВИЙ ДІАГНОСТИЧНИЙ СКРИПТ (не частина пайплайна, не покритий тестами, не для комітів
 * у git) — щоб з'ясувати причину `PGRST125 "Invalid path is specified in request URL"` (HTTP
 * 404), яку Supabase повертає на КОЖЕН upsert у `curated_book` (2026-09-14).
 *
 * Робить РІВНО ТОЙ САМИЙ запит, що й реальний upsert (`scripts/catalog-import/supabaseAdmin.js`
 * `upsertChunk`), але з одним тестовим рядком з унікальним id, і друкує ПОВНУ інформацію:
 * URL, статус, тіло відповіді, а також окремо перевіряє GET до того самого ресурсу й
 * кореневий `/rest/v1/` (OpenAPI-опис, показує, чи PostgREST взагалі бачить таблицю
 * `curated_book` у своєму schema cache).
 *
 * Використання:
 *   node scripts/diagnose-supabase-rest.js [--env-file=.env.admin]
 *
 * Тестовий рядок має id="__diagnostic_test__" — легко знайти й видалити вручну через
 * Supabase Table Editor після діагностики, якщо POST раптом успішний.
 */

const path = require('path');
const { loadSupabaseConfig } = require('./sync-curated-books');

function parseEnvFileArg(argv) {
  const flag = argv.find((a) => a.startsWith('--env-file='));
  return flag ? flag.slice('--env-file='.length) : '.env.admin';
}

async function main() {
  const envFile = parseEnvFileArg(process.argv.slice(2));
  const config = loadSupabaseConfig(path.resolve(envFile));

  if (!config) {
    console.error(`✖ Немає SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (перевір ${envFile}).`);
    process.exitCode = 1;
    return;
  }

  console.log('=== Конфігурація (безпечно показати — ключ НЕ друкується) ===');
  console.log('SUPABASE_URL:', config.supabaseUrl);
  console.log('SUPABASE_SERVICE_ROLE_KEY: довжина', config.serviceRoleKey.length, 'символів, починається з', config.serviceRoleKey.slice(0, 12) + '...');
  console.log('');

  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
  };

  // --- 1. Кореневий /rest/v1/ — OpenAPI-опис, показує, чи PostgREST взагалі бачить схему ---
  console.log('=== 1. GET /rest/v1/ (кореневий OpenAPI-опис) ===');
  try {
    const rootUrl = `${config.supabaseUrl}/rest/v1/`;
    console.log('URL:', rootUrl);
    const rootRes = await fetch(rootUrl, { headers });
    console.log('Статус:', rootRes.status);
    const rootText = await rootRes.text();
    const hasCuratedBook = rootText.includes('curated_book');
    console.log('Тіло містить "curated_book"?', hasCuratedBook ? 'ТАК' : 'НІ');
    if (!hasCuratedBook) {
      console.log('Перші 1000 символів тіла (щоб побачити, що PostgREST взагалі знає):');
      console.log(rootText.slice(0, 1000));
    }
  } catch (e) {
    console.log('✖ Виняток:', e.message);
  }
  console.log('');

  // --- 2. GET /rest/v1/curated_book?limit=1 — той самий шлях, що й fetchExistingCoverUrls ---
  console.log('=== 2. GET /rest/v1/curated_book?limit=1 ===');
  try {
    const getUrl = `${config.supabaseUrl}/rest/v1/curated_book?limit=1`;
    console.log('URL:', getUrl);
    const getRes = await fetch(getUrl, { headers });
    console.log('Статус:', getRes.status);
    console.log('Тіло:', (await getRes.text()).slice(0, 500));
  } catch (e) {
    console.log('✖ Виняток:', e.message);
  }
  console.log('');

  // --- 3. POST /rest/v1/curated_book?on_conflict=id — РІВНО ТОЙ САМИЙ запит, що реальний upsert ---
  console.log('=== 3. POST /rest/v1/curated_book?on_conflict=id (як у реальному upsert) ===');
  try {
    const postUrl = `${config.supabaseUrl}/rest/v1/curated_book?on_conflict=id`;
    console.log('URL:', postUrl);
    const testRow = {
      id: '__diagnostic_test__',
      title: 'Діагностичний тестовий рядок',
      authors: ['Діагностика'],
      isbn13: null,
      isbn10: null,
      page_count: null,
      cover_url: null,
      description: null,
      genres: [],
      purposes: [],
      language: 'uk',
      is_active: false,
    };
    const postRes = await fetch(postUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify([testRow]),
    });
    console.log('Статус:', postRes.status);
    console.log('Тіло:', (await postRes.text()).slice(0, 1000));
  } catch (e) {
    console.log('✖ Виняток:', e.message);
  }
  console.log('');
  console.log('Готово. Якщо крок 3 успішний (2xx) — видали тестовий рядок id="__diagnostic_test__" вручну в Supabase Table Editor.');
}

main().catch((error) => {
  console.error('✖ Неочікувана помилка:', error);
  process.exitCode = 1;
});
