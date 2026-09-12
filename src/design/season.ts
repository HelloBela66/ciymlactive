import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Чотири метеорологічні сезони (ТЗ Фази 13, READING SEASONS, `docs/READING_SEASONS.md`).
 * На відміну від `DnfReasonId`/`ReactionId` (`src/design/dnfReason.ts`/`reactions.ts`), ця
 * множина ніколи не розшириться — пір'я року завжди рівно чотири, — але той самий "design
 * token, не значення в SQL" підхід лишається доречним: сезон НІДЕ не зберігається в БД (уся
 * фіча — derived-only з уже наявних даних, той самий принцип, що й Wrapped), він лише
 * параметр запиту/роута (`src/lib/season.ts`), тож ця константа — суто UI-шар
 * (мітка/іконка/порядок), без жодного зв'язку зі схемою.
 */
export type SeasonId = 'winter' | 'spring' | 'summer' | 'autumn';

export interface SeasonMeta {
  label: string;
  icon: IconName;
}

export const SEASON_META: Record<SeasonId, SeasonMeta> = {
  winter: { label: 'Зима', icon: 'snow-outline' },
  spring: { label: 'Весна', icon: 'flower-outline' },
  summer: { label: 'Літо', icon: 'sunny-outline' },
  autumn: { label: 'Осінь', icon: 'leaf-outline' },
};

/** Календарний порядок пір року (з якого весна/літо/осінь рахують "свій" рік) — основа для
 * навігації "попередній/наступний сезон" (`src/lib/season.ts#adjacentSeasonKey`). */
export const SEASON_ORDER: SeasonId[] = ['winter', 'spring', 'summer', 'autumn'];

/** Той самий "не кидати, повертати false/null" guard-підхід, що й `isDnfReasonId`/
 * `isReactionId` — для нерозпізнаного значення з route param (`src/lib/season.ts#parseSeasonKey`
 * вже повертає `null` цілком, тут же — на випадок, якщо колись знадобиться перевірка окремо
 * від парсингу рядка). */
export function isSeasonId(value: string): value is SeasonId {
  return (SEASON_ORDER as string[]).includes(value);
}
