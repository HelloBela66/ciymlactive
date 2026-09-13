import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { Card } from './Card';
import { useTheme } from '@/design/ThemeProvider';

interface OfflineNoticeProps {
  message: string;
}

/**
 * OFFLINE UX (Фаза 20, `docs/OFFLINE_UX.md`) — спільний вигляд "немає з'єднання" для
 * мережезалежних поверхонь (Пошук у режимі «Каталог», сканування ISBN). Саме та відмінність,
 * яку аудит (§39.1) зафіксував як відсутню: "офлайн" ≠ "нічого не знайдено" — не просто інший
 * текст усередині того самого порожнього стану, а окремий, візуально інший inline-banner
 * (`docs/LOCAL_FIRST.md` — "делікатний", НІКОЛИ глобальний блокуючий overlay).
 */
export function OfflineNotice({ message }: OfflineNoticeProps) {
  const theme = useTheme();
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
      <Ionicons
        name="cloud-offline-outline"
        size={20}
        color={theme.colors.textSecondary}
        style={{ marginTop: 2 }}
      />
      <AppText variant="body" color="secondary" style={{ flex: 1 }}>
        {message}
      </AppText>
    </Card>
  );
}
