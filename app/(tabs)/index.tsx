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
import { useReadingContinuity } from '@/features/reading-session/useReadingContinuity';
import { useLibraryByStatus } from '@/features/library/useLibrary';
import { useOverallStatistics } from '@/features/statistics/useStatistics';
import { useJournalGlobalCount } from '@/features/journal/useJournal';
import { OnThisDayCard } from '@/components/home/OnThisDayCard';
import { pluralizeUk } from '@/lib/pluralizeUk';
import { computeProgressPercent } from '@/lib/progressPercent';
import { formatLastReadLabel } from '@/lib/lastReadLabel';
import type { ReadingSession } from '@/types/readingSession';
import type { JournalEntry } from '@/types/journalEntry';
import type { UserBookWithDetails } from '@/types/userBook';

const DAY_FORMS = ['день', 'дні', 'днів'] as const;
const ENTRY_FORMS = ['запис', 'записи', 'записів'] as const;

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

      {/* POLYTSIA V1.6, Фаза 3 («Цей день у твоєму читанні») — контекстна картка, сама вирішує
          свою видимість (`return null`, коли на сьогодні немає жодного спогаду з минулих
          років, п.1/19 ТЗ). Розміщена ПІСЛЯ активного читання (найдієвіший розділ Home лишається
          першим) і ПЕРЕД завжди-видимими "вхід до…"-картками нижче — своя, менш повсякденна
          категорія контенту. Формального "показуй щонайбільше одну контекстну картку" механізму
          (п.18 ТЗ) тут поки нема — жодна з конкуруючих фіч цього списку (stale reading/capsule/
          goal/TBR) ще не реалізована в цьому мілстоуні, тож поки немає з чим конкурувати за
          єдиний слот. */}
      <View style={{ marginTop: theme.spacing.lg }}>
        <OnThisDayCard />
      </View>

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
