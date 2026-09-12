import React, { useRef, useState } from 'react';
import { View, Pressable, Linking } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { captureRef } from 'react-native-view-shot';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { EmptyState } from '@/components/ui/EmptyState';
import { CoverThumbnail } from '@/components/ui/CoverThumbnail';
import { SeasonCardPreview, type SeasonCardFormat } from '@/components/seasons/SeasonCardPreview';
import { useTheme } from '@/design/ThemeProvider';
import { SEASON_META } from '@/design/season';
import { useReadingSeason } from '@/features/seasons/useReadingSeason';
import { parseSeasonKey, currentSeasonKey, adjacentSeasonKey } from '@/lib/season';
import type { SeasonKey } from '@/lib/season';
import { shareSeasonCardImage, saveSeasonCardImageToLibrary } from '@/lib/seasonCardFile';
import { createLogger } from '@/lib/logger';

const log = createLogger('app/seasons');

/** Спільні опції захоплення — той самий PNG/максимальна якість, що й `CAPTURE_OPTIONS` у
 * `app/memory/[workId].tsx`; той самий знімок іде і на "Поділитися", і на "Зберегти в
 * галерею" (докладніше — коментар там-таки), тож лишається тут в одному місці. */
const CAPTURE_OPTIONS = { format: 'png', quality: 1 } as const;

const FORMAT_OPTIONS: { value: SeasonCardFormat; label: string }[] = [
  { value: '4:5', label: 'Стрічка (4:5)' },
  { value: '9:16', label: 'Історія (9:16)' },
];

/**
 * Читацький сезон (ТЗ Фази 13, READING SEASONS, `docs/READING_SEASONS.md`) — той самий
 * "локальна стрілка замість екрана на кожен рік" підхід, що й Wrapped (`app/wrapped/
 * [year].tsx`), лише крок тут менший за рік (`adjacentSeasonKey` замість `year +/- 1`).
 * Додатково — "SHARE TEMPLATE" з ТЗ: захоплення `SeasonCardPreview` у PNG (9:16/4:5),
 * «Поділитися»/«Зберегти в галерею» — той самий `react-native-view-shot`+`expo-sharing`
 * потік, що й картка-спогад (`app/memory/[workId].tsx`), лише без вибору шаблону (тут лише
 * один шаблон картки — ТЗ прямо каже "Не додавай complex image editor").
 */
