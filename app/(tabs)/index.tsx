import React from 'react';
import { View, Pressable } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { ReadingProgressBar } from '@/components/ui/ReadingProgressBar';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { QuickAction } from '@/components/ui/QuickAction';
import { useTheme } from '@/design/ThemeProvider';
import { getTimeOfDayGreeting } from '@/lib/greeting';
import { useActiveSession } from '@/features/reading-session/useActiveSession';
import { useReadingContinuity } from '@/features/reading-session/useReadingContinuity';
import { useLibraryByStatus } from '@/features/library/useLibrary';
import { useOverallStatistics } from '@/features/statistics/useStatistics';
import { HomeContextCard } from '@/components/home/HomeContextCard';
import { pluralizeUk } from '@/lib/pluralizeUk';
import { computeProgressPercent } from '@/lib/progressPercent';
import { formatLastReadLabel } from '@/lib/lastReadLabel';
import type { ReadingSession } from '@/types/readingSession';
import type { JournalEntry } from '@/types/journalEntry';
import type { UserBookWithDetails } from '@/types/userBook';

const DAY_FORMS = ['день', 'дні', 'днів'] as const;

/** Показуємо щонайбільше стільки книг — це компактний дашборд-віджет, не повний список
 * (Milestone 8, продуктивність: аудит показав, що тут монтувалась уся бібліотека зі статусом
 * "reading" без обмеження; на Головній це навряд чи колись стане реальною проблемою, бо
 * одночасно "в процесі читання" рідко буває багато книг, але явний кеп + посилання на повний
 * список — дешевий і правильний захист на майбутнє). */
const HOME_READING_LIST_LIMIT = 5;

/**
 * Компактний рядок "Останній раз: …" / "N хв · N стор." (ТЗ Фази 8 — READING CONTINUITY) —
 * складає всі доступні шматки в один підпис, кожен окремо необов'язковий ("gracefully
 * деградує", якщо даних немає): поточна сторінка, час і сторінки останньої сесії. Прогрес
 * (%) навмисно НЕ тут — він і так завжди видимий на `ReadingProgressBar` поруч, дублювати його
 * тут означало б саме "перевантажувати card", від чого прямо застерігає ТЗ.
 */
