import React from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { BookHero } from '@/components/ui/BookHero';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { useTheme } from '@/design/ThemeProvider';
import { useBookDetails } from '@/features/book-details/useBookDetails';
import {
  useReadingRunsDetail,
  selectComparableRuns,
  type ReadingRunDetail,
} from '@/features/reading-runs/useReadingRunsDetail';
import { computeNumericDelta } from '@/lib/rereadComparison';
import { formatDuration } from '@/lib/sessionTiming';
import { READING_EXPERIENCE_LABELS } from '@/design/readingExperience';
import { useBookRelationshipTimeline } from '@/features/book-history/useBookRelationshipTimeline';
import { pluralizeUk } from '@/lib/pluralizeUk';
import type { BookTimelineChapter, TimelineJournalInput } from '@/lib/bookRelationshipTimeline';

const ENTRY_FORMS = ['запис', 'записи', 'записів'] as const;

/**
 * «Як змінилася книга для тебе» — REREADING MODEL, Фаза 12 ТЗ (`docs/READING_RUN.md`
 * §"Фаза 12"). Порівняння ≥2 ЗАВЕРШЕНИХ (`finished`) прочитань однієї книги: оцінка,
 * спогад, нотатка "До", капсула, і скільки часу/днів пішло на кожне прочитання —
 * ВИКЛЮЧНО дані, які користувач уже сам зберіг раніше. Жодної AI-генерації (ТЗ прямо
 * каже: "на основі user data, без AI-генерації").
 *
 * Дані — `useReadingRunsDetail` (той самий хук, спільний кеш, що й "Історія прочитань" на
 * Book Details, `ReadingRunsHistorySection` у `app/work/[workId].tsx`), відфільтровані
 * `selectComparableRuns` до лише `status === 'finished'`. Точка входу сюди
 * (`ReadingRunsHistorySection`) уже сама гейтить кнопку переходу на ≥2 такі run, але цей
 * екран усе одно перевіряє САМ (пряма навігація за URL, стан міг змінитись) — показує
 * пояснювальний текст замість порожнього/зламаного екрана, якщо порівнювати нема чого.
 *
 * Прочитання йдуть у ХРОНОЛОГІЧНОМУ порядку (найстаріше перше — `run_number ASC`, той самий
 * порядок, що й `ReadingRunRepository.listByUserBookId`); між кожною сусідньою парою — картка
 * "Δ" з різницею оцінки й часу читання (`computeNumericDelta`, `src/lib/rereadComparison.ts`).
 */

function RunCard({
  detail,
  index,
  chapter,
}: {
  detail: ReadingRunDetail;
  index: number;
  /** Глава хронології цього ж проходу (POLYTSIA V1.7, Phase 3) — звідки береться кількість
   * записів щоденника. `undefined`, поки хронологія ще вантажиться. */
  chapter?: BookTimelineChapter;
}) {
  const theme = useTheme();
  const { run, rating, memory, beforeAfter, capsule, stats } = detail;

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="heading">Прочитання №{index + 1}</AppText>
        <AppText variant="caption" color="tertiary">
          {new Date(run.startedAt).toLocaleDateString('uk-UA')}
          {run.finishedAt ? ` → ${new Date(run.finishedAt).toLocaleDateString('uk-UA')}` : ''}
        </AppText>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.lg }}>
        <View style={{ gap: 2 }}>
          <AppText variant="caption" color="secondary">
            Оцінка
          </AppText>
          <AppText variant="body" style={{ fontWeight: '600' }}>
            {rating?.value != null ? rating.value : '—'}
          </AppText>
        </View>
        <View style={{ gap: 2 }}>
          <AppText variant="caption" color="secondary">
            Днів читання
          </AppText>
          <AppText variant="body" style={{ fontWeight: '600' }}>
            {stats.daysSpent || '—'}
          </AppText>
        </View>
        <View style={{ gap: 2 }}>
          <AppText variant="caption" color="secondary">
            Час читання
          </AppText>
          <AppText variant="body" style={{ fontWeight: '600' }}>
            {stats.totalDurationSeconds > 0 ? formatDuration(stats.totalDurationSeconds * 1000) : '—'}
          </AppText>
        </View>
        {/* POLYTSIA V1.7, Phase 3 (ТЗ V1.7 §9) — «Нотатки» в таблиці порівняння. Рахунок
            приходить із хронології книги (Phase 2), а не з окремого запиту: `note`/`quote` не
            мають `reading_run_id` у схемі, тож прив'язка запису до проходу живе в одному місці
            (`bookRelationshipTimeline.ts`), а не дублюється тут власною копією тієї ж логіки. */}
        <View style={{ gap: 2 }}>
          <AppText variant="caption" color="secondary">
            Нотатки
          </AppText>
          <AppText variant="body" style={{ fontWeight: '600' }}>
            {chapter ? chapter.journalCount || '—' : '—'}
          </AppText>
        </View>
      </View>

      {stats.dominantExperience ? (
        <AppText variant="caption" color="secondary">
          Здебільшого читалося: {READING_EXPERIENCE_LABELS[stats.dominantExperience]}
        </AppText>
      ) : null}

      {beforeAfter?.expectedRating != null ? (
        <AppText variant="caption" color="secondary">
          Очікував(-ла) оцінку {beforeAfter.expectedRating}
          {rating?.value != null ? ` · насправді ${rating.value}` : ''}
        </AppText>
      ) : null}

      {rating?.review ? (
        <AppText variant="body" color="secondary" style={{ fontStyle: 'italic' }}>
          «{rating.review}»
        </AppText>
      ) : null}

      {capsule?.oneSentenceMemory ? (
        <View style={{ gap: 2 }}>
          <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
            Одним реченням
          </AppText>
          <AppText variant="body">{capsule.oneSentenceMemory}</AppText>
        </View>
      ) : null}

      {capsule?.lastingThought ? (
        <View style={{ gap: 2 }}>
          <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
            Що залишилося
          </AppText>
          <AppText variant="body">{capsule.lastingThought}</AppText>
        </View>
      ) : null}

      {memory?.reflection ? (
        <View style={{ gap: 2 }}>
          <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
            Спогад
          </AppText>
          <AppText variant="body">{memory.reflection}</AppText>
        </View>
      ) : null}

      {!rating && !beforeAfter && !capsule && !memory ? (
        <AppText variant="caption" color="tertiary">
          Для цього прочитання ще не збережено жодної нотатки — лише дати й час читання.
        </AppText>
      ) : null}
    </Card>
  );
}

