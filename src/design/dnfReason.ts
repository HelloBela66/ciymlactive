/**
 * DNF IMPROVEMENT (POLYTSIA V1.6, Фаза 12) — фіксований список причин "Не дочитав", рівно ті
 * сім і в тому порядку, що дає ТЗ. Той самий "тип + мета + guard в одному design-файлі" підхід,
 * що й `loreEntityReaction.ts` (не `loreEntityType.ts` — тут, як і з реакцією, немає окремого
 * доменного сенсу поза UI-вибором, лише позначка для нотатки).
 */
export type DnfReasonId =
  | 'not_mood'
  | 'boring'
  | 'style'
  | 'too_complex'
  | 'wrong_genre'
  | 'later'
  | 'other';

export const DNF_REASON_META: Record<DnfReasonId, { label: string }> = {
  not_mood: { label: 'Не мій настрій' },
  boring: { label: 'Нудно' },
  style: { label: 'Не сподобався стиль' },
  too_complex: { label: 'Занадто складно' },
  wrong_genre: { label: 'Не мій жанр' },
  later: { label: 'Повернуся пізніше' },
  other: { label: 'Інше' },
};

export const DNF_REASON_ORDER: DnfReasonId[] = [
  'not_mood',
  'boring',
  'style',
  'too_complex',
  'wrong_genre',
  'later',
  'other',
];

export function isDnfReasonId(value: string): value is DnfReasonId {
  return (DNF_REASON_ORDER as string[]).includes(value);
}
