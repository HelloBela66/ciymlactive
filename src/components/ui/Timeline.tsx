import React from 'react';
import { View } from 'react-native';
import { AppText } from './AppText';
import { Card } from './Card';
import { useTheme } from '@/design/ThemeProvider';

/** Розмір маркера й товщина "рейки" — спільні для обох таймлайнів, що використовують цей
 * компонент (`JournalTimeline`/`ReadingExperienceTimeline`), щоб позиціонування маркерів
 * (`top: -TIMELINE_MARKER_SIZE / 2` тощо, рахується самим маркером у кожному файлі) лишалось
 * узгодженим із самою "рейкою" тут. */
export const TIMELINE_MARKER_SIZE = 28;
const TRACK_HEIGHT = 2;

interface TimelineProps {
  heading: string;
  startLabel: string;
  endLabel: string;
  /** Маркери шкали — абсолютно позиціоновані елементи (кожен сам відповідає за
   * `left: '${percent}%'`), рендеряться викликачем: форма маркера (лічильник записів vs.
   * активний стан) і поведінка тапу (модалка vs. inline-підпис) реально різні на кожному
   * екрані. */
  children: React.ReactNode;
  /** Необов'язковий рядок під labels (наприклад, підказка/опис активного маркера). */
  footer?: React.ReactNode;
}

/**
 * ТЗ Фази 19 (DESIGN SYSTEM EXTENSION) — "хребет" горизонтальної шкали 0-100% книги
 * (`Card` + заголовок + рейка + підписи країв), до цієї фази буквально скопійований між
 * `JournalTimeline.tsx` (Фаза 10) і `ReadingExperienceTimeline.tsx` (Фаза 7) — та сама
 * розмітка, ті самі константи `MARKER_SIZE`/`TRACK_HEIGHT`. Сам маркер (іконка, лічильник,
 * активний стан, модалка/caption при тапі) лишається в кожному файлі окремо — це єдина частина,
 * що реально різниться між двома шкалами.
 */
export function Timeline({ heading, startLabel, endLabel, children, footer }: TimelineProps) {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.spacing.md }}>
      <AppText variant="heading">{heading}</AppText>

      <View style={{ paddingHorizontal: TIMELINE_MARKER_SIZE / 2, paddingVertical: theme.spacing.lg }}>
        <View
          style={{
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            backgroundColor: theme.colors.border,
          }}
        />
        <View style={{ position: 'relative', height: 0 }}>{children}</View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="micro" color="tertiary">
          {startLabel}
        </AppText>
        <AppText variant="micro" color="tertiary">
          {endLabel}
        </AppText>
      </View>

      {footer}
    </Card>
  );
}
