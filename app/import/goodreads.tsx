import React, { useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/design/ThemeProvider';
import { pickCsvFileAsync } from '@/lib/csvFile';
import { parseGoodreadsCsv, type GoodreadsParseResult } from '@/features/library-io/goodreadsImport';
import { useImportGoodreadsCsv, type ImportGoodreadsResult } from '@/features/library-io/useImportGoodreadsCsv';
import { createLogger } from '@/lib/logger';

const log = createLogger('app/import/goodreads');

type Stage =
  | { kind: 'pick' }
  | { kind: 'error'; message: string }
  | { kind: 'preview'; fileName: string; csvText: string; parsed: GoodreadsParseResult }
  | { kind: 'done'; result: ImportGoodreadsResult };

/**
 * Імпорт бібліотеки з Goodreads (Milestone 9, `docs/PRODUCT.md`). Три кроки в одному екрані
 * (той самий "розгортання одного стану" підхід, що й `app/backup.tsx`'s pending-restore
 * `Alert`, лише тут — повноцінний екран, бо перегляд перед імпортом складніший за одне
 * підтвердження): обрати файл → перегляд кількості книг перед збереженням (п.35 ТЗ дух —
 * жодна масова дія не відбувається без попереднього перегляду) → результат.
 *
 * На Goodreads: Профіль → My Books → унизу списку "Export Library" → лист приходить на
 * пошту з посиланням на CSV-файл.
 */
export default function GoodreadsImportScreen() {
  const theme = useTheme();
  const importCsv = useImportGoodreadsCsv();
  const [stage, setStage] = useState<Stage>({ kind: 'pick' });

  const handlePickFile = async () => {
    try {
      const picked = await pickCsvFileAsync();
      if (!picked) return;

      const parsed = parseGoodreadsCsv(picked.content);
      if (parsed.rows.length === 0) {
        setStage({
          kind: 'error',
          message: 'У файлі не знайдено жодної книги з назвою. Переконайся, що це саме CSV-експорт з Goodreads.',
        });
        return;
      }

      setStage({ kind: 'preview', fileName: picked.name, csvText: picked.content, parsed });
    } catch (error) {
      log.warn('Не вдалося прочитати файл', { error: error instanceof Error ? error.message : String(error) });
      setStage({ kind: 'error', message: 'Не вдалося прочитати файл.' });
    }
  };

  const handleConfirmImport = () => {
    if (stage.kind !== 'preview') return;
    importCsv.mutate(stage.csvText, {
      onSuccess: (result) => setStage({ kind: 'done', result }),
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Імпорт з Goodreads',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <View style={{ gap: theme.spacing.lg }}>
          {stage.kind === 'pick' || stage.kind === 'error' ? (
            <>
              <Card style={{ gap: theme.spacing.sm }}>
                <AppText variant="heading">Імпорт з Goodreads</AppText>
                <AppText variant="body" color="secondary">
                  На сайті Goodreads: "My Books" → внизу списку полиць посилання "Import and
                  export" → "Export Library". За кілька хвилин на пошту прийде лист із
                  посиланням на CSV-файл — обери його нижче.
                </AppText>
                <AppText variant="body" color="secondary">
                  Полиці "read"/"currently-reading"/"to-read" стануть статусом книги, власні
                  полиці — полицями застосунку, оцінки й дати прочитання перенесуться теж.
                  Дублікати не перевіряються — не імпортуй той самий файл двічі.
                </AppText>
                <Button label="Обрати CSV-файл" onPress={handlePickFile} />
              </Card>

              {stage.kind === 'error' ? (
                <AppText variant="caption" color="danger" style={{ textAlign: 'center' }}>
                  {stage.message}
                </AppText>
              ) : null}
            </>
          ) : null}

          {stage.kind === 'preview' ? (
            <Card style={{ gap: theme.spacing.sm }}>
              <AppText variant="heading">{stage.fileName}</AppText>
              <AppText variant="body" color="secondary">
                Знайдено книг: {stage.parsed.rows.length} з {stage.parsed.totalDataRows} рядків
                {stage.parsed.skippedCount > 0
                  ? ` (пропущено ${stage.parsed.skippedCount} — без назви книги)`
                  : ''}
                .
              </AppText>
              <AppText variant="body" color="secondary">
                Кожна книга додасться до бібліотеки застосунку окремим записом. Це може зайняти
                деякий час для великих бібліотек.
              </AppText>
              <Button
                label={importCsv.isPending ? 'Імпортую…' : `Імпортувати ${stage.parsed.rows.length} книг`}
                onPress={handleConfirmImport}
                disabled={importCsv.isPending}
              />
              <Button
                label="Скасувати"
                variant="secondary"
                onPress={() => setStage({ kind: 'pick' })}
                disabled={importCsv.isPending}
              />
            </Card>
          ) : null}

          {stage.kind === 'done' ? (
            <Card style={{ gap: theme.spacing.sm }}>
              <AppText variant="heading">Готово</AppText>
              <AppText variant="body" color="secondary">
                Імпортовано книг: {stage.result.imported}.
                {stage.result.failed > 0 ? ` Не вдалось імпортувати: ${stage.result.failed}.` : ''}
                {stage.result.skipped > 0 ? ` Пропущено (без назви): ${stage.result.skipped}.` : ''}
              </AppText>
              <Button label="До бібліотеки" onPress={() => router.replace('/(tabs)/library')} />
            </Card>
          ) : null}
        </View>
      </ScreenContainer>
    </>
  );
}
