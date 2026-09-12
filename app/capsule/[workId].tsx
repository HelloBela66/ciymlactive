import React, { useMemo } from 'react';
import { View, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BookHero } from '@/components/ui/BookHero';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { useTheme } from '@/design/ThemeProvider';
import { useBookDetails } from '@/features/book-details/useBookDetails';
import { useJournalEntries } from '@/features/journal/useJournal';
import { useBookCapsule, useRemoveBookCapsule } from '@/features/memory/useBookCapsule';
import { resolveEntryTypeLabel, categoriesToMap } from '@/lib/journalEntryLabel';
import { useAllNoteCategories } from '@/features/notes/useNoteCategories';

/** "11 вересня 2026" — той самий формат, що й дата завершення на `app/completion/[workId].tsx`,
 * лише завжди з роком (капсула переглядається, можливо, роки по тому — контекст поточного
 * року тут не такий очевидний, як для нещодавнього діапазону читання). */
function formatFullDate(iso: string): string {
  return format(parseISO(iso), 'd MMMM yyyy', { locale: uk });
}

/**
 * «Капсула книги» — View screen (POLYTSIA V1.6, Фаза 4, п.20 ТЗ). Приватний персональний
 * snapshot, не форма — секції, яких немає, просто не малюються (п.20: "Не показуй empty
 * sections"). `reopenAt` — запрошення повернутися, НЕ блокування (п.21): капсула завжди
 * доступна для перегляду незалежно від того, чи дата нагадування вже настала.
 *
 * НЕ позначає капсулу "відкритою" (`openedAt`) — це навмисно простий перегляд ВЛАСНИХ нотаток
 * (доступний з "Переглянути деталі" на `BookCapsuleSection`), відмінний від повноцінного
 * recall-досвіду «Згадати книгу» (`app/recall/[workId].tsx`, Фаза 5 ТЗ), який єдиний проставляє
 * `openedAt` — докладніше `docs/RECALL.md` §Відмінність від перегляду капсули.
 */
export default function BookCapsuleScreen() {
  const theme = useTheme();
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const { data, isLoading, isError, refetch } = useBookDetails(workId);
  const userBookId = data?.userBook?.id;

  const { data: capsule, isLoading: isCapsuleLoading } = useBookCapsule(userBookId);
  const { data: allEntries } = useJournalEntries(userBookId);
  const { data: categories } = useAllNoteCategories(userBookId);
  const categoriesById = categoriesToMap(categories);
  const removeCapsule = useRemoveBookCapsule();

  const linkedEntry = useMemo(() => {
    if (!capsule?.journalEntryId || !allEntries) return null;
    return allEntries.find((entry) => entry.id === capsule.journalEntryId) ?? null;
  }, [capsule, allEntries]);

  const handleEdit = () => {
    router.push({ pathname: '/capsule/[workId]/edit', params: { workId } } as unknown as Href);
  };

  const handleDelete = () => {
    if (!capsule || !userBookId) return;
    Alert.alert('Видалити капсулу?', 'Текст капсули буде видалено. Книга, щоденник та історія читання залишаться без змін.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: () =>
          removeCapsule.mutate(
            { id: capsule.id, userBookId },
            { onSuccess: () => router.back() },
          ),
      },
    ]);
  };

  const authorNames = data?.work.authors.map((a) => a.name).join(', ') ?? '';

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Капсула книги',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        {isError ? (
          <QueryErrorState onRetry={() => refetch()} />
        ) : isLoading || !data || isCapsuleLoading ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : !data.userBook || !capsule ? (
          <AppText variant="body" color="secondary">
            Капсулу цієї книги ще не створено.
          </AppText>
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <BookHero
              title={data.work.title}
              authors={authorNames}
              coverUrl={data.primaryEdition?.coverUrl}
              coverFallbackColor={data.work.coverFallbackColor}
            >
              <AppText variant="caption" color="tertiary">
                Створено {formatFullDate(capsule.createdAt)}
              </AppText>
            </BookHero>

            {capsule.lastingThought ? (
              <Card style={{ gap: theme.spacing.xs }}>
                <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
                  Що залишилося зі мною
                </AppText>
                <AppText variant="body" style={{ fontStyle: 'italic' }}>
                  «{capsule.lastingThought}»
                </AppText>
              </Card>
            ) : null}

            {capsule.oneSentenceMemory ? (
              <Card style={{ gap: theme.spacing.xs }}>
                <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
                  Одним реченням
                </AppText>
                <AppText variant="body">{capsule.oneSentenceMemory}</AppText>
              </Card>
            ) : null}

            {capsule.favoriteCharacterText ? (
              <Card style={{ gap: theme.spacing.xs }}>
                <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
                  Улюблений герой
                </AppText>
                <AppText variant="body">{capsule.favoriteCharacterText}</AppText>
              </Card>
            ) : null}

            {linkedEntry ? (
              <Card style={{ gap: theme.spacing.xs }}>
                <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
                  Момент, до якого хочу повернутися
                </AppText>
                <AppText variant="micro" color="accent">
                  {resolveEntryTypeLabel(linkedEntry, categoriesById)}
                  {linkedEntry.page != null ? ` · с. ${linkedEntry.page}` : ''}
                </AppText>
                <AppText variant="body" style={linkedEntry.kind === 'quote' ? { fontStyle: 'italic' } : undefined}>
                  {linkedEntry.text}
                </AppText>
              </Card>
            ) : null}

            {capsule.reopenAt ? (
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Ionicons name="calendar-outline" size={20} color={theme.colors.accent} />
                <AppText variant="body" color="secondary" style={{ flex: 1 }}>
                  Повернутися {formatFullDate(capsule.reopenAt)}
                </AppText>
              </Card>
            ) : null}

            <View style={{ gap: theme.spacing.sm }}>
              <Button label="Редагувати" variant="secondary" onPress={handleEdit} />
              <Button
                label={removeCapsule.isPending ? 'Видаляю…' : 'Видалити капсулу'}
                variant="ghost"
                onPress={handleDelete}
                disabled={removeCapsule.isPending}
              />
            </View>
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
