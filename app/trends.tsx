import React from 'react';
import { View, Pressable } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { useTheme } from '@/design/ThemeProvider';
import { useTrendingBooks, type TrendingBook } from '@/features/trends/useTrendingBooks';
import { useImportDraftStore } from '@/stores/importDraftStore';
import { pickCoverFallbackColor } from '@/lib/coverFallback';

function TrendingBookRow({ item }: { item: TrendingBook }) {
  const theme = useTheme();
  const { book } = item;
  return (
    <Pressable
      onPress={() => {
        // Та сама пара "джерело + сирі дані", що й у звичайному пошуку (`app/(tabs)/search.tsx`)
        // — книга з «Трендів» завжди прийшла зі спільного каталогу, тож той самий provider id
        // (`shared_catalog`) і той самий екран підтвердження перед фактичним збереженням.
        useImportDraftStore.getState().setPending('shared_catalog', book);
        router.push('/import/review');
      }}
      accessibilityRole="button"
      accessibilityLabel={`${item.rank}. ${book.title}`}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View style={{ width: 28, alignItems: 'center' }}>
          <AppText variant="heading" color={item.rank <= 3 ? 'accent' : 'tertiary'}>
            {item.rank}
          </AppText>
        </View>
        <CoverThumbnail
          coverUrl={book.coverUrl}
          title={book.title}
          fallbackColor={pickCoverFallbackColor(book.title)}
          width={44}
          height={64}
        />
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <AppText variant="body">{book.title}</AppText>
          {book.authors.length > 0 ? (
            <AppText variant="caption" color="secondary">
              {book.authors.join(', ')}
            </AppText>
          ) : null}
          <AppText variant="micro" color="accent">
            Додали собі: {item.addedCount}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </Card>
    </Pressable>
  );
}

/**
 * «Тренди» (Milestone 11, доповнення, пряме прохання власника продукту): топ-10 книг за
 * кількістю користувачів, що зберегли їх собі в бібліотеку (`useTrendingBooks.ts`). Пуш-екран
 * зі списком — той самий візуальний патерн, що й «Що почитати завтра?» (`app/tomorrow.tsx`):
 * тап на рядок веде на той самий екран підтвердження перед збереженням, що й звичайний пошук.
 */
export default function TrendsScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch } = useTrendingBooks();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Тренди',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <View style={{ gap: theme.spacing.lg }}>
          <AppText variant="body" color="secondary">
            Топ книг, які користувачі найчастіше додають собі в бібліотеку.
          </AppText>

          {isError ? (
            <QueryErrorState onRetry={() => refetch()} />
          ) : isLoading ? (
            <AppText variant="body" color="secondary">
              Завантаження…
            </AppText>
          ) : data && data.length > 0 ? (
            <View style={{ gap: theme.spacing.sm }}>
              {data.map((item) => (
                <TrendingBookRow key={item.book.externalId} item={item} />
              ))}
            </View>
          ) : (
            <EmptyState
              title="Поки що порожньо"
              description="Тренди з'являться, щойно користувачі почнуть додавати книги собі в бібліотеку."
            />
          )}
        </View>
      </ScreenContainer>
    </>
  );
}