export default function ReadingSeasonScreen() {
  const theme = useTheme();
  const { seasonKey: seasonKeyParam } = useLocalSearchParams<{ seasonKey: string }>();
  const [key, setKey] = useState<SeasonKey>(
    () => parseSeasonKey(seasonKeyParam) ?? currentSeasonKey(new Date()),
  );
  const { data, isLoading } = useReadingSeason(key.seasonId, key.year);
  const meta = SEASON_META[key.seasonId];

  const [cardFormat, setCardFormat] = useState<SeasonCardFormat>('4:5');
  // Реф на саму картку для захоплення в зображення — той самий `collapsable={false}`
  // застережник для Android, що й `cardRef` у `app/memory/[workId].tsx` (без нього нативна
  // оптимізація дерева view може "сплющити"/прибрати цей вузол).
  const cardRef = useRef<View>(null);

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  const shareCard = useMutation({
    mutationFn: async () => {
      const uri = await captureRef(cardRef, CAPTURE_OPTIONS);
      return shareSeasonCardImage(uri);
    },
    onSuccess: (shared) => {
      setStatusMessage(shared ? null : 'Системне "Поділитися" тут недоступне.');
    },
    onError: (error) => {
      log.error('Не вдалося поділитися карткою сезону', {
        error: error instanceof Error ? error.message : String(error),
      });
      setStatusMessage('Не вдалося поділитися карткою. Спробуй ще раз.');
    },
  });

  const saveCard = useMutation({
    mutationFn: async () => {
      const uri = await captureRef(cardRef, CAPTURE_OPTIONS);
      return saveSeasonCardImageToLibrary(uri);
    },
    onSuccess: (outcome) => {
      if (outcome.kind === 'saved') {
        setStatusMessage('Картку збережено в галерею.');
        return;
      }
      setPermissionError(
        outcome.canAskAgain
          ? 'Немає дозволу зберегти в галерею.'
          : 'Доступ до збереження фото відхилено назавжди — увімкни дозвіл для «Полиці» в налаштуваннях пристрою.',
      );
      setPermissionBlocked(!outcome.canAskAgain);
    },
    onError: (error) => {
      log.error('Не вдалося зберегти картку сезону в галерею', {
        error: error instanceof Error ? error.message : String(error),
      });
      setStatusMessage('Не вдалося зберегти картку. Спробуй ще раз.');
    },
  });

  const handleShare = () => {
    if (shareCard.isPending || saveCard.isPending) return;
    setStatusMessage(null);
    setPermissionError(null);
    setPermissionBlocked(false);
    shareCard.mutate();
  };

  const handleSave = () => {
    if (shareCard.isPending || saveCard.isPending) return;
    setStatusMessage(null);
    setPermissionError(null);
    setPermissionBlocked(false);
    saveCard.mutate();
  };

  const goToAdjacent = (direction: 'prev' | 'next') => {
    setKey((current) => adjacentSeasonKey(current, direction));
  };

  const isEmpty = !data || (data.booksFinished.length === 0 && data.totalMinutes === 0);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: `${meta.label} ${key.year}`,
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: theme.spacing.lg,
          }}
        >
          <Pressable
            onPress={() => goToAdjacent('prev')}
            accessibilityRole="button"
            accessibilityLabel="Попередній сезон"
            hitSlop={8}
            style={{
              width: theme.minTouchTarget,
              height: theme.minTouchTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.textSecondary} />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <Ionicons name={meta.icon} size={20} color={theme.colors.accent} />
            <AppText variant="title">
              {meta.label} {key.year}
            </AppText>
          </View>
          <Pressable
            onPress={() => goToAdjacent('next')}
            accessibilityRole="button"
            accessibilityLabel="Наступний сезон"
            hitSlop={8}
            style={{
              width: theme.minTouchTarget,
              height: theme.minTouchTarget,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="chevron-forward" size={22} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        {isLoading || !data ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : isEmpty ? (
          <EmptyState
            title={`Немає даних за сезон «${meta.label} ${key.year}»`}
            description="Читай книги протягом сезону, щоб побачити тут підсумок."
          />
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <View ref={cardRef} collapsable={false}>
              <SeasonCardPreview format={cardFormat} data={data} />
            </View>

            <Card style={{ gap: theme.spacing.sm }}>
              <ChipSelect label="Формат картки" options={FORMAT_OPTIONS} value={cardFormat} onChange={setCardFormat} />
            </Card>

            <View style={{ gap: theme.spacing.sm }}>
              <Button
                label={shareCard.isPending ? 'Готую зображення…' : 'Поділитися'}
                onPress={handleShare}
                disabled={shareCard.isPending || saveCard.isPending}
              />
              <Button
                label={saveCard.isPending ? 'Зберігаю…' : 'Зберегти в галерею'}
                variant="secondary"
                onPress={handleSave}
                disabled={shareCard.isPending || saveCard.isPending}
              />
              {statusMessage ? (
                <AppText variant="caption" color="secondary" style={{ textAlign: 'center' }}>
                  {statusMessage}
                </AppText>
              ) : null}
              {permissionError ? (
                <AppText variant="caption" color="danger" style={{ textAlign: 'center' }}>
                  {permissionError}
                </AppText>
              ) : null}
              {permissionBlocked ? (
                <Button
                  label="Відкрити налаштування пристрою"
                  variant="secondary"
                  onPress={() => Linking.openSettings()}
                />
              ) : null}
            </View>

            {data.booksFinished.length > 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <AppText variant="heading">Прочитані книги</AppText>
                {data.booksFinished.map((ub) => (
                  <Pressable
                    key={ub.id}
                    onPress={() => router.push({ pathname: '/work/[workId]', params: { workId: ub.work.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={ub.work.title}
                  >
                    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                      <CoverThumbnail
                        coverUrl={ub.edition.coverUrl}
                        title={ub.work.title}
                        fallbackColor={ub.work.coverFallbackColor}
                        width={32}
                        height={46}
                      />
                      <View style={{ flex: 1 }}>
                        <AppText variant="body">{ub.work.title}</AppText>
                        {ub.work.authors.length > 0 ? (
                          <AppText variant="caption" color="secondary">
                            {ub.work.authors.map((a) => a.name).join(', ')}
                          </AppText>
                        ) : null}
                      </View>
                    </Card>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
