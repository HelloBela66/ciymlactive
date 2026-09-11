import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, ScrollView, FlatList, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { ReadingProgressBar } from '@/components/ui/ReadingProgressBar';
import { ShelfThemeCard } from '@/components/library/ShelfThemeCard';
import { LibraryCarousel } from '@/components/library/LibraryCarousel';
import { LibrarySortSheet } from '@/components/library/LibrarySortSheet';
import { BookQuickActionsSheet } from '@/components/library/BookQuickActionsSheet';
import { useTheme } from '@/design/ThemeProvider';
import {
  useLibraryByFilter,
  useWaitingLongest,
  useRecentlyFinished,
  type LibraryFilter,
} from '@/features/library/useLibrary';
import { useShelves } from '@/features/library/useShelves';
import { userBookStatusLabels, type UserBookStatus } from '@/design/i18n-labels';
import { computeProgressPercent } from '@/lib/progressPercent';
import { pluralizeUk } from '@/lib/pluralizeUk';
import { LibraryPreferenceStorage, type LibraryViewMode, type LibrarySortOption } from '@/lib/libraryPreferenceStorage';
import type { UserBookWithDetails } from '@/types/userBook';

const BOOK_FORMS = ['книга', 'книги', 'книг'] as const;

/**
 * Milestone 11, доповнення3 (пряме прохання власника продукту): "Усі" тепер ПЕРША вкладка й
 * default-стан екрана (раніше — одразу "Читаю") — комбінований перегляд усієї бібліотеки одним
 * списком, читані книги зверху, решта за датою додавання (`useLibraryByFilter`,
 * `sortAllLibraryView`). Решта вкладок — той самий фільтр за конкретним статусом, що й раніше.
 *
 * Доповнення17 (власник продукту): багаторазові спроби доповнення3-12 підібрати ідеальний
 * розподіл РІВНО 2 рядків (`justifyContent`, `flex`, значки над/поруч із текстом — уся та
 * історія вище видалена, вона повністю замінена, а не доповнена) остаточно поступилися простішому
 * рішенню — ОДИН горизонтально прокручуваний рядок компактних чипів, без переносу, без
 * `justifyContent`-хитрощів: сім чипів фіксованої (під власний текст) ширини в ряд, зайве йде за
 * межу екрана й гортається. Порядок статусів — той самий, що й був (сума двох старих рядків). */
const FILTER_ORDER: LibraryFilter[] = [
  'all',
  'reading',
  'want_to_read',
  'paused',
  'finished',
  'rereading',
  'did_not_finish',
];

