import React, { useMemo, useState } from 'react';
import { View, Pressable, useWindowDimensions } from 'react-native';
import { addMonths, subMonths, format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { CalendarBookStack } from '@/components/calendar/CalendarBookStack';
import { useTheme } from '@/design/ThemeProvider';
import { buildMonthGrid, type CalendarDay } from '@/lib/calendarGrid';
import { formatCompactDuration, formatDurationForAccessibility } from '@/lib/calendarFormat';
import { pluralizeUk } from '@/lib/pluralizeUk';
import { useMonthCalendarData, useMonthSummary, type DayCalendarStats } from '@/features/calendar/useCalendarSessions';
import type { DayIntensityLevel } from '@/lib/calendarIntensity';

const WEEKDAY_LABELS_MON_FIRST = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const DAY_KEY_FORMAT = 'yyyy-MM-dd';

const BOOK_FORMS = ['книга', 'книги', 'книг'] as const;
const PAGE_FORMS = ['сторінка', 'сторінки', 'сторінок'] as const;
const DAY_FORMS = ['день', 'дні', 'днів'] as const;

/** Одна межа "вузького екрана" для всього дня-клітинки (Фаза 19) — той самий дух, що й
 * `useWindowDimensions`-обчислення в `app/(tabs)/library/index.tsx`'s `GRID_COLUMNS`: клітинка
 * сама по собі вже адаптивна (`width: '${100/7}%'`), але фіксований розмір ОБКЛАДИНКИ всередині
 * — ні, тож цей екран рахує його від фактичної ширини екрана, а не хардкодить один розмір. */
function computeCoverSize(windowWidth: number, horizontalPadding: number): number {
  const cellWidth = (windowWidth - horizontalPadding * 2) / 7;
  return Math.round(Math.max(20, Math.min(34, cellWidth - 16)));
}

/**
 * Обмеження масштабування дня-числа всередині круглих бейджів дня (POLYTSIA V1.6.1, Фаза 22,
 * `docs/A11Y_LARGE_TEXT_AUDIT.md`) — на відміну від shareable-карток (`CardPreviewText`, повне
 * вимкнення масштабування, бо це зображення фіксованого формату), тут звичайний живий екран:
 * повне вимкнення зменшило б доступність без потреби. Бейдж — фіксоване коло (`width`/`height`
 * рівні, щоб лишитись колом, не овалом при рості тексту) — 1-2-значне число саме по собі несе
 * мало інформації для читача екрана (повна дата/інтенсивність/назва книги вже в
 * `accessibilityLabel` клітинки), тож досить часткового обмеження (не повного вимкнення), яке
 * лишає число читабельним, не даючи йому візуально вилізти за межі кола при найбільших
 * системних розмірах шрифту. Та сама межа перевикористана для "+N"/start-finish бейджів
 * ВІЗУАЛЬНОЇ КОМПОЗИЦІЇ (пост-Фаза 19) — той самий клас елемента (маленький бейдж поверх
 * обкладинки), не нове рішення.
 */
const DAY_BADGE_MAX_FONT_SCALE = 1.2;

/** Наскільки більший стек (primary+secondary) за саму обкладинку — для розміру today-рамки
 * навколо стеку (ВІЗУАЛЬНА КОМПОЗИЦІЯ, пост-Фаза 19) — та сама частка, що й `CalendarBookStack`'s
 * `SECONDARY_OFFSET_RATIO` (не імпортується напряму: компонент навмисно не експортує внутрішні
 * константи компонування, лише свій публічний проп-контракт; дублювання одного числа тут
 * дешевше за розширення публічного API компонента заради суто візуального розрахунку рамки
 * навколо нього). */
const STACK_SECONDARY_OFFSET_RATIO = 0.3;

function intensityLabel(intensity: DayIntensityLevel): string {
  if (intensity === 0) return 'без читання';
  if (intensity === 1) return 'невелика активність читання';
  if (intensity === 2) return 'середня активність читання';
  return 'висока активність читання';
}

/**
 * ВІЗУАЛЬНА КОМПОЗИЦІЯ (пост-Фаза 19) — повний текстовий опис клітинки дня для читача екрана:
 * дата, скільки книг (лише коли 2+, ТЗ приклад "Читав 2 книги" — один-книжний день і так
 * повністю описаний назвою книги нижче, без потреби в граматично складнішій формі "1 книгу"),
 * тривалість ПОВНИМИ словами (`formatDurationForAccessibility`, не скорочене "1 год 12 хв" —
 * читач екрана може вимовити скорочення незрозуміло), сторінки, головна книга, і нарешті
 * почав/завершив — той самий "повний текст лише в описі, tiny-позначка лише візуально" принцип,
 * що й ТЗ вимагає для самої клітинки.
 */
function buildDayAccessibilityLabel(day: CalendarDay, stats: DayCalendarStats | undefined): string {
  const dateLabel = format(day.date, 'd MMMM', { locale: uk });
  const totalBooksCount = stats?.primaryUserBook
    ? 1 + (stats.secondaryUserBook ? 1 : 0) + stats.additionalBookCount
    : 0;

  const parts: string[] = [`${dateLabel}.`];

  if (totalBooksCount === 0 && !stats?.hasStartedBook && !stats?.hasFinishedBook) {
    parts.push(`${intensityLabel(0).charAt(0).toUpperCase()}${intensityLabel(0).slice(1)}.`);
  } else {
    if (totalBooksCount >= 2) {
      parts.push(`Читав ${totalBooksCount} ${pluralizeUk(totalBooksCount, BOOK_FORMS)}.`);
    }
    if (stats && stats.totalMinutes > 0) {
      parts.push(`${formatDurationForAccessibility(stats.totalMinutes)}.`);
    }
    if (stats && stats.totalPages > 0) {
      parts.push(`${stats.totalPages} ${pluralizeUk(stats.totalPages, PAGE_FORMS)}.`);
    }
    if (stats?.primaryUserBook) {
      parts.push(`Найбільше — «${stats.primaryUserBook.work.title}».`);
    }
  }

  // Обидва траплялись того самого дня (книга прочитана в один сеанс) — вкрай рідко, "завершив"
  // важливіша віха, показуємо лише її (ТЗ: "tiny" — одна позначка, не дві одночасно).
  if (stats?.hasFinishedBook) parts.push('Завершив читання.');
  else if (stats?.hasStartedBook) parts.push('Почав читати.');

  return parts.join(' ');
}

/**
 * КАЛЕНДАР 2.0 (POLYTSIA V1.6.1, Фаза 19) + ВІЗУАЛЬНА КОМПОЗИЦІЯ ТА REDESIGN ДНЯ ЧИТАННЯ
 * (пост-Фаза 19, `docs/CALENDAR_2_0.md` §"Visual Day Composition") — місяць-сітка, де день з
 * активністю показує "візуальну історію читання того дня" (cover-стек `CalendarBookStack`,
 * компактна метрика часу, тонкий інтенсивність-індикатор), а не таблицю чисел. Підсумок
 * місяця й "Найчастіше цього місяця" — під сіткою. Тап на день відкриває Day Details
 * (`app/day/[date].tsx`), тепер "день читання" (докладніше — коментар над тим файлом).
 */
export default function CalendarScreen() {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());

  // `week_start` (`app_settings.week_start`) і далі НЕ підключено до `weekStartsOn` (свідоме
  // рішення Фази 19, підтверджене цією фазою — докладніше `docs/CALENDAR_2_0.md` §"Свідомо НЕ
  // зроблено"): колонка існує в схемі, але немає жодного repository-методу читання/UI
  // налаштувань для неї (перевірено цією фазою: `AppSettingsRepository` не має жодного
  // `getWeekStart`/`setWeekStart`) — підключення вимагало б будувати цю власну UI-фічу
  // налаштувань "з нуля", якої ані ТЗ цієї фази, ані попередньої не називає. Це ВІЗУАЛЬНА
  // композиція дня-клітинки, не нова фіча налаштувань — поза обсягом, той самий "не вигадуй
  // нову фічу заради суміжної згадки в ТЗ" принцип.
  const days = useMemo(() => buildMonthGrid(monthAnchor, 1), [monthAnchor]);
  const { data: dayStatsByKey } = useMonthCalendarData(days);
  const { data: monthSummary } = useMonthSummary(monthAnchor);
  const monthLabel = useMemo(() => format(monthAnchor, 'LLLL yyyy', { locale: uk }), [monthAnchor]);
  const coverSize = useMemo(
    () => computeCoverSize(windowWidth, theme.spacing.lg),
    [windowWidth, theme.spacing.lg],
  );

  const hasAnyMonthActivity =
    !!monthSummary &&
    (monthSummary.activeDaysCount > 0 || monthSummary.booksFinishedCount > 0 || monthSummary.topBooks.length > 0);

  return (
    <ScreenContainer topInset>
      <AppText variant="title">Календар</AppText>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: theme.spacing.lg,
          marginBottom: theme.spacing.md,
        }}
      >
        <MonthNavButton icon="chevron-back" onPress={() => setMonthAnchor((d) => subMonths(d, 1))} />
        <AppText variant="heading" style={{ textTransform: 'capitalize' }}>
          {monthLabel}
        </AppText>
        <MonthNavButton icon="chevron-forward" onPress={() => setMonthAnchor((d) => addMonths(d, 1))} />
      </View>

      <View style={{ flexDirection: 'row' }}>
        {WEEKDAY_LABELS_MON_FIRST.map((label) => (
          <View key={label} style={{ flex: 1, alignItems: 'center', paddingVertical: theme.spacing.xs }}>
            <AppText variant="micro" color="tertiary">
              {label}
            </AppText>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {days.map((day) => {
          const dayKey = format(day.date, DAY_KEY_FORMAT);
          // Та сама межа маскування, що й до цієї фази: `intensity` (і тепер accessibility-опис)
          // рахуються з РЕАЛЬНИХ (немаскованих) даних навіть для днів сусіднього місяця в сітці
          // (бляклі крапки насиченості для контексту), лише візуальна обкладинка/стек/tiny-
          // позначки замасковані до `null`/`false` для клітинок поза поточним місяцем — не нова
          // поведінка цієї фази, перенесено як є з попередньої версії екрана.
          const stats = dayStatsByKey?.get(dayKey);
          const intensity = stats?.intensity ?? 0;
          const primaryUserBook = day.inCurrentMonth ? stats?.primaryUserBook ?? null : null;
          const secondaryUserBook = day.inCurrentMonth ? stats?.secondaryUserBook ?? null : null;
          const additionalBookCount = day.inCurrentMonth ? stats?.additionalBookCount ?? 0 : 0;
          const hasStartedBook = day.inCurrentMonth ? !!stats?.hasStartedBook : false;
          const hasFinishedBook = day.inCurrentMonth ? !!stats?.hasFinishedBook : false;
          const showStartFinishMark = hasStartedBook || hasFinishedBook;
          const startFinishIcon = hasFinishedBook ? 'flag' : 'play';

          const stackSize = coverSize + (secondaryUserBook ? Math.round(coverSize * STACK_SECONDARY_OFFSET_RATIO) : 0);
          const ringSize = stackSize + 4;

          return (
            <Pressable
              key={day.date.toISOString()}
              onPress={() => router.push({ pathname: '/day/[date]', params: { date: dayKey } })}
              accessibilityRole="button"
              accessibilityLabel={buildDayAccessibilityLabel(day, stats)}
              style={{
                width: `${100 / 7}%`,
                aspectRatio: 1,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: day.inCurrentMonth ? 1 : 0.4,
              }}
            >
              {primaryUserBook ? (
                <View
                  style={{
                    width: ringSize,
                    height: ringSize,
                    borderRadius: theme.radius.sm + 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: day.isToday ? 2 : 0,
                    borderColor: theme.colors.accent,
                  }}
                >
                  <CalendarBookStack
                    primary={{
                      coverUrl: primaryUserBook.edition.coverUrl,
                      title: primaryUserBook.work.title,
                      fallbackColor: primaryUserBook.work.coverFallbackColor,
                    }}
                    secondary={
                      secondaryUserBook
                        ? {
                            coverUrl: secondaryUserBook.edition.coverUrl,
                            title: secondaryUserBook.work.title,
                            fallbackColor: secondaryUserBook.work.coverFallbackColor,
                          }
                        : null
                    }
                    additionalCount={additionalBookCount}
                    size={coverSize}
                  />
                  <View
                    style={{
                      position: 'absolute',
                      top: -6,
                      left: -6,
                      minWidth: 18,
                      height: 18,
                      paddingHorizontal: 3,
                      borderRadius: 9,
                      backgroundColor: theme.colors.surfaceRaised,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AppText variant="micro" color="secondary" maxFontSizeMultiplier={DAY_BADGE_MAX_FONT_SCALE}>
                      {day.date.getDate()}
                    </AppText>
                  </View>
                  {showStartFinishMark ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: -6,
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: theme.colors.surfaceRaised,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name={startFinishIcon} size={9} color={theme.colors.accent} />
                    </View>
                  ) : null}
                </View>
              ) : (
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: theme.radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: day.isToday ? theme.colors.accent : 'transparent',
                  }}
                >
                  <AppText
                    variant="body"
                    color={day.isToday ? 'onAccent' : day.inCurrentMonth ? 'primary' : 'tertiary'}
                    maxFontSizeMultiplier={DAY_BADGE_MAX_FONT_SCALE}
                  >
                    {day.date.getDate()}
                  </AppText>
                  {showStartFinishMark ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: theme.colors.surfaceRaised,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name={startFinishIcon} size={8} color={theme.colors.accent} />
                    </View>
                  ) : null}
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 2, marginTop: 3, height: 4 }}>
                {intensity > 0
                  ? Array.from({ length: intensity }).map((_, index) => (
                      <View
                        key={index}
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: theme.colors.accent,
                        }}
                      />
                    ))
                  : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {hasAnyMonthActivity && monthSummary ? (
        <>
          <Card style={{ marginTop: theme.spacing.lg, gap: theme.spacing.xs }}>
            <AppText variant="heading">Підсумок місяця</AppText>
            <AppText variant="body" color="secondary">
              {monthSummary.activeDaysCount} {pluralizeUk(monthSummary.activeDaysCount, DAY_FORMS)} читання
              {' · '}
              {formatCompactDuration(monthSummary.totalMinutes)}
              {' · '}
              {monthSummary.totalPages} {pluralizeUk(monthSummary.totalPages, PAGE_FORMS)}
            </AppText>
            {monthSummary.booksFinishedCount > 0 ? (
              <AppText variant="caption" color="tertiary">
                Завершено книг: {monthSummary.booksFinishedCount}
              </AppText>
            ) : null}
          </Card>

          {monthSummary.topBooks.length > 0 ? (
            <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
              <AppText variant="heading">Найчастіше цього місяця</AppText>
              <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                {monthSummary.topBooks.map((top) => (
                  <Pressable
                    key={top.userBook.id}
                    onPress={() => router.push({ pathname: '/work/[workId]', params: { workId: top.userBook.work.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={`${top.userBook.work.title}, ${formatDurationForAccessibility(top.totalMinutes)} цього місяця`}
                    style={{ flex: 1, alignItems: 'center', gap: 4 }}
                  >
                    <CoverThumbnail
                      coverUrl={top.userBook.edition.coverUrl}
                      title={top.userBook.work.title}
                      fallbackColor={top.userBook.work.coverFallbackColor}
                      width={48}
                      height={68}
                    />
                    <AppText variant="caption" numberOfLines={2} style={{ textAlign: 'center' }}>
                      {top.userBook.work.title}
                    </AppText>
                    <AppText variant="micro" color="tertiary">
                      {formatCompactDuration(top.totalMinutes)}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}
        </>
      ) : (
        <View style={{ marginTop: theme.spacing.xl, alignItems: 'center' }}>
          <AppText variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
            Цього місяця ще немає читання.
          </AppText>
        </View>
      )}
    </ScreenContainer>
  );
}

function MonthNavButton({ icon, onPress }: { icon: 'chevron-back' | 'chevron-forward'; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={icon === 'chevron-back' ? 'Попередній місяць' : 'Наступний місяць'}
      onPress={onPress}
      hitSlop={8}
      style={{
        width: theme.minTouchTarget,
        height: theme.minTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={22} color={theme.colors.textSecondary} />
    </Pressable>
  );
}
