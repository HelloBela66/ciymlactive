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
import { OnboardingHintCard } from '@/components/ui/OnboardingHintCard';
import { useTheme } from '@/design/ThemeProvider';
import { getTimeOfDayGreeting } from '@/lib/greeting';
import { useActiveSession } from '@/features/reading-session/useActiveSession';
import { useReadingContinuity } from '@/features/reading-session/useReadingContinuity';
import { useLibraryAll, useLibraryByStatus } from '@/features/library/useLibrary';
import { useOverallStatistics } from '@/features/statistics/useStatistics';
import { useOnboardingHint } from '@/features/onboarding/useOnboardingHint';
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

/**
 * PROGRESSIVE ONBOARDING, Фаза 18 (`docs/PROGRESSIVE_ONBOARDING.md`) — разом із порожнім станом
 * Home для геть нового користувача (`isLibraryEmpty`, `HomeScreen` нижче). На відміну від
 * самого `EmptyState` (лишається видимим, доки бібліотека порожня), це привітання зникає
 * НАЗАВЖДИ після першого перегляду/закриття (`useOnboardingHint`) — навіть якщо користувач
 * пізніше видалить усі книги й бібліотека знову стане порожньою, вдруге не з'явиться.
 */
function WelcomeHint() {
  const theme = useTheme();
  const { visible, dismiss } = useOnboardingHint('welcome');
  if (!visible) return null;

  return (
    <View style={{ marginBottom: theme.spacing.lg }}>
      <OnboardingHintCard
        title="Ласкаво просимо до Полиці!"
        description="Полиця — це пам'ять твого читання: прогрес, нотатки й спогади про кожну книгу збираються в одному місці. Почни з пошуку своєї першої книги."
        onDismiss={dismiss}
      />
    </View>
  );
}

/**
 * PROGRESSIVE ONBOARDING, Фаза 18 — одразу після ПЕРШОЇ ЗАВЕРШЕНОЇ сесії читання
 * (`totalSessions === 1`) на Home раптом з'являються `TodayStatsRow`/рядок "Зараз читаєш"
 * (обидва до цього моменту поверталися `null`) — коротко пояснює, що саме тепер з'явилось і
 * куди йдуть нотатки/цитати. Умова `totalSessions === 1`, а не лише факт показу підказки,
 * навмисна: природно перестає діяти вже після другої сесії сама собою, а `useOnboardingHint`
 * (закрито назавжди після першого тапу на ×) захищає від повторної появи, навіть якби
 * `totalSessions` з якоїсь причини знову став 1 (наприклад, видалення другої сесії).
 */