const FILTER_LABELS: Record<LibraryFilter, string> = {
  all: 'Усі',
  ...userBookStatusLabels,
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Значки чипів фільтра — по одному на кожен стан, ЛІВОРУЧ від підпису (доповнення17; раніше
 * (доповнення12) — над підписом, окремою "маркою"). */
const FILTER_ICONS: Record<LibraryFilter, IconName> = {
  all: 'apps-outline',
  reading: 'book-outline',
  want_to_read: 'bookmark-outline',
  paused: 'pause-circle-outline',
  finished: 'checkmark-circle-outline',
  rereading: 'refresh-outline',
  did_not_finish: 'close-circle-outline',
};

const STATUS_EMPTY_TEXT: Record<UserBookStatus, string> = {
  reading: 'Зараз ти нічого не читаєш.',
  want_to_read: 'Список "Хочу прочитати" порожній.',
  paused: 'Немає відкладених книг.',
  finished: 'Тут з\'являться прочитані книги.',
  rereading: 'Немає книг, які ти перечитуєш.',
  did_not_finish: 'Немає недочитаних книг.',
};

const FILTER_EMPTY_TEXT: Record<LibraryFilter, string> = {
  all: 'Бібліотека поки порожня.',
  ...STATUS_EMPTY_TEXT,
};

const PROGRESS_STATUSES: UserBookStatus[] = ['reading', 'rereading'];

/** `React.memo` (Milestone 8, продуктивність) — рядок бібліотеки більше не перерендерюється
 * при кожному рендері списку, лише коли змінюється власне `userBook`; авторський рядок
 * тепер рахується один раз тут, а не наново на кожен рендер (аудит: `join(', ')` у тілі
 * компонента без мемоізації).
 *
 * `onLongPress` (Фаза 1) — стабільний пропс з батьківського компонента (лише `setState`
 * всередині), а не інлайн-стрілка з `userBook` у замиканні: `React.memo` і надалі порівнює
 * пропси неглибоко, тож стабільна функція не змушує рядок перерендерюватись повторно, коли
 * змінюється лише інша книга у списку. */
const BookRow = React.memo(function BookRow({
  userBook,
  onLongPress,
}: {
  userBook: UserBookWithDetails;
  onLongPress: (userBook: UserBookWithDetails) => void;
}) {
  const theme = useTheme();
  const authorNames = useMemo(() => userBook.work.authors.map((a) => a.name).join(', '), [userBook.work.authors]);
  const handlePress = useCallback(() => {
    router.push({ pathname: '/work/[workId]', params: { workId: userBook.work.id } });
  }, [userBook.work.id]);
  const handleLongPress = useCallback(() => onLongPress(userBook), [onLongPress, userBook]);
  // Прогрес має сенс лише для книг, які зараз активно читаються — для "Хочу прочитати"/
  // "Прочитано"/"Відкладено"/"Не дочитано" він або відсутній за визначенням, або вже завжди
  // 100%, тож нічого не додає до рядка.
  const percent = PROGRESS_STATUSES.includes(userBook.status)
    ? computeProgressPercent(userBook.currentPage, userBook.edition.pageCount)
    : null;

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      accessibilityRole="button"
      accessibilityLabel={percent != null ? `${userBook.work.title}, прочитано ${Math.round(percent)}%` : userBook.work.title}
    >
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <CoverThumbnail
          coverUrl={userBook.edition.coverUrl}
          title={userBook.work.title}
          fallbackColor={userBook.work.coverFallbackColor}
          width={40}
          height={58}
        />
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <AppText variant="body">{userBook.work.title}</AppText>
          {authorNames.length > 0 ? (
            <AppText variant="caption" color="secondary">
              {authorNames}
            </AppText>
          ) : null}
          {percent != null ? <ReadingProgressBar percent={percent} height={4} /> : null}
        </View>
        {userBook.isFavorite ? <Ionicons name="heart" size={16} color={theme.colors.danger} /> : null}
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </Card>
    </Pressable>
  );
});

/** Відступ між картками сітки — той самий `theme.spacing.sm`, що й `ItemSeparator` для списку
 * (Фаза 1 нижче), щоб перемикання вигляду не міняло "щільність" повітря навколо книг. */
const GRID_COLUMNS = 3;
const GRID_GAP = 8;

/**
 * Картка книги в сітковому вигляді (Фаза 1, ТЗ "grid/list-перемикач"). Обкладинка — головний
 * елемент (той самий принцип, що й у `ShelfThemeCard`/`CoverThumbnail`'s doc-коментар: обкладинки
 * — єдиний насправді кольоровий елемент інтерфейсу), назва — одним рядком під нею. Індикатори
 * статусу НЕ лише кольором (accessibility, п.37 ТЗ): улюблене — окрема іконка-сердечко, прогрес
 * читання — той самий `ReadingProgressBar`, що й у списку.
 */
const GridBookItem = React.memo(function GridBookItem({
  userBook,
  coverWidth,
  onLongPress,
}: {
  userBook: UserBookWithDetails;
  coverWidth: number;
  onLongPress: (userBook: UserBookWithDetails) => void;
}) {
  const theme = useTheme();
  const handlePress = useCallback(() => {
    router.push({ pathname: '/work/[workId]', params: { workId: userBook.work.id } });
  }, [userBook.work.id]);
  const handleLongPress = useCallback(() => onLongPress(userBook), [onLongPress, userBook]);
  const percent = PROGRESS_STATUSES.includes(userBook.status)
    ? computeProgressPercent(userBook.currentPage, userBook.edition.pageCount)
    : null;

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      accessibilityRole="button"
      accessibilityLabel={percent != null ? `${userBook.work.title}, прочитано ${Math.round(percent)}%` : userBook.work.title}
      style={{ width: coverWidth }}
    >
      <View>
        <CoverThumbnail
          coverUrl={userBook.edition.coverUrl}
          title={userBook.work.title}
          fallbackColor={userBook.work.coverFallbackColor}
          width={coverWidth}
          height={coverWidth * 1.45}
        />
        {userBook.isFavorite ? (
          <View
            style={{
              position: 'absolute',
              top: theme.spacing.xs,
              right: theme.spacing.xs,
              backgroundColor: theme.colors.overlay,
              borderRadius: theme.radius.pill,
              padding: 3,
            }}
          >
            <Ionicons name="heart" size={12} color={theme.colors.onAccent} />
          </View>
        ) : null}
      </View>
      <AppText variant="caption" numberOfLines={2} style={{ marginTop: theme.spacing.xs }}>
        {userBook.work.title}
      </AppText>
      {percent != null ? <ReadingProgressBar percent={percent} height={4} /> : null}
    </Pressable>
  );
});

