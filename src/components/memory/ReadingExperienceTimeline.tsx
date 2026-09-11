import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/design/ThemeProvider';
import { READING_EXPERIENCE_LABELS, type ReadingExperienceId } from '@/design/readingExperience';
import { computeReadingExperienceTimeline, type ReadingExperienceMarker } from '@/lib/readingExperienceTimeline';
import type { ReadingSession } from '@/types/readingSession';

/**
 * ТЗ Фази 7 («ЯК ЧИТАЛАСЯ КНИГА») — горизонтальна шкала на Book Memory screen
 * (`app/memory/[workId].tsx`) з маркером на кожну завершену сесію читання, позначену "Як
 * читалося?" (`reading_experience`, вже існуюче поле Milestone V1.5 Фази 9 — тут лише нова
 * агрегована візуалізація, без нової колонки чи таблиці). Уся позиційна логіка — в
 * `src/lib/readingExperienceTimeline.ts` (чиста функція, покрита
 * `readingExperienceTimeline.test.ts`); цей компонент лише рендерить результат.
 *
 * ТЗ прямо забороняє emoji як ЄДИНИЙ visual encoding — тому, як і `JournalTimeline`, кожен стан
 * розрізняється ФОРМОЮ іконки (не кольором: палітра застосунку свідомо нейтральна,
 * `src/design/tokens.ts`), а тап по маркеру показує текстовий підпис (ТЗ: "markers +
 * labels/tooltips"), не лише іконку.
 */
const READING_EXPERIENCE_ICON: Record<ReadingExperienceId, keyof typeof Ionicons.glyphMap> = {
  easy: 'sunny-outline',
  engaging: 'flame-outline',
  calm: 'leaf-outline',
  tense: 'pulse-outline',
  difficult: 'trending-up-outline',
};

/** Сесія без відповіді на "Як читалося?" — нейтральна крапка, не "порожнє місце": сесія
 * реально відбулась і має свою позицію на шкалі, просто без позначки стану. */
const NO_ANSWER_ICON: keyof typeof Ionicons.glyphMap = 'ellipse-outline';

const MARKER_SIZE = 28;
const TRACK_HEIGHT = 2;

interface ReadingExperienceTimelineProps {
  sessions: ReadingSession[] | undefined;
  pageCount: number | null;
}

export function ReadingExperienceTimeline({ sessions, pageCount }: ReadingExperienceTimelineProps) {
  const theme = useTheme();
  const [activeMarker, setActiveMarker] = useState<ReadingExperienceMarker | null>(null);

  const markers = computeReadingExperienceTimeline(sessions ?? [], pageCount);

  // Замало сесій (`MIN_SESSIONS_FOR_READING_EXPERIENCE_TIMELINE` у `readingExperienceTimeline.ts`)
  // — ТЗ: "не показуй misleading chart", тиха деградація, а не порожній стан із поясненням: цей
  // блок для нової книги просто ще не з'явився, так само як `JournalTimeline` при `markers.length
  // === 0`.
  if (markers.length === 0) return null;

  return (
    <Card style={{ gap: theme.spacing.md }}>
      <AppText variant="heading">Як читалася ця книга</AppText>

      <View style={{ paddingHorizontal: MARKER_SIZE / 2, paddingVertical: theme.spacing.lg }}>
        <View
          style={{
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            backgroundColor: theme.colors.border,
          }}
        />
        <View style={{ position: 'relative', height: 0 }}>
          {markers.map((marker) => (
            <MarkerDot
              key={marker.sessionId}
              marker={marker}
              isActive={activeMarker?.sessionId === marker.sessionId}
              onPress={() => setActiveMarker((current) => (current?.sessionId === marker.sessionId ? null : marker))}
            />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="micro" color="tertiary">
          Початок книги
        </AppText>
        <AppText variant="micro" color="tertiary">
          Кінець книги
        </AppText>
      </View>

      <AppText variant="caption" color="secondary" style={{ textAlign: 'center', minHeight: 18 }}>
        {activeMarker ? describeMarker(activeMarker) : 'Торкнись позначки, щоб побачити дату.'}
      </AppText>
    </Card>
  );
}

function describeMarker(marker: ReadingExperienceMarker): string {
  const date = new Date(marker.startedAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
  const label = marker.experience ? READING_EXPERIENCE_LABELS[marker.experience] : 'без позначки';
  return `${date} — ${label}`;
}

interface MarkerDotProps {
  marker: ReadingExperienceMarker;
  isActive: boolean;
  onPress: () => void;
}

function MarkerDot({ marker, isActive, onPress }: MarkerDotProps) {
  const theme = useTheme();
  const icon = marker.experience ? READING_EXPERIENCE_ICON[marker.experience] : NO_ANSWER_ICON;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={describeMarker(marker)}
      hitSlop={6}
      style={{
        position: 'absolute',
        left: `${marker.percent}%`,
        top: -MARKER_SIZE / 2,
        marginLeft: -MARKER_SIZE / 2,
        width: MARKER_SIZE,
        height: MARKER_SIZE,
        borderRadius: MARKER_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isActive ? theme.colors.accent : theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.accent,
      }}
    >
      <Ionicons name={icon} size={14} color={isActive ? theme.colors.onAccent : theme.colors.accent} />
    </Pressable>
  );
}
