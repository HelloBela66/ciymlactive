import React, { useMemo, useState } from 'react';
import { View, TextInput } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BookHero } from '@/components/ui/BookHero';
import { MemorySection } from '@/components/ui/MemorySection';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { useTheme } from '@/design/ThemeProvider';
import { useBookDetails } from '@/features/book-details/useBookDetails';
import { useRating } from '@/features/book-details/useRating';
import { useJournalEntries } from '@/features/journal/useJournal';
import { useAllNoteCategories } from '@/features/notes/useNoteCategories';
import { useBookCapsule, useMarkCapsuleOpened } from '@/features/memory/useBookCapsule';
import { useCreateCapsuleRecall } from '@/features/memory/useCapsuleRecall';
import { formatTimeSinceFinished, normalizeRecallText } from '@/lib/recall';
import { resolveEntryTypeLabel, categoriesToMap } from '@/lib/journalEntryLabel';
import type { JournalEntry } from '@/types/journalEntry';
import type { NoteCategory } from '@/types/noteCategory';

/** Скільки записів кожної категорії reveal-кроку показувати щонайбільше (п. "Не перевантажуй",
 * той самий дух мінімалізму, що й "premium minimal UI" п.20 ТЗ Фази 4) — recall-екран
 * підсумовує книгу, не замінює повний щоденник (`app/memory/[workId].tsx` уже показує все). */
const MAX_ENTRIES_PER_SECTION = 5;

/** Один рядок запису щоденника у reveal-кроці — той самий вигляд, що й `RevisitLaterEntryLine`
 * на `app/memory/[workId].tsx`, навмисно продубльований локально (той самий house-патерн:
 * маленький презентаційний блок без спільного стану). */
function RecallEntryLine({
  entry,
  categoriesById,
}: {
  entry: JournalEntry;
  categoriesById: ReadonlyMap<string, NoteCategory>;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="micro" color="accent">
        {resolveEntryTypeLabel(entry, categoriesById)}
        {entry.page != null ? ` · с. ${entry.page}` : ''}
      </AppText>
      <AppText
        variant="caption"
        color="secondary"
        style={entry.kind === 'quote' ? { fontStyle: 'italic' } : undefined}
      >
        {entry.text}
      </AppText>
      <View style={{ height: theme.spacing.xs }} />
    </View>
  );
}

/**
 * «Книга через час» — Recall screen (POLYTSIA V1.6, Фаза 5 ТЗ). Один прокручуваний екран,
 * два кроки БЕЗ навігації між ними (просто заміна вмісту нижньої частини після відповіді,
 * той самий "мінімум тертя" принцип, що й `app/capsule/[workId]/edit.tsx`):
 *
 * 1. Завжди видно: обкладинка, «Ти прочитав цю книгу N місяців тому», оцінка тоді.
 * 2. До відповіді: лише поле «Що ти пам'ятаєш зараз?» (optional) + кнопка — жодних старих
 *    відповідей ще не видно (явна вимога Фази 5 ТЗ: "Не показуй старі відповіді ДО того, як
 *    користувач optionally введе current memory").
 * 3. Після натискання "Продовжити" (з текстом чи без — поле optional): усе, що збережено —
 *    капсула, улюблені моменти, цитати, думки.
 *
 * Вимагає вже існуючу капсулу (recall — "На основі Capsule + Memory", без капсули згадувати
 * нема чого; точки входу вже самі показують «Згадати книгу» лише коли капсула є).
 */