/**
 * Бібліотека користувача (Milestone 2): статус-таби над реальними UserBook-записами +
 * вхід до полиць. Повнотекстовий пошук по бібліотеці (розділ 15-16 ТЗ) — можливе уточнення
 * пізніше, коли книг стане достатньо багато, щоб це було потрібно, а не передчасна складність
 * для кількох книг одного користувача. Фільтр за жанром (Milestone 9, `GenreTagsSection` на
 * Book Details тепер дає цим даним звідки взятись) — з тієї самої причини поки теж не тут:
 * жанри редагуються на Book Details.
 *
 * Фаза 1 (POLYTSIA V1.6) додала: перемикач вигляду список/сітка, сортування (кнопка + нижнє
 * вікно), дві "розумні" стрічки на вкладці "Усі" (`LibraryCarousel`), long-press швидкі дії
 * (`BookQuickActionsSheet`). "Бейдж лічильника фільтрів" з оригінального ТЗ тут навмисно НЕ
 * окремий лічильник кількох активних фільтрів (жанр/формат тощо все ще свідомо не тут, з причини
 * вище — лічити було б нічого), а маленька крапка на кнопці "Сортувати", коли обрано не
 * дефолтне сортування — той самий сенс (видимий сигнал "тут щось змінено від дефолту"), без
 * побудови окремої системи фільтрів, якої в застосунку ще нема.
 */
/**
 * `FlatList` замість `ScrollView`+`.map()` (Milestone 8, продуктивність — реальна знахідка з
 * аудиту: бібліотека монтувала АБСОЛЮТНО ВСІ книги вибраного статусу одразу, без жодного
 * обмеження). Усе, що раніше йшло "над списком" (заголовок, таби статусів, полиці) тепер
 * `ListHeaderComponent` — `FlatList` сам є прокручуваним контейнером, тому `ScreenContainer`
 * тут з `scroll={false}` (звичайний View з кольором фону, без власного ScrollView), а відступи
 * безпечної зони/бічні поля, які раніше давав `ScreenContainer`, тепер на самому `FlatList`.
 */
const ItemSeparator = () => {
  const theme = useTheme();
  return <View style={{ height: theme.spacing.sm }} />;
};

/** Ширина картки полиці в горизонтальній стрічці "Полиці" (доповнення16 замінило попередній
 * розрахунок "4 картки завжди в один екран без скролу" — сам рядок і так гортається
 * горизонтально, коли полиць більше, тож "рівно 4 на екран" ніколи не було жорсткою вимогою,
 * лише орієнтиром ширини). Фіксоване, а не похідне від ширини вікна значення — і ось чому: рідне
 * співвідношення сторін зображень теми ~6.15:1 (`SHELF_THEME_ASPECT_RATIO`) означає, що при
 * вузькій картці (як було раніше, ~85-90px під 4-в-ряд) саме зображення виходить лише ~14-15px
 * заввишки — фізично закоротке, щоб залишатись "головним елементом картки", хай яким компактним
 * не зроби підпис під ним (власник продукту саме на це й поскаржився скріншотом: підпис
 * виглядав більшим за ілюстрацію). Замість звуження картки під фіксовану кількість "в ряд", тут
 * ширина підібрана так, щоб зображення (`260 / 6.15 ≈ 42px`) вже помітно переважало навіть
 * компактний двострічковий підпис-"ярлик" (`ShelfThemeCard`, `variant="overlay"` нижче,
 * ~40-48px) — ціна цього рішення: на екрані одночасно видно приблизно 1.3-1.5 картки замість 4,
 * решта — горизонтальним скролом, який тут і так уже був. */
const LIBRARY_SHELF_CARD_WIDTH = 260;

