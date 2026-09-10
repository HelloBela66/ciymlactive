/**
 * Коли в книги ще немає обкладинки (ручне додавання без coverUrl), показуємо плашку
 * приглушеного кольору з ініціалом назви — детерміновано за назвою, щоб та сама книга
 * завжди мала той самий колір. Палітра підібрана в стилі design tokens (спокійна, без
 * неонових/яскравих відтінків) — див. docs/ARCHITECTURE.md розділ 6.
 */
const FALLBACK_PALETTE = [
  '#8C6E54', // приглушена теракота
  '#5B7A8C', // приглушений синьо-сірий
  '#7A8C5B', // приглушений оливковий
  '#8C5B7A', // приглушена слива
  '#6E6E8C', // приглушений індиго
  '#8C7A5B', // приглушена вохра
] as const;

export function pickCoverFallbackColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const index = hash % FALLBACK_PALETTE.length;
  return FALLBACK_PALETTE[index] ?? FALLBACK_PALETTE[0];
}
