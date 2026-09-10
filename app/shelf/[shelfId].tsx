import React, { useCallback, useMemo } from 'react';
import { View, Pressable, FlatList, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { ReadingProgressBar } from '@/components/ui/ReadingProgressBar';
import { useTheme } from '@/design/ThemeProvider';
import { userBookStatusLabels } from '@/design/i18n-labels';
import { useDeleteShelf, useShelfBooks, useShelves } from '@/features/library/useShelves';
import { computeProgressPercent } from '@/lib/progressPercent';
import type { UserBookWithDetails, UserBookStatus } from '@/types/userBook';

// Полиці навмисно не прив'язані до статусу читання (Milestone 2) — одна полиця може містити
// книги "хочу прочитати", "читаю" й "прочитано" впереміш, на відміну від табів Бібліотеки. Без
// візуальної позначки прочитаних користувач сам мусить пам'ятати, що з чого вже прочитано —
// саме на це поскаржився запит.
//
// "Перечитую" — свідомо ІНША позначка, ніж "Прочитано" (наступний запит користувача): це та
// сама книга, яку вже дочитували раз, але зараз вона знову активно читається, тож емблема на
// обкладинці — інший колір (`warning`, не `accent`) та інша іконка ("sync", не "checkmark"), а
// замість статичної плашки текстова колонка показує живий прогрес-бар (як для "reading") — щоб
// з першого погляду було видно "це не завершено, це знову в процесі", а не просто інший текст
// на тій самій зеленій плашці.
const FINISHED_BADGE_STATUSES: UserBookStatus[] = ['finished'];
const REREADING_BADGE_STATUSES: UserBookStatus[] = ['rereading'];
const PROGRESS_STATUSES: UserBookStatus[] = ['reading', 'rereading'];

/** `React.memo` (Milestone 8, продуктивність — той самий підхід, що й `BookRow` у
 * `app/(tabs)/library/index.tsx`). */
const ShelfBookRow = React.memo(function ShelfBookRow({ userBook }: { userBook: UserBookWithDetails }) {
  const theme = useTheme();
  const authorNames = useMemo(() => userBook.work.authors.map((a) => a.name).join(', '), [userBook.work.authors]);
  const handlePress = useCallback(() => {
    router.push({ pathname: '/work/[workId]', params: { workId: userBook.work.id } });
  }, [userBook.work.id]);

  const isFinished = FINISHED_BADGE_STATUSES.includes(userBook.status);
  const isRereading = REREADING_BADGE_STATUSES.includes(userBook.status);
  const percent = PROGRESS_STATUSES.includes(userBook.status)
    ? computeProgressPercent(userBook.currentPage, userBook.edition.pageCount)
    : null;

  const accessibilityLabel = isFinished
    ? `${userBook.work.title}, прочитано`
    : isRereading
      ? `${userBook.work.title}, перечитую`
      : userBook.work.title;

  return (
    <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View>
          <CoverThumbnail
            coverUrl={userBook.edition.coverUrl}
            title={userBook.work.title}
            fallbackColor={userBook.work.coverFallbackColor}
            width={40}
            height={58}
          />
          {isFinished || isRereading ? (
            // Емблема-"печатка" на розі обкладинки — той самий прийом (акцентне коло з
            // обведенням кольору картки), що й маркер на `ReadingProgressBar`, щоб читалось як
            // один візуальний "словник" застосунку, а не два різних стилі позначок. Колір і
            // іконка навмисно різні для "Прочитано" (accent/checkmark) та "Перечитую"
            // (warning/sync) — щоб різницю було видно навіть без прочитання підпису.
            <View
              style={{
                position: 'absolute',
                bottom: -4,
                right: -4,
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: isFinished ? theme.colors.accent : theme.colors.warning,
                borderWidth: 2,
                borderColor: theme.colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={isFinished ? 'checkmark' : 'sync'} size={12} color={theme.colors.onAccent} />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <AppText variant="body">{userBook.work.title}</AppText>
          {authorNames.length > 0 ? (
            <AppText variant="caption" color="secondary">
              {authorNames}
            </AppText>
          ) : null}
          {isFinished ? (
            // "Прочитано" лишається статичною плашкою — книга завершена, прогрес-бар тут
            // нічого нового не сказав би (завжди 100%).
            <View
              style={{
                alignSelf: 'flex-start',
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: 2,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.accentSoft,
              }}
            >
              <AppText variant="micro" color="accent">
                {userBookStatusLabels[userBook.status]}
              </AppText>
            </View>
          ) : percent != null ? (
            // "Перечитую" та "Читаю" — обидва живий прогрес-бар: саме він одразу передає "це
            // ще в процесі", на відміну від статичного тексту.
            <ReadingProgressBar percent={percent} height={4} />
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </Card>
    </Pressable>
  );
});

const ItemSeparator = () => {
  const theme = useTheme();
  return <View style={{ height: theme.spacing.sm }} />;
};

/**
 * Перегляд полиці — список книг на ній (Milestone 2). `FlatList` замість `ScrollView`+`.map()`
 * (Milestone 8, продуктивність — та сама зміна, що й у `app/(tabs)/library/index.tsx`, той
 * самий `ScreenContainer scroll={false}` + власні safe-area відступи на `FlatList`).
 */
export default function ShelfDetailsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { shelfId } = useLocalSearchParams<{ shelfId: string }>();
  const { data: shelves } = useShelves();
  const { data: books, isLoading, isError, refetch } = useShelfBooks(shelfId);
  const deleteShelf = useDeleteShelf();

  const shelf = shelves?.find((s) => s.id === shelfId);
  // Полиця видалена (наприклад, з іншого місця застосунку) чи посилання зіпсоване, а
  // `useShelves()` вже завантажився (Milestone 10 fix6, `docs/STATUS_V1.md` п. 3.8) —
  // без цього прапорця екран показував загальне "На цій полиці ще немає книг", що виглядає
  // так, ніби полиця існує, просто порожня, замість зрозумілого "полицю не знайдено". Умова
  // навмисно чекає, доки `shelves` завантажиться (`!== undefined`) — інакше "не знайдено"
  // спалахнуло б на мить при першому рендері екрана, ще до відповіді запиту.
  const shelfNotFound = shelves !== undefined && !shelf;

  const renderItem = useCallback(({ item }: { item: UserBookWithDetails }) => <ShelfBookRow userBook={item} />, []);
  const keyExtractor = useCallback((item: UserBookWithDetails) => item.id, []);

  /** Видалення полиці (Milestone 8.4) — книги на полиці нікуди не зникають, лишаються в
   * бібліотеці як і були, зникає лише сама полиця (докладніше — `ShelfRepository.remove`). */
  const handleDeleteShelf = () => {
    if (!shelfId) return;
    Alert.alert(
      'Видалити полицю?',
      shelf ? `Полиця «${shelf.name}» буде видалена. Книги на ній лишаться в бібліотеці.` : 'Книги на ній лишаться в бібліотеці.',
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Видалити',
          style: 'destructive',
          onPress: () => {
            deleteShelf.mutate({ id: shelfId }, { onSuccess: () => router.back() });
          },
        },
      ],
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: shelf?.name ?? 'Полиця',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
          headerRight: shelfNotFound
            ? undefined
            : () => (
                <Pressable
                  onPress={handleDeleteShelf}
                  accessibilityRole="button"
                  accessibilityLabel="Видалити полицю"
                  hitSlop={8}
                  style={{ padding: theme.spacing.xs }}
                >
                  <Ionicons name="trash-outline" size={20} color={theme.colors.textTertiary} />
                </Pressable>
              ),
        }}
      />
      <ScreenContainer scroll={false}>
        {shelfNotFound ? (
          <EmptyState
            title="Полицю не знайдено."
            description="Її вже видалено або посилання застаріле."
            actionLabel="До бібліотеки"
            onAction={() => router.replace('/library')}
          />
        ) : (
          <FlatList
            data={books ?? []}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            ItemSeparatorComponent={ItemSeparator}
            ListEmptyComponent={
              isError ? (
                <QueryErrorState onRetry={() => refetch()} />
              ) : isLoading ? null : (
                <EmptyState
                  title="На цій полиці ще немає книг."
                  description="Додай книгу на полицю з екрана Book Details."
                  actionLabel="До пошуку"
                  onAction={() => router.push('/search')}
                />
              )
            }
            contentContainerStyle={{
              paddingTop: theme.spacing.lg,
              paddingBottom: insets.bottom + theme.spacing.xxl,
              paddingHorizontal: theme.spacing.lg,
            }}
          />
        )}
      </ScreenContainer>
    </>
  );
}
