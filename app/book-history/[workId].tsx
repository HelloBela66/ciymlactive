import React from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { BookHero } from '@/components/ui/BookHero';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { useTheme } from '@/design/ThemeProvider';
import { useBookDetails } from '@/features/book-details/useBookDetails';
import { useBookRelationshipTimeline } from '@/features/book-history/useBookRelationshipTimeline';
import { formatCompactDuration } from '@/lib/calendarFormat';
import { pluralizeUk } from '@/lib/pluralizeUk';
import { formatReturnGap } from '@/lib/readingMilestoneCopy';
import type {
  BookTimelineChapter,
  BookTimelineEvent,
  TimelineSessionsSummary,
} from '@/lib/bookRelationshipTimeline';

/**
 * «Моя історія з цією книгою» — POLYTSIA V1.7, Phase 2 (`docs/V1_7_READING_LIFE.md`,
 * ТЗ V1.7 §5-§10).
 *
 * ОКРЕМИЙ екран, а не ще одна секція Book Details (ТЗ §5: «Не перевантажуй основний Book
 * Details»). `app/work/[workId].tsx` уже найбільший екран застосунку; додавати туди
 * багаторічну хронологію означало б зробити його ще важчим для найчастішого сценарію —
 * «глянути, що це за книга».
 *
 * ЩО ТУТ ПОКАЗУЄТЬСЯ — читацька пам'ять, не лог (ТЗ §7). Кожен прохід — окрема глава
 * (ТЗ §8): «Перше читання», «Перечитування». Усередині глави сесії згорнуті в один відрізок
 * («4–17 квітня · 8 сеансів · 6 год 42 хв»), а окремими подіями виходять лише ті записи
 * журналу, які користувач сам позначив як обрані чи «повернутися пізніше».
 *
 * Уся збірка — чистий `buildBookRelationshipTimeline` (`src/lib/bookRelationshipTimeline.ts`),
 * покритий власними тестами; тут лише розкладка. Дані — `useBookRelationshipTimeline`, який
 * надбудовується над уже закешованим `useReadingRunsDetail`, а не робить другий запит на
 * прохід.
 */

const SESSION_FORMS = ['сеанс', 'сеанси', 'сеансів'] as const;
const PAGE_FORMS = ['сторінка', 'сторінки', 'сторінок'] as const;
const DAY_FORMS = ['день', 'дні', 'днів'] as const;
const ENTRY_FORMS = ['запис', 'записи', 'записів'] as const;

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

function formatDayWithYear(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatYear(iso: string): string {
  return String(new Date(iso).getFullYear());
}

/** «4–17 квітня» або «4 квітня», якщо все відбулось одного дня. */
function formatSpan(summary: TimelineSessionsSummary): string {
  const from = new Date(summary.firstStartedAt);
  const to = new Date(summary.lastStartedAt);
  if (from.toDateString() === to.toDateString()) return formatDay(summary.firstStartedAt);
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return `${from.getDate()}–${formatDay(summary.lastStartedAt)}`;
  }
  return `${formatDay(summary.firstStartedAt)} – ${formatDay(summary.lastStartedAt)}`;
}

function chapterTitle(chapter: BookTimelineChapter): string {
  if (chapter.runNumber == null) return 'Раніше';
  if (chapter.runNumber === 1) return 'Перше читання';
  if (chapter.runNumber === 2) return 'Перечитування';
  return `${chapter.runNumber}-те читання`;
}

