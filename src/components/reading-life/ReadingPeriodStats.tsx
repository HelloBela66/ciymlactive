import React from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/design/ThemeProvider';
import { formatCompactDuration } from '@/lib/calendarFormat';
import { pluralizeUk } from '@/lib/pluralizeUk';
import type { ReadingPeriodSummary } from '@/lib/readingPeriodSummary';

/**
 * POLYTSIA V1.7, Phase 4 — ЄДИНИЙ спосіб ПОКАЗАТИ canonical-підсумок періоду
 * (`ReadingPeriodSummary`, `src/lib/readingPeriodSummary.ts`).
 *
 * `readingPeriodSummary.ts` гарантує, що всі поверхні рахують ОДНАКОВО; цей компонент
 * гарантує, що вони ще й НАЗИВАЮТЬ однакове однаково. Без нього рік показував би «Час
 * читання», місяць — «Прочитано хвилин», а Recap (Phase 5-6) вигадав би третю назву для тієї
 * самої цифри — та сама фрагментація, лише на рівні копірайту замість обчислень.
 *
 * Свідомо БЕЗ власних запитів і без `Card`-обгортки: приймає вже готовий підсумок і
 * вбудовується в чужу картку. Споживачі: екран року й екран місяця Reading Life; Weekly/Monthly/
 * Year Recap (Phase 5-6) мають брати саме його, а не малювати свою сітку.
 *
 * ЩО НЕ ПОКАЗУЄТЬСЯ. `pagesPerHour === null` — метрика зникає повністю, а не показує «0 стор/год»
 * (ТЗ §28: за відсутності page tracking чесніше не сказати нічого, ніж сказати нуль).
 * `journalCount === null` означає «не рахувалось» (період, який не збирав записи щоденника) — теж
 * ховається; нуль записів при вимкненому підрахунку й нуль записів насправді — різні речі.
 */

const BOOK_FORMS = ['книга', 'книги', 'книг'] as const;
const READ_FORMS = ['прочитання', 'прочитання', 'прочитань'] as const;
const REREAD_FORMS = ['перечитування', 'перечитування', 'перечитувань'] as const;
const SESSION_FORMS = ['сеанс', 'сеанси', 'сеансів'] as const;
const PAGE_FORMS = ['сторінка', 'сторінки', 'сторінок'] as const;
const DAY_FORMS = ['день', 'дні', 'днів'] as const;
const ENTRY_FORMS = ['запис', 'записи', 'записів'] as const;

export interface ReadingPeriodStat {
  label: string;
  value: string;
  hint?: string;
}

/**
 * Той самий набір метрик у тому самому порядку для будь-якого періоду. Окремо від рендеру —
 * щоб компактні поверхні (рядок року в списку) могли взяти ті самі рядки без сітки.
 */
export function buildReadingPeriodStats(summary: ReadingPeriodSummary): ReadingPeriodStat[] {
  const stats: ReadingPeriodStat[] = [];

  const uniqueBooks = summary.uniqueFinishedWorkIds.length;
  if (summary.finishedRunCount > 0) {
    stats.push({
      label: 'Дочитано',
      value: `${uniqueBooks} ${pluralizeUk(uniqueBooks, BOOK_FORMS)}`,
      // Прочитання й книги — різні числа, коли книгу перечитували (ТЗ §25: перечитування не
      // називається «новою книгою»). Уточнення показується лише коли вони РОЗХОДЯТЬСЯ.
      hint:
        summary.finishedRunCount !== uniqueBooks
          ? `${summary.finishedRunCount} ${pluralizeUk(summary.finishedRunCount, READ_FORMS)}`
          : undefined,
    });
  }

  if (summary.rereadFinishCount > 0) {
    stats.push({
      label: 'Перечитано',
      value: `${summary.rereadFinishCount} ${pluralizeUk(summary.rereadFinishCount, REREAD_FORMS)}`,
    });
  }

  if (summary.readingMinutes > 0) {
    stats.push({ label: 'Час читання', value: formatCompactDuration(summary.readingMinutes) });
  }

  if (summary.pagesRead > 0) {
    stats.push({
      label: 'Сторінки',
      value: `${summary.pagesRead} ${pluralizeUk(summary.pagesRead, PAGE_FORMS)}`,
    });
  }

  if (summary.activeDays > 0) {
    stats.push({
      label: 'Днів із книгою',
      value: `${summary.activeDays} ${pluralizeUk(summary.activeDays, DAY_FORMS)}`,
    });
  }

  if (summary.sessionCount > 0) {
    stats.push({
      label: 'Сеанси',
      value: `${summary.sessionCount} ${pluralizeUk(summary.sessionCount, SESSION_FORMS)}`,
    });
  }

  if (summary.pagesPerHour != null) {
    stats.push({ label: 'Темп', value: `${Math.round(summary.pagesPerHour)} стор/год` });
  }

  if (summary.journalCount != null && summary.journalCount > 0) {
    stats.push({
      label: 'У щоденнику',
      value: `${summary.journalCount} ${pluralizeUk(summary.journalCount, ENTRY_FORMS)}`,
    });
  }

  if (summary.dnfRunCount > 0) {
    stats.push({
      label: 'Відкладено',
      value: `${summary.dnfRunCount} ${pluralizeUk(summary.dnfRunCount, BOOK_FORMS)}`,
    });
  }

  return stats;
}

/** Компактний однорядковий підпис періоду — для списків років/місяців. */
export function formatReadingPeriodOneLine(summary: ReadingPeriodSummary): string | null {
  const parts: string[] = [];
  const uniqueBooks = summary.uniqueFinishedWorkIds.length;
  if (uniqueBooks > 0) parts.push(`${uniqueBooks} ${pluralizeUk(uniqueBooks, BOOK_FORMS)}`);
  if (summary.readingMinutes > 0) parts.push(formatCompactDuration(summary.readingMinutes));
  if (summary.activeDays > 0) {
    parts.push(`${summary.activeDays} ${pluralizeUk(summary.activeDays, DAY_FORMS)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function ReadingPeriodStats({ summary }: { summary: ReadingPeriodSummary }) {
  const theme = useTheme();
  const stats = buildReadingPeriodStats(summary);

  if (stats.length === 0) {
    return (
      <AppText variant="body" color="secondary">
        Цього періоду читання не записувалось.
      </AppText>
    );
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg }}>
      {stats.map((stat) => (
        <View key={stat.label} style={{ minWidth: 120, gap: 2 }}>
          <AppText variant="caption" color="tertiary">
            {stat.label}
          </AppText>
          <AppText variant="heading">{stat.value}</AppText>
          {stat.hint ? (
            <AppText variant="caption" color="secondary">
              {stat.hint}
            </AppText>
          ) : null}
        </View>
      ))}
    </View>
  );
}
