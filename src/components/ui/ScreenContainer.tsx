import React from 'react';
import { ScrollView, View, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/design/ThemeProvider';

interface ScreenContainerProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  /**
   * Додає `insets.top` до верхнього відступу. УВІМКНИ ЛИШЕ для екранів БЕЗ нативного хедера
   * (`Stack.Screen options={{ headerShown: false }}` або таб без хедера,
   * `app/(tabs)/_layout.tsx`) — там нічого не резервує безпечну зону зверху, і заголовок
   * екрана інакше рендериться під статус-баром/notch (UI-фікс, Milestone 11: помітно на
   * Бібліотеці, той самий баг був і на Home/Пошуку/Профілі — трьох інших "голих" табах).
   * Для екранів З нативним хедером (більшість push-екранів застосунку) лишай `false`
   * (за замовчуванням) — хедер сам уже займає простір під статус-баром, і `insets.top` тут
   * додав би ЗАЙВИЙ подвійний відступ поверх нього.
   */
  topInset?: boolean;
}

/** Спільний контейнер екрана: колір фону теми + безпечні відступи, без дублювання по фічах. */
export function ScreenContainer({ children, scroll = true, style, topInset = false }: ScreenContainerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  if (scroll) {
    return (
      <ScrollView
        style={[styles.flex, { backgroundColor: theme.colors.bg }, style]}
        contentContainerStyle={{
          paddingTop: (topInset ? insets.top : 0) + theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xxl,
          paddingHorizontal: theme.spacing.lg,
        }}
      >
        {children}
      </ScrollView>
    );
  }

  // `scroll={false}` — використовується екранами, які самі рендерять `FlatList` (Бібліотека)
  // або власний нескролюваний макет (Календар); самі й відповідають за `insets.top`/
  // `insets.bottom` у своєму контентному контейнері (той самий патерн, що й тут, `topInset`
  // сюди не застосовується — немає єдиного контентного контейнера, який його міг би вжити).
  return <View style={[styles.flex, { backgroundColor: theme.colors.bg }, style]}>{children}</View>;
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