function buildContinuityMetaLine(currentPage: number, lastSession: ReadingSession | null, now: Date): string | null {
  const parts: string[] = [];
  if (currentPage > 0) parts.push(`с. ${currentPage}`);
  if (lastSession?.endedAt) parts.push(`Останній раз: ${formatLastReadLabel(lastSession.endedAt, now)}`);
  if (lastSession?.durationSeconds != null) {
    const minutes = Math.round(lastSession.durationSeconds / 60);
    if (minutes > 0) parts.push(`${minutes} хв`);
  }
  if (lastSession?.endPage != null) {
    const pages = Math.max(0, lastSession.endPage - lastSession.startPage);
    if (pages > 0) parts.push(`${pages} стор.`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function CurrentReadingRow({
  userBook,
  lastSession,
  lastEntry,
  now,
}: {
  userBook: UserBookWithDetails;
  lastSession: ReadingSession | null;
  lastEntry: JournalEntry | null;
  now: Date;
}) {
  const theme = useTheme();
  const percent = computeProgressPercent(userBook.currentPage, userBook.edition.pageCount);
  const metaLine = buildContinuityMetaLine(userBook.currentPage, lastSession, now);

  return (
    <Pressable
      // Milestone 11, доповнення: тап тут веде НЕ на повний Book Details (як досі в
      // Бібліотеці — там свідомо лишається без змін), а на компактний екран запуску сесії
      // читання саме цієї книги (`app/session/launch/[userBookId].tsx`). `as unknown as
      // Href` — навколо ВСЬОГО об'єкта (не лише `pathname`) — той самий прийом, що вже
      // усталений для параметризованих маршрутів поза кешем typed routes (`app/work/[workId].tsx`,
      // `router.push({ pathname: '/completion/[workId]', params: { workId } } as unknown as Href)`):
      // маршрут реальний, лише локальний кеш typed routes (`.expo/types/router.d.ts`, не в
      // git) ще не встиг його побачити — саме тому `Href`-каст об'єкта-як-цілого, а не рядка
      // `pathname` окремо (той не проходить перевірку типів, бо звужений рядковий літерал
      // очікується саме в полі `pathname`, а не увесь union-тип `Href`).
      onPress={() =>
        router.push({
          pathname: '/session/launch/[userBookId]',
          params: { userBookId: userBook.id },
        } as unknown as Href)
      }
      accessibilityRole="button"
      accessibilityLabel={`${
        percent != null ? `${userBook.work.title}, прочитано ${Math.round(percent)}%` : userBook.work.title
      }. Продовжити читання.`}
    >
      <Card style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <CoverThumbnail
            coverUrl={userBook.edition.coverUrl}
            title={userBook.work.title}
            fallbackColor={userBook.work.coverFallbackColor}
            width={40}
            height={58}
          />
          <View style={{ flex: 1, gap: theme.spacing.xs }}>
            <AppText variant="body">{userBook.work.title}</AppText>
            {userBook.work.authors.length > 0 ? (
              <AppText variant="caption" color="secondary">
                {userBook.work.authors.map((a) => a.name).join(', ')}
              </AppText>
            ) : null}
            {percent != null ? (
              <View style={{ marginTop: theme.spacing.xs }}>
                <ReadingProgressBar percent={percent} />
              </View>
            ) : null}
          </View>
        </View>

        {/* Last journal entry preview — щонайбільше 1 запис, короткий truncated preview
            (`numberOfLines={1}`, ТЗ Фази 8: "не перевантажуй card"). */}
        {metaLine || lastEntry ? (
          <View style={{ gap: 2 }}>
            {metaLine ? (
              <AppText variant="caption" color="secondary">
                {metaLine}
              </AppText>
            ) : null}
            {lastEntry ? (
              <AppText variant="caption" color="tertiary" numberOfLines={1} style={{ fontStyle: 'italic' }}>
                Остання думка: «{lastEntry.text}»
              </AppText>
            ) : null}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
          <AppText variant="caption" color="accent">
            Продовжити читання
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.accent} />
        </View>
      </Card>
    </Pressable>
  );
}

function CurrentlyReadingList() {
  const theme = useTheme();
  const { data: reading } = useLibraryByStatus('reading');
  const visible = (reading ?? []).slice(0, HOME_READING_LIST_LIMIT);
  // Хук викликається БЕЗУМОВНО, до раннього `return null` нижче (Rules of Hooks) — порожній
  // масив (доки `reading` ще не завантажився) означає, що запит просто не виконується
  // (`enabled` усередині `useReadingContinuity`).
  const continuity = useReadingContinuity(visible.map((userBook) => userBook.id));
  const now = new Date();

  if (!reading || reading.length === 0) return null;
  const hiddenCount = reading.length - visible.length;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <SectionHeader
        title="Зараз читаєш"
        trailing={
          hiddenCount > 0 ? (
            <Pressable
              onPress={() => router.push('/library')}
              accessibilityRole="button"
              accessibilityLabel={`Показати всі ${reading.length} книг у статусі "Зараз читаю"`}
            >
              <AppText variant="caption" color="accent">
                Усі ({reading.length})
              </AppText>
            </Pressable>
          ) : null
        }
      />
      {visible.map((userBook) => {
        const info = continuity.data?.get(userBook.id);
        return (
          <CurrentReadingRow
            key={userBook.id}
            userBook={userBook}
            lastSession={info?.lastSession ?? null}
            lastEntry={info?.lastEntry ?? null}
            now={now}
          />
        );
      })}
    </View>
  );
}

/** Компактний рядок "сьогодні" (п.10 ТЗ, Milestone 5): хвилини/сторінки сьогодні й поточна
 * серія днів. Ховається, поки немає жодної завершеної сесії за весь час — інакше показував
 * би самі нулі до першої реальної сесії читання. */
function TodayStatsRow() {
  const theme = useTheme();
  const { data } = useOverallStatistics();
  if (!data || data.totalSessions === 0) return null;

  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xl, marginBottom: theme.spacing.xl }}>
      <Card style={{ flex: 1, alignItems: 'center', paddingVertical: theme.spacing.md }}>
        <AppText variant="heading">{data.today.minutes}</AppText>
        <AppText variant="micro" color="tertiary">
          хв сьогодні
        </AppText>
      </Card>
      <Card style={{ flex: 1, alignItems: 'center', paddingVertical: theme.spacing.md }}>
        <AppText variant="heading">{data.today.pages}</AppText>
        <AppText variant="micro" color="tertiary">
          стор. сьогодні
        </AppText>
      </Card>
      <Card style={{ flex: 1, alignItems: 'center', paddingVertical: theme.spacing.md }}>
        <AppText variant="heading">{data.currentStreak}</AppText>
        <AppText variant="micro" color="tertiary">
          {pluralizeUk(data.currentStreak, DAY_FORMS)} поспіль
        </AppText>
      </Card>
    </View>
  );
}

