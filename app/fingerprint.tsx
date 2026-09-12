import React, { useRef, useState } from 'react';
import { View, Linking } from 'react-native';
import { Stack } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { captureRef } from 'react-native-view-shot';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { FingerprintCardPreview } from '@/components/fingerprint/FingerprintCardPreview';
import { useTheme } from '@/design/ThemeProvider';
import { useReadingFingerprint } from '@/features/fingerprint/useReadingFingerprint';
import { BADGE_META } from '@/lib/readingFingerprint';
import { shareFingerprintCardImage, saveFingerprintCardImageToLibrary } from '@/lib/fingerprintCardFile';
import { createLogger } from '@/lib/logger';

const log = createLogger('app/fingerprint');

/** Спільні опції захоплення — той самий PNG/максимальна якість, що й `CAPTURE_OPTIONS` у
 * `app/seasons/[seasonKey].tsx`/`app/memory/[workId].tsx`. */
const CAPTURE_OPTIONS = { format: 'png', quality: 1 } as const;

function BadgeRow({ icon, label }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string }) {
  const theme = useTheme();
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={18} color={theme.colors.accent} />
      </View>
      <AppText variant="body" style={{ flex: 1 }}>
        {label}
      </AppText>
    </Card>
  );
}

/**
 * «Мій читацький відбиток» (ТЗ Фази 15, READING FINGERPRINT, `docs/READING_FINGERPRINT.md`) —
 * PRIVATE analytics, не public profile: список коротких, детермінованих поведінкових бейджів
 * (ТЗ: "На основі Reading Profile створи concise identity summary"), НІКОЛИ не негативних,
 * НІКОЛИ не психологічних. Уся логіка порогів — у `useReadingFingerprint`/
 * `src/lib/readingFingerprint.ts`; тут лише розкладка результату в список і картку-поділитися.
 *
 * SHARE TEMPLATE — «Мій читацький відбиток», той самий `react-native-view-shot`+`expo-sharing`
 * потік, що й картка сезону/спогаду, лише БЕЗ перемикача формату (ТЗ Фази 15 не згадує вибір
 * формату — `FingerprintCardPreview` має рівно один фіксований шаблон).
 */
export default function FingerprintScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch } = useReadingFingerprint();

  const cardRef = useRef<View>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  const shareCard = useMutation({
    mutationFn: async () => {
      const uri = await captureRef(cardRef, CAPTURE_OPTIONS);
      return shareFingerprintCardImage(uri);
    },
    onSuccess: (shared) => {
      setStatusMessage(shared ? null : 'Системне "Поділитися" тут недоступне.');
    },
    onError: (error) => {
      log.error('Не вдалося поділитися карткою відбитку', {
        error: error instanceof Error ? error.message : String(error),
      });
      setStatusMessage('Не вдалося поділитися карткою. Спробуй ще раз.');
    },
  });

  const saveCard = useMutation({
    mutationFn: async () => {
      const uri = await captureRef(cardRef, CAPTURE_OPTIONS);
      return saveFingerprintCardImageToLibrary(uri);
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
      log.error('Не вдалося зберегти картку відбитку в галерею', {
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

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Мій читацький відбиток',
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScreenContainer>
        {isError ? (
          <QueryErrorState onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <AppText variant="body" color="secondary">
            Завантаження…
          </AppText>
        ) : data.badges.length === 0 ? (
          <EmptyState
            title="Відбиток ще формується"
            description="Читай і фіксуй сесії — перші бейджі з'являться, коли даних набереться достатньо."
          />
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <AppText variant="caption" color="tertiary">
              Лише для тебе — ці бейджі ніхто інший не бачить.
            </AppText>

            <View style={{ gap: theme.spacing.sm }}>
              {data.badges.map((badgeId) => (
                <BadgeRow key={badgeId} icon={BADGE_META[badgeId].icon} label={BADGE_META[badgeId].label} />
              ))}
            </View>

            <View style={{ gap: theme.spacing.md }}>
              <AppText variant="heading">Картка-поділитися</AppText>
              <View ref={cardRef} collapsable={false}>
                <FingerprintCardPreview badges={data.shareCardBadges} />
              </View>

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
            </View>
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
