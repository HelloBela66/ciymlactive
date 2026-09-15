import React from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { useTheme } from '@/design/ThemeProvider';
import { readingRunStatusLabels } from '@/design/i18n-labels';
import { formatDuration } from '@/lib/sessionTiming';
import { selectComparableRuns, type ReadingRunDetail } from '@/features/reading-runs/useReadingRunsDetail';

/**
 * "Історія прочитань" — REREADING MODEL, Фаза 12 (`docs/READING_RUN.md` §"Фаза 12"), винесено
 * у спільний компонент у Фазі 13 (`docs/READING_RUN.md`/Book Memory consolidation ТЗ): Фаза 12
 * побудувала цю секцію ЛИШЕ на Book Details (`app/work/[workId].tsx`), Фаза 13 додає ЇЇ Ж на
 * Book Memory (`app/memory/[workId].tsx`, тепер "Reading Runs" у новій IA хаба) — той самий
 * компонент, той самий `useReadingRunsDetail` (спільний кеш запиту), а не друга копія розмітки.
 *
 * Групує за `reading_run` (кожне ОКРЕМЕ прочитання/перечитування книги, Фаза 6-7): один рядок
 * на прочитання з підсумком (статус, дати, оцінка ЦЬОГО прочитання, скільки днів/часу пішло).
 *
 * Кнопка "Порівняти прочитання" з'являється лише коли є ≥2 ЗАВЕРШЕНИХ (`finished`) run —
 * менше ніж два просто нема що порівнювати (`selectComparableRuns`,
 * `useReadingRunsDetail.ts`).
 */
export function ReadingRunsHistorySection({ workId, details }: { workId: string; details: ReadingRunDetail[] }) {
  const theme = useTheme();
  const comparableRuns = selectComparableRuns(details);

  return (
    <View style={{ gap: theme.spacing.md }}>
      {/* POLYTSIA V1.7, Phase 2 — вхід у «Мою історію з цією книгою» (ТЗ V1.7 §5).
          Саме тут, а не окремо на Book Details і на Book Memory: ця секція вже спільна для
          обох екранів (Фаза 13), тож один вхід автоматично з'являється на обох — без другої
          копії розмітки й без ризику, що згодом вони розійдуться.
          Показується за наявності БУДЬ-ЯКОЇ історії (навіть одного незавершеного проходу) —
          на відміну від «Порівняти прочитання» нижче, якому потрібні ≥2 завершені. */}
      {details.length > 0 ? (
        <Pressable
          onPress={() => router.push({ pathname: '/book-history/[workId]', params: { workId } } as unknown as Href)}
        >
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Ionicons name="book-outline" size={20} color={theme.colors.accent} />
            <View style={{ flex: 1 }}>
              <AppText variant="body" color="accent">
                Моя історія з цією книгою
              </AppText>
              <AppText variant="caption" color="secondary">
                Уся хронологія: читання, думки, повернення
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
          </Card>
        </Pressable>
      ) : null}

      {comparableRuns.length >= 2 ? (
        <Pressable
          onPress={() =>
            router.push({ pathname: '/reread-comparison/[workId]', params: { workId } } as unknown as Href)
          }
        >
          <Card
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              backgroundColor: theme.colors.accentSoft,
            }}
          >
            <Ionicons name="git-compare-outline" size={20} color={theme.colors.accent} />
            <View style={{ flex: 1 }}>
              <AppText variant="body" color="accent">
                Як змінилася книга для тебе
              </AppText>
              <AppText variant="caption" color="secondary">
                Порівняти {comparableRuns.length} прочитання
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
          </Card>
        </Pressable>
      ) : null}

      {[...details].reverse().map(({ run, rating, dnf, stats }) => (
        <Card key={run.id} style={{ gap: theme.spacing.xs }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText variant="body" style={{ fontWeight: '600' }}>
              Прочитання №{run.runNumber}
            </AppText>
            <AppText variant="caption" color="secondary">
              {readingRunStatusLabels[run.status]}
            </AppText>
          </View>
          <AppText variant="caption" color="tertiary">
            {new Date(run.startedAt).toLocaleDateString('uk-UA')}
            {run.finishedAt ? ` → ${new Date(run.finishedAt).toLocaleDateString('uk-UA')}` : ''}
          </AppText>
          {rating?.value != null ? (
            <AppText variant="caption" color="secondary">
              Оцінка: {rating.value} · {stats.daysSpent} дн. читання
              {stats.totalDurationSeconds > 0 ? ` · ${formatDuration(stats.totalDurationSeconds * 1000)}` : ''}
            </AppText>
          ) : (
            <AppText variant="caption" color="secondary">
              {stats.daysSpent} дн. читання
              {stats.totalDurationSeconds > 0 ? ` · ${formatDuration(stats.totalDurationSeconds * 1000)}` : ''}
            </AppText>
          )}
          {run.status === 'did_not_finish' && dnf ? (
            <AppText variant="caption" color="secondary">
              Покинуто на сторінці {dnf.page}
            </AppText>
          ) : null}
        </Card>
      ))}
    </View>
  );
}
