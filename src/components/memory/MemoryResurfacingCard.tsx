import React from 'react';
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/design/ThemeProvider';
import { formatMemoryResurfacingCopy } from '@/lib/memoryResurfacingCopy';
import type { MemoryResurfacingCandidate, MemoryResurfacingKind } from '@/lib/memoryResurfacing';

/**
 * POLYTSIA V1.7, Phase 9 — спогад як картка (ТЗ модуль E §25, §26, §34).
 *
 * ОДИН компонент на ОБИДВІ поверхні (Home і Memory Hub) — щоб той самий спогад не мав двох
 * різних облич і двох різних формулювань. Текст будує `formatMemoryResurfacingCopy`, тут лише
 * розкладка.
 *
 * ЩО ТУТ СВІДОМО ВІДСУТНЄ: «Продовжити читати», лічильник днів без читання, будь-яке «час
 * повернутися» (ТЗ §24, §25, §26). Дія веде В СПОГАД, а не вимагає читати.
 *
 * ДОСТУПНІСТЬ (ТЗ §34): `accessibilityLabel` читає спогад одним осмисленим реченням разом із
 * дією; уся вага в тексті, іконка лише допомагає впізнати вид події поглядом. Звичайний
 * `AppText` — отже, Dynamic Type працює без окремої роботи; кольори — з теми, тож темний режим
 * теж. Область дотику — уся картка, що значно більше за 44×44.
 */

const KIND_ICON: Record<MemoryResurfacingKind, React.ComponentProps<typeof Ionicons>['name']> = {
  journal_memory: 'chatbubble-ellipses-outline',
  book_memory: 'book-outline',
  reading_relationship: 'infinite-outline',
  past_period: 'calendar-outline',
};

/**
 * Куди веде спогад. Кожен вид — у вже наявний історичний екран, жодного нового: думка веде до
 * книги, стосунок і завершене прочитання — у «Мою історію з книгою» (Phase 2), період — у
 * вже існуючий Recap (ТЗ §3D: resurfacing лише ВЕДЕ до артефакту, не робить його копію).
 */
function destinationOf(candidate: MemoryResurfacingCandidate): Href | null {
  switch (candidate.kind) {
    case 'journal_memory':
      return candidate.workId != null
        ? ({ pathname: '/work/[workId]', params: { workId: candidate.workId } } as unknown as Href)
        : null;
    case 'book_memory':
    case 'reading_relationship':
      return candidate.workId != null
        ? ({ pathname: '/book-history/[workId]', params: { workId: candidate.workId } } as unknown as Href)
        : null;
    case 'past_period':
      return candidate.periodKey != null && candidate.periodKind != null
        ? ({
            pathname: '/reading-recap/[kind]/[periodKey]',
            params: { kind: candidate.periodKind, periodKey: candidate.periodKey },
          } as unknown as Href)
        : null;
  }
}

export function MemoryResurfacingRow({
  candidate,
  now,
  trailing,
}: {
  candidate: MemoryResurfacingCandidate;
  now: Date;
  /** Кнопка приховання на Home; у Memory Hub її немає — там людина прийшла сама. */
  trailing?: React.ReactNode;
}) {
  const theme = useTheme();
  const copy = formatMemoryResurfacingCopy(candidate, now);
  const destination = destinationOf(candidate);
  const label = [copy.title, copy.description, copy.cta].filter(Boolean).join('. ');

  const content = (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          <Ionicons name={KIND_ICON[candidate.kind]} size={16} color={theme.colors.accent} />
          <AppText variant="caption" color="accent">
            Із твоєї читацької історії
          </AppText>
        </View>
        {trailing}
      </View>

      <AppText variant="body" style={{ fontWeight: '600' }}>
        {copy.title}
      </AppText>

      {/* Сам текст думки/цитати — головне, заради чого спогад показують. Обрізається до трьох
          рядків: картка на головній не повинна перетворитись на сторінку щоденника. */}
      {candidate.text ? (
        <AppText variant="body" color="secondary" numberOfLines={3}>
          {candidate.text}
        </AppText>
      ) : null}

      {copy.description ? (
        <AppText variant="caption" color="tertiary">
          {copy.description}
        </AppText>
      ) : null}

      {destination ? (
        <AppText variant="caption" color="accent">
          {copy.cta}
        </AppText>
      ) : null}
    </Card>
  );

  if (!destination) {
    return (
      <View accessible accessibilityLabel={label}>
        {content}
      </View>
    );
  }

  return (
    <Pressable onPress={() => router.push(destination)} accessibilityRole="button" accessibilityLabel={label}>
      {content}
    </Pressable>
  );
}

export function MemoryResurfacingList({
  candidates,
  now,
}: {
  candidates: MemoryResurfacingCandidate[];
  now: Date;
}) {
  const theme = useTheme();
  if (candidates.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {candidates.map((candidate) => (
        <MemoryResurfacingRow key={candidate.semanticKey} candidate={candidate} now={now} />
      ))}
    </View>
  );
}
