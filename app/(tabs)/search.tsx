import React, { useState } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { OfflineNotice } from '@/components/ui/OfflineNotice';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { SpoilerHiddenNotice } from '@/components/journal/SpoilerHiddenNotice';
import { useTheme } from '@/design/ThemeProvider';
import { journalEntryTypeLabels } from '@/design/i18n-labels';
import { useRecentWorks } from '@/features/search/useBookSearch';
import { useProviderSearch } from '@/features/search/useProviderSearch';
import { usePersonalSearch, type PersonalSearchResult } from '@/features/search/usePersonalSearch';
import { useImportDraftStore } from '@/stores/importDraftStore';
import { GoogleBooksProvider, ISBNdbProvider, SharedCatalogProvider, CuratedCatalogProvider } from '@/data/providers';
import type { BookMetadataProvider, RawProviderBook, ProviderSearchError } from '@/data/providers';
import { describeProviderSearchError } from '@/lib/providerSearchError';
import {
  dedupeAgainst,
  withSeen,
  isProviderSettled,
  haveAllProvidersFailed,
} from '@/lib/searchProviderCombine';
import type { WorkSearchResult } from '@/data/repositories/WorkRepository';
import type { Series } from '@/types/series';
import type { ShelfWithCount } from '@/types/shelf';
import type { JournalFeedEntry } from '@/types/journalEntry';
import { pluralizeUk } from '@/lib/pluralizeUk';
import { useIsOffline } from '@/lib/useIsOffline';

function WorkResultRow({ work }: { work: WorkSearchResult }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/work/[workId]', params: { workId: work.id } })}
      accessibilityRole="button"
      accessibilityLabel={work.title}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <CoverThumbnail
          coverUrl={work.coverUrl}
          title={work.title}
          fallbackColor={work.coverFallbackColor}
          width={40}
          height={58}
        />
        <View style={{ flex: 1 }}>
          <AppText variant="body">{work.title}</AppText>
          {work.authors.length > 0 ? (
            <AppText variant="caption" color="secondary">
              {work.authors.map((a) => a.name).join(', ')}
            </AppText>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </Card>
    </Pressable>
  );
}

/** Проста рядок-плашка з іконкою — той самий вигляд, що й пункти меню Профілю
 * (`app/(tabs)/profile/index.tsx`, `MENU_ITEMS`): для серій/полиць обкладинки немає сенсу
 * показувати (`Series.coverUrl`/`Shelf` без власного зображення в більшості випадків), тому
 * рядок — іконка + назва замість `CoverThumbnail`. */
function IconResultRow({
  icon,
  label,
  caption,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  caption?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Ionicons name={icon} size={20} color={theme.colors.textSecondary} />
        <View style={{ flex: 1 }}>
          <AppText variant="body">{label}</AppText>
          {caption ? (
            <AppText variant="caption" color="secondary">
              {caption}
            </AppText>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </Card>
    </Pressable>
  );
}

function SeriesResultRow({ series }: { series: Series }) {
  return (
    <IconResultRow
      icon="layers-outline"
      label={series.name}
      onPress={() => router.push({ pathname: '/series/[seriesId]', params: { seriesId: series.id } })}
    />
  );
}

const SHELF_BOOK_FORMS = ['книга', 'книги', 'книг'] as const;

function ShelfResultRow({ shelf }: { shelf: ShelfWithCount }) {
  return (
    <IconResultRow
      icon="bookmark-outline"
      label={shelf.name}
      caption={`${shelf.bookCount} ${pluralizeUk(shelf.bookCount, SHELF_BOOK_FORMS)}`}
      onPress={() => router.push({ pathname: '/shelf/[shelfId]', params: { shelfId: shelf.id } })}
    />
  );
}

/** Мітка типу/категорії запису — той самий принцип, що й приватна `feedEntryLabel` у
 * `app/journal/index.tsx`: `JournalFeedEntry.categoryLabel` уже резолвлена прямо в SQL
 * (`JournalRepository.searchFeed`, той самий `LEFT JOIN note_category`, що й `listFeedPage`),
 * тож тут лише вибір між нею і вбудованою міткою типу — без додаткового запиту. */
function entryTypeLabel(entry: JournalFeedEntry): string {
  if (entry.categoryId && entry.categoryLabel) return entry.categoryLabel;
  return journalEntryTypeLabels[entry.type];
}

/** Рядок результату пошуку по щоденнику (нотатка чи цитата) — спрощена версія
 * `JournalEntryRow` (`app/journal/index.tsx`): це РЕЗУЛЬТАТ ПОШУКУ, не сам щоденник, тож без
 * керування реакцією/обраним просто веде на книгу (той самий маршрут, що й повна стрічка
 * щоденника — власного екрана для окремого запису немає). */
function JournalResultRow({ entry }: { entry: JournalFeedEntry }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/work/[workId]', params: { workId: entry.workId } })}
      accessibilityRole="button"
      accessibilityLabel={`${entry.workTitle}: ${entryTypeLabel(entry)}`}
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
          <AppText variant="caption" color="accent">
            {entryTypeLabel(entry)} · {entry.workTitle}
          </AppText>
          <AppText
            variant="body"
            numberOfLines={2}
            style={entry.kind === 'quote' ? { fontStyle: 'italic' } : undefined}
          >
            {entry.text}
          </AppText>
        </View>
      </Card>
    </Pressable>
  );
}

function ProviderResultRow({ provider, book }: { provider: BookMetadataProvider; book: RawProviderBook }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        useImportDraftStore.getState().setPending(provider.id, book);
        router.push('/import/review');
      }}
      accessibilityRole="button"
      accessibilityLabel={book.title}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <CoverThumbnail
          coverUrl={book.coverUrl}
          title={book.title}
          fallbackColor={theme.colors.accentSoft}
          width={40}
          height={58}
        />
        <View style={{ flex: 1 }}>
          <AppText variant="body">{book.title}</AppText>
          {book.authors.length > 0 ? (
            <AppText variant="caption" color="secondary">
              {book.authors.join(', ')}
            </AppText>
          ) : null}
          {/* Бейдж "хтось уже читає" (Milestone 8.2) — лише в результатах спільного каталогу
              (єдине джерело, що заповнює `addedCount`), і лише коли справді > 0. */}
          {book.addedCount != null && book.addedCount > 0 ? (
            <AppText variant="micro" color="accent">
              {book.addedCount === 1 ? 'Хтось уже додав цю книгу' : `Додали собі: ${book.addedCount}`}
            </AppText>
          ) : null}
        </View>
        <Ionicons name="add-circle-outline" size={22} color={theme.colors.accent} />
      </Card>
    </Pressable>
  );
}

