/**
 * Валідація ISBN-10/ISBN-13 (контрольна цифра) — навмисна ЧАСТКОВА дублікація
 * `src/lib/isbn.ts` (мобільний застосунок), не імпорт: Supabase Edge Functions виконуються в
 * окремому Deno-рантаймі (не Node/Metro), який не бачить `src/` мобільного застосунку взагалі
 * (немає спільного бандлера/tsconfig-path між двома рантаймами) — копіювання тут єдиний
 * практичний варіант без окремого npm-пакета заради двох невеликих функцій. Навмисно
 * скопійовано лише те, що реально потрібне проксі (валідація ISBN ПЕРЕД платним запитом до
 * ISBNdb, `POLYTSIA V1.5` Фаза 1.1) — без конвертації ISBN-10↔13, яка проксі не потрібна.
 *
 * Якщо колись розійдеться з оригіналом (`src/lib/isbn.ts`) — обидва файли мають той самий
 * алгоритм ISO 2108, розходження було б помилкою копіювання, не навмисною відмінністю.
 */

function normalizeIsbn(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

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

function isValidIsbn13(digits: string): boolean {
  if (!/^\d{13}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const value = Number(digits[i]);
    sum += i % 2 === 0 ? value : value * 3;
  }
  return sum % 10 === 0;
}

/** `true`, якщо рядок — коректний ISBN-10 чи ISBN-13 (з правильною контрольною цифрою), після
 * нормалізації (дефіси/пробіли прибираються). Використовується проксі ПЕРЕД зверненням до
 * ISBNdb — пошкоджений/вигаданий ISBN відсікається без витрати платного запиту. */
export function isValidIsbn(raw: string): boolean {
  const normalized = normalizeIsbn(raw);
  if (normalized.length === 10) return isValidIsbn10(normalized);
  if (normalized.length === 13) return isValidIsbn13(normalized);
  return false;
}

export { normalizeIsbn };
