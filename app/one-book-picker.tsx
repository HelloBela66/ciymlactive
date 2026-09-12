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
import { useOnePicker } from '@/features/onePicker/useOnePicker';
import { TIME_BUDGET_OPTIONS, type RecommendationPurpose, type TimeBudgetPreset } from '@/lib/tomorrowRecommendation';
import type { SeriesFilter, TbrScope, OwnershipScope, PickerFilters } from '@/lib/onePicker';
import { formatDuration } from '@/lib/sessionTiming';

const GENRE_ANY = '';
const MOOD_ANY = '';

const TIME_BUDGET_UI_OPTIONS = TIME_BUDGET_OPTIONS.map((option) => ({
  value: option.value,
  label: recommendationTimeBudgetLabels[option.value],
}));

const MOOD_OPTIONS: { value: string; label: string }[] = [
  { value: MOOD_ANY, label: 'Байдуже' },
  ...(Object.keys(recommendationPurposeLabels) as RecommendationPurpose[]).map((value) => ({
    value,
    label: recommendationPurposeLabels[value],
  })),
];

/** Кілька фіксованих порогів — той самий "невеликий набір пресетів замість вільного числового
 * поля" підхід, що й `TIME_BUDGET_OPTIONS`: пікеру не потрібне довільне число, лише кілька
 * зрозумілих кроків. */
const MAX_PAGES_OPTIONS: { value: string; label: string; pages: number | null }[] = [
  { value: 'any', label: 'Без обмежень', pages: null },
  { value: '300', label: 'До 300 стор.', pages: 300 },
  { value: '500', label: 'До 500 стор.', pages: 500 },
  { value: '800', label: 'До 800 стор.', pages: 800 },
];

const SERIES_FILTER_OPTIONS: { value: SeriesFilter; label: string }[] = [
  { value: 'any', label: 'Будь-яка' },
  { value: 'standalone', label: 'Окрема історія' },
  { value: 'series', label: 'Частина серії' },
];

const TBR_SCOPE_OPTIONS: { value: TbrScope; label: string }[] = [
  { value: 'tbr', label: 'Лише «Хочу прочитати»' },
  { value: 'any_unread', label: 'Будь-який непрочитаний статус' },
];

const OWNERSHIP_SCOPE_OPTIONS: { value: OwnershipScope; label: string }[] = [
  { value: 'any', label: 'Будь-яка книга' },
  { value: 'owned', label: 'Лише ті, що маю фізично' },
];

/**
 * «Обери мені книгу» (ТЗ Фази 16, ONE BOOK PICKER, `docs/ONE_BOOK_PICKER.md`) — той самий
 * "пікер зверху, результат знизу" візуальний патерн, що й `app/tomorrow.tsx`, лише над іншим
 * пулом кандидатів: книги, які вже є в бібліотеці користувача (переважно TBR), а не зовнішній
 * пошук. ОДНА основна рекомендація (ТЗ: "Не 20"), з поясненням, чому саме вона підходить.
 */