/** "Δ" між двома сусідніми прочитаннями — лише оцінка й час читання (єдині два числові виміри,
 * решта — вільний текст, який не має сенсу "віднімати"). Показується, тільки коли хоч одне
 * значення відоме в обох run, інакше просто не рендериться (`computeNumericDelta` повертає
 * `diff: null`, коли нема з чим порівнювати). */
function DeltaCard({ from, to }: { from: ReadingRunDetail; to: ReadingRunDetail }) {
  const theme = useTheme();
  const ratingDelta = computeNumericDelta(from.rating?.value ?? null, to.rating?.value ?? null);
  const durationDelta = computeNumericDelta(
    from.stats.totalDurationSeconds > 0 ? from.stats.totalDurationSeconds : null,
    to.stats.totalDurationSeconds > 0 ? to.stats.totalDurationSeconds : null,
  );

  if (ratingDelta.diff == null && durationDelta.diff == null) return null;

  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
      <AppText variant="caption" color="accent">
        Зміна
      </AppText>
      {ratingDelta.diff != null ? (
        <AppText variant="body" color="secondary">
          Оцінка {ratingDelta.diff > 0 ? '+' : ''}
          {ratingDelta.diff}
        </AppText>
      ) : null}
      {durationDelta.diff != null ? (
        <AppText variant="body" color="secondary">
          Час читання {durationDelta.diff > 0 ? '+' : '-'}
          {formatDuration(Math.abs(durationDelta.diff) * 1000)}
        </AppText>
      ) : null}
    </View>
  );
}

/**
 * «Що ти думав тоді» / «Що ти думаєш тепер» — POLYTSIA V1.7, Phase 3 (ТЗ V1.7 §10).
 *
 * Показуються РЕАЛЬНІ записи користувача з двох прочитань поруч — жодної AI-інтерпретації
 * (ТЗ §10 і §103 прямо це забороняють). Беруться лише ті записи, які людина сама позначила як
 * обрані чи «повернутися пізніше» — той самий критерій «значущості», що й у хронології книги
 * (Phase 2): показувати всі підряд означало б перетворити порівняння на дві стрічки щоденника.
 *
 * ОБМЕЖЕННЯ, ЯКЕ ВАРТО ЗНАТИ: `note`/`quote` не мають `reading_run_id` у схемі (колонки проходу
 * отримали лише memory/capsule/rating/DNF/before-after, міграції 021-025). Прив'язка запису до
 * прочитання двоступенева: точна через сесію, інакше — за часом у межах вікна проходу
 * (`bookRelationshipTimeline.ts`). Тому ТЗ §10 і формулює цю фічу умовно — «якщо Journal entries
 * run-aware». Секція просто не рендериться, коли в обох прочитаннях нема позначених записів.
 */