/**
 * Картка полиці "у вигляді полички" (Milestone 11, доповнення3 — третій прохід: власник
 * продукту повідомив, що (1) картка стала помітно більшою, ніж мала бути, і (2) сам малюнок не
 * читався однозначно як "книги" — просто кольорові стовпчики; доповнення5/6 — компактна ширина,
 * підібрана під реальну ширину екрана, докладніше коментар біля `cardWidth` нижче).
 *
 * Доповнення13: саму композицію картки (зображення теми + "табличка" з назвою/лічильником)
 * тепер малює спільний `ShelfThemeCard` (`src/components/library/ShelfThemeCard.tsx`) — той
 * самий компонент, що й пункт пікера вибору теми при створенні полиці (`app/shelf/new.tsx`).
 * Доповнення16: тут — саме `variant="overlay"` (підпис-ярлик поверх нижнього краю зображення,
 * не окремий блок під ним, докладніше — doc-коментар `ShelfThemeCard`), і ширина картки —
 * `LIBRARY_SHELF_CARD_WIDTH` (вище), а не похідна від ширини вікна. Тут лишається лише
 * live-текст: назва — те, що ввів користувач, лічильник — правильна українська форма
 * (`pluralizeUk`, той самий підхід, що вже усталений на Профілі/Wrapped/TBR-екранах) замість
 * фіксованого "книг" для будь-якої кількості, яке було тут раніше.
 */
function ShelfCard({ shelf }: { shelf: NonNullable<ReturnType<typeof useShelves>['data']>[number] }) {
  return (
    <ShelfThemeCard
      themeId={shelf.theme}
      title={shelf.name}
      subtitle={`${shelf.bookCount} ${pluralizeUk(shelf.bookCount, BOOK_FORMS)}`}
      width={LIBRARY_SHELF_CARD_WIDTH}
      variant="overlay"
      onPress={() => router.push({ pathname: '/shelf/[shelfId]', params: { shelfId: shelf.id } })}
      accessibilityLabel={`${shelf.name}, ${shelf.bookCount} ${pluralizeUk(shelf.bookCount, BOOK_FORMS)}`}
    />
  );
}

/**
 * Доповнення17 (власник продукту): один компактний чип фільтра статусу — значок ЛІВОРУЧ від
 * тексту (в один рядок, не над ним, як було в доповненні12), ширина під власний вміст (не
 * `flex: 1`/фіксований слот), без тіні/glow — вибраний стан сигналить лише суцільним акцентним
 * фоном (той самий принцип "тонка рамка/фон замість тіні", що й у `ShelfThemeCard`). "Усі" —
 * рівно той самий компонент, що й решта 6 статусів, жодної окремої форми чи стилю.
 */
function ReadingStatusChip({
  label,
  icon,
  selected,
  onPress,
  onLayout,
}: {
  label: string;
  icon: IconName;
  selected: boolean;
  onPress: () => void;
  onLayout: (e: { nativeEvent: { layout: { x: number; width: number } } }) => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: theme.minTouchTarget,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.lg,
        gap: 6,
        backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
      }}
    >
      <Ionicons name={icon} size={18} color={selected ? theme.colors.onAccent : theme.colors.textSecondary} />
      <AppText
        variant="body"
        numberOfLines={1}
        color={selected ? 'onAccent' : 'primary'}
        style={{ fontWeight: '600' }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

/** Кругла кнопка-іконка в шапці (перемикач вигляду, сортування) — той самий мінімальний touch
 * target (44pt), що й решта інтерактивних елементів екрана (Фаза 1). */
function HeaderIconButton({
  icon,
  label,
  onPress,
  showDot,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  showDot?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: theme.minTouchTarget,
        height: theme.minTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Ionicons name={icon} size={20} color={theme.colors.textSecondary} />
      {showDot ? (
        <View
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: theme.colors.accent,
          }}
        />
      ) : null}
    </Pressable>
  );
}

