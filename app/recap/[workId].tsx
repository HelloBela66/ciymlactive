import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { useTheme } from '@/design/ThemeProvider';
import { useBookDetails } from '@/features/book-details/useBookDetails';
import { useReadingHistory } from '@/features/reading-session/useReadingHistory';
import { useJournalEntries } from '@/features/journal/useJournal';
import { useAllNoteCategories } from '@/features/notes/useNoteCategories';
import { resolveEntryTypeLabel, categoriesToMap } from '@/lib/journalEntryLabel';
import { computeProgressPercent } from '@/lib/progressPercent';
import { formatDuration } from '@/lib/sessionTiming';
import type { JournalEntry } from '@/types/journalEntry';
import type { NoteCategory } from '@/types/noteCategory';

/** Найбільше рядків у кожній секції (сесії/записи) — той самий "не перевантажуй" дух, що й
 * `MAX_ENTRIES_PER_SECTION` на `app/recall/[workId].tsx`: recap підсумовує книгу, не замінює
 * повні "Історія читання"/щоденник (обидва вже є на Book Details). */
const MAX_ITEMS_PER_SECTION = 5;

/** Той самий вигляд рядка запису, що й `RecallEntryLine` (`app/recall/[workId].tsx`) —
 * навмисно продубльований локально, той самий house-патерн маленького презентаційного блоку
 * без спільного стану. */
function RecapEntryLine({
  entry,
  categoriesById,
}: {
  entry: JournalEntry;
  categoriesById: ReadonlyMap<string, NoteCategory>;
}) {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
        <AppText variant="micro" color="accent">
          {resolveEntryTypeLabel(entry, categoriesById)}
          {entry.page != null ? ` · с. ${entry.page}` : ''}
        </AppText>
        {entry.isFavorite ? <Ionicons name="heart" size={12} color={theme.colors.accent} /> : null}
      </View>
      <AppText variant="body" style={entry.kind === 'quote' ? { fontStyle: 'italic' } : undefined}>
        {entry.text}
      </AppText>
    </Card>
  );
}

/**
 * RECAP SCREEN (POLYTSIA V1.6, Фаза 8 ТЗ) — куди веде CTA «Згадати, де я зупинився» з картки
 * «Давно не читав» на Book Details (`app/work/[workId].tsx`, `StaleReadingSection`). ТЗ прямо
 * обмежує вміст: "Показуй ТІЛЬКИ дані користувача: current page; last sessions; latest journal
 * entries; latest favorite moment; characters/lore later if available. Не генеруй summary через
 * AI. Не використовуй external plot summaries. Це гарантує spoiler-safe experience." — тобто
 * жодного мережевого виклику, жодного AI-переказу сюжету, лише те, що користувач сам зберіг.
 *
 * "characters/lore later if available" — Фази 9-10 (LORE/CHARACTERS) цього циклу ще не
 * реалізовані, тож відповідної секції тут поки немає; додасться природно, коли з'явиться
 * джерело даних, без додаткової міграції цього екрана.
 */
export default function RecapScreen() {
  const theme = useTheme();
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const { data, isLoading, isError, refetch } = useBookDetails(workId);
  const userBookId = data?.userBook?.id;

  const { data: sessions } = useReadingHistory(userBookId);
  const { data: allEntries } = useJournalEntries(userBookId);
  const { data: categories } = useAllNoteCategories(userBookId);
  const categoriesById = categoriesToMap(categories);

  // `sessions`/`allEntries` уже відсортовані найновішими зверху (`ReadingSessionRepository.
  // listByUserBookId`/`JournalRepository.listByUserBookId`) — тут лише обрізання до
  // MAX_ITEMS_PER_SECTION, без додаткового сортування.
  const recentSessions = (sessions ?? []).slice(0, MAX_ITEMS_PER_SECTION);
  const recentEntries = (allEntries ?? []).slice(0, MAX_ITEMS_PER_SECTION);
  const latestFavorite = (allEntries ?? []).find((entry) => entry.isFavorite) ?? null;

  const pageCount = data?.primaryEdition?.pageCount ?? null;
  const currentPage = data?.userBook?.currentPage ?? null;
  const progressPercent = computeProgressPercent(currentPage, pageCount);

  const authorNames = data?.work.authors.map((a) => a.name).join(', ') ?? '';
  const hasAnyData = recentSessions.length > 0 || recentEntries.length > 0 || latestFavorite != null;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Згадати, де я зупинився',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        {isError ? (
          <QueryErrorState onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : !data.userBook ? (
          <AppText variant="body" color="secondary">
            Книгу не знайдено.
          </AppText>
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
              <CoverThumbnail
                coverUrl={data.primaryEdition?.coverUrl}
                title={data.work.title}
                fallbackColor={data.work.coverFallbackColor}
                width={96}
                height={140}
                borderRadius={theme.radius.md}
              />
              <AppText variant="title" style={{ textAlign: 'center' }}>
                {data.work.title}
              </AppText>
              {authorNames ? (
                <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                  {authorNames}
                </AppText>
              ) : null}
            </View>

            <Card style={{ gap: theme.spacing.xs }}>
              <AppText variant="caption" color="secondary">
                Зараз на сторінці
              </AppText>
              <AppText variant="heading">
                {currentPage ?? '—'}
                {pageCount != null ? ` з ${pageCount}` : ''}
              </AppText>
              {progressPercent != null ? (
                <AppText variant="caption" color="secondary">
                  {Math.round(progressPercent)}% книги
                </AppText>
              ) : null}
            </Card>

            {recentSessions.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="heading">Останні сесії</AppText>
                {recentSessions.map((session) => (
                  <Card key={session.id} style={{ gap: theme.spacing.xs }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <AppText variant="caption" color="tertiary">
                        {new Date(session.startedAt).toLocaleDateString('uk-UA')}
                      </AppText>
                      <AppText variant="caption" color="secondary">
                        {session.durationSeconds != null ? formatDuration(session.durationSeconds * 1000) : '—'}
                      </AppText>
                    </View>
                    <AppText variant="body">
                      Сторінки {session.startPage}
                      {session.endPage != null ? ` → ${session.endPage}` : ''}
                    </AppText>
                  </Card>
                ))}
              </View>
            ) : null}

            {recentEntries.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="heading">Останні записи</AppText>
                {recentEntries.map((entry) => (
                  <RecapEntryLine key={entry.id} entry={entry} categoriesById={categoriesById} />
                ))}
              </View>
            ) : null}

            {latestFavorite ? (
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="heading">Улюблений момент</AppText>
                <Card style={{ gap: theme.spacing.xs, backgroundColor: theme.colors.accentSoft }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                    <Ionicons name="heart" size={14} color={theme.colors.accent} />
                    <AppText variant="caption" color="accent">
                      {resolveEntryTypeLabel(latestFavorite, categoriesById)}
                      {latestFavorite.page != null ? ` · с. ${latestFavorite.page}` : ''}
                    </AppText>
                  </View>
                  <AppText variant="body" style={latestFavorite.kind === 'quote' ? { fontStyle: 'italic' } : undefined}>
                    {latestFavorite.text}
                  </AppText>
                </Card>
              </View>
            ) : null}

            {!hasAnyData ? (
              <AppText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                Тут з&apos;являться останні сесії й записи, щойно вони будуть.
              </AppText>
            ) : null}
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
