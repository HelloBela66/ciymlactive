/**
 * Валідація й конвертація ISBN-10/ISBN-13 — чиста доменна логіка, без React/SQL
 * (docs/TESTING.md), спільна для двох місць (Milestone 10 fix6, `docs/STATUS_V1.md`):
 *
 * 1. `app/isbn-scan.tsx` (п. 3.3) — перевірка коректності відсканованого штрихкоду ПЕРЕД
 *    платним запитом до ISBNdb: до цього єдиною перевіркою була "довжина ≥ 10 символів", без
 *    перевірки контрольної цифри — пошкоджений скан (погане освітлення) з правильною
 *    довжиною, але хибною цифрою, доходив аж до платного запиту й показував заплутане
 *    "не знайдено" замість "це не схоже на коректний ISBN".
 * 2. `src/data/remote/catalogSync.ts` (п. 3.5) — пошук існуючого запису спільного каталогу за
 *    ISBN раніше звіряв ISBN13-до-ISBN13 АБО ISBN10-до-ISBN10 без перерахунку одного в інший,
 *    хоча кожен ISBN13, що починається на 978, має єдиний математично еквівалентний ISBN10 —
 *    без конвертації дві людини, що зберегли ту саму книгу через різні провайдери (один дав
 *    лише ISBN13, інший — лише еквівалентний ISBN10), роздвоювали запис каталогу.
 *
 * Обидва місця мають одну книгу представляти одним записом, тож обчислення "який ще ISBN
 * може позначати ту саму книгу" винесено сюди одним джерелом правди.
 */

/** Прибирає дефіси/пробіли, які часто трапляються у відсканованих чи вручну введених ISBN. */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

/** Контрольна цифра ISBN-10: сума (10..1) × цифра, ділиться на 11 (остання позиція може бути 'X' = 10). */
function isValidIsbn10(digits: string): boolean {
  if (!/^\d{9}[\dX]$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const char = digits[i];
    const value = char === 'X' ? 10 : Number(char);
    sum += (10 - i) * value;
  }
  return sum % 11 === 0;
}

/** Контрольна цифра ISBN-13: чергування ваг 1/3, сума кратна 10 (стандарт EAN-13). */
function isValidIsbn13(digits: string): boolean {
  if (!/^\d{13}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const value = Number(digits[i]);
    sum += i % 2 === 0 ? value : value * 3;
  }
  return sum % 10 === 0;
}

/**
 * `true`, якщо рядок — коректний ISBN-10 або ISBN-13 (з правильною контрольною цифрою),
 * після нормалізації (дефіси/пробіли прибираються). Порожній/явно закороткий вхід — `false`,
 * без винятків, щоб виклик лишався простою умовою в UI.
 */
export function isValidIsbn(raw: string): boolean {
  const normalized = normalizeIsbn(raw);
  if (normalized.length === 10) return isValidIsbn10(normalized);
  if (normalized.length === 13) return isValidIsbn13(normalized);
  return false;
}

/**
 * ISBN-10 → ISBN-13: відкидає стару контрольну цифру, додає префікс "978" і перераховує нову
 * контрольну цифру за правилом ISBN-13. Повертає `null`, якщо вхід — не коректний ISBN-10
 * (конвертувати пошкоджений/неповний ISBN немає сенсу — викликати після `isValidIsbn`).
 */
export function isbn10To13(raw: string): string | null {
  const normalized = normalizeIsbn(raw);
  if (!isValidIsbn10(normalized)) return null;
  const core = `978${normalized.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += i % 2 === 0 ? Number(core[i]) : Number(core[i]) * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return `${core}${check}`;
}

/**
 * ISBN-13 → ISBN-10: лише для видань, чий ISBN-13 починається на "978" (весь книжковий
 * простір до впровадження ISBN-13 — саме такий, `979`-видання ISBN-10-еквіваленту не мають
 * взагалі). Перераховує контрольну цифру за правилом ISBN-10 (може бути 'X'). Повертає `null`
 * для некоректного ISBN-13 або якщо префікс не "978".
 */
export function isbn13To10(raw: string): string | null {
  const normalized = normalizeIsbn(raw);
  if (!isValidIsbn13(normalized)) return null;
  if (!normalized.startsWith('978')) return null;
  const core = normalized.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * Number(core[i]);
  }
  const remainder = (11 - (sum % 11)) % 11;
  const check = remainder === 10 ? 'X' : String(remainder);
  return `${core}${check}`;
}

/**
 * Обидва еквіваленти книги (для звірки "чи це той самий запис каталогу", п. 3.5): якщо на
 * вході ISBN-10, повертає `{ isbn10, isbn13 }` з обчисленим ISBN-13; якщо ISBN-13 із префіксом
 * "978", повертає обчислений ISBN-10 теж. Некоректний вхід чи ISBN-13 з префіксом "979" (не
 * має ISBN-10-еквіваленту за визначенням) повертають те поле, яке НЕ вдалось обчислити, як
 * `null` — виклик має бути готовий, що один з двох може бути відсутній.
 */
export function isbnEquivalents(raw: string): { isbn10: string | null; isbn13: string | null } {
  const normalized = normalizeIsbn(raw);
  if (isValidIsbn10(normalized)) {
    return { isbn10: normalized, isbn13: isbn10To13(normalized) };
  }
  if (isValidIsbn13(normalized)) {
    return { isbn10: isbn13To10(normalized), isbn13: normalized };
  }
  return { isbn10: null, isbn13: null };
}