function EventRow({ event }: { event: BookTimelineEvent }) {
  const theme = useTheme();

  const label = (() => {
    switch (event.kind) {
      case 'book_added':
        return 'Додав до бібліотеки';
      case 'run_started':
        return 'Почав читати';
      case 'run_finished':
        return 'Завершив';
      case 'run_dnf':
        return 'Відклав';
      case 'rating':
        return `Оцінив — ${event.value}`;
      case 'memory':
        return 'Зберіг спогад';
      case 'capsule':
        return 'Створив капсулу';
      case 'journal':
        return event.entry.page != null ? `Збережена думка · стор. ${event.entry.page}` : 'Збережена думка';
      case 'sessions':
        return null;
    }
  })();

  if (event.kind === 'sessions') {
    const s = event.summary;
    const parts = [
      `${s.sessionCount} ${pluralizeUk(s.sessionCount, SESSION_FORMS)}`,
      formatCompactDuration(s.minutes),
    ];
    if (s.pages > 0) parts.push(`${s.pages} ${pluralizeUk(s.pages, PAGE_FORMS)}`);

    return (
      <View style={{ gap: 2 }}>
        <AppText variant="body" style={{ fontWeight: '600' }}>
          {formatSpan(s)}
        </AppText>
        <AppText variant="caption" color="secondary">
          {parts.join(' · ')}
        </AppText>
        {s.daysSpent > 1 ? (
          <AppText variant="caption" color="tertiary">
            {s.daysSpent} {pluralizeUk(s.daysSpent, DAY_FORMS)} із книгою
          </AppText>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <AppText variant="body" style={{ flex: 1 }}>
          {label}
        </AppText>
        <AppText variant="caption" color="tertiary">
          {formatDay(event.at)}
        </AppText>
      </View>
      {event.kind === 'journal' ? (
        <AppText variant="caption" color="secondary" numberOfLines={3}>
          {event.entry.text}
        </AppText>
      ) : null}
    </View>
  );
}

function ChapterCard({ chapter }: { chapter: BookTimelineChapter }) {
  const theme = useTheme();
  const quietJournalCount = chapter.journalCount - chapter.meaningfulJournalCount;

  // ТЗ V1.7 §8 (Phase 8) — «повернувся до цієї книги через 2 роки 4 місяці». Подія стосунків
  // САМЕ з цією книгою, не глобальна віха: тому вона тут, у хронології книги, і ніде більше.
  // Проміжок менший за місяць не показується — «через 3 дні» це не повернення через роки.
  const returnGap =
    chapter.previousRunFinishedAt && chapter.startedAt
      ? formatReturnGap(chapter.previousRunFinishedAt, chapter.startedAt)
      : null;

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="heading">{chapterTitle(chapter)}</AppText>
        {chapter.startedAt ? (
          <AppText variant="caption" color="tertiary">
            {formatYear(chapter.startedAt)}
          </AppText>
        ) : null}
      </View>

      {returnGap ? (
        <AppText variant="caption" color="secondary">
          Повернувся до книги {returnGap}
        </AppText>
      ) : null}

      <View style={{ gap: theme.spacing.sm }}>
        {chapter.events.map((event, index) => (
          <EventRow key={`${event.kind}-${event.at}-${index}`} event={event} />
        ))}
      </View>

      {/* Решта записів не зникає — вона просто не роздуває хронологію (ТЗ §7). */}
      {quietJournalCount > 0 ? (
        <AppText variant="caption" color="tertiary">
          Ще {quietJournalCount} {pluralizeUk(quietJournalCount, ENTRY_FORMS)} у щоденнику
        </AppText>
      ) : null}
    </Card>
  );
}

export default function BookHistoryScreen() {
  const theme = useTheme();
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const bookDetails = useBookDetails(workId);
  const userBookId = bookDetails.data?.userBook?.id;
  const { timeline, userBook, isLoading, isError, refetch } = useBookRelationshipTimeline(userBookId);

  const loading = bookDetails.isLoading || (userBookId != null && isLoading);
  const errored = bookDetails.isError || isError;

  return (
    <ScreenContainer scroll>
      {/* `headerShown: true` — обов'язкове: кореневий `Stack` (`app/_layout.tsx`) виставляє
          `headerShown: false` для ВСІХ маршрутів, тож самої лише `title` замало — екран лишався
          б без шапки й без кнопки «назад» (той самий набір опцій, що й `app/statistics.tsx`/
          `app/wrapped/[year].tsx`/`app/reread-comparison/[workId].tsx`). */}
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Моя історія з книгою',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />

      {errored ? (
        <QueryErrorState
          onRetry={() => {
            void bookDetails.refetch();
            refetch();
          }}
        />
      ) : loading ? (
        <AppText variant="body" color="secondary">
          Завантаження…
        </AppText>
      ) : !timeline || !userBook ? (
        <EmptyState
          title="Історії ще немає"
          description="Ця книга ще не у твоїй бібліотеці — історія почнеться з першого читання."
        />
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          <BookHero
            title={userBook.work.title}
            authors={userBook.work.authors.map((a) => a.name).join(', ')}
            coverUrl={userBook.edition.coverUrl}
            coverFallbackColor={userBook.work.coverFallbackColor}
          >
            {timeline.prelude.map((event) => (
              <AppText key={event.kind} variant="caption" color="tertiary">
                Додав до бібліотеки {formatDayWithYear(event.at)}
              </AppText>
            ))}
          </BookHero>

          {timeline.chapters.length === 0 ? (
            <EmptyState
              title="Читання ще не починалось"
              description="Щойно ти почнеш читати, тут з'явиться перша глава твоєї історії з цією книгою."
            />
          ) : (
            timeline.chapters.map((chapter) => (
              <ChapterCard key={chapter.runId ?? 'no-run'} chapter={chapter} />
            ))
          )}
        </View>
      )}
    </ScreenContainer>
  );
}
