import React, { useMemo } from 'react';
import { View, Pressable } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { parse, format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { ReadingDayBookCard } from '@/components/calendar/ReadingDayBookCard';
import { useTheme } from '@/design/ThemeProvider';
import { activityEventTypeLabels, journalEntryTypeLabels } from '@/design/i18n-labels';
import { EVENT_ICON, eventDetail } from '@/design/activityEventDisplay';
import { useDaySessions, type DayRunEvent } from '@/features/calendar/useCalendarSessions';
import { formatCompactDuration } from '@/lib/calendarFormat';
import { pluralizeUk } from '@/lib/pluralizeUk';
import { formatDuration } from '@/lib/sessionTiming';
import type { ActivityEvent } from '@/types/activityEvent';
import type { JournalFeedEntry } from '@/types/journalEntry';

const BOOK_FORMS = ['книга', 'книги', 'книг'] as const;
const PAGE_FORMS = ['сторінка', 'сторінки', 'сторінок'] as const;
const ENTRY_FORMS = ['запис', 'записи', 'записів'] as const;

/**
 * ДЕТАЛІ ДНЯ — "ДЕНЬ ЧИТАННЯ" (POLYTSIA V1.6.1, Фаза 19 → ВІЗУАЛЬНА КОМПОЗИЦІЯ ТА REDESIGN
 * ДНЯ ЧИТАННЯ, пост-Фаза 19, `docs/CALENDAR_2_0.md` §"Visual Day Composition"). Структура:
 * hero (компактний підсумок) → книги дня (primary першою, `ReadingDayBookCard`) → сесії
 * читання (з позначкою перечитування) → "Початок і завершення" (таймлайн з `ReadingRun`, НЕ з
 * `ActivityHistoryRepository`'s `book_started`/`book_finished` — докладніше коментар над
 * `ReadingRunRepository.listStartedOrFinishedBetween`) → "Збережено цього дня" (щоденник,
 * spoiler-safe, макс. 3, секція повністю відсутня, коли порожня) → "Інша активність" (оцінка/
 * полиця/додавання книги — рештки восьми типів подій ТЗ, що не мають власної секції вище).
 *
 * Лишається окремим route-екраном, не модальним sheet — те саме обґрунтування, що й до цієї
 * фази (докладніше коментар нижче над функцією-компонентом і `docs/CALENDAR_2_0.md`
 * §"Чому лишився route, не sheet") — ця фаза змінює ЗМІСТ і композицію, не навігаційну
 * оболонку, якої ніхто явно не просив міняти.
 */
export default function DayDetailsScreen() {
  const theme = useTheme();
  const { date } = useLocalSearchParams<{ date: string }>();
  const parsedDate = useMemo(() => (date ? parse(date, 'yyyy-MM-dd', new Date()) : undefined), [date]);
  const { data, isLoading, isError, refetch } = useDaySessions(parsedDate);

  const title = parsedDate ? format(parsedDate, 'd MMMM yyyy', { locale: uk }) : 'День';

  const books = data?.books ?? [];
  const sessions = data?.sessions ?? [];
  const timelineEvents = data?.timelineEvents ?? [];
  const journalItems = data?.journalItems ?? [];
  const hiddenJournalCount = data?.hiddenJournalCount ?? 0;
  const otherEvents = data?.otherEvents ?? [];

  const isEmpty =
    books.length === 0 &&
    timelineEvents.length === 0 &&
    journalItems.length === 0 &&
    hiddenJournalCount === 0 &&
    otherEvents.length === 0;

  // Залежність саме на `data` (не на похідних масивах вище — `data?.books ?? []` тощо створює
  // НОВИЙ масив-референс на кожен рендер навіть коли `data` не змінився, через `?? []`
  // фолбек), щоб цей `useMemo` реально мемоізував (react-hooks/exhaustive-deps).
  const hero = useMemo(() => {
    const dayBooks = data?.books ?? [];
    if (dayBooks.length === 0) return null;
    const totalMinutes = dayBooks.reduce((sum, b) => sum + b.totalMinutes, 0);
    const totalPages = dayBooks.reduce((sum, b) => sum + b.totalPages, 0);
    return { booksCount: dayBooks.length, totalMinutes, totalPages };
  }, [data]);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title,
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        {isError ? (
          <QueryErrorState onRetry={() => refetch()} />
        ) : isLoading ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : isEmpty ? (
          <EmptyState
            title="Цього дня не було активності"
            description="Тут з'являться сесії читання, нові книги, записи щоденника та інша активність того дня."
          />
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            {hero ? (
              <Card style={{ gap: theme.spacing.xs }}>
                <AppText variant="heading">Підсумок дня</AppText>
                <AppText variant="body" color="secondary">
                  {hero.booksCount} {pluralizeUk(hero.booksCount, BOOK_FORMS)}
                  {' · '}
                  {formatCompactDuration(hero.totalMinutes)}
                  {' · '}
                  {hero.totalPages} {pluralizeUk(hero.totalPages, PAGE_FORMS)}
                </AppText>
              </Card>
            ) : null}

            {books.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="heading">Книги цього дня</AppText>
                {books.map((book, index) => (
                  <ReadingDayBookCard
                    key={book.userBook.id}
                    userBook={book.userBook}
                    totalMinutes={book.totalMinutes}
                    totalPages={book.totalPages}
                    sessionCount={book.sessionCount}
                    isPrimary={index === 0}
                  />
                ))}
              </View>
            ) : null}

            {sessions.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="heading">Сесії читання</AppText>
                {sessions.map(({ session, userBook }) => {
                  const runNumber = data?.runNumberBySessionId.get(session.id);
                  return (
                    <Pressable
                      key={session.id}
                      onPress={() => router.push({ pathname: '/work/[workId]', params: { workId: userBook.work.id } })}
                      accessibilityRole="button"
                      accessibilityLabel={
                        runNumber
                          ? `${userBook.work.title}, перечитування, прочитання №${runNumber}`
                          : userBook.work.title
                      }
                    >
                      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                        <CoverThumbnail
                          coverUrl={userBook.edition.coverUrl}
                          title={userBook.work.title}
                          fallbackColor={userBook.work.coverFallbackColor}
                          width={40}
                          height={58}
                        />
                        <View style={{ flex: 1, gap: 2 }}>
                          <AppText variant="body">{userBook.work.title}</AppText>
                          <AppText variant="caption" color="secondary">
                            {session.durationSeconds != null ? formatDuration(session.durationSeconds * 1000) : '—'}
                            {' · '}
                            {session.startPage}
                            {session.endPage != null ? ` → ${session.endPage}` : ''}
                          </AppText>
                          {runNumber ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                              <Ionicons name="repeat" size={12} color={theme.colors.accent} />
                              <AppText variant="micro" color="accent">
                                Перечитування · прочитання №{runNumber}
                              </AppText>
                            </View>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                      </Card>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {timelineEvents.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="heading">Початок і завершення</AppText>
                {timelineEvents.map((event, index) => (
                  <RunTimelineRow key={`${event.type}-${event.userBook.id}-${index}`} event={event} />
                ))}
              </View>
            ) : null}

            {journalItems.length > 0 || hiddenJournalCount > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="heading">Збережено цього дня</AppText>
                {journalItems.map((entry) => (
                  <JournalPreviewRow key={`${entry.kind}-${entry.id}`} entry={entry} />
                ))}
                {hiddenJournalCount > 0 ? (
                  <AppText variant="caption" color="tertiary">
                    Ще {hiddenJournalCount} {pluralizeUk(hiddenJournalCount, ENTRY_FORMS)} приховано режимом «без
                    спойлерів».
                  </AppText>
                ) : null}
              </View>
            ) : null}

            {otherEvents.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="heading">Інша активність</AppText>
                {otherEvents.map((event) => (
                  <DayEventRow key={event.id} event={event} />
                ))}
              </View>
            ) : null}
          </View>
        )}
      </ScreenContainer>
    </>
  );
}

/** "Почав читати"/"Завершив" — джерело САМЕ `ReadingRun` (`docs/CALENDAR_2_0.md`
 * §"Visual Day Composition"), не `ActivityEvent`, тому власний, простіший рядок, не
 * перевикористання `DayEventRow` нижче (той очікує саме `ActivityEvent`, у якого немає
 * "type: started/finished" — лише вбудовані вісім типів UNION ALL). */
function RunTimelineRow({ event }: { event: DayRunEvent }) {
  const theme = useTheme();
  const isFinished = event.type === 'finished';
  const label = isFinished ? 'Завершив' : 'Почав читати';

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/work/[workId]', params: { workId: event.userBook.work.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${event.userBook.work.title}`}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <CoverThumbnail
          coverUrl={event.userBook.edition.coverUrl}
          title={event.userBook.work.title}
          fallbackColor={event.userBook.work.coverFallbackColor}
          width={40}
          height={58}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name={isFinished ? 'flag' : 'play'} size={13} color={theme.colors.accent} />
            <AppText variant="caption" color="accent">
              {label}
            </AppText>
          </View>
          <AppText variant="body" numberOfLines={1}>
            {event.userBook.work.title}
          </AppText>
        </View>
      </Card>
    </Pressable>
  );
}

/** "Збережено цього дня" — рядок запису щоденника (нотатка/цитата), уже spoiler-safe
 * відфільтрований на рівні `JournalRepository.listFeedPage`. `typeLabel` — той самий "власна
 * категорія, коли є, інакше вбудований тип" принцип, що й `app/journal/index.tsx`'s
 * `feedEntryLabel`/`app/(tabs)/search.tsx`'s `entryTypeLabel` (`categoryLabel` уже резолвлена
 * прямо в SQL — без додаткового запиту). */
function JournalPreviewRow({ entry }: { entry: JournalFeedEntry }) {
  const theme = useTheme();
  const typeLabel = entry.categoryId && entry.categoryLabel ? entry.categoryLabel : journalEntryTypeLabels[entry.type];

  return (
    <Card style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {entry.isFavorite ? <Ionicons name="star" size={12} color={theme.colors.warning} /> : null}
        <AppText variant="caption" color="accent">
          {typeLabel}
        </AppText>
      </View>
      <AppText variant="body" numberOfLines={2}>
        {entry.text}
      </AppText>
      <AppText variant="micro" color="tertiary" numberOfLines={1}>
        {entry.workTitle}
      </AppText>
    </Card>
  );
}

/** Рядок "решти типів подій" дня (оцінка, додавання книги, полиця — `book_started`/
 * `book_finished`/`journal_entry`/`quote`/`session_completed` тепер мають власні, змістовніші
 * секції вище, і виключені з цього списку на рівні хука) — той самий `EVENT_ICON`/`eventDetail`,
 * що й `app/history.tsx`'s `ActivityEventRow` (`src/design/activityEventDisplay.ts`), лише без
 * CoverThumbnail (сесії/книги вище вже несуть обкладинку — тут переважно короткі текстові
 * події). */
function DayEventRow({ event }: { event: ActivityEvent }) {
  const theme = useTheme();
  const detail = eventDetail(event);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/work/[workId]', params: { workId: event.workId } })}
      accessibilityRole="button"
      accessibilityLabel={`${activityEventTypeLabels[event.type]}: ${event.workTitle}`}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <Ionicons name={EVENT_ICON[event.type]} size={16} color={theme.colors.accent} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText variant="caption" color="accent">
              {activityEventTypeLabels[event.type]}
            </AppText>
          </View>
          <AppText variant="body" numberOfLines={1}>
            {event.workTitle}
          </AppText>
          {detail ? (
            <AppText variant="caption" color="secondary" numberOfLines={2}>
              {detail}
            </AppText>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}
