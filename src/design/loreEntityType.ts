import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { LoreEntityType } from '@/types/loreEntity';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * POLYTSIA V1.6, Фаза 10 (PERSONAL LORE) — UI-мета для чотирьох типів `lore_entity`
 * (`015_lore_entity.ts`, уже підтримані схемою від Фази 9). Той самий "іконка, не голий
 * emoji" підхід, що й `REACTION_META`/`LORE_ENTITY_REACTION_META` — тісніший контроль
 * розміру/кольору, узгоджений рендер на будь-якому пристрої.
 *
 * `LoreEntityType` (структурний тип, `src/types/loreEntity.ts`) навмисно НЕ тут — той самий
 * поділ, що й `NoteType`/`noteTypeLabels` (`src/design/i18n-labels.ts`): сам тип лишається
 * поруч зі схемою/доменними інтерфейсами, а UI-подання (іконка, підпис, порядок вибору) —
 * окремим шаром, який можна змінювати незалежно.
 */
export const LORE_ENTITY_TYPE_META: Record<LoreEntityType, { icon: IconName; label: string }> = {
  character: { icon: 'person-outline', label: 'Персонаж' },
  place: { icon: 'location-outline', label: 'Місце' },
  term: { icon: 'book-outline', label: 'Термін' },
  organization: { icon: 'business-outline', label: 'Організація' },
};

/** Порядок вибору типу при створенні — рівно той, що й у самому ТЗ Фази 10: "Персонаж, Місце,
 * Термін, Організація". */
export const LORE_ENTITY_TYPE_ORDER: LoreEntityType[] = ['character', 'place', 'term', 'organization'];
