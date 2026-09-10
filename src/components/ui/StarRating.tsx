import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design/ThemeProvider';

interface StarRatingProps {
  value: number | null;
  onChange: (value: number) => void;
}

/**
 * П'ять зірок, крок 0.5 (докладніше — src/types/rating.ts, той самий CHECK, що й у SQLite).
 * Тап на зірку ставить її як цілу; повторний тап на вже повну зірку перемикає на половину —
 * простий жест без потреби розпізнавати ліву/праву половину іконки на дотик.
 */
export function StarRating({ value, onChange }: StarRatingProps) {
  const theme = useTheme();
  const current = value ?? 0;

  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
      {[1, 2, 3, 4, 5].map((position) => {
        const iconName = current >= position ? 'star' : current >= position - 0.5 ? 'star-half' : 'star-outline';
        return (
          <Pressable
            key={position}
            onPress={() => onChange(current === position ? position - 0.5 : position)}
            accessibilityRole="button"
            accessibilityLabel={`Оцінка ${position} з 5`}
            style={{
              width: theme.minTouchTarget,
              height: theme.minTouchTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={iconName} size={26} color={theme.colors.warning} />
          </Pressable>
        );
      })}
    </View>
  );
}
