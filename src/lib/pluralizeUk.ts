/**
 * Українська плюралізація лічильників (день/дні/днів, книга/книги/книг тощо) — без цього
 * "1 днів поспіль"/"1 книг" виглядає явно неправильно у статистиці/цілях (Milestone 5).
 * Стандартне правило: форма залежить від останньої цифри й останніх двох цифр числа
 * (виняток 11-14 — завжди "багато", навіть коли останньою цифрою є 1/2/3/4).
 */
export function pluralizeUk(count: number, forms: readonly [one: string, few: string, many: string]): string {
  const abs = Math.abs(Math.trunc(count));
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
