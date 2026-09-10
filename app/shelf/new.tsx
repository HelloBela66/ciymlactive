import React, { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Stack, router } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { LabeledInput } from '@/components/ui/LabeledInput';
import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { ShelfThemeCard } from '@/components/library/ShelfThemeCard';
import { useTheme } from '@/design/ThemeProvider';
import { useCreateShelf } from '@/features/library/useShelves';
import { SHELF_THEME_ORDER, DEFAULT_SHELF_THEME } from '@/design/shelfThemes';
import { shelfThemeLabels } from '@/design/i18n-labels';
import type { ShelfThemeId } from '@/types/shelf';

/** Створення нової полиці (Milestone 2) — назва + опційний опис + (доповнення8, зображення —
 * доповнення13) оформлення.
 * Тема обирається ЛИШЕ тут, при створенні — пряме рішення власника продукту: змінити оформлення
 * вже створеної полиці поки не можна (спростило перший прохід — без нового екрана редагування
 * теми/додаткової мутації; можлива майбутня фіча, якщо знадобиться). */
export default function NewShelfScreen() {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const createShelf = useCreateShelf();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [themeId, setThemeId] = useState<ShelfThemeId>(DEFAULT_SHELF_THEME);
  const [error, setError] = useState<string | undefined>(undefined);

  // 2 колонки, ширина від реальної ширини вікна (той самий підхід, що й `cardWidth` у
  // `ShelfCard`, Milestone 11 доповнення6 — не стала цифра, підібрана під один орієнтир).
  const gridGap = theme.spacing.sm;
  const availableWidth = windowWidth - theme.spacing.lg * 2;
  const optionWidth = Math.floor((availableWidth - gridGap) / 2);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError('Назва обов’язкова');
      return;
    }
    setError(undefined);
    await createShelf.mutateAsync({
      name: trimmed,
      description: description.trim() || null,
      theme: themeId,
    });
    router.back();
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Нова полиця',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <View style={{ gap: theme.spacing.lg }}>
          <LabeledInput label="Назва" required value={name} onChangeText={setName} error={error} />
          <LabeledInput label="Опис" value={description} onChangeText={setDescription} />

          <View style={{ gap: theme.spacing.sm }}>
            <AppText variant="heading">Оформлення</AppText>
            <AppText variant="caption" color="secondary">
              Обери вигляд полиці — можна лишити класичний або підібрати під сезон чи жанр книг,
              які на ній збереш.
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: gridGap }}>
              {SHELF_THEME_ORDER.map((id) => (
                <ShelfThemeCard
                  key={id}
                  themeId={id}
                  title={shelfThemeLabels[id]}
                  selected={id === themeId}
                  width={optionWidth}
                  onPress={() => setThemeId(id)}
                  accessibilityLabel={shelfThemeLabels[id]}
                />
              ))}
            </View>
          </View>

          {createShelf.isError ? (
            <AppText variant="caption" color="danger">
              Не вдалося створити полицю. Спробуй ще раз.
            </AppText>
          ) : null}
          <Button
            label={createShelf.isPending ? 'Створюю…' : 'Створити полицю'}
            onPress={handleSubmit}
            disabled={createShelf.isPending}
          />
        </View>
      </ScreenContainer>
    </>
  );
}