export default function RecallScreen() {
  const theme = useTheme();
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const { data, isLoading, isError, refetch } = useBookDetails(workId);
  const userBookId = data?.userBook?.id;

  const { data: capsule, isLoading: isCapsuleLoading } = useBookCapsule(userBookId);
  const { data: rating } = useRating(userBookId);
  const { data: allEntries } = useJournalEntries(userBookId);
  const { data: categories } = useAllNoteCategories(userBookId);
  const categoriesById = categoriesToMap(categories);

  const saveRecall = useCreateCapsuleRecall();
  const markOpened = useMarkCapsuleOpened();

  const [memoryText, setMemoryText] = useState('');
  const [revealed, setRevealed] = useState(false);

  const linkedEntry = useMemo(() => {
    if (!capsule?.journalEntryId || !allEntries) return null;
    return allEntries.find((entry) => entry.id === capsule.journalEntryId) ?? null;
  }, [capsule, allEntries]);

  // Улюблене — окрема секція; цитати/думки — те, що лишилось, без дублю в двох секціях одразу
  // (той самий "кожен запис рівно в одній секції" вибір, що явно спрощує reveal-крок).
  const favoriteMoments = useMemo(
    () => (allEntries ?? []).filter((entry) => entry.isFavorite).slice(0, MAX_ENTRIES_PER_SECTION),
    [allEntries],
  );
  const remainingEntries = useMemo(() => (allEntries ?? []).filter((entry) => !entry.isFavorite), [allEntries]);
  const quotes = useMemo(
    () => remainingEntries.filter((entry) => entry.kind === 'quote').slice(0, MAX_ENTRIES_PER_SECTION),
    [remainingEntries],
  );
  const thoughts = useMemo(
    () => remainingEntries.filter((entry) => entry.kind === 'note').slice(0, MAX_ENTRIES_PER_SECTION),
    [remainingEntries],
  );

  const finishedAtIso = capsule?.completedAt ?? data?.userBook?.finishedAt ?? null;
  const trimmedMemoryText = normalizeRecallText(memoryText);

  const handleContinue = () => {
    if (!capsule || saveRecall.isPending) return;
    saveRecall.mutate(
      { bookCapsuleId: capsule.id, currentMemoryText: memoryText },
      {
        onSuccess: () => {
          if (capsule.openedAt == null && userBookId) {
            markOpened.mutate({ id: capsule.id, userBookId });
          }
          setRevealed(true);
        },
      },
    );
  };

  const authorNames = data?.work.authors.map((a) => a.name).join(', ') ?? '';

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Згадати книгу',
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
              {finishedAtIso ? (
                <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                  Ти прочитав цю книгу {formatTimeSinceFinished(finishedAtIso, new Date())}.
                </AppText>
              ) : null}
              {rating?.value != null ? (
                <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                  Тоді ти оцінив її на {rating.value}.
                </AppText>
              ) : null}
            </BookHero>

            {!revealed ? (
              <Card style={{ gap: theme.spacing.sm }}>
                <AppText variant="heading">Що ти пам&apos;ятаєш зараз?</AppText>
                <TextInput
                  placeholder="Необов'язково…"
                  placeholderTextColor={theme.colors.textTertiary}
                  value={memoryText}
                  onChangeText={setMemoryText}
                  multiline
                  maxLength={2000}
                  accessibilityLabel="Що ти пам'ятаєш зараз?"
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderRadius: theme.radius.md,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    paddingHorizontal: theme.spacing.md,
                    minHeight: 96,
                    paddingTop: theme.spacing.sm,
                    textAlignVertical: 'top',
                    color: theme.colors.textPrimary,
                    fontSize: theme.typography.scale.body.size,
                  }}
                />
                <Button
                  label={saveRecall.isPending ? 'Зберігаю…' : 'Продовжити'}
                  onPress={handleContinue}
                  disabled={saveRecall.isPending}
                />
              </Card>
            ) : (
              <View style={{ gap: theme.spacing.lg }}>
                {trimmedMemoryText ? (
                  <Card style={{ gap: theme.spacing.xs }}>
                    <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
                      Твоя згадка зараз
                    </AppText>
                    <AppText variant="body">{trimmedMemoryText}</AppText>
                  </Card>
                ) : null}

                {capsule.lastingThought ? (
                  <Card style={{ gap: theme.spacing.xs }}>
                    <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
                      Що залишилося з тобою
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
                      Момент, до якого хотів повернутися
                    </AppText>
                    <AppText variant="micro" color="accent">
                      {resolveEntryTypeLabel(linkedEntry, categoriesById)}
                      {linkedEntry.page != null ? ` · с. ${linkedEntry.page}` : ''}
                    </AppText>
                    <AppText
                      variant="body"
                      style={linkedEntry.kind === 'quote' ? { fontStyle: 'italic' } : undefined}
                    >
                      {linkedEntry.text}
                    </AppText>
                  </Card>
                ) : null}

                {favoriteMoments.length > 0 ? (
                  <MemorySection icon="heart" iconSize={16} title="Улюблені моменти">
                    {favoriteMoments.map((entry) => (
                      <RecallEntryLine key={entry.id} entry={entry} categoriesById={categoriesById} />
                    ))}
                  </MemorySection>
                ) : null}

                {quotes.length > 0 ? (
                  <MemorySection icon="chatbox-outline" iconSize={16} title="Цитати">
                    {quotes.map((entry) => (
                      <RecallEntryLine key={entry.id} entry={entry} categoriesById={categoriesById} />
                    ))}
                  </MemorySection>
                ) : null}

                {thoughts.length > 0 ? (
                  <MemorySection icon="create-outline" iconSize={16} title="Твої думки">
                    {thoughts.map((entry) => (
                      <RecallEntryLine key={entry.id} entry={entry} categoriesById={categoriesById} />
                    ))}
                  </MemorySection>
                ) : null}

                <Button
                  label="До деталей книги"
                  variant="secondary"
                  onPress={() => router.replace({ pathname: '/work/[workId]', params: { workId } })}
                />
              </View>
            )}
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
