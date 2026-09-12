import React from 'react';
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { JournalPreview } from '@/components/ui/JournalPreview';
import { useTheme } from '@/design/ThemeProvider';
import { useOnThisDay } from '@/features/on-this-day/useOnThisDay';
import { selectHomePrimaryMemory } from '@/lib/onThisDay';
import { pluralizeUk } from '@/lib/pluralizeUk';
import type { OnThisDayMemory } from '@/types/onThisDay';

const YEAR_FORMS = ['рік', 'роки', 'років'] as const;
const BOOK_FORMS = ['книгу', 'книги', 'книг'] as const;
const MEMORY_FORMS = ['спогад', 'спогади', 'спогадів'] as const;

function yearsAgoLabel(yearsAgo: number): string {
  return yearsAgo === 1 ? 'Рік тому цього дня' : `${yearsAgo} ${pluralizeUk(yearsAgo, YEAR_FORMS)} тому цього дня`;
}

/** Один рядок "що сталося" на primary-картці — сесія (якщо є дані), інакше факт
 * старту/фінішу (п.3, п.7 ТЗ: "не залишай порожні placeholders", тому рівно одне з трьох). */
function primaryMetaLine(memory: OnThisDayMemory): string | null {
  const parts: string[] = [];
  if (memory.sessionDurationMinutes) parts.push(`${memory.sessionDurationMinutes} хв читання`);
  if (memory.sessionPagesRead) parts.push(`${memory.sessionPagesRead} стор.`);
  if (parts.length > 0) return parts.join(' • ');
  if (memory.finished) return 'Ти завершив цю книгу';
  if (memory.started) return 'Ти почав читати цю книгу';
  return null;
}

/**
 * Home-картка «Цей день у твоєму читанні» (POLYTSIA V1.6, Фаза 3) — контекстна: показується
 * ЛИШЕ коли для сьогоднішньої календарної дати є хоч один спогад з попереднього року чи
 * раніше (п.1, п.19 ТЗ — інакше не рендерить НІЧОГО, навіть порожній блок). Щонайбільше ОДНА
 * компактна картка з одним preview — повний перелік по роках відкривається окремим екраном
 * (`app/on-this-day.tsx`), не тут (п.5–6 ТЗ: "Home має залишатися спокійним", без каруселі).
 *
 * Наразі Home не має єдиного "покажи щонайбільше одну контекстну картку" механізму (жодна з
 * конкуруючих п.18 ТЗ фіч — stale reading/capsule/goal/TBR — ще не існує в цьому мілстоуні), тож
 * ця картка просто додається до вже наявної послідовності Home, а не конкурує за єдиний слот
 * (`app/(tabs)/index.tsx`).
 */
export function OnThisDayCard() {
  const theme = useTheme();
  const { data: summary } = useOnThisDay();
  if (!summary) return null;

  const selection = selectHomePrimaryMemory(summary);
  if (!selection) return null;
  const { primary, moreCount, booksReadCount } = selection;

  const metaLine = primaryMetaLine(primary);
  const journalEntry = primary.journalEntries.find((e) => !e.hidden) ?? primary.journalEntries[0] ?? null;

  return (
    <Pressable
      onPress={() => router.push('/on-this-day' as unknown as Href)}
      accessibilityRole="button"
      accessibilityLabel={`${yearsAgoLabel(primary.yearsAgo)}: ${primary.bookTitle}`}
    >
      <Card style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          <Ionicons name="time-outline" size={16} color={theme.colors.accent} />
          <AppText variant="caption" color="accent">
            {yearsAgoLabel(primary.yearsAgo)}
          </AppText>
        </View>

        <JournalPreview title={primary.bookTitle} coverUrl={primary.coverUrl} coverFallbackColor={primary.coverFallbackColor}>
          {metaLine ? (
            <AppText variant="caption" color="secondary">
              {metaLine}
            </AppText>
          ) : null}
          {journalEntry ? (
            journalEntry.hidden ? (
              <AppText variant="caption" color="tertiary" style={{ fontStyle: 'italic' }}>
                Спогад приховано, щоб не забігати наперед.
              </AppText>
            ) : (
              <AppText variant="caption" color="tertiary" numberOfLines={2} style={{ fontStyle: 'italic' }}>
                Тоді ти зберіг: «{journalEntry.text}»
              </AppText>
            )
          ) : null}
        </JournalPreview>

        {booksReadCount > 1 ? (
          <AppText variant="micro" color="tertiary">
            Цього дня ти читав {booksReadCount} {pluralizeUk(booksReadCount, BOOK_FORMS)}
          </AppText>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <AppText variant="caption" color="accent">
            Згадати
          </AppText>
          {moreCount > 0 ? (
            <AppText variant="caption" color="secondary">
              Ще {moreCount} {pluralizeUk(moreCount, MEMORY_FORMS)}
            </AppText>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}