/**
 * FOUNDATION FINAL POLISH (Search Provider Error Transparency) — inline, "книжковий" (не
 * тривожний) стан ОДНІЄЇ секції провайдера, коли САМЕ ЦЕ джерело не відповіло (429/5xx/timeout/
 * мережа/malformed — `src/lib/providerSearchError.ts`), а не тому, що книг справді немає.
 * Навмисно НЕ великий червоний error screen (§19 ТЗ: "UI має залишатися спокійним і
 * книжковим") — той самий делікатний inline-Card вигляд, що й `OfflineNotice` поруч, лише з
 * додатковою кнопкою retry, коли є сенс повторити (є конкретний `onRetry`).
 */
function ProviderErrorNotice({ error, providerName, onRetry }: { error: ProviderSearchError; providerName: string; onRetry: () => void }) {
  const theme = useTheme();
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
      <Ionicons name="alert-circle-outline" size={20} color={theme.colors.textSecondary} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: theme.spacing.sm }}>
        <AppText variant="body" color="secondary">
          {describeProviderSearchError(error.kind, providerName)}
        </AppText>
        <Button
          label="Спробувати ще раз"
          variant="secondary"
          onPress={onRetry}
          accessibilityHint={`Повторно надішле пошуковий запит до джерела «${providerName}»`}
        />
      </View>
    </Card>
  );
}

/** Презентаційна секція результатів одного зовнішнього провайдера — саме отримання даних
 * (`useProviderSearch`) підняте в `SearchScreen` (Milestone 10 fix6, `docs/STATUS_V1.md`
 * п. 3.2, докладніше — коментар над `dedupeAgainst` нижче): щоб прибрати дублікати книги між
 * секціями, батьківський компонент мусить бачити результати ВСІХ секцій одразу, перш ніж
 * вирішити, що саме показати кожній — окремий незалежний `useProviderSearch` усередині кожної
 * секції (як було раніше) цього не дозволяв. `show`/`isLoading`/`data` — уже готові, відфільтровані
 * значення, ця функція лише рендерить.
 *
 * FOUNDATION FINAL POLISH — новий `error`/`onRetry`: коли САМЕ ЦЕ джерело провалилось (а не
 * просто "нічого не знайшло"), секція більше НЕ ховається мовчки (`!isLoading && data.length
 * === 0 → return null`, як робилося для порожнього результату) — показує `ProviderErrorNotice`
 * замість того, щоб виглядати так само, як "цієї книги немає". Якщо ІНШІ секції тим часом
 * успішно повернули результати — вони рендеряться поруч як завжди (мультипровайдерний пошук не
 * ламається через одне джерело, §14 ТЗ).
 */
