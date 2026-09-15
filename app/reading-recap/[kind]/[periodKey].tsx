import React, { useEffect, useRef } from 'react';
import { View, Pressable } from 'react-native';
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { RecapCardPreview } from '@/components/reading-recap/RecapCardPreview';
import { ShareCardActions } from '@/components/share/ShareCardActions';
import { useTheme } from '@/design/ThemeProvider';
import { useReadingRecap, type RecapFinishedBookRow } from '@/features/reading-recap/useReadingRecap';
import { useShareCard } from '@/features/share/useShareCard';
import { createLogger } from '@/lib/logger';
import { resolveRecapAnchor, type RecapPeriodKind } from '@/lib/readingRecap';

const log = createLogger('app/reading-recap');

/**
 * READING RECAP — POLYTSIA V1.7, Phase 5 (`docs/V1_7_READING_LIFE.md`, ТЗ V1.7 модуль C).
 *
 * ОДИН екран на тиждень і місяць: `kind` — сегмент маршруту. Це не економія файлів, а пряма
 * вимога ТЗ — recap не повинен стати кількома майже однаковими екранами, які з часом розійдуться
 * у формулюваннях і цифрах. Уся різниця між періодами живе в `src/lib/readingRecap.ts`
 * (діапазон, заголовок, слово «попереднього тижня/місяця»), а не в розмітці.
 *
 * Рік сюди не входить — він уже має свій екран (`/wrapped/[year]`); докладніше нижче, біля
 * `RecapScreenKind`.
 *
 * ТЕКСТ — ДЕТЕРМІНОВАНИЙ ШАБЛОН, НЕ ГЕНЕРАЦІЯ (ТЗ §103). Тут немає жодного рядка, складеного на
 * місці: екран лише розкладає готовий `ReadingRecap`, повністю покритий власними тестами.
 *
 * НЕ ДРУГИЙ WRAPPED І НЕ ДРУГА СТАТИСТИКА. Цифри приходять із того самого
 * `computeReadingPeriodSummary`, що й Wrapped, Сезони та Reading Life — див. шапку
 * `src/features/reading-recap/useReadingRecap.ts`.
 *
 * ПОДІЛИТИСЯ — через спільний `useShareCard`/`ShareCardActions` (Phase 5a, ТЗ §13/§98). Саме
 * заради цього екрана консолідація робилась ПЕРЕД ним: четвертої копії `*CardFile.ts` не
 * з'явилось.
 */

/**
 * POLYTSIA V1.7, Phase 6 — РІК СЮДИ НЕ ПОТРАПЛЯЄ. Екран року вже існує (`/wrapped/[year]`), і ТЗ
 * прямо забороняє, щоб Wrapped став паралельною системою поруч із Recap. Тому `kind === 'year'`
 * не рендериться тут узагалі — маршрут перенаправляє на Wrapped, який сам показує Year Recap із
 * того самого `buildReadingRecap`.
 *
 * Чому редирект, а не просто «не додавати посилання»: маршрут, який технічно працює, рано чи
 * пізно отримає посилання — і тоді два екрани відповідатимуть на одне питання, а помітить це
 * хтось нескоро. Редирект робить правило виконуваним, а не побажанням.
 *
 * Сам `kind: 'year'` у двигуні лишається й активно використовується — саме ним Wrapped будує
 * свій recap.
 */
type RecapScreenKind = Exclude<RecapPeriodKind, 'year'>;

const KIND_TITLE: Record<RecapScreenKind, string> = {
  week: 'Підсумок тижня',
  month: 'Підсумок місяця',
};

const SHARE_DIALOG_TITLE: Record<RecapScreenKind, string> = {
  week: 'Мій читацький тиждень',
  month: 'Мій читацький місяць',
};

function isRecapScreenKind(value: string): value is RecapScreenKind {
  return value === 'week' || value === 'month';
}

function FinishedBookRow({ book }: { book: RecapFinishedBookRow }) {
  const theme = useTheme();
  const { userBook } = book;
  const authors = userBook.work.authors.map((author) => author.name).join(', ');

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/work/[workId]',
          params: { workId: userBook.work.id },
        } as unknown as Href)
      }
      accessibilityRole="button"
      accessibilityLabel={userBook.work.title}
    >
      <Card style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
        <CoverThumbnail
          coverUrl={userBook.edition.coverUrl}
          title={userBook.work.title}
          fallbackColor={userBook.work.coverFallbackColor}
          width={40}
          height={58}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="body" style={{ fontWeight: '600' }} numberOfLines={2}>
            {userBook.work.title}
          </AppText>
          {authors ? (
            <AppText variant="caption" color="secondary" numberOfLines={1}>
              {authors}
            </AppText>
          ) : null}
          <AppText variant="caption" color="tertiary">
            {[
              book.status === 'did_not_finish' ? 'Відкладено' : 'Завершено',
              book.runNumber > 1 ? `прочитання №${book.runNumber}` : null,
            ]
              .filter((part): part is string => part != null)
              .join(' · ')}
          </AppText>
        </View>
      </Card>
    </Pressable>
  );
}

