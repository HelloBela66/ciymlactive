import React from 'react';
import { View, Pressable } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/design/ThemeProvider';
import {
  READING_EXPERIENCE_ORDER,
  READING_EXPERIENCE_LABELS,
  type ReadingExperienceId,
} from '@/design/readingExperience';

interface ReadingExperiencePickerProps {
  value: ReadingExperienceId | null;
  onChange: (value: ReadingExperienceId) => void;
}

/**
 * "Як читалося?" (ТЗ Фази 9 — SESSION REFLECTION) — рядок із 5 фіксованих текстових
 * "таблеток", без іконок (на відміну від `ReactionChips`, `src/design/reactions.ts`): тут
 * значення самі по собі короткі, зрозумілі слова, окрема іконка на кожне не додала б ясності,
 * лише зайвий візуальний шум для легкого, необов'язкового кроку.
 *
 * НЕ `ChipSelect` (`src/components/ui/ChipSelect.tsx`) — той вимагає завжди рівно ОДНЕ
 * непорожнє значення (`value: T`, немає "нічого не обрано"), що годиться для полів на кшталт
 * формату видання, але не для цього: тут немає "типового" вибору за замовчуванням, поле
 * повністю необов'язкове, і до першого тапу жодна таблетка не повинна виглядати вибраною.
 * Тому власний маленький компонент з `value: ReadingExperienceId | null`.
 *
 * На відміну від `ReactionChips` — повторний тап на вже вибрану таблетку тут НІЧОГО не знімає
 * (`onChange` тут одразу зберігає відповідь і закриває крок рефлексії, `SessionReflectionPanel`
 * в `app/session/[sessionId].tsx`) — нема сенсу в UI для "скасувати", коли сам тап уже завершує
 * взаємодію.
 */
export function ReadingExperiencePicker({ value, onChange }: ReadingExperiencePickerProps) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: theme.spacing.sm }}>
      {READING_EXPERIENCE_ORDER.map((id) => {
        const selected = value === id;
        return (
          <Pressable
            key={id}
            onPress={() => onChange(id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={READING_EXPERIENCE_LABELS[id]}
            style={{
              paddingHorizontal: theme.spacing.md,
              minHeight: theme.minTouchTarget,
              justifyContent: 'center',
              borderRadius: theme.radius.pill,
              backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
              borderWidth: 1,
              borderColor: selected ? theme.colors.accent : theme.colors.border,
            }}
          >
            <AppText variant="caption" color={selected ? 'onAccent' : 'secondary'}>
              {READING_EXPERIENCE_LABELS[id]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