function ProviderResultsSection({
  provider,
  data,
  error,
  isLoading,
  show,
  onRetry,
}: {
  provider: BookMetadataProvider;
  data: RawProviderBook[];
  error: ProviderSearchError | null;
  isLoading: boolean;
  show: boolean;
  onRetry: () => void;
}) {
  const theme = useTheme();

  if (!show) return null;
  if (!isLoading && !error && data.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText variant="caption" color="tertiary">
        {provider.displayName}
      </AppText>
      {isLoading ? (
        <AppText variant="caption" color="tertiary">
          Шукаю…
        </AppText>
      ) : error ? (
        <ProviderErrorNotice error={error} providerName={provider.displayName} onRetry={onRetry} />
      ) : (
        data.map((book) => <ProviderResultRow key={book.externalId} provider={provider} book={book} />)
      )}
    </View>
  );
}

/**
 * Дедуплікація результатів пошуку між секціями за ISBN (Milestone 10 fix6, `docs/STATUS_V1.md`
 * п. 3.2). Кожна книга, яку хоч раз хтось уже зберіг через зовнішній провайдер, автоматично
 * публікується в спільний каталог (`publishToSharedCatalog`, `src/data/remote/catalogSync.ts`)
 * — тож та сама книга згодом знаходиться і "Спільною бібліотекою", і своїм оригінальним
 * джерелом (Google Books/ISBNdb), двома окремими картками з однаковою назвою. Це не рідкісний
 * край-кейс: так стається для практично будь-якої книги, яку хоч раз уже шукав хтось у
 * застосунку.
 *
 * Порядок секцій на екрані ВЖЕ був продуманий (спільний каталог першим, платний ISBNdb
 * останнім) — тож просте правило "хто раніше показав книгу, той її й лишає собі" природно
 * віддає пріоритет каталогу (у нього є соціальний доказ — "додали собі: N", і саме туди
 * зрештою потрапляє будь-яка книга) над зовнішніми джерелами. Книги без жодного ISBN не
 * звіряються між собою взагалі (`isbnKey` → `null`) — це рідкість (майже всі метадані з
 * провайдерів мають хоч якийсь ISBN), і краще показати можливий рідкісний дублікат, ніж
 * помилково сховати різні книги з однаковим `null`-ключем.
 */
type SearchMode = 'personal' | 'catalog';

function PersonalSection({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText variant="caption" color="tertiary">
        {title}
      </AppText>
      {children}
    </View>
  );
}

/**
 * Особистий пошук, згруповано рівно як вимагає ТЗ Фази 6: Книги/Щоденник/Цитати/Серії/Полиці —
 * лише непорожні секції. `undefined` (ще не прийшла відповідь) і `isLoading` розрізнені: перший
 * рендер під час дебаунсу нічого не блимає порожнім станом.
 */
