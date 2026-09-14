import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/design/ThemeProvider';

/**
 * КАЛЕНДАР — ВІЗУАЛЬНА КОМПОЗИЦІЯ ТА REDESIGN ДНЯ ЧИТАННЯ (пост-Фаза 19,
 * `docs/CALENDAR_2_0.md` §"Visual Day Composition"). Єдиний компонент "cover-стеку" книг дня —
 * одна книга (просто обкладинка), дві книги (primary спереду/більший + secondary позаду,
 * зміщений, усе ще видимий), три+ книги (primary+secondary+компактний бейдж "+N"). Раніше день
 * з активністю показував РІВНО одну обкладинку (`app/(tabs)/calendar.tsx`, Фаза 19) — цей
 * компонент замінює той інлайн-рендер, щоб той самий візуал не дублювався окремо, якщо колись
 * з'явиться ще одне місце, де потрібен стек обкладинок дня.
 *
 * ACCESSIBILITY: за замовчуванням (без `accessibilityLabel`) стек — ЧИСТО декоративний
 * (`accessibilityElementsHidden`/`importantForAccessibility="no"`, той самий підхід, що й
 * fallback-плашка `CoverThumbnail`): день-клітинка місяця-сітки й так уже несе ПОВНИЙ текстовий
 * опис на батьківському `Pressable` (`buildDayAccessibilityLabel`) — без цього кожна окрема
 * обкладинка (яка сама по собі має власний `accessibilityLabel` через `CoverThumbnail`)
 * перетворила б одну логічну кнопку дня на 2-3 окремі елементи для читача екрана. Якщо стек
 * колись використовується ПОЗА вже описаним батьківським елементом — передай `accessibilityLabel`,
 * і стек сам стане одним акцесибл-елементом з цим описом.
 */

export interface CalendarBookStackBook {
  coverUrl?: string | null;
  title: string;
  fallbackColor?: string | null;
}

export interface CalendarBookStackProps {
  primary: CalendarBookStackBook | null;
  secondary?: CalendarBookStackBook | null;
  /** Скільки книг дня НЕ увійшли в стек (primary+secondary вже показані окремо) — компактний
   * бейдж "+N" у кутку. `0`/`undefined` — бейдж не рендериться. */
  additionalCount?: number;
  /** Розмір ГОЛОВНОЇ (primary) обкладинки в px — той самий сенс, що й колишній `coverSize`
   * (`computeCoverSize`, `app/(tabs)/calendar.tsx`), лишається обчислюватись викликом. */
  size: number;
  borderRadius?: number;
  /** Див. коментар вище файлу — задає стек як ОДИН акцесибл-елемент з цим описом; за
   * замовчуванням стек декоративний (`undefined`). */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Secondary — "~70-80% розміру primary" (ТЗ) — середина діапазону. */
const SECONDARY_SCALE = 0.75;
/** Наскільки secondary зміщений вправо-вниз відносно primary, у частках `size` — досить, щоб
 * лишатись візуально "усе ще видимим" позаду (ТЗ), не настільки, щоб на малому розмірі
 * клітинки (~20px) стек не вилазив за межі клітинки-контейнера. */
const SECONDARY_OFFSET_RATIO = 0.3;
/** Той самий частковий (не повний) ліміт масштабування бейджа "+N", що й день-число дня-
 * клітинки (Фаза 22, `docs/A11Y_LARGE_TEXT_AUDIT.md`, `DAY_BADGE_MAX_FONT_SCALE` у
 * `app/(tabs)/calendar.tsx`) — той самий продуктовий вибір, не нове рішення. */
const BADGE_MAX_FONT_SCALE = 1.2;

export function CalendarBookStack({
  primary,
  secondary,
  additionalCount = 0,
  size,
  borderRadius,
  accessibilityLabel,
  style,
}: CalendarBookStackProps) {
  const theme = useTheme();
  const radius = borderRadius ?? theme.radius.sm;

  if (!primary) return null;

  const showSecondary = !!secondary;
  const secondarySize = Math.round(size * SECONDARY_SCALE);
  const offset = Math.round(size * SECONDARY_OFFSET_RATIO);
  const containerSize = size + (showSecondary ? offset : 0);
  const isDecorative = !accessibilityLabel;

  return (
    <View
      style={[{ width: containerSize, height: containerSize }, style]}
      accessible={!isDecorative}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={isDecorative}
      importantForAccessibility={isDecorative ? 'no' : 'yes'}
    >
      {showSecondary && secondary ? (
        <View style={{ position: 'absolute', right: 0, bottom: 0 }}>
          <CoverThumbnail
            coverUrl={secondary.coverUrl}
            title={secondary.title}
            fallbackColor={secondary.fallbackColor}
            width={secondarySize}
            height={secondarySize}
            borderRadius={radius}
            hideFallbackLetter
          />
        </View>
      ) : null}

      <View style={{ position: 'absolute', left: 0, top: 0 }}>
        <CoverThumbnail
          coverUrl={primary.coverUrl}
          title={primary.title}
          fallbackColor={primary.fallbackColor}
          width={size}
          height={size}
          borderRadius={radius}
          hideFallbackLetter
        />
      </View>

      {additionalCount > 0 ? (
        <View
          style={{
            position: 'absolute',
            right: -4,
            bottom: -4,
            minWidth: 16,
            height: 16,
            paddingHorizontal: 3,
            borderRadius: 8,
            backgroundColor: theme.colors.surfaceRaised,
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppText variant="micro" color="secondary" maxFontSizeMultiplier={BADGE_MAX_FONT_SCALE}>
            +{additionalCount}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
