import React, { useState } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { useTheme } from '@/design/ThemeProvider';
import { useBookSearch, useRecentWorks } from '@/features/search/useBookSearch';
import { useProviderSearch } from '@/features/search/useProviderSearch';
import { useImportDraftStore } from '@/stores/importDraftStore';
import { GoogleBooksProvider, ISBNdbProvider, SharedCatalogProvider, CuratedCatalogProvider } from '@/data/providers';
import type { BookMetadataProvider, RawProviderBook } from '@/data/providers';
import type { WorkSearchResult } from '@/data/repositories/WorkRepository';

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

/** Презентаційна секція результатів одного зовнішнього провайдера — саме отримання даних
 * (`useProviderSearch`) підняте в `SearchScreen` (Milestone 10 fix6, `docs/STATUS_V1.md`
 * п. 3.2, докладніше — коментар над `dedupeAgainst` нижче): щоб прибрати дублікати книги між
 * секціями, батьківський компонент мусить бачити результати ВСІХ секцій одразу, перш ніж
 * вирішити, що саме показати кожній — окремий незалежний `useProviderSearch` усередині кожної
 * секції (як було раніше) цього не дозволяв. `show`/`isLoading`/`data` — уже готові, відфільтровані
 * значення, ця функція лише рендерить. */
function ProviderResultsSection({
  provider,
  data,
  isLoading,
  show,
}: {
  provider: BookMetadataProvider;
  data: RawProviderBook[];
  isLoading: boolean;
  show: boolean;
}) {
  const theme = useTheme();

  if (!show) return null;
  if (!isLoading && data.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText variant="caption" color="tertiary">
        {provider.displayName}
      </AppText>
      {isLoading ? (
        <AppText variant="caption" color="tertiary">
          Шукаю…
        </AppText>
      ) : (
        data.map((book) => <ProviderResultRow key={book.externalId} provider={provider} book={book} />)
      )}
    </View>
  );
}

/** Порожній список результатів "осів" (не завантажується і нічого не знайшов) — допоміжна
 * перевірка для gate ISBNdb нижче. */