function LibraryListHeader({
  filter,
  onFilterChange,
  shelves,
  viewMode,
  onToggleViewMode,
  sort,
  onOpenSort,
  waitingLongest,
  recentlyFinished,
}: {
  filter: LibraryFilter;
  onFilterChange: (filter: LibraryFilter) => void;
  shelves: ReturnType<typeof useShelves>['data'];
  viewMode: LibraryViewMode;
  onToggleViewMode: () => void;
  sort: LibrarySortOption;
  onOpenSort: () => void;
  waitingLongest: UserBookWithDetails[];
  recentlyFinished: UserBookWithDetails[];
}) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const chipLayouts = useRef<Partial<Record<LibraryFilter, { x: number; width: number }>>>({});

  const handleFilterPress = useCallback(
    (tab: LibraryFilter) => {
      onFilterChange(tab);
      const layout = chipLayouts.current[tab];
      // Просте (не повністю "враховує обидва краї") підтягування вибраного чипа до лівого краю
      // видимої області — власник продукту сам позначив це необов'язковим ("якщо без зайвої
      // складності"), а `scrollTo` в RN сам обмежує ціль реальними межами вмісту, тож про вихід
      // за межі скролу під час підтягування останніх чипів ряду можна не дбати.
      if (layout) {
        scrollRef.current?.scrollTo({ x: Math.max(0, layout.x - theme.spacing.lg), animated: true });
      }
    },
    [onFilterChange, theme.spacing.lg]
  );

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="title">Бібліотека</AppText>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <HeaderIconButton
            icon={viewMode === 'list' ? 'grid-outline' : 'list-outline'}
            label={viewMode === 'list' ? 'Показати сіткою' : 'Показати списком'}
            onPress={onToggleViewMode}
          />
          <HeaderIconButton
            icon="swap-vertical-outline"
            label="Сортувати"
            onPress={onOpenSort}
            showDot={sort !== 'default'}
          />
        </View>
      </View>

      {/* Milestone 11, доповнення: "Полиці" тепер ПЕРШИМИ, до табів статусу (раніше — після) —
          пряме прохання власника продукту, щоб полиці одразу впадали в очі при відкритті вкладки. */}
      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="heading">Полиці</AppText>
          <Pressable onPress={() => router.push('/shelf/new')} accessibilityRole="button" accessibilityLabel="Нова полиця">
            <AppText variant="caption" color="accent">
              + Нова полиця
            </AppText>
          </Pressable>
        </View>

        {shelves && shelves.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
            {shelves.map((shelf) => (
              <ShelfCard key={shelf.id} shelf={shelf} />
            ))}
          </ScrollView>
        ) : (
          <AppText variant="caption" color="tertiary">
            Ще немає жодної полиці — створи першу, щоб групувати книги по-своєму.
          </AppText>
        )}
      </View>

      {/* Доповнення17: один горизонтально прокручуваний рядок замість 2 фіксованих рядків
          (уся довга історія `justifyContent`-ітерацій доповнення3-12 замінена, не доповнена).
          `paddingRight` замість симетричного `gap`-контейнера — саме він дає природний "натяк"
          на прокрутку (останній видимий чип трохи обрізаний за правим краєм екрана), без
          окремих стрілок чи індикатора скролу (`showsHorizontalScrollIndicator={false}`). Лівий
          край першого чипа навмисно БЕЗ окремого відступу/bleed — той самий `paddingHorizontal`
          екрана (`FlatList`'s `contentContainerStyle` нижче), що вже вирівнює "Полиці" й самі
          картки книг, тож усі три блоки лишаються на одній вертикальній лінії. */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.xl }}
        style={{ marginTop: theme.spacing.lg }}
      >
        {FILTER_ORDER.map((tab) => (
          <ReadingStatusChip
            key={tab}
            label={FILTER_LABELS[tab]}
            icon={FILTER_ICONS[tab]}
            selected={tab === filter}
            onPress={() => handleFilterPress(tab)}
            onLayout={(e) => {
              chipLayouts.current[tab] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
            }}
          />
        ))}
      </ScrollView>

      {/* Фаза 1: "розумні" стрічки — лише на вкладці "Усі" (докладніше — doc-коментар
          `LibraryCarousel`). Порожні стрічки самі повертають `null`, тож `gap` контейнера не
          лишає по собі порожнього місця. */}
      {filter === 'all' ? (
        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.lg }}>
          <LibraryCarousel title="Давно чекають" books={waitingLongest} />
          <LibraryCarousel title="Нещодавно завершені" books={recentlyFinished} />
        </View>
      ) : null}
    </View>
  );
}

