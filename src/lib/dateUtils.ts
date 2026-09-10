/**
 * Усі дати в БД зберігаються як ISO-8601 UTC TEXT (див. docs/DATABASE.md).
 * Ці хелпери — єдина точка перетворення "зараз"/дат, щоб domain-логіка (яка отримує дати як
 * параметри, а не викликає Date.now() напряму) лишалась детермінованою й тестованою.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function toIso(date: Date): string {
  return date.toISOString();
}

export function fromIso(value: string): Date {
  return new Date(value);
}