function ThoughtEvolution({ from, to }: { from: BookTimelineChapter; to: BookTimelineChapter }) {
  const theme = useTheme();

  const entriesOf = (chapter: BookTimelineChapter): TimelineJournalInput[] =>
    chapter.events.flatMap((event) => (event.kind === 'journal' ? [event.entry] : []));

  const thenEntries = entriesOf(from);
  const nowEntries = entriesOf(to);
  if (thenEntries.length === 0 && nowEntries.length === 0) return null;

  const column = (title: string, entries: TimelineJournalInput[]) => (
    <View style={{ flex: 1, gap: theme.spacing.xs }}>
      <AppText variant="caption" color="secondary" style={{ fontWeight: '600' }}>
        {title}
      </AppText>
      {entries.length === 0 ? (
        <AppText variant="caption" color="tertiary">
          Позначених записів немає
        </AppText>
      ) : (
        entries.slice(0, 3).map((entry) => (
          <AppText key={entry.id} variant="caption" numberOfLines={4}>
            «{entry.text}»
          </AppText>
        ))
      )}
      {entries.length > 3 ? (
        <AppText variant="caption" color="tertiary">
          Ще {entries.length - 3} {pluralizeUk(entries.length - 3, ENTRY_FORMS)}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <AppText variant="heading">Що ти думав тоді — і що думаєш тепер</AppText>
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        {column('Тоді', thenEntries)}
        {column('Тепер', nowEntries)}
      </View>
    </Card>
  );
}

export default function RereadComparisonScreen() {
  const theme = useTheme();
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const { data, isLoading, isError, refetch } = useBookDetails(workId);
  const userBookId = data?.userBook?.id;
  const { data: readingRuns, isLoading: isRunsLoading } = useReadingRunsDetail(userBookId);
  // POLYTSIA V1.7, Phase 3 — хронологія книги дає кількість записів щоденника на кожен прохід
  // (ТЗ §9) і самі позначені записи для «Тоді/Тепер» (ТЗ §10). Додаткового запиту на прохід це
  // не коштує: `useBookRelationshipTimeline` усередині використовує ТОЙ САМИЙ
  // `useReadingRunsDetail` з тим самим ключем кешу, що вже викликаний вище.
  const { timeline } = useBookRelationshipTimeline(userBookId);

  const comparableRuns = readingRuns ? selectComparableRuns(readingRuns) : [];
  const authorNames = data?.work.authors.map((a) => a.name).join(', ') ?? '';

  const chapterByRunId = new Map((timeline?.chapters ?? []).map((chapter) => [chapter.runId, chapter]));
  const firstComparable = comparableRuns[0];
  const lastComparable = comparableRuns[comparableRuns.length - 1];
  const firstChapter = firstComparable ? chapterByRunId.get(firstComparable.run.id) : undefined;
  const lastChapter = lastComparable ? chapterByRunId.get(lastComparable.run.id) : undefined;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Як змінилася книга для тебе',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        {isError ? (
          <QueryErrorState onRetry={() => refetch()} />
        ) : isLoading || !data || isRunsLoading ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : comparableRuns.length < 2 ? (
          <AppText variant="body" color="secondary">
            Порівняння з&apos;являється, коли книгу прочитано (до кінця) щонайменше двічі.
          </AppText>
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <BookHero
              title={data.work.title}
              authors={authorNames}
              coverUrl={data.primaryEdition?.coverUrl}
              coverFallbackColor={data.work.coverFallbackColor}
            />

            {comparableRuns.map((detail, index) => (
              <React.Fragment key={detail.run.id}>
                {index > 0 ? <DeltaCard from={comparableRuns[index - 1]!} to={detail} /> : null}
                <RunCard detail={detail} index={index} chapter={chapterByRunId.get(detail.run.id)} />
              </React.Fragment>
            ))}

            {/* Порівняння думок — між ПЕРШИМ і ОСТАННІМ порівнюваними прочитаннями: саме ця
                пара відповідає на питання «як змінилося моє сприйняття», а не сусідні проходи
                (для трьох і більше прочитань сусідня пара показала б лише останній крок). */}
            {firstChapter && lastChapter && firstChapter.runId !== lastChapter.runId ? (
              <ThoughtEvolution from={firstChapter} to={lastChapter} />
            ) : null}
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
