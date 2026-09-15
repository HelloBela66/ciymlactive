import React from 'react';
import { View, Pressable } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/design/ThemeProvider';
import type { ReadingMilestoneView } from '@/features/milestones/useReadingMilestones';
import type { ReadingMilestoneKind } from '@/lib/readingMilestones';

/**
 * POLYTSIA V1.7, Phase 8 — показ віх (ТЗ V1.7 §16, §21, §25, §37).
 *
 * ЩО ТУТ СВІДОМО ВІДСУТНЄ: прогрес-бар, «50 / 100», «до наступної віхи», лічильник зібраних
 * нагород, бронза/срібло/золото, rarity, заблоковані віхи й галерея досягнень (ТЗ §16, §25).
 * Віха — рядок біографії з датою, а не картка в колекції.
 *
 * ІКОНКА — не бейдж. Вона лише допомагає впізнати тип події поглядом; увесь сенс несе текст, і
 * жодна віха не відрізняється від іншої «цінністю» (ТЗ §25, §37: не покладатись лише на
 * декоративну цифру чи колір).
 *
 * ДОСТУПНІСТЬ (ТЗ §37): звичайний текст — отже, Dynamic Type працює без окремої роботи;
 * `accessibilityLabel` рядка читає віху одним осмисленим реченням разом із датою, а не «50 …
 * серпня» трьома розірваними фрагментами.
 */

const KIND_ICON: Record<ReadingMilestoneKind, React.ComponentProps<typeof Ionicons>['name']> = {
  finished_books: 'book-outline',
  reading_hours: 'hourglass-outline',
  first_reread: 'repeat-outline',
  reading_life_anniversary: 'calendar-outline',
};

function formatMilestoneDate(at: string): string {
  return format(new Date(at), 'd MMMM yyyy', { locale: uk });
}

export function MilestoneRow({ view }: { view: ReadingMilestoneView }) {
  const theme = useTheme();
  const { milestone, copy, workId } = view;
  const dateLabel = formatMilestoneDate(milestone.at);
  const label = [copy.title, copy.description, dateLabel].filter(Boolean).join('. ');

  const content = (
    <Card style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start' }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={KIND_ICON[milestone.kind]} size={18} color={theme.colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="body" style={{ fontWeight: '600' }}>
          {copy.title}
        </AppText>
        {copy.description ? (
          <AppText variant="caption" color="secondary">
            {copy.description}
          </AppText>
        ) : null}
        <AppText variant="caption" color="tertiary">
          {dateLabel}
        </AppText>
      </View>
    </Card>
  );

  // Віха про конкретну книгу веде на цю книгу; ювілей нікуди не веде — і не вдає, що веде.
  if (!workId) {
    return <View accessible accessibilityLabel={label}>{content}</View>;
  }

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/work/[workId]', params: { workId } } as unknown as Href)}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {content}
    </Pressable>
  );
}

export function MilestoneList({ views }: { views: ReadingMilestoneView[] }) {
  const theme = useTheme();
  if (views.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {views.map((view) => (
        <MilestoneRow key={view.milestone.id} view={view} />
      ))}
    </View>
  );
}
