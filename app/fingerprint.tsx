import React, { useRef } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryErrorState } from '@/components/ui/QueryErrorState';
import { FingerprintCardPreview } from '@/components/fingerprint/FingerprintCardPreview';
import { ShareCardActions } from '@/components/share/ShareCardActions';
import { useTheme } from '@/design/ThemeProvider';
import { useReadingFingerprint } from '@/features/fingerprint/useReadingFingerprint';
import { useShareCard } from '@/features/share/useShareCard';
import { BADGE_META } from '@/lib/readingFingerprint';
import { createLogger } from '@/lib/logger';

const log = createLogger('app/fingerprint');

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
  const shareController = useShareCard({ cardRef, dialogTitle: 'Мій читацький відбиток', log });

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

              <ShareCardActions controller={shareController} />
            </View>
          </View>
        )}
      </ScreenContainer>
    </>
  );
}
