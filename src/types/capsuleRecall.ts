/**
 * POLYTSIA V1.6, Фаза 5 («Книга через час») — одна "спроба згадати" вже створену капсулу
 * (`docs/RECALL.md`). Не редагується й не видаляється окремо користувачем — лише росте як
 * історія recall-спроб, `013_capsule_recall.ts`.
 */
export interface CapsuleRecall {
  id: string;
  bookCapsuleId: string;
  /** «Що ти пам'ятаєш зараз?» (п.4 ТЗ Фази 5) — `null`, коли користувач лишив поле порожнім;
   * сам рядок все одно створюється (сам факт "спроби" важливий незалежно від тексту). */
  currentMemoryText: string | null;
  /** Момент цієї recall-спроби — той самий, що й `createdAt` (окреме поле лише для
   * симетрії з рештою домену, де "коли сталася подія" і "коли рядок створено" зазвичай
   * розрізняють, навіть якщо тут вони завжди збігаються). */
  recalledAt: string;
  createdAt: string;
}

export interface CreateCapsuleRecallInput {
  bookCapsuleId: string;
  currentMemoryText: string | null;
}
