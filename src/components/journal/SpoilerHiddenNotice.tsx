import React from 'react';
import { Pressable, View, TextStyle } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/design/ThemeProvider';

interface SpoilerHiddenNoticeProps {
  /** Скільки записів приховано режимом «без спойлерів» на ЦІЙ поверхні прямо зараз. `<= 0` —
   * компонент нічого не рендерить (той самий "тихий no-op", що й порожній масив нижче нього). */
  hiddenCount: number;
  style?: TextStyle;
  /**
   * Опційний ручний reveal (POLYTSIA V1.6.2, #166 — "де це виправдано UX поверхні": книжкові
   * екрани одного твору, де користувач свідомо повертається до вже прочитаного/пережитого, а не
   * змішана стрічка кількох книг одразу, де "показати" для одного пункту серед чужих не має
   * сенсу). Коли не передано — компонент лише інформаційний напис, без жодної Pressable, так само
   * як усталений патерн `JournalSection`/`LoreSection` (`app/work/[workId].tsx`/`app/lore/
   * [workId].tsx`), який цей компонент узагальнює для решти поверхонь.
   */
  revealed?: boolean;
  onToggleReveal?: () => void;
}

/**
 * Єдиний "N приховано режимом «без спойлерів»" напис (POLYTSIA V1.6.2, #166 — завершення UX
 * Фази 3 V1.6.1: фільтрація на цих поверхнях уже працювала, самого індикатора не було).
 * Копія тексту й `AppText variant="caption" color="tertiary"` — навмисно ідентичні вже
 * усталеному патерну на Book Details/Lore (`docs/SPOILER_SAFE.md` §UI), без множини/іменника
 * після числа (той самий "Ще N приховано", а не "N записів приховано") — щоб не заводити другий,
 * трохи інший варіант копії для тієї самої фічі на різних екранах.
 */
export function SpoilerHiddenNotice({ hiddenCount, style, revealed = false, onToggleReveal }: SpoilerHiddenNoticeProps) {
  const theme = useTheme();
  if (hiddenCount <= 0) return null;

  const text = revealed
    ? 'Показано попри режим «без спойлерів».'
    : `Ще ${hiddenCount} приховано режимом «без спойлерів».`;

  if (!onToggleReveal) {
    return (
      <AppText variant="caption" color="tertiary" style={style}>
        {text}
      </AppText>
    );
  }

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <AppText variant="caption" color="tertiary" style={style}>
        {text}
      </AppText>
      <Pressable
        onPress={onToggleReveal}
        accessibilityRole="button"
        accessibilityState={{ expanded: revealed }}
        accessibilityLabel={revealed ? 'Сховати знову' : 'Показати приховане, щоб не забігати наперед'}
        style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}
      >
        <AppText variant="caption" color="accent">
          {revealed ? 'Сховати знову' : 'Показати'}
        </AppText>
      </Pressable>
    </View>
  );
}
