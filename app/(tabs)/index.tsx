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
import { useTheme } from '@/design/ThemeProvider';
import { getTimeOfDayGreeting } from '@/lib/greeting';
import { useActiveSession } from '@/features/reading-session/useActiveSession';
import { useLibraryByStatus } from '@/features/library/useLibrary';
import { useOverallStatistics } from '@/features/statistics/useStatistics';
import { useJournalGlobalCount } from '@/features/journal/useJournal';
import { pluralizeUk } from '@/lib/pluralizeUk';
import { computeProgressPercent } from '@/lib/progressPercent';

const DAY_FORMS = ['день', 'дні', 'днів'] as const;
const ENTRY_FORMS = ['запис', 'записи', 'записів'] as const;

/** Показуємо щонайбільше стільки книг — це компактний дашборд-віджет, не повний список
 * (Milestone 8, продуктивність: аудит показав, що тут монтувалась уся бібліотека зі статусом
 * "reading" без обмеження; на Головній це навряд чи колись стане реальною проблемою, бо
 * одночасно "в процесі читання" рідко буває багато книг, але явний кеп + посилання на повний
 * список — дешевий і правильний захист на майбутнє). */
const HOME_READING_LIST_LIMIT = 5;

function CurrentlyReadingList() {
  const theme = useTheme();
  const { data: reading } = useLibraryByStatus('reading');
  if (!reading || reading.length === 0) return null;
  const visible = reading.slice(0, HOME_READING_LIST_LIMIT);
  const hiddenCount = reading.length - visible.length;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="heading">Зараз читаєш</AppText>
        {hiddenCount > 0 ? (
          <Pressable
            onPress={() => router.push('/library')}
            accessibilityRole="button"
            accessibilityLabel={`Показати всі ${reading.length} книг у статусі "Зараз читаю"`}
          >
            <AppText variant="caption" color="accent">
              Усі ({reading.length})
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {visible.map((userBook) => {
        const percent = computeProgressPercent(userBook.currentPage, userBook.edition.pageCount);
        return (
          <Pressable
            key={userBook.id}
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
            accessibilityLabel={
              percent != null
                ? `${userBook.work.title}, прочитано ${Math.round(percent)}%`
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
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
            </Card>
          </Pressable>
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
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.xl }}>
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

/**
 * Вхід до глобального "Мій щоденник" (Milestone 11, Фаза 4) — навмисно картка тут, не
 * окремий таб знизу (5 табів лишаються фіксованими, `app/(tabs)/_layout.tsx`). Завжди
 * видима, незалежно від `showEmptyState`/активного читання — щоденник корисний навіть тоді,
 * коли зараз нічого не читаєш (переглянути записи з уже прочитаних книг).
 */
function JournalEntryPointCard() {
  const theme = useTheme();
  const { data: counts } = useJournalGlobalCount();

  return (
    // `as unknown as Href` — маршрут `app/journal/index.tsx` реальний і валідний (Фаза 4), але
    // локальний кеш typed routes (`.expo/types/router.d.ts`, не в git) не завжди встигає його
    // побачити до `tsc` (той самий клас питання, що й Milestone 9 fix2).
    <Pressable onPress={() => router.push('/journal' as unknown as Href)} accessibilityRole="button" accessibilityLabel="Мій щоденник">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="book-outline" size={20} color={theme.colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">Мій щоденник</AppText>
          <AppText variant="caption" color="secondary">
            {counts && counts.total > 0
              ? `${counts.total} ${pluralizeUk(counts.total, ENTRY_FORMS)}`
              : 'Записуй думки й цитати під час читання'}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </Card>
    </Pressable>
  );
}

/**
 * Вхід до «Що почитати завтра?» (Milestone 11, доповнення, пряме прохання власника
 * продукту) — так само завжди видима картка, як і `JournalEntryPointCard`: корисна
 * незалежно від того, чи зараз щось читаєш (підбір НАСТУПНОЇ книги).
 */
function TomorrowEntryPointCard() {
  const theme = useTheme();
  return (
    // `as unknown as Href` — той самий, уже усталений у цьому файлі прийом (`JournalEntryPointCard`
    // вище): маршрут `app/tomorrow.tsx` реальний, лише локальний кеш typed routes відстає.
    <Pressable onPress={() => router.push('/tomorrow' as unknown as Href)} accessibilityRole="button" accessibilityLabel="Що почитати завтра?">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="sparkles" size={20} color={theme.colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">Що почитати завтра?</AppText>
          <AppText variant="caption" color="secondary">
            Жанр, час і настрій — підберемо конкретну книгу
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </Card>
    </Pressable>
  );
}

/**
 * Вхід до «Трендів» (Milestone 11, доповнення) — той самий візуальний патерн, що й
 * `TomorrowEntryPointCard`/`JournalEntryPointCard` вище: завжди видима картка, незалежно від
 * стану бібліотеки користувача.
 */
function TrendsEntryPointCard() {
  const theme = useTheme();
  return (
    // `as unknown as Href` — той самий, уже усталений у цьому файлі прийом: маршрут
    // `app/trends.tsx` реальний, лише локальний кеш typed routes відстає.
    <Pressable onPress={() => router.push('/trends' as unknown as Href)} accessibilityRole="button" accessibilityLabel="Тренди">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="trending-up" size={20} color={theme.colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">Тренди</AppText>
          <AppText variant="caption" color="secondary">
            Топ-10 книг, які зараз найчастіше додають
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
      </Card>
    </Pressable>
  );
}

/**
 * Головна. Next-in-series (п.10 ТЗ) — пізніші milestone, коли з'явиться достатньо даних, щоб
 * мало сенс. Зараз — today-stats/streak (Milestone 5), компактний список "зараз читаєш", вхід
 * до щоденника, до «Що почитати завтра?» і до «Трендів» (усі три — Milestone 11).
 *
 * Відновлення перерваної сесії (п.12 ТЗ: якщо застосунок був force-quit посеред читання) з
 * Milestone 11 (доповнення, панель активного читання) більше не окремий банер лише тут — та
 * сама дія "повернутись до читання" тепер видима з будь-якої вкладки одразу над нижньою
 * навігацією (`ReadingSessionMiniBar`, `app/(tabs)/_layout.tsx`), тож дублювати її ще раз саме
 * на Головній означало б показувати ту саму інформацію двічі різними візуальними мовами.
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

      <TodayStatsRow />

      <CurrentlyReadingList />

      <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.sm }}>
        <JournalEntryPointCard />
        <TomorrowEntryPointCard />
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
