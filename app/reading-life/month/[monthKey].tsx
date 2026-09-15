import React from 'react';
import { View, Pressable } from 'react-native';
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ReadingPeriodStats } from '@/components/reading-life/ReadingPeriodStats';
import { useTheme } from '@/design/ThemeProvider';
import {
  useReadingLifeMonth,
  useReadingLifeMonthBooks,
  type ReadingLifeMonthBook,
} from '@/features/reading-life/useReadingLife';
import { parseReadingMonthKey } from '@/lib/readingLife';

/**
 * Місяць читацької історії — POLYTSIA V1.7, Phase 4 (`docs/V1_7_READING_LIFE.md`, ТЗ V1.7 §13).
 * Найглибший рівень навігації Reading Life: рік → МІСЯЦЬ.
 *
 * ДВА ЗАПИТИ, І ЦЕ НАВМИСНО. Цифри приходять із того самого спільного кеш-запису, що й на
 * екрані року (`useReadingLifeMonth` — зріз, не новий запит), тож «скільки я читав у червні»
 * гарантовано збігається з тим, що показав рік. Книги місяця — окремий вузький діапазонний
 * запит (`useReadingLifeMonthBooks`): назви й обкладинки потрібні лише відкритому місяцю, і
 * тягнути їх для всієї історії одразу було б марно.
 *
 * НЕ ДРУГИЙ КАЛЕНДАР. Календар відповідає на «що я робив у конкретний ДЕНЬ»; цей екран — на
 * «яким був цей місяць загалом». ТЗ V1.7 прямо забороняє перепроєктовувати Календар, тож
 * подобової сітки тут немає й не має бути.
 *
 * ОДИН РЯДОК НА ПРОХІД, не на книгу: перечитування підписується «Прочитання №N», а не
 * зливається з першим читанням (ТЗ §25). Книга, прибрана з Бібліотеки після цього місяця, з
 * історії не зникає (History Preservation, §61).
 */

function MonthBookRow({ book }: { book: ReadingLifeMonthBook }) {
  const theme = useTheme();
  const { userBook } = book;
  const authors = userBook.work.authors.map((author) => author.name).join(', ');
  const finishedLabel = book.finishedAt
    ? format(new Date(book.finishedAt), 'd MMMM', { locale: uk })
    : null;

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
              book.status === 'did_not_finish' ? 'Відклав' : 'Завершив',
              finishedLabel,
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

export default function ReadingLifeMonthScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ monthKey: string }>();
  const monthKey = params.monthKey ?? '';
  const parsed = parseReadingMonthKey(monthKey);

  const { month, isLoading, isError, refetch } = useReadingLifeMonth(monthKey);
  const books = useReadingLifeMonthBooks(monthKey);

  const title = parsed
    ? format(new Date(parsed.year, parsed.month - 1, 1), 'LLLL yyyy', { locale: uk })
    : 'Місяць';

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title,
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer scroll>
        {isError ? (
          <QueryErrorState onRetry={refetch} />
        ) : isLoading ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : !month ? (
          <EmptyState
            title="Цього місяця в історії немає"
            description="У цьому місяці не записано жодного читання, запису чи завершеної книги."
          />
        ) : (
          <View style={{ gap: theme.spacing.xl }}>
            <Card style={{ gap: theme.spacing.md }}>
              <AppText variant="caption" color="tertiary">
                Підсумок місяця
              </AppText>
              <ReadingPeriodStats summary={month.summary} />
            </Card>

            {/* Книги вантажаться окремим запитом, тож можуть з'явитися трохи пізніше за цифри
                — порожнього блоку при цьому не показуємо, лише коли запит уже завершився. */}
            {books.data && books.data.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <SectionHeader title="Дочитано цього місяця" />
                {books.data.map((book) => (
                  <MonthBookRow key={book.runId} book={book} />
                ))}
              </View>
            ) : null}
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
