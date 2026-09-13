import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CardPreviewText } from '@/components/ui/CardPreviewText';
import { useTheme } from '@/design/ThemeProvider';
import { BADGE_META } from '@/lib/readingFingerprint';
import type { BadgeId } from '@/lib/readingFingerprint';

/** Тонка декоративна риска — той самий прийом, що й `SectionRule` у `SeasonCardPreview.tsx`/
 * `MemoryCardPreview.tsx`, продубльований тут навмисно (house convention: маленькі
 * презентаційні шматки не діляться між фічами-картками). */
function SectionRule({ color }: { color: string }) {
  return <View style={{ width: 32, height: 2, borderRadius: 1, backgroundColor: color, opacity: 0.6 }} />;
}

function FingerprintCardFooter() {
  const theme = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: theme.spacing.sm }}
    >
      <Ionicons name="bookmark" size={10} color={theme.colors.textTertiary} />
      <CardPreviewText variant="micro" color="tertiary">
        Полиця · читацький відбиток
      </CardPreviewText>
    </View>
  );
}

function BadgeTile({ badgeId }: { badgeId: BadgeId }) {
  const theme = useTheme();
  const meta = BADGE_META[badgeId];
  return (
    <View
      style={{
        width: '48%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        backgroundColor: theme.colors.accentSoft,
        borderRadius: theme.radius.md,
        padding: theme.spacing.sm,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={meta.icon} size={16} color={theme.colors.accent} />
      </View>
      <CardPreviewText variant="caption" style={{ flex: 1, fontWeight: '600' }} numberOfLines={2}>
        {meta.label}
      </CardPreviewText>
    </View>
  );
}

export interface FingerprintCardPreviewProps {
  badges: BadgeId[];
}

/**
 * Сама картка-відбиток (ТЗ Фази 15, «premium template... Не більше 4-6 traits») — той самий
 * "тупий" презентаційний компонент без жодної інтерактивності всередині, що й
 * `SeasonCardPreview`/`MemoryCardPreview`: екран (`app/fingerprint.tsx`) захоплює цей `View`
 * через `react-native-view-shot`. На відміну від `SeasonCardPreview` (перемикач формату 9:16/
 * 4:5) тут рівно ОДИН фіксований формат — ТЗ Фази 15 не згадує вибір формату взагалі, лише
 * кількісне обмеження бейджів (`selectShareCardBadges`, `src/lib/readingFingerprint.ts`),
 * тож єдина "точка вибору" тут — сам набір бейджів, порахований заздалегідь хуком.
 *
 * Увесь текст усередині — `CardPreviewText`, не `AppText` (POLYTSIA V1.6.1, Фаза 22,
 * `docs/A11Y_LARGE_TEXT_AUDIT.md`): картка фіксованого `aspectRatio` з `overflow: 'hidden'` —
 * системне масштабування шрифту тут обрізало б цілі секції композиції, а не один рядок.
 */
export function FingerprintCardPreview({ badges }: FingerprintCardPreviewProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        width: '100%',
        aspectRatio: 4 / 5,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
      }}
      accessibilityLabel="Мій читацький відбиток"
    >
      <View style={{ height: 6, backgroundColor: theme.colors.accent }}>
        <View style={{ height: 2, backgroundColor: theme.colors.onAccent, opacity: 0.25 }} />
      </View>
      <View style={{ flex: 1, padding: theme.spacing.lg, gap: theme.spacing.md }}>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <CardPreviewText variant="micro" color="accent" style={{ fontWeight: '700' }}>
            МІЙ ЧИТАЦЬКИЙ ВІДБИТОК
          </CardPreviewText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <Ionicons name="finger-print-outline" size={22} color={theme.colors.accent} />
            <CardPreviewText variant="title">Полиця</CardPreviewText>
          </View>
          <SectionRule color={theme.colors.accent} />
        </View>

        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignContent: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.sm,
          }}
        >
          {badges.map((badgeId) => (
            <BadgeTile key={badgeId} badgeId={badgeId} />
          ))}
        </View>

        <FingerprintCardFooter />
      </View>
    </View>
  );
}
