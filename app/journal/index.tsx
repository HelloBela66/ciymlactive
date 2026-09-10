import React, { useCallback, useMemo, useState } from 'react';
import { View, Pressable, FlatList, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { format, isToday, isYesterday, parseISO, startOfDay, startOfWeek, startOfMonth, endOfDay } from 'date-fns';
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
import { REACTION_ORDER, REACTION_META, REACTION_COUNT_FORMS, type ReactionId } from '@/design/reactions';
import { ReactionToggle } from '@/components/journal/ReactionPicker';
import { RevisitLaterToggle } from '@/components/journal/RevisitLaterToggle';
import { getDatabase } from '@/data/db';
import { WorkRepository, type WorkSearchResult } from '@/data/repositories/WorkRepository';
import { queryKeys } from '@/lib/queryKeys';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import {
  useJournalFeed,
  useJournalGlobalCount,
  useJournalReactionCounts,
  useToggleJournalFavorite,
  useToggleJournalRevisitLater,
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

type ReactionFilterValue = 'all' | ReactionId;

const REACTION_FILTER_OPTIONS: { value: ReactionFilterValue; label: string }[] = [
  { value: 'all', label: 'Усі' },
  ...REACTION_ORDER.map((id) => ({ value: id, label: REACTION_META[id].label })),
];

type DateFilterValue = 'all' | 'today' | 'week' | 'month';

const DATE_FILTER_OPTIONS: { value: DateFilterValue; label: string }[] = [
  { value: 'all', label: 'Увесь час' },
  { value: 'today', label: 'Сьогодні' },
  { value: 'week', label: 'Цей тиждень' },
  { value: 'month', label: 'Цей місяць' },
];

/** Перетворює вибір пресету (ТЗ Фази 7 — фільтр "Дата") на `dateFrom`/`dateTo` для
 * `JournalRepository.listFeedPage` — простий набір пресетів замість повноцінного
 * календаря-піка: у застосунку немає готового компонента вибору довільного діапазону дат
 * (лише навігація по одному дню, `app/day/[date].tsx`, для геть іншого екрана), а пресети
 * покривають реальні сценарії ("що я писав сьогодні/цього тижня/цього місяця"), лишаючись
 * тим самим ChipSelect-патерном, що й решта фільтрів на цьому екрані. */
function dateFilterRange(value: DateFilterValue): { dateFrom?: string; dateTo?: string } {
  if (value === 'all') return {};
  const now = new Date();
  const dateTo = endOfDay(now).toISOString();
  if (value === 'today') return { dateFrom: startOfDay(now).toISOString(), dateTo };
  if (value === 'week') return { dateFrom: startOfWeek(now, { locale: uk }).toISOString(), dateTo };
  return { dateFrom: startOfMonth(now).toISOString(), dateTo };
}

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
  const toggleRevisitLater = useToggleJournalRevisitLater();
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
              {/* Той самий порядок "реакція → повернутися пізніше → обране", що й у
               * `SessionJournalEntries`/`JournalSection` (`app/session/[sessionId].tsx`,
               * `app/work/[workId].tsx`) — узгоджено між усіма трьома місцями показу записів
               * щоденника. */}
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
              <RevisitLaterToggle
                value={entry.revisitLater}
                onChange={(revisitLater) =>
                  toggleRevisitLater.mutate({
                    id: entry.id,
                    kind: entry.kind,
                    userBookId: entry.userBookId,
                    revisitLater,
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

/** Пошук книги для фільтра "Книга" (ТЗ Фази 7) — окремий від основного текстового пошуку
 * (`searchQuery`, шукає ПО ТЕКСТУ записів): тут користувач шукає книгу за назвою/автором
 * (`WorkRepository.search`, той самий метод, що й "Особистий пошук" Фази 6), щоб звузити
 * стрічку до записів лише про НЕЇ. Дебаунс — той самий підхід, що й `usePersonalSearch`. */
function useBookFilterSuggestions(rawQuery: string) {
  const query = useDebouncedValue(rawQuery, 250);
  const trimmed = query.trim();
  return useQuery<WorkSearchResult[]>({
    queryKey: queryKeys.works.search(trimmed),
    queryFn: async () => {
      const db = await getDatabase();
      return WorkRepository.search(db, trimmed, 5);
    },
    enabled: trimmed.length > 0,
  });
}

function BookFilterPicker({
  selectedWork,
  onSelect,
  onClear,
}: {
  selectedWork: WorkSearchResult | null;
  onSelect: (work: WorkSearchResult) => void;
  onClear: () => void;
}) {
  const theme = useTheme();
  const [bookQuery, setBookQuery] = useState('');
  const suggestions = useBookFilterSuggestions(bookQuery);

  if (selectedWork) {
    return (
      <View style={{ gap: theme.spacing.xs }}>
        <AppText variant="caption" color="secondary">
          Книга
        </AppText>
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={`Прибрати фільтр за книгою «${selectedWork.title}»`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
            alignSelf: 'flex-start',
            paddingHorizontal: theme.spacing.md,
            minHeight: theme.minTouchTarget,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.accent,
            borderWidth: 1,
            borderColor: theme.colors.accent,
          }}
        >
          <AppText variant="caption" color="onAccent" numberOfLines={1} style={{ maxWidth: 220 }}>
            {selectedWork.title}
          </AppText>
          <Ionicons name="close-circle" size={16} color={theme.colors.onAccent} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <AppText variant="caption" color="secondary">
        Книга
      </AppText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingHorizontal: theme.spacing.md,
          minHeight: theme.minTouchTarget,
        }}
      >
        <Ionicons name="book-outline" size={16} color={theme.colors.textTertiary} />
        <TextInput
          value={bookQuery}
          onChangeText={setBookQuery}
          placeholder="Фільтр за назвою книги…"
          placeholderTextColor={theme.colors.textTertiary}
          style={{
            flex: 1,
            marginLeft: theme.spacing.sm,
            color: theme.colors.textPrimary,
            fontSize: theme.typography.scale.body.size,
          }}
          accessibilityLabel="Фільтр за книгою"
          autoCapitalize="none"
        />
      </View>
      {bookQuery.trim().length > 0 ? (
        <View style={{ gap: theme.spacing.xs }}>
          {suggestions.isLoading ? (
            <AppText variant="caption" color="tertiary">
              Шукаю…
            </AppText>
          ) : (suggestions.data ?? []).length === 0 ? (
            <AppText variant="caption" color="tertiary">
              Нічого не знайдено
            </AppText>
          ) : (
            (suggestions.data ?? []).map((work) => (
              <Pressable
                key={work.id}
                onPress={() => {
                  onSelect(work);
                  setBookQuery('');
                }}
                accessibilityRole="button"
                accessibilityLabel={work.title}
              >
                <Card
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.sm,
                    paddingVertical: theme.spacing.sm,
                  }}
                >
                  <CoverThumbnail
                    coverUrl={work.coverUrl}
                    title={work.title}
                    fallbackColor={work.coverFallbackColor}
                    width={28}
                    height={40}
                  />
                  <AppText variant="caption" numberOfLines={1} style={{ flex: 1 }}>
                    {work.title}
                  </AppText>
                </Card>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

function JournalListHeader({
  typeFilter,
  onTypeFilterChange,
  favoriteOnly,
  onToggleFavoriteOnly,
  revisitLaterOnly,
  onToggleRevisitLaterOnly,
  searchQuery,
  onSearchQueryChange,
  reactionFilter,
  onReactionFilterChange,
  dateFilter,
  onDateFilterChange,
  selectedWork,
  onSelectWork,
  onClearWork,
}: {
  typeFilter: TypeFilterValue;
  onTypeFilterChange: (value: TypeFilterValue) => void;
  favoriteOnly: boolean;
  onToggleFavoriteOnly: () => void;
  revisitLaterOnly: boolean;
  onToggleRevisitLaterOnly: () => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  reactionFilter: ReactionFilterValue;
  onReactionFilterChange: (value: ReactionFilterValue) => void;
  dateFilter: DateFilterValue;
  onDateFilterChange: (value: DateFilterValue) => void;
  selectedWork: WorkSearchResult | null;
  onSelectWork: (work: WorkSearchResult) => void;
  onClearWork: () => void;
}) {
  const theme = useTheme();
  const { data: counts } = useJournalGlobalCount();

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <AppText variant="title">Мій щоденник</AppText>

      {/* Текстовий пошук (ТЗ Фази 7) — по тексту нотаток/коментарів цитат
          (`JournalRepository.listFeedPage`'s `query`), той самий стиль поля, що й `/search`. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingHorizontal: theme.spacing.md,
          minHeight: theme.minTouchTarget,
        }}
      >
        <Ionicons name="search" size={18} color={theme.colors.textTertiary} />
        <TextInput
          value={searchQuery}
          onChangeText={onSearchQueryChange}
          placeholder="Пошук у щоденнику…"
          placeholderTextColor={theme.colors.textTertiary}
          style={{
            flex: 1,
            marginLeft: theme.spacing.sm,
            color: theme.colors.textPrimary,
            fontSize: theme.typography.scale.body.size,
          }}
          accessibilityLabel="Пошук у щоденнику"
          returnKeyType="search"
          autoCapitalize="none"
        />
        {searchQuery.length > 0 ? (
          <Pressable onPress={() => onSearchQueryChange('')} accessibilityRole="button" accessibilityLabel="Очистити пошук" hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

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
        {/* ТЗ Фази 11 («ПОВЕРНУТИСЯ ПІЗНІШЕ») — «У Journal додай filter». Той самий
         * pill-Pressable-патерн, що й "Лише обране" вище, з іконкою bookmark замість heart. */}
        <Pressable
          onPress={onToggleRevisitLaterOnly}
          accessibilityRole="button"
          accessibilityState={{ selected: revisitLaterOnly }}
          accessibilityLabel="Показувати лише «Повернутися пізніше»"
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
            paddingHorizontal: theme.spacing.md,
            minHeight: theme.minTouchTarget,
            borderRadius: theme.radius.pill,
            backgroundColor: revisitLaterOnly ? theme.colors.accent : theme.colors.surface,
            borderWidth: 1,
            borderColor: revisitLaterOnly ? theme.colors.accent : theme.colors.border,
          }}
        >
          <Ionicons
            name={revisitLaterOnly ? 'bookmark' : 'bookmark-outline'}
            size={14}
            color={revisitLaterOnly ? theme.colors.onAccent : theme.colors.textSecondary}
          />
          <AppText variant="caption" color={revisitLaterOnly ? 'onAccent' : 'secondary'}>
            Повернутися пізніше
          </AppText>
        </Pressable>
        <BookFilterPicker selectedWork={selectedWork} onSelect={onSelectWork} onClear={onClearWork} />
        <ChipSelect
          label="Реакція"
          options={REACTION_FILTER_OPTIONS}
          value={reactionFilter}
          onChange={onReactionFilterChange}
        />
        <ChipSelect label="Дата" options={DATE_FILTER_OPTIONS} value={dateFilter} onChange={onDateFilterChange} />
      </View>
    </View>
  );
}

/**
 * Глобальний "Мій щоденник" (Фаза 4, Milestone 11; текстовий пошук і фільтри за книгою/
 * реакцією/датою — Фаза 7) — усі нотатки й цитати по всій бібліотеці, найновіші зверху,
 * згруповані за днем. Вхід — картка на Home (`app/(tabs)/index.tsx`), навмисно без окремого
 * таба знизу (5 табів лишаються фіксованими, `app/(tabs)/_layout.tsx`).
 *
 * `FlatList` + keyset-пагінація через `useJournalFeed`/`useInfiniteQuery` (той самий підхід
 * продуктивності, що й `app/(tabs)/library/index.tsx`, — тут ще важливіше: стрічка охоплює
 * геть усі книги, а не одну сторінку статусу). Текстовий пошук дебаунситься перед потраплянням
 * у `queryKey`/SQL (`useDebouncedValue`) — той самий підхід, що й `/search`
 * (`usePersonalSearch`), щоб не бити SQLite на кожне натискання клавіші.
 */
export default function JournalScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // ТЗ Фази 11 — CTA «Переглянути» на підсумку читання (`app/completion/[workId].tsx`) веде
  // сюди з `?revisitLater=1`, щоб одразу показати вже відфільтрований список, а не голий
  // щоденник, у якому користувачу довелось би самому шукати й вмикати фільтр. Читається лише
  // один раз при монтуванні (початкове значення `useState`) — навмисно, а не постійна
  // синхронізація з параметром: користувач і далі може сам вимкнути фільтр на цьому екрані,
  // не борючись із параметром маршруту при кожному рендері.
  const params = useLocalSearchParams<{ revisitLater?: string }>();
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>('all');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [revisitLaterOnly, setRevisitLaterOnly] = useState(params.revisitLater === '1');
  const [searchQuery, setSearchQuery] = useState('');
  const [reactionFilter, setReactionFilter] = useState<ReactionFilterValue>('all');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>('all');
  const [selectedWork, setSelectedWork] = useState<WorkSearchResult | null>(null);

  const debouncedQuery = useDebouncedValue(searchQuery, 250);
  const { dateFrom, dateTo } = useMemo(() => dateFilterRange(dateFilter), [dateFilter]);

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useJournalFeed({
    favoriteOnly,
    revisitLaterOnly,
    types: typeFilter === 'all' ? null : [typeFilter],
    query: debouncedQuery.trim() || undefined,
    reaction: reactionFilter === 'all' ? undefined : reactionFilter,
    workId: selectedWork?.id,
    dateFrom,
    dateTo,
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

  const hasActiveFilters =
    typeFilter !== 'all' ||
    favoriteOnly ||
    revisitLaterOnly ||
    debouncedQuery.trim().length > 0 ||
    reactionFilter !== 'all' ||
    dateFilter !== 'all' ||
    selectedWork !== null;

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
              revisitLaterOnly={revisitLaterOnly}
              onToggleRevisitLaterOnly={() => setRevisitLaterOnly((v) => !v)}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              reactionFilter={reactionFilter}
              onReactionFilterChange={setReactionFilter}
              dateFilter={dateFilter}
              onDateFilterChange={setDateFilter}
              selectedWork={selectedWork}
              onSelectWork={setSelectedWork}
              onClearWork={() => setSelectedWork(null)}
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