export default function ReadingRecapScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ kind: string; periodKey: string }>();
  const rawKind = params.kind ?? '';
  // Сегмент маршруту — недовірений вхід: невідомий `kind` не має ані ламати екран, ані мовчки
  // підставляти «тиждень» замість того, що просили.
  const kind: RecapScreenKind | null = isRecapScreenKind(rawKind) ? rawKind : null;
  const periodKey = params.periodKey ?? '';
  const isYear = rawKind === 'year';

  // Рік живе на Wrapped — див. коментар біля `RecapScreenKind`. `replace`, а не `push`: у стеку
  // не має лишатись екрана, який нічого не показує.
  useEffect(() => {
    if (!isYear) return;
    const parsedYear = resolveRecapAnchor('year', periodKey)?.getFullYear();
    router.replace({
      pathname: '/wrapped/[year]',
      params: { year: String(parsedYear ?? new Date().getFullYear()) },
    } as unknown as Href);
  }, [isYear, periodKey]);

  // При невідомому `kind` (чи при `year`, який іде на Wrapped) ключ навмисно порожній: тоді
  // `resolveRecapAnchor` поверне `null`, і запит не виконається взагалі, замість того щоб
  // порахувати підсумок, який ніхто не побачить.
  const { data, isLoading, isError, refetch } = useReadingRecap(kind ?? 'week', kind ? periodKey : '');
  const cardRef = useRef<View>(null);
  const shareController = useShareCard({
    cardRef,
    dialogTitle: SHARE_DIALOG_TITLE[kind ?? 'week'],
    log,
  });

  const goTo = (nextPeriodKey: string) => {
    if (!kind) return;
    // `replace`, а не `push`: гортання тижнями не має нарощувати стек навігації на десяток
    // екранів, з якого потім треба вибиратись кнопкою «назад».
    router.replace({
      pathname: '/reading-recap/[kind]/[periodKey]',
      params: { kind, periodKey: nextPeriodKey },
    } as unknown as Href);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: kind ? KIND_TITLE[kind] : 'Підсумок',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer scroll>
        {isYear ? (
          // Кадр між рендером і спрацюванням редиректу — не порожній екран і не «помилка».
          <AppText variant="body" color="secondary">
            Відкриваю підсумок року…
          </AppText>
        ) : !kind ? (
          <EmptyState
            title="Невідомий період"
            description="Такого підсумку немає — відкрий його з розділу «Моє читання»."
          />
        ) : isError ? (
          <QueryErrorState onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : (
          <View style={{ gap: theme.spacing.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pressable
                onPress={() => goTo(data.previousKey)}
                accessibilityRole="button"
                accessibilityLabel="Попередній період"
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={22} color={theme.colors.accent} />
              </Pressable>
              <AppText variant="title">{data.recap.title}</AppText>
              {/* Уперед — лише доки наступний період уже почався: у майбутнє гортати нема сенсу,
                  а порожній «наступний тиждень» виглядав би як втрачені дані. */}
              {data.isLatest ? (
                <View style={{ width: 22 }} />
              ) : (
                <Pressable
                  onPress={() => goTo(data.nextKey)}
                  accessibilityRole="button"
                  accessibilityLabel="Наступний період"
                  hitSlop={8}
                >
                  <Ionicons name="chevron-forward" size={22} color={theme.colors.accent} />
                </Pressable>
              )}
            </View>

            <Card style={{ gap: theme.spacing.md }}>
              <AppText variant="heading">{data.recap.headline}</AppText>
              {data.recap.lines.length > 0 ? (
                <View style={{ gap: theme.spacing.xs }}>
                  {data.recap.lines.map((line) => (
                    <AppText key={line.id} variant="body" color="secondary">
                      {line.text}
                    </AppText>
                  ))}
                </View>
              ) : null}
            </Card>

            {data.books.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <SectionHeader title="Книги цього періоду" />
                {data.books.map((book) => (
                  <FinishedBookRow key={book.runId} book={book} />
                ))}
              </View>
            ) : null}

            {/* Порожній період теж можна зберегти чи надіслати — це чесна частина історії, а не
                щось, що варто ховати. */}
            <View style={{ gap: theme.spacing.md }}>
              <SectionHeader title="Картка-поділитися" />
              {/* `collapsable={false}` — обов'язково для Android: без нього нативна оптимізація
                  дерева view може «сплющити» цей вузол, і `captureRef` захопить не те. */}
              <View ref={cardRef} collapsable={false}>
                <RecapCardPreview recap={data.recap} kind={kind} />
              </View>
              <ShareCardActions controller={shareController} />
            </View>
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
