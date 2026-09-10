#!/usr/bin/env node
'use strict';

/**
 * Одноразовий (запускати за потреби) хелпер для `data/curated-books.csv`: коли `id` довший за
 * 100 символів — межа з валідації `sync-curated-books.js` (`/^[a-z0-9-]{1,100}$/`) — акуратно
 * вкорочує його замість ручної правки рядок-за-рядком. Причина, з якої це окремий скрипт, а не
 * частина самого sync: `id` — первинний ключ, і його зміна для вже завантаженої книги створює
 * НОВИЙ запис у базі, тож вкорочення має бути детермінованим і одноразовим до першого sync, а
 * не логікою, що виконується на кожному запуску.
 *
 * Алгоритм на рядок з задовгим `id`:
 *   1. обрізає префікс до ~90 символів;
 *   2. відступає назад до останнього дефіса в цьому префіксі, щоб не розрізати слово навпіл
 *      (якщо дефіса немає взагалі в перших 90 символах — рідкість для цих id — лишає жорсткий
 *      обріз на 90);
 *   3. додає `-` + перші 8 символів sha1-хеша ВІД ОРИГІНАЛЬНОГО id — детерміновано (повторний
 *      запуск на тому самому оригінальному id дав би той самий суфікс) і достатньо, щоб не
 *      зіштовхнути різні книги з однаковим обрізаним префіксом.
 *   4. якщо результат все одно зіткнувся з іншим id у файлі (вже вкороченим чи звичайним) —
 *      підставляє короткий лічильник (`-2`, `-3`, ...), поки не стане унікальним.
 *
 * Рядки з валідним (≤100 симв.) `id` не чіпає взагалі. Перед перезаписом зберігає копію
 * оригіналу в `data/curated-books.csv.bak` (перезаписує попередній `.bak`, якщо він лишився
 * від попереднього запуску).
 *
 * Якщо той самий задовгий `id` трапляється в файлі більше одного разу (типовий симптом —
 * випадково задубльований блок рядків, окрема проблема від самої довжини) — обом/усім таким
 * рядкам навмисно присвоюється ОДИН і той самий новий короткий id, а не різні: інакше
 * `sync-curated-books.js` більше не зміг би впізнати дублікат за своєю ж перевіркою "id вже
 * використаний у рядку N цього ж файлу", і задубльована книга тихо потрапила б у базу двічі
 * під двома різними id. Скрипт лише попереджає про такі випадки в підсумку — сам рядок не
 * видаляє, який із дублікатів прибрати вирішує людина.
 *
 * Використання: `node scripts/shorten-long-ids.js` з кореня репозиторію, потім
 * `node scripts/sync-curated-books.js` як звично.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const CSV_PATH = path.join(ROOT_DIR, 'data', 'curated-books.csv');
const BACKUP_PATH = `${CSV_PATH}.bak`;

const MAX_ID_LENGTH = 100;
const HASH_LENGTH = 8;
const TARGET_PREFIX_LENGTH = 90;
const MIN_PREFIX_AFTER_HYPHEN_BACKTRACK = 20;

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// Той самий мінімальний CSV-парсер, що й у sync-curated-books.js (лапки для значень, що самі
// містять кому/лапку/новий рядок) — навмисна копія, не імпорт: два незалежні одноразові
// Node-скрипти без спільних залежностей простіше тримати самодостатніми.
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0]).map((cell) => cell.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    header.forEach((key, index) => {
      row[key] = cells[index] ?? '';
    });
    return row;
  });
  return { header, rows };
}

// Лапкує поле лише якщо потрібно (містить кому, лапку чи новий рядок) — щоб не захаращувати
// файл зайвими лапками там, де оригінал обходився без них.
function formatCsvField(value) {
  const str = value ?? '';
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatCsvRow(header, row) {
  return header.map((key) => formatCsvField(row[key])).join(',');
}

function shortenId(originalId, takenIds) {
  const hash = crypto.createHash('sha1').update(originalId).digest('hex').slice(0, HASH_LENGTH);

  let prefix = originalId.slice(0, TARGET_PREFIX_LENGTH);
  const lastHyphen = prefix.lastIndexOf('-');
  if (lastHyphen >= MIN_PREFIX_AFTER_HYPHEN_BACKTRACK) {
    prefix = prefix.slice(0, lastHyphen);
  }
  // Прибираємо дефіс(и) на самому кінці префікса — інакше вийде `...слово--хеш`.
  prefix = prefix.replace(/-+$/, '');

  let candidate = `${prefix}-${hash}`;
  let suffix = 2;
  while (takenIds.has(candidate) || candidate.length > MAX_ID_LENGTH) {
    candidate = `${prefix}-${hash}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`Не знайшов файл: ${CSV_PATH}`);
    process.exit(1);
  }

  const rawContent = stripBom(fs.readFileSync(CSV_PATH, 'utf8'));
  const { header, rows } = parseCsv(rawContent);

  if (!header.includes('id')) {
    console.error('У заголовку CSV немає колонки "id" — перевір файл.');
    process.exit(1);
  }

  // Ids коротших/рівних ліміту — вони НЕ братимуть участі в генерації нових коротких id
  // (уникаємо колізії з уже існуючими короткими id), але довгі рахуємо один раз на УНІКАЛЬНЕ
  // значення, а не на рядок: якщо той самий задовгий id зустрічається в файлі двічі (типово —
  // випадково задвоєний блок рядків, окрема проблема від самої довжини), обидва рядки мають
  // отримати ОДИН І ТОЙ САМИЙ новий id — так дублікат лишається дублікатом і його далі ловить
  // власна перевірка sync-curated-books.js ("id вже використаний у рядку N цього ж файлу"),
  // а не ховається під двома різними згенерованими id, що перетворило б один дубльований рядок
  // на дві окремі книги в базі.
  const takenIds = new Set(rows.filter((row) => (row.id ?? '').length <= MAX_ID_LENGTH).map((row) => row.id));
  const longIds = rows.map((row) => row.id ?? '').filter((id) => id.length > MAX_ID_LENGTH);
  const uniqueLongIds = [...new Set(longIds)];

  const idMap = new Map(); // originalId (>100 симв.) -> новий короткий id
  for (const originalId of uniqueLongIds) {
    const newId = shortenId(originalId, takenIds);
    takenIds.add(newId);
    idMap.set(originalId, newId);
  }

  if (idMap.size === 0) {
    console.log('Задовгих id (>100 символів) не знайдено — нічого змінювати.');
    return;
  }

  const changedRows = [];
  const duplicateWarnings = [];
  const countByOriginal = new Map();
  for (const id of longIds) {
    countByOriginal.set(id, (countByOriginal.get(id) ?? 0) + 1);
  }

  rows.forEach((row, index) => {
    const currentId = row.id ?? '';
    if (currentId.length <= MAX_ID_LENGTH) return;
    const newId = idMap.get(currentId);
    row.id = newId;
    changedRows.push({ rowNumber: index + 2, oldId: currentId, newId });
  });

  for (const [originalId, count] of countByOriginal) {
    if (count > 1) {
      duplicateWarnings.push({ id: idMap.get(originalId), original: originalId, count });
    }
  }

  fs.copyFileSync(CSV_PATH, BACKUP_PATH);

  const outLines = [header.join(','), ...rows.map((row) => formatCsvRow(header, row))];
  fs.writeFileSync(CSV_PATH, `${outLines.join('\n')}\n`, 'utf8');

  console.log(
    `Вкорочено ${idMap.size} унікальних id (${changedRows.length} рядків, оригінал збережено в ${path.relative(ROOT_DIR, BACKUP_PATH)}):\n`,
  );
  for (const { oldId, newId } of [...idMap.entries()].map(([oldId, newId]) => ({ oldId, newId }))) {
    console.log(`  ${oldId} (${oldId.length} симв.)\n  → ${newId} (${newId.length} симв.)\n`);
  }

  if (duplicateWarnings.length > 0) {
    console.log(`\n⚠ ${duplicateWarnings.length} із цих id зустрічались у файлі БІЛЬШЕ ОДНОГО РАЗУ до вкорочення —`);
    console.log('  це не просто довгий id, а задубльований рядок; обом рядкам зумисно присвоєно ОДИН і той');
    console.log('  самий новий id, щоб sync-curated-books.js впіймав це як звичайний дублікат id і підказав,');
    console.log('  який рядок прибрати (сам скрипт рядки не видаляє):\n');
    for (const { id, count } of duplicateWarnings) {
      console.log(`  "${id}" — зустрічається ${count} рази`);
    }
  }

  console.log('\nДалі: node scripts/sync-curated-books.js');
}

main();
