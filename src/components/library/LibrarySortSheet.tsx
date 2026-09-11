import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/design/ThemeProvider';
import type { LibrarySortOption } from '@/lib/libraryPreferenceStorage';

const SORT_OPTIONS: { value: LibrarySortOption; label: string }[] = [
  { value: 'default', label: 'За замовчуванням' },
  { value: 'updated', label: 'Спочатку оновлені' },
  { value: 'title', label: 'За назвою (А-Я)' },
  { value: 'author', label: 'За автором (А-Я)' },
];

/**
 * POLYTSIA V1.6, Фаза 1 (Library UX) — сортування бібліотеки, окреме нижнє вікно замість ще
 * одного постійного рядка керування над списком (принцип ТЗ: "коли нова функція конфліктує з
 * простотою основного потоку — обирай спрощення"; сортування потрібне нечасто, тож ховається за
 * одну кнопку, а не займає екран завжди). Звичайний RN `Modal` (`transparent`+`slide`), без
 * нової залежності на бібліотеку bottom-sheet — у застосунку її й досі ніде немає, а тут потреба
 * не складніша за список варіантів з одним вибором.
 */
export function LibrarySortSheet({
  visible,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: LibrarySortOption;
  onSelect: (sort: LibrarySortOption) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: theme.colors.overlay }}
        onPress={onClose}
        accessibilityLabel="Закрити"
        accessibilityRole="button"
      />
      <View
        style={{
          backgroundColor: theme.colors.surfaceRaised,
          borderTopLeftRadius: theme.radius.xl,
          borderTopRightRadius: theme.radius.xl,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.lg,
          gap: theme.spacing.xs,
        }}
      >
        <AppText variant="heading" style={{ marginBottom: theme.spacing.sm }}>
          Сортувати
        </AppText>
        {SORT_OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                onSelect(option.value);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                minHeight: theme.minTouchTarget,
                paddingVertical: theme.spacing.sm,
              }}
            >
              <AppText variant="body" color={selected ? 'accent' : 'primary'}>
                {option.label}
              </AppText>
              {selected ? <Ionicons name="checkmark" size={20} color={theme.colors.accent} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}
