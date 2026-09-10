import React, { useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { useTheme } from '@/design/ThemeProvider';
import { recommendationPurposeLabels, recommendationTimeBudgetLabels } from '@/design/i18n-labels';
import { useAllGenres } from '@/features/book-details/useGenres';
import { useTomorrowRecommendation, type TomorrowRecommendationResult } from '@/features/tomorrow/useTomorrowRecommendation';
import { useImportDraftStore } from '@/stores/importDraftStore';
import { pickCoverFallbackColor } from '@/lib/coverFallback';
import { TIME_BUDGET_OPTIONS, type RecommendationPurpose, type TimeBudgetPreset } from '@/lib/tomorrowRecommendation';

const PURPOSE_OPTIONS = (Object.keys(recommendationPurposeLabels) as RecommendationPurpose[]).map((value) => ({
  value,
  label: recommendationPurposeLabels[value],
}));

const TIME_BUDGET_UI_OPTIONS = TIME_BUDGET_OPTIONS.map((option) => ({
  value: option.value,
  label: recommendationTimeBudgetLabels[option.value],
}));

/** Приблизна оцінка "~N год" з бюджету сторінок результату — той самий напрямок обчислення,
 * що й `estimatePageBudget` у зворотну сторону, лише для показу користувачу, не для логіки
 * вибору (яка вже відбулась на момент, коли прийшов результат). */
function formatPageCount(pageCount: number | null | undefined): string | null {
  if (pageCount == null) return null;
  return `${pageCount} стор.`;
}

function RecommendationResultCard({ result }: { result: TomorrowRecommendationResult }) {
  const theme = useTheme();
  const { book } = result;
  const pages = formatPageCount(book.pageCount);
  const description = book.description ? book.description.slice(0, 220).trim() : null;

  return (
    <Card style={{ gap: theme.spacing.md }}>
      {result.recycled ? (
        <AppText variant="micro" color="tertiary">
          Ти вже переглянув усі варіанти на цей запит — починаємо коло знову.
        </AppText>
      ) : null}
      {result.languageConfidence === 'unverified' ? (
        <AppText variant="micro" color="tertiary">
          Мова видання не підтверджена напевно — перевір перед додаванням.
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <CoverThumbnail
          coverUrl={book.coverUrl}
          title={book.title}
          fallbackColor={pickCoverFallbackColor(book.title)}
          width={72}
          height={104}
        />
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <AppText variant="heading">{book.title}</AppText>
          {book.authors.length > 0 ? (
            <AppText variant="caption" color="secondary">
              {book.authors.join(', ')}
            </AppText>
          ) : null}
          {pages ? (
            <AppText variant="caption" color="tertiary">
              {pages}
            </AppText>
          ) : null}
        </View>
      </View>
      <AppText variant="micro" color="tertiary">
        Орієнтовно під твій бюджет часу: ~{result.pageBudget} стор.
      </AppText>
      {description ? (
        <AppText variant="body" color="secondary">
          {description}
          {book.description && book.description.length > 220 ? '…' : ''}
        </AppText>
      ) : null}
      <Button
        label="Додати в бібліотеку"
        onPress={() => {
          useImportDraftStore.getState().setPending(result.providerId, book);
          router.push('/import/review');
        }}
      />
    </Card>
  );
}

/**
 * «Що почитати завтра?» (Milestone 11, доповнення, пряме прохання власника продукту):
 * жанр + час + мета читання → одна нова книга (яку користувач ще не додав), ніколи не та
 * сама на той самий запит (`useTomorrowRecommendation.ts`). Одна пушнута сторінка (у
 * застосунку немає нативних модалок, `docs/STATUS_V1.md`) з пікером зверху й результатом
 * знизу — той самий візуальний патерн, що й `app/goals/index.tsx`.
 */
export default function TomorrowScreen() {
  const theme = useTheme();
  const { data: genres, isLoading: genresLoading, isError: genresError, refetch } = useAllGenres();
  const recommend = useTomorrowRecommendation();

  const [genreId, setGenreId] = useState<string | null>(null);
  const [timeBudget, setTimeBudget] = useState<TimeBudgetPreset>('medium');
  const [purpose, setPurpose] = useState<RecommendationPurpose>('absorbed');

  const selectedGenre = genres?.find((g) => g.id === genreId) ?? null;
  const canSubmit = !!selectedGenre && !recommend.isPending;

  const handleSubmit = () => {
    if (!selectedGenre) return;
    recommend.mutate({ genreId: selectedGenre.id, genreNameUk: selectedGenre.nameUk, purpose, timeBudget });
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Що почитати завтра?',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <View style={{ gap: theme.spacing.lg }}>
          <AppText variant="body" color="secondary">
            Обери жанр, скільки часу готовий приділити книзі, і для чого хочеш почитати — підберемо
            конкретну книгу, якої ще немає в твоїй бібліотеці.
          </AppText>

          {genresError ? (
            <QueryErrorState onRetry={() => refetch()} />
          ) : genresLoading ? (
            <AppText variant="body" color="secondary">
              Завантаження…
            </AppText>
          ) : (
            <Card style={{ gap: theme.spacing.md }}>
              <ChipSelect
                label="Жанр"
                value={genreId ?? ''}
                onChange={setGenreId}
                options={(genres ?? []).map((g) => ({ value: g.id, label: g.nameUk }))}
                disabled={recommend.isPending}
              />
              <ChipSelect
                label="Скільки часу готовий приділити"
                value={timeBudget}
                onChange={setTimeBudget}
                options={TIME_BUDGET_UI_OPTIONS}
                disabled={recommend.isPending}
              />
              <ChipSelect
                label="Для чого хочеш почитати"
                value={purpose}
                onChange={setPurpose}
                options={PURPOSE_OPTIONS}
                disabled={recommend.isPending}
              />
              <Button
                label={recommend.data ? 'Спробувати іншу' : 'Підібрати книгу'}
                onPress={handleSubmit}
                disabled={!canSubmit}
              />
            </Card>
          )}

          {recommend.isPending ? (
            <AppText variant="body" color="secondary">
              Підбираю книгу…
            </AppText>
          ) : recommend.isSuccess && recommend.data === null ? (
            <EmptyState
              title="Нічого не знайшлося"
              description="Спробуй інший жанр або мету читання — для деяких поєднань українських видань поки що мало."
            />
          ) : recommend.data ? (
            <RecommendationResultCard result={recommend.data} />
          ) : null}
        </View>
      </ScreenContainer>
    </>
  );
}
