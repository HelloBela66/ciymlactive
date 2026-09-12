import React, { useState } from 'react';
import { View, Pressable, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Timeline, TIMELINE_MARKER_SIZE } from '@/components/ui/Timeline';
import { useTheme } from '@/design/ThemeProvider';
import { useAllNoteCategories } from '@/features/notes/useNoteCategories';
import { resolveEntryTypeLabel, categoriesToMap } from '@/lib/journalEntryLabel';
import { computeJournalTimelineMarkers, type TimelineMarker, type TimelineMarkerCategory } from '@/lib/journalTimeline';
import type { JournalEntry } from '@/types/journalEntry';

/**
 * ТЗ Фази 10 (JOURNAL MEMORY TIMELINE) — візуальна шкала 0-100% книги на Book Memory screen
 * (`app/memory/[workId].tsx`) з маркерами записів щоденника. Уся позиційна/групувальна логіка
 * — у `src/lib/journalTimeline.ts` (чистa функція, покрита `journalTimeline.test.ts`); цей
 * компонент лише рендерить її результат і відповідає за tap→preview (ТЗ: "Tap marker →
 * entry detail/preview"). "Хребет" шкали (картка/заголовок/рейка/підписи країв) — спільний з
 * `ReadingExperienceTimeline` компонент `Timeline` (ТЗ Фази 19, DESIGN SYSTEM EXTENSION); тут
 * лишається лише форма маркера й поведінка тапу (модалка з усіма записами позиції).
 *
 * Іконка різна за категорією, але КОЛІР одна й та сама (`theme.colors.accent`) для всіх —
 * навмисно, не "по кольору на категорію": UI-палітра застосунку свідомо нейтральна
 * (`src/design/tokens.ts`, шапка файлу), обкладинки книг лишаються єдиним "кольоровим"
 * елементом; розрізнення категорій — через форму іконки, не додатковий колірний код.
 */
const CATEGORY_ICON: Record<TimelineMarkerCategory, keyof typeof Ionicons.glyphMap> = {
  favorite: 'heart',
  quote: 'chatbox-outline',
  moment: 'flash-outline',
  thought: 'bulb-outline',
};

interface JournalTimelineProps {
  entries: JournalEntry[];
  pageCount: number | null;
  userBookId: string | undefined;
}

export function JournalTimeline({ entries, pageCount, userBookId }: JournalTimelineProps) {
  const theme = useTheme();
  const { data: categories } = useAllNoteCategories(userBookId);
  const categoriesById = categoriesToMap(categories);
  const [openMarker, setOpenMarker] = useState<TimelineMarker | null>(null);

  const markers = computeJournalTimelineMarkers(entries, pageCount);

  // Записів без визначеної позиції (ні `progressPercent`, ні `page`+`pageCount`) шкала не
  // показує — ТЗ: "Timeline є supplementary visualization. Основний journal list залишається."
  // Тобто немає чого малювати — не помилка, просто ще нема даних для шкали цієї книги.
  if (markers.length === 0) return null;

  return (
    <>
      <Timeline heading="Шкала щоденника" startLabel="0%" endLabel="100%">
        {markers.map((marker) => (
          <MarkerDot key={marker.percent} marker={marker} onPress={() => setOpenMarker(marker)} />
        ))}
      </Timeline>

      <Modal
        visible={openMarker != null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenMarker(null)}
      >
        {/* Той самий backdrop-`Modal`-патерн, що й `ReactionToggle` (`src/components/journal/
         * ReactionPicker.tsx`) — і з тієї самої причини: абсолютне позиціонування всередині
         * картки шкали не "перестрибнуло" б через сусідні картки екрана нижче. */}
        <Pressable
          onPress={() => setOpenMarker(null)}
          style={{
            flex: 1,
            backgroundColor: theme.colors.overlay,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 360,
              maxHeight: '70%',
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: theme.spacing.lg,
              gap: theme.spacing.md,
            }}
          >
            <AppText variant="heading" style={{ textAlign: 'center' }}>
              {openMarker ? `${Math.round(openMarker.percent)}% книги` : ''}
            </AppText>
            <ScrollView contentContainerStyle={{ gap: theme.spacing.md }}>
              {openMarker?.entries.map((entry) => (
                <View key={entry.id} style={{ gap: theme.spacing.xs }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                    <AppText variant="caption" color="secondary">
                      {resolveEntryTypeLabel(entry, categoriesById)}
                    </AppText>
                    {entry.isFavorite ? (
                      <Ionicons name="heart" size={12} color={theme.colors.accent} />
                    ) : null}
                  </View>
                  <AppText variant="body" numberOfLines={4}>
                    {entry.text}
                  </AppText>
                </View>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

interface MarkerDotProps {
  marker: TimelineMarker;
  onPress: () => void;
}

function MarkerDot({ marker, onPress }: MarkerDotProps) {
  const theme = useTheme();
  const count = marker.entries.length;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        count > 1
          ? `${count} записів на ${Math.round(marker.percent)}% книги`
          : `Запис на ${Math.round(marker.percent)}% книги`
      }
      hitSlop={6}
      style={{
        position: 'absolute',
        left: `${marker.percent}%`,
        top: -TIMELINE_MARKER_SIZE / 2,
        marginLeft: -TIMELINE_MARKER_SIZE / 2,
        width: TIMELINE_MARKER_SIZE,
        height: TIMELINE_MARKER_SIZE,
        borderRadius: TIMELINE_MARKER_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.accent,
      }}
    >
      <Ionicons name={CATEGORY_ICON[marker.category]} size={14} color={theme.colors.accent} />
      {count > 1 ? (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 16,
            height: 16,
            paddingHorizontal: 3,
            borderRadius: 8,
            backgroundColor: theme.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppText variant="micro" color="onAccent" style={{ fontSize: 9, lineHeight: 11 }}>
            {count > 99 ? '99+' : count}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