type ShortcutIconName = React.ComponentProps<typeof Ionicons>['name'];

interface ShortcutItem {
  icon: ShortcutIconName;
  label: string;
  onPress: () => void;
}

/** ТЗ Фази 18 (HOME REDESIGN §HOME SHORTCUTS): "Compact shortcuts: Мій щоденник, Моя історія,
 * Моя пам'ять, Статистика. Не роби великі cards для кожного." — рівно ці чотири пункти, у
 * тому самому порядку, що й ТЗ. Іконки — уже перевірені в застосунку: `book-outline` (сам
 * "Мій щоденник" тут раніше, до цієї фази), `time-outline`/`bar-chart-outline` (той самий
 * вибір, що й у меню Профілю, `app/(tabs)/profile/index.tsx`), `cube-outline` (той самий
 * концепт "капсули"/пам'яті, що й `app/memory/[workId].tsx`/`app/completion/[workId].tsx`).
 * `/journal`/`/history`/`/memory`/`/statistics` — `as unknown as Href` там, де локальний кеш
 * typed routes (`.expo/types/router.d.ts`, не в git) не завжди встигає побачити маршрут до
 * `tsc` (той самий клас питання, що й усюди в цьому файлі). */
const HOME_SHORTCUTS: ShortcutItem[] = [
  { icon: 'book-outline', label: 'Мій щоденник', onPress: () => router.push('/journal' as unknown as Href) },
  { icon: 'time-outline', label: 'Моя історія', onPress: () => router.push('/history' as unknown as Href) },
  { icon: 'cube-outline', label: 'Моя пам\'ять', onPress: () => router.push('/memory' as unknown as Href) },
  { icon: 'bar-chart-outline', label: 'Статистика', onPress: () => router.push('/statistics' as unknown as Href) },
];

function HomeShortcuts() {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
      {HOME_SHORTCUTS.map((item) => (
        <QuickAction key={item.label} variant="tile" icon={item.icon} label={item.label} onPress={item.onPress} />
      ))}
    </View>
  );
}

/**
 * Вхід до «Що почитати завтра?» (Milestone 11, доповнення, пряме прохання власника продукту)
 * — завжди видима картка, корисна незалежно від того, чи зараз щось читаєш (підбір НАСТУПНОЇ
 * книги). З Фази 18 (HOME REDESIGN) — під ТЗ-обов'язковими розділами Home, не серед чотирьох
 * компактних shortcuts (`HomeShortcuts` вище): це рекомендаційна фіча, не навігаційний ярлик.
 */
function TomorrowEntryPointCard() {
  return (
    // `as unknown as Href` — той самий, уже усталений у цьому файлі прийом: маршрут
    // `app/tomorrow.tsx` реальний, лише локальний кеш typed routes відстає.
    <QuickAction
      icon="sparkles"
      label="Що почитати завтра?"
      description="Жанр, час і настрій — підберемо конкретну книгу"
      onPress={() => router.push('/tomorrow' as unknown as Href)}
    />
  );
}

/**
 * Вхід до «Обери мені книгу» (ТЗ Фази 16, ONE BOOK PICKER, `docs/ONE_BOOK_PICKER.md`) — той
 * самий візуальний патерн, що й `TomorrowEntryPointCard` вище: завжди видима картка. Навмисно
 * ОКРЕМА від «Що почитати завтра?» (ТЗ: "Не видаляй existing recommendation logic без причини")
 * — там підбирається НОВА книга ззовні, тут — ОДНА книга з уже наявної бібліотеки користувача.
 */
function OnePickerEntryPointCard() {
  return (
    // `as unknown as Href` — той самий, уже усталений у цьому файлі прийом (`TomorrowEntryPointCard`
    // вище): маршрут `app/one-book-picker.tsx` реальний, лише локальний кеш typed routes відстає.
    <QuickAction
      icon="shuffle-outline"
      label="Обери мені книгу"
      description="Час, настрій, довжина — одна книга з твоєї полиці"
      onPress={() => router.push('/one-book-picker' as unknown as Href)}
    />
  );
}

