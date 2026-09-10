import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/design/ThemeProvider';
import { AppText } from './AppText';

interface ReadingProgressBarProps {
  /** 0-100. Компонент сам не вирішує, чи показувати себе — виклик (`computeProgressPercent`
   * повертає `null`, коли `pageCount` невідомий) вирішує це до рендеру. */
  percent: number;
  /** Товщина треку. За замовчуванням трохи товщий варіант для карток "Зараз читаєш" (Home) —
   * рядок Бібліотеки передає менший, щоб не розпирати компактний список. */
  height?: number;
  /** Ховає бейдж "N%" праворуч — для дуже щільних рядків. */
  showLabel?: boolean;
}

/**
 * Індикатор прогресу читання — трек + заповнення кольором акценту з тонкою "глянцевою"
 * смужкою (дві прості напівпрозорі `View`, без градієнт-бібліотеки — проєкт свідомо без
 * нових залежностей заради одного індикатора) і круглий "маркер-закладка" на краю заповнення
 * з іконкою `bookmark` усередині — тематично про книги, водночас читається як звичний
 * повзунок прогресу, а не декоративний елемент заради елементу (перша версія мала ледь
 * помітну іконку-закладку окремо від треку — тут вона тепер сам маркер, а не прикраса поруч).
 * Відсоток праворуч — акцентний "чіп" (`accentSoft`), не просто сірий підпис.
 *
 * Використовується на Home (`CurrentlyReadingList`) і в рядку Бібліотеки для книг у статусі
 * "reading"/"rereading" (`app/(tabs)/library/index.tsx`) — обидва місця самі рахують `percent`
 * через `computeProgressPercent` (`src/lib/progressPercent.ts`) і не рендерять компонент
 * узагалі, коли видання не має відомої кількості сторінок.
 */
export function ReadingProgressBar({ percent, height = 8, showLabel = true }: ReadingProgressBarProps) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(percent, 100));
  const thumbSize = height + 8;
  const iconSize = Math.max(8, Math.round(thumbSize * 0.55));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <View
        style={{
          flex: 1,
          height,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.border,
        }}
      >
        <View
          style={{
            width: `${clamped}%`,
            height,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.accent,
            overflow: 'hidden',
          }}
        >
          {/* Глянцева смужка — імітація легкого об'єму без справжнього градієнта/тіні. */}
          <View
            style={{
              position: 'absolute',
              top: Math.max(1, Math.round(height * 0.15)),
              left: 0,
              right: 0,
              height: Math.max(1, Math.round(height * 0.35)),
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.onAccent,
              opacity: 0.22,
            }}
          />
        </View>
        {clamped > 0 ? (
          <View
            style={{
              position: 'absolute',
              top: -(thumbSize - height) / 2,
              left: `${clamped}%`,
              marginLeft: -thumbSize / 2,
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              backgroundColor: theme.colors.accent,
              borderWidth: 2,
              borderColor: theme.colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="bookmark" size={iconSize} color={theme.colors.onAccent} />
          </View>
        ) : null}
      </View>
      {showLabel ? (
        <View
          style={{
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: 2,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.accentSoft,
          }}
        >
          <AppText variant="micro" color="accent" style={{ minWidth: 22, textAlign: 'center' }}>
            {Math.round(clamped)}%
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