export default function LibraryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  // Milestone 11, доповнення3: "Усі" — новий default (раніше — одразу "Читаю") — саме той
  // "загальний список книг", про який просив власник продукту (читані зверху, решта за датою
  // додавання, `sortAllLibraryView` у `useLibrary.ts`).
  const [filter, setFilter] = useState<LibraryFilter>('all');

  // Фаза 1: вигляд (список/сітка) і сортування — персистуються через `LibraryPreferenceStorage`
  // (той самий підхід, що й тема застосунку), завантажуються один раз при монтуванні екрана.
  // Дефолти (`'list'`/`'default'`) — рівно та поведінка, що вже була ДО Фази 1, тож доки
  // збережене значення не завантажилось, екран виглядає так само, як завжди.
  const [viewMode, setViewMode] = useState<LibraryViewMode>('list');
  const [sort, setSort] = useState<LibrarySortOption>('default');
  const [isSortSheetOpen, setSortSheetOpen] = useState(false);
  const [actionsForBook, setActionsForBook] = useState<UserBookWithDetails | null>(null);

  useEffect(() => {
    let cancelled = false;
    void LibraryPreferenceStorage.loadViewMode().then((saved) => {
      if (!cancelled && saved) setViewMode(saved);
    });
    void LibraryPreferenceStorage.loadSort().then((saved) => {
      if (!cancelled && saved) setSort(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleViewMode = useCallback(() => {
    setViewMode((current) => {
      const next: LibraryViewMode = current === 'list' ? 'grid' : 'list';
      void LibraryPreferenceStorage.saveViewMode(next);
      return next;
    });
  }, []);

  const handleSelectSort = useCallback((next: LibrarySortOption) => {
    setSort(next);
    void LibraryPreferenceStorage.saveSort(next);
  }, []);

  const { data: books, isLoading, isError, refetch } = useLibraryByFilter(filter, sort);
  const { data: shelves } = useShelves();
  const { data: waitingLongest } = useWaitingLongest();
  const { data: recentlyFinished } = useRecentlyFinished();

  const handleLongPress = useCallback((userBook: UserBookWithDetails) => setActionsForBook(userBook), []);

  const gridCoverWidth = useMemo(
    () => (windowWidth - theme.spacing.lg * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS,
    [windowWidth, theme.spacing.lg]
  );

  const renderItem = useCallback(
    ({ item }: { item: UserBookWithDetails }) =>
      viewMode === 'grid' ? (
        <GridBookItem userBook={item} coverWidth={gridCoverWidth} onLongPress={handleLongPress} />
      ) : (
        <BookRow userBook={item} onLongPress={handleLongPress} />
      ),
    [viewMode, gridCoverWidth, handleLongPress]
  );
  const keyExtractor = useCallback((item: UserBookWithDetails) => item.id, []);

  return (
    <ScreenContainer scroll={false}>
      <FlatList
        // `key={viewMode}` — FlatList не підтримує зміну `numColumns` "на льоту" (RN попереджає
        // про це в консолі), перемонтування при перемиканні вигляду — простіший і надійніший
        // обхід, ніж керувати внутрішньою розкладкою вручну.
        key={viewMode}
        data={books ?? []}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={viewMode === 'grid' ? GRID_COLUMNS : 1}
        columnWrapperStyle={viewMode === 'grid' ? { gap: GRID_GAP, marginBottom: theme.spacing.md } : undefined}
        ItemSeparatorComponent={viewMode === 'grid' ? undefined : ItemSeparator}
        ListHeaderComponent={
          <LibraryListHeader
            filter={filter}
            onFilterChange={setFilter}
            shelves={shelves}
            viewMode={viewMode}
            onToggleViewMode={handleToggleViewMode}
            sort={sort}
            onOpenSort={() => setSortSheetOpen(true)}
            waitingLongest={waitingLongest ?? []}
            recentlyFinished={recentlyFinished ?? []}
          />
        }
        ListHeaderComponentStyle={{ marginBottom: theme.spacing.xl }}
        ListEmptyComponent={
          isError ? (
            <QueryErrorState onRetry={() => refetch()} />
          ) : isLoading ? null : (
            <EmptyState
              title={FILTER_EMPTY_TEXT[filter]}
              description="Знайди книгу через пошук і додай її сюди з Book Details."
              actionLabel="До пошуку"
              onAction={() => router.push('/search')}
            />
          )
        }
        contentContainerStyle={{
          // `insets.top` (UI-фікс) — без нього "Бібліотека" рендериться під статус-баром,
          // той самий клас питання, що й `ScreenContainer` (`scroll={false}` тут навмисно, бо
          // `FlatList` сам є скролом — тому top/bottom insets рахуємо тут, а не в контейнері).
          paddingTop: insets.top + theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xxl,
          paddingHorizontal: theme.spacing.lg,
        }}
      />
      <LibrarySortSheet
        visible={isSortSheetOpen}
        value={sort}
        onSelect={handleSelectSort}
        onClose={() => setSortSheetOpen(false)}
      />
      <BookQuickActionsSheet userBook={actionsForBook} onClose={() => setActionsForBook(null)} />
    </ScreenContainer>
  );
}