function isSettledEmpty(result: { isLoading: boolean; data?: RawProviderBook[] }): boolean {
  return !result.isLoading && (result.data?.length ?? 0) === 0;
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
function isbnKey(book: RawProviderBook): string | null {
  return book.isbn13 ?? book.isbn10 ?? null;
}

function dedupeAgainst(books: RawProviderBook[] | undefined, seen: ReadonlySet<string>): RawProviderBook[] {
  if (!books) return [];
  return books.filter((book) => {
    const key = isbnKey(book);
    return key === null || !seen.has(key);
  });
}

function withSeen(books: RawProviderBook[] | undefined, seen: ReadonlySet<string>): Set<string> {
  const next = new Set(seen);
  for (const book of books ?? []) {
    const key = isbnKey(book);
    if (key !== null) next.add(key);
  }
  return next;
}

/**
 * Пошук: локальний каталог одразу (Milestone 1) + спільний каталог, власна добірка «Полиці»
 * (Milestone 11, доповнення) і зовнішні провайдери Google Books/ISBNdb (Milestone 7 і 8.2,
 * docs/BOOK_PROVIDERS.md; Open Library прибрано з пошуку в Milestone 10 fix6 —
 * `docs/STATUS_V1.md`) від 3 символів, кожен у своїй секції. Порядок секцій — спільний
 * каталог, потім добірка «Полиці» (обидва — власний Supabase, без квоти й майже миттєво),
 * потім Google Books, і лише останньою — платний ISBNdb. Тап на зовнішній результат веде на
 * екран підтвердження (`/import/review`) — ніколи не зберігає без перегляду користувачем.
 *
 * Усі три результати підняті сюди (а не отримуються кожною секцією окремо) з двох причин
 * одразу: 1) щоб порахувати gate для ISBNdb (Milestone 8.2, не витрачати платний запит, доки
 * спільний каталог і Google Books ще не показали, що книги немає ніде), як і раніше; 2) щоб
 * прибрати дублікати між секціями за ISBN (Milestone 10 fix6, `docs/STATUS_V1.md` п. 3.2,
 * докладніше — коментар над `dedupeAgainst` вище) — сам факт підняття цих хуків сюди НЕ додає
 * нових мережевих запитів, `useProviderSearch` і так викликався б у кожній секції окремо.
 */
export default function SearchScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const searchResult = useBookSearch(query);
  const recentResult = useRecentWorks();

  const catalogResult = useProviderSearch(SharedCatalogProvider, query);
  const curatedResult = useProviderSearch(CuratedCatalogProvider, query);
  const googleBooksResult = useProviderSearch(GoogleBooksProvider, query);
  const isbndbEnabled = isSettledEmpty(catalogResult) && isSettledEmpty(curatedResult) && isSettledEmpty(googleBooksResult);
  const isbndbResult = useProviderSearch(ISBNdbProvider, query, { enabled: isbndbEnabled });

  // Каталог показується як є (нема кого дедуплікувати проти НЬОГО, він завжди перший) — потім
  // кожна наступна секція фільтрує книги, чий ISBN уже показала попередня, і сама додається до
  // "вже показаного" для секції після себе. Добірка «Полиці» (Milestone 11, доповнення) —
  // одразу за спільним каталогом, з тієї самої причини, що й у `ALL_PROVIDERS` (обидва —
  // власний Supabase, дешеві й швидкі, вищий пріоритет за платні зовнішні джерела).
  const catalogBooks = catalogResult.data ?? [];
  const seenAfterCatalog = withSeen(catalogBooks, new Set());
  const curatedBooks = dedupeAgainst(curatedResult.data, seenAfterCatalog);
  const seenAfterCurated = withSeen(curatedResult.data, seenAfterCatalog);
  const googleBooks = dedupeAgainst(googleBooksResult.data, seenAfterCurated);
  const seenAfterGoogle = withSeen(googleBooksResult.data, seenAfterCurated);
  const isbndbBooks = dedupeAgainst(isbndbResult.data, seenAfterGoogle);

  const showProviderSections = query.trim().length >= 3;
  const isSearching = query.trim().length > 0;
  const results = isSearching ? searchResult.data ?? [] : recentResult.data ?? [];
  const isLoading = isSearching ? searchResult.isLoading : recentResult.isLoading;

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
          placeholder="Назва або автор"
          placeholderTextColor={theme.colors.textTertiary}
          style={{
            flex: 1,
            marginLeft: theme.spacing.sm,
            color: theme.colors.textPrimary,
            fontSize: theme.typography.scale.body.size,
          }}
          accessibilityLabel="Пошук книг"
          returnKeyType="search"
          autoCapitalize="none"
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
        <View style={{ gap: theme.spacing.sm }}>
          {!isLoading && isSearching && results.length === 0 ? (
            <AppText variant="body" color="secondary">
              Нічого не знайдено в твоєму каталозі.
            </AppText>
          ) : null}

          {!isSearching && results.length > 0 ? (
            <AppText variant="caption" color="tertiary">
              Останні додані
            </AppText>
          ) : null}
          {isSearching && results.length > 0 ? (
            <AppText variant="caption" color="tertiary">
              У твоєму каталозі
            </AppText>
          ) : null}

          {results.map((work) => (
            <WorkResultRow key={work.id} work={work} />
          ))}
        </View>

        {isSearching ? (
          <>
            {/* Спільний каталог першим (Milestone 8.2): дешевий і швидкий запит до власного
                Supabase, книги, додані іншими користувачами, — зверху списку. Далі Google
                Books. ISBNdb — платна, останньою, і додатково чекає (`isbndbEnabled`), доки
                перші дві не "осядуть" порожніми. Кожна наступна секція вже не показує книги,
                чий ISBN показала попередня (`dedupeAgainst` вище, Milestone 10 fix6, п. 3.2). */}
            <ProviderResultsSection
              provider={SharedCatalogProvider}
              data={catalogBooks}
              isLoading={catalogResult.isLoading}
              show={showProviderSections}
            />
            <ProviderResultsSection
              provider={CuratedCatalogProvider}
              data={curatedBooks}
              isLoading={curatedResult.isLoading}
              show={showProviderSections}
            />
            <ProviderResultsSection
              provider={GoogleBooksProvider}
              data={googleBooks}
              isLoading={googleBooksResult.isLoading}
              show={showProviderSections}
            />
            <ProviderResultsSection
              provider={ISBNdbProvider}
              data={isbndbBooks}
              isLoading={isbndbResult.isLoading}
              show={showProviderSections}
            />
          </>
        ) : null}
      </View>

      {!isSearching && !isLoading && results.length === 0 ? (
        <AppText variant="body" color="tertiary" style={{ textAlign: 'center', marginTop: theme.spacing.xxl }}>
          Пошук по твоїй бібліотеці, спільній базі застосунку й одразу в Google Books.
        </AppText>
      ) : null}
    </ScreenContainer>
  );
}