function PersonalSearchSections({
  result,
  isLoading,
}: {
  result: PersonalSearchResult | undefined;
  isLoading: boolean;
}) {
  const theme = useTheme();

  if (!result && isLoading) {
    return (
      <AppText variant="caption" color="tertiary">
        Шукаю…
      </AppText>
    );
  }

  const books = result?.books ?? [];
  const notes = result?.notes ?? [];
  const quotes = result?.quotes ?? [];
  const series = result?.series ?? [];
  const shelves = result?.shelves ?? [];
  // POLYTSIA V1.6.2, #166 — рахуємо приховані spoiler-safe режимом окремо від "справді немає
  // нічого": розділ "Щоденник"/"Цитати" тепер показується й тоді, коли всі знайдені записи
  // приховані (та сама 3-стороння різниця, що вже є на Book Details — увесь текст «Нічого не
  // знайдено» був би оманливим, якби насправді щось знайшлось, просто заховане).
  const hiddenNoteCount = result?.hiddenNoteCount ?? 0;
  const hiddenQuoteCount = result?.hiddenQuoteCount ?? 0;
  const isEmpty =
    books.length === 0 &&
    notes.length === 0 &&
    quotes.length === 0 &&
    series.length === 0 &&
    shelves.length === 0 &&
    hiddenNoteCount === 0 &&
    hiddenQuoteCount === 0;

  if (isEmpty) {
    return (
      <AppText variant="body" color="secondary">
        Нічого не знайдено серед твоїх книг, нотаток, цитат, серій і полиць.
      </AppText>
    );
  }

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {books.length > 0 ? (
        <PersonalSection title="Книги">
          {books.map((work) => (
            <WorkResultRow key={work.id} work={work} />
          ))}
        </PersonalSection>
      ) : null}
      {notes.length > 0 || hiddenNoteCount > 0 ? (
        <PersonalSection title="Щоденник">
          {notes.map((entry) => (
            <JournalResultRow key={entry.id} entry={entry} />
          ))}
          <SpoilerHiddenNotice hiddenCount={hiddenNoteCount} />
        </PersonalSection>
      ) : null}
      {quotes.length > 0 || hiddenQuoteCount > 0 ? (
        <PersonalSection title="Цитати">
          {quotes.map((entry) => (
            <JournalResultRow key={entry.id} entry={entry} />
          ))}
          <SpoilerHiddenNotice hiddenCount={hiddenQuoteCount} />
        </PersonalSection>
      ) : null}
      {series.length > 0 ? (
        <PersonalSection title="Серії">
          {series.map((item) => (
            <SeriesResultRow key={item.id} series={item} />
          ))}
        </PersonalSection>
      ) : null}
      {shelves.length > 0 ? (
        <PersonalSection title="Полиці">
          {shelves.map((item) => (
            <ShelfResultRow key={item.id} shelf={item} />
          ))}
        </PersonalSection>
      ) : null}
    </View>
  );
}

/**
 * Пошук (POLYTSIA V1.5, Фаза 6 — Global Personal Search): два явно розділені режими, щоб не
 * змішувати "що я вже маю" з "що можна додати" (вимога ТЗ — "Не змішуй external catalog results
 * із personal results хаотично"):
 *
 * «Особисте» (за замовчуванням) — офлайн-пошук лише по тому, що вже є в застосунку: книги й
 * автори (`WorkRepository.search`, той самий метод, що раніше показувався як "у твоєму
 * каталозі"), серії, полиці, нотатки й цитати щоденника (`usePersonalSearch`). Коли запит
 * порожній — "Останні додані" (`useRecentWorks`, поведінка не змінилась).
 *
 * «Каталог» — раніше існуючий пошук ДЛЯ ДОДАВАННЯ нової книги (Milestone 1/7/8.2): спільний
 * каталог, власна добірка «Полиці», Google Books, і лише останньою — платний ISBNdb, від 3
 * символів, кожен у своїй секції. Порядок/дедуплікація/gate для ISBNdb — той самий, що й раніше
 * (докладніше — коментарі при `dedupeAgainst`/`isbndbEnabled` нижче). Тап на зовнішній результат
 * веде на екран підтвердження (`/import/review`) — ніколи не зберігає без перегляду користувачем.
 *
 * OFFLINE UX (POLYTSIA V1.6.1, Фаза 20, `docs/OFFLINE_UX.md`) — реалізує намір, який
 * `docs/LOCAL_FIRST.md` документував ще з Milestone 0, але код ніколи не підключав (аудит,
 * §39.1): доки `useIsOffline()` каже "немає мережі", жодна з чотирьох секцій «Каталогу» не
 * запускає запит, і сам режим показує один делікатний inline-banner замість чотирьох мовчазно
 * порожніх "Шукаю…"/нічого-не-знайдено секцій. «Особисте» цього НЕ стосується — воно й так
 * завжди було чисто локальним (SQLite), просто раніше про це ніде явно не було сказано в UI.
 */
