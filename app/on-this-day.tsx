import React from 'react';
import { Pressable, View } from 'react-native';
import { Stack, router, type Href } from 'expo-router';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { JournalPreview } from '@/components/ui/JournalPreview';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useTheme } from '@/design/ThemeProvider';
import { useOnThisDay } from '@/features/on-this-day/useOnThisDay';
import { pluralizeUk } from '@/lib/pluralizeUk';
import type { OnThisDayMemory, OnThisDayYearGroup } from '@/types/onThisDay';

const BOOK_FORMS = ['книгу', 'книги', 'книг'] as const;

function openBook(workId: string) {
  // П.9 ТЗ: "Tap на cover/title відкриває existing Book Details або Book Memory" — тут навмисно
  // завжди Book Details (`/work/[workId]`), не окремий per-memory вибір "Book Memory замість":
  // Book Details — єдине місце застосунку, де й так уже видно історію читання/щоденник САМЕ
  // цієї книги (Фаза 2, `ReadingHistorySection`/`JournalSection`), тож жоден viewer тут не
  // дублюється, і немає потреби на N окремих запитів "чи існує Book Memory" лише заради цього
  // екрана (п.22 ТЗ — Full screen не повинен вимагати зайвих запитів на масштабі 5000+ записів).
  router.push({ pathname: '/work/[workId]', params: { workId } } as unknown as Href);
}

function MemoryCard({ memory }: { memory: OnThisDayMemory }) {
  const theme = useTheme();

  const facts: string[] = [];
  if (memory.sessionDurationMinutes) facts.push(`${memory.sessionDurationMinutes} хв читання`);
  if (memory.sessionPagesRead) facts.push(`${memory.sessionPagesRead} стор.`);

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <Pressable onPress={() => openBook(memory.workId)} accessibilityRole="button" accessibilityLabel={memory.bookTitle}>
        <JournalPreview title={memory.bookTitle} coverUrl={memory.coverUrl} coverFallbackColor={memory.coverFallbackColor}>
          {facts.length > 0 ? (
            <AppText variant="caption" color="secondary">
              {facts.join(' • ')}
            </AppText>
          ) : null}
          {memory.started ? (
            <AppText variant="caption" color="tertiary">
              Ти почав читати цю книгу
            </AppText>
          ) : null}
          {memory.finished ? (
            <AppText variant="caption" color="tertiary">
              Ти завершив цю книгу{memory.ratingValue != null ? ` · ${memory.ratingValue}★` : ''}
            </AppText>
          ) : null}
        </JournalPreview>
      </Pressable>

      {memory.journalEntries.length > 0 ? (
        <View style={{ gap: theme.spacing.xs }}>
          {memory.journalEntries.map((entry) =>
            entry.hidden ? (
              <AppText key={entry.id} variant="caption" color="tertiary" style={{ fontStyle: 'italic' }}>
                Спогад приховано, щоб не забігати наперед.
              </AppText>
            ) : (
              // Той самий viewer, що й для обкладинки/назви вище (`openBook`) — окремого
              // "переглядача запису щоденника" в застосунку немає (`app/journal/index.tsx` —
              // глобальна стрічка без per-entry маршруту), тож тап так само веде на Book
              // Details цієї книги, де запис і так видно (`JournalSection`, Фаза 2).
              <Pressable key={entry.id} onPress={() => openBook(memory.workId)} accessibilityRole="button">
                <AppText variant="caption" color="tertiary" numberOfLines={3} style={{ fontStyle: 'italic' }}>
                  «{entry.text}»
                </AppText>
              </Pressable>
            ),
          )}
        </View>
      ) : null}
    </Card>
  );
}

function YearSection({ group }: { group: OnThisDayYearGroup }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <SectionHeader
        layout="inline"
        title={String(group.year)}
        trailing={
          <AppText variant="caption" color="tertiary">
            {group.yearsAgo === 1 ? 'рік тому' : `${group.yearsAgo} ${pluralizeUk(group.yearsAgo, ['рік', 'роки', 'років'] as const)} тому`}
          </AppText>
        }
      />
      {group.memories.length > 1 ? (
        <AppText variant="caption" color="secondary">
          Цього дня ти читав {group.memories.length} {pluralizeUk(group.memories.length, BOOK_FORMS)}
        </AppText>
      ) : null}
      <View style={{ gap: theme.spacing.sm }}>
        {group.memories.map((memory) => (
          <MemoryCard key={memory.key} memory={memory} />
        ))}
      </View>
    </View>
  );
}

/**
 * «Цей день» (POLYTSIA V1.6, Фаза 3) — повний перелік спогадів за сьогоднішню календарну дату,
 * згрупований по роках (найближчий минулий рік — перший, п.7 ТЗ). Той самий `useOnThisDay`, що
 * й Home-картка (`OnThisDayCard`) — той самий кеш, ніякого повторного запиту до БД при переході
 * з Home сюди.
 */
export default function OnThisDayScreen() {
  const theme = useTheme();
  const { data: summary, isLoading } = useOnThisDay();
  const today = new Date();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.xl }}>
          <AppText variant="title">Цей день</AppText>
          <AppText variant="body" color="secondary">
            {format(today, 'd MMMM', { locale: uk })}
          </AppText>
        </View>

        {isLoading ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : !summary || summary.groups.length === 0 ? (
          // П.19 ТЗ — навпряму відкритий маршрут БЕЗ жодного спогаду: єдиний випадок, коли цей
          // екран показує явне порожнє повідомлення (Home натомість просто не рендерить картку
          // взагалі). Без CTA — "природного сенсу" немає (п.19 ТЗ).
          <EmptyState title="Цього дня у твоїй читацькій історії поки немає спогадів." />
        ) : (
          <View style={{ gap: theme.spacing.xxl }}>
            {summary.groups.map((group) => (
              <YearSection key={group.year} group={group} />
            ))}
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