/**
 * Вхід до «Трендів» (Milestone 11, доповнення) — той самий візуальний патерн, що й
 * `TomorrowEntryPointCard` вище: завжди видима картка, незалежно від стану бібліотеки
 * користувача.
 */
function TrendsEntryPointCard() {
  return (
    // `as unknown as Href` — той самий, уже усталений у цьому файлі прийом: маршрут
    // `app/trends.tsx` реальний, лише локальний кеш typed routes відстає.
    <QuickAction
      icon="trending-up"
      label="Тренди"
      description="Топ-10 книг, які зараз найчастіше додають"
      onPress={() => router.push('/trends' as unknown as Href)}
    />
  );
}

/**
 * Головна (ТЗ Фази 18, HOME REDESIGN, `docs/HOME_REDESIGN.md`) — порядок розділів тепер
 * буквально повторює пріоритет ТЗ: 1. Current Reading; 2. Continue CTA; 3. Today summary;
 * 4. одна контекстна картка; 5. secondary shortcuts. До цієї фази `TodayStatsRow` стояв ПЕРЕД
 * `CurrentlyReadingList` — саме це й виправлено (докладніше — `docs/HOME_REDESIGN.md` §Порядок
 * розділів). "Continue CTA" (п.2) окремим елементом тут не показаний — кожен рядок
 * `CurrentlyReadingList` сам є цим CTA (тап веде на запуск сесії саме цієї книги), той самий
 * принцип, що й "Continue reading" на більшості читацьких застосунків: дія прив'язана до
 * конкретної книги, а не абстрактна кнопка окремо від неї.
 *
 * Відновлення перерваної сесії (п.12 ТЗ: якщо застосунок був force-quit посеред читання) з
 * Milestone 11 (доповнення, панель активного читання) не окремий банер тут — та сама дія
 * "повернутись до читання" видима з будь-якої вкладки одразу над нижньою навігацією
 * (`ReadingSessionMiniBar`, `app/(tabs)/_layout.tsx`), тож дублювати її ще раз саме на Головній
 * означало б показувати ту саму інформацію двічі різними візуальними мовами.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const { data: activeSession } = useActiveSession();
  const { data: reading } = useLibraryByStatus('reading');

  const showEmptyState = !activeSession && (!reading || reading.length === 0);

  return (
    <ScreenContainer topInset>
      <AppText variant="display">{getTimeOfDayGreeting()}</AppText>
      <View style={{ height: theme.spacing.xxl }} />

      {/* #1 Current Reading + #2 Continue CTA (кожен рядок — своя дія "продовжити") */}
      <CurrentlyReadingList />

      {/* #3 Today summary */}
      <TodayStatsRow />

      {/* #4 Одна контекстна картка (ТЗ: "У конкретний момент показуй максимум ОДНУ context
          card... Не показуй 5 одночасно") — уся логіка вибору "яку саме" в
          `useHomeContextCard`/`selectHomeContextCard` (`src/lib/homeContext.ts`), тут лише
          рендер обраного результату чи нічого (`HomeContextCard` сама повертає `null`). */}
      <View style={{ marginTop: theme.spacing.lg }}>
        <HomeContextCard />
      </View>

      {/* #5 Secondary shortcuts (ТЗ: "Compact shortcuts: Мій щоденник, Моя історія, Моя
          пам'ять, Статистика. Не роби великі cards для кожного.") */}
      <View style={{ marginTop: theme.spacing.xl }}>
        <HomeShortcuts />
      </View>

      {/* Рекомендаційні входи поза чотирма ТЗ-шорткатами вище (Milestone 11/Фаза 16 —
          «Що почитати завтра?»/«Обери мені книгу»/«Тренди») — навмисно ЗБЕРЕЖЕНІ (не входять у
          заборону "Не роби великі cards" — вона стосується лише чотирьох названих у ТЗ пунктів),
          лише переміщені під ТЗ-обов'язкові розділи, щоб Home не показував десять карток
          одразу однаковою вагою (`docs/HOME_REDESIGN.md` §Чому рекомендаційні картки лишились). */}
      <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.sm }}>
        <TomorrowEntryPointCard />
        <OnePickerEntryPointCard />
        <TrendsEntryPointCard />
      </View>

      {showEmptyState ? (
        <EmptyState
          title="Зараз ти нічого не читаєш."
          description="Обери книгу з бібліотеки, щоб почати сесію читання."
          actionLabel="Обрати книгу"
          onAction={() => router.push('/library')}
        />
      ) : null}
    </ScreenContainer>
  );
}
