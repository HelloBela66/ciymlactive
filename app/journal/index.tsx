import React, { useCallback, useMemo, useState } from 'react';
import { View, Pressable, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { useTheme } from '@/design/ThemeProvider';
import { journalEntryTypeLabels } from '@/design/i18n-labels';
import { REACTION_ORDER, REACTION_META, REACTION_COUNT_FORMS } from '@/design/reactions';
import { ReactionToggle } from '@/components/journal/ReactionPicker';
import {
  useJournalFeed,
  useJournalGlobalCount,
  useJournalReactionCounts,
  useToggleJournalFavorite,
  useSetJournalReaction,
} from '@/features/journal/useJournal';
import { pluralizeUk } from '@/lib/pluralizeUk';
import type { JournalEntryType, JournalFeedEntry } from '@/types/journalEntry';

const ENTRY_FORMS = ['запис', 'записи', 'записів'] as const;

type TypeFilterValue = 'all' | JournalEntryType;

const TYPE_FILTER_OPTIONS: { value: TypeFilterValue; label: string }[] = [
  { value: 'all', label: 'Усі' },
  ...(Object.keys(journalEntryTypeLabels) as JournalEntryType[]).map((value) => ({
    value,
    label: journalEntryTypeLabels[value],
  })),
];

/** "Сьогодні"/"Учора"/дата — той самий підхід, що й скрізь у застосунку (`uk` з date-fns,
 * `app/day/[date].tsx`, `app/backup.tsx`), лише з двома короткими винятками для свіжих дат. */
function dateGroupLabel(iso: string): string {
  const date = parseISO(iso);
  if (isToday(date)) return 'Сьогодні';
  if (isYesterday(date)) return 'Учора';
  return format(date, 'd MMMM yyyy', { locale: uk });
}

type FeedRow =
  | { rowKind: 'header'; key: string; label: string }
  | { rowKind: 'entry'; key: string; entry: JournalFeedEntry };

/** Вставляє заголовок дати перед першим записом кожного нового дня — записи з `listFeedPage`
 * уже йдуть найновіші зверху, тож досить порівняти мітку з попереднім рядком, без
 * повторного сортування/групування в окрему структуру. */
function buildFeedRows(entries: JournalFeedEntry[]): FeedRow[] {
  const rows: FeedRow[] = [];
  let lastLabel: string | null = null;
  for (const entry of entries) {
    const label = dateGroupLabel(entry.createdAt);
    if (label !== lastLabel) {
      rows.push({ rowKind: 'header', key: `header-${label}-${entry.id}`, label });
      lastLabel = label;
    }
    rows.push({ rowKind: 'entry', key: entry.id, entry });
  }
  return rows;
}

/** Мітка типу/категорії для рядка глобальної стрічки (Milestone 11, доповнення — власні
 * категорії нотаток). На відміну від однокнижкових екранів (`resolveEntryTypeLabel`,
 * `src/lib/journalEntryLabel.ts`), тут назва власної категорії вже прийшла готовою прямо з
 * SQL (`JournalRepository.listFeedPage`'s `LEFT JOIN note_category` → `categoryLabel`) — стрічка
 * змішує записи багатьох книг одразу, резолвити на клієнті означало б підвантажувати
 * категорії кожної книги окремо (N+1). Фільтр типів (`TYPE_FILTER_OPTIONS` вище) навмисно
 * лишається лише вбудованими п'ятьма типами — фільтр за десятками персональних, унікальних
 * для кожної книги категорій одразу для ВСІХ книг був би непридатним UI, не звуженням. */
function feedEntryLabel(entry: JournalFeedEntry): string {
  if (entry.categoryId && entry.categoryLabel) return entry.categoryLabel;
  return journalEntryTypeLabels[entry.type];
}

const JournalEntryRow = React.memo(function JournalEntryRow({ entry }: { entry: JournalFeedEntry }) {
  const theme = useTheme();
  const toggleFavorite = useToggleJournalFavorite();
  const setReaction = useSetJournalReaction();

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/work/[workId]', params: { workId: entry.workId } })}
      accessibilityRole="button"
      accessibilityLabel={`${entry.workTitle}: ${feedEntryLabel(entry)}`}
    >
      <Card style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <CoverThumbnail
          coverUrl={entry.coverUrl}
          title={entry.workTitle}
          fallbackColor={entry.coverFallbackColor}
          width={36}
          height={52}
        />
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color="accent">
                {feedEntryLabel(entry)}
                {entry.page != null ? ` · с. ${entry.page}` : ''}
              </AppText>
              <AppText variant="caption" color="secondary" numberOfLines={1}>
                {entry.workTitle}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: -theme.spacing.sm, marginRight: -theme.spacing.sm }}>
              {/* Той самий порядок "реакція → обране", що й у `SessionJournalEntries`/
               * `JournalSection` (`app/session/[sessionId].tsx`, `app/work/[workId].tsx`) —
               * узгоджено між усіма трьома місцями показу записів щоденника. */}
              <ReactionToggle
                value={entry.reaction}
                onChange={(reaction) =>
                  setReaction.mutate({
                    id: entry.id,
                    kind: entry.kind,
                    userBookId: entry.userBookId,
                    reaction,
                    sessionId: entry.sessionId,
                  })
                }
              />
              <Pressable
                onPress={() =>
                  toggleFavorite.mutate({
                    id: entry.id,
                    kind: entry.kind,
                    userBookId: entry.userBookId,
                    isFavorite: !entry.isFavorite,
                    sessionId: entry.sessionId,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={entry.isFavorite ? 'Прибрати з обраного' : 'Додати в обране'}
                hitSlop={8}
                style={{
                  width: theme.minTouchTarget,
                  height: theme.minTouchTarget,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name={entry.isFavorite ? 'heart' : 'heart-outline'}
                  size={18}
                  color={entry.isFavorite ? theme.colors.danger : theme.colors.textTertiary}
                />
              </Pressable>
            </View>
          </View>
          <AppText variant="body" numberOfLines={3} style={entry.kind === 'quote' ? { fontStyle: 'italic' } : undefined}>
            {entry.text}
          </AppText>
        </View>
      </Card>
    </Pressable>
  );
});

/** Ряд "N смішних моментів..." (Milestone 11, доповнення — власник продукту прямо описав
 * цей вигляд: "8 улюблених моментів, 5 смішних, 3 сумних..."). Лише реакції, у яких є хоч
 * один запис (`count > 0`) — порожній рядок узагалі не рендериться, доки жоден запис
 * реакцію ще не отримав, а не порожні "0 ..." для всіх семи одразу. */
function ReactionCountsRow() {
  const theme = useTheme();
  const { data: counts } = useJournalReactionCounts();
  if (!counts) return null;

  const nonZero = REACTION_ORDER.map((id) => ({ id, count: counts[id] ?? 0 })).filter((r) => r.count > 0);
  if (nonZero.length === 0) return null;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
      {nonZero.map(({ id, count }) => {
        const meta = REACTION_META[id];
        return (
          <View
            key={id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.xs,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.surface,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Ionicons name={meta.icon} size={13} color={theme.colors.accent} />
            <AppText variant="micro" color="secondary">
              {count} {pluralizeUk(count, REACTION_COUNT_FORMS[id])}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

function JournalListHeader({
  typeFilter,
  onTypeFilterChange,
  favoriteOnly,
  onToggleFavoriteOnly,
}: {
  typeFilter: TypeFilterValue;
  onTypeFilterChange: (value: TypeFilterValue) => void;
  favoriteOnly: boolean;
  onToggleFavoriteOnly: () => void;
}) {
  const theme = useTheme();
  const { data: counts } = useJournalGlobalCount();

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <AppText variant="title">Мій щоденник</AppText>

      {counts && counts.total > 0 ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Card style={{ flex: 1, alignItems: 'center', paddingVertical: theme.spacing.md }}>
            <AppText variant="heading">{counts.total}</AppText>
            <AppText variant="micro" color="tertiary">
              {pluralizeUk(counts.total, ENTRY_FORMS)} усього
            </AppText>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center', paddingVertical: theme.spacing.md }}>
            <AppText variant="heading">{counts.favorites}</AppText>
            <AppText variant="micro" color="tertiary">
              в обраному
            </AppText>
          </Card>
        </View>
      ) : null}

      <ReactionCountsRow />

      <View style={{ gap: theme.spacing.sm }}>
        <ChipSelect label="Тип запису" options={TYPE_FILTER_OPTIONS} value={typeFilter} onChange={onTypeFilterChange} />
        <Pressable
          onPress={onToggleFavoriteOnly}
          accessibilityRole="button"
          accessibilityState={{ selected: favoriteOnly }}
          accessibilityLabel="Показувати лише обране"
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
            paddingHorizontal: theme.spacing.md,
            minHeight: theme.minTouchTarget,
            borderRadius: theme.radius.pill,
            backgroundColor: favoriteOnly ? theme.colors.accent : theme.colors.surface,
            borderWidth: 1,
            borderColor: favoriteOnly ? theme.colors.accent : theme.colors.border,
          }}
        >
          <Ionicons
            name={favoriteOnly ? 'heart' : 'heart-outline'}
            size={14}
            color={favoriteOnly ? theme.colors.onAccent : theme.colors.textSecondary}
          />
          <AppText variant="caption" color={favoriteOnly ? 'onAccent' : 'secondary'}>
            Лише обране
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Глобальний "Мій щоденник" (Фаза 4, Milestone 11) — усі нотатки й цитати по всій
 * бібліотеці, найновіші зверху, згруповані за днем. Вхід — картка на Home
 * (`app/(tabs)/index.tsx`), навмисно без окремого таба знизу (5 табів лишаються фіксованими,
 * `app/(tabs)/_layout.tsx`).
 *
 * `FlatList` + keyset-пагінація через `useJournalFeed`/`useInfiniteQuery` (той самий підхід
 * продуктивності, що й `app/(tabs)/library/index.tsx`, — тут ще важливіше: стрічка охоплює
 * геть усі книги, а не одну сторінку статусу).
 */
export default function JournalScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>('all');
  const [favoriteOnly, setFavoriteOnly] = useState(false);

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useJournalFeed({
    favoriteOnly,
    types: typeFilter === 'all' ? null : [typeFilter],
  });

  const entries = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const rows = useMemo(() => buildFeedRows(entries), [entries]);

  const renderItem = useCallback(({ item }: { item: FeedRow }) => {
    if (item.rowKind === 'header') {
      return (
        <AppText variant="caption" color="tertiary" style={{ marginBottom: 4 }}>
          {item.label}
        </AppText>
      );
    }
    return <JournalEntryRow entry={item.entry} />;
  }, []);

  const keyExtractor = useCallback((item: FeedRow) => item.key, []);

  const handleEndReached = () => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  };

  const hasActiveFilters = typeFilter !== 'all' || favoriteOnly;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Мій щоденник',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer scroll={false}>
        <FlatList
          data={rows}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
          ListHeaderComponent={
            <JournalListHeader
              typeFilter={typeFilter}
              onTypeFilterChange={setTypeFilter}
              favoriteOnly={favoriteOnly}
              onToggleFavoriteOnly={() => setFavoriteOnly((v) => !v)}
            />
          }
          ListHeaderComponentStyle={{ marginBottom: theme.spacing.lg }}
          ListFooterComponent={
            isFetchingNextPage ? (
              <AppText variant="caption" color="tertiary" style={{ textAlign: 'center', paddingVertical: theme.spacing.lg }}>
                Завантажую…
              </AppText>
            ) : null
          }
          onEndReachedThreshold={0.4}
          onEndReached={handleEndReached}
          ListEmptyComponent={
            isError ? (
              <QueryErrorState onRetry={() => refetch()} />
            ) : isLoading ? null : hasActiveFilters ? (
              <EmptyState
                title="Нічого не знайдено"
                description="Спробуй інші фільтри — або прибери їх, щоб побачити весь щоденник."
              />
            ) : (
              <EmptyState
                title="Тут поки порожньо"
                description="Записуй думки, питання й улюблені цитати прямо під час читання — вони з'являться тут."
              />
            )
          }
          contentContainerStyle={{
            paddingTop: theme.spacing.lg,
            paddingBottom: insets.bottom + theme.spacing.xxl,
            paddingHorizontal: theme.spacing.lg,
            flexGrow: 1,
          }}
        />
      </ScreenContainer>
    </>
  );
}