export default function SearchScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('personal');

  const recentResult = useRecentWorks();
  const personalSearch = usePersonalSearch(query);

  // OFFLINE UX (Фаза 20, `docs/OFFLINE_UX.md`) — «Особисте» лишається повністю локальним
  // (`usePersonalSearch`/`useRecentWorks` — SQLite, ніколи не мережа), тож `isOffline` тут
  // впливає ЛИШЕ на «Каталог»-гілку нижче: жодна з чотирьох мережевих секцій не запускає запит,
  // доки офлайн (`enabled: !isOffline`), і сам режим показує один делікатний inline-banner
  // замість чотирьох "Шукаю…"/порожніх секцій, які раніше виглядали б як "нічого не знайдено".
  const isOffline = useIsOffline();

  const catalogResult = useProviderSearch(SharedCatalogProvider, query, { enabled: !isOffline });
  const curatedResult = useProviderSearch(CuratedCatalogProvider, query, { enabled: !isOffline });
  const googleBooksResult = useProviderSearch(GoogleBooksProvider, query, { enabled: !isOffline });
  const isbndbEnabled =
    !isOffline &&
    isProviderSettled(catalogResult) &&
    isProviderSettled(curatedResult) &&
    isProviderSettled(googleBooksResult);
  const isbndbResult = useProviderSearch(ISBNdbProvider, query, { enabled: isbndbEnabled });

  // Каталог показується як є (нема кого дедуплікувати проти НЬОГО, він завжди перший) — потім
  // кожна наступна секція фільтрує книги, чий ISBN уже показала попередня, і сама додається до
  // "вже показаного" для секції після себе. Добірка «Полиці» (Milestone 11, доповнення) —
  // одразу за спільним каталогом, з тієї самої причини, що й у `ALL_PROVIDERS` (обидва —
  // власний Supabase, дешеві й швидкі, вищий пріоритет за платні зовнішні джерела).
  //
  // FOUNDATION FINAL POLISH — `.data` тепер `{ items, error }`, не голий масив: дедуплікація й
  // далі працює лише з `items` (помилка одного джерела не бере участі в дедуплікації, і не
  // ховає результати інших — §14 ТЗ).
  const catalogBooks = catalogResult.data?.items ?? [];
  const seenAfterCatalog = withSeen(catalogBooks, new Set());
  const curatedBooks = dedupeAgainst(curatedResult.data?.items, seenAfterCatalog);
  const seenAfterCurated = withSeen(curatedResult.data?.items, seenAfterCatalog);
  const googleBooks = dedupeAgainst(googleBooksResult.data?.items, seenAfterCurated);
  const seenAfterGoogle = withSeen(googleBooksResult.data?.items, seenAfterCurated);
  const isbndbBooks = dedupeAgainst(isbndbResult.data?.items, seenAfterGoogle);

  const showProviderSections = query.trim().length >= 3;
  const isSearching = query.trim().length > 0;
  const hasRecent = (recentResult.data?.length ?? 0) > 0;

  // FOUNDATION FINAL POLISH — "усі провалились" ≠ "нічого не знайдено" (§19 ТЗ): рахуємо лише
  // серед провайдерів, що РЕАЛЬНО зробили запит цього разу (ISBNdb — умовно, за `isbndbEnabled`
  // — офлайн чи ще не "осіли" інші джерела не рахуються як "спроба"), і лише коли КОЖЕН з них
  // завершився саме помилкою (не просто порожнім результатом) і жоден не дав жодної книги.
  const attemptedCatalogResults = [
    catalogResult,
    curatedResult,
    googleBooksResult,
    ...(isbndbEnabled ? [isbndbResult] : []),
  ];
  const allCatalogFailed = haveAllProvidersFailed(
    attemptedCatalogResults,
    catalogBooks.length + curatedBooks.length + googleBooks.length + isbndbBooks.length,
  );

  const retryAllCatalogProviders = () => {
    void catalogResult.refetch();
    void curatedResult.refetch();
    void googleBooksResult.refetch();
    if (isbndbEnabled) void isbndbResult.refetch();
  };

  return (
    <ScreenContainer topInset>
      <AppText variant="title">Пошук</AppText>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingHorizontal: theme.spacing.md,
          marginTop: theme.spacing.lg,
          minHeight: theme.minTouchTarget,
        }}
      >
        <Ionicons name="search" size={18} color={theme.colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Назва, автор, серія, полиця, нотатка…"
          placeholderTextColor={theme.colors.textTertiary}
          style={{
            flex: 1,
            marginLeft: theme.spacing.sm,
            color: theme.colors.textPrimary,
            fontSize: theme.typography.scale.body.size,
          }}
          accessibilityLabel="Пошук"
          returnKeyType="search"
          autoCapitalize="none"
        />
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
        <Button
          label="Особисте"
          variant={mode === 'personal' ? 'primary' : 'secondary'}
          onPress={() => setMode('personal')}
          style={{ flex: 1, paddingHorizontal: theme.spacing.sm }}
        />
        <Button
          label="Каталог"
          variant={mode === 'catalog' ? 'primary' : 'secondary'}
          onPress={() => setMode('catalog')}
          style={{ flex: 1, paddingHorizontal: theme.spacing.sm }}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
        <Button
          label="Додати вручну"
          variant="secondary"
          onPress={() => router.push('/work/new')}
          style={{ flex: 1, paddingHorizontal: theme.spacing.sm }}
        />
        <Button
          label="Сканувати ISBN"
          variant="secondary"
          onPress={() => router.push('/isbn-scan')}
          style={{ flex: 1, paddingHorizontal: theme.spacing.sm }}
        />
      </View>

      <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.lg }}>
        {mode === 'personal' ? (
          isSearching ? (
            <PersonalSearchSections result={personalSearch.data} isLoading={personalSearch.isLoading} />
          ) : (
            <>
              {hasRecent ? (
                <View style={{ gap: theme.spacing.sm }}>
                  <AppText variant="caption" color="tertiary">
                    Останні додані
                  </AppText>
                  {(recentResult.data ?? []).map((work) => (
                    <WorkResultRow key={work.id} work={work} />
                  ))}
                </View>
              ) : !recentResult.isLoading ? (
                <AppText variant="body" color="tertiary" style={{ textAlign: 'center', marginTop: theme.spacing.xxl }}>
                  Шукай серед своїх книг, нотаток, цитат, серій і полиць — щойно щось додаси до бібліотеки.
                </AppText>
              ) : null}
            </>
          )
        ) : isSearching ? (
          isOffline ? (
            // OFFLINE UX (Фаза 20) — один делікатний inline-banner замість чотирьох мовчазно
            // порожніх секцій (`docs/LOCAL_FIRST.md`'s "ніколи глобальний блокуючий overlay",
            // тут аналог — і ніколи одразу чотири окремі копії того самого повідомлення).
            <OfflineNotice message="Немає з'єднання з інтернетом. Спільний каталог, Google Books та ISBNdb зараз недоступні — спробуй ще раз, коли з'явиться мережа." />
          ) : allCatalogFailed ? (
            // FOUNDATION FINAL POLISH, §19 ТЗ — усі джерела провалились цього разу: НЕ "Нічого
            // не знайдено" (пошук фактично не відбувся), а чесний "не вдалося завантажити" з
            // одним retry на всі джерела одразу. `QueryErrorState` — той самий спільний
            // компонент, що й решта екранів застосунку для провалених запитів (не новий
            // винахід заради цього екрана).
            <QueryErrorState
              message="Перевір з'єднання та спробуй ще раз."
              onRetry={retryAllCatalogProviders}
            />
          ) : (
            <>
              {/* Спільний каталог першим (Milestone 8.2): дешевий і швидкий запит до власного
                  Supabase, книги, додані іншими користувачами, — зверху списку. Далі Google
                  Books. ISBNdb — платна, останньою, і додатково чекає (`isbndbEnabled`), доки
                  перші дві не "осядуть" (порожньо чи з помилкою). Кожна наступна секція вже не
                  показує книги, чий ISBN показала попередня (`dedupeAgainst` вище, Milestone 10
                  fix6, п. 3.2). Помилка ОДНОГО джерела (`error`/`onRetry` нижче, FOUNDATION
                  FINAL POLISH) не ховає результати інших — кожна секція незалежна. */}
              <ProviderResultsSection
                provider={SharedCatalogProvider}
                data={catalogBooks}
                error={catalogResult.data?.error ?? null}
                isLoading={catalogResult.isLoading}
                show={showProviderSections}
                onRetry={() => void catalogResult.refetch()}
              />
              <ProviderResultsSection
                provider={CuratedCatalogProvider}
                data={curatedBooks}
                error={curatedResult.data?.error ?? null}
                isLoading={curatedResult.isLoading}
                show={showProviderSections}
                onRetry={() => void curatedResult.refetch()}
              />
              <ProviderResultsSection
                provider={GoogleBooksProvider}
                data={googleBooks}
                error={googleBooksResult.data?.error ?? null}
                isLoading={googleBooksResult.isLoading}
                show={showProviderSections}
                onRetry={() => void googleBooksResult.refetch()}
              />
              <ProviderResultsSection
                provider={ISBNdbProvider}
                data={isbndbBooks}
                error={isbndbResult.data?.error ?? null}
                isLoading={isbndbResult.isLoading}
                show={showProviderSections}
                onRetry={() => void isbndbResult.refetch()}
              />
            </>
          )
        ) : (
          <AppText variant="body" color="tertiary" style={{ textAlign: 'center', marginTop: theme.spacing.xxl }}>
            Введи назву або автора, щоб знайти книгу для додавання — у спільній базі застосунку чи
            одразу в Google Books.
          </AppText>
        )}
      </View>
    </ScreenContainer>
  );
}
