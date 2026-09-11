import React, { useCallback } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { useTheme } from '@/design/ThemeProvider';
import type { UserBookWithDetails } from '@/types/userBook';

const CAROUSEL_CARD_WIDTH = 92;
const CAROUSEL_COVER_HEIGHT = 134;

const CarouselCard = React.memo(function CarouselCard({ userBook }: { userBook: UserBookWithDetails }) {
  const theme = useTheme();
  const handlePress = useCallback(() => {
    router.push({ pathname: '/work/[workId]', params: { workId: userBook.work.id } });
  }, [userBook.work.id]);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={userBook.work.title}
      style={{ width: CAROUSEL_CARD_WIDTH }}
    >
      <CoverThumbnail
        coverUrl={userBook.edition.coverUrl}
        title={userBook.work.title}
        fallbackColor={userBook.work.coverFallbackColor}
        width={CAROUSEL_CARD_WIDTH}
        height={CAROUSEL_COVER_HEIGHT}
      />
      <AppText variant="caption" numberOfLines={2} style={{ marginTop: theme.spacing.xs }}>
        {userBook.work.title}
      </AppText>
    </Pressable>
  );
});

/**
 * POLYTSIA V1.6, Фаза 1 (Library UX, "розумні" стрічки) — горизонтальна стрічка книг під
 * конкретним, вужчим за статус-вкладку кутом зору (найдовше в очікуванні / нещодавно дочитані).
 * Рендериться лише на вкладці "Усі" (`app/(tabs)/library/index.tsx`) — на власній вкладці
 * статусу (наприклад, "Хочу прочитати") показувати ще й ту саму підбірку книг другим списком
 * над основним було б зайвим дублюванням, а не допомогою.
 *
 * Навмисно ЛИШЕ 2 стрічки, а не 4 з першого чорновика ТЗ: "Читаю зараз" і "Нещодавно додані"
 * тут не додані — вони й так вже становлять верхню частину самого списку "Усі"
 * (`sortAllLibraryView` у `useLibrary.ts`: активне читання зверху за свіжістю, решта — за датою
 * додавання), тож окрема стрічка з тим самим набором книг просто дублювала б те, що вже видно
 * на екрані секундою нижче (принцип ТЗ — обирати спрощення, коли нова функція нічого не додає
 * до вже наявного потоку).
 */
export function LibraryCarousel({ title, books }: { title: string; books: UserBookWithDetails[] }) {
  const theme = useTheme();
  if (books.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText variant="heading">{title}</AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.md, paddingRight: theme.spacing.xl }}
      >
        {books.map((userBook) => (
          <CarouselCard key={userBook.id} userBook={userBook} />
        ))}
      </ScrollView>
    </View>
  );
}
