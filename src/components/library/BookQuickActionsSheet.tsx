import React from 'react';
import { Alert, Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/AppText';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { useTheme } from '@/design/ThemeProvider';
import { userBookStatusLabels, type UserBookStatus } from '@/design/i18n-labels';
import { useToggleFavorite, useUpdateUserBookStatus, useRemoveFromLibrary } from '@/features/library/useUpdateUserBook';
import type { UserBookWithDetails } from '@/types/userBook';

const STATUS_OPTIONS = (Object.keys(userBookStatusLabels) as UserBookStatus[]).map((value) => ({
  value,
  label: userBookStatusLabels[value],
}));

/**
 * POLYTSIA V1.6, Фаза 1 (Library UX, long-press-дії) — швидкі дії над книгою без переходу на
 * Book Details: улюблене, зміна статусу, прибрати з бібліотеки. Викликається довгим тапом по
 * рядку/картці книги в Бібліотеці — навмисно НЕ окрема кнопка "…" на кожному рядку (та сама
 * логіка спрощення, що й у решті Фази 1: 6-7 книг на екрані з видимою кнопкою дій щоразу —
 * зайвий візуальний шум для дії, потрібної рідко; для тих, хто про long-press не здогадається,
 * лишається звичний шлях через Book Details).
 */
export function BookQuickActionsSheet({
  userBook,
  onClose,
}: {
  userBook: UserBookWithDetails | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toggleFavorite = useToggleFavorite();
  const updateStatus = useUpdateUserBookStatus();
  const removeFromLibrary = useRemoveFromLibrary();

  const visible = !!userBook;

  const handleRemove = () => {
    if (!userBook) return;
    Alert.alert(
      'Прибрати з бібліотеки?',
      `«${userBook.work.title}» зникне зі списку. Записи щоденника й нотатки про книгу не видаляються.`,
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Прибрати',
          style: 'destructive',
          onPress: () => {
            removeFromLibrary.mutate({ id: userBook.id });
            onClose();
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: theme.colors.overlay }}
        onPress={onClose}
        accessibilityLabel="Закрити"
        accessibilityRole="button"
      />
      {userBook ? (
        <View
          style={{
            backgroundColor: theme.colors.surfaceRaised,
            borderTopLeftRadius: theme.radius.xl,
            borderTopRightRadius: theme.radius.xl,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
            paddingBottom: insets.bottom + theme.spacing.lg,
            gap: theme.spacing.lg,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <CoverThumbnail
              coverUrl={userBook.edition.coverUrl}
              title={userBook.work.title}
              fallbackColor={userBook.work.coverFallbackColor}
              width={36}
              height={52}
            />
            <View style={{ flex: 1 }}>
              <AppText variant="body" numberOfLines={1}>
                {userBook.work.title}
              </AppText>
              {userBook.work.authors.length > 0 ? (
                <AppText variant="caption" color="secondary" numberOfLines={1}>
                  {userBook.work.authors.map((a) => a.name).join(', ')}
                </AppText>
              ) : null}
            </View>
          </View>

          <Pressable
            onPress={() => toggleFavorite.mutate({ id: userBook.id, isFavorite: !userBook.isFavorite })}
            accessibilityRole="button"
            accessibilityLabel={userBook.isFavorite ? 'Прибрати з улюблених' : 'Додати в улюблені'}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              minHeight: theme.minTouchTarget,
            }}
          >
            <Ionicons
              name={userBook.isFavorite ? 'heart' : 'heart-outline'}
              size={20}
              color={userBook.isFavorite ? theme.colors.danger : theme.colors.textSecondary}
            />
            <AppText variant="body">{userBook.isFavorite ? 'Прибрати з улюблених' : 'Додати в улюблені'}</AppText>
          </Pressable>

          <ChipSelect
            label="Статус"
            options={STATUS_OPTIONS}
            value={userBook.status}
            disabled={updateStatus.isPending}
            onChange={(status) => updateStatus.mutate({ id: userBook.id, status })}
          />

          <Pressable
            onPress={handleRemove}
            accessibilityRole="button"
            accessibilityLabel="Прибрати з бібліотеки"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              minHeight: theme.minTouchTarget,
            }}
          >
            <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
            <AppText variant="body" color="danger">
              Прибрати з бібліотеки
            </AppText>
          </Pressable>
        </View>
      ) : null}
    </Modal>
  );
}