export default function OneBookPickerScreen() {
  const theme = useTheme();
  const { data: genres, isLoading: genresLoading, isError: genresError, refetch } = useAllGenres();
  const pick = useOnePicker();

  const [genreId, setGenreId] = useState(GENRE_ANY);
  const [timeBudget, setTimeBudget] = useState<TimeBudgetPreset>('medium');
  const [desiredMood, setDesiredMood] = useState(MOOD_ANY);
  const [maxPagesValue, setMaxPagesValue] = useState('any');
  const [seriesFilter, setSeriesFilter] = useState<SeriesFilter>('any');
  const [tbrScope, setTbrScope] = useState<TbrScope>('tbr');
  const [ownershipScope, setOwnershipScope] = useState<OwnershipScope>('any');
  const [excludedIds, setExcludedIds] = useState<string[]>([]);

  const buildFilters = (): PickerFilters => ({
    genreId: genreId === GENRE_ANY ? null : genreId,
    timeBudget,
    desiredMood: desiredMood === MOOD_ANY ? null : (desiredMood as RecommendationPurpose),
    maxPages: MAX_PAGES_OPTIONS.find((option) => option.value === maxPagesValue)?.pages ?? null,
    seriesFilter,
    tbrScope,
    ownershipScope,
  });

  const handlePick = () => {
    setExcludedIds([]);
    pick.mutate({ filters: buildFilters(), excludeUserBookIds: [] });
  };

  const handleTryAnother = () => {
    const nextExcluded = pick.data ? [...excludedIds, pick.data.userBook.id] : excludedIds;
    setExcludedIds(nextExcluded);
    pick.mutate({ filters: buildFilters(), excludeUserBookIds: nextExcluded });
  };

  const handleChooseThis = () => {
    if (!pick.data) return;
    router.push({ pathname: '/work/[workId]', params: { workId: pick.data.userBook.work.id } });
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Обери мені книгу',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <View style={{ gap: theme.spacing.lg }}>
          <AppText variant="body" color="secondary">
            Скільки часу маєш, який настрій і що саме шукаєш — підберемо одну конкретну книгу з
            твоєї бібліотеки.
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
                label="Скільки часу є"
                value={timeBudget}
                onChange={setTimeBudget}
                options={TIME_BUDGET_UI_OPTIONS}
                disabled={pick.isPending}
              />
              <ChipSelect
                label="Настрій"
                value={desiredMood}
                onChange={setDesiredMood}
                options={MOOD_OPTIONS}
                disabled={pick.isPending}
              />
              <ChipSelect
                label="Максимальна довжина"
                value={maxPagesValue}
                onChange={setMaxPagesValue}
                options={MAX_PAGES_OPTIONS.map(({ value, label }) => ({ value, label }))}
                disabled={pick.isPending}
              />
              <ChipSelect
                label="Серія"
                value={seriesFilter}
                onChange={setSeriesFilter}
                options={SERIES_FILTER_OPTIONS}
                disabled={pick.isPending}
              />
              <ChipSelect
                label="Жанр"
                value={genreId}
                onChange={setGenreId}
                options={[{ value: GENRE_ANY, label: 'Будь-який' }, ...(genres ?? []).map((g) => ({ value: g.id, label: g.nameUk }))]}
                disabled={pick.isPending}
              />
              <ChipSelect
                label="Статус у бібліотеці"
                value={tbrScope}
                onChange={setTbrScope}
                options={TBR_SCOPE_OPTIONS}
                disabled={pick.isPending}
              />
              <ChipSelect
                label="Володіння"
                value={ownershipScope}
                onChange={setOwnershipScope}
                options={OWNERSHIP_SCOPE_OPTIONS}
                disabled={pick.isPending}
              />
              <Button label="Обрати мені книгу" onPress={handlePick} disabled={pick.isPending} />
            </Card>
          )}

          {pick.isPending ? (
            <AppText variant="body" color="secondary">
              Підбираю книгу…
            </AppText>
          ) : pick.isSuccess && pick.data === null ? (
            <EmptyState
              title="Нічого не знайшлося"
              description="Спробуй ширші фільтри — жоден із твоїх непрочитаних не підходить під цей запит."
            />
          ) : pick.data ? (
            <Card style={{ gap: theme.spacing.md }}>
              <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                <CoverThumbnail
                  coverUrl={pick.data.userBook.edition.coverUrl}
                  title={pick.data.userBook.work.title}
                  fallbackColor={pick.data.userBook.work.coverFallbackColor}
                  width={72}
                  height={104}
                />
                <View style={{ flex: 1, gap: theme.spacing.xs }}>
                  <AppText variant="heading">{pick.data.userBook.work.title}</AppText>
                  {pick.data.userBook.work.authors.length > 0 ? (
                    <AppText variant="caption" color="secondary">
                      {pick.data.userBook.work.authors.map((a) => a.name).join(', ')}
                    </AppText>
                  ) : null}
                  <AppText variant="caption" color="tertiary">
                    {pick.data.seriesStatus}
                  </AppText>
                  {pick.data.estimatedMinutes != null ? (
                    <AppText variant="caption" color="tertiary">
                      ~{formatDuration(pick.data.estimatedMinutes * 60 * 1000)} читання
                    </AppText>
                  ) : null}
                </View>
              </View>
              <AppText variant="body" color="secondary">
                {pick.data.explanation}
              </AppText>
              <View style={{ gap: theme.spacing.sm }}>
                <Button label="Обрати цю" onPress={handleChooseThis} />
                <Button label="Іншу" variant="secondary" onPress={handleTryAnother} disabled={pick.isPending} />
              </View>
            </Card>
          ) : null}
        </View>
      </ScreenContainer>
    </>
  );
}
