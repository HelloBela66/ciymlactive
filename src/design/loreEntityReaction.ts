import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * «Реакція» на персонажа (POLYTSIA V1.6, Фаза 9 ТЗ: "reaction to character") — той самий
 * "фіксований, необов'язковий вибір без довільного тексту" підхід, що й `REACTION_META`
 * (`src/design/reactions.ts`) для записів щоденника, лише інший набір значень: там — настрій
 * МОМЕНТУ, тут — ставлення до ДІЙОВОЇ ОСОБИ книги.
 *
 * Стосується лише `LoreEntity.type === 'character'` (Фаза 9 UI-обмеження, схема це не
 * форсує) — для інших типів (Фаза 10: місце/термін/організація) поле лишається `null`, чіпи
 * реакції на їхніх екранах просто не показуються.
 *
 * Значення (ключі) стабільні рядки, не enum-індекси — та сама причина, що й `ReactionId`/
 * `ReadingExperienceId`: колонка `lore_entity.reaction` лишається plain TEXT без CHECK
 * (`015_lore_entity.ts`), список тут можна розширити пізніше без нової міграції.
 */
export type LoreEntityReactionId = 'like' | 'distrust' | 'funny' | 'important' | 'dislike' | 'other';

export interface LoreEntityReactionMeta {
  icon: IconName;
  label: string;
}

export const LORE_ENTITY_REACTION_META: Record<LoreEntityReactionId, LoreEntityReactionMeta> = {
  like: { icon: 'heart-outline', label: 'Подобається' },
  distrust: { icon: 'eye-outline', label: 'Не довіряю' },
  funny: { icon: 'happy-outline', label: 'Смішний' },
  important: { icon: 'star-outline', label: 'Важливий' },
  dislike: { icon: 'thumbs-down-outline', label: 'Не подобається' },
  other: { icon: 'ellipsis-horizontal-outline', label: 'Інше' },
};

/** Порядок показу в рядку вибору чипів. */
export const LORE_ENTITY_REACTION_ORDER: LoreEntityReactionId[] = [
  'like',
  'distrust',
  'funny',
  'important',
  'dislike',
  'other',
];

/** `reaction` — вільний `TEXT` без CHECK у БД (докладніше вище) — той самий захисний патерн,
 * що й `isReactionId`/`isReadingExperienceId`: нерозпізнане значення тихо трактується як "без
 * реакції", а не крашить екран. */
export function isLoreEntityReactionId(value: string): value is LoreEntityReactionId {
  return (LORE_ENTITY_REACTION_ORDER as string[]).includes(value);
}