function FirstSessionHint() {
  const theme = useTheme();
  const { data } = useOverallStatistics();
  const { visible, dismiss } = useOnboardingHint('firstSession');
  if (!visible || data?.totalSessions !== 1) return null;

  return (
    <View style={{ marginTop: theme.spacing.lg }}>
      <OnboardingHintCard
        title="Перша сесія читання позаду!"
        description="Тепер тут з'являються твій прогрес і сьогоднішня статистика. Занотовуй думки й цитати під час читання — вони збираються в «Мій щоденник»."
        onDismiss={dismiss}
      />
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
 * Моя пам'ять, Статистика. Не роби великі cards для кожного." — початково рівно ці чотири
 * пункти, у тому самому порядку, що й ТЗ. Іконки — уже перевірені в застосунку: `book-outline`
 * (сам "Мій щоденник" тут раніше, до цієї фази), `bar-chart-outline` (той самий вибір, що й у
 * меню Профілю, `app/(tabs)/profile/index.tsx`), `cube-outline` (той самий концепт "капсули"/
 * пам'яті, що й `app/memory/[workId].tsx`/`app/completion/[workId].tsx`).
 *
 * **Оновлено Фазою 16** (MEMORY HUB HIERARCHY, `docs/MEMORY_HUB.md`) — "Моя історія" прибрана
 * з цього переліку (→ три пункти замість чотирьох). Це ЯВНЕ, буквальне рішення завдання Фази 16
 * ("«Моя історія» (secondary, доступна з Profile/More)"), а не самостійна ревізія ТЗ Фази 18 —
 * той самий клас рішення, що й консолідація трьох рекомендаційних карток у Фазі 14. Демоція з
 * Home НЕ потребує жодної нової роботи в Профілі: "Моя історія" й до цієї фази лишається
 * окремим рядком меню Профілю (`app/(tabs)/profile/index.tsx`, `MENU_ITEMS`) — саме цей рядок
 * тепер і є єдиним постійним входом. Аудит V1.6.1 (§44 "Пара 5") сам трактує подвійний вхід
 * Home+Профіль як прийнятний (не 🔴), тож прибирання одного з двох — звуження, не втрата
 * функціоналу. `/journal`/`/memory`/`/statistics` — `as unknown as Href` там, де локальний кеш
 * typed routes (`.expo/types/router.d.ts`, не в git) не завжди встигає побачити маршрут до
 * `tsc` (той самий клас питання, що й усюди в цьому файлі).
 *
 * **Оновлено Фазою 17** (HOME REFINEMENT, `docs/HOME_REFINEMENT.md`) — СКЛАД цього масиву НЕ
 * змінено. Завдання Фази 17 називає "Progressive disclosure shortcuts (Journal/Memory/On This
 * Day/Fingerprint)" — прочитано як приклад КАТЕГОРІЇ фіч (глибокі, не для першого відкриття), а
 * не буквальну вимогу замінити "Статистика" на "On This Day"/"Fingerprint": обидва вже мають
 * свій продуманий, задокументований вхід (`/memory` §"Цей день у твоєму читанні", Фаза 16;
 * `/my-reading` → Fingerprint tile, Фаза 15) — заміна "Статистика" тут на будь-який з них тихо
 * скасувала б те рішення без окремого продуктового запиту саме на це ("DO NOT SILENTLY CHANGE
 * PRODUCT BEHAVIOR"). Натомість Фаза 17 реалізує "progressive disclosure" буквально —
 * прогресивне РОЗКРИТТЯ (коли показувати), не переставляння пунктів (що показувати): весь цей
 * рядок ховається для справді порожньої бібліотеки (`isLibraryEmpty`, `HomeScreen` нижче), а не
 * рендериться безумовно для щойно встановленого застосунку — саме це аудит (Розділ 46, FTUE)
 * і фіксує як реальну проблему. */
const HOME_SHORTCUTS: ShortcutItem[] = [
  { icon: 'book-outline', label: 'Мій щоденник', onPress: () => router.push('/journal' as unknown as Href) },
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
 * Вхід до «Що читати далі?» (`app/next-read.tsx`, POLYTSIA V1.6.1, Фаза 14 — RECOMMENDATION
 * CONSOLIDATION, `docs/NEXT_READ.md`) — ОДНА завжди видима картка замість трьох, що стояли тут
 * до цієї фази (`TomorrowEntryPointCard`/`OnePickerEntryPointCard`/`TrendsEntryPointCard`,
 * видалені саме як КОМПОНЕНТИ Home — усі чотири екрани, на які вони вели, і весь їхній
 * алгоритмічний код лишаються повністю незмінними, лише перегруповані на новому проміжному
 * екрані). Той самий "рекомендаційна фіча, не навігаційний ярлик" аргумент, яким Фаза 18
 * виправдала `variant="row"` (а не tile) для попередніх трьох карток, — тепер стосується цієї
 * однієї.
 */
function NextReadEntryPointCard() {
  return (
    // `as unknown as Href` — той самий, уже усталений у цьому файлі прийом: маршрут
    // `app/next-read.tsx` реальний, лише локальний кеш typed routes відстає.
    <QuickAction
      icon="compass-outline"
      label="Що читати далі?"
      description="З твоєї полиці або щось нове — обери й отримай пропозицію"
      onPress={() => router.push('/next-read' as unknown as Href)}
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
 *
 * **Оновлено Фазою 17** (HOME REFINEMENT, не redesign, `docs/HOME_REFINEMENT.md`) — "core Home"
 * вище (Current Reading/Today summary/контекстна картка/порядок розділів) лишається БЕЗ ЗМІН.
 * Ця фаза додає лише progressive disclosure: `HomeShortcuts`/`NextReadEntryPointCard` тепер
 * ховаються для справді порожньої бібліотеки (`isLibraryEmpty` нижче), а не рендеряться
 * безумовно завжди — аудит V1.6.1 (Розділ 46, FTUE) зафіксував, що новий користувач бачив 7+
 * інтерактивних елементів із незнайомою термінологією ("Капсула книги", "TBR reality check")
 * ДО єдиного релевантного для нього CTA внизу екрана. Повне обґрунтування —
 * `docs/HOME_REFINEMENT.md`.
 *
 * **Оновлено Фазою 18** (PROGRESSIVE ONBOARDING, `docs/PROGRESSIVE_ONBOARDING.md`) — дві з трьох
 * контекстних підказок цієї фази рендеряться саме тут: `WelcomeHint` (разом із порожньою
 * бібліотекою) і `FirstSessionHint` (одразу після `TodayStatsRow`, коли `totalSessions === 1`).
 * Третя (пояснення Капсули/Моєї пам'яті після першої завершеної книги) — на
 * `app/completion/[workId].tsx`, не тут.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const { data: activeSession } = useActiveSession();
  const { data: reading } = useLibraryByStatus('reading');
  const { data: allBooks } = useLibraryAll();

  // Фаза 17 (HOME REFINEMENT) — "справді порожня бібліотека" (жодної книги в жодному статусі),
  // а не просто "зараз нічого не читаю" (`showEmptyState` нижче — той самий стан, що й до цієї
  // фази, для користувача з непорожньою бібліотекою). Доки `allBooks` ще не завантажився,
  // `isLibraryEmpty` — `false` (той самий "не показуй нового стану, доки не підтверджено"
  // принцип, що й усюди в застосунку): звичайний Home рендериться як і до цієї фази, і лише
  // коли запит підтвердить 0 книг, екран згортається до фокусованого стану нижче.
  const isLibraryEmpty = allBooks != null && allBooks.length === 0;
  const showEmptyState = !isLibraryEmpty && !activeSession && (!reading || reading.length === 0);

  return (
    <ScreenContainer topInset>
      <AppText variant="display">{getTimeOfDayGreeting()}</AppText>
      <View style={{ height: theme.spacing.xxl }} />

      {/* #1 Current Reading + #2 Continue CTA (кожен рядок — своя дія "продовжити") */}
      <CurrentlyReadingList />

      {/* #3 Today summary */}
      <TodayStatsRow />

      {/* PROGRESSIVE ONBOARDING, Фаза 18 — одразу під тим, що щойно вперше з'явилось. */}
      <FirstSessionHint />

      {/* #4 Одна контекстна картка (ТЗ: "У конкретний момент показуй максимум ОДНУ context
          card... Не показуй 5 одночасно") — уся логіка вибору "яку саме" в
          `useHomeContextCard`/`selectHomeContextCard` (`src/lib/homeContext.ts`), тут лише
          рендер обраного результату чи нічого (`HomeContextCard` сама повертає `null`). Не
          загорнута в `isLibraryEmpty` нижче навмисно — для справді порожньої бібліотеки жоден
          із п'яти кандидатів (`selectHomeContextCard`) і так не спрацює (немає ні активного
          читання, ні капсул, ні цілей, ні TBR), тож картка вже сама повертає `null`. */}
      <View style={{ marginTop: theme.spacing.lg }}>
        <HomeContextCard />
      </View>

      {/* #5 Secondary shortcuts (ТЗ: "Compact shortcuts: Мій щоденник, Моя історія, Моя
          пам'ять, Статистика. Не роби великі cards для кожного.") + рекомендаційний вхід
          (Фаза 14 — RECOMMENDATION CONSOLIDATION, `docs/NEXT_READ.md`). Фаза 17 (HOME
          REFINEMENT) — обидва тепер progressive disclosure: ховаються для справді порожньої
          бібліотеки (`isLibraryEmpty`), де вони вели б лише на порожні/нерелевантні екрани з
          незнайомою користувачу термінологією (аудит §Розділ 46 FTUE) — детально в
          `docs/HOME_REFINEMENT.md`. Для будь-якої НЕпорожньої бібліотеки (навіть якщо зараз
          нічого не читається — TBR-only користувач теж отримує користь із shortcuts/
          рекомендацій) поведінка НЕ змінилась. */}
      {!isLibraryEmpty ? (
        <>
          <View style={{ marginTop: theme.spacing.xl }}>
            <HomeShortcuts />
          </View>

          <View style={{ marginTop: theme.spacing.xl }}>
            <NextReadEntryPointCard />
          </View>
        </>
      ) : null}

      {isLibraryEmpty ? (
        // Фаза 17 (HOME REFINEMENT) — "Empty state для нової бібліотеки з сильним CTA": той
        // самий, уже перевірений сильний CTA, що й порожня Бібліотека
        // (`app/(tabs)/library/index.tsx`, `FILTER_EMPTY_TEXT.all`/"До пошуку" → `/search`),
        // буквально скопійований сюди, а не винайдений заново — тепер новий користувач бачить
        // його одразу на Home, без зайвого проміжного переходу через Бібліотеку лише щоб
        // побачити той самий порожній стан ще раз (аудит §Розділ 46: "CTA не перший елемент на
        // екрані").
        <>
          <WelcomeHint />
          <EmptyState
            title="Бібліотека поки порожня."
            description="Знайди книгу через пошук і додай її сюди з Book Details."
            actionLabel="До пошуку"
            onAction={() => router.push('/search')}
          />
        </>
      ) : showEmptyState ? (
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
